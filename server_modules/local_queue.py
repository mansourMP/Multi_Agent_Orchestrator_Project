"""
Local worker queue and heartbeat logic.
Extracted from server.py to reduce hotspot size.
"""

from __future__ import annotations

import hashlib
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from server_modules import machine_lease_service, outbox_service, safe_mode_service, worker_dispatch_service
from server_modules.telemetry import mark_machine_revocation_requested, observe_machine_revocation_propagated

_server = None
LOCAL_RUN_STILL_WORKING_INTERVAL_SECONDS = 15
LOCAL_RUN_WORKER_LOST_TIMEOUT_SECONDS = 30
LOCAL_RUNTIME_WATCHDOG_INTERVAL_SECONDS = 5
LOCAL_CHECKPOINT_RECOVERY_MAX_AUTO_RETRIES = 3
LOCAL_CHECKPOINT_RECOVERY_BACKOFF_SECONDS = [0, 10, 30]
MACHINE_ENROLLMENT_TIMEOUT_SECONDS = 300
_COLD_BOOT_RECOVERY_DONE = False
_EXPIRED_LEASE_RECOVERY_DONE = False
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
    event: Optional[Dict[str, Any]] = None


class LocalRunControlStatePayload(BaseModel):
    worker_id: Optional[str] = None


class LocalWorkerHeartbeatPayload(BaseModel):
    current_run_id: Optional[str] = None
    note: Optional[str] = None
    permission_probe: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class LocalMachineControlPayload(BaseModel):
    reason: Optional[str] = None


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


def _manual_takeover_active(run: Dict[str, Any]) -> bool:
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else {}
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return bool(result_data.get("manual_takeover") or metadata.get("manual_takeover"))


def _local_execution_checkpoint_payload(run: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    checkpoint = run.get("local_execution_checkpoint")
    if isinstance(checkpoint, dict) and checkpoint:
        return dict(checkpoint)
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else {}
    result_checkpoint = result_data.get("local_execution_checkpoint")
    if isinstance(result_checkpoint, dict) and result_checkpoint:
        return dict(result_checkpoint)
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    metadata_checkpoint = metadata.get("local_execution_checkpoint")
    if isinstance(metadata_checkpoint, dict) and metadata_checkpoint:
        return dict(metadata_checkpoint)
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}
    operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
    if operations:
        return {
            "kind": "local_execution_v1",
            "next_operation_index": 0,
            "total_operations": len(operations),
            "phase": "planned",
            "mode": "observing",
        }
    return None


def _update_run_progress_from_structured_event(run: Dict[str, Any], event_name: str, event_data: Optional[Dict[str, Any]]) -> None:
    if event_name != "computer_action" or not isinstance(event_data, dict):
        return
    step_number = event_data.get("step_number")
    step_total = event_data.get("step_total")
    phase = str(event_data.get("phase") or "").strip().lower() or "completed"
    label = str(event_data.get("label") or "").strip() or "Computer action"
    next_operation_index: Optional[int] = None
    if isinstance(step_number, (int, float)):
        normalized_step = max(1, int(step_number))
        if phase == "completed":
            next_operation_index = normalized_step
        else:
            next_operation_index = normalized_step - 1
    checkpoint: Dict[str, Any] = {
        "kind": "local_execution_v1",
        "phase": phase,
        "mode": str(event_data.get("mode") or "").strip().lower() or "acting",
        "current_label": label,
        "action_type": str(event_data.get("action_type") or "").strip().lower() or None,
        "updated_at": _server._utc_now_iso(),
    }
    if next_operation_index is not None:
        checkpoint["next_operation_index"] = max(0, next_operation_index)
    if isinstance(step_total, (int, float)):
        checkpoint["total_operations"] = max(1, int(step_total))
    run["local_execution_checkpoint"] = checkpoint
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    metadata["local_execution_checkpoint"] = checkpoint
    metadata["local_execution_resume_supported"] = True
    context["metadata"] = metadata
    run["context"] = context


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


