"""
Local worker queue and heartbeat logic.
Extracted from server.py to reduce hotspot size.
"""

from __future__ import annotations

import hashlib
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from server_modules import machine_lease_service, outbox_service, worker_dispatch_service

_server = None
LOCAL_RUN_STILL_WORKING_INTERVAL_SECONDS = 15
LOCAL_RUN_WORKER_LOST_TIMEOUT_SECONDS = 30
LOCAL_RUNTIME_WATCHDOG_INTERVAL_SECONDS = 5
LOCAL_CHECKPOINT_RECOVERY_MAX_AUTO_RETRIES = 3
LOCAL_CHECKPOINT_RECOVERY_BACKOFF_SECONDS = [0, 10, 30]
_COLD_BOOT_RECOVERY_DONE = False
_LOCAL_RUNTIME_WATCHDOG_LOCK = threading.Lock()
_LOCAL_RUNTIME_WATCHDOG_STATE: Dict[str, Any] = {
    "running": False,
    "interval_seconds": LOCAL_RUNTIME_WATCHDOG_INTERVAL_SECONDS,
    "last_checked_at": None,
    "last_status": "idle",
    "last_summary": "Local runtime watchdog not started yet.",
    "last_cleaned_count": 0,
    "last_cleaned_run_ids": [],
    "last_resumed_count": 0,
    "last_resumed_run_ids": [],
}


def _init():
    global _server
    if _server is not None:
        return
    import server as _s
    _server = _s


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------


class LocalRunClaimRequest(BaseModel):
    worker_id: Optional[str] = None
    required_capabilities: List[str] = Field(default_factory=list)


class LocalRunHeartbeatPayload(BaseModel):
    worker_id: Optional[str] = None
    note: Optional[str] = None


class LocalWorkerHeartbeatPayload(BaseModel):
    current_run_id: Optional[str] = None
    note: Optional[str] = None


class LocalRunCompletePayload(BaseModel):
    worker_id: Optional[str] = None
    result_text: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    usage_masked: Optional[Dict[str, Any]] = None


class LocalRunPausePayload(BaseModel):
    worker_id: Optional[str] = None
    result_text: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    browser_checkpoint: Optional[Dict[str, Any]] = None
    wait_reason: Optional[str] = None


class LocalRunFailPayload(BaseModel):
    worker_id: Optional[str] = None
    error: str


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _worker_online_window_seconds(lease_seconds: Optional[int] = None) -> int:
    _init()
    effective_lease = int(lease_seconds or _server.ORION_LOCAL_LEASE_SECONDS)
    return max(20, effective_lease * 2)


def _mark_local_worker_seen(worker_id: str, current_run_id: Optional[str], status_hint: str, note: Optional[str] = None):
    _init()
    worker = str(worker_id or "").strip()
    if not worker:
        return
    now_iso = _server._utc_now_iso()
    with _server.LOCAL_QUEUE_LOCK:
        previous = _server.LOCAL_WORKER_REGISTRY.get(worker) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker), dict) else {}
        next_record = machine_lease_service.build_machine_presence_record(
            previous_record=previous,
            machine_id=worker,
            current_run_id=current_run_id,
            status_hint=status_hint,
            lease_seconds=_server.ORION_LOCAL_LEASE_SECONDS,
            now_iso=now_iso,
            note=note,
        )
        _server.LOCAL_WORKER_REGISTRY[worker] = next_record
    _persist_local_runtime_state()


def _maybe_emit_local_still_working(
    run_id: str,
    run: Dict[str, Any],
    claim: Dict[str, Any],
    *,
    note: Optional[str] = None,
) -> bool:
    _init()
    now = _server._utc_now()
    last_progress = _server._parse_utc_ts(claim.get("last_progress_event_at")) or _server._parse_utc_ts(claim.get("claimed_at"))
    if last_progress is not None and (now - last_progress).total_seconds() < LOCAL_RUN_STILL_WORKING_INTERVAL_SECONDS:
        return False
    now_iso = _server._utc_now_iso()
    claim["last_progress_event_at"] = now_iso
    run["local_last_progress_at"] = now_iso
    _server.emit_log(
        run["logs"],
        "info",
        str(note or "Still working on your laptop.").strip()[:400],
        event="local_still_working",
        data={"run_id": run_id, "last_progress_at": now_iso},
    )
    return True


def _capability_digest(capabilities: Optional[List[str]]) -> Optional[str]:
    items = [str(item).strip() for item in (capabilities or []) if str(item).strip()]
    if not items:
        return None
    normalized = "\n".join(sorted(set(items)))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _normalize_capability_ids(raw_items: Any) -> List[str]:
    seen = set()
    normalized: List[str] = []
    for item in raw_items or []:
        clean = str(item or "").strip().lower()
        if clean and clean not in seen:
            seen.add(clean)
            normalized.append(clean)
    return normalized


def _normalize_runtime_ids(raw_items: Any) -> List[str]:
    seen = set()
    normalized: List[str] = []
    for item in raw_items or []:
        clean = str(item or "").strip()
        if clean and clean not in seen:
            seen.add(clean)
            normalized.append(clean)
    return normalized


