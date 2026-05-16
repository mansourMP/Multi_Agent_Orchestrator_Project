from __future__ import annotations

from typing import Any, Dict, Optional

from server_modules import (
    gateway_activity_service,
    gateway_protocol_service,
    gateway_state_repository,
    gateway_transparency_service,
    secret_redaction_service,
)


def _require_active_gateway_registration(gateway_id: str, *, workspace_id: str = "") -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")
    if str(registration.get("status") or "").strip().lower() != "active":
        raise ValueError("Gateway registration is not active.")
    if str(registration.get("device_trust_state") or "").strip().lower() == "revoked":
        raise ValueError("Gateway device trust was revoked.")
    if workspace_id:
        reg_ws = str(registration.get("workspace_id") or "").strip()
        if reg_ws and reg_ws != workspace_id:
            raise PermissionError(
                f"Caller workspace_id {workspace_id} does not match registration workspace_id {reg_ws}."
            )
    if not str(registration.get("workspace_id") or "").strip():
        raise ValueError("Gateway registration is missing workspace_id.")
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
    registration = _require_active_gateway_registration(gateway_id, workspace_id=workspace_id)
    _gw = str(registration.get("gateway_id") or "").strip()
    _ws = str(registration.get("workspace_id") or "").strip()
    _tid = str(trace_id or "").strip()
    _cap = str(capability_id or "").strip()
    gateway_transparency_service.emit_gateway_action_event(
        event_type="gateway_action_started",
        title=f"Gateway action: {_cap}",
        summary=f"Executing {_cap} through paired gateway {_gw}",
        status="running",
        trace_id=_tid,
        workspace_id=_ws,
        gateway_id=_gw,
        capability_id=_cap,
    )
    response = await gateway_protocol_service.dispatch_tool_invoke(
        gateway_id=str(gateway_id or "").strip(),
        capability_id=str(capability_id or "").strip(),
        arguments=dict(arguments or {}),
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        workspace_id=_ws,
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
    gateway_transparency_service.emit_gateway_action_event(
        event_type="gateway_action_completed",
        title=f"Gateway action completed: {_cap}",
        summary=f"Completed {_cap} through gateway {_gw}",
        status="completed",
        trace_id=_tid,
        workspace_id=_ws,
        gateway_id=_gw,
        capability_id=_cap,
    )
    return {
        "gateway_id": _gw,
        "device_id": str(registration.get("device_id") or "").strip(),
        "workspace_id": _ws,
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
    registration = _require_active_gateway_registration(gateway_id, workspace_id=workspace_id)
    _gw = str(registration.get("gateway_id") or "").strip()
    _ws = str(registration.get("workspace_id") or "").strip()
    _tid = str(trace_id or "").strip()
    gateway_transparency_service.emit_gateway_action_event(
        event_type="gateway_action_started",
        title="Gateway interrupt",
        summary=f"Interrupting run {run_id} on gateway {_gw}",
        status="running",
        trace_id=_tid,
        workspace_id=_ws,
        gateway_id=_gw,
        capability_id="tool.interrupt",
    )
    response = await gateway_protocol_service.dispatch_tool_interrupt(
        gateway_id=str(gateway_id or "").strip(),
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        workspace_id=_ws,
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
    gateway_transparency_service.emit_gateway_action_event(
        event_type="gateway_action_completed",
        title="Gateway interrupt completed",
        summary=f"Interrupted run {run_id} on gateway {_gw}",
        status="completed",
        trace_id=_tid,
        workspace_id=_ws,
        gateway_id=_gw,
        capability_id="tool.interrupt",
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