def _emit_machine_outbox_event(action: str, record: Dict[str, Any], *, error: Optional[str] = None) -> None:
    _init()
    if not isinstance(record, dict):
        return
    machine_id = str(record.get("machine_id") or record.get("runtime_id") or "").strip()
    if not machine_id:
        return
    payload = dict(record)
    payload.pop("enrollment_token_hash", None)
    payload.pop("session_token", None)
    try:
        outbox_service.emit_machine_event(
            machine_id=machine_id,
            tenant_id=str(record.get("tenant_id") or "default").strip() or "default",
            workspace_id=str(record.get("workspace_id") or "default").strip() or "default",
            action=action,
            machine_payload=payload,
            trace_id=str(record.get("trace_id") or record.get("session_token") or machine_id).strip(),
            error=error,
        )
    except Exception:
        return


def _machine_runtime_base_url() -> str:
    _init()
    value = str(
        getattr(_server, "EMPYRALIST_WORKFLOW_API_URL", "")
        or getattr(_server, "ORION_API_URL", "")
        or "http://127.0.0.1:8001"
    ).strip().rstrip("/")
    return value or "http://127.0.0.1:8001"


def _set_enrollment_state(
    record: Dict[str, Any],
    state: str,
    *,
    error: Optional[str] = None,
    now_iso: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    timestamp = str(now_iso or _server._utc_now_iso())
    normalized = str(state or "").strip().lower() or "requested"
    record["enrollment_state"] = normalized
    record["enrollment_updated_at"] = timestamp
    if not record.get("enrollment_requested_at"):
        record["enrollment_requested_at"] = timestamp
    if normalized == "installing" and not record.get("installing_started_at"):
        record["installing_started_at"] = timestamp
    if normalized == "starting" and not record.get("starting_started_at"):
        record["starting_started_at"] = timestamp
    if normalized == "registering" and not record.get("registering_started_at"):
        record["registering_started_at"] = timestamp
    if normalized == "healthy":
        record["bootstrap_completed_at"] = timestamp
        record["bootstrap_error"] = None
    elif normalized == "failed":
        record["bootstrap_error"] = str(error or record.get("bootstrap_error") or "bootstrap_failed")[:400]
    elif error is not None:
        record["bootstrap_error"] = str(error)[:400]
    return record


def _machine_control_state(record: Dict[str, Any]) -> str:
    state = str(record.get("control_state") or "").strip().lower()
    if state in {"suspended", "revoked"}:
        return state
    if record.get("revoked_at"):
        return "revoked"
    if record.get("suspended_at"):
        return "suspended"
    return "active"


def _set_machine_control_state(
    record: Dict[str, Any],
    state: str,
    *,
    reason: Optional[str] = None,
    now_iso: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    timestamp = str(now_iso or _server._utc_now_iso())
    normalized = str(state or "").strip().lower() or "active"
    record["control_state"] = normalized
    record["control_state_updated_at"] = timestamp
    if normalized == "suspended":
        record["suspended_at"] = timestamp
        record["suspended_reason"] = str(reason or record.get("suspended_reason") or "Suspended by operator.")[:280]
    elif normalized == "revoked":
        record["revoked_at"] = timestamp
        record["revoked_reason"] = str(reason or record.get("revoked_reason") or "Revoked by operator.")[:280]
    elif normalized == "active":
        record["suspended_at"] = None
        record["suspended_reason"] = None
    return record


def _normalize_permission_probe_entry(
    *,
    raw_entry: Any,
    fallback_status: str,
    fallback_source: str,
    fallback_detail: str = "",
) -> Dict[str, Any]:
    allowed_statuses = {"granted", "denied", "unsupported", "unknown"}
    if isinstance(raw_entry, dict):
        status = str(raw_entry.get("status") or "").strip().lower()
        if not status and isinstance(raw_entry.get("granted"), bool):
            status = "granted" if bool(raw_entry.get("granted")) else "denied"
        if status not in allowed_statuses:
            status = fallback_status
        source = str(raw_entry.get("source") or fallback_source).strip() or fallback_source
        detail = str(raw_entry.get("detail") or fallback_detail).strip()
        updated_at = str(raw_entry.get("updated_at") or "").strip() or None
        return {
            "status": status,
            "source": source,
            "detail": detail,
            "updated_at": updated_at,
        }
    if isinstance(raw_entry, bool):
        return {
            "status": "granted" if raw_entry else "denied",
            "source": fallback_source,
            "detail": fallback_detail,
            "updated_at": None,
        }
    return {
        "status": fallback_status,
        "source": fallback_source,
        "detail": fallback_detail,
        "updated_at": None,
    }


def _permission_probe_defaults(record: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    capabilities = {str(item).strip().lower() for item in (record.get("capabilities") or []) if str(item).strip()}
    execution_targets = {str(item).strip().lower() for item in (record.get("execution_targets") or []) if str(item).strip()}
    runtime_type = str(record.get("runtime_type") or "").strip().lower()
    local_companion_like = runtime_type == "local_companion" or "local_companion" in execution_targets
    control_capability = any(capability.startswith("computer_control.") for capability in capabilities)
    browser_capability = "browser_automation.interactive" in capabilities
    shell_capability = "shell.execute" in capabilities
    screenshot_capability = "screenshot.capture" in capabilities
    return {
        "screen_recording": _normalize_permission_probe_entry(
            raw_entry=None,
            fallback_status="unknown" if (screenshot_capability or local_companion_like) else "unsupported",
            fallback_source="probe_pending" if (screenshot_capability or local_companion_like) else "capability_manifest",
            fallback_detail="Waiting for worker probe." if (screenshot_capability or local_companion_like) else "Screen capture is not advertised by this machine.",
        ),
        "accessibility": _normalize_permission_probe_entry(
            raw_entry=None,
            fallback_status="unknown" if (control_capability or browser_capability or local_companion_like) else "unsupported",
            fallback_source="probe_pending" if (control_capability or browser_capability or local_companion_like) else "capability_manifest",
            fallback_detail="Waiting for worker probe." if (control_capability or browser_capability or local_companion_like) else "Accessibility-driven control is not advertised by this machine.",
        ),
        "browser_session": _normalize_permission_probe_entry(
            raw_entry=None,
            fallback_status="granted" if (browser_capability or local_companion_like) else "unsupported",
            fallback_source="capability_manifest",
            fallback_detail="Browser/session automation available." if (browser_capability or local_companion_like) else "Browser/session automation is not advertised by this machine.",
        ),
        "shell": _normalize_permission_probe_entry(
            raw_entry=None,
            fallback_status="granted" if shell_capability else "unsupported",
            fallback_source="capability_manifest",
            fallback_detail="Shell execution available." if shell_capability else "Shell execution is not advertised by this machine.",
        ),
    }


def _normalized_permission_probe(record: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    defaults = _permission_probe_defaults(record)
    raw_probe = record.get("permission_probe") if isinstance(record.get("permission_probe"), dict) else {}
    return {
        key: _normalize_permission_probe_entry(
            raw_entry=raw_probe.get(key),
            fallback_status=str(defaults[key].get("status") or "unknown"),
            fallback_source=str(defaults[key].get("source") or "probe_pending"),
            fallback_detail=str(defaults[key].get("detail") or ""),
        )
        for key in defaults
    }


def _apply_permission_probe(record: Dict[str, Any], probe: Optional[Dict[str, Dict[str, Any]]]) -> Dict[str, Any]:
    if isinstance(probe, dict) and probe:
        record["permission_probe"] = dict(probe)
        _init()
        record["permission_probe_updated_at"] = _server._utc_now_iso()
    elif not isinstance(record.get("permission_probe"), dict):
        record["permission_probe"] = {}
    return record


def _machine_policy_status(record: Dict[str, Any]) -> Dict[str, Any]:
    return safe_mode_service.resolve_machine_policy_status(
        tenant_id=str(record.get("tenant_id") or "default").strip() or "default",
        workspace_id=str(record.get("workspace_id") or "default").strip() or "default",
        machine_id=str(record.get("machine_id") or record.get("runtime_id") or "").strip() or None,
        capability_ids=list(record.get("capabilities") or []),
    )


def _assert_enrollment_token(record: Dict[str, Any], provided_token: Optional[str]) -> str:
    _init()
    provided = str(provided_token or "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="Machine enrollment token is required.")
    expected_hash = str(record.get("enrollment_token_hash") or "").strip()
    if not expected_hash:
        raise HTTPException(status_code=409, detail="Machine enrollment is not pending.")
    actual_hash = hashlib.sha256(provided.encode("utf-8")).hexdigest()
    if actual_hash != expected_hash:
        raise HTTPException(status_code=401, detail="Machine enrollment token is invalid.")
    return provided


def _mark_ghost_enrollments_failed() -> List[str]:
    _init()
    now = _server._utc_now()
    failed_machine_ids: List[str] = []
    changed = False
    with _server.LOCAL_QUEUE_LOCK:
        for machine_id, record in list(_server.LOCAL_WORKER_REGISTRY.items()):
            if not isinstance(record, dict):
                continue
            state = str(record.get("enrollment_state") or "").strip().lower()
            if state in {"", "healthy", "failed"}:
                continue
            requested_at = _server._parse_utc_ts(record.get("enrollment_requested_at"))
            if requested_at is None:
                continue
            if (now - requested_at).total_seconds() <= MACHINE_ENROLLMENT_TIMEOUT_SECONDS:
                continue
            last_seen_at = _server._parse_utc_ts(record.get("last_seen_at"))
            if last_seen_at is not None and _is_worker_online(record, now):
                continue
            _set_enrollment_state(
                record,
                "failed",
                error="Machine bootstrap timed out before the worker heartbeated.",
                now_iso=_server._utc_now_iso(),
            )
            _server.LOCAL_WORKER_REGISTRY[machine_id] = record
            failed_machine_ids.append(machine_id)
            _emit_machine_outbox_event(
                "bootstrap_failed",
                record,
                error="Machine bootstrap timed out before the worker heartbeated.",
            )
            changed = True
    if changed:
        _persist_local_runtime_state()
    return failed_machine_ids


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
    permission_probe: Optional[Dict[str, Dict[str, Any]]] = None,
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
        _apply_permission_probe(record, permission_probe)
        _server.LOCAL_WORKER_REGISTRY[worker] = record
    _persist_local_runtime_state()
    _emit_machine_outbox_event("runtime_registered", record)
    return {
        "runtime_id": worker,
        "machine_id": record.get("machine_id") or worker,
        "instance_id": record.get("instance_id"),
        "capability_digest": record.get("capability_digest"),
        **session,
    }


def create_machine_enrollment_intent(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    runtime_type: str = "local_companion",
    display_name: Optional[str] = None,
    platform: Optional[str] = None,
    policy_mode: Optional[str] = None,
    capabilities: Optional[List[str]] = None,
    execution_targets: Optional[List[str]] = None,
    note: Optional[str] = None,
    machine_enrollment_scope: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    runtime_id = str(machine_id or "").strip() or f"machine-{uuid.uuid4().hex[:8]}"
    token = _server.secrets.token_urlsafe(24)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now_iso = _server._utc_now_iso()
    with _server.LOCAL_QUEUE_LOCK:
        previous = _server.LOCAL_WORKER_REGISTRY.get(runtime_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_id), dict) else {}
        record = machine_lease_service.build_runtime_registration_record(
            runtime_id,
            previous_record=previous,
            runtime_type=runtime_type,
            display_name=display_name,
            platform=platform,
            policy_mode=(policy_mode or previous.get("policy_mode") or _server.ORION_RUNTIME_POLICY_MODE_DEFAULT),
            capabilities=capabilities,
            execution_targets=execution_targets or ["local_companion"],
            instance_id=runtime_id,
            capability_digest=None,
            lease_seconds=_server.ORION_LOCAL_LEASE_SECONDS,
            now_iso=now_iso,
            normalize_policy_mode_fn=_server.normalize_policy_mode,
            capability_digest_fn=_capability_digest,
        )
        record["current_run_id"] = None
        record["tenant_id"] = str(tenant_id or previous.get("tenant_id") or "default").strip() or "default"
        record["workspace_id"] = str(workspace_id or previous.get("workspace_id") or "default").strip() or "default"
        record["machine_enrollment_scope"] = str(
            machine_enrollment_scope or previous.get("machine_enrollment_scope") or "workspace"
        ).strip() or "workspace"
        record["note"] = str(note or "machine_enrollment_requested")[:280]
        record["enrollment_token_hash"] = token_hash
        record["bootstrap_error"] = None
        _set_machine_control_state(record, "active", now_iso=now_iso)
        _set_enrollment_state(record, "requested", now_iso=now_iso)
        _set_enrollment_state(record, "awaiting_local_acceptance", now_iso=now_iso)
        _server.LOCAL_WORKER_REGISTRY[runtime_id] = record
    _persist_local_runtime_state()
    _emit_machine_outbox_event("enrollment_requested", record)
    return {
        "ok": True,
        "machine_id": runtime_id,
        "tenant_id": str(record.get("tenant_id") or "default").strip() or "default",
        "workspace_id": str(record.get("workspace_id") or "default").strip() or "default",
        "token": token,
        "runtime_url": _machine_runtime_base_url(),
        "worker_config": {
            "worker_id": runtime_id,
            "tenant_id": str(record.get("tenant_id") or "default").strip() or "default",
            "workspace_id": str(record.get("workspace_id") or "default").strip() or "default",
            "runtime_type": runtime_type,
            "display_name": str(display_name or runtime_id).strip() or runtime_id,
            "execution_targets": list(execution_targets or ["local_companion"]),
            "policy_mode": str(policy_mode or _server.ORION_RUNTIME_POLICY_MODE_DEFAULT),
            "machine_enrollment_scope": str(record.get("machine_enrollment_scope") or "workspace").strip() or "workspace",
        },
    }


def update_machine_enrollment_state(
    machine_id: str,
    *,
    enrollment_token: Optional[str] = None,
    state: str,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    runtime_id = str(machine_id or "").strip()
    if not runtime_id:
        raise HTTPException(status_code=400, detail="machine_id is required.")
    with _server.LOCAL_QUEUE_LOCK:
        record = _server.LOCAL_WORKER_REGISTRY.get(runtime_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_id), dict) else None
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Machine not found.")
        _assert_enrollment_token(record, enrollment_token)
        _set_enrollment_state(record, state, error=error)
        _server.LOCAL_WORKER_REGISTRY[runtime_id] = record
    _persist_local_runtime_state()
    _emit_machine_outbox_event("enrollment_state_updated", record, error=error)
    return {"ok": True, "machine_id": runtime_id, "enrollment_state": str(state or "").strip().lower()}


def complete_machine_bootstrap(
    machine_id: str,
    *,
    enrollment_token: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    runtime_id = str(machine_id or "").strip()
    if not runtime_id:
        raise HTTPException(status_code=400, detail="machine_id is required.")
    with _server.LOCAL_QUEUE_LOCK:
        record = _server.LOCAL_WORKER_REGISTRY.get(runtime_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_id), dict) else None
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Machine not found.")
        _assert_enrollment_token(record, enrollment_token)
        if not _is_worker_online(record, _server._utc_now()):
            raise HTTPException(status_code=409, detail="Machine worker has not heartbeated yet.")
        _set_enrollment_state(record, "healthy")
        record["enrollment_token_hash"] = None
        _server.LOCAL_WORKER_REGISTRY[runtime_id] = record
    _persist_local_runtime_state()
    _emit_machine_outbox_event("bootstrap_completed", record)
    status_payload = handle_get_local_workers_status()
    items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
    machine = next(
        (
            item
            for item in items
            if isinstance(item, dict)
            and str(item.get("machine_id") or item.get("runtime_id") or "").strip() == runtime_id
        ),
        None,
    )
    return {"ok": True, "machine_id": runtime_id, "machine": machine}


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
    from server_modules import run_state_repository

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

    recoverable_states = [
        "queued",
        "planning",
        "executing",
        "machine_allocating",
        "retrying",
        "blocked",
    ]
    recoverable_run_ids = {
        str(item.get("run_id") or "").strip()
        for item in run_state_repository.sync_list_live_runs_by_state(recoverable_states)
        if isinstance(item, dict) and str(item.get("run_id") or "").strip()
    }

    for run_id, run in list(_server.runs.items()):
        if not isinstance(run, dict):
            continue
        if recoverable_run_ids and str(run_id or "").strip() not in recoverable_run_ids:
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


def recover_expired_worker_leases_on_startup() -> List[str]:
    global _EXPIRED_LEASE_RECOVERY_DONE
    _init()
    if _EXPIRED_LEASE_RECOVERY_DONE:
        return []
    from server_modules import run_state_repository

    recovered: List[str] = []
    expired_claims = run_state_repository.sync_list_expired_local_claims()
    for item in expired_claims or []:
        if not isinstance(item, dict):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if not run_id:
            continue
        run_state_repository.sync_release_claim(run_id)
        with _server.LOCAL_QUEUE_LOCK:
            _server.LOCAL_CLAIMED_RUNS.pop(run_id, None)
        run = _server.runs.get(run_id)
        if not isinstance(run, dict):
            continue
        status = str(run.get("status") or "").strip().lower()
        if status in {"completed", "failed", "timeout", "stopped", "cancelled"}:
            continue
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        selected_target = str(
            metadata.get("execution_target_selected")
            or metadata.get("execution_target")
            or ""
        ).strip().lower()
        if selected_target not in {"local", "local_companion"} and status not in {"running_local", "queued_local", "starting"}:
            continue
        machine_lease_service.clear_active_machine_lease_binding(run)
        run["local_worker_id"] = None
        run["local_claimed_at"] = None
        run["local_last_heartbeat_at"] = None
        _server.set_run_status(run_id, "queued_local")
        with _server.LOCAL_QUEUE_LOCK:
            if run_id not in _server.LOCAL_PENDING_RUN_IDS:
                _server.LOCAL_PENDING_RUN_IDS.append(run_id)
        _persist_local_runtime_state()
        log_queue = run.get("logs")
        if log_queue is not None:
            _server.emit_log(
                log_queue,
                "warn",
                "Recovered expired worker lease on startup and requeued the run.",
                event="local_claim_requeued_startup",
                data={
                    "run_id": run_id,
                    "worker_id": str(item.get("worker_id") or "").strip() or None,
                    "ttl_seconds": int(item.get("ttl") or 0),
                    "claimed_at": item.get("claimed_at"),
                },
            )
        recovered.append(run_id)
    _EXPIRED_LEASE_RECOVERY_DONE = True
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
    _mark_ghost_enrollments_failed()
    items: List[Dict[str, Any]] = []
    now = _server._utc_now()
    queued_ids: List[str] = []
    with _server.LOCAL_QUEUE_LOCK:
        for worker_id, record in list(_server.LOCAL_WORKER_REGISTRY.items()):
            if not isinstance(record, dict):
                continue
            lease_seconds = int(record.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS)
            online = _is_worker_online(record, now)
            control_state = _machine_control_state(record)
            policy_status = _machine_policy_status(record)
            permission_probe = _normalized_permission_probe(record)
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
                    "tenant_id": str(record.get("tenant_id") or "default").strip() or "default",
                    "workspace_id": str(record.get("workspace_id") or "default").strip() or "default",
                    "machine_id": str(record.get("machine_id") or record.get("runtime_id") or worker_id).strip() or worker_id,
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
                    "current_lease_holder": (
                        f"Run {str(record.get('current_run_id') or '').strip()[:8]}"
                        if str(record.get("current_run_id") or "").strip()
                        else None
                    ),
                    "last_seen_at": record.get("last_seen_at"),
                    "seconds_since_seen": since_seen,
                    "lease_seconds": lease_seconds,
                    "note": record.get("note"),
                    "permission_probe": permission_probe,
                    "permission_probe_updated_at": record.get("permission_probe_updated_at"),
                    "control_state": control_state,
                    "control_state_updated_at": record.get("control_state_updated_at"),
                    "suspended_at": record.get("suspended_at"),
                    "suspended_reason": record.get("suspended_reason"),
                    "revoked_at": record.get("revoked_at"),
                    "revoked_reason": record.get("revoked_reason"),
                    "safe_mode_status": policy_status.get("safe_mode"),
                    "kill_switch_status": policy_status.get("kill_switch"),
                    "enrollment_state": record.get("enrollment_state"),
                    "enrollment_requested_at": record.get("enrollment_requested_at"),
                    "enrollment_updated_at": record.get("enrollment_updated_at"),
                    "bootstrap_error": record.get("bootstrap_error"),
                    "machine_enrollment_scope": record.get("machine_enrollment_scope") or "workspace",
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
    suspended = len([item for item in items if str(item.get("control_state") or "").strip().lower() == "suspended"])
    revoked = len([item for item in items if str(item.get("control_state") or "").strip().lower() == "revoked"])

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
            "suspended": suspended,
            "revoked": revoked,
            "pending_runs": pending_runs,
            "claimed_runs": claimed_runs,
        },
        "watchdog": local_runtime_watchdog_status_snapshot(),
        "capability_queue": capability_queue,
        "items": items,
    }


def handle_enroll_local_runtime(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    runtime_type: str = "local_companion",
    display_name: Optional[str] = None,
    platform: Optional[str] = None,
    policy_mode: Optional[str] = None,
    capabilities: Optional[List[str]] = None,
    execution_targets: Optional[List[str]] = None,
    note: Optional[str] = None,
    machine_enrollment_scope: Optional[str] = None,
) -> Dict[str, Any]:
    return create_machine_enrollment_intent(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        machine_id=machine_id,
        runtime_type=runtime_type,
        display_name=display_name,
        platform=platform,
        policy_mode=policy_mode,
        capabilities=capabilities,
        execution_targets=execution_targets,
        note=note,
        machine_enrollment_scope=machine_enrollment_scope,
    )


def handle_delete_local_runtime(machine_id: str) -> Dict[str, Any]:
    _init()
    runtime_id = str(machine_id or "").strip()
    if not runtime_id:
        raise HTTPException(status_code=400, detail="machine_id is required.")
    started_mono = time.monotonic()

    with _server.LOCAL_QUEUE_LOCK:
        record = _server.LOCAL_WORKER_REGISTRY.get(runtime_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_id), dict) else None
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Machine not found.")
        _set_machine_control_state(record, "revoked", reason="Revoked from fleet controls.")
        record["note"] = "machine_revoked"
        _server.LOCAL_WORKER_REGISTRY[runtime_id] = record
    mark_machine_revocation_requested(runtime_id, started_monotonic=started_mono, recorded_at=_server._utc_now_iso())

    _persist_local_runtime_state()
    _emit_machine_outbox_event("revoked", record)
    status_payload = handle_get_local_workers_status()
    items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
    machine = next(
        (
            item
            for item in items
            if isinstance(item, dict)
            and str(item.get("machine_id") or item.get("runtime_id") or "").strip() == runtime_id
        ),
        None,
    )
    return {
        "ok": True,
        "machine_id": runtime_id,
        "deleted": False,
        "revoked": True,
        "machine": machine or dict(record),
    }


def handle_set_local_runtime_control(machine_id: str, *, action: str, reason: Optional[str] = None) -> Dict[str, Any]:
    _init()
    runtime_id = str(machine_id or "").strip()
    control_action = str(action or "").strip().lower()
    if not runtime_id:
        raise HTTPException(status_code=400, detail="machine_id is required.")
    if control_action not in {"suspend", "resume"}:
        raise HTTPException(status_code=400, detail="Unsupported machine control action.")

    with _server.LOCAL_QUEUE_LOCK:
        record = _server.LOCAL_WORKER_REGISTRY.get(runtime_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_id), dict) else None
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="Machine not found.")
        current_state = _machine_control_state(record)
        if control_action == "resume":
            if current_state == "revoked":
                raise HTTPException(status_code=409, detail="Revoked machines must be re-enrolled instead of resumed.")
            _set_machine_control_state(record, "active", reason=reason or "Resumed from fleet controls.")
            record["note"] = "machine_resumed"
            outbox_action = "resumed"
        else:
            if current_state == "revoked":
                raise HTTPException(status_code=409, detail="Revoked machines cannot be suspended.")
            _set_machine_control_state(record, "suspended", reason=reason or "Suspended from fleet controls.")
            record["note"] = "machine_suspended"
            outbox_action = "suspended"
        _server.LOCAL_WORKER_REGISTRY[runtime_id] = record

    _persist_local_runtime_state()
    _emit_machine_outbox_event(outbox_action, record)
    status_payload = handle_get_local_workers_status()
    items = status_payload.get("items") if isinstance(status_payload.get("items"), list) else []
    machine = next(
        (
            item
            for item in items
            if isinstance(item, dict)
            and str(item.get("machine_id") or item.get("runtime_id") or "").strip() == runtime_id
        ),
        None,
    )
    return {"ok": True, "machine_id": runtime_id, "action": control_action, "machine": machine or dict(record)}


