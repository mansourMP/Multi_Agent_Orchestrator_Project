from __future__ import annotations

import threading
from types import SimpleNamespace
from typing import Any, Callable

from fastapi import HTTPException
from server_modules import run_state_repository


_APPROVAL_RESOLUTION_GUARD_LOCK = threading.Lock()
_APPROVAL_RESOLUTION_GUARDS: dict[str, threading.Lock] = {}


def _approval_resolution_guard(approval_id: str) -> threading.Lock:
    token = str(approval_id or "").strip()
    with _APPROVAL_RESOLUTION_GUARD_LOCK:
        lock = _APPROVAL_RESOLUTION_GUARDS.get(token)
        if lock is None:
            lock = threading.Lock()
            _APPROVAL_RESOLUTION_GUARDS[token] = lock
        return lock


def build_submit_run_decision_callbacks(
    *,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    approval_correlation_id: Callable[[str], str] | Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    return {
        "serialize_run_snapshot": serialize_run_snapshot,
        "enforce_run_owner_access": enforce_run_owner_access,
        "get_pending_confirmation": get_pending_confirmation,
        "approval_correlation_id": approval_correlation_id,
        "append_approval_audit": append_approval_audit,
        "resolve_local_execution_start_approval": resolve_local_execution_start_approval,
        "emit_security_audit_event": emit_security_audit_event,
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
    ensure_live_run_handle: Callable[[str, dict[str, Any]], dict[str, Any] | None] = lambda _run_id, _run_record: None,
    emit_security_audit_event: Callable[..., Any] | None = None,
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
            "ensure_live_run_handle": ensure_live_run_handle,
            "emit_security_audit_event": emit_security_audit_event,
        }
    )
    return callbacks


