from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from datetime import datetime, timedelta, timezone as dt_timezone
import sys
import re
from typing import Any, Dict, List, Optional, Set
from zoneinfo import ZoneInfo
from croniter import croniter
from server_modules.doctor_gate import build_doctor_run_gate_from_snapshot
from server_modules import run_service as run_service
from server_modules.runs_delegation import _detect_agent_role, _normalize_run_id_token, _refresh_parent_delegation_state, normalize_agent_role
from server_modules.runs_engine import ENGINE_REGISTRY, ORION_ENGINE_VALIDATION_ERRORS
from server_modules.turn_runtime import build_execute_unowned_system_run_start_request_via_turn_runtime
from server_modules.runs_history import (
    _append_approval_audit,
    _approval_correlation_id,
    _load_approval_audit,
)
from server_modules.runs_output import (
    _archive_run_if_terminal,
    _json_safe,
    _compact_event_text,
    _load_run_history,
    _persist_live_run_state,
    _remove_live_run_state,
    _restore_live_run_state,
    _refresh_archived_run_snapshot,
)

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

APPROVAL_SCOPE_ONCE = "once"
APPROVAL_SCOPE_CONSEQUENCE = "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again."
_PERSISTED_TERMINAL_RUN_STATUSES = {"completed", "failed", "timeout", "stopped", "cancelled"}


def _get_pending_confirmation(run: Dict[str, Any]) -> Dict[str, Any]:
    pending = run.get("pending_confirmation")
    if isinstance(pending, dict):
        return pending
    legacy = run.get("pending_approval")
    if isinstance(legacy, dict):
        return legacy
    return {}


def _set_pending_confirmation(run: Dict[str, Any], payload: Optional[Dict[str, Any]]) -> None:
    run["pending_confirmation"] = payload
    run["pending_approval"] = payload


def _clear_pending_confirmation(run: Dict[str, Any]) -> None:
    run["pending_confirmation"] = None
    run["pending_approval"] = None


def _sync_local_runtime_state_snapshot() -> None:
    try:
        with LOCAL_QUEUE_LOCK:
            pending_run_ids = list(LOCAL_PENDING_RUN_IDS)
            claimed_runs = {
                run_id: dict(info)
                for run_id, info in LOCAL_CLAIMED_RUNS.items()
                if isinstance(info, dict)
            }
            runtime_registrations = {
                runtime_id: dict(record)
                for runtime_id, record in LOCAL_WORKER_REGISTRY.items()
                if isinstance(record, dict)
            }
        replace_local_runtime_state(
            ORION_RUNTIME_STATE_DB,
            pending_run_ids=pending_run_ids,
            claimed_runs=claimed_runs,
            runtime_registrations=runtime_registrations,
        )
    except Exception:
        pass


def _is_local_runtime_run(run: Dict[str, Any]) -> bool:
    status = str(run.get("status") or "").strip().lower()
    if status.endswith("_local"):
        return True
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected = str(
        metadata.get("execution_target_selected")
        or metadata.get("execution_target_requested")
        or ""
    ).strip().lower()
    return selected in {"local", "local_companion"}


def _load_live_runtime_state() -> None:
    try:
        shared.sync_acp_manager_paths(runtime_db_path=ORION_RUNTIME_STATE_DB)
        ACP_MANAGER.reload_runtime_state()
    except Exception:
        pass

    RUN_QUEUE_INDEX.clear()
    for run_id, run in list(runs.items()):
        log_queue = run.get("logs") if isinstance(run, dict) else None
        if log_queue is not None:
            RUN_QUEUE_INDEX[id(log_queue)] = run_id

    recovered_queue = False
    for run_id, run in list(runs.items()):
        status = str(run.get("status") or "").strip().lower()
        if status in _PERSISTED_TERMINAL_RUN_STATUSES:
            _remove_live_run_state(run_id)
            log_queue = run.get("logs")
            if log_queue is not None:
                RUN_QUEUE_INDEX.pop(id(log_queue), None)
            runs.pop(run_id, None)
            continue
        if _is_local_runtime_run(run):
            if status == "running_local" and run_id not in LOCAL_CLAIMED_RUNS:
                run["status"] = "queued_local"
                run["local_worker_id"] = None
                run["local_claimed_at"] = None
                run["local_last_heartbeat_at"] = None
                run["updated_at"] = _utc_now_iso()
                with LOCAL_QUEUE_LOCK:
                    if run_id not in LOCAL_PENDING_RUN_IDS:
                        LOCAL_PENDING_RUN_IDS.append(run_id)
                _persist_live_run_state(run_id, run)
                recovered_queue = True
                continue
            if status in {"starting", "queued_local"}:
                run["status"] = "queued_local"
                run["updated_at"] = _utc_now_iso()
                with LOCAL_QUEUE_LOCK:
                    if run_id not in LOCAL_PENDING_RUN_IDS and run_id not in LOCAL_CLAIMED_RUNS:
                        LOCAL_PENDING_RUN_IDS.append(run_id)
                _persist_live_run_state(run_id, run)
                recovered_queue = True
                continue
            _persist_live_run_state(run_id, run)
            continue
        if status in {"starting", "running"}:
            emit_log(
                run["logs"],
                "error",
                "Run interrupted when the runtime restarted.",
                event="runtime_restart_interrupted_run",
                data={"run_id": run_id},
            )
            run["result"] = "Run interrupted when the runtime restarted."
            set_run_status(run_id, "failed")
            run["logs"].put(None)
            continue
        _persist_live_run_state(run_id, run)
    if recovered_queue:
        _sync_local_runtime_state_snapshot()

