from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from server_modules import (
    control_plane_repository,
    credit_ledger_contract,
    empyralis_model_tier_routing_service,
    usage_accounting_service,
)
from server_modules.direct_tool_config_service import run_async_tool_call


def _text(value: Any) -> str:
    return str(value or "").strip()


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _session_request_id(session_ctx: Optional[Dict[str, Any]], thread_id: str) -> str:
    payload = _coerce_dict(session_ctx)
    turn_request = _coerce_dict(payload.get("agent_turn_request"))
    context_hints = _coerce_dict(turn_request.get("context_hints"))
    return (
        _text(payload.get("request_id"))
        or _text(payload.get("client_request_id"))
        or _text(context_hints.get("request_id"))
        or _text(thread_id)
    )


def _session_tenant_id(session_ctx: Optional[Dict[str, Any]], workspace_id: str) -> Optional[str]:
    payload = _coerce_dict(session_ctx)
    turn_request = _coerce_dict(payload.get("agent_turn_request"))
    tenant_id = (
        _text(payload.get("tenant_id"))
        or _text(turn_request.get("tenant_id"))
    )
    if tenant_id:
        return tenant_id
    try:
        workspace = run_async_tool_call(control_plane_repository.get_workspace_by_id(workspace_id)) or {}
    except Exception:
        workspace = {}
    resolved = _text(_coerce_dict(workspace).get("tenant_id"))
    return resolved or None


