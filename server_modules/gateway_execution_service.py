from __future__ import annotations

from typing import Any, Dict, Optional

from server_modules import (
    gateway_activity_service,
    gateway_protocol_service,
    gateway_state_repository,
    secret_redaction_service,
)


def _require_active_gateway_registration(gateway_id: str) -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")
    if str(registration.get("status") or "").strip().lower() != "active":
        raise ValueError("Gateway registration is not active.")
    if str(registration.get("device_trust_state") or "").strip().lower() == "revoked":
        raise ValueError("Gateway device trust was revoked.")
    return registration


async def execute_tool_via_gateway(
    *,
    gateway_id: str,
    capability_id: str,
    arguments: Optional[Dict[str, Any]],
    run_id: str,
    trace_id: str,
    workspace_id: str,
    timeout_seconds: int = gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    registration = _require_active_gateway_registration(gateway_id)
    response = await gateway_protocol_service.dispatch_tool_invoke(
        gateway_id=str(gateway_id or "").strip(),
        capability_id=str(capability_id or "").strip(),
        arguments=dict(arguments or {}),
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        workspace_id=str(workspace_id or "").strip(),
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )
    activity_payload = {
        "request_id": str(response.get("request_id") or request_id or "").strip() or None,
        "capability_id": str(response.get("capability_id") or capability_id).strip(),
        "run_id": str(response.get("run_id") or run_id).strip(),
        "result": dict(response.get("result") or {}),
    }
    await gateway_activity_service.append_gateway_activity(
        registration,
        action="gateway_tool_executed",
        title="Gateway tool executed",
        summary=f"Executed {capability_id} through the paired local gateway.",
        status="completed",
        payload=secret_redaction_service.sanitize_mapping(activity_payload),
        trace_id=str(trace_id or "").strip() or None,
    )
    return {
        "gateway_id": str(registration.get("gateway_id") or "").strip(),
        "device_id": str(registration.get("device_id") or "").strip(),
        "workspace_id": str(registration.get("workspace_id") or "").strip(),
        "request_id": str(response.get("request_id") or request_id or "").strip(),
        "capability_id": str(response.get("capability_id") or capability_id).strip(),
        "run_id": str(response.get("run_id") or run_id).strip(),
        "result": dict(response.get("result") or {}),
    }


async def interrupt_tool_via_gateway(
    *,
    gateway_id: str,
    run_id: str,
    trace_id: str,
    workspace_id: str,
    target_request_id: Optional[str] = None,
    reason: Optional[str] = None,
    timeout_seconds: int = gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    registration = _require_active_gateway_registration(gateway_id)
    response = await gateway_protocol_service.dispatch_tool_interrupt(
        gateway_id=str(gateway_id or "").strip(),
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        workspace_id=str(workspace_id or "").strip(),
        target_request_id=str(target_request_id or "").strip() or None,
        reason=str(reason or "").strip() or None,
        timeout_seconds=timeout_seconds,
        request_id=request_id,
    )
    activity_payload = {
        "request_id": str(response.get("request_id") or request_id or "").strip() or None,
        "run_id": str(response.get("run_id") or run_id).strip(),
        "target_request_id": str(response.get("target_request_id") or target_request_id or "").strip() or None,
        "interrupted": bool(response.get("interrupted")),
        "interrupt_count": int(response.get("interrupt_count") or 0),
    }
    await gateway_activity_service.append_gateway_activity(
        registration,
        action="gateway_tool_interrupted",
        title="Gateway tool interrupted",
        summary=f"Interrupted local gateway run {run_id}.",
        status="completed",
        payload=secret_redaction_service.sanitize_mapping(activity_payload),
        trace_id=str(trace_id or "").strip() or None,
    )
    return {
        "gateway_id": str(registration.get("gateway_id") or "").strip(),
        "device_id": str(registration.get("device_id") or "").strip(),
        "workspace_id": str(registration.get("workspace_id") or "").strip(),
        "request_id": str(response.get("request_id") or request_id or "").strip(),
        "run_id": str(response.get("run_id") or run_id).strip(),
        "target_request_id": str(response.get("target_request_id") or target_request_id or "").strip() or None,
        "interrupted": bool(response.get("interrupted")),
        "interrupt_count": int(response.get("interrupt_count") or 0),
    }