def _begin_run_pending_confirmation(
    run_id: str,
    prompt: str,
    *,
    source: str = "runtime",
    metadata: Optional[Dict[str, Any]] = None,
    emit_pause_required: bool = False,
) -> Dict[str, Any]:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        raise RuntimeError("Run ID not found.")
    context = run.get("context")
    context_metadata = {}
    if isinstance(context, dict):
        raw_metadata = context.get("metadata")
        if isinstance(raw_metadata, dict):
            context_metadata = raw_metadata
    configured_ttl = context_metadata.get("approval_ttl_seconds") if isinstance(context_metadata, dict) else None
    ttl_seconds = ORION_APPROVAL_TTL_SECONDS
    if isinstance(configured_ttl, (int, float)):
        ttl_seconds = int(configured_ttl)
    ttl_seconds = max(30, min(1800, ttl_seconds))
    requested_at = _utc_now_iso()
    expires_at = (_utc_now() + timedelta(seconds=ttl_seconds)).isoformat().replace("+00:00", "Z")
    approval_id = str(uuid.uuid4())
    correlation_id = _approval_correlation_id(approval_id, run_id=run_id)
    safe_metadata = _json_safe(metadata if isinstance(metadata, dict) else {})
    approval_actions = [
        str(item).strip()
        for item in (safe_metadata.get("approval_actions") if isinstance(safe_metadata.get("approval_actions"), list) else [])
        if str(item).strip()
    ]
    approval_target = str(safe_metadata.get("target") or "").strip() or None
    payload = {
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "status": "waiting",
        "requested_at": requested_at,
        "expires_at": expires_at,
        "prompt": prompt,
        "ttl_seconds": ttl_seconds,
        "scope": APPROVAL_SCOPE_ONCE,
        "reusable": False,
        "consequence": APPROVAL_SCOPE_CONSEQUENCE,
        "actions": approval_actions,
        "target": approval_target,
        "metadata": safe_metadata,
    }
    _set_pending_confirmation(run, payload)
    emit_log(
        run["logs"],
        "warn",
        prompt,
        event="approval_requested",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
            "scope": APPROVAL_SCOPE_ONCE,
            "reusable": False,
            **safe_metadata,
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="requested",
        actor="system",
        source=source,
        run_id=run_id,
        note=prompt,
        correlation_id=correlation_id,
        metadata={
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
            "scope": APPROVAL_SCOPE_ONCE,
            "reusable": False,
            **(safe_metadata if isinstance(safe_metadata, dict) else {}),
        },
    )
    emit_log(
        run["logs"],
        "info",
        "Approval request is waiting for user resolution.",
        event="approval_waiting",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="waiting",
        actor="system",
        source=source,
        run_id=run_id,
        correlation_id=correlation_id,
    )
    set_run_status(run_id, "waiting_for_input")
    if emit_pause_required:
        run["logs"].put("__PAUSE_REQUIRED__")
    return payload


def _begin_run_pending_approval(
    run_id: str,
    prompt: str,
    *,
    source: str = "runtime",
    metadata: Optional[Dict[str, Any]] = None,
    emit_pause_required: bool = False,
) -> Dict[str, Any]:
    return _begin_run_pending_confirmation(
        run_id,
        prompt,
        source=source,
        metadata=metadata,
        emit_pause_required=emit_pause_required,
    )

def _persist_weekly_schedules():
    with SCHEDULES_LOCK:
        payload = {
            "version": 1,
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "items": list(WEEKLY_SCHEDULES.values()),
        }
    _safe_write_json(ORION_SCHEDULES_FILE, payload)


def _load_weekly_schedules():
    payload = _safe_read_json(ORION_SCHEDULES_FILE, {"version": 1, "items": []})
    items = payload.get("items")
    if not isinstance(items, list):
        return
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES.clear()
        for item in items:
            if not isinstance(item, dict):
                continue
            schedule_id = item.get("id")
            if isinstance(schedule_id, str) and schedule_id.strip():
                item["wake_mode"] = str(item.get("wake_mode") or "now").strip().lower() or "now"
                item["delivery"] = str(item.get("delivery") or "announce").strip().lower() or "announce"
                item["run_log"] = list(item.get("run_log") or [])[-10:]
                item["pending_heartbeat"] = bool(item.get("pending_heartbeat"))
                item["pending_heartbeat_slot"] = str(item.get("pending_heartbeat_slot") or "").strip() or None
                item["next_run_at"] = str(item.get("next_run_at") or "").strip() or _compute_schedule_next_run_at(item)
                WEEKLY_SCHEDULES[schedule_id] = item


def _persist_schedules():
    _persist_weekly_schedules()


def _load_schedules():
    _load_weekly_schedules()


def _schedule_now_snapshot(now: datetime, tz_mode: str) -> Dict[str, Any]:
    if tz_mode == "utc":
        current = now.astimezone(timezone.utc)
    else:
        current = now.astimezone()
    return {
        "weekday": current.strftime("%A"),
        "hhmm": current.strftime("%H:%M"),
        "date_key": current.strftime("%Y-%m-%d"),
    }


def set_run_status(run_id: str, status: str):
    run = runs.get(run_id)
    if not run:
        return
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    parent_run_id = _normalize_run_id_token(metadata.get("parent_run_id")) if isinstance(metadata, dict) else None
    previous = run.get("status")
    now_mono = time.monotonic()

    if previous == "waiting_for_input" and status != "waiting_for_input":
        wait_start = run.get("_hitl_wait_start_mono")
        if isinstance(wait_start, (int, float)):
            waited_ms = max(0.0, (now_mono - wait_start) * 1000.0)
            run["_hitl_wait_total_ms"] = run.get("_hitl_wait_total_ms", 0.0) + waited_ms
            metrics_add("hitl_wait_sum_ms", waited_ms)
            metrics_inc("hitl_wait_count", 1)
            run["_hitl_wait_start_mono"] = None

    if status == "waiting_for_input":
        run["_hitl_wait_start_mono"] = now_mono
        metrics_inc("runs_waiting_for_input", 1)

    if status in ["completed", "failed", "timeout"] and run.get("_finished_mono") is None:
        run["_finished_mono"] = now_mono
        started = run.get("_started_mono")
        if isinstance(started, (int, float)):
            duration_ms = max(0.0, (now_mono - started) * 1000.0)
            run["duration_ms"] = round(duration_ms, 2)
            metrics_add("run_duration_sum_ms", duration_ms)
            metrics_inc("run_duration_count", 1)
        run["completed_at"] = datetime.utcnow().isoformat() + "Z"
        if status == "completed":
            metrics_inc("runs_completed", 1)
        elif status == "failed":
            metrics_inc("runs_failed", 1)
        elif status == "timeout":
            metrics_inc("runs_timeout", 1)

    run["status"] = status
    run["updated_at"] = datetime.utcnow().isoformat() + "Z"
    if status in ["completed", "failed", "timeout"]:
        with LOCAL_QUEUE_LOCK:
            if run_id in LOCAL_PENDING_RUN_IDS:
                LOCAL_PENDING_RUN_IDS[:] = [rid for rid in LOCAL_PENDING_RUN_IDS if rid != run_id]
            LOCAL_CLAIMED_RUNS.pop(run_id, None)
        _archive_run_if_terminal(run_id, run)
        log_queue = run.get("logs")
        if log_queue is not None:
            RUN_QUEUE_INDEX.pop(id(log_queue), None)
        _remove_live_run_state(run_id)
        _sync_local_runtime_state_snapshot()
    else:
        _persist_live_run_state(run_id, run)
    if parent_run_id and status in TERMINAL_RUN_STATUSES:
        _refresh_parent_delegation_state(parent_run_id, triggering_run_id=run_id)


def emit_log(log_queue, level: str, message: str, event: str = "runtime", data: Optional[dict] = None):
    payload = {
        "event_id": str(uuid.uuid4()),
        "ts": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "event": event,
        "message": message,
    }
    if data:
        payload["data"] = data
    run_id = RUN_QUEUE_INDEX.get(id(log_queue))
    if run_id:
        run = runs.get(run_id)
        if isinstance(run, dict):
            seq = int(run.get("_event_seq", 0)) + 1
            run["_event_seq"] = seq
            payload["seq"] = seq
            payload["run_id"] = run_id
            events = run.setdefault("events", [])
            if isinstance(events, list):
                events.append(payload)
                if len(events) > ORION_MAX_EVENT_BUFFER:
                    del events[: len(events) - ORION_MAX_EVENT_BUFFER]
    log_queue.put(payload)