def _session_turn_metadata(session_ctx: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    payload = _coerce_dict(session_ctx)
    turn_request = _coerce_dict(payload.get("agent_turn_request"))
    context_hints = _coerce_dict(turn_request.get("context_hints"))
    metadata = _coerce_dict(context_hints.get("metadata"))
    if metadata:
        return metadata
    return _coerce_dict(payload.get("metadata"))


def _non_platform_direct_chat_payer(availability: Dict[str, Any], provider: Optional[str]) -> str:
    if not isinstance(availability, dict):
        raise RuntimeError("Direct chat non-platform usage requires an AI source payload.")
    plane = _text(availability.get("credential_plane")).lower()
    source = _text(availability.get("billing_source") or availability.get("ai_source_kind")).lower()
    provider_token = _text(provider).lower()
    if not plane and not source:
        raise RuntimeError("Direct chat non-platform usage requires a known AI source.")
    if plane == "platform_runtime":
        raise RuntimeError("Direct chat platform runtime usage cannot be recorded as non-platform usage.")
    if provider_token in {"codex_cli", "claude_code_cli"} or "subscription" in plane or "subscription" in source:
        return "subscription_passthrough"
    if provider_token in {"ollama", "local", "local_model"} or "local" in plane or "local" in source:
        return "local"
    if "workspace" not in plane and "byok" not in plane and "api_key" not in source and "workspace_api_key" not in source:
        raise RuntimeError("Direct chat non-platform usage requires BYOK, local, or subscription source.")
    return "BYOK"


def _record_direct_chat_transparency_usage(
    *,
    workspace_id: str,
    thread_id: str,
    session_ctx: Optional[Dict[str, Any]],
    availability: Dict[str, Any],
    usage: Dict[str, Any],
    requested_provider: Optional[str],
    effective_provider: Optional[str],
    requested_model: Optional[str],
    effective_model: Optional[str],
) -> None:
    workspace_token = _text(workspace_id)
    if not workspace_token:
        return
    raw_thread_token = _text(thread_id)
    request_id = _session_request_id(session_ctx, raw_thread_token)
    if not request_id:
        return
    tenant_id = _session_tenant_id(session_ctx, workspace_token)
    if not tenant_id:
        return
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    provider = _text(effective_provider) or _text(requested_provider) or _text(usage.get("provider"))
    model = _text(effective_model) or _text(requested_model) or _text(usage.get("model"))
    snapshot = {
        "usage_masked": {
            **usage,
            "provider": provider,
            "model": model,
            "requested_provider": _text(requested_provider) or None,
            "requested_model": _text(requested_model) or None,
            "surface": "sage",
            "source_surface": "sage_direct_chat",
            "payer": _non_platform_direct_chat_payer(availability, provider),
            "timestamp": timestamp,
            "metadata": {
                **_coerce_dict(usage.get("metadata")),
                "thread_id": raw_thread_token or "direct-chat",
                "request_id": request_id,
                "credential_plane": _text(availability.get("credential_plane")) or None,
                "billing_source": _text(availability.get("billing_source")) or None,
                "transparency_only": True,
            },
        }
    }
    row = usage_accounting_service.usage_row_from_snapshot(snapshot) if usage else None
    payer = _non_platform_direct_chat_payer(availability, provider)
    unified_ledger_event = credit_ledger_contract.build_unified_credit_ledger_event(
        surface="sage",
        source_surface="sage_direct_chat",
        payer=payer,
        credit_type="ai_tokens",
        provider=provider,
        model=model,
        runtime_target="local_companion" if payer in {"local", "subscription_passthrough"} else "cloud_default",
        workspace_id=workspace_token,
        user_id=_text(_session_turn_metadata(session_ctx).get("user_id")),
        thread_id=raw_thread_token or "direct-chat",
        run_id=request_id,
        provider_usage=(row.get("usage_accounting") if isinstance(row, dict) and isinstance(row.get("usage_accounting"), dict) else row) or {},
        platform_cost_usd=0,
        provider_reported_cost=(row or {}).get("provider_cost_usd") if isinstance(row, dict) else None,
        provider_reported_currency="USD" if isinstance(row, dict) and (row.get("provider_cost_usd") is not None) else None,
        credits_debited=0,
        estimation_mode=(row or {}).get("estimation_mode") if isinstance(row, dict) else "provider_usage_missing",
        created_at=(row or {}).get("completed_at") if isinstance(row, dict) else timestamp,
        metadata={
            "requested_provider": _text(requested_provider) or None,
            "requested_model": _text(requested_model) or None,
            "credential_plane": _text(availability.get("credential_plane")) or None,
            "billing_source": _text(availability.get("billing_source")) or None,
            "transparency_only": True,
            "label": "Used your AI source" if payer == "BYOK" else "Used non-Empyralis AI source",
        },
    )
    durable_event = run_async_tool_call(
        control_plane_repository.record_credit_ledger_event(
            tenant_id=tenant_id,
            workspace_id=workspace_token,
            event=unified_ledger_event,
            source_table="direct_chat_transparency",
            source_event_id=request_id,
        )
    )
    if not isinstance(durable_event, dict):
        raise RuntimeError("Direct chat transparency credit ledger persistence failed.")


def persist_direct_chat_hosted_usage_best_effort(
    *,
    workspace_id: str,
    thread_id: str,
    session_ctx: Optional[Dict[str, Any]],
    availability_payload: Optional[Dict[str, Any]],
    usage_masked: Optional[Dict[str, Any]],
    requested_provider: Optional[str],
    effective_provider: Optional[str],
    requested_model: Optional[str],
    effective_model: Optional[str],
) -> None:
    availability = _coerce_dict(availability_payload)
    usage = _coerce_dict(usage_masked)
    if _text(availability.get("credential_plane")).lower() != "platform_runtime":
        _record_direct_chat_transparency_usage(
            workspace_id=workspace_id,
            thread_id=thread_id,
            session_ctx=session_ctx,
            availability=availability,
            usage=usage,
            requested_provider=requested_provider,
            effective_provider=effective_provider,
            requested_model=requested_model,
            effective_model=effective_model,
        )
        return
    if not bool(availability.get("platform_runtime_allowed")):
        raise RuntimeError("Hosted AI platform runtime usage was not allowed for credit accounting.")
    if not usage:
        raise RuntimeError("Hosted AI usage is missing for platform credit accounting.")

    workspace_token = _text(workspace_id)
    if not workspace_token:
        raise RuntimeError("Hosted AI usage is missing workspace scope for credit accounting.")
    raw_thread_token = _text(thread_id)
    request_id = _session_request_id(session_ctx, raw_thread_token)
    if not request_id:
        raise RuntimeError("Hosted AI usage is missing request id for credit accounting.")
    thread_token = raw_thread_token or "direct-chat"
    tenant_id = _session_tenant_id(session_ctx, workspace_token)
    if not tenant_id:
        raise RuntimeError("Hosted AI usage is missing tenant scope for credit accounting.")

    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    turn_metadata = _session_turn_metadata(session_ctx)
    tier_route = empyralis_model_tier_routing_service.resolve_requested_empyralis_tier(
        requested_provider=requested_provider,
        requested_model=requested_model,
        metadata=turn_metadata,
    )
    line_item_metadata = credit_ledger_contract.build_credit_ledger_line_item(
        metadata={
            "public_tier": _text(turn_metadata.get("public_tier") or turn_metadata.get("model_tier") or turn_metadata.get("empyralis_model_tier")),
            "billing_source": _text(
                turn_metadata.get("billing_source")
                or (tier_route.get("billing_source") if isinstance(tier_route, dict) else "")
            ),
        },
        public_tier=(tier_route or {}).get("public_tier") if isinstance(tier_route, dict) else None,
        billing_source=(tier_route or {}).get("billing_source") if isinstance(tier_route, dict) else None,
        credit_multiplier=(tier_route or {}).get("credit_multiplier") if isinstance(tier_route, dict) else None,
        total_tokens=usage.get("total_tokens")
        or _coerce_dict(usage.get("usage_accounting")).get("total_tokens"),
    )
    snapshot = {
        "run_id": request_id,
        "workspace_id": workspace_token,
        "tenant_id": tenant_id,
        "completed_at": timestamp,
        "context": {
            "workspace_id": workspace_token,
            "tenant_id": tenant_id,
            "metadata": {
                "thread_id": thread_token,
                "request_id": request_id,
                "credential_plane": "platform_runtime",
                "surface": "sage",
                "source_surface": "sage_direct_chat",
            },
        },
    }
    if isinstance(usage.get("usage_accounting"), dict):
        snapshot["usage_accounting"] = {
            **_coerce_dict(usage.get("usage_accounting")),
            "run_id": request_id,
            "tenant_id": tenant_id,
            "workspace_id": workspace_token,
            "surface": "sage",
            "source_surface": "sage_direct_chat",
            "requested_provider": _text(requested_provider) or _coerce_dict(usage.get("usage_accounting")).get("requested_provider"),
            "effective_provider": _text(effective_provider) or _coerce_dict(usage.get("usage_accounting")).get("effective_provider"),
            "requested_model": _text(requested_model) or _coerce_dict(usage.get("usage_accounting")).get("requested_model"),
            "effective_model": _text(effective_model) or _coerce_dict(usage.get("usage_accounting")).get("effective_model"),
            "completed_at": timestamp,
            "metadata": {
                **_coerce_dict(_coerce_dict(usage.get("usage_accounting")).get("metadata")),
                "thread_id": thread_token,
                "request_id": request_id,
                "credential_plane": "platform_runtime",
                "billing_source": line_item_metadata.get("billing_source"),
                "public_tier": line_item_metadata.get("public_tier"),
                "credit_item_type": line_item_metadata.get("credit_item_type"),
                "credit_quantity": line_item_metadata.get("quantity"),
                "credit_quantity_unit": line_item_metadata.get("quantity_unit"),
                "credit_multiplier": line_item_metadata.get("credit_multiplier"),
            },
        }
    else:
        snapshot["usage_masked"] = {
            **usage,
            "provider": _text(effective_provider) or usage.get("provider"),
            "model": _text(effective_model) or usage.get("model"),
            "requested_provider": _text(requested_provider) or usage.get("requested_provider"),
            "requested_model": _text(requested_model) or usage.get("requested_model"),
            "surface": "sage",
            "source_surface": "sage_direct_chat",
            "timestamp": timestamp,
            "metadata": {
                **_coerce_dict(usage.get("metadata")),
                "thread_id": thread_token,
                "request_id": request_id,
                "credential_plane": "platform_runtime",
                "billing_source": line_item_metadata.get("billing_source"),
                "public_tier": line_item_metadata.get("public_tier"),
                "credit_item_type": line_item_metadata.get("credit_item_type"),
                "credit_quantity": line_item_metadata.get("quantity"),
                "credit_quantity_unit": line_item_metadata.get("quantity_unit"),
                "credit_multiplier": line_item_metadata.get("credit_multiplier"),
            },
        }

    row = usage_accounting_service.usage_row_from_snapshot(snapshot)
    if not isinstance(row, dict):
        raise RuntimeError("Hosted AI usage could not be normalized for credit accounting.")
    validation_error = usage_accounting_service.platform_paid_usage_validation_error(row)
    if validation_error:
        reason = "unknown pricing" if validation_error == "unknown_pricing" else validation_error
        raise RuntimeError(
            "Hosted AI usage is not exact enough for platform credit accounting "
            f"({reason}) for {row.get('provider') or 'unknown'}:{row.get('model') or 'unknown'}."
        )
    unified_ledger_event = credit_ledger_contract.build_unified_credit_ledger_event(
        surface="sage",
        source_surface="sage_direct_chat",
        payer="platform_credits",
        credit_type=line_item_metadata.get("credit_type") or "ai_tokens",
        provider=row.get("provider"),
        model=row.get("model"),
        runtime_target="cloud_default",
        workspace_id=workspace_token,
        user_id=_text(_session_turn_metadata(session_ctx).get("user_id")),
        thread_id=thread_token,
        run_id=request_id,
        provider_usage=row.get("usage_accounting") if isinstance(row.get("usage_accounting"), dict) else row,
        platform_cost_usd=row.get("estimated_cost_usd"),
        provider_reported_cost=row.get("provider_cost_usd") or row.get("estimated_cost_usd"),
        provider_reported_currency="USD",
        credits_debited=row.get("retail_credits_charged"),
        estimation_mode=row.get("estimation_mode"),
        created_at=row.get("completed_at") or timestamp,
    )

    try:
        ledger_entry = run_async_tool_call(
            control_plane_repository.record_workspace_hosted_ai_monthly_cost_ledger_entry(
                tenant_id=tenant_id,
                workspace_id=workspace_token,
                request_id=request_id,
                thread_id=thread_token,
                source_surface="sage_direct_chat",
                provider=row.get("provider"),
                model=row.get("model"),
                prompt_tokens=int(row.get("prompt_tokens") or 0),
                completion_tokens=int(row.get("completion_tokens") or 0),
                total_tokens=int(row.get("total_tokens") or 0),
                estimated_cost_usd=float(row.get("estimated_cost_usd") or 0.0),
                completed_at=row.get("completed_at") or timestamp,
                metadata={
                    **_coerce_dict(row.get("metadata")),
                    "credential_plane": "platform_runtime",
                    "requested_provider": _text(requested_provider) or None,
                    "requested_model": _text(requested_model) or None,
                    "billing_source": line_item_metadata.get("billing_source"),
                    "credit_type": line_item_metadata.get("credit_type"),
                    "public_tier": line_item_metadata.get("public_tier"),
                    "credit_item_type": line_item_metadata.get("credit_item_type"),
                    "credit_quantity": line_item_metadata.get("quantity"),
                    "credit_quantity_unit": line_item_metadata.get("quantity_unit"),
                    "credit_multiplier": line_item_metadata.get("credit_multiplier"),
                    "unified_credit_ledger_event": unified_ledger_event,
                },
            )
        )
    except Exception as exc:
        raise RuntimeError("Hosted AI usage cost ledger persistence failed.") from exc
    if ledger_entry is None:
        return
    if not isinstance(ledger_entry, dict):
        raise RuntimeError("Hosted AI usage cost ledger persistence failed.")
    try:
        durable_event = run_async_tool_call(
            control_plane_repository.record_credit_ledger_event(
                tenant_id=tenant_id,
                workspace_id=workspace_token,
                event=unified_ledger_event,
                source_table="workspace_hosted_ai_monthly_cost_ledger",
                source_event_id=_text(ledger_entry.get("id")) or request_id,
            )
        )
    except Exception as exc:
        raise RuntimeError("Hosted AI unified credit ledger persistence failed.") from exc
    if not isinstance(durable_event, dict):
        raise RuntimeError("Hosted AI unified credit ledger persistence failed.")
    try:
        from server_modules import billing_service

        billing_service.debit_workspace_credit_balance_for_hosted_usage(
            workspace_id=workspace_token,
            tenant_id=tenant_id,
            request_id=request_id,
        )
    except Exception as exc:
        raise RuntimeError("Hosted AI credit debit failed.") from exc
