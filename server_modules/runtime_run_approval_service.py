from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def submit_run_decision(
    run_id: str,
    *,
    run: dict[str, Any] | None,
    payload: Any,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    approval_correlation_id: Callable[[str], str] | Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    if not isinstance(run, dict):
        raise HTTPException(404, "Run ID not found")
    snapshot = serialize_run_snapshot(run_id, run)
    enforce_run_owner_access(current_user, snapshot)
    pending = get_pending_confirmation(run)
    approval_id = str(pending.get("approval_id") or "").strip() if isinstance(pending, dict) else ""
    correlation_id = str(pending.get("correlation_id") or "").strip() if isinstance(pending, dict) else ""
    context = run.get("context")
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    decision_text = str(payload.decision or "").strip().lower()
    note_text = str(payload.note or "")
    if approval_id and (
        bool(metadata.get("local_execution_waiting_confirmation"))
        or bool(metadata.get("local_execution_waiting_approval"))
    ):
        return resolve_local_execution_start_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            note_text,
        )
    if approval_id:
        append_approval_audit(
            approval_id=approval_id,
            stage="decision_submitted",
            decision=decision_text,
            actor="user",
            source="runs_decision_api",
            run_id=run_id,
            note=note_text,
            correlation_id=correlation_id or approval_correlation_id(approval_id, run_id=run_id),
            metadata={"scope": "once", "reusable": False},
        )
        run["input_queue"].put({"approval_id": approval_id, "decision": payload.decision, "note": payload.note})
        return {
            "status": "ok",
            "approval_id": approval_id,
            "correlation_id": correlation_id or None,
            "scope": "once",
            "reusable": False,
            "consequence": "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.",
        }
    run["input_queue"].put(payload.decision)
    return {"status": "ok", "approval_id": None}


def resolve_run_approval(
    run_id: str,
    approval_id: str,
    *,
    run: dict[str, Any] | None,
    payload: Any,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    set_pending_confirmation: Callable[[dict[str, Any], dict[str, Any]], None],
    parse_utc_ts: Callable[[Any], Any],
    utc_now: Callable[[], Any],
    utc_now_iso: Callable[[], str],
    approval_correlation_id: Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    run_thread_is_alive: Callable[[dict[str, Any]], bool],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")
    snapshot = serialize_run_snapshot(run_id, run)
    enforce_run_owner_access(current_user, snapshot)
    pending = get_pending_confirmation(run)
    if not isinstance(pending, dict):
        raise HTTPException(status_code=409, detail="No pending confirmation for this run.")
    expected = str(pending.get("approval_id") or "").strip()
    if expected != approval_id:
        raise HTTPException(status_code=409, detail="approval_id does not match pending confirmation.")
    decision_text = str(payload.decision or "").strip().lower()
    context = run.get("context")
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    if bool(metadata.get("local_execution_waiting_confirmation")) or bool(metadata.get("local_execution_waiting_approval")):
        return resolve_local_execution_start_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            str(payload.note or ""),
        )
    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    approved = decision_text in approve_tokens
    escalated = decision_text in escalate_tokens
    rejected = decision_text in reject_tokens or (not approved and not escalated)
    correlation_id = str(pending.get("correlation_id") or "").strip() or approval_correlation_id(approval_id, run_id=run_id)
    expires_at = parse_utc_ts(pending.get("expires_at"))
    if expires_at is not None and utc_now() > expires_at:
        pending["status"] = "expired"
        pending["expired_at"] = utc_now_iso()
        set_pending_confirmation(run, pending)
        raise HTTPException(status_code=409, detail="Confirmation request has already expired.")
    run["input_queue"].put(
        {
            "approval_id": approval_id,
            "decision": payload.decision,
            "note": payload.note,
        }
    )
    append_approval_audit(
        approval_id=approval_id,
        stage="decision_submitted",
        decision=("approved" if approved else "escalated" if escalated else "rejected"),
        actor="user",
        source="runs_approval_api",
        run_id=run_id,
        note=str(payload.note or ""),
        correlation_id=correlation_id,
        metadata={
            "raw_decision": decision_text,
            "approved": bool(approved),
            "rejected": bool(rejected),
            "escalated": bool(escalated),
            "scope": "once",
            "reusable": False,
        },
    )
    if not run_thread_is_alive(run) and str(run.get("status") or "").strip().lower() == "waiting_for_input":
        pending["status"] = "resolved"
        pending["resolved_at"] = utc_now_iso()
        pending["decision"] = decision_text
        pending["note"] = str(payload.note or "")
        set_pending_confirmation(run, pending)
        emit_log(
            run["logs"],
            "info" if approved else "warn",
            "Confirmation recorded. Restored run is resuming.",
            event="approval_resume_scheduled",
            data={
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "scope": "once",
                "reusable": False,
            },
        )
        schedule_restored_run_resume(run_id, run)
    return {
        "status": "ok",
        "run_id": run_id,
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "decision_kind": ("approved" if approved else "escalated" if escalated else "rejected"),
        "scope": "once",
        "reusable": False,
        "consequence": "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.",
    }
