from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import os
from typing import Any, Callable, Dict, Optional

from server_modules import (
    approval_contracts,
    gateway_activity_service,
    gateway_execution_service,
    gateway_state_repository,
    rust_runtime_kernel_client,
    secret_redaction_service,
)
from server_modules.capability_registry import canonical_capability_id, resolve_capability


def _max_gateway_approval_retries() -> int:
    raw = os.getenv("EMPYRALIS_GATEWAY_APPROVAL_MAX_RETRIES", "").strip()
    if not raw:
        return 3
    try:
        return max(0, int(raw))
    except Exception:
        return 3


def _approval_expired(approval: Dict[str, Any], ttl_seconds: int) -> bool:
    """Check whether an approval request has exceeded its TTL."""
    raw = str(approval.get("requested_at") or "").strip()
    if not raw:
        return False
    try:
        requested_at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return False
    return (datetime.now(timezone.utc) - requested_at).total_seconds() > max(int(ttl_seconds or 900), 1)


def _redact_approval_for_log(approval: Dict[str, Any]) -> Dict[str, Any]:
    """Return a deep-ish copy of approval with request_payload redacted."""
    safe = dict(approval)
    rp = safe.get("request_payload")
    if isinstance(rp, dict):
        safe["request_payload"] = secret_redaction_service.sanitize_mapping(rp)
    return safe


RISKY_LOCAL_CAPABILITIES = {
    "computer_control.click",
    "computer_control.type",
    "computer_control.key",
    "computer_control.clipboard_write",
    "computer_control.launch",
    "computer_control.launch_app",
    "computer_control.applescript",
}


class GatewayApprovalRustGateError(RuntimeError):
    pass


def _payload_size_bytes(value: Any) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8"))
    except Exception:
        return len(str(value or "").encode("utf-8"))


