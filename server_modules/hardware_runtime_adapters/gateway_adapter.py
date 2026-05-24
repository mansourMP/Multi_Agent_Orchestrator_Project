from __future__ import annotations

from typing import Any, Dict, List, Optional

from server_modules import (
    agent_trace_service,
    execution_mode_policy,
    gateway_approval_service,
    gateway_execution_service,
    gateway_protocol_service,
    gateway_state_repository,
    hardware_access_policy_service,
    hardware_result_correlator_service,
    hardware_runtime_session_service,
    hardware_runtime_target_resolver,
)
from server_modules.hardware_runtime_adapters.common import dict_value, text


HARDWARE_RUNTIME_SESSION_BINDING = hardware_runtime_session_service.HARDWARE_RUNTIME_SESSION_BINDING
FULL_RUNTIME_ACCESS_MODE = execution_mode_policy.FULL_RUNTIME_ACCESS_MODE


def find_gateway_registration(
    *,
    gateway_id: Optional[str],
    workspace_id: str,
) -> Optional[Dict[str, Any]]:
    gateway_token = text(gateway_id)
    if gateway_token:
        return gateway_state_repository.get_gateway_registration(gateway_token)
    registrations = gateway_state_repository.list_workspace_gateway_registrations(
        text(workspace_id) or "default",
        include_revoked=False,
    )
    active: List[Dict[str, Any]] = [
        item
        for item in registrations
        if text(item.get("status")).lower() == "active"
        and text(item.get("device_trust_state")).lower() != "revoked"
    ]
    for registration in active:
        candidate_gateway_id = text(registration.get("gateway_id"))
        if candidate_gateway_id and gateway_protocol_service.gateway_connection_is_live(candidate_gateway_id):
            return registration
    return active[0] if active else None


def registration_is_usable(registration: Optional[Dict[str, Any]], *, workspace_id: str) -> tuple[bool, str]:
    if not isinstance(registration, dict) or not registration:
        return False, "gateway_registration_missing"
    if text(registration.get("status")).lower() != "active":
        return False, "gateway_registration_inactive"
    if text(registration.get("device_trust_state")).lower() == "revoked":
        return False, "gateway_device_revoked"
    registration_workspace_id = text(registration.get("workspace_id"))
    if registration_workspace_id and registration_workspace_id != (text(workspace_id) or "default"):
        return False, "gateway_workspace_mismatch"
    return True, ""


def execution_summary(capability_id: str, execution: Dict[str, Any]) -> str:
    result = dict_value(execution.get("result"))
    summary = text(result.get("summary") or execution.get("summary"))
    if summary:
        return summary
    if capability_id == "shell.execute":
        command = text(result.get("command"))
        exit_code = result.get("exit_code")
        if command:
            return f"Ran command: {command}"
        if exit_code is not None:
            return f"Shell command finished with exit code {exit_code}."
    if capability_id.startswith("filesystem."):
        path = text(result.get("path"))
        mode = text(result.get("mode")) or "file"
        if path:
            return f"{mode.capitalize()} file action completed: {path}"
    return f"{capability_id or 'hardware action'} completed."


