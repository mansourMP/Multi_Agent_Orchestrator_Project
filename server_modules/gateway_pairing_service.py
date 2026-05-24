from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from server_modules import (
    activity_ledger_service,
    auth,
    execution_mode_policy,
    gateway_activity_service,
    gateway_state_repository,
)


DEFAULT_GATEWAY_PAIRING_TTL_SECONDS = 15 * 60
MIN_GATEWAY_PAIRING_TTL_SECONDS = 60
MAX_GATEWAY_PAIRING_TTL_SECONDS = 60 * 60
MAX_PENDING_GATEWAY_PAIRING_INTENTS = 3


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_gateway_pairing_ttl_seconds(ttl_seconds: Optional[int] = None) -> int:
    return max(
        MIN_GATEWAY_PAIRING_TTL_SECONDS,
        min(
            int(ttl_seconds or DEFAULT_GATEWAY_PAIRING_TTL_SECONDS),
            MAX_GATEWAY_PAIRING_TTL_SECONDS,
        ),
    )


def _runtime_access_pairing_metadata(
    *,
    runtime_access_mode: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    autonomous_agent_setup_warning_acknowledged: bool = False,
) -> Dict[str, Any]:
    source = dict(metadata or {})
    raw_mode = runtime_access_mode or source.get("runtime_access_mode") or source.get("execution_mode")
    resolved_mode = execution_mode_policy.normalize_runtime_access_mode(raw_mode)
    warning_acknowledged = bool(
        autonomous_agent_setup_warning_acknowledged
        or source.get("autonomous_agent_setup_warning_acknowledged") is True
    )
    if resolved_mode == execution_mode_policy.FULL_RUNTIME_ACCESS_MODE and not warning_acknowledged:
        raise ValueError("Autonomous Full Access setup warning must be acknowledged before pairing this runtime.")
    out = {
        "runtime_access_mode": resolved_mode,
        "runtime_access_label": execution_mode_policy.public_runtime_access_label(resolved_mode),
    }
    setup_warning = execution_mode_policy.runtime_access_setup_warning(resolved_mode)
    if setup_warning:
        out["runtime_access_setup_warning"] = setup_warning
        out["autonomous_agent_setup_warning_acknowledged"] = True
        out["autonomous_agent_setup_warning_acknowledged_at"] = _utc_now_iso()
    return out


def create_gateway_pairing_intent(
    *,
    tenant_id: str,
    workspace_id: str,
    user_id: str,
    ttl_seconds: Optional[int] = None,
    display_name: Optional[str] = None,
    platform: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    runtime_access_mode: Optional[str] = None,
    autonomous_agent_setup_warning_acknowledged: bool = False,
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    merged_metadata = dict(metadata or {})
    merged_metadata.update(
        _runtime_access_pairing_metadata(
            runtime_access_mode=runtime_access_mode,
            metadata=metadata,
            autonomous_agent_setup_warning_acknowledged=autonomous_agent_setup_warning_acknowledged,
        )
    )
    if trace_id:
        merged_metadata["trace_id"] = trace_id
    return gateway_state_repository.create_pairing_intent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        user_id=user_id,
        ttl_seconds=_normalize_gateway_pairing_ttl_seconds(ttl_seconds),
        display_name=display_name,
        platform=platform,
        metadata=merged_metadata,
        max_pending_intents=MAX_PENDING_GATEWAY_PAIRING_INTENTS,
    )


def register_gateway(
    *,
    pairing_token: str,
    device_id: str,
    gateway_id: Optional[str] = None,
    display_name: Optional[str] = None,
    platform: Optional[str] = None,
    capabilities: Optional[list[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    merged_metadata = dict(metadata or {})
    if trace_id:
        merged_metadata["trace_id"] = trace_id
    registration = gateway_state_repository.register_gateway_from_pairing(
        pairing_token=pairing_token,
        device_id=device_id,
        gateway_id=gateway_id,
        display_name=display_name,
        platform=platform,
        capabilities=capabilities,
        metadata=merged_metadata,
    )
    try:
        device_link = auth.ensure_local_gateway_device_link(
            user_id=str(registration.get("user_id") or "").strip(),
            tenant_id=str(registration.get("tenant_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            device_id=str(registration.get("device_id") or "").strip(),
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            display_name=str(display_name or registration.get("display_name") or "").strip() or None,
            platform=str(platform or registration.get("platform") or "").strip() or None,
            metadata={
                "pairing_flow": "gateway_register",
                **dict(metadata or {}),
            },
        )
    except HTTPException as exc:
        gateway_state_repository.revoke_gateway_registration(
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            tenant_id=str(registration.get("tenant_id") or "").strip() or None,
            workspace_id=str(registration.get("workspace_id") or "").strip() or None,
            user_id=str(registration.get("user_id") or "").strip() or None,
            reason=f"Gateway device binding failed: {exc.detail}",
        )
        raise ValueError(str(exc.detail)) from exc
    linked_registration = gateway_state_repository.sync_gateway_registration_identity(
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        tenant_id=str(registration.get("tenant_id") or "").strip() or None,
        workspace_id=str(registration.get("workspace_id") or "").strip() or None,
        user_id=str(registration.get("user_id") or "").strip() or None,
        device_id=str(registration.get("device_id") or "").strip() or None,
        device_trust_state=str(device_link.get("trust_state") or "verified").strip() or "verified",
        metadata={
            "device_link": {
                "device_id": str(device_link.get("device_id") or "").strip() or None,
                "workspace_id": str(device_link.get("workspace_id") or "").strip() or None,
                "status": str(device_link.get("status") or "").strip() or None,
                "trust_state": str(device_link.get("trust_state") or "").strip() or None,
            }
        },
    ) or registration
    linked_registration["gateway_token"] = str(registration.get("gateway_token") or "")
    try:
        activity_ledger_service._run_coro_sync(
            gateway_activity_service.append_gateway_activity(
                linked_registration,
                action="gateway_registered",
                title="Gateway registered",
                summary="Local gateway paired and registered to the control plane.",
                status="active",
                event_class="system_activity",
                payload={
                    "device_id": str(linked_registration.get("device_id") or ""),
                    "gateway_id": str(linked_registration.get("gateway_id") or ""),
                },
                trace_id=trace_id,
            )
        )
    except Exception:
        pass
    return linked_registration