def _normalized_weekday(value: str) -> str:
    return str(value or "").strip().capitalize()


def _normalized_schedule_timezone(value: str) -> str:
    tz_mode = str(value or "local").strip().lower()
    return tz_mode if tz_mode in {"local", "utc"} else "local"


def _schedule_reference_now(now: datetime, tz_mode: str) -> datetime:
    return now.astimezone(timezone.utc) if tz_mode == "utc" else now.astimezone()


def _cron_from_weekly(day_of_week: str, time_hhmm: str) -> str:
    weekday_map = {
        "monday": "1",
        "tuesday": "2",
        "wednesday": "3",
        "thursday": "4",
        "friday": "5",
        "saturday": "6",
        "sunday": "0",
    }
    day = str(day_of_week or "").strip().lower()
    hh, mm = str(time_hhmm or "09:00").strip().split(":")
    return f"{int(mm)} {int(hh)} * * {weekday_map.get(day, '1')}"


def _latest_schedule_slot_in_window(schedule: Dict[str, Any], window_start_utc: datetime, window_end_utc: datetime) -> Optional[datetime]:
    cron_expr = str(schedule.get("cron") or "").strip()
    if not cron_expr or not croniter.is_valid(cron_expr):
        return None
    tz_mode = _normalized_schedule_timezone(str(schedule.get("timezone") or "local"))
    local_start = _schedule_reference_now(window_start_utc, tz_mode)
    local_end = _schedule_reference_now(window_end_utc, tz_mode)
    iterator = croniter(cron_expr, local_start - timedelta(minutes=1))
    latest: Optional[datetime] = None
    for _ in range(32):
        candidate = iterator.get_next(datetime)
        if candidate.tzinfo is None:
            candidate = candidate.replace(tzinfo=local_start.tzinfo)
        if candidate <= local_start:
            continue
        if candidate > local_end:
            break
        latest = candidate
    return latest


def _compute_schedule_next_run_at(schedule: Dict[str, Any], *, now_utc: Optional[datetime] = None) -> Optional[str]:
    cron_expr = str(schedule.get("cron") or "").strip()
    if not cron_expr or not croniter.is_valid(cron_expr):
        return None
    reference_utc = now_utc or datetime.now(timezone.utc)
    tz_mode = _normalized_schedule_timezone(str(schedule.get("timezone") or "local"))
    local_reference = _schedule_reference_now(reference_utc, tz_mode)
    iterator = croniter(cron_expr, local_reference)
    candidate = iterator.get_next(datetime)
    if candidate.tzinfo is None:
        candidate = candidate.replace(tzinfo=local_reference.tzinfo)
    return candidate.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize_schedule_item(schedule: Dict[str, Any], *, now_utc: Optional[datetime] = None) -> Dict[str, Any]:
    payload = dict(schedule)
    payload["timezone"] = _normalized_schedule_timezone(str(payload.get("timezone") or "local"))
    payload["next_run_at"] = _compute_schedule_next_run_at(payload, now_utc=now_utc)
    payload["schedule_kind"] = "weekly" if payload.get("day_of_week") and payload.get("time_hhmm") else "cron"
    payload["wake_mode"] = str(payload.get("wake_mode") or "now").strip().lower() or "now"
    payload["delivery"] = str(payload.get("delivery") or "announce").strip().lower() or "announce"
    payload["run_log"] = list(payload.get("run_log") or [])[:10]
    return payload


def _append_schedule_run_log(
    schedule: Dict[str, Any],
    *,
    status: str,
    now_utc: Optional[datetime] = None,
    run_id: Optional[str] = None,
    detail: Optional[str] = None,
) -> Dict[str, Any]:
    payload = dict(schedule)
    reference_utc = now_utc or datetime.now(timezone.utc)
    timestamp = reference_utc.isoformat().replace("+00:00", "Z")
    run_log = list(payload.get("run_log") or [])
    run_log.append(
        {
            "at": timestamp,
            "status": str(status or "").strip() or "unknown",
            "run_id": str(run_id or "").strip() or None,
            "detail": str(detail or "").strip() or None,
        }
    )
    payload["run_log"] = run_log[-10:]
    payload["last_run_at"] = timestamp
    payload["last_run_id"] = str(run_id or "").strip() or payload.get("last_run_id")
    payload["last_error"] = None if status in {"queued", "started", "completed"} else (str(detail or "").strip() or payload.get("last_error"))
    payload["next_run_at"] = _compute_schedule_next_run_at(payload, now_utc=reference_utc)
    return payload


def _run_weekly_scheduler_forever():
    poll_seconds = max(5, ORION_SCHEDULER_POLL_SECONDS)
    while True:
        time.sleep(poll_seconds)
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=poll_seconds + 1)
        changed = False
        with SCHEDULES_LOCK:
            schedule_items = [dict(item) for item in WEEKLY_SCHEDULES.values()]

        for schedule in schedule_items:
            if not bool(schedule.get("enabled")):
                continue
            matched_slot = _latest_schedule_slot_in_window(schedule, window_start, now)
            if matched_slot is None:
                continue
            snapshot = _schedule_now_snapshot(now, _normalized_schedule_timezone(str(schedule.get("timezone") or "local")))
            slot_key = matched_slot.astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat().replace("+00:00", "Z")
            if str(schedule.get("last_trigger_slot") or "") == slot_key:
                continue

            schedule_id = str(schedule.get("id") or "")
            req_payload = schedule.get("run_request") if isinstance(schedule.get("run_request"), dict) else {}
            if not schedule_id or not isinstance(req_payload, dict):
                continue

            try:
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is None:
                        continue
                    current["last_trigger_slot"] = slot_key
                    current["last_trigger_date"] = snapshot["date_key"]
                    wake_mode = str(current.get("wake_mode") or "now").strip().lower() or "now"
                    if wake_mode == "next-heartbeat":
                        current["pending_heartbeat"] = True
                        current["pending_heartbeat_slot"] = slot_key
                        current["last_error"] = None
                        current["next_run_at"] = _compute_schedule_next_run_at(current, now_utc=now)
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True
                        continue
                req = RunStartRequest(**req_payload)
                run_result = _execute_scheduled_run_request(req, schedule_id=schedule_id)
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is not None:
                        current["last_trigger_slot"] = slot_key
                        current["last_trigger_date"] = snapshot["date_key"]
                        current["pending_heartbeat"] = False
                        current["pending_heartbeat_slot"] = None
                        current = _append_schedule_run_log(
                            current,
                            status="started",
                            now_utc=now,
                            run_id=str(run_result.get("run_id") or "").strip() or None,
                            detail="Scheduled run started immediately.",
                        )
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True
            except Exception as exc:
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is not None:
                        current["last_trigger_slot"] = slot_key
                        current["last_trigger_date"] = snapshot["date_key"]
                        current = _append_schedule_run_log(
                            current,
                            status="failed",
                            now_utc=now,
                            detail=str(exc),
                        )
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True

        if changed:
            _persist_schedules()