async def execute_gateway_action(
    *,
    tenant_id: str,
    workspace_id: str,
    user_id: Optional[str],
    gateway_id: Optional[str],
    device_id: Optional[str],
    action_id: str,
    capability_id: str,
    arguments: Dict[str, Any],
    runtime_session: Dict[str, Any],
    run_id: str,
    trace_id: str,
    thread_id: Optional[str],
    request_id: str,
    trace_context: Any,
    require_approval: Optional[bool],
    runtime_access_mode: str,
    timeout_seconds: Optional[int],
    tool_call_id: str,
    runtime_target: str = "user_device_gateway",
) -> Dict[str, Any]:
    registration = find_gateway_registration(
        gateway_id=gateway_id,
        workspace_id=text(workspace_id) or "default",
    )
    usable, unusable_reason = registration_is_usable(
        registration,
        workspace_id=text(workspace_id) or "default",
    )
    if not usable:
        runtime_session = await hardware_runtime_session_service.update_runtime_session(
            runtime_session,
            state="offline",
            audit_action="hardware_action.offline",
            reason=unusable_reason,
            extra_metadata={"offline_reason": unusable_reason},
        )
        await hardware_result_correlator_service.emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="offline",
            summary="Gateway is not available for this workspace.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target=runtime_target,
            request_id=request_id,
            action_id=action_id,
            metadata={"offline_reason": unusable_reason},
        )
        return {
            "status": "offline",
            "reason": unusable_reason,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    gateway_token = text((registration or {}).get("gateway_id"))
    device_token = text(device_id) or text((registration or {}).get("device_id"))
    runtime_session = await hardware_runtime_session_service.update_runtime_session(
        runtime_session,
        state="running",
        audit_action="hardware_action.gateway_selected",
        extra_metadata={"gateway_id": gateway_token, "device_id": device_token},
    )
    if not gateway_protocol_service.gateway_connection_is_live(gateway_token):
        reason = "gateway_offline"
        runtime_session = await hardware_runtime_session_service.update_runtime_session(
            runtime_session,
            state="offline",
            audit_action="hardware_action.offline",
            reason=reason,
            extra_metadata={"gateway_id": gateway_token, "device_id": device_token, "offline_reason": reason},
        )
        await hardware_result_correlator_service.emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="offline",
            summary="Gateway is paired but currently offline.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target=runtime_target,
            request_id=request_id,
            action_id=action_id,
            metadata={"gateway_id": gateway_token, "device_id": device_token, "offline_reason": reason},
        )
        return {
            "status": "offline",
            "reason": reason,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    approval_required = hardware_access_policy_service.hardware_action_requires_software_approval(
        runtime_access_mode=runtime_access_mode,
        capability_id=capability_id,
        action_id=action_id,
        arguments=arguments,
        require_approval=require_approval,
    )
    if approval_required:
        approval = await gateway_approval_service.request_gateway_tool_approval(
            registration=registration or {},
            capability_id=capability_id,
            arguments=arguments,
            run_id=run_id,
            trace_id=trace_id,
            request_id=request_id,
            runtime_session_id=text(runtime_session.get("session_id")),
            runtime_target=runtime_target,
            runtime_access_mode=runtime_access_mode,
            runtime_session_binding=HARDWARE_RUNTIME_SESSION_BINDING,
            thread_id=thread_id,
        )
        approval_id = text(approval.get("approval_id"))
        if approval_id:
            await agent_trace_service.emit_approval_requested(
                trace_context,
                approval_id=approval_id,
                kind="hardware_action",
                title=f"Approve {capability_id}",
                description=f"Approval required before running {capability_id} on the selected runtime.",
                blocking_item_id=None,
            )
        runtime_session = await hardware_runtime_session_service.update_runtime_session(
            runtime_session,
            state="waiting_approval",
            audit_action="hardware_action.approval_requested",
            approvals=[approval],
            extra_metadata={
                "gateway_id": gateway_token,
                "device_id": device_token,
                "approval_id": approval_id,
                "runtime_access_mode": runtime_access_mode,
            },
        )
        await hardware_result_correlator_service.emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status="waiting_approval",
            summary=f"Waiting for approval to run {capability_id}.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target=runtime_target,
            request_id=request_id,
            action_id=action_id,
            metadata={"gateway_id": gateway_token, "device_id": device_token, "approval_id": approval_id},
        )
        return {
            "status": "waiting_approval",
            "approval": approval,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    try:
        execution = await gateway_execution_service.execute_tool_via_gateway(
            gateway_id=gateway_token,
            capability_id=capability_id,
            arguments=arguments,
            run_id=run_id,
            trace_id=trace_id,
            workspace_id=text(workspace_id) or "default",
            timeout_seconds=int(timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=request_id,
            runtime_access_mode=runtime_access_mode,
            empyralis_approved=runtime_access_mode == FULL_RUNTIME_ACCESS_MODE,
        )
    except Exception as exc:
        message = str(exc)
        state = "offline" if "not currently connected" in message.lower() else "failed"
        runtime_session = await hardware_runtime_session_service.update_runtime_session(
            runtime_session,
            state=state,
            audit_action="hardware_action.failed",
            reason=message,
            extra_metadata={"gateway_id": gateway_token, "device_id": device_token, "failure_reason": message},
        )
        await hardware_result_correlator_service.emit_tool_result(
            trace_context,
            tool_call_id=tool_call_id,
            status=state,
            summary=message or "Hardware action failed.",
            capability_id=capability_id,
            arguments=arguments,
            runtime_session=runtime_session,
            runtime_target=runtime_target,
            request_id=request_id,
            action_id=action_id,
            metadata={"gateway_id": gateway_token, "device_id": device_token, "failure_reason": message},
        )
        return {
            "status": state,
            "reason": message,
            "runtime_session": runtime_session,
            "trace_id": trace_id,
        }

    artifact_ids = hardware_result_correlator_service.artifact_ids_from_execution(execution)
    await hardware_result_correlator_service.emit_artifacts(
        trace_context,
        artifact_ids,
        capability_id,
        runtime_session=runtime_session,
    )
    summary = execution_summary(capability_id, execution)
    runtime_session = await hardware_runtime_session_service.update_runtime_session(
        runtime_session,
        state="ready",
        audit_action="hardware_action.completed",
        artifacts=artifact_ids,
        extra_metadata={
            "gateway_id": gateway_token,
            "device_id": device_token,
            "result_summary": summary,
            "execution_request_id": text(execution.get("request_id")) or request_id,
        },
    )
    await hardware_result_correlator_service.emit_tool_result(
        trace_context,
        tool_call_id=tool_call_id,
        status="completed",
        summary=summary,
        artifact_ids=artifact_ids,
        capability_id=capability_id,
        arguments=arguments,
        runtime_session=runtime_session,
        runtime_target=runtime_target,
        request_id=request_id,
        action_id=action_id,
        metadata={"gateway_id": gateway_token, "device_id": device_token},
    )
    return {
        "status": "completed",
        "execution": execution,
        "runtime_session": runtime_session,
        "artifacts": artifact_ids,
        "trace_id": trace_id,
    }


async def stop_gateway_action(
    *,
    tenant_id: str,
    workspace_id: str,
    run_id: str,
    target_ids: Dict[str, str],
    gateway_id: Optional[str],
    trace_id: str,
    target_request_id: Optional[str],
    request_id: str,
    thread_id: Optional[str],
    reason: Optional[str],
    session_id: Optional[str],
    timeout_seconds: Optional[int],
) -> Dict[str, Any]:
    canonical_target_id = target_ids["canonical_runtime_target"]
    registration = find_gateway_registration(
        gateway_id=gateway_id,
        workspace_id=text(workspace_id) or "default",
    )
    usable, unusable_reason = registration_is_usable(
        registration,
        workspace_id=text(workspace_id) or "default",
    )
    if not usable:
        return {
            "status": "offline",
            "reason": unusable_reason,
            "trace_id": trace_id,
        }
    gateway_token = text((registration or {}).get("gateway_id"))
    if not gateway_protocol_service.gateway_connection_is_live(gateway_token):
        return {
            "status": "offline",
            "reason": "gateway_offline",
            "trace_id": trace_id,
        }
    try:
        interrupted = await gateway_execution_service.interrupt_tool_via_gateway(
            gateway_id=gateway_token,
            run_id=text(run_id),
            trace_id=trace_id,
            workspace_id=text(workspace_id) or "default",
            target_request_id=text(target_request_id) or None,
            reason=text(reason) or "operator_requested_stop",
            timeout_seconds=int(timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=request_id,
        )
    except Exception as exc:
        return {
            "status": "failed",
            "reason": str(exc),
            "trace_id": trace_id,
        }
    if text(session_id):
        session_view = {
            "session_id": text(session_id),
            "runtime_session_binding": HARDWARE_RUNTIME_SESSION_BINDING,
            "state": "running",
            "runtime_target": target_ids["runtime_target"],
            "canonical_runtime_target": canonical_target_id,
            "runtime_fabric_target": canonical_target_id,
            "hardware_edge": hardware_runtime_target_resolver.runtime_edge(canonical_target_id),
            "tenant_id": text(tenant_id) or "default",
            "workspace_id": text(workspace_id) or "default",
            "thread_id": text(thread_id) or None,
            "gateway_id": gateway_token,
            "run_id": text(run_id),
            "trace_id": trace_id,
            "request_id": request_id,
            "capability_id": "tool.interrupt",
            "action_id": "hardware.stop",
            "approvals": [],
            "artifacts": [],
            "audit_events": [],
            "billing": {},
        }
        session_view = await hardware_runtime_session_service.update_runtime_session(
            session_view,
            state="terminated",
            audit_action="hardware_action.terminated",
            reason=text(reason) or "operator_requested_stop",
            extra_metadata={"gateway_id": gateway_token, "interrupt_request_id": request_id},
        )
        await hardware_result_correlator_service.emit_hardware_stop_transcript_event(
            session_view,
            runtime_target=canonical_target_id,
            target_request_id=target_request_id,
            reason=reason,
        )
    else:
        session_view = None
    return {
        "status": "terminated",
        "execution": interrupted,
        "runtime_session": session_view,
        "trace_id": trace_id,
    }