def _persist_local_runtime_state() -> None:
    _init()
    with _server.LOCAL_QUEUE_LOCK:
        pending_run_ids = list(_server.LOCAL_PENDING_RUN_IDS)
        claimed_runs = dict(_server.LOCAL_CLAIMED_RUNS)
        runtime_registrations = dict(_server.LOCAL_WORKER_REGISTRY)
    outbox_service.persist_local_runtime_state(
        db_path=_server.ORION_RUNTIME_STATE_DB,
        pending_run_ids=pending_run_ids,
        claimed_runs=claimed_runs,
        runtime_registrations=runtime_registrations,
    )


def _record_local_runtime_watchdog_status(
    *,
    checked_at: str,
    status: str,
    summary: str,
    cleaned_run_ids: Optional[List[str]] = None,
    resumed_run_ids: Optional[List[str]] = None,
    interval_seconds: Optional[int] = None,
) -> None:
    with _LOCAL_RUNTIME_WATCHDOG_LOCK:
        _LOCAL_RUNTIME_WATCHDOG_STATE.update(
            {
                "running": True,
                "interval_seconds": int(interval_seconds or _LOCAL_RUNTIME_WATCHDOG_STATE.get("interval_seconds") or LOCAL_RUNTIME_WATCHDOG_INTERVAL_SECONDS),
                "last_checked_at": checked_at,
                "last_status": str(status or "ok").strip() or "ok",
                "last_summary": str(summary or "").strip() or "Local runtime watchdog ran.",
                "last_cleaned_count": len(cleaned_run_ids or []),
                "last_cleaned_run_ids": [str(item) for item in (cleaned_run_ids or []) if str(item or "").strip()],
                "last_resumed_count": len(resumed_run_ids or []),
                "last_resumed_run_ids": [str(item) for item in (resumed_run_ids or []) if str(item or "").strip()],
            }
        )


def local_runtime_watchdog_status_snapshot() -> Dict[str, Any]:
    with _LOCAL_RUNTIME_WATCHDOG_LOCK:
        return {
            "running": bool(_LOCAL_RUNTIME_WATCHDOG_STATE.get("running")),
            "interval_seconds": int(_LOCAL_RUNTIME_WATCHDOG_STATE.get("interval_seconds") or LOCAL_RUNTIME_WATCHDOG_INTERVAL_SECONDS),
            "last_checked_at": _LOCAL_RUNTIME_WATCHDOG_STATE.get("last_checked_at"),
            "last_status": _LOCAL_RUNTIME_WATCHDOG_STATE.get("last_status"),
            "last_summary": _LOCAL_RUNTIME_WATCHDOG_STATE.get("last_summary"),
            "last_cleaned_count": int(_LOCAL_RUNTIME_WATCHDOG_STATE.get("last_cleaned_count") or 0),
            "last_cleaned_run_ids": list(_LOCAL_RUNTIME_WATCHDOG_STATE.get("last_cleaned_run_ids") or []),
            "last_resumed_count": int(_LOCAL_RUNTIME_WATCHDOG_STATE.get("last_resumed_count") or 0),
            "last_resumed_run_ids": list(_LOCAL_RUNTIME_WATCHDOG_STATE.get("last_resumed_run_ids") or []),
        }


def _required_capabilities_for_run(run: Dict[str, Any]) -> List[str]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else {}
    return _normalize_capability_ids(precheck.get("capability_ids") if isinstance(precheck, dict) else [])


def _ordered_runtime_preferences_for_run(run: Dict[str, Any]) -> List[str]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    ordered: List[str] = []
    seen = set()
    preferred_runtime_id = str(metadata.get("execution_target_preferred_runtime_id") or "").strip()
    if preferred_runtime_id:
        ordered.append(preferred_runtime_id)
        seen.add(preferred_runtime_id)
    for item in metadata.get("execution_target_matching_runtime_ids") or []:
        clean = str(item or "").strip()
        if clean and clean not in seen:
            seen.add(clean)
            ordered.append(clean)
    return ordered


def _runtime_group_for_run(run: Dict[str, Any]) -> Dict[str, Any]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    matching_runtime_ids = _normalize_runtime_ids(metadata.get("execution_target_matching_runtime_ids") or [])
    preferred_runtime_id = str(metadata.get("execution_target_preferred_runtime_id") or "").strip() or None
    return {
        "matching_runtime_ids": matching_runtime_ids,
        "preferred_runtime_id": preferred_runtime_id,
    }


def _queue_pressure_for_runtime_group(
    queued_run_ids: List[str],
    matching_runtime_ids: List[str],
    preferred_runtime_id: Optional[str],
    *,
    stop_before_run_id: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    if _server is None or getattr(_server, "runs", None) is None:
        return {
            "queued_ahead_count": 0,
            "contender_run_ids": [],
        }
    matching_set = set(_normalize_runtime_ids(matching_runtime_ids))
    preferred_token = str(preferred_runtime_id or "").strip()
    queued_ahead_count = 0
    contender_ids: List[str] = []

    for run_id in queued_run_ids:
        if stop_before_run_id and run_id == stop_before_run_id:
            break
        run = _server.runs.get(run_id)
        if not isinstance(run, dict):
            continue
        group = _runtime_group_for_run(run)
        run_matching = set(group.get("matching_runtime_ids") or [])
        run_preferred = str(group.get("preferred_runtime_id") or "").strip()
        if preferred_token and run_preferred == preferred_token:
            queued_ahead_count += 1
            if len(contender_ids) < 5:
                contender_ids.append(run_id)
            continue
        if matching_set and run_matching and run_matching.intersection(matching_set):
            queued_ahead_count += 1
            if len(contender_ids) < 5:
                contender_ids.append(run_id)

    return {
        "queued_ahead_count": queued_ahead_count,
        "contender_run_ids": contender_ids,
    }


def _capacity_wait_band(queued_ahead_count: int, busy_runtime_count: int) -> str:
    if busy_runtime_count <= 0:
        return "unknown"
    load = queued_ahead_count / max(1, busy_runtime_count)
    if load <= 0.5:
        return "short"
    if load <= 2:
        return "moderate"
    return "long"


def _best_online_preferred_runtime(preferred_runtime_ids: List[str]) -> Optional[str]:
    _init()
    if not preferred_runtime_ids:
        return None
    now = _server._utc_now()
    for runtime_id in preferred_runtime_ids:
        record = _server.LOCAL_WORKER_REGISTRY.get(runtime_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_id), dict) else None
        if not isinstance(record, dict):
            continue
        if not _is_worker_online(record, now):
            continue
        return runtime_id
    return None


