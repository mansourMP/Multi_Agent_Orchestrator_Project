from __future__ import annotations

import queue
from typing import Any, Dict, Optional, Tuple


EXECUTION_HANDLE_KEYS = {
    "logs",
    "input_queue",
    "thread_id",
}

MONOTONIC_RUNTIME_KEYS = {
    "_started_mono",
    "_finished_mono",
    "_first_value_mono",
    "_hitl_wait_start_mono",
}

ACTIVE_EXECUTION_HANDLE_STATUSES = {
    "starting",
    "queued",
    "queued_local",
    "planning",
    "executing",
    "running_local",
    "machine_allocating",
    "retrying",
    "blocked",
    "waiting_for_input",
}


def build_run_record(
    *,
    run_id: str,
    engine: str,
    context: Dict[str, Any],
    now_iso: str,
    memory_enabled: bool,
    memory_updated_at: str,
    active_profile_id: Optional[str],
    active_profile_label: Optional[str],
    active_provider: Optional[str],
    active_model: Optional[str],
) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "status": "starting",
        "engine": engine,
        "context": context,
        "created_at": now_iso,
        "updated_at": now_iso,
        "result": None,
        "result_data": None,
        "duration_ms": None,
        "_archived": False,
        "_event_seq": 0,
        "events": [],
        "node_states": None,
        "tool_policy_audit": [],
        "memory_trace": {
            "enabled": bool(memory_enabled),
            "reads": [],
            "writes": [],
            "last_error": None,
            "updated_at": memory_updated_at,
        },
        "active_profile_id": active_profile_id or None,
        "active_profile_label": active_profile_label or None,
        "active_provider": active_provider or None,
        "active_model": active_model or None,
        "active_adapter": None,
        "_hitl_wait_total_ms": 0.0,
    }


def attach_execution_handle(
    run: Dict[str, Any],
    *,
    log_queue: Any,
    input_queue: Any,
    started_mono: Optional[float] = None,
    finished_mono: Optional[float] = None,
    first_value_mono: Optional[float] = None,
    hitl_wait_start_mono: Optional[float] = None,
    thread_id: Optional[int] = None,
    event_seq: Optional[int] = None,
) -> Dict[str, Any]:
    run["logs"] = log_queue
    run["input_queue"] = input_queue
    run["thread_id"] = thread_id
    run["_started_mono"] = started_mono
    run["_finished_mono"] = finished_mono
    run["_first_value_mono"] = first_value_mono
    run["_hitl_wait_start_mono"] = hitl_wait_start_mono
    if event_seq is not None:
        run["_event_seq"] = int(event_seq)
    return run


def durable_run_payload(run_id: str, run: Dict[str, Any], *, json_safe) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"run_id": str(run_id or "").strip()}
    for key, value in run.items():
        if key in EXECUTION_HANDLE_KEYS or key in MONOTONIC_RUNTIME_KEYS:
            continue
        payload[key] = value
    if "thread_id" not in payload:
        payload["thread_id"] = None
    if "_archived" not in payload:
        payload["_archived"] = False
    return json_safe(payload)


def should_restore_execution_handle(item: Dict[str, Any]) -> bool:
    status = str((item or {}).get("status") or "").strip().lower()
    return status in ACTIVE_EXECUTION_HANDLE_STATUSES


def restore_run_state(
    item: Dict[str, Any],
    *,
    json_safe,
    memory_enabled: bool,
    now_iso: str,
    hydrate_execution_handle: bool,
) -> Optional[Tuple[str, Dict[str, Any]]]:
    payload = json_safe(item)
    if not isinstance(payload, dict):
        return None
    run_id = str(payload.pop("run_id", "") or "").strip()
    if not run_id:
        return None
    events = payload.get("events") if isinstance(payload.get("events"), list) else []
    event_seq = int(payload.get("_event_seq") or 0)
    for entry in events:
        if not isinstance(entry, dict):
            continue
        try:
            event_seq = max(event_seq, int(entry.get("seq") or 0))
        except Exception:
            continue
    run: Dict[str, Any] = dict(payload)
    run["run_id"] = run_id
    run["_archived"] = bool(run.get("_archived", False))
    run["_event_seq"] = event_seq
    if not isinstance(run.get("events"), list):
        run["events"] = []
    if not isinstance(run.get("tool_policy_audit"), list):
        run["tool_policy_audit"] = []
    if not isinstance(run.get("memory_trace"), dict):
        run["memory_trace"] = {
            "enabled": memory_enabled,
            "reads": [],
            "writes": [],
            "last_error": None,
            "updated_at": now_iso,
        }
    if "_hitl_wait_total_ms" not in run:
        run["_hitl_wait_total_ms"] = 0.0
    if hydrate_execution_handle:
        attach_execution_handle(
            run,
            log_queue=queue.Queue(),
            input_queue=queue.Queue(),
            started_mono=None,
            finished_mono=None,
            first_value_mono=None,
            hitl_wait_start_mono=None,
            thread_id=None,
            event_seq=event_seq,
        )
    else:
        run.pop("logs", None)
        run.pop("input_queue", None)
        run["thread_id"] = None
    return run_id, run
