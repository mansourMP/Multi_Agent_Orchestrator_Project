from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional

from fastapi import HTTPException
from server_modules import machine_lease_service


@dataclass(slots=True)
class WorkerLease:
    worker_id: str
    run_id: str
    lease_id: str
    ttl_seconds: int
    note: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DispatchEnvelope:
    run_id: str
    worker_id: Optional[str]
    payload: Dict[str, Any] = field(default_factory=dict)


def claim_local_run(
    worker_id: str,
    *,
    required_capabilities: Optional[List[str]],
    local_queue_lock: Any,
    pending_run_ids: List[str],
    claimed_runs: Dict[str, Dict[str, Any]],
    worker_registry: Mapping[str, Any],
    runs_by_id: Mapping[str, Any],
    lease_seconds: int,
    cleanup_stale_local_claims_fn: Callable[[], Any],
    ordered_runtime_preferences_for_run_fn: Callable[[Dict[str, Any]], List[str]],
    best_online_preferred_runtime_fn: Callable[[List[str]], Optional[str]],
    required_capabilities_for_run_fn: Callable[[Dict[str, Any]], List[str]],
    normalize_capability_ids_fn: Callable[[Any], List[str]],
    persist_local_runtime_state_fn: Callable[[], Any],
    mark_local_worker_seen_fn: Callable[..., Any],
    now_iso_fn: Callable[[], str],
) -> Optional[str]:
    return machine_lease_service.claim_local_machine_lease(
        worker_id,
        required_capabilities=required_capabilities,
        local_queue_lock=local_queue_lock,
        pending_run_ids=pending_run_ids,
        claimed_runs=claimed_runs,
        worker_registry=worker_registry,
        runs_by_id=runs_by_id,
        lease_seconds=lease_seconds,
        cleanup_stale_local_claims_fn=cleanup_stale_local_claims_fn,
        ordered_runtime_preferences_for_run_fn=ordered_runtime_preferences_for_run_fn,
        best_online_preferred_runtime_fn=best_online_preferred_runtime_fn,
        required_capabilities_for_run_fn=required_capabilities_for_run_fn,
        normalize_capability_ids_fn=normalize_capability_ids_fn,
        persist_local_runtime_state_fn=persist_local_runtime_state_fn,
        mark_local_worker_seen_fn=mark_local_worker_seen_fn,
        now_iso_fn=now_iso_fn,
    )


def heartbeat_local_worker(
    worker_id: str,
    *,
    current_run_id: Optional[str],
    note: Optional[str],
    runs_by_id: Mapping[str, Any],
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    mark_local_worker_seen_fn: Callable[..., Any],
    maybe_emit_local_still_working_fn: Callable[..., bool],
    persist_local_runtime_state_fn: Callable[[], Any],
    utc_now_iso_fn: Callable[[], str],
) -> Dict[str, Any]:
    worker = str(worker_id or "").strip()
    if not worker:
        raise HTTPException(status_code=400, detail="worker_id is required.")

    current_run = str(current_run_id or "").strip()
    note_text = str(note or "").strip()
    mark_local_worker_seen_fn(worker, current_run or None, "busy" if current_run else "idle", note=note_text or None)

    if current_run:
        run = runs_by_id.get(current_run)
        if isinstance(run, dict):
            should_persist = False
            with local_queue_lock:
                claim = claimed_runs.get(current_run)
                if isinstance(claim, dict) and str(claim.get("worker_id") or "") == worker:
                    now_iso = utc_now_iso_fn()
                    claim["last_heartbeat_at"] = now_iso
                    claimed_runs[current_run] = claim
                    run["local_last_heartbeat_at"] = now_iso
                    maybe_emit_local_still_working_fn(current_run, run, claim, note=note_text or None)
                    should_persist = True
            if should_persist:
                persist_local_runtime_state_fn()

    return {
        "status": "ok",
        "worker_id": worker,
        "current_run_id": current_run or None,
        "last_seen_at": utc_now_iso_fn(),
    }


def heartbeat_local_run(
    run_id: str,
    *,
    worker_id: Optional[str],
    note: Optional[str],
    runs_by_id: Mapping[str, Any],
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    maybe_emit_local_still_working_fn: Callable[..., bool],
    mark_local_worker_seen_fn: Callable[..., Any],
    utc_now_iso_fn: Callable[[], str],
) -> Dict[str, Any]:
    run = runs_by_id.get(run_id)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    note_text = str(note or "").strip()
    incoming_worker = str(worker_id or "").strip()
    with local_queue_lock:
        claim = claimed_runs.get(run_id)
        if not isinstance(claim, dict):
            raise HTTPException(status_code=409, detail="Run is not claimed by a local companion.")
        if incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or str(claim.get("worker_id") or "").strip()
        now_iso = utc_now_iso_fn()
        claim["last_heartbeat_at"] = now_iso
        maybe_emit_local_still_working_fn(run_id, run, claim, note=note_text or None)
        claimed_runs[run_id] = claim

    run["local_last_heartbeat_at"] = now_iso
    if resolved_worker:
        mark_local_worker_seen_fn(resolved_worker, run_id, "busy", note=note_text or None)
    return {"status": "ok", "run_id": run_id, "last_heartbeat_at": now_iso}