def _enforce_gateway_approval_transition(
    *,
    operation: str,
    registration: Dict[str, Any],
    approval_id: str = "",
    run_id: str = "",
    trace_id: str = "",
    capability_id: str = "",
    status: str = "",
    decision: str = "",
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    raw_payload = dict(payload or {})
    normalized_payload = {
        "gateway_id": str((registration or {}).get("gateway_id") or "").strip(),
        "device_id": str((registration or {}).get("device_id") or "").strip(),
        "tenant_id": str((registration or {}).get("tenant_id") or raw_payload.get("tenant_id") or "default").strip(),
        "workspace_id": str((registration or {}).get("workspace_id") or raw_payload.get("workspace_id") or "default").strip(),
        "user_id": str((registration or {}).get("user_id") or "").strip(),
        "approval_id": str(approval_id or "").strip(),
        "run_id": str(run_id or "").strip(),
        "trace_id": str(trace_id or "").strip(),
        "capability_id": str(capability_id or "").strip(),
        "status": str(status or "").strip(),
        "decision": str(decision or "").strip(),
        "payload": raw_payload,
    }
    try:
        rust_decision = rust_runtime_kernel_client.runtime_state_store_decision(
            operation=operation,
            state_class="gateway_approvals",
            tenant_id=str(normalized_payload["tenant_id"] or "default").strip() or "default",
            workspace_id=str(normalized_payload["workspace_id"]),
            run_id=str(normalized_payload["run_id"]),
            actor_id="system",
            status=str(status or "active").strip() or "active",
            payload=normalized_payload,
            payload_bytes=_payload_size_bytes(normalized_payload),
            workspace_access=True,
            owner_access=True,
        )
        enforced = rust_runtime_kernel_client.enforce_kernel_decision(
            "runtime-state-store-decision",
            rust_decision,
        )
        expected_next_action = {
            "resolve_gateway_tool_approval": "resolve_gateway_tool_approval",
            "execute_gateway_tool_approval": "execute_gateway_tool_approval",
        }.get(str(operation or "").strip())
        next_action = str(enforced.get("next_action") or "").strip()
        if expected_next_action and next_action != expected_next_action:
            raise GatewayApprovalRustGateError(
                "unexpected next_action for "
                f"{operation or 'operation'}: {next_action or 'missing'}"
            )
        return enforced
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        raise GatewayApprovalRustGateError(exc.reason) from exc


def _enforce_gateway_approval_action_decision(
    *,
    registration: Dict[str, Any],
    approval_id: str,
    run_id: str = "",
    trace_id: str = "",
    capability_id: str = "",
    request_id: str = "",
    actor_role: str = "owner",
) -> Dict[str, Any]:
    try:
        decision = rust_runtime_kernel_client.gateway_action_decision(
            operation="approval_resolve",
            workspace_id=str((registration or {}).get("workspace_id") or "").strip() or "default",
            tenant_id=str((registration or {}).get("tenant_id") or "").strip() or "default",
            gateway_id=str((registration or {}).get("gateway_id") or "").strip(),
            run_id=str(run_id or "").strip() or None,
            request_id=str(request_id or "").strip() or None,
            capability_id=str(capability_id or "").strip() or None,
            approval_id=str(approval_id or "").strip(),
            actor_role=str(actor_role or "owner").strip() or "owner",
            gateway_connected=True,
            approval_provided=True,
        )
        enforced = rust_runtime_kernel_client.enforce_kernel_decision(
            "gateway-action-decision",
            decision,
        )
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        raise GatewayApprovalRustGateError(exc.reason) from exc
    next_action = str(enforced.get("next_action") or "").strip()
    if next_action != "resolve_gateway_approval":
        raise GatewayApprovalRustGateError(
            "unexpected next_action for approval_resolve: "
            f"{next_action or 'missing'}"
        )
    return enforced


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


def _is_personal_channel_send_capability(capability_id: str) -> bool:
    token = str(capability_id or "").strip().lower()
    return token in {
        "channel.whatsapp.personal.send",
        "channel.telegram.personal.send",
    } or (token.endswith("_personal.send") and token.startswith(("signal", "imessage", "wechat")))


async def _execute_personal_channel_send_approval(
    *,
    gateway_id: str,
    capability_id: str,
    arguments: Dict[str, Any],
    run_id: str,
    trace_id: str,
    workspace_id: str,
    timeout_seconds: int,
    request_id: Optional[str] = None,
    runtime_access_mode: Optional[str] = None,
    empyralis_approved: bool = False,
) -> Dict[str, Any]:
    from server_modules import personal_channels_service

    return await personal_channels_service.dispatch_approved_personal_channel_outbound(
        gateway_id=gateway_id,
        capability_id=capability_id,
        arguments=arguments,
        run_id=run_id,
        trace_id=trace_id,
        workspace_id=workspace_id,
        timeout_seconds=timeout_seconds,
        request_id=request_id,
        runtime_access_mode=runtime_access_mode,
        empyralis_approved=empyralis_approved,
    )


def get_gateway_tool_approval(approval_id: str) -> Optional[Dict[str, Any]]:
    approval = gateway_state_repository.get_gateway_action_approval(approval_id)
    if not isinstance(approval, dict):
        return None
    return approval_contracts.attach_normalized_approval(
        approval,
        approval_contracts.normalize_gateway_approval(approval),
    )


def list_gateway_tool_approvals(
    *,
    gateway_id: str,
    status: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    items = [
        approval_contracts.attach_normalized_approval(
            item,
            approval_contracts.normalize_gateway_approval(item),
        )
        for item in gateway_state_repository.list_gateway_action_approvals(
            gateway_id=gateway_id,
            status=status,
            limit=limit,
        )
    ]
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
    runtime_session_id: Optional[str] = None,
    runtime_target: Optional[str] = None,
    runtime_access_mode: Optional[str] = None,
    runtime_session_binding: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> Dict[str, Any]:
    request_payload = {
        "capability_id": str(capability_id or "").strip(),
        "arguments": dict(arguments or {}),
        "run_id": str(run_id or "").strip(),
        "trace_id": str(trace_id or "").strip() or None,
        "request_id": str(request_id or "").strip() or None,
        "tenant_id": str(registration.get("tenant_id") or "").strip() or None,
        "workspace_id": str(registration.get("workspace_id") or "").strip() or None,
        "user_id": str(registration.get("user_id") or "").strip() or None,
    }
    if str(thread_id or "").strip():
        request_payload["thread_id"] = str(thread_id or "").strip()
    if str(runtime_session_id or "").strip():
        request_payload["runtime_session_id"] = str(runtime_session_id or "").strip()
    if str(runtime_target or "").strip():
        request_payload["runtime_target"] = str(runtime_target or "").strip()
    if str(runtime_access_mode or "").strip():
        request_payload["runtime_access_mode"] = str(runtime_access_mode or "").strip()
    if str(runtime_session_binding or "").strip():
        request_payload["runtime_session_binding"] = str(runtime_session_binding or "").strip()
    _enforce_gateway_approval_transition(
        operation="create_gateway_tool_approval",
        registration=registration,
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        capability_id=str(capability_id or "").strip(),
        status="pending",
        decision="requested",
        payload=request_payload,
    )
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
        request_payload=request_payload,
    )
    approval = approval_contracts.attach_normalized_approval(
        approval,
        approval_contracts.normalize_gateway_approval(approval),
    )
    # record_gateway_event already sanitizes internally
    gateway_state_repository.record_gateway_event(
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        session_id=None,
        direction="system",
        frame_kind="event",
        message_type="gateway.approval.requested",
        payload={"approval": approval},
    )
    # Redact before passing approval to activity/audit logging
    await gateway_activity_service.emit_gateway_approval_requested(
        registration,
        _redact_approval_for_log(approval),
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
    approval_ttl_seconds: int = 900,
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
    # Fast path: already in a terminal state. An approved record with a retry
    # count is intentionally not terminal: it represents an approval whose
    # execution failed after approval and can be retried by the owner.
    if current_status == "executed":
        return {"status": "executed", "approval": approval, "execution": approval.get("result_payload") or {}}
    if current_status in {"rejected", "failed"}:
        return {"status": current_status, "approval": approval}
    gateway_id = str(registration.get("gateway_id") or "").strip()
    retrying_approved_execution = (
        current_status == "approved"
        and normalized_decision == "approved"
        and int(approval.get("retry_count") or 0) > 0
    )
    if retrying_approved_execution and int(approval.get("retry_count") or 0) >= _max_gateway_approval_retries():
        _enforce_gateway_approval_transition(
            operation="fail_gateway_tool_approval",
            registration=registration,
            approval_id=approval_id,
            run_id=str(approval.get("run_id") or "").strip(),
            trace_id=str(approval.get("trace_id") or "").strip(),
            capability_id=str(approval.get("capability_id") or "").strip(),
            status="failed",
            decision="retry_exhausted",
            payload={"retry_count": int(approval.get("retry_count") or 0)},
        )
        failed = gateway_state_repository.update_gateway_action_approval_decision(
            approval_id=approval_id,
            gateway_id=gateway_id,
            status="failed",
            decision="retry_exhausted",
            actor="system",
            note="Gateway approval retry limit exceeded. Request a new approval before retrying.",
        ) or approval
        return {
            "status": "retry_exhausted",
            "retryable": False,
            "error": "Gateway approval retry limit exceeded. Request a new approval before retrying.",
            "approval": failed,
        }
    if current_status == "approved" and not retrying_approved_execution:
        return {"status": current_status, "approval": approval}

    resolved_actor = str(actor or "").strip() or "user"
    _enforce_gateway_approval_action_decision(
        registration=registration,
        approval_id=approval_id,
        run_id=str(approval.get("run_id") or "").strip(),
        trace_id=str(approval.get("trace_id") or "").strip(),
        capability_id=str(approval.get("capability_id") or "").strip(),
        request_id=str(approval.get("request_id") or "").strip(),
        actor_role="owner",
    )

    # --- TTL enforcement ---
    if not retrying_approved_execution and _approval_expired(approval, approval_ttl_seconds):
        _enforce_gateway_approval_transition(
            operation="expire_gateway_tool_approval",
            registration=registration,
            approval_id=approval_id,
            run_id=str(approval.get("run_id") or "").strip(),
            trace_id=str(approval.get("trace_id") or "").strip(),
            capability_id=str(approval.get("capability_id") or "").strip(),
            status="rejected",
            decision="expired",
            payload={"approval_ttl_seconds": int(approval_ttl_seconds or 900)},
        )
        expired_resolved = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=approval_id,
            gateway_id=gateway_id,
            decision="rejected",
            actor="system",
            note="Approval request expired.",
        )
        if expired_resolved:
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=None,
                direction="system",
                frame_kind="event",
                message_type="gateway.approval.rejected",
                payload={"approval": expired_resolved},
            )
            await gateway_activity_service.emit_gateway_approval_resolved(
                registration,
                _redact_approval_for_log(expired_resolved),
                decision="rejected",
                note="Approval request expired.",
            )
        return {
            "status": "expired",
            "approval": expired_resolved or approval,
        }

    if retrying_approved_execution:
        resolved = approval
    else:
        # --- Atomic resolution: first writer wins ---
        _enforce_gateway_approval_transition(
            operation="resolve_gateway_tool_approval",
            registration=registration,
            approval_id=approval_id,
            run_id=str(approval.get("run_id") or "").strip(),
            trace_id=str(approval.get("trace_id") or "").strip(),
            capability_id=str(approval.get("capability_id") or "").strip(),
            status=normalized_decision,
            decision=normalized_decision,
            payload={"actor": resolved_actor, "note_present": bool(note)},
        )
        resolved = gateway_state_repository.resolve_gateway_action_approval_atomic(
            approval_id=approval_id,
            gateway_id=gateway_id,
            decision=normalized_decision,
            actor=resolved_actor,
            note=note,
        )

        if resolved is None:
            # Lost the race — another caller already resolved this approval
            current = gateway_state_repository.get_gateway_action_approval(approval_id) or approval
            current_status = str(current.get("status") or "").strip().lower()
            if current_status == "executed":
                return {"status": "executed", "approval": current, "execution": current.get("result_payload") or {}}
            return {"status": current_status, "approval": current}

        # --- We won the atomic write ---

    if normalized_decision == "rejected":
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=None,
            direction="system",
            frame_kind="event",
            message_type="gateway.approval.rejected",
            payload={"approval": resolved},
        )
        await gateway_activity_service.emit_gateway_approval_resolved(
            registration,
            _redact_approval_for_log(resolved),
            decision="rejected",
            note=note,
        )
        return {"status": "rejected", "approval": resolved}

    # --- Approval won — emit side effects and execute ---
    if not retrying_approved_execution:
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=None,
            direction="system",
            frame_kind="event",
            message_type="gateway.approval.approved",
            payload={"approval": resolved},
        )
        await gateway_activity_service.emit_gateway_approval_resolved(
            registration,
            _redact_approval_for_log(resolved),
            decision="approved",
            note=note,
        )

    request_payload = dict(resolved.get("request_payload") or {})
    execute_kwargs = {
        "gateway_id": gateway_id,
        "capability_id": str(request_payload.get("capability_id") or resolved.get("capability_id") or "").strip(),
        "arguments": dict(request_payload.get("arguments") or {}),
        "run_id": str(request_payload.get("run_id") or resolved.get("run_id") or "").strip(),
        "trace_id": str(request_payload.get("trace_id") or resolved.get("trace_id") or "").strip(),
        "workspace_id": str(registration.get("workspace_id") or "").strip(),
        "timeout_seconds": int(timeout_seconds or 15),
        "request_id": str(request_payload.get("request_id") or resolved.get("request_id") or "").strip() or None,
    }
    if execute_fn is gateway_execution_service.execute_tool_via_gateway:
        execute_kwargs["runtime_access_mode"] = str(request_payload.get("runtime_access_mode") or "").strip() or None
        execute_kwargs["empyralis_approved"] = True
        if _is_personal_channel_send_capability(str(execute_kwargs.get("capability_id") or "")):
            execute_fn = _execute_personal_channel_send_approval
    try:
        execution = await execute_fn(**execute_kwargs)
    except (asyncio.TimeoutError, TimeoutError, RuntimeError, ValueError) as exc:
        _enforce_gateway_approval_transition(
            operation="fail_gateway_tool_approval",
            registration=registration,
            approval_id=approval_id,
            run_id=str(resolved.get("run_id") or "").strip(),
            trace_id=str(resolved.get("trace_id") or "").strip(),
            capability_id=str(resolved.get("capability_id") or "").strip(),
            status="failed",
            decision="execution_failed",
            payload={"error": str(exc)},
        )
        failed = gateway_state_repository.mark_gateway_action_approval_execution_failed(
            approval_id=approval_id,
            gateway_id=gateway_id,
            error_message=str(exc),
        ) or resolved
        if int(failed.get("retry_count") or 0) >= _max_gateway_approval_retries():
            _enforce_gateway_approval_transition(
                operation="fail_gateway_tool_approval",
                registration=registration,
                approval_id=approval_id,
                run_id=str(failed.get("run_id") or "").strip(),
                trace_id=str(failed.get("trace_id") or "").strip(),
                capability_id=str(failed.get("capability_id") or "").strip(),
                status="failed",
                decision="retry_exhausted",
                payload={"retry_count": int(failed.get("retry_count") or 0)},
            )
            exhausted = gateway_state_repository.update_gateway_action_approval_decision(
                approval_id=approval_id,
                gateway_id=gateway_id,
                status="failed",
                decision="retry_exhausted",
                actor="system",
                note="Gateway approval retry limit exceeded. Request a new approval before retrying.",
            ) or failed
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=None,
                direction="system",
                frame_kind="event",
                message_type="gateway.approval.retry_exhausted",
                payload={"approval": exhausted, "error": str(exc)},
            )
            await gateway_activity_service.append_gateway_activity(
                registration,
                action="gateway_tool_retry_exhausted",
                title="Gateway tool retry limit reached",
                summary="Gateway approval retry limit exceeded. Request a new approval before retrying.",
                status="failed",
                event_class="blocked_action",
                review_required=True,
                payload={"approval_id": approval_id, "error": str(exc), "approval": exhausted},
                metadata={"approval_id": approval_id},
                trace_id=str(exhausted.get("trace_id") or "").strip() or None,
            )
            return {
                "status": "retry_exhausted",
                "retryable": False,
                "error": "Gateway approval retry limit exceeded. Request a new approval before retrying.",
                "approval": exhausted,
            }
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
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

    _enforce_gateway_approval_transition(
        operation="execute_gateway_tool_approval",
        registration=registration,
        approval_id=approval_id,
        run_id=str(resolved.get("run_id") or "").strip(),
        trace_id=str(resolved.get("trace_id") or "").strip(),
        capability_id=str(resolved.get("capability_id") or "").strip(),
        status="executed",
        decision="executed",
        payload={"execution_status": str(execution.get("status") if isinstance(execution, dict) else "completed")},
    )
    executed = gateway_state_repository.mark_gateway_action_approval_executed(
        approval_id=approval_id,
        gateway_id=gateway_id,
        result_payload=execution,
    ) or resolved
    gateway_state_repository.record_gateway_event(
        gateway_id=gateway_id,
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
        summary=f"Executed {resolved.get('capability_id')} through the paired gateway.",
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
