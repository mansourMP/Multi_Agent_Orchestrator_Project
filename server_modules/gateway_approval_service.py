from __future__ import annotations

import asyncio
from typing import Any, Callable, Dict, Optional

from server_modules import (
    gateway_activity_service,
    gateway_execution_service,
    gateway_state_repository,
)
from server_modules.capability_registry import canonical_capability_id, resolve_capability


RISKY_LOCAL_CAPABILITIES = {
    "computer_control.click",
    "computer_control.type",
    "computer_control.key",
    "computer_control.clipboard_write",
    "computer_control.launch",
    "computer_control.launch_app",
    "computer_control.applescript",
}


def capability_requires_owner_approval(capability_id: str) -> bool:
    normalized = canonical_capability_id(capability_id)
    if normalized in RISKY_LOCAL_CAPABILITIES:
        return True
    contract = resolve_capability(normalized, enforce_kill_switch=False) if normalized else None
    if contract is not None:
        if bool(contract.requires_approval):
            return True
        return str(contract.risk_level or "").strip().lower() in {"high", "critical"}
    return True


def get_gateway_tool_approval(approval_id: str) -> Optional[Dict[str, Any]]:
    return gateway_state_repository.get_gateway_action_approval(approval_id)


def list_gateway_tool_approvals(
    *,
    gateway_id: str,
    status: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    items = gateway_state_repository.list_gateway_action_approvals(
        gateway_id=gateway_id,
        status=status,
        limit=limit,
    )
    pending_count = len([item for item in items if str(item.get("status") or "").strip() == "pending"])
    retryable_count = len(
        [
            item
            for item in items
            if str(item.get("status") or "").strip() == "approved" and int(item.get("retry_count") or 0) > 0
        ]
    )
    return {
        "gateway_id": str(gateway_id or "").strip(),
        "count": len(items),
        "pending_count": pending_count,
        "retryable_count": retryable_count,
        "items": items,
    }


async def request_gateway_tool_approval(
    *,
    registration: Dict[str, Any],
    capability_id: str,
    arguments: Optional[Dict[str, Any]],
    run_id: str,
    trace_id: str,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    approval = gateway_state_repository.create_gateway_action_approval(
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        device_id=str(registration.get("device_id") or "").strip(),
        tenant_id=str(registration.get("tenant_id") or "").strip(),
        workspace_id=str(registration.get("workspace_id") or "").strip(),
        user_id=str(registration.get("user_id") or "").strip(),
        capability_id=str(capability_id or "").strip(),
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip() or None,
        request_id=str(request_id or "").strip() or None,
        request_payload={
            "capability_id": str(capability_id or "").strip(),
            "arguments": dict(arguments or {}),
            "run_id": str(run_id or "").strip(),
            "trace_id": str(trace_id or "").strip() or None,
            "request_id": str(request_id or "").strip() or None,
        },
    )
    gateway_state_repository.record_gateway_event(
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        session_id=None,
        direction="system",
        frame_kind="event",
        message_type="gateway.approval.requested",
        payload={"approval": approval},
    )
    await gateway_activity_service.emit_gateway_approval_requested(
        registration,
        approval,
        description=f"Approval required before running {capability_id} on the paired device.",
    )
    return approval


async def resolve_gateway_tool_approval(
    *,
    registration: Dict[str, Any],
    approval_id: str,
    decision: str,
    actor: str,
    note: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
    execute_fn: Callable[..., Any] = gateway_execution_service.execute_tool_via_gateway,
) -> Dict[str, Any]:
    approval = gateway_state_repository.get_gateway_action_approval(approval_id)
    if not approval:
        raise ValueError("Gateway approval was not found.")
    if str(approval.get("gateway_id") or "").strip() != str(registration.get("gateway_id") or "").strip():
        raise ValueError("Gateway approval scope mismatch.")
    normalized_decision = str(decision or "").strip().lower()
    if normalized_decision not in {"approved", "rejected"}:
        raise ValueError("Gateway approval decision must be approved or rejected.")

    current_status = str(approval.get("status") or "").strip().lower()
    if current_status == "executed":
        return {"status": "executed", "approval": approval, "execution": approval.get("result_payload") or {}}
    if current_status == "rejected":
        return {"status": "rejected", "approval": approval}

    if normalized_decision == "rejected":
        resolved = gateway_state_repository.update_gateway_action_approval_decision(
            approval_id=approval_id,
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            status="rejected",
            decision="rejected",
            actor=str(actor or "").strip() or "user",
            note=note,
        ) or approval
        gateway_state_repository.record_gateway_event(
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            session_id=None,
            direction="system",
            frame_kind="event",
            message_type="gateway.approval.rejected",
            payload={"approval": resolved},
        )
        await gateway_activity_service.emit_gateway_approval_resolved(
            registration,
            resolved,
            decision="rejected",
            note=note,
        )
        return {"status": "rejected", "approval": resolved}

    if current_status == "pending":
        approval = gateway_state_repository.update_gateway_action_approval_decision(
            approval_id=approval_id,
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            status="approved",
            decision="approved",
            actor=str(actor or "").strip() or "user",
            note=note,
        ) or approval
        gateway_state_repository.record_gateway_event(
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            session_id=None,
            direction="system",
            frame_kind="event",
            message_type="gateway.approval.approved",
            payload={"approval": approval},
        )
        await gateway_activity_service.emit_gateway_approval_resolved(
            registration,
            approval,
            decision="approved",
            note=note,
        )

    request_payload = dict(approval.get("request_payload") or {})
    try:
        execution = await execute_fn(
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            capability_id=str(request_payload.get("capability_id") or approval.get("capability_id") or "").strip(),
            arguments=dict(request_payload.get("arguments") or {}),
            run_id=str(request_payload.get("run_id") or approval.get("run_id") or "").strip(),
            trace_id=str(request_payload.get("trace_id") or approval.get("trace_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            timeout_seconds=int(timeout_seconds or 15),
            request_id=str(request_payload.get("request_id") or approval.get("request_id") or "").strip() or None,
        )
    except (asyncio.TimeoutError, TimeoutError, RuntimeError, ValueError) as exc:
        failed = gateway_state_repository.mark_gateway_action_approval_execution_failed(
            approval_id=approval_id,
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            error_message=str(exc),
        ) or approval
        gateway_state_repository.record_gateway_event(
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            session_id=None,
            direction="system",
            frame_kind="event",
            message_type="gateway.approval.retryable_failure",
            payload={"approval": failed, "error": str(exc)},
        )
        await gateway_activity_service.append_gateway_activity(
            registration,
            action="gateway_tool_retryable_failure",
            title="Gateway tool retry needed",
            summary=str(exc),
            status="degraded",
            event_class="blocked_action",
            review_required=True,
            payload={"approval_id": approval_id, "error": str(exc), "approval": failed},
            metadata={"approval_id": approval_id},
            trace_id=str(failed.get("trace_id") or "").strip() or None,
        )
        return {
            "status": "retryable_error",
            "retryable": True,
            "error": str(exc),
            "approval": failed,
        }

    executed = gateway_state_repository.mark_gateway_action_approval_executed(
        approval_id=approval_id,
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        result_payload=execution,
    ) or approval
    gateway_state_repository.record_gateway_event(
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        session_id=None,
        direction="system",
        frame_kind="event",
        message_type="gateway.approval.executed",
        payload={"approval": executed, "execution": execution},
    )
    await gateway_activity_service.append_gateway_activity(
        registration,
        action="gateway_tool_executed",
        title="Gateway tool executed",
        summary=f"Executed {approval.get('capability_id')} through the paired gateway.",
        status="completed",
        event_class="system_activity",
        payload={"approval_id": approval_id, "execution": execution},
        metadata={"approval_id": approval_id},
        trace_id=str(executed.get("trace_id") or "").strip() or None,
    )
    return {
        "status": "executed",
        "approval": executed,
        "execution": execution,
    }
