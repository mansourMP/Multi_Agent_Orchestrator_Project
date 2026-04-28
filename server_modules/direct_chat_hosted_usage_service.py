from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from server_modules import control_plane_repository, usage_accounting_service
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
        or f"direct-chat-{datetime.now(timezone.utc).timestamp():.6f}"
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
        return
    if not bool(availability.get("platform_runtime_allowed")):
        return
    if not usage:
        return

    workspace_token = _text(workspace_id)
    thread_token = _text(thread_id) or "direct-chat"
    request_id = _session_request_id(session_ctx, thread_token)
    tenant_id = _session_tenant_id(session_ctx, workspace_token)
    if not workspace_token or not tenant_id or not request_id:
        return

    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
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
            },
        }
    else:
        snapshot["usage_masked"] = {
            **usage,
            "provider": _text(effective_provider) or usage.get("provider"),
            "model": _text(effective_model) or usage.get("model"),
            "requested_provider": _text(requested_provider) or usage.get("requested_provider"),
            "requested_model": _text(requested_model) or usage.get("requested_model"),
            "source_surface": "sage_direct_chat",
            "timestamp": timestamp,
            "metadata": {
                **_coerce_dict(usage.get("metadata")),
                "thread_id": thread_token,
                "request_id": request_id,
                "credential_plane": "platform_runtime",
            },
        }

    row = usage_accounting_service.usage_row_from_snapshot(snapshot)
    if not isinstance(row, dict):
        return

    try:
        run_async_tool_call(
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
                },
            )
        )
    except Exception:
        return
