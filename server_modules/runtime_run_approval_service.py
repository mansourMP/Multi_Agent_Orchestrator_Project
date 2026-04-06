from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Callable

from fastapi import HTTPException


def build_submit_run_decision_callbacks(
    *,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    approval_correlation_id: Callable[[str], str] | Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    return {
        "serialize_run_snapshot": serialize_run_snapshot,
        "enforce_run_owner_access": enforce_run_owner_access,
        "get_pending_confirmation": get_pending_confirmation,
        "approval_correlation_id": approval_correlation_id,
        "append_approval_audit": append_approval_audit,
        "resolve_local_execution_start_approval": resolve_local_execution_start_approval,
    }


def build_resolve_run_approval_callbacks(
    *,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    set_pending_confirmation: Callable[[dict[str, Any], dict[str, Any]], None],
    clear_pending_confirmation: Callable[[dict[str, Any]], None],
    parse_utc_ts: Callable[[Any], Any],
    utc_now: Callable[[], Any],
    utc_now_iso: Callable[[], str],
    approval_correlation_id: Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    resolve_local_worker_recovery_approval: Callable[..., dict[str, Any]],
    run_thread_is_alive: Callable[[dict[str, Any]], bool],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> dict[str, Any]:
    callbacks = build_submit_run_decision_callbacks(
        serialize_run_snapshot=serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        get_pending_confirmation=get_pending_confirmation,
        approval_correlation_id=approval_correlation_id,
        append_approval_audit=append_approval_audit,
        resolve_local_execution_start_approval=resolve_local_execution_start_approval,
    )
    callbacks.update(
        {
            "set_pending_confirmation": set_pending_confirmation,
            "clear_pending_confirmation": clear_pending_confirmation,
            "parse_utc_ts": parse_utc_ts,
            "utc_now": utc_now,
            "utc_now_iso": utc_now_iso,
            "resolve_local_worker_recovery_approval": resolve_local_worker_recovery_approval,
            "run_thread_is_alive": run_thread_is_alive,
            "emit_log": emit_log,
            "schedule_restored_run_resume": schedule_restored_run_resume,
        }
    )
    return callbacks


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
    clear_pending_confirmation: Callable[[dict[str, Any]], None],
    parse_utc_ts: Callable[[Any], Any],
    utc_now: Callable[[], Any],
    utc_now_iso: Callable[[], str],
    approval_correlation_id: Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    resolve_local_worker_recovery_approval: Callable[..., dict[str, Any]],
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
    pending_metadata = pending.get("metadata") if isinstance(pending.get("metadata"), dict) else {}
    if str(pending_metadata.get("kind") or "").strip() == "local_worker_recovery_resume":
        return resolve_local_worker_recovery_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            note=str(payload.note or ""),
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


def resolve_standalone_approval(
    approval_id: str,
    *,
    payload: dict[str, Any],
    current_user: Any,
    runs: dict[str, Any],
    resolve_run_approval_fn: Callable[..., dict[str, Any]],
    resolve_run_approval_callbacks: dict[str, Any],
    record_approval_resolution_fn: Callable[..., Any],
    emit_approval_resolved_event_fn: Callable[..., Any],
) -> dict[str, Any]:
    approval_token = str(approval_id or "").strip()
    if not approval_token:
        raise HTTPException(status_code=400, detail="approval_id is required.")
    resolution = str(payload.get("resolution") or "").strip().lower()
    if resolution not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="resolution must be approved or rejected.")
    body_approval_id = str(payload.get("approval_id") or "").strip()
    if body_approval_id and body_approval_id != approval_token:
        raise HTTPException(status_code=400, detail="approval_id in body does not match path.")
    actor = str(payload.get("actor") or "").strip() or "user"
    reason = str(payload.get("reason") or payload.get("note") or "")
    decision = "approve" if resolution == "approved" else "reject"

    matched_run_id = ""
    matched_run: dict[str, Any] | None = None
    for run_id, run in (runs or {}).items():
        if not isinstance(run, dict):
            continue
        pending_confirmation = run.get("pending_confirmation") if isinstance(run.get("pending_confirmation"), dict) else {}
        pending_approval = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
        if str(pending_confirmation.get("approval_id") or "").strip() == approval_token or str(pending_approval.get("approval_id") or "").strip() == approval_token:
            matched_run_id = str(run_id or "").strip()
            matched_run = run
            break
    if not matched_run_id or not isinstance(matched_run, dict):
        raise HTTPException(status_code=404, detail="approval_id not found")

    result = resolve_run_approval_fn(
        matched_run_id,
        approval_token,
        run=matched_run,
        payload=SimpleNamespace(decision=decision, note=reason),
        current_user=current_user,
        **resolve_run_approval_callbacks,
    )
    context = matched_run.get("context") if isinstance(matched_run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    trace_id = str(
        matched_run.get("trace_id")
        or matched_run.get("last_trace_id")
        or context.get("trace_id")
        or metadata.get("trace_id")
        or approval_token
    ).strip()
    tenant_id = str(
        matched_run.get("tenant_id")
        or context.get("tenant_id")
        or metadata.get("tenant_id")
        or "default"
    ).strip() or "default"
    workspace_id = str(
        matched_run.get("workspace_id")
        or context.get("workspace_id")
        or "default"
    ).strip() or "default"
    record_approval_resolution_fn(
        matched_run_id,
        approval_token,
        resolution,
        actor,
        trace_id,
    )
    outbox_event = emit_approval_resolved_event_fn(
        approval_id=approval_token,
        run_id=matched_run_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        resolution=resolution,
        actor=actor,
        reason=reason,
        trace_id=trace_id,
    )
    response = dict(result or {})
    response["run_id"] = matched_run_id
    response["approval_id"] = approval_token
    response["resolution"] = resolution
    response["actor"] = actor
    response["reason"] = reason
    response["outbox_event"] = {
        "event_id": outbox_event.event_id,
        "event_type": outbox_event.event_type,
        "trace_id": outbox_event.trace_id,
        "payload": dict(outbox_event.payload),
    }
    return response