def submit_run_decision(
    run_id: str,
    *,
    run: dict[str, Any] | None,
    run_record: dict[str, Any] | None = None,
    payload: Any,
    current_user: Any,
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    get_pending_confirmation: Callable[[dict[str, Any]], Any],
    approval_correlation_id: Callable[[str], str] | Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    snapshot_run = run if isinstance(run, dict) else run_record if isinstance(run_record, dict) else None
    if not isinstance(snapshot_run, dict):
        raise HTTPException(404, "Run ID not found")
    snapshot = serialize_run_snapshot(run_id, snapshot_run)
    enforce_run_owner_access(current_user, snapshot)
    pending = get_pending_confirmation(snapshot_run)
    approval_id = str(pending.get("approval_id") or "").strip() if isinstance(pending, dict) else ""
    correlation_id = str(pending.get("correlation_id") or "").strip() if isinstance(pending, dict) else ""
    context = snapshot_run.get("context")
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    resolved_workspace_id = str(
        snapshot_run.get("workspace_id")
        or (context.get("workspace_id") if isinstance(context, dict) else None)
        or metadata.get("workspace_id")
        or "default"
    ).strip() or "default"
    resolved_tenant_id = str(
        snapshot_run.get("tenant_id")
        or (context.get("tenant_id") if isinstance(context, dict) else None)
        or metadata.get("tenant_id")
        or "default"
    ).strip() or "default"
    decision_text = str(payload.decision or "").strip().lower()
    note_text = str(payload.note or "")
    if approval_id and (
        bool(metadata.get("local_execution_waiting_confirmation"))
        or bool(metadata.get("local_execution_waiting_approval"))
    ):
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        return resolve_local_execution_start_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            note_text,
        )
    if approval_id:
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
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
        if callable(emit_security_audit_event):
            emit_security_audit_event(
                action="approval.decision_submitted",
                tenant_id=resolved_tenant_id,
                workspace_id=resolved_workspace_id,
                current_user=current_user,
                run_id=run_id,
                trace_id=correlation_id or approval_id,
                idempotency_key=f"approval.decision_submitted:{approval_id}:{decision_text}",
                metadata={
                    "approval_id": approval_id,
                    "decision": decision_text,
                    "source": "runs_decision_api",
                    "scope": "once",
                },
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
    if not isinstance(run, dict):
        raise HTTPException(status_code=409, detail="Run is not active in this process.")
    run["input_queue"].put(payload.decision)
    return {"status": "ok", "approval_id": None}


def resolve_run_approval(
    run_id: str,
    approval_id: str,
    *,
    run: dict[str, Any] | None,
    run_record: dict[str, Any] | None = None,
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
    ensure_live_run_handle: Callable[[str, dict[str, Any]], dict[str, Any] | None] = lambda _run_id, _run_record: None,
    emit_security_audit_event: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    snapshot_run = run if isinstance(run, dict) else run_record if isinstance(run_record, dict) else None
    if not isinstance(snapshot_run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")
    snapshot = serialize_run_snapshot(run_id, snapshot_run)
    enforce_run_owner_access(current_user, snapshot)
    pending = get_pending_confirmation(snapshot_run)
    if not isinstance(pending, dict):
        raise HTTPException(status_code=409, detail="No pending confirmation for this run.")
    expected = str(pending.get("approval_id") or "").strip()
    if expected != approval_id:
        raise HTTPException(status_code=409, detail="approval_id does not match pending confirmation.")
    pending_status = str(pending.get("status") or "").strip().lower()
    if pending_status in {"decision_submitted", "resolved", "expired"}:
        raise HTTPException(status_code=409, detail="Confirmation has already been processed for this run.")
    decision_text = str(payload.decision or "").strip().lower()
    context = snapshot_run.get("context")
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    resolved_workspace_id = str(
        snapshot_run.get("workspace_id")
        or (context.get("workspace_id") if isinstance(context, dict) else None)
        or metadata.get("workspace_id")
        or "default"
    ).strip() or "default"
    resolved_tenant_id = str(
        snapshot_run.get("tenant_id")
        or (context.get("tenant_id") if isinstance(context, dict) else None)
        or metadata.get("tenant_id")
        or "default"
    ).strip() or "default"
    if bool(metadata.get("local_execution_waiting_confirmation")) or bool(metadata.get("local_execution_waiting_approval")):
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
        return resolve_local_execution_start_approval(
            run_id,
            run,
            approval_id,
            decision_text,
            str(payload.note or ""),
        )
    pending_metadata = pending.get("metadata") if isinstance(pending.get("metadata"), dict) else {}
    if str(pending_metadata.get("kind") or "").strip() == "local_worker_recovery_resume":
        if not isinstance(run, dict):
            raise HTTPException(status_code=409, detail="Run is not active in this process.")
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
        if isinstance(run, dict):
            set_pending_confirmation(run, pending)
        raise HTTPException(status_code=409, detail="Confirmation request has already expired.")
    active_run = run if isinstance(run, dict) else ensure_live_run_handle(run_id, snapshot_run)
    if not isinstance(active_run, dict):
        raise HTTPException(status_code=409, detail="Run is not active in this process.")
    pending["status"] = "decision_submitted"
    pending["decision_submitted_at"] = utc_now_iso()
    pending["submitted_decision"] = decision_text
    pending["submitted_note"] = str(payload.note or "")
    set_pending_confirmation(active_run, pending)
    active_run["input_queue"].put(
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
    if callable(emit_security_audit_event):
        emit_security_audit_event(
            action="approval.decision_submitted",
            tenant_id=resolved_tenant_id,
            workspace_id=resolved_workspace_id,
            current_user=current_user,
            run_id=run_id,
            trace_id=correlation_id,
            idempotency_key=f"approval.decision_submitted:{approval_id}:{decision_text}",
            metadata={
                "approval_id": approval_id,
                "decision": ("approved" if approved else "escalated" if escalated else "rejected"),
                "raw_decision": decision_text,
                "source": "runs_approval_api",
                "scope": "once",
            },
        )
    if not run_thread_is_alive(active_run) and str(active_run.get("status") or "").strip().lower() == "waiting_for_input":
        pending["status"] = "resolved"
        pending["resolved_at"] = utc_now_iso()
        pending["decision"] = decision_text
        pending["note"] = str(payload.note or "")
        set_pending_confirmation(active_run, pending)
        active_run["_resume_confirmation_token"] = {
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "prompt": str(pending.get("prompt") or "").strip(),
            "decision": decision_text,
            "note": str(payload.note or ""),
            "resolved_at": str(pending.get("resolved_at") or "").strip() or utc_now_iso(),
            "scope": "once",
            "reusable": False,
        }
        emit_log(
            active_run["logs"],
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
        if bool(active_run.get("_defer_resume_until_approval_persisted")):
            active_run["_resume_ready_after_persist"] = bool(approved)
        else:
            schedule_restored_run_resume(run_id, active_run)
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
    resume_run_after_persist_fn: Callable[[str, dict[str, Any]], bool] | None = None,
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

    with _approval_resolution_guard(approval_token):
        matched_run = run_state_repository.sync_find_live_run_by_approval_id(approval_token)
        if (
            (not isinstance(matched_run, dict) or not str(matched_run.get("run_id") or "").strip())
            and isinstance(runs, dict)
        ):
            for candidate_run_id, candidate_run in runs.items():
                if not isinstance(candidate_run, dict):
                    continue
                pending = candidate_run.get("pending_confirmation")
                if not isinstance(pending, dict):
                    pending = candidate_run.get("pending_approval")
                if not isinstance(pending, dict):
                    continue
                if str(pending.get("approval_id") or "").strip() != approval_token:
                    continue
                matched_run = {"run_id": str(candidate_run_id or "").strip(), **candidate_run}
                break
        if not isinstance(matched_run, dict) or not str(matched_run.get("run_id") or "").strip():
            for candidate_run in run_state_repository.sync_list_live_runs():
                if not isinstance(candidate_run, dict):
                    continue
                pending = candidate_run.get("pending_confirmation")
                if not isinstance(pending, dict):
                    pending = candidate_run.get("pending_approval")
                if not isinstance(pending, dict):
                    continue
                if str(pending.get("approval_id") or "").strip() != approval_token:
                    continue
                matched_run = candidate_run
                break
        matched_run_id = str((matched_run or {}).get("run_id") or "").strip() if isinstance(matched_run, dict) else ""
        if not matched_run_id or not isinstance(matched_run, dict):
            raise HTTPException(status_code=404, detail="approval_id not found")
        live_run = runs.get(matched_run_id) if isinstance(runs, dict) else None
        ensure_live_run_handle = resolve_run_approval_callbacks.get("ensure_live_run_handle")
        if not isinstance(live_run, dict) and callable(ensure_live_run_handle):
            live_run = ensure_live_run_handle(matched_run_id, matched_run)
        if isinstance(live_run, dict):
            live_run["_defer_resume_until_approval_persisted"] = True

        result = resolve_run_approval_fn(
            matched_run_id,
            approval_token,
            run=live_run if isinstance(live_run, dict) else None,
            run_record=matched_run,
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
        if (
            resolution == "approved"
            and isinstance(live_run, dict)
            and bool(live_run.pop("_resume_ready_after_persist", False))
            and callable(resume_run_after_persist_fn)
        ):
            live_run.pop("_defer_resume_until_approval_persisted", None)
            response["resumed"] = bool(resume_run_after_persist_fn(matched_run_id, live_run))
        elif isinstance(live_run, dict):
            live_run.pop("_defer_resume_until_approval_persisted", None)
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