def handle_heartbeat_local_worker(worker_id: str, payload: Optional[LocalWorkerHeartbeatPayload] = None) -> Dict[str, Any]:
    _init()
    worker = str(worker_id or "").strip()
    if not worker:
        raise HTTPException(status_code=400, detail="worker_id is required.")
    if payload and payload.permission_probe:
        with _server.LOCAL_QUEUE_LOCK:
            record = _server.LOCAL_WORKER_REGISTRY.get(worker) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker), dict) else {}
            next_record = dict(record or {})
            _apply_permission_probe(next_record, payload.permission_probe)
            _server.LOCAL_WORKER_REGISTRY[worker] = next_record
        _persist_local_runtime_state()
    return worker_dispatch_service.heartbeat_local_worker(
        worker,
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
    structured_event = dict(payload.event) if payload and isinstance(payload.event, dict) else None
    run = _server.runs.get(run_id_str)
    if isinstance(run, dict):
        if structured_event:
            event_name = str(structured_event.get("event") or "").strip().lower() or "local_heartbeat"
            event_message = str(structured_event.get("message") or note or event_name).strip() or event_name
            event_level = str(structured_event.get("level") or "info").strip().lower() or "info"
            event_data = structured_event.get("data") if isinstance(structured_event.get("data"), dict) else None
            _update_run_progress_from_structured_event(run, event_name, event_data)
            _server.emit_log(run["logs"], event_level, event_message[:400], event=event_name, data=event_data)
        elif note:
            _server.emit_log(run["logs"], "info", note[:400], event="local_heartbeat")
    return result


def handle_get_local_run_control_state(
    run_id: uuid.UUID,
    payload: Optional[LocalRunControlStatePayload] = None,
) -> Dict[str, Any]:
    _init()
    worker_id = str((payload.worker_id if payload else None) or "").strip()
    run_id_str = str(run_id)
    run = _server.runs.get(run_id_str)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")
    status = str(run.get("status") or "").strip().lower()
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    machine_id = str(
        run.get("machine_id")
        or run.get("local_worker_id")
        or metadata.get("machine_id")
        or worker_id
        or ""
    ).strip()
    machine_control_state = "active"
    machine_wait_reason: Optional[str] = None
    with _server.LOCAL_QUEUE_LOCK:
        record = _server.LOCAL_WORKER_REGISTRY.get(machine_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(machine_id), dict) else None
        if isinstance(record, dict):
            machine_control_state = _machine_control_state(record)
            if machine_control_state == "revoked":
                machine_wait_reason = "machine_revoked"
            elif machine_control_state == "suspended":
                machine_wait_reason = "machine_suspended"
    browser_checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else None
    local_execution_checkpoint = _local_execution_checkpoint_payload(run)
    wait_reason = str(
        run.get("wait_reason")
        or ((run.get("result_data") if isinstance(run.get("result_data"), dict) else {}).get("pause_reason"))
        or ""
    ).strip() or None
    manual_takeover = _manual_takeover_active(run)
    if machine_wait_reason == "machine_revoked":
        observed_at = _server._utc_now_iso() if callable(getattr(_server, "_utc_now_iso", None)) else None
        observe_machine_revocation_propagated(
            machine_id,
            observed_monotonic=time.monotonic(),
            observed_at=observed_at,
        )
    return {
        "status": status,
        "pause_requested": status == "waiting_for_input" or bool(machine_wait_reason),
        "manual_takeover": manual_takeover,
        "wait_reason": machine_wait_reason or wait_reason,
        "browser_checkpoint": dict(browser_checkpoint) if isinstance(browser_checkpoint, dict) else None,
        "local_execution_checkpoint": local_execution_checkpoint,
        "machine_control_state": machine_control_state,
        "resume_available": bool(browser_checkpoint or local_execution_checkpoint),
    }


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
