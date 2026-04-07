from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def local_worker_recovery_confirmation_required(run: dict[str, Any]) -> bool:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return bool(metadata.get("local_worker_recovery_manual_confirmation_required"))


def local_worker_recovery_confirmation_prompt(run: dict[str, Any]) -> str:
    checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    attempt_count = int(metadata.get("local_worker_recovery_attempt_count") or 0)
    max_auto_retries = int(metadata.get("local_worker_recovery_max_auto_retries") or attempt_count or 1)
    next_action_index = checkpoint.get("next_action_index")
    session_profile = str(checkpoint.get("session_profile") or "").strip()
    details = [
        "Local companion recovery exhausted its automatic retry budget after repeated worker loss.",
        "Approve only if you want to try resuming this unstable local checkpoint again.",
    ]
    if attempt_count > 0:
        details.append(f"Recovery attempts used: {attempt_count}/{max_auto_retries}.")
    if next_action_index is not None:
        details.append(f"Checkpoint next action index: {next_action_index}.")
    if session_profile:
        details.append(f"Session profile: {session_profile}.")
    return " ".join(details)


def build_resume_waiting_run_callbacks(
    *,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    begin_run_pending_confirmation: Callable[..., dict[str, Any]],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    return {
        "serialize_run_snapshot": serialize_run_snapshot,
        "enforce_run_owner_access": enforce_run_owner_access,
        "get_pending_confirmation": get_pending_confirmation,
        "begin_run_pending_confirmation": begin_run_pending_confirmation,
        "emit_log": emit_log,
        "schedule_restored_run_resume": schedule_restored_run_resume,
    }


def build_local_worker_recovery_approval_callbacks(
    *,
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    clear_pending_confirmation: Callable[[dict[str, Any]], None],
    approval_correlation_id: Callable[..., str],
    utc_now_iso: Callable[[], str],
    emit_log: Callable[..., None],
    append_approval_audit: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    return {
        "get_pending_confirmation": get_pending_confirmation,
        "clear_pending_confirmation": clear_pending_confirmation,
        "approval_correlation_id": approval_correlation_id,
        "utc_now_iso": utc_now_iso,
        "emit_log": emit_log,
        "append_approval_audit": append_approval_audit,
        "schedule_restored_run_resume": schedule_restored_run_resume,
    }


def resolve_local_worker_recovery_approval(
    run_id: str,
    run: dict[str, Any],
    approval_id: str,
    decision_text: str,
    *,
    note: str = "",
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    clear_pending_confirmation: Callable[[dict[str, Any]], None],
    approval_correlation_id: Callable[..., str],
    utc_now_iso: Callable[[], str],
    emit_log: Callable[..., None],
    append_approval_audit: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    pending = get_pending_confirmation(run)
    correlation_id = str(pending.get("correlation_id") or "").strip() or approval_correlation_id(approval_id, run_id=run_id)
    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    approved = decision_text in approve_tokens
    escalated = decision_text in escalate_tokens
    rejected = decision_text in reject_tokens or (not approved and not escalated)
    scope_value = "once"
    consequence = "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again."

    append_approval_audit(
        approval_id=approval_id,
        stage="received",
        decision=decision_text,
        actor="user",
        source="local_worker_recovery_resume",
        run_id=run_id,
        note=note,
        correlation_id=correlation_id,
        metadata={"scope": scope_value, "reusable": False},
    )

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    metadata["local_worker_recovery_manual_confirmation_resolved_at"] = utc_now_iso()
    context["metadata"] = metadata
    run["context"] = context
    clear_pending_confirmation(run)

    checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}

    if approved:
        emit_log(
            run["logs"],
            "warn",
            "Manual recovery confirmation received after repeated local worker instability. Resuming checkpoint.",
            event="local_worker_recovery_manual_resume_approved",
            data={
                "run_id": run_id,
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "attempt_count": int(metadata.get("local_worker_recovery_attempt_count") or 0),
                "next_action_index": checkpoint.get("next_action_index"),
                "session_profile": checkpoint.get("session_profile"),
            },
        )
        append_approval_audit(
            approval_id=approval_id,
            stage="resolved",
            decision="approved",
            actor="runtime",
            source="local_worker_recovery_resume",
            run_id=run_id,
            correlation_id=correlation_id,
            metadata={"scope": scope_value, "reusable": False},
        )
        metadata["local_worker_recovery_manual_confirmation_required"] = True
        context["metadata"] = metadata
        run["context"] = context
        if not schedule_restored_run_resume(run_id, run):
            raise HTTPException(status_code=409, detail="Run could not be resumed.")
        metadata["local_worker_recovery_manual_confirmation_required"] = False
        context["metadata"] = metadata
        run["context"] = context
        return {
            "status": "ok",
            "run_id": run_id,
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision_kind": "approved",
            "scope": scope_value,
            "reusable": False,
            "consequence": consequence,
        }

    run["result"] = (
        "Manual checkpoint recovery was not approved after repeated local worker instability."
    )
    run["result_data"] = {
        "summary": run["result"],
        "error": "local_worker_recovery_manual_resume_declined",
        "resume_available": True,
        "manual_confirmation_required": True,
        "decision": "escalated" if escalated else "rejected",
        "attempt_count": int(metadata.get("local_worker_recovery_attempt_count") or 0),
        "next_action_index": checkpoint.get("next_action_index"),
        "session_profile": checkpoint.get("session_profile"),
    }
    metadata["local_worker_recovery_manual_confirmation_required"] = True
    context["metadata"] = metadata
    run["context"] = context
    emit_log(
        run["logs"],
        "warn",
        "Manual checkpoint recovery was not approved after repeated local worker instability.",
        event="local_worker_recovery_manual_resume_declined",
        data={
            "run_id": run_id,
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision": "escalated" if escalated else "rejected",
            "attempt_count": int(metadata.get("local_worker_recovery_attempt_count") or 0),
        },
    )
    append_approval_audit(
        approval_id=approval_id,
        stage="resolved",
        decision="escalated" if escalated else "rejected",
        actor="runtime",
        source="local_worker_recovery_resume",
        run_id=run_id,
        correlation_id=correlation_id,
        metadata={"scope": scope_value, "reusable": False},
    )
    return {
        "status": "ok",
        "run_id": run_id,
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "decision_kind": "escalated" if escalated else "rejected",
        "scope": scope_value,
        "reusable": False,
        "consequence": consequence,
    }


def resume_waiting_run(
    run_id: str,
    *,
    run: dict[str, Any] | None,
    run_record: dict[str, Any] | None = None,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    begin_run_pending_confirmation: Callable[..., dict[str, Any]],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    snapshot_run = run if isinstance(run, dict) else run_record if isinstance(run_record, dict) else None
    if not isinstance(snapshot_run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")
    snapshot = serialize_run_snapshot(run_id, snapshot_run)
    enforce_run_owner_access(current_user, snapshot)
    if str(snapshot_run.get("status") or "").strip().lower() != "waiting_for_input":
        raise HTTPException(status_code=409, detail="Run is not waiting for input.")
    pending_confirmation = get_pending_confirmation(snapshot_run)
    if isinstance(pending_confirmation, dict) and pending_confirmation:
        raise HTTPException(status_code=409, detail="Run requires confirmation resolution, not direct resume.")
    checkpoint = snapshot_run.get("browser_checkpoint") if isinstance(snapshot_run.get("browser_checkpoint"), dict) else {}
    if not checkpoint:
        raise HTTPException(status_code=409, detail="Run does not have a resumable browser checkpoint.")
    if local_worker_recovery_confirmation_required(snapshot_run):
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        pending = begin_run_pending_confirmation(
            run_id,
            local_worker_recovery_confirmation_prompt(snapshot_run),
            source="local_worker_recovery_resume",
            metadata={
                "kind": "local_worker_recovery_resume",
                "reason": "local_worker_recovery_exhausted",
                "next_action_index": checkpoint.get("next_action_index"),
                "session_profile": checkpoint.get("session_profile"),
            },
        )
        return {
            "status": "confirmation_required",
            "run_id": run_id,
            "approval_id": pending.get("approval_id"),
            "correlation_id": pending.get("correlation_id"),
            "resume_kind": "browser_checkpoint",
            "degradation_kind": "local_worker_recovery_exhausted",
        }
    if not isinstance(run, dict):
        raise HTTPException(status_code=409, detail="Run is not active in this process.")
    emit_log(
        run["logs"],
        "info",
        "Resume requested for paused browser operator run.",
        event="browser_resume_requested",
        data={
            "run_id": run_id,
            "next_action_index": checkpoint.get("next_action_index"),
            "session_profile": checkpoint.get("session_profile"),
        },
    )
    if not schedule_restored_run_resume(run_id, run):
        raise HTTPException(status_code=409, detail="Run could not be resumed.")
    return {
        "status": "ok",
        "run_id": run_id,
        "resume_kind": "browser_checkpoint",
        "next_action_index": checkpoint.get("next_action_index"),
    }