def trigger_pending_heartbeat_schedules() -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    started: List[Dict[str, Any]] = []
    changed = False
    with SCHEDULES_LOCK:
        pending_items = [
            dict(item)
            for item in WEEKLY_SCHEDULES.values()
            if bool(item.get("enabled")) and bool(item.get("pending_heartbeat"))
        ]
    for schedule in pending_items:
        schedule_id = str(schedule.get("id") or "").strip()
        req_payload = schedule.get("run_request") if isinstance(schedule.get("run_request"), dict) else {}
        if not schedule_id or not isinstance(req_payload, dict):
            continue
        try:
            req = RunStartRequest(**req_payload)
            run_result = _execute_scheduled_run_request(req, schedule_id=schedule_id)
            with SCHEDULES_LOCK:
                current = WEEKLY_SCHEDULES.get(schedule_id)
                if current is None:
                    continue
                current["pending_heartbeat"] = False
                current["pending_heartbeat_slot"] = None
                current = _append_schedule_run_log(
                    current,
                    status="started",
                    now_utc=now,
                    run_id=str(run_result.get("run_id") or "").strip() or None,
                    detail="Scheduled run started on heartbeat wake.",
                )
                current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                WEEKLY_SCHEDULES[schedule_id] = current
                changed = True
            started.append(
                {
                    "schedule_id": schedule_id,
                    "run_id": str(run_result.get("run_id") or "").strip() or None,
                    "name": str(schedule.get("name") or "").strip() or schedule_id,
                }
            )
        except Exception as exc:
            with SCHEDULES_LOCK:
                current = WEEKLY_SCHEDULES.get(schedule_id)
                if current is None:
                    continue
                current["pending_heartbeat"] = False
                current["pending_heartbeat_slot"] = None
                current = _append_schedule_run_log(
                    current,
                    status="failed",
                    now_utc=now,
                    detail=str(exc),
                )
                current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                WEEKLY_SCHEDULES[schedule_id] = current
                changed = True
    if changed:
        _persist_schedules()
    return {
        "acted": bool(started),
        "started": started,
    }


_runtime_services_initialized = False


def initialize_runtime_services() -> None:
    global _runtime_services_initialized, TELEGRAM_AUTOPILOT_THREAD
    if _runtime_services_initialized:
        return
    init_runtime_state_db(ORION_RUNTIME_STATE_DB)
    shared.sync_acp_manager_paths(
        runtime_db_path=ORION_RUNTIME_STATE_DB,
        setup_sessions_path=ORION_SETUP_SESSIONS_FILE,
        provider_profiles_path=ORION_PROVIDER_PROFILES_FILE,
        idempotency_path=ORION_IDEMPOTENCY_FILE,
    )
    try:
        from server_modules.runtime_runs_api import initialize_chat_stream_runtime_state

        initialize_chat_stream_runtime_state()
    except Exception:
        raise
    _load_live_runtime_state()
    _load_run_history()
    _load_approval_audit()
    _load_channel_events()
    _load_schedules()
    _load_setup_sessions()
    _load_provider_profiles()
    _load_idempotency()
    try:
        from server_modules import local_queue as _local_queue

        _local_queue.recover_orphaned_local_runs_on_startup()
    except Exception:
        pass
    from server_modules.health_diagnostics import _load_runtime_skills_state

    _load_runtime_skills_state()
    _load_telegram_autopilot_state()
    _load_whatsapp_autopilot_state()

    if ORION_SCHEDULER_ENABLED:
        _scheduler_thread = threading.Thread(target=_run_weekly_scheduler_forever, daemon=True)
        _scheduler_thread.start()
    if ORION_TELEGRAM_AUTOPILOT_ENABLED:
        telegram_thread = threading.Thread(target=_run_telegram_autopilot_forever, daemon=True)
        TELEGRAM_AUTOPILOT_THREAD = telegram_thread
        shared.TELEGRAM_AUTOPILOT_THREAD = telegram_thread
        server_module = sys.modules.get("server")
        if server_module is not None:
            setattr(server_module, "TELEGRAM_AUTOPILOT_THREAD", telegram_thread)
        telegram_thread.start()
    if ORION_WHATSAPP_AUTOPILOT_ENABLED:
        _whatsapp_autopilot_activate()
    _runtime_services_initialized = True


def _strip_wrapping_quotes(value: str) -> str:
    text = str(value or "").strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        return text[1:-1].strip()
    return text


def _credential_verification(row: Dict[str, Any]) -> Dict[str, Any]:
    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    verification = metadata.get("capability_verification") if isinstance(metadata.get("capability_verification"), dict) else {}
    return verification


