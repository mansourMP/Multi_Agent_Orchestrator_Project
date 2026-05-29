from __future__ import annotations

import base64
import binascii
from typing import Any, Dict, Optional

from server_modules import (
    artifact_service,
    gateway_activity_service,
    gateway_inventory_service,
    gateway_registry_service,
    gateway_protocol_service,
    gateway_state_repository,
    gateway_transparency_service,
    secret_redaction_service,
)


def _text(value: Any, fallback: str = "") -> str:
    token = str(value or "").strip()
    return token or fallback


def _gateway_supervisor_capability(
    capability_id: str,
    arguments: Optional[Dict[str, Any]],
) -> tuple[str, Dict[str, Any]]:
    normalized = str(capability_id or "").strip()
    args = dict(arguments or {})
    if normalized == "filesystem.read":
        args.setdefault("mode", "read")
        return "filesystem.read_write", args
    if normalized == "filesystem.write":
        args.setdefault("mode", "write")
        return "filesystem.read_write", args
    return normalized, args


def _has_gateway_capability(registration: Dict[str, Any], capability_id: str) -> bool:
    return gateway_inventory_service.registration_has_execution_capability(registration, capability_id)


def _heartbeat_capability_ready(
    *,
    registration: Dict[str, Any],
    status_payload: Dict[str, Any],
    capability_id: str,
) -> bool:
    registration_metadata = dict(registration.get("metadata") or {})
    status_metadata = dict(status_payload.get("metadata") or {})
    return gateway_inventory_service.capability_ready_from_any_metadata(
        capability_id,
        registration_metadata,
        status_metadata,
        status_payload,
    )


def gateway_registration_execution_readiness(
    registration: Optional[Dict[str, Any]],
    *,
    workspace_id: str,
    capability_id: str,
) -> tuple[bool, str]:
    if not isinstance(registration, dict) or not registration:
        return False, "gateway_registration_missing"
    if _text(registration.get("status")).lower() != "active":
        return False, "gateway_registration_inactive"
    if _text(registration.get("device_trust_state")).lower() == "revoked":
        return False, "gateway_device_revoked"
    registration_workspace_id = _text(registration.get("workspace_id"))
    if registration_workspace_id and registration_workspace_id != (_text(workspace_id) or "default"):
        return False, "gateway_workspace_mismatch"
    if not _has_gateway_capability(registration, capability_id):
        return False, "gateway_capability_missing"
    gateway_id = _text(registration.get("gateway_id"))
    if not gateway_protocol_service.gateway_connection_is_live(gateway_id):
        return False, "gateway_offline"
    status_payload = gateway_registry_service.gateway_registration_public_payload(registration)
    if not bool(status_payload.get("heartbeat_fresh")):
        return False, "gateway_heartbeat_stale"
    connection_status = _text(status_payload.get("connection_status")).lower()
    if connection_status != "online":
        return False, "gateway_unhealthy"
    reported_health = _text(status_payload.get("reported_health_state")).lower()
    if reported_health in {"degraded", "offline", "unhealthy", "error", "blocked"}:
        return False, "gateway_unhealthy"
    if not _heartbeat_capability_ready(
        registration=registration,
        status_payload=status_payload,
        capability_id=capability_id,
    ):
        return False, "gateway_capability_not_ready"
    return True, ""