def _issue_runtime_session(record: Dict[str, Any]) -> Dict[str, Any]:
    _init()
    return machine_lease_service.issue_machine_session(
        record,
        token_factory=_server.secrets.token_urlsafe,
        hash_token_fn=lambda token: hashlib.sha256(token.encode("utf-8")).hexdigest(),
        issued_at=_server._utc_now_iso(),
    )


def _touch_runtime_session(record: Dict[str, Any]) -> None:
    _init()
    machine_lease_service.touch_machine_session(record, touched_at=_server._utc_now_iso())


def _assert_runtime_session(runtime_id: str, session_token: Optional[str], *, instance_id: Optional[str] = None) -> Dict[str, Any]:
    _init()
    next_record = machine_lease_service.assert_machine_session(
        runtime_id,
        session_token,
        machine_registry=_server.LOCAL_WORKER_REGISTRY,
        machine_registry_lock=_server.LOCAL_QUEUE_LOCK,
        instance_id=instance_id,
        hash_token_fn=lambda token: hashlib.sha256(token.encode("utf-8")).hexdigest(),
        touch_machine_session_fn=_touch_runtime_session,
    )
    _persist_local_runtime_state()
    return next_record


def _upsert_runtime_registration(
    runtime_id: str,
    *,
    runtime_type: str = "local",
    display_name: Optional[str] = None,
    platform: Optional[str] = None,
    policy_mode: Optional[str] = None,
    capabilities: Optional[List[str]] = None,
    execution_targets: Optional[List[str]] = None,
    instance_id: Optional[str] = None,
    capability_digest: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    worker = str(runtime_id or "").strip()
    if not worker:
        return
    with _server.LOCAL_QUEUE_LOCK:
        previous = _server.LOCAL_WORKER_REGISTRY.get(worker) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker), dict) else {}
        record = machine_lease_service.build_runtime_registration_record(
            worker,
            previous_record=previous,
            runtime_type=runtime_type,
            display_name=display_name,
            platform=platform,
            policy_mode=(
                policy_mode
                or previous.get("policy_mode")
                or _server.ORION_RUNTIME_POLICY_MODE_DEFAULT
            ),
            capabilities=capabilities,
            execution_targets=execution_targets,
            instance_id=instance_id,
            capability_digest=capability_digest,
            lease_seconds=_server.ORION_LOCAL_LEASE_SECONDS,
            now_iso=_server._utc_now_iso(),
            normalize_policy_mode_fn=_server.normalize_policy_mode,
            capability_digest_fn=_capability_digest,
        )
        session = _issue_runtime_session(record)
        _server.LOCAL_WORKER_REGISTRY[worker] = record
    _persist_local_runtime_state()
    return {
        "runtime_id": worker,
        "machine_id": record.get("machine_id") or worker,
        "instance_id": record.get("instance_id"),
        "capability_digest": record.get("capability_digest"),
        **session,
    }