def _runtime_usable_connector_rows(
    workspace_id: str,
    connector_id: str,
    *,
    explicit_credential_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    connector_rows = [
        item
        for item in list_vault_connectors(workspace_id)
        if isinstance(item, dict) and str(item.get("connector") or "").strip().lower() == connector_id
    ]
    if explicit_credential_id:
        connector_rows = [
            item for item in connector_rows if str(item.get("id") or "").strip() == str(explicit_credential_id or "").strip()
        ]
    usable_rows: List[Dict[str, Any]] = []
    for row in connector_rows:
        verification = _credential_verification(row)
        if verification.get("runtime_usable") is True:
            usable_rows.append(row)
    return usable_rows


def _select_runtime_usable_connector_binding(
    workspace_id: str,
    connector_id: str,
    *,
    explicit_credential_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    usable_rows = _runtime_usable_connector_rows(
        workspace_id,
        connector_id,
        explicit_credential_id=explicit_credential_id,
    )
    if explicit_credential_id:
        return usable_rows[0] if usable_rows else None
    if len(usable_rows) != 1:
        return None
    return usable_rows[0]


def _build_connector_action_workflow(
    *,
    connector_id: str,
    action_id: str,
    config: Dict[str, Any],
    label: str,
) -> Dict[str, Any]:
    return {
        "version": "empyralist.workflow.v2",
        "nodes": [
            {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
            {
                "id": "tool_1",
                "type": "tool",
                "variant": "connector_action",
                "data": {"label": label},
                "config": {
                    "connector": connector_id,
                    "action_id": action_id,
                    **config,
                },
            },
        ],
        "edges": [{"id": "edge_1", "source": "trigger_1", "target": "tool_1"}],
    }


def _binding_metadata(binding: Dict[str, Any]) -> Dict[str, Any]:
    metadata = binding.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _binding_google_email_address(binding: Dict[str, Any]) -> str:
    metadata = _binding_metadata(binding)
    for key in ("emailAddress", "email", "mail"):
        value = str(metadata.get(key) or "").strip()
        if value:
            return value
    return ""


def _binding_timezone(binding: Dict[str, Any]) -> str:
    metadata = _binding_metadata(binding)
    value = str(metadata.get("timezone") or "").strip()
    return value or "UTC"


def _strip_trailing_punctuation(value: str) -> str:
    return str(value or "").strip().rstrip(".,;:!?")


def _default_email_subject(body_text: str) -> str:
    text = _strip_trailing_punctuation(_strip_wrapping_quotes(body_text))
    lowered = text.lower()
    if lowered.startswith("summarizing "):
        text = text[len("summarizing ") :].strip()
    elif lowered.startswith("about "):
        text = text[len("about ") :].strip()
    if not text:
        return "Empyralis draft"
    subject = text[:80].strip()
    return subject or "Empyralis draft"


def _natural_calendar_range_for_tomorrow(
    *,
    hour_text: str,
    minute_text: str,
    meridiem_text: str,
    timezone_name: str,
) -> Optional[Dict[str, str]]:
    try:
        hour = int(str(hour_text or "").strip())
    except Exception:
        return None
    minute = int(str(minute_text or "0").strip() or "0")
    meridiem = str(meridiem_text or "").strip().lower()
    if meridiem:
        if hour < 1 or hour > 12:
            return None
        if meridiem == "pm" and hour != 12:
            hour += 12
        if meridiem == "am" and hour == 12:
            hour = 0
    elif hour > 23:
        return None
    if minute < 0 or minute > 59:
        return None
    try:
        zone = ZoneInfo(timezone_name)
    except Exception:
        zone = dt_timezone.utc
        timezone_name = "UTC"
    now_local = datetime.now(zone)
    start_local = (now_local + timedelta(days=1)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    end_local = start_local + timedelta(hours=1)
    return {
        "start": start_local.isoformat(),
        "end": end_local.isoformat(),
        "timezone": timezone_name,
    }


def _recognize_telegram_send_intent(
    message: str,
    *,
    workspace_id: str,
    explicit_credential_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    compact = re.sub(r"\s+", " ", str(message or "").strip())
    if not compact:
        return None
    match = re.match(
        r"(?is)^\s*send(?:\s+(?:a|the))?\s+telegram\s+message(?:\s+to\s+(?P<target>.+?))?\s+(?:saying|with\s+text|with\s+message|that\s+says)\s+(?P<text>.+?)\s*$",
        compact,
    )
    if not match:
        return None
    body_text = _strip_wrapping_quotes(str(match.group("text") or "").strip())
    if not body_text:
        return None
    binding = _select_runtime_usable_connector_binding(
        workspace_id,
        "telegram_bot",
        explicit_credential_id=explicit_credential_id,
    )
    if not isinstance(binding, dict):
        return None
    credential_id = str(binding.get("id") or "").strip()
    if not credential_id:
        return None
    try:
        secret = resolve_vault_credential(credential_id, workspace_id)
    except Exception:
        return None
    chat_id = str(secret.get("chat_id") or "").strip()
    if not chat_id:
        return None
    target_label = _strip_wrapping_quotes(str(match.group("target") or "").strip()) or str(binding.get("label") or "").strip() or chat_id
    workflow_definition = _build_connector_action_workflow(
        connector_id="telegram_bot",
        action_id="send_message",
        label="Send Telegram message",
        config={
            "connector_credential_id": credential_id,
            "chat_id": chat_id,
            "text": body_text,
            "target_label": target_label,
        },
    )
    return {
        "workflow_definition": workflow_definition,
        "connector_credential_id": credential_id,
        "connector_write_intent": {
            "version": 1,
            "connector": "telegram_bot",
            "action_id": "send_message",
            "target_system": "telegram_bot",
            "target_identity": {"chat_id": chat_id},
            "target_label": target_label,
            "payload": {"text": body_text},
        },
    }


def _recognize_email_write_intent(
    message: str,
    *,
    workspace_id: str,
    explicit_credential_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    compact = re.sub(r"\s+", " ", str(message or "").strip())
    if not compact:
        return None
    binding = _select_runtime_usable_connector_binding(
        workspace_id,
        "google_workspace",
        explicit_credential_id=explicit_credential_id,
    )
    if not isinstance(binding, dict):
        return None
    credential_id = str(binding.get("id") or "").strip()
    if not credential_id:
        return None
    match = re.match(
        r"(?is)^\s*(?P<mode>send|draft)(?:\s+(?:an?|the))?\s+email\s+to\s+(?P<recipient>[^\s]+@[^\s]+?)(?:\s+subject\s+(?P<subject>.+?))?\s+(?:saying|with\s+message|with\s+body|body)\s+(?P<body>.+?)\s*$",
        compact,
    )
    recipient = ""
    body_text = ""
    action_id = "draft_email"
    subject = ""
    if match:
        recipient = _strip_trailing_punctuation(_strip_wrapping_quotes(str(match.group("recipient") or "").strip()))
        body_text = _strip_wrapping_quotes(str(match.group("body") or "").strip())
        action_id = "draft_email" if str(match.group("mode") or "").strip().lower() == "draft" else "send_email"
        subject = _strip_wrapping_quotes(str(match.group("subject") or "").strip())
    else:
        natural_self_match = re.match(
            r"(?is)^\s*(?P<mode>send|draft)(?:\s+(?:an?|the))?\s+email\s+to\s+(?P<recipient>myself|me)\s+(?P<body>.+?)\s*$",
            compact,
        )
        if not natural_self_match:
            return None
        recipient = _binding_google_email_address(binding)
        body_text = _strip_wrapping_quotes(str(natural_self_match.group("body") or "").strip())
        action_id = "draft_email" if str(natural_self_match.group("mode") or "").strip().lower() == "draft" else "send_email"
        subject = ""
    if not recipient or not body_text:
        return None
    connector_id = "google_workspace"
    subject = subject or _default_email_subject(body_text)
    workflow_definition = _build_connector_action_workflow(
        connector_id=connector_id,
        action_id=action_id,
        label="Send email" if action_id == "send_email" else "Draft email",
        config={
            "connector_credential_id": credential_id,
            "to_email": recipient,
            "subject": subject,
            "text": body_text,
            "target_label": recipient,
        },
    )
    return {
        "workflow_definition": workflow_definition,
        "connector_credential_id": credential_id,
        "connector_write_intent": {
            "version": 1,
            "connector": connector_id,
            "action_id": action_id,
            "target_system": connector_id,
            "target_identity": {"recipient": recipient},
            "target_label": recipient,
            "payload": {"subject": subject, "body": body_text},
        },
    }


def _recognize_calendar_write_intent(
    message: str,
    *,
    workspace_id: str,
    explicit_credential_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    compact = re.sub(r"\s+", " ", str(message or "").strip())
    if not compact:
        return None
    binding = _select_runtime_usable_connector_binding(
        workspace_id,
        "google_workspace",
        explicit_credential_id=explicit_credential_id,
    )
    if not isinstance(binding, dict):
        return None
    credential_id = str(binding.get("id") or "").strip()
    if not credential_id:
        return None
    match = re.match(
        r"(?is)^\s*(?:create|schedule)\s+(?:a\s+)?calendar\s+event(?:\s+titled\s+(?P<title>.+?))?\s+from\s+(?P<start>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)\s+to\s+(?P<end>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)(?:\s+description\s+(?P<description>.+?))?\s*$",
        compact,
    )
    title = ""
    start = ""
    end = ""
    description = ""
    timezone_name = _binding_timezone(binding)
    if match:
        title = _strip_trailing_punctuation(_strip_wrapping_quotes(str(match.group("title") or "").strip())) or "Empyralis event"
        start = str(match.group("start") or "").strip()
        end = str(match.group("end") or "").strip()
        description = _strip_wrapping_quotes(str(match.group("description") or "").strip())
    else:
        natural_match = re.match(
            r"(?is)^\s*(?:create|schedule)(?:\s+(?:a|an))?\s+calendar\s+event\s+for\s+tomorrow\s+at\s+(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<meridiem>am|pm)?\s+(?:called|titled)\s+(?P<title>.+?)\s*$",
            compact,
        )
        if not natural_match:
            return None
        title = _strip_trailing_punctuation(_strip_wrapping_quotes(str(natural_match.group("title") or "").strip())) or "Empyralis event"
        computed = _natural_calendar_range_for_tomorrow(
            hour_text=str(natural_match.group("hour") or "").strip(),
            minute_text=str(natural_match.group("minute") or "").strip(),
            meridiem_text=str(natural_match.group("meridiem") or "").strip(),
            timezone_name=timezone_name,
        )
        if not isinstance(computed, dict):
            return None
        start = str(computed.get("start") or "").strip()
        end = str(computed.get("end") or "").strip()
        timezone_name = str(computed.get("timezone") or timezone_name).strip() or "UTC"
    if not start or not end:
        return None
    workflow_definition = _build_connector_action_workflow(
        connector_id="google_workspace",
        action_id="create_calendar_event",
        label="Create calendar event",
        config={
            "connector_credential_id": credential_id,
            "title": title,
            "start": start,
            "end": end,
            "timezone": timezone_name,
            "description": description,
            "target_label": title,
        },
    )
    return {
        "workflow_definition": workflow_definition,
        "connector_credential_id": credential_id,
        "connector_write_intent": {
            "version": 1,
            "connector": "google_workspace",
            "action_id": "create_calendar_event",
            "target_system": "google_workspace",
            "target_label": title,
            "payload": {"start": start, "end": end, "description": description},
        },
    }


def _bind_obvious_connector_write_intent(
    req: RunStartRequest,
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        return metadata
    if str(req.workflow_id or "").strip():
        return metadata
    if isinstance(metadata.get("workflow_definition"), dict):
        return metadata
    if str(metadata.get("outcome_pack") or "").strip():
        return metadata
    message = str(req.user_goal or "").strip()
    if not message:
        return metadata
    workspace_id = str(req.workspace_id or metadata.get("workspace_id") or "default").strip() or "default"
    explicit_credential_id = str(metadata.get("connector_credential_id") or "").strip() or None
    recognized = (
        _recognize_telegram_send_intent(
            message,
            workspace_id=workspace_id,
            explicit_credential_id=explicit_credential_id,
        )
        or _recognize_email_write_intent(
            message,
            workspace_id=workspace_id,
            explicit_credential_id=explicit_credential_id,
        )
        or _recognize_calendar_write_intent(
            message,
            workspace_id=workspace_id,
            explicit_credential_id=explicit_credential_id,
        )
    )
    if not isinstance(recognized, dict):
        return metadata
    next_metadata = dict(metadata)
    next_metadata["workflow_definition"] = recognized["workflow_definition"]
    next_metadata["connector_write_intent"] = recognized["connector_write_intent"]
    next_metadata["connector_credential_id"] = recognized["connector_credential_id"]
    next_metadata["execution_target"] = EXECUTION_TARGET_CLOUD
    return next_metadata

_safe_int = run_service.safe_int
_normalize_requested_max_iterations = run_service.normalize_requested_max_iterations
_local_execution_requires_start_confirmation = lambda metadata, precheck: run_service.local_execution_requires_start_confirmation(
    metadata,
    precheck,
    local_execution_target=EXECUTION_TARGET_LOCAL_COMPANION,
    local_execution_pack_id=LOCAL_EXECUTION_PACK_ID,
)
_precheck_human_action_labels = run_service.precheck_human_action_labels
_local_execution_confirmation_prompt = run_service.local_execution_confirmation_prompt
_local_execution_block_prompt = run_service.local_execution_block_prompt
_mark_local_execution_tools_approved = run_service.mark_local_execution_tools_approved
_apply_browser_execution_metadata = run_service.apply_browser_execution_metadata


execute_system_run_start_request_via_turn_runtime = build_execute_unowned_system_run_start_request_via_turn_runtime()


def _schedule_run_execution_services(schedule_id: Optional[str] = None) -> run_service.RunExecutionServices:
    return run_service.build_system_run_execution_services(
        prepare_run_start_request=_prepare_run_start_request,
        create_run_from_request=run_service.build_schedule_bound_create_run_from_request(
            _create_run_from_request,
            schedule_id=schedule_id,
        ),
    )


def _execute_scheduled_run_request(req: RunStartRequest, *, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    return execute_system_run_start_request_via_turn_runtime(
        req,
        stamp_request_owner_fn=lambda req, current_user: req,
        services=_schedule_run_execution_services(schedule_id),
    )


def _prepare_run_start_request(req: RunStartRequest) -> Dict[str, Any]:
    return run_service.prepare_legacy_run_start_request(
        req,
        services=run_service.build_runs_core_runtime_preparation_services_from_namespace(
            namespace=globals(),
            engine_registry=ENGINE_REGISTRY,
            engine_validation_errors=ORION_ENGINE_VALIDATION_ERRORS,
            supported_outcome_packs=SUPPORTED_OUTCOME_PACKS,
            normalize_trust_mode=normalize_trust_mode,
            trust_mode_aliases=TRUST_MODE_ALIASES,
            valid_trust_modes=VALID_TRUST_MODES,
            normalize_execution_target=normalize_execution_target,
            valid_execution_targets=VALID_EXECUTION_TARGETS,
            normalize_agent_role=normalize_agent_role,
            resolve_app_permissions=resolve_app_permissions,
            action_policy_from_app_permissions=action_policy_from_app_permissions,
            merge_action_policies=merge_action_policies,
            fetch_workflow_snapshot=fetch_workflow_snapshot,
        ),
    )


def _create_run_from_request(req: RunStartRequest, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    return run_service.create_legacy_run_result_from_request(
        req,
        schedule_id=schedule_id,
        services=run_service.build_runs_core_runtime_request_services_from_namespace(
            namespace=globals(),
            prepare_run_start_request=_prepare_run_start_request,
            decide_execution_target=decide_execution_target,
            apply_execution_route_metadata=apply_execution_route_metadata,
            build_doctor_run_gate=build_doctor_run_gate_from_snapshot,
            agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
            resolve_runtime_policy_mode=resolve_runtime_policy_mode,
            agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
            local_execution_target=EXECUTION_TARGET_LOCAL_COMPANION,
            local_execution_pack_id=LOCAL_EXECUTION_PACK_ID,
            load_created_run=lambda run_id: runs.get(run_id) if isinstance(runs.get(run_id), dict) else {},
            now_iso=lambda: datetime.utcnow().isoformat() + "Z",
            compute_tool_policy_precheck_fallback=lambda: __import__(
                "server_modules.runs_execution",
                fromlist=["_compute_tool_policy_precheck"],
            )._compute_tool_policy_precheck,
            create_run_fallback=lambda: __import__(
                "server_modules.runs_execution",
                fromlist=["create_run"],
            ).create_run,
            begin_run_pending_confirmation_fallback=lambda: _begin_run_pending_confirmation,
        ),
    )

async def list_weekly_schedules(workspace_id: Optional[str] = None):
    with SCHEDULES_LOCK:
        items = list(WEEKLY_SCHEDULES.values())
    if workspace_id:
        items = [item for item in items if str(item.get("workspace_id") or "").strip() == workspace_id]
    items = [item for item in items if item.get("day_of_week") and item.get("time_hhmm")]
    items.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return {"items": [_serialize_schedule_item(item) for item in items]}


async def list_schedules(workspace_id: Optional[str] = None):
    with SCHEDULES_LOCK:
        items = list(WEEKLY_SCHEDULES.values())
    if workspace_id:
        items = [item for item in items if str(item.get("workspace_id") or "").strip() == workspace_id]
    items.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return {"items": [_serialize_schedule_item(item) for item in items]}


async def get_schedule_logs(schedule_id: str):
    with SCHEDULES_LOCK:
        schedule = WEEKLY_SCHEDULES.get(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return {
            "id": schedule_id,
            "name": str(schedule.get("name") or "").strip() or schedule_id,
            "run_log": list(schedule.get("run_log") or [])[-10:],
        }


def _build_schedule_item(
    *,
    schedule_id: str,
    name: str,
    workspace_id: Optional[str],
    enabled: bool,
    cron: str,
    timezone_value: str,
    wake_mode: str,
    delivery: str,
    run_request_payload: Dict[str, Any],
    day_of_week: Optional[str] = None,
    time_hhmm: Optional[str] = None,
) -> Dict[str, Any]:
    now = datetime.utcnow().isoformat() + "Z"
    item = {
        "id": schedule_id,
        "name": name.strip(),
        "workspace_id": _normalize_workspace_id(workspace_id),
        "enabled": bool(enabled),
        "cron": cron.strip(),
        "timezone": _normalized_schedule_timezone(timezone_value),
        "wake_mode": str(wake_mode or "now").strip().lower() or "now",
        "delivery": str(delivery or "announce").strip().lower() or "announce",
        "run_request": run_request_payload,
        "day_of_week": _normalized_weekday(day_of_week) if day_of_week else None,
        "time_hhmm": time_hhmm.strip() if isinstance(time_hhmm, str) and time_hhmm.strip() else None,
        "last_trigger_slot": None,
        "last_trigger_date": None,
        "last_run_id": None,
        "last_run_at": None,
        "last_error": None,
        "next_run_at": None,
        "pending_heartbeat": False,
        "pending_heartbeat_slot": None,
        "run_log": [],
        "created_at": now,
        "updated_at": now,
    }
    item["next_run_at"] = _compute_schedule_next_run_at(item)
    return item


async def create_schedule(body: CronScheduleUpsertRequest):
    body.validate_fields()
    schedule_id = str(uuid.uuid4())
    item = _build_schedule_item(
        schedule_id=schedule_id,
        name=body.name,
        workspace_id=body.workspace_id,
        enabled=body.enabled,
        cron=body.cron,
        timezone_value=body.timezone,
        wake_mode=body.wake_mode,
        delivery=body.delivery,
        run_request_payload=body.run_request.model_dump(),
    )
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES[schedule_id] = item
    _persist_schedules()
    return _serialize_schedule_item(item)

async def create_weekly_schedule(body: WeeklyScheduleUpsertRequest):
    body.validate_fields()
    schedule_id = str(uuid.uuid4())
    item = _build_schedule_item(
        schedule_id=schedule_id,
        name=body.name,
        workspace_id=body.workspace_id,
        enabled=body.enabled,
        cron=_cron_from_weekly(body.day_of_week, body.time_hhmm),
        timezone_value=body.timezone,
        wake_mode=body.wake_mode,
        delivery=body.delivery,
        run_request_payload=body.run_request.model_dump(),
        day_of_week=body.day_of_week,
        time_hhmm=body.time_hhmm,
    )
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES[schedule_id] = item
    _persist_schedules()
    return _serialize_schedule_item(item)


async def update_schedule(schedule_id: str, body: CronSchedulePatchRequest):
    body.validate_fields()
    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        if body.name is not None:
            current["name"] = body.name.strip()
        if body.enabled is not None:
            current["enabled"] = bool(body.enabled)
        if body.cron is not None:
            current["cron"] = body.cron.strip()
            current["day_of_week"] = None
            current["time_hhmm"] = None
        if body.timezone is not None:
            current["timezone"] = _normalized_schedule_timezone(body.timezone)
        if body.wake_mode is not None:
            current["wake_mode"] = str(body.wake_mode).strip().lower()
        if body.delivery is not None:
            current["delivery"] = str(body.delivery).strip().lower()
        if body.run_request is not None:
            current["run_request"] = body.run_request.model_dump()
        current["next_run_at"] = _compute_schedule_next_run_at(current)
        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
        WEEKLY_SCHEDULES[schedule_id] = current
        updated = dict(current)
    _persist_schedules()
    return _serialize_schedule_item(updated)

async def update_weekly_schedule(schedule_id: str, body: WeeklySchedulePatchRequest):
    body.validate_fields()
    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        if body.name is not None:
            current["name"] = body.name.strip()
        if body.enabled is not None:
            current["enabled"] = bool(body.enabled)
        if body.day_of_week is not None:
            current["day_of_week"] = _normalized_weekday(body.day_of_week)
        if body.time_hhmm is not None:
            current["time_hhmm"] = body.time_hhmm.strip()
        if body.day_of_week is not None or body.time_hhmm is not None:
            current["cron"] = _cron_from_weekly(
                str(current.get("day_of_week") or body.day_of_week or "Monday"),
                str(current.get("time_hhmm") or body.time_hhmm or "09:00"),
            )
        if body.timezone is not None:
            current["timezone"] = _normalized_schedule_timezone(body.timezone)
        if body.wake_mode is not None:
            current["wake_mode"] = str(body.wake_mode).strip().lower()
        if body.delivery is not None:
            current["delivery"] = str(body.delivery).strip().lower()
        if body.run_request is not None:
            current["run_request"] = body.run_request.model_dump()
        current["next_run_at"] = _compute_schedule_next_run_at(current)
        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
        WEEKLY_SCHEDULES[schedule_id] = current
        updated = dict(current)
    _persist_schedules()
    return _serialize_schedule_item(updated)

async def delete_schedule(schedule_id: str):
    with SCHEDULES_LOCK:
        if schedule_id not in WEEKLY_SCHEDULES:
            raise HTTPException(status_code=404, detail="Schedule not found")
        deleted = WEEKLY_SCHEDULES.pop(schedule_id)
    _persist_schedules()
    return {"status": "ok", "deleted": {"id": deleted.get("id"), "name": deleted.get("name")}}


async def delete_weekly_schedule(schedule_id: str):
    return await delete_schedule(schedule_id)


async def trigger_schedule_now(schedule_id: str):
    with SCHEDULES_LOCK:
        schedule = WEEKLY_SCHEDULES.get(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        req_payload = dict(schedule.get("run_request") or {})
    try:
        req = RunStartRequest(**req_payload)
        result = _execute_scheduled_run_request(req, schedule_id=schedule_id)
    except HTTPException:
        raise
    except Exception as exc:
        with SCHEDULES_LOCK:
            current = WEEKLY_SCHEDULES.get(schedule_id)
            if current is not None:
                current = _append_schedule_run_log(
                    current,
                    status="failed",
                    detail=str(exc),
                )
                current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                WEEKLY_SCHEDULES[schedule_id] = current
        _persist_schedules()
        raise HTTPException(status_code=400, detail=str(exc))

    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is not None:
            current["pending_heartbeat"] = False
            current["pending_heartbeat_slot"] = None
            current = _append_schedule_run_log(
                current,
                status="started",
                run_id=str(result.get("run_id") or "").strip() or None,
                detail="Scheduled run started manually.",
            )
            current["updated_at"] = datetime.utcnow().isoformat() + "Z"
            WEEKLY_SCHEDULES[schedule_id] = current
    _persist_schedules()
    return result


async def trigger_weekly_schedule_now(schedule_id: str):
    return await trigger_schedule_now(schedule_id)

async def get_runtime_metrics():
    _cleanup_stale_local_claims()
    with METRICS_LOCK:
        snapshot = dict(RUNTIME_METRICS)

    started = int(snapshot.get("runs_started", 0))
    completed = int(snapshot.get("runs_completed", 0))
    failed = int(snapshot.get("runs_failed", 0))
    timeout = int(snapshot.get("runs_timeout", 0))
    finished_total = completed + failed + timeout
    completion_rate = (completed / finished_total) if finished_total > 0 else 0.0

    run_duration_count = int(snapshot.get("run_duration_count", 0))
    run_duration_sum_ms = float(snapshot.get("run_duration_sum_ms", 0.0))
    avg_run_duration_ms = (run_duration_sum_ms / run_duration_count) if run_duration_count > 0 else 0.0

    first_value_count = int(snapshot.get("first_value_count", 0))
    first_value_sum_ms = float(snapshot.get("first_value_sum_ms", 0.0))
    avg_first_value_ms = (first_value_sum_ms / first_value_count) if first_value_count > 0 else 0.0

    hitl_wait_count = int(snapshot.get("hitl_wait_count", 0))
    hitl_wait_sum_ms = float(snapshot.get("hitl_wait_sum_ms", 0.0))
    avg_hitl_wait_ms = (hitl_wait_sum_ms / hitl_wait_count) if hitl_wait_count > 0 else 0.0

    active_runs = 0
    waiting_runs = 0
    for run in runs.values():
        status = run.get("status")
        if status in ["starting", "running", "running_local", "queued_local", "waiting_for_input"]:
            active_runs += 1
        if status == "waiting_for_input":
            waiting_runs += 1
    with SCHEDULES_LOCK:
        schedule_count = len(WEEKLY_SCHEDULES)
    with LOCAL_QUEUE_LOCK:
        local_pending = len(LOCAL_PENDING_RUN_IDS)
        local_claimed = len(LOCAL_CLAIMED_RUNS)
        now = _utc_now()
        known_workers = len(LOCAL_WORKER_REGISTRY)
        online_workers = len([record for record in LOCAL_WORKER_REGISTRY.values() if isinstance(record, dict) and _is_worker_online(record, now)])

    return {
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_insecure_dev_override": bool(ORION_DEV_INSECURE_NO_AUTH),
        "scheduler": {
            "enabled": ORION_SCHEDULER_ENABLED,
            "poll_seconds": ORION_SCHEDULER_POLL_SECONDS,
            "weekly_schedules": len([item for item in WEEKLY_SCHEDULES.values() if item.get("day_of_week") and item.get("time_hhmm")]),
            "active_schedules": schedule_count,
        },
        "local_companion": {
            "enabled": ORION_LOCAL_COMPANION_ENABLED,
            "lease_seconds": ORION_LOCAL_LEASE_SECONDS,
            "pending_runs": local_pending,
            "claimed_runs": local_claimed,
            "known_workers": known_workers,
            "online_workers": online_workers,
        },
        "runs": {
            "started": started,
            "completed": completed,
            "failed": failed,
            "timeout": timeout,
            "active": active_runs,
            "waiting_for_input": waiting_runs,
            "completion_rate": round(completion_rate, 4),
        },
        "kpis": {
            "avg_run_duration_ms": round(avg_run_duration_ms, 2),
            "avg_time_to_first_value_ms": round(avg_first_value_ms, 2),
            "avg_human_wait_ms": round(avg_hitl_wait_ms, 2),
        },
    }

async def get_runtime_kpis():
    return await get_runtime_metrics()

async def get_local_run_queue(workspace_id: Optional[str] = None, limit: int = 50):
    return handle_get_local_run_queue(workspace_id, limit)

async def get_local_workers_status():
    return handle_get_local_workers_status()

async def heartbeat_local_worker(worker_id: str, payload: Optional[LocalWorkerHeartbeatPayload] = None):
    return handle_heartbeat_local_worker(worker_id, payload)

async def claim_local_run(body: Optional[LocalRunClaimRequest] = None):
    return handle_claim_local_run(body)

async def heartbeat_local_run(run_id: uuid.UUID, payload: Optional[LocalRunHeartbeatPayload] = None):
    return handle_heartbeat_local_run(run_id, payload)

async def complete_local_run(run_id: uuid.UUID, payload: LocalRunCompletePayload):
    return handle_complete_local_run(run_id, payload)

async def fail_local_run(run_id: uuid.UUID, payload: LocalRunFailPayload):
    return handle_fail_local_run(run_id, payload)