def complete_local_run(
    run_id: str,
    *,
    worker_id: Optional[str],
    result_text: Optional[str],
    result_data: Optional[Dict[str, Any]],
    usage_masked: Optional[Dict[str, Any]],
    runs_by_id: Mapping[str, Any],
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    emit_log_fn: Callable[..., Any],
    mark_local_worker_seen_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
    persist_run_memory_fn: Callable[[str, Dict[str, Any]], Any],
) -> Dict[str, Any]:
    run = runs_by_id.get(run_id)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    with local_queue_lock:
        claim = claimed_runs.get(run_id)
        incoming_worker = str(worker_id or "").strip()
        if isinstance(claim, dict) and incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or (
            str(claim.get("worker_id") or "").strip() if isinstance(claim, dict) else ""
        )

    status = str(run.get("status") or "").strip().lower()
    if status in {"completed", "failed", "timeout"}:
        return {"status": "ok", "run_id": run_id, "already_terminal": True}

    if isinstance(result_data, dict):
        run["result_data"] = result_data
    if isinstance(usage_masked, dict):
        run["usage_masked"] = usage_masked

    resolved_text = str(result_text or "").strip()
    if not resolved_text and isinstance(result_data, dict):
        resolved_text = str(result_data.get("summary") or "").strip()
    if not resolved_text:
        resolved_text = "Local companion run completed."
    run["result"] = resolved_text

    emit_log_fn(run["logs"], "info", resolved_text, event="local_result", data=result_data if isinstance(result_data, dict) else None)
    emit_log_fn(run["logs"], "info", "Run completed by Local Companion.", event="run_complete")
    if resolved_worker:
        mark_local_worker_seen_fn(resolved_worker, None, "idle", note="completed_run")
    set_run_status_fn(run_id, "completed")
    try:
        persist_run_memory_fn(run_id, run)
    except Exception:
        pass
    run["logs"].put(None)
    return {"status": "ok", "run_id": run_id}


def pause_local_run(
    run_id: str,
    *,
    worker_id: Optional[str],
    result_text: Optional[str],
    result_data: Optional[Dict[str, Any]],
    browser_checkpoint: Optional[Dict[str, Any]],
    wait_reason: Optional[str],
    runs_by_id: Mapping[str, Any],
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    emit_log_fn: Callable[..., Any],
    mark_local_worker_seen_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
    persist_local_runtime_state_fn: Callable[[], Any],
) -> Dict[str, Any]:
    run = runs_by_id.get(run_id)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    release = machine_lease_service.release_machine_lease_claim(
        run_id,
        worker_id=worker_id,
        local_queue_lock=local_queue_lock,
        claimed_runs=claimed_runs,
        persist_local_runtime_state_fn=persist_local_runtime_state_fn,
        mark_local_worker_seen_fn=mark_local_worker_seen_fn,
        status_hint="idle",
        note="paused_waiting_for_input",
    )
    resolved_worker = str(release.get("resolved_worker") or "").strip()

    if isinstance(result_data, dict):
        run["result_data"] = result_data
    if isinstance(browser_checkpoint, dict):
        run["browser_checkpoint"] = browser_checkpoint
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        metadata["browser_checkpoint"] = browser_checkpoint
        metadata["browser_resume_supported"] = True
        context["metadata"] = metadata
        run["context"] = context

    resolved_text = str(result_text or "").strip()
    if not resolved_text and isinstance(result_data, dict):
        resolved_text = str(result_data.get("summary") or "").strip()
    if not resolved_text:
        resolved_text = "Local companion paused and is waiting for human input."
    run["result"] = resolved_text
    machine_lease_service.clear_active_machine_lease_binding(run)
    run.pop("_resume_after_confirmation_scheduled", None)

    resolved_wait_reason = str(wait_reason or "").strip() or "human_unblock_required"
    emit_log_fn(
        run["logs"],
        "warn",
        resolved_text,
        event="local_pause_required",
        data={
            "run_id": run_id,
            "wait_reason": resolved_wait_reason,
            "session_profile": browser_checkpoint.get("session_profile") if isinstance(browser_checkpoint, dict) else None,
            "next_action_index": browser_checkpoint.get("next_action_index") if isinstance(browser_checkpoint, dict) else None,
        },
    )
    set_run_status_fn(run_id, "waiting_for_input")
    return {"status": "ok", "run_id": run_id, "waiting_for_input": True}


def fail_local_run(
    run_id: str,
    *,
    worker_id: Optional[str],
    error: Optional[str],
    runs_by_id: Mapping[str, Any],
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    emit_log_fn: Callable[..., Any],
    mark_local_worker_seen_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
) -> Dict[str, Any]:
    run = runs_by_id.get(run_id)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    with local_queue_lock:
        claim = claimed_runs.get(run_id)
        incoming_worker = str(worker_id or "").strip()
        if isinstance(claim, dict) and incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or (
            str(claim.get("worker_id") or "").strip() if isinstance(claim, dict) else ""
        )

    status = str(run.get("status") or "").strip().lower()
    if status in {"completed", "failed", "timeout"}:
        return {"status": "ok", "run_id": run_id, "already_terminal": True}

    message = str(error or "").strip() or "Local companion run failed."
    emit_log_fn(run["logs"], "error", message[:1200], event="run_error")
    if resolved_worker:
        mark_local_worker_seen_fn(resolved_worker, None, "idle", note="failed_run")
    set_run_status_fn(run_id, "failed")
    run["logs"].put(None)
    return {"status": "ok", "run_id": run_id}