def _is_worker_online(record: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    _init()
    ref = now or _server._utc_now()
    seen_at = _server._parse_utc_ts(record.get("last_seen_at"))
    if seen_at is None:
        return False
    lease_seconds = int(record.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS)
    delta = (ref - seen_at).total_seconds()
    return delta <= _worker_online_window_seconds(lease_seconds)


def _cleanup_stale_local_claims() -> List[str]:
    _init()
    def _schedule_restored_run_resume(run_id: str, run: Dict[str, Any]) -> bool:
        try:
            from server_modules import runtime_runs_api

            return bool(runtime_runs_api._schedule_restored_run_resume(run_id, run))
        except Exception:
            return False

    return machine_lease_service.cleanup_stale_machine_leases(
        now=_server._utc_now(),
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        worker_registry=_server.LOCAL_WORKER_REGISTRY,
        runs_by_id=_server.runs,
        parse_utc_ts_fn=_server._parse_utc_ts,
        utc_now_iso_fn=_server._utc_now_iso,
        persist_local_runtime_state_fn=_persist_local_runtime_state,
        emit_log_fn=_server.emit_log,
        set_run_status_fn=_server.set_run_status,
        schedule_restored_run_resume_fn=_schedule_restored_run_resume,
        checkpoint_recovery_max_auto_retries=LOCAL_CHECKPOINT_RECOVERY_MAX_AUTO_RETRIES,
        checkpoint_recovery_backoff_seconds=LOCAL_CHECKPOINT_RECOVERY_BACKOFF_SECONDS,
        local_worker_lost_timeout_seconds=LOCAL_RUN_WORKER_LOST_TIMEOUT_SECONDS,
        default_lease_seconds=_server.ORION_LOCAL_LEASE_SECONDS,
    )


def _resume_due_checkpoint_recoveries() -> List[str]:
    _init()
    now = _server._utc_now()
    resumed_run_ids: List[str] = []
    for run_id, run in list(_server.runs.items()):
        if not isinstance(run, dict):
            continue
        if str(run.get("status") or "").strip().lower() != "waiting_for_input":
            continue
        if bool(run.get("_resume_after_confirmation_scheduled")):
            continue
        checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
        if not checkpoint:
            continue
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        if str(metadata.get("local_worker_recovery_reason") or "").strip().lower() != "worker_lost":
            continue
        if bool(metadata.get("local_worker_recovery_manual_confirmation_required")):
            continue
        if bool(metadata.get("local_worker_recovery_auto_retry_exhausted")):
            continue
        selected_target = str(
            metadata.get("execution_target_selected")
            or metadata.get("execution_target")
            or ""
        ).strip().lower()
        if selected_target not in {"local", "local_companion"}:
            continue
        if isinstance(run.get("pending_confirmation"), dict) and run.get("pending_confirmation"):
            continue
        next_retry_at = _server._parse_utc_ts(metadata.get("local_worker_recovery_next_retry_at"))
        if next_retry_at is not None and now < next_retry_at:
            continue
        try:
            from server_modules import runtime_runs_api

            resumed = bool(runtime_runs_api._schedule_restored_run_resume(run_id, run))
        except Exception:
            resumed = False
        if not resumed:
            continue
        metadata["local_worker_recovery_next_retry_at"] = None
        metadata["local_worker_recovery_backoff_seconds"] = 0
        metadata["local_worker_recovery_last_resume_scheduled_at"] = _server._utc_now_iso()
        context["metadata"] = metadata
        run["context"] = context
        resumed_run_ids.append(run_id)
        log_queue = run.get("logs")
        if log_queue is not None:
            _server.emit_log(
                log_queue,
                "info",
                "Automatic checkpoint recovery resumed after backoff.",
                event="local_resume_scheduled_after_backoff",
                data={
                    "run_id": run_id,
                    "attempt_count": int(metadata.get("local_worker_recovery_attempt_count") or 0),
                    "next_action_index": checkpoint.get("next_action_index"),
                    "session_profile": checkpoint.get("session_profile"),
                },
            )
    return resumed_run_ids


def _apply_cold_boot_checkpoint_recovery_state(run_id: str, run: Dict[str, Any], checkpoint: Dict[str, Any], metadata: Dict[str, Any]) -> str:
    checkpoint_next_action_index = checkpoint.get("next_action_index")
    checkpoint_session_profile = checkpoint.get("session_profile")
    recovery_reason = str(metadata.get("local_worker_recovery_reason") or "").strip().lower()
    attempt_count = int(metadata.get("local_worker_recovery_attempt_count") or 0)
    max_auto_retries = int(
        metadata.get("local_worker_recovery_max_auto_retries")
        or attempt_count
        or LOCAL_CHECKPOINT_RECOVERY_MAX_AUTO_RETRIES
    )
    backoff_seconds = max(0, int(metadata.get("local_worker_recovery_backoff_seconds") or 0))
    next_retry_at = metadata.get("local_worker_recovery_next_retry_at")
    manual_confirmation_required = bool(metadata.get("local_worker_recovery_manual_confirmation_required"))
    auto_retry_exhausted = bool(metadata.get("local_worker_recovery_auto_retry_exhausted"))

    run["status"] = "waiting_for_input"
    machine_lease_service.clear_active_machine_lease_binding(run)
    metadata["browser_resume_supported"] = True
    metadata["resume_ready"] = True
    metadata["cold_boot_recovered"] = True

    if recovery_reason == "worker_lost" and (manual_confirmation_required or auto_retry_exhausted):
        run["result"] = (
            "Local operator recovered after runtime restart. Automatic checkpoint recovery remains paused after repeated worker loss."
        )
        run["result_data"] = {
            "summary": run["result"],
            "error": "local_worker_recovery_exhausted",
            "resume_available": True,
            "manual_confirmation_required": True,
            "attempt_count": attempt_count,
            "max_auto_retries": max_auto_retries,
            "next_action_index": checkpoint_next_action_index,
            "session_profile": checkpoint_session_profile,
        }
        metadata["local_worker_recovery_auto_retry_exhausted"] = True
        metadata["local_worker_recovery_manual_confirmation_required"] = True
        event = "local_cold_boot_recovered_manual_gate"
        message = run["result"]
    elif recovery_reason == "worker_lost":
        delayed_retry = bool(next_retry_at or backoff_seconds > 0)
        run["result"] = (
            "Local operator recovered after runtime restart. Automatic checkpoint recovery remains delayed before retry."
            if delayed_retry
            else "Local operator recovered after runtime restart. Automatic checkpoint recovery remains available."
        )
        run["result_data"] = {
            "summary": run["result"],
            "error": "local_worker_lost_recoverable",
            "resume_available": True,
            "attempt_count": attempt_count,
            "max_auto_retries": max_auto_retries,
            "retry_backoff_seconds": backoff_seconds,
            "next_retry_at": next_retry_at,
            "next_action_index": checkpoint_next_action_index,
            "session_profile": checkpoint_session_profile,
        }
        metadata["local_worker_recovery_manual_confirmation_required"] = False
        metadata["local_worker_recovery_auto_retry_exhausted"] = False
        event = "local_cold_boot_recovered_backoff" if delayed_retry else "local_cold_boot_recovered"
        message = run["result"]
    else:
        run["result"] = "Local operator paused at saved checkpoint after runtime restart."
        run["result_data"] = {
            "summary": run["result"],
            "resume_available": True,
            "error": "local_worker_orphaned_recovered",
            "next_action_index": checkpoint_next_action_index,
            "session_profile": checkpoint_session_profile,
        }
        event = "local_cold_boot_recovered"
        message = "Recovered local run from durable checkpoint after runtime restart."

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    context["metadata"] = metadata
    run["context"] = context

    log_queue = run.get("logs")
    if log_queue is not None:
        _server.emit_log(
            log_queue,
            "warn",
            message,
            event=event,
            data={
                "run_id": run_id,
                "attempt_count": attempt_count,
                "max_auto_retries": max_auto_retries,
                "retry_backoff_seconds": backoff_seconds,
                "next_retry_at": next_retry_at,
                "manual_confirmation_required": bool(metadata.get("local_worker_recovery_manual_confirmation_required")),
                "next_action_index": checkpoint_next_action_index,
                "session_profile": checkpoint_session_profile,
            },
        )
    return event


def recover_orphaned_local_runs_on_startup() -> List[str]:
    global _COLD_BOOT_RECOVERY_DONE
    _init()
    if _COLD_BOOT_RECOVERY_DONE:
        return []
    recovered: List[str] = []
    now = _server._utc_now()
    with _server.LOCAL_QUEUE_LOCK:
        active_claims = {
            run_id: dict(claim)
            for run_id, claim in _server.LOCAL_CLAIMED_RUNS.items()
            if isinstance(claim, dict)
        }
        online_workers = {
            worker_id
            for worker_id, record in _server.LOCAL_WORKER_REGISTRY.items()
            if isinstance(record, dict) and _is_worker_online(record, now)
        }
        pending_ids = set(str(run_id) for run_id in _server.LOCAL_PENDING_RUN_IDS)

    for run_id, run in list(_server.runs.items()):
        if not isinstance(run, dict):
            continue
        status = str(run.get("status") or "").strip().lower()
        checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        selected_target = str(
            metadata.get("execution_target_selected")
            or metadata.get("execution_target")
            or ""
        ).strip().lower()
        if selected_target not in {"local", "local_companion"} and status not in {"running_local", "queued_local", "starting", "waiting_for_input"}:
            continue
        claim = active_claims.get(run_id) if isinstance(active_claims.get(run_id), dict) else {}
        worker_id = str(claim.get("worker_id") or run.get("local_worker_id") or "").strip()
        has_live_worker = bool(worker_id and worker_id in online_workers)
        if status == "waiting_for_input":
            if checkpoint:
                recovered.append(run_id)
            continue
        if has_live_worker or run_id in pending_ids:
            continue
        if not checkpoint:
            continue
        _apply_cold_boot_checkpoint_recovery_state(run_id, run, checkpoint, metadata)
        recovered.append(run_id)
        _server._persist_live_run_state(run_id, run)

    if recovered:
        machine_lease_service.reconcile_recovered_machine_leases(
            recovered,
            local_queue_lock=_server.LOCAL_QUEUE_LOCK,
            local_pending_run_ids=_server.LOCAL_PENDING_RUN_IDS,
            local_claimed_runs=_server.LOCAL_CLAIMED_RUNS,
            persist_local_runtime_state_fn=_persist_local_runtime_state,
        )
    _COLD_BOOT_RECOVERY_DONE = True
    return recovered


def _claim_local_run(worker_id: str, required_capabilities: Optional[List[str]] = None) -> Optional[str]:
    _init()
    return worker_dispatch_service.claim_local_run(
        worker_id,
        required_capabilities=required_capabilities,
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        pending_run_ids=_server.LOCAL_PENDING_RUN_IDS,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        worker_registry=_server.LOCAL_WORKER_REGISTRY,
        runs_by_id=_server.runs,
        lease_seconds=_server.ORION_LOCAL_LEASE_SECONDS,
        cleanup_stale_local_claims_fn=_cleanup_stale_local_claims,
        ordered_runtime_preferences_for_run_fn=_ordered_runtime_preferences_for_run,
        best_online_preferred_runtime_fn=_best_online_preferred_runtime,
        required_capabilities_for_run_fn=_required_capabilities_for_run,
        normalize_capability_ids_fn=_normalize_capability_ids,
        persist_local_runtime_state_fn=_persist_local_runtime_state,
        mark_local_worker_seen_fn=_mark_local_worker_seen,
        now_iso_fn=_server._utc_now_iso,
    )


def _local_run_summary(run_id: str, run: Dict[str, Any], claim: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    _init()
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    required_capabilities = _required_capabilities_for_run(run)
    return {
        "run_id": run_id,
        "engine": run.get("engine"),
        "status": run.get("status"),
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "user_goal": str(context.get("user_goal") or ""),
        "outcome_pack": str(metadata.get("outcome_pack") or ""),
        "agent_role": str(metadata.get("agent_role") or "").strip() or None,
        "agent_role_source": str(metadata.get("agent_role_source") or "").strip() or None,
        "parent_run_id": str(metadata.get("parent_run_id") or "").strip() or None,
        "delegation_root_run_id": str(metadata.get("delegation_root_run_id") or "").strip() or None,
        "delegated_by_run_id": str(metadata.get("delegated_by_run_id") or "").strip() or None,
        "delegated_by_role": str(metadata.get("delegated_by_role") or "").strip() or None,
        "delegation_note": str(metadata.get("delegation_note") or "").strip() or None,
        "required_capabilities": required_capabilities,
        "preferred_runtime_id": str(metadata.get("execution_target_preferred_runtime_id") or "").strip() or None,
        "preferred_runtime_label": str(metadata.get("execution_target_preferred_runtime_label") or "").strip() or None,
        "workspace_id": str(context.get("workspace_id") or ""),
        "worker_id": str(claim.get("worker_id") or "") if isinstance(claim, dict) else None,
        "claimed_at": claim.get("claimed_at") if isinstance(claim, dict) else None,
        "last_heartbeat_at": claim.get("last_heartbeat_at") if isinstance(claim, dict) else None,
        "lease_seconds": int(claim.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS) if isinstance(claim, dict) else _server.ORION_LOCAL_LEASE_SECONDS,
    }


def _capability_queue_summary(
    queued_run_ids: List[str],
    online_machine_items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    online_capabilities = sorted(
        {
            capability
            for item in online_machine_items
            if isinstance(item, dict)
            for capability in _normalize_capability_ids(item.get("capabilities"))
        }
    )
    online_capability_set = set(online_capabilities)
    waiting_count = 0
    waiting_items: List[Dict[str, Any]] = []

    for run_id in queued_run_ids:
        run = _server.runs.get(run_id)
        if not isinstance(run, dict):
            continue
        summary = _local_run_summary(run_id, run)
        required_capabilities = list(summary.get("required_capabilities") or [])
        if not required_capabilities:
            continue
        required_set = set(required_capabilities)
        matching_items = [
            item
            for item in online_machine_items
            if isinstance(item, dict)
            and required_set.issubset(set(_normalize_capability_ids(item.get("capabilities"))))
        ]
        available_items = [item for item in matching_items if not bool(item.get("current_run_id"))]
        missing_capabilities = [
            capability
            for capability in required_capabilities
            if capability not in online_capability_set
        ]
        if not missing_capabilities and available_items:
            continue
        waiting_count += 1
        if len(waiting_items) >= 5:
            continue
        preferred_runtime_id = str(summary.get("preferred_runtime_id") or "").strip() or None
        matching_runtime_ids = _runtime_group_for_run(run).get("matching_runtime_ids") or []
        queue_pressure = _queue_pressure_for_runtime_group(
            queued_run_ids,
            list(matching_runtime_ids),
            preferred_runtime_id,
            stop_before_run_id=run_id,
        )
        waiting_state = "missing_capabilities"
        waiting_reason = "No online machine currently reports the required capabilities."
        busy_runtime_labels: List[str] = []
        queued_ahead_count = int(queue_pressure.get("queued_ahead_count") or 0)
        estimated_wait_band = "unknown"
        if not missing_capabilities and matching_items and not available_items:
            waiting_state = "capacity"
            busy_runtime_labels = [
                str(item.get("display_name") or item.get("runtime_id") or item.get("worker_id") or "").strip()
                for item in matching_items
                if str(item.get("display_name") or item.get("runtime_id") or item.get("worker_id") or "").strip()
            ]
            estimated_wait_band = _capacity_wait_band(queued_ahead_count, len(matching_items))
            if busy_runtime_labels:
                waiting_reason = f"Capable machines are online but busy: {', '.join(busy_runtime_labels)}."
            else:
                waiting_reason = "Capable machines are online but currently busy."
            if queued_ahead_count > 0:
                waiting_reason = f"{waiting_reason} {queued_ahead_count} similar local run{'s are' if queued_ahead_count != 1 else ' is'} ahead in the queue."
        waiting_items.append(
            {
                "run_id": run_id,
                "user_goal": summary.get("user_goal"),
                "outcome_pack": summary.get("outcome_pack"),
                "required_capabilities": required_capabilities,
                "missing_capabilities": missing_capabilities,
                "waiting_state": waiting_state,
                "waiting_reason": waiting_reason,
                "busy_runtime_labels": busy_runtime_labels,
                "queued_ahead_count": queued_ahead_count,
                "estimated_wait_band": estimated_wait_band,
            }
        )

    return {
        "waiting_count": waiting_count,
        "online_capabilities": online_capabilities,
        "items": waiting_items,
    }


def _worker_display_sort_key(item: Dict[str, Any]) -> tuple:
    online_rank = 0 if bool(item.get("online")) else 1
    busy_rank = 1 if item.get("current_run_id") else 0
    trust_state = str(item.get("trust_state") or "").strip().lower()
    if trust_state == "verified":
        trust_rank = 0
    elif trust_state:
        trust_rank = 1
    else:
        trust_rank = 2
    try:
        seen_rank = int(item.get("seconds_since_seen"))
    except Exception:
        seen_rank = 999999
    runtime_id = str(item.get("runtime_id") or item.get("worker_id") or "").strip()
    return (online_rank, busy_rank, trust_rank, seen_rank, runtime_id)


# ---------------------------------------------------------------------------
# Handlers for endpoints
# ---------------------------------------------------------------------------


def handle_get_local_run_queue(workspace_id: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
    _init()
    _cleanup_stale_local_claims()
    safe_limit = max(1, min(limit, 300))
    queued: List[Dict[str, Any]] = []
    claimed: List[Dict[str, Any]] = []
    workspace_filter = str(workspace_id or "").strip()

    with _server.LOCAL_QUEUE_LOCK:
        queued_ids = list(_server.LOCAL_PENDING_RUN_IDS)
        claimed_map = {rid: dict(info) for rid, info in _server.LOCAL_CLAIMED_RUNS.items() if isinstance(info, dict)}

    for run_id in queued_ids:
        run = _server.runs.get(run_id)
        if not isinstance(run, dict):
            continue
        summary = _local_run_summary(run_id, run)
        if workspace_filter and summary.get("workspace_id") != workspace_filter:
            continue
        queued.append(summary)
        if len(queued) >= safe_limit:
            break

    for run_id, claim in claimed_map.items():
        run = _server.runs.get(run_id)
        if not isinstance(run, dict):
            continue
        summary = _local_run_summary(run_id, run, claim)
        if workspace_filter and summary.get("workspace_id") != workspace_filter:
            continue
        claimed.append(summary)
        if len(claimed) >= safe_limit:
            break

    return {
        "enabled": _server.ORION_LOCAL_COMPANION_ENABLED,
        "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS,
        "queued_count": len(queued),
        "claimed_count": len(claimed),
        "queued_runs": queued,
        "claimed_runs": claimed,
    }


def handle_get_local_workers_status() -> Dict[str, Any]:
    _init()
    _cleanup_stale_local_claims()
    items: List[Dict[str, Any]] = []
    now = _server._utc_now()
    queued_ids: List[str] = []
    with _server.LOCAL_QUEUE_LOCK:
        for worker_id, record in list(_server.LOCAL_WORKER_REGISTRY.items()):
            if not isinstance(record, dict):
                continue
            lease_seconds = int(record.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS)
            online = _is_worker_online(record, now)
            seen_at = _server._parse_utc_ts(record.get("last_seen_at"))
            since_seen = None
            if seen_at is not None:
                since_seen = max(0, int((now - seen_at).total_seconds()))
            status = str(record.get("status") or "idle")
            if not online:
                status = "offline"
            items.append(
                {
                    "worker_id": worker_id,
                    "runtime_id": record.get("runtime_id") or worker_id,
                    "runtime_type": record.get("runtime_type") or "local",
                    "display_name": record.get("display_name") or worker_id,
                    "platform": record.get("platform"),
                    "policy_mode": record.get("policy_mode") or _server.ORION_RUNTIME_POLICY_MODE_DEFAULT,
                    "capabilities": list(record.get("capabilities") or []),
                    "execution_targets": list(record.get("execution_targets") or []),
                    "trust_state": record.get("trust_state") or "unverified",
                    "instance_id": record.get("instance_id"),
                    "capability_digest": record.get("capability_digest"),
                    "registered_at": record.get("registered_at"),
                    "last_registered_at": record.get("last_registered_at"),
                    "session_issued_at": record.get("session_issued_at"),
                    "status": status,
                    "online": online,
                    "current_run_id": record.get("current_run_id"),
                    "last_seen_at": record.get("last_seen_at"),
                    "seconds_since_seen": since_seen,
                    "lease_seconds": lease_seconds,
                    "note": record.get("note"),
                }
            )
        pending_runs = len(_server.LOCAL_PENDING_RUN_IDS)
        claimed_runs = len(_server.LOCAL_CLAIMED_RUNS)
        queued_ids = list(_server.LOCAL_PENDING_RUN_IDS)

    known = len(items)
    online = len([item for item in items if item.get("online")])
    busy = len([item for item in items if item.get("online") and item.get("current_run_id")])
    idle = max(0, online - busy)
    offline = max(0, known - online)

    items.sort(key=_worker_display_sort_key)
    capability_queue = _capability_queue_summary(
        queued_ids,
        [item for item in items if bool(item.get("online"))],
    )

    return {
        "enabled": _server.ORION_LOCAL_COMPANION_ENABLED,
        "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS,
        "summary": {
            "known": known,
            "online": online,
            "busy": busy,
            "idle": idle,
            "offline": offline,
            "pending_runs": pending_runs,
            "claimed_runs": claimed_runs,
        },
        "watchdog": local_runtime_watchdog_status_snapshot(),
        "capability_queue": capability_queue,
        "items": items,
    }


def handle_heartbeat_local_worker(worker_id: str, payload: Optional[LocalWorkerHeartbeatPayload] = None) -> Dict[str, Any]:
    _init()
    return worker_dispatch_service.heartbeat_local_worker(
        worker_id,
        current_run_id=(payload.current_run_id if payload else None),
        note=(payload.note if payload else None),
        runs_by_id=_server.runs,
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        mark_local_worker_seen_fn=_mark_local_worker_seen,
        maybe_emit_local_still_working_fn=_maybe_emit_local_still_working,
        persist_local_runtime_state_fn=_persist_local_runtime_state,
        utc_now_iso_fn=_server._utc_now_iso,
    )


def handle_claim_local_run(body: Optional[LocalRunClaimRequest] = None) -> Dict[str, Any]:
    _init()
    if not _server.ORION_LOCAL_COMPANION_ENABLED:
        raise HTTPException(status_code=400, detail="Local companion routing is disabled on this runtime.")

    worker_id = str((body.worker_id if body else None) or "").strip() if body else ""
    if not worker_id:
        worker_id = f"local-worker-{uuid.uuid4().hex[:8]}"

    requested_capabilities = list(body.required_capabilities or []) if body else []
    run_id = _claim_local_run(worker_id, required_capabilities=requested_capabilities)
    if not run_id:
        return {"ok": True, "worker_id": worker_id, "run": None}

    run = _server.runs.get(run_id)
    if not isinstance(run, dict):
        return {"ok": True, "worker_id": worker_id, "run": None}

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    worker_state = _server.LOCAL_WORKER_REGISTRY.get(worker_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker_id), dict) else {}
    now = datetime.utcnow().isoformat() + "Z"
    claim = _server.LOCAL_CLAIMED_RUNS.get(run_id) if isinstance(_server.LOCAL_CLAIMED_RUNS.get(run_id), dict) else {}
    machine_lease_service.bind_machine_lease_to_run(
        run,
        worker_id=worker_id,
        claim=claim,
        worker_state=worker_state,
        now_iso=now,
        normalize_policy_mode_fn=_server.normalize_policy_mode,
    )
    _server.set_run_status(run_id, "running_local")
    _server.emit_log(
        run["logs"],
        "info",
        f"Local companion claimed run ({worker_id}).",
        event="local_claimed",
        data={
            "run_id": run_id,
            "worker_id": worker_id,
            "machine_id": claim.get("machine_id") or worker_id,
            "lease_id": claim.get("lease_id"),
            "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS,
        },
    )

    return {
        "ok": True,
        "worker_id": worker_id,
        "run": {
            "run_id": run_id,
            "engine": run.get("engine"),
            "status": run.get("status"),
            "lease_seconds": int(claim.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS),
            "machine_id": claim.get("machine_id") or worker_id,
            "machine_lease_id": claim.get("lease_id"),
            "context": _server.redact_sensitive(run.get("context", {})),
            "browser_checkpoint": (
                run.get("browser_checkpoint")
                if isinstance(run.get("browser_checkpoint"), dict)
                else None
            ),
            "created_at": run.get("created_at"),
        },
    }


def handle_heartbeat_local_run(run_id: uuid.UUID, payload: Optional[LocalRunHeartbeatPayload] = None) -> Dict[str, Any]:
    _init()
    run_id_str = str(run_id)
    result = worker_dispatch_service.heartbeat_local_run(
        run_id_str,
        worker_id=(payload.worker_id if payload else None),
        note=(payload.note if payload else None),
        runs_by_id=_server.runs,
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        maybe_emit_local_still_working_fn=_maybe_emit_local_still_working,
        mark_local_worker_seen_fn=_mark_local_worker_seen,
        utc_now_iso_fn=_server._utc_now_iso,
    )
    note = str((payload.note if payload else None) or "").strip() if payload else ""
    run = _server.runs.get(run_id_str)
    if note and isinstance(run, dict):
        _server.emit_log(run["logs"], "info", note[:400], event="local_heartbeat")
    return result


def handle_complete_local_run(run_id: uuid.UUID, payload: LocalRunCompletePayload) -> Dict[str, Any]:
    _init()
    return worker_dispatch_service.complete_local_run(
        str(run_id),
        worker_id=payload.worker_id,
        result_text=payload.result_text,
        result_data=payload.result_data,
        usage_masked=payload.usage_masked,
        runs_by_id=_server.runs,
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        emit_log_fn=_server.emit_log,
        mark_local_worker_seen_fn=_mark_local_worker_seen,
        set_run_status_fn=_server.set_run_status,
        persist_run_memory_fn=_server._persist_run_memory,
    )


def handle_pause_local_run(run_id: uuid.UUID, payload: LocalRunPausePayload) -> Dict[str, Any]:
    _init()
    return worker_dispatch_service.pause_local_run(
        str(run_id),
        worker_id=payload.worker_id,
        result_text=payload.result_text,
        result_data=payload.result_data,
        browser_checkpoint=payload.browser_checkpoint,
        wait_reason=payload.wait_reason,
        runs_by_id=_server.runs,
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        emit_log_fn=_server.emit_log,
        mark_local_worker_seen_fn=_mark_local_worker_seen,
        set_run_status_fn=_server.set_run_status,
        persist_local_runtime_state_fn=_persist_local_runtime_state,
    )


def handle_fail_local_run(run_id: uuid.UUID, payload: LocalRunFailPayload) -> Dict[str, Any]:
    _init()
    return worker_dispatch_service.fail_local_run(
        str(run_id),
        worker_id=payload.worker_id,
        error=payload.error,
        runs_by_id=_server.runs,
        local_queue_lock=_server.LOCAL_QUEUE_LOCK,
        claimed_runs=_server.LOCAL_CLAIMED_RUNS,
        emit_log_fn=_server.emit_log,
        mark_local_worker_seen_fn=_mark_local_worker_seen,
        set_run_status_fn=_server.set_run_status,
    )