def _materialize_gateway_artifacts(
    *,
    capability_id: str,
    response: Dict[str, Any],
    registration: Dict[str, Any],
    run_id: str,
    screenshot_retention: Optional[str] = None,
) -> Dict[str, Any]:
    result = dict(response.get("result") or {})
    if str(capability_id or "").strip() != "screenshot.capture":
        return result

    images = result.get("images")
    if not isinstance(images, list):
        return result

    compact_images = []
    artifacts = []
    retention = str(screenshot_retention or "session_only").strip().lower() or "session_only"
    for index, item in enumerate(images):
        if not isinstance(item, dict):
            continue
        encoded = str(item.get("data_base64") or "").strip()
        compact_item = {
            key: value
            for key, value in item.items()
            if key not in {"data_base64", "base64", "data"}
        }
        compact_item["screenshot_retention"] = retention
        if retention == "off":
            compact_item["artifact_retained"] = False
            compact_images.append({key: value for key, value in compact_item.items() if value is not None})
            continue
        if encoded:
            try:
                content = base64.b64decode(encoded, validate=True)
                record = artifact_service.store_artifact_bytes(
                    content,
                    run_id=str(run_id or "").strip(),
                    kind="screenshot",
                    file_name=f"gateway-screenshot-{index + 1}.png",
                    tenant_id=str(registration.get("tenant_id") or "default").strip() or "default",
                    workspace_id=str(registration.get("workspace_id") or "default").strip() or "default",
                    machine_id=str(registration.get("device_id") or "").strip() or None,
                    content_type="image/png",
                    metadata={
                        "source": "empyralis_gateway",
                        "gateway_id": str(registration.get("gateway_id") or "").strip(),
                        "device_id": str(registration.get("device_id") or "").strip(),
                        "capability_id": "screenshot.capture",
                        "monitor_name": str(item.get("monitor_name") or "").strip() or None,
                        "width": item.get("width"),
                        "height": item.get("height"),
                        "retention": retention,
                    },
                )
                artifact_payload = record.as_payload()
                artifacts.append(artifact_payload)
                compact_item["artifact_id"] = artifact_payload.get("artifact_id")
                compact_item["uri"] = artifact_payload.get("uri")
                compact_item["artifact_retained"] = True
            except (binascii.Error, ValueError):
                compact_item["artifact_error"] = "invalid_screenshot_payload"
        compact_images.append({key: value for key, value in compact_item.items() if value is not None})

    result["images"] = compact_images
    if artifacts:
        existing = result.get("artifacts")
        merged = list(existing) if isinstance(existing, list) else []
        merged.extend(artifacts)
        result["artifacts"] = merged
    return result


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
    runtime_access_mode: Optional[str] = None,
    empyralis_approved: bool = False,
    screenshot_retention: Optional[str] = None,
) -> Dict[str, Any]:
    registration = _require_active_gateway_registration(gateway_id, workspace_id=workspace_id)
    _gw = str(registration.get("gateway_id") or "").strip()
    _ws = str(registration.get("workspace_id") or "").strip()
    _tid = str(trace_id or "").strip()
    _cap = str(capability_id or "").strip()
    supervisor_capability_id, supervisor_arguments = _gateway_supervisor_capability(_cap, arguments)
    ready, readiness_reason = gateway_registration_execution_readiness(
        registration,
        workspace_id=workspace_id,
        capability_id=_cap,
    )
    if not ready:
        raise ValueError(readiness_reason)
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
        capability_id=supervisor_capability_id,
        arguments=supervisor_arguments,
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        workspace_id=_ws,
        timeout_seconds=timeout_seconds,
        request_id=request_id,
        runtime_access_mode=runtime_access_mode,
        empyralis_approved=empyralis_approved,
    )
    result = _materialize_gateway_artifacts(
        capability_id=_cap,
        response=response,
        registration=registration,
        run_id=str(response.get("run_id") or run_id).strip(),
        screenshot_retention=screenshot_retention,
    )
    activity_payload = {
        "request_id": str(response.get("request_id") or request_id or "").strip() or None,
        "capability_id": _cap,
        "gateway_capability_id": str(response.get("capability_id") or supervisor_capability_id).strip(),
        "run_id": str(response.get("run_id") or run_id).strip(),
        "result": result,
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
        "capability_id": _cap,
        "gateway_capability_id": str(response.get("capability_id") or supervisor_capability_id).strip(),
        "run_id": str(response.get("run_id") or run_id).strip(),
        "result": result,
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
