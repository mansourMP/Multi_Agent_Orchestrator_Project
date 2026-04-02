"""
Local worker queue and heartbeat logic.
Extracted from server.py to reduce hotspot size.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from server_modules.runtime_state_store import replace_local_runtime_state

_server = None
LOCAL_RUN_STILL_WORKING_INTERVAL_SECONDS = 15
LOCAL_RUN_WORKER_LOST_TIMEOUT_SECONDS = 30
_COLD_BOOT_RECOVERY_DONE = False


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
        next_record: Dict[str, Any] = dict(previous)
        next_record.update(
            {
                "worker_id": worker,
                "last_seen_at": now_iso,
                "status": status_hint or str(previous.get("status") or "idle"),
                "current_run_id": current_run_id if current_run_id is not None else previous.get("current_run_id"),
                "lease_seconds": int(previous.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS),
                "note": str(previous.get("note") or ""),
            }
        )
        if note:
            next_record["note"] = str(note)[:280]
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
    try:
        with _server.LOCAL_QUEUE_LOCK:
            pending_run_ids = list(_server.LOCAL_PENDING_RUN_IDS)
            claimed_runs = {
                run_id: dict(info)
                for run_id, info in _server.LOCAL_CLAIMED_RUNS.items()
                if isinstance(info, dict)
            }
            runtime_registrations = {
                runtime_id: dict(record)
                for runtime_id, record in _server.LOCAL_WORKER_REGISTRY.items()
                if isinstance(record, dict)
            }
        replace_local_runtime_state(
            _server.ORION_RUNTIME_STATE_DB,
            pending_run_ids=pending_run_ids,
            claimed_runs=claimed_runs,
            runtime_registrations=runtime_registrations,
        )
    except Exception:
        return


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
    token = _server.secrets.token_urlsafe(24)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    issued_at = _server._utc_now_iso()
    record["session_token_hash"] = token_hash
    record["session_issued_at"] = issued_at
    record["session_last_authenticated_at"] = issued_at
    record["trust_state"] = "verified"
    return {
        "session_token": token,
        "session_issued_at": issued_at,
    }


def _touch_runtime_session(record: Dict[str, Any]) -> None:
    _init()
    record["session_last_authenticated_at"] = _server._utc_now_iso()
    record["trust_state"] = "verified"


def _assert_runtime_session(runtime_id: str, session_token: Optional[str], *, instance_id: Optional[str] = None) -> Dict[str, Any]:
    _init()
    runtime_token = str(runtime_id or "").strip()
    if not runtime_token:
        raise HTTPException(status_code=400, detail="runtime_id is required.")
    provided = str(session_token or "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="runtime session token is required.")
    with _server.LOCAL_QUEUE_LOCK:
        record = _server.LOCAL_WORKER_REGISTRY.get(runtime_token) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(runtime_token), dict) else None
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="runtime_id is not registered.")
        expected_hash = str(record.get("session_token_hash") or "").strip()
        if not expected_hash:
            raise HTTPException(status_code=409, detail="runtime session is not active. Re-register this machine.")
        provided_hash = hashlib.sha256(provided.encode("utf-8")).hexdigest()
        if provided_hash != expected_hash:
            raise HTTPException(status_code=401, detail="runtime session is no longer valid. Re-register this machine.")
        expected_instance = str(record.get("instance_id") or "").strip()
        provided_instance = str(instance_id or "").strip()
        if expected_instance and provided_instance and expected_instance != provided_instance:
            raise HTTPException(status_code=409, detail="runtime instance changed. Re-register this machine.")
        _touch_runtime_session(record)
        _server.LOCAL_WORKER_REGISTRY[runtime_token] = record
        next_record = dict(record)
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
        record: Dict[str, Any] = dict(previous)
        record["worker_id"] = worker
        record["runtime_id"] = worker
        record["runtime_type"] = str(runtime_type or previous.get("runtime_type") or "local").strip() or "local"
        record["display_name"] = str(display_name or previous.get("display_name") or worker).strip() or worker
        record["platform"] = str(platform or previous.get("platform") or "").strip() or None
        record["policy_mode"] = _server.normalize_policy_mode(
            policy_mode
            or previous.get("policy_mode")
            or _server.ORION_RUNTIME_POLICY_MODE_DEFAULT
        )
        normalized_capabilities = [
            str(item).strip()
            for item in (capabilities if isinstance(capabilities, list) else previous.get("capabilities") or [])
            if str(item).strip()
        ]
        record["capabilities"] = normalized_capabilities
        record["execution_targets"] = [
            str(item).strip()
            for item in (execution_targets if isinstance(execution_targets, list) else previous.get("execution_targets") or [])
            if str(item).strip()
        ]
        record["instance_id"] = str(instance_id or previous.get("instance_id") or worker).strip() or worker
        record["capability_digest"] = (
            str(capability_digest or "").strip()
            or str(previous.get("capability_digest") or "").strip()
            or _capability_digest(normalized_capabilities)
        )
        record["registered_at"] = str(previous.get("registered_at") or _server._utc_now_iso())
        record["last_registered_at"] = _server._utc_now_iso()
        session = _issue_runtime_session(record)
        _server.LOCAL_WORKER_REGISTRY[worker] = record
    _persist_local_runtime_state()
    return {
        "runtime_id": worker,
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
    now = _server._utc_now()
    stale: List[Dict[str, Any]] = []
    changed = False

    with _server.LOCAL_QUEUE_LOCK:
        for run_id, claim in list(_server.LOCAL_CLAIMED_RUNS.items()):
            if not isinstance(claim, dict):
                _server.LOCAL_CLAIMED_RUNS.pop(run_id, None)
                changed = True
                continue
            lease_seconds = max(10, int(claim.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS))
            last_heartbeat = _server._parse_utc_ts(claim.get("last_heartbeat_at")) or _server._parse_utc_ts(claim.get("claimed_at"))
            if last_heartbeat is None:
                last_heartbeat = now
            if (now - last_heartbeat).total_seconds() <= LOCAL_RUN_WORKER_LOST_TIMEOUT_SECONDS:
                continue

            worker_id = str(claim.get("worker_id") or "").strip() or None
            _server.LOCAL_CLAIMED_RUNS.pop(run_id, None)
            changed = True
            if worker_id:
                worker_state = _server.LOCAL_WORKER_REGISTRY.get(worker_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker_id), dict) else {}
                worker_state["worker_id"] = worker_id
                worker_state["current_run_id"] = None
                worker_state["status"] = "offline"
                worker_state["lease_seconds"] = int(worker_state.get("lease_seconds") or lease_seconds)
                worker_state["last_seen_at"] = worker_state.get("last_seen_at") or claim.get("last_heartbeat_at") or claim.get("claimed_at") or _server._utc_now_iso()
                _server.LOCAL_WORKER_REGISTRY[worker_id] = worker_state
                changed = True
            stale.append(
                {
                    "run_id": run_id,
                    "worker_id": worker_id,
                    "lease_seconds": lease_seconds,
                    "last_heartbeat_at": claim.get("last_heartbeat_at"),
                }
            )
    if changed:
        _persist_local_runtime_state()

    for item in stale:
        run_id = str(item.get("run_id") or "")
        run = _server.runs.get(run_id)
        if not isinstance(run, dict):
            continue
        status = str(run.get("status") or "").strip().lower()
        if status in {"completed", "failed", "timeout"}:
            continue
        run["local_worker_id"] = None
        run["local_claimed_at"] = None
        run["local_last_heartbeat_at"] = None
        run["result"] = "Worker lost connection."
        run["result_data"] = {
            "summary": "Worker lost connection.",
            "error": "local_worker_lost_connection",
            "worker_id": item.get("worker_id"),
            "last_heartbeat_at": item.get("last_heartbeat_at"),
        }
        log_queue = run.get("logs")
        if log_queue is not None:
            _server.emit_log(
                log_queue,
                "error",
                "Worker lost connection. Run failed.",
                event="local_worker_lost",
                data={
                    "run_id": run_id,
                    "worker_id": item.get("worker_id"),
                    "lease_seconds": item.get("lease_seconds"),
                    "last_heartbeat_at": item.get("last_heartbeat_at"),
                },
            )
        _server.set_run_status(run_id, "failed")
        if log_queue is not None:
            log_queue.put(None)

    return [str(item.get("run_id") or "") for item in stale]


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
        run["status"] = "waiting_for_input"
        run["local_worker_id"] = None
        run["local_claimed_at"] = None
        run["local_last_heartbeat_at"] = None
        run["result"] = "Local operator paused at saved checkpoint after runtime restart."
        run["result_data"] = {
            "summary": "Local operator paused at saved checkpoint after runtime restart.",
            "resume_available": True,
            "error": "local_worker_orphaned_recovered",
            "next_action_index": checkpoint.get("next_action_index"),
            "session_profile": checkpoint.get("session_profile"),
        }
        metadata["resume_ready"] = True
        metadata["cold_boot_recovered"] = True
        context["metadata"] = metadata
        run["context"] = context
        log_queue = run.get("logs")
        if log_queue is not None:
            _server.emit_log(
                log_queue,
                "warn",
                "Recovered local run from durable checkpoint after runtime restart.",
                event="local_cold_boot_recovered",
                data={
                    "run_id": run_id,
                    "next_action_index": checkpoint.get("next_action_index"),
                    "session_profile": checkpoint.get("session_profile"),
                },
            )
        recovered.append(run_id)
        _server._persist_live_run_state(run_id, run)

    if recovered:
        with _server.LOCAL_QUEUE_LOCK:
            _server.LOCAL_PENDING_RUN_IDS[:] = [
                run_id
                for run_id in _server.LOCAL_PENDING_RUN_IDS
                if run_id not in set(recovered)
            ]
            for run_id in recovered:
                _server.LOCAL_CLAIMED_RUNS.pop(run_id, None)
        _persist_local_runtime_state()
    _COLD_BOOT_RECOVERY_DONE = True
    return recovered


def _claim_local_run(worker_id: str, required_capabilities: Optional[List[str]] = None) -> Optional[str]:
    _init()
    _cleanup_stale_local_claims()
    claimed_run_id: Optional[str] = None
    deferred_run_ids: List[str] = []
    capability_filtered = False
    state_changed = False

    with _server.LOCAL_QUEUE_LOCK:
        worker_state = _server.LOCAL_WORKER_REGISTRY.get(worker_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker_id), dict) else {}
        worker_capabilities = _normalize_capability_ids(worker_state.get("capabilities") if isinstance(worker_state, dict) else [])
        worker_capability_set = set(worker_capabilities)
        requested_capability_filter = set(_normalize_capability_ids(required_capabilities))
        while _server.LOCAL_PENDING_RUN_IDS:
            run_id = _server.LOCAL_PENDING_RUN_IDS.pop(0)
            state_changed = True
            run = _server.runs.get(run_id)
            if not isinstance(run, dict):
                continue
            status = str(run.get("status") or "").strip().lower()
            if status not in {"queued_local", "starting"}:
                continue
            preferred_runtime_ids = _ordered_runtime_preferences_for_run(run)
            preferred_runtime_id = _best_online_preferred_runtime(preferred_runtime_ids)
            if preferred_runtime_id and preferred_runtime_id != worker_id:
                deferred_run_ids.append(run_id)
                capability_filtered = True
                continue
            run_required_capabilities = _required_capabilities_for_run(run)
            required_capability_set = set(run_required_capabilities)
            if run_required_capabilities and not required_capability_set.issubset(worker_capability_set):
                deferred_run_ids.append(run_id)
                capability_filtered = True
                continue
            if requested_capability_filter and run_required_capabilities and not required_capability_set.issubset(requested_capability_filter):
                deferred_run_ids.append(run_id)
                capability_filtered = True
                continue
            _server.LOCAL_CLAIMED_RUNS[run_id] = {
                "worker_id": worker_id,
                "claimed_at": datetime.utcnow().isoformat() + "Z",
                "last_heartbeat_at": datetime.utcnow().isoformat() + "Z",
                "last_progress_event_at": datetime.utcnow().isoformat() + "Z",
                "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS,
            }
            state_changed = True
            claimed_run_id = run_id
            break
        if deferred_run_ids:
            _server.LOCAL_PENDING_RUN_IDS[:] = deferred_run_ids + list(_server.LOCAL_PENDING_RUN_IDS)
            state_changed = True
    if state_changed:
        _persist_local_runtime_state()
    if claimed_run_id:
        _mark_local_worker_seen(worker_id, claimed_run_id, "busy", note="claimed_local_run")
    else:
        _mark_local_worker_seen(
            worker_id,
            None,
            "idle",
            note="idle_capability_wait" if capability_filtered else "idle_poll",
        )
    return claimed_run_id


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
        "capability_queue": capability_queue,
        "items": items,
    }


def handle_heartbeat_local_worker(worker_id: str, payload: Optional[LocalWorkerHeartbeatPayload] = None) -> Dict[str, Any]:
    _init()
    worker = str(worker_id or "").strip()
    if not worker:
        raise HTTPException(status_code=400, detail="worker_id is required.")

    current_run_id = str((payload.current_run_id if payload else None) or "").strip() if payload else ""
    note = str((payload.note if payload else None) or "").strip() if payload else ""
    _mark_local_worker_seen(worker, current_run_id or None, "busy" if current_run_id else "idle", note=note or None)

    if current_run_id:
        run = _server.runs.get(current_run_id)
        should_emit_progress = False
        if isinstance(run, dict):
            with _server.LOCAL_QUEUE_LOCK:
                claim = _server.LOCAL_CLAIMED_RUNS.get(current_run_id)
                if isinstance(claim, dict) and str(claim.get("worker_id") or "") == worker:
                    now_iso = _server._utc_now_iso()
                    claim["last_heartbeat_at"] = now_iso
                    _server.LOCAL_CLAIMED_RUNS[current_run_id] = claim
                    run["local_last_heartbeat_at"] = now_iso
                    should_emit_progress = _maybe_emit_local_still_working(current_run_id, run, claim, note=note or None)
            _persist_local_runtime_state()
            if should_emit_progress:
                _persist_local_runtime_state()

    return {"status": "ok", "worker_id": worker, "current_run_id": current_run_id or None, "last_seen_at": _server._utc_now_iso()}


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
    if isinstance(metadata, dict):
        metadata["runtime_id"] = worker_id
        metadata["policy_mode"] = _server.normalize_policy_mode(
            worker_state.get("policy_mode") if isinstance(worker_state, dict) else None
        )
        context["metadata"] = metadata
        run["context"] = context

    now = datetime.utcnow().isoformat() + "Z"
    run["local_worker_id"] = worker_id
    run["local_claimed_at"] = now
    run["local_last_heartbeat_at"] = now
    run.pop("_resume_after_confirmation_scheduled", None)
    _server.set_run_status(run_id, "running_local")
    _server.emit_log(
        run["logs"],
        "info",
        f"Local companion claimed run ({worker_id}).",
        event="local_claimed",
        data={"run_id": run_id, "worker_id": worker_id, "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS},
    )

    return {
        "ok": True,
        "worker_id": worker_id,
        "run": {
            "run_id": run_id,
            "engine": run.get("engine"),
            "status": run.get("status"),
            "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS,
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
    run = _server.runs.get(run_id_str)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    with _server.LOCAL_QUEUE_LOCK:
        claim = _server.LOCAL_CLAIMED_RUNS.get(run_id_str)
        if not isinstance(claim, dict):
            raise HTTPException(status_code=409, detail="Run is not claimed by a local companion.")
        incoming_worker = str((payload.worker_id if payload else None) or "").strip() if payload else ""
        if incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or str(claim.get("worker_id") or "").strip()
        now = datetime.utcnow().isoformat() + "Z"
        claim["last_heartbeat_at"] = now
        _maybe_emit_local_still_working(run_id_str, run, claim, note=(payload.note if payload else None))
        _server.LOCAL_CLAIMED_RUNS[run_id_str] = claim

    run["local_last_heartbeat_at"] = now
    if resolved_worker:
        _mark_local_worker_seen(resolved_worker, run_id_str, "busy", note=(payload.note if payload else None))
    note = str((payload.note if payload else None) or "").strip() if payload else ""
    if note:
        _server.emit_log(run["logs"], "info", note[:400], event="local_heartbeat")
    return {"status": "ok", "run_id": run_id_str, "last_heartbeat_at": now}


def handle_complete_local_run(run_id: uuid.UUID, payload: LocalRunCompletePayload) -> Dict[str, Any]:
    _init()
    run_id_str = str(run_id)
    run = _server.runs.get(run_id_str)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    with _server.LOCAL_QUEUE_LOCK:
        claim = _server.LOCAL_CLAIMED_RUNS.get(run_id_str)
        incoming_worker = str(payload.worker_id or "").strip()
        if isinstance(claim, dict) and incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or (str(claim.get("worker_id") or "").strip() if isinstance(claim, dict) else "")

    status = str(run.get("status") or "").strip().lower()
    if status in {"completed", "failed", "timeout"}:
        return {"status": "ok", "run_id": run_id_str, "already_terminal": True}

    if isinstance(payload.result_data, dict):
        run["result_data"] = payload.result_data
    if isinstance(payload.usage_masked, dict):
        run["usage_masked"] = payload.usage_masked

    result_text = str(payload.result_text or "").strip()
    if not result_text and isinstance(payload.result_data, dict):
        result_text = str(payload.result_data.get("summary") or "").strip()
    if not result_text:
        result_text = "Local companion run completed."
    run["result"] = result_text

    _server.emit_log(run["logs"], "info", result_text, event="local_result", data=payload.result_data if isinstance(payload.result_data, dict) else None)
    _server.emit_log(run["logs"], "info", "Run completed by Local Companion.", event="run_complete")
    if resolved_worker:
        _mark_local_worker_seen(resolved_worker, None, "idle", note="completed_run")
    _server.set_run_status(run_id_str, "completed")
    try:
        _server._persist_run_memory(run_id_str, run)
    except Exception:
        pass
    run["logs"].put(None)
    return {"status": "ok", "run_id": run_id_str}


def handle_pause_local_run(run_id: uuid.UUID, payload: LocalRunPausePayload) -> Dict[str, Any]:
    _init()
    run_id_str = str(run_id)
    run = _server.runs.get(run_id_str)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    with _server.LOCAL_QUEUE_LOCK:
        claim = _server.LOCAL_CLAIMED_RUNS.get(run_id_str)
        incoming_worker = str(payload.worker_id or "").strip()
        if isinstance(claim, dict) and incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or (str(claim.get("worker_id") or "").strip() if isinstance(claim, dict) else "")
        _server.LOCAL_CLAIMED_RUNS.pop(run_id_str, None)
    _persist_local_runtime_state()

    if isinstance(payload.result_data, dict):
        run["result_data"] = payload.result_data
    if isinstance(payload.browser_checkpoint, dict):
        run["browser_checkpoint"] = payload.browser_checkpoint
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        metadata["browser_checkpoint"] = payload.browser_checkpoint
        metadata["browser_resume_supported"] = True
        context["metadata"] = metadata
        run["context"] = context

    result_text = str(payload.result_text or "").strip()
    if not result_text and isinstance(payload.result_data, dict):
        result_text = str(payload.result_data.get("summary") or "").strip()
    if not result_text:
        result_text = "Local companion paused and is waiting for human input."
    run["result"] = result_text
    run["local_worker_id"] = None
    run["local_claimed_at"] = None
    run["local_last_heartbeat_at"] = None
    run.pop("_resume_after_confirmation_scheduled", None)

    wait_reason = str(payload.wait_reason or "").strip() or "human_unblock_required"
    _server.emit_log(
        run["logs"],
        "warn",
        result_text,
        event="local_pause_required",
        data={
            "run_id": run_id_str,
            "wait_reason": wait_reason,
            "session_profile": (
                payload.browser_checkpoint.get("session_profile")
                if isinstance(payload.browser_checkpoint, dict)
                else None
            ),
            "next_action_index": (
                payload.browser_checkpoint.get("next_action_index")
                if isinstance(payload.browser_checkpoint, dict)
                else None
            ),
        },
    )
    if resolved_worker:
        _mark_local_worker_seen(resolved_worker, None, "idle", note="paused_waiting_for_input")
    _server.set_run_status(run_id_str, "waiting_for_input")
    return {"status": "ok", "run_id": run_id_str, "waiting_for_input": True}


def handle_fail_local_run(run_id: uuid.UUID, payload: LocalRunFailPayload) -> Dict[str, Any]:
    _init()
    run_id_str = str(run_id)
    run = _server.runs.get(run_id_str)
    if not isinstance(run, dict):
        raise HTTPException(status_code=404, detail="Run ID not found")

    with _server.LOCAL_QUEUE_LOCK:
        claim = _server.LOCAL_CLAIMED_RUNS.get(run_id_str)
        incoming_worker = str(payload.worker_id or "").strip()
        if isinstance(claim, dict) and incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or (str(claim.get("worker_id") or "").strip() if isinstance(claim, dict) else "")

    status = str(run.get("status") or "").strip().lower()
    if status in {"completed", "failed", "timeout"}:
        return {"status": "ok", "run_id": run_id_str, "already_terminal": True}

    message = str(payload.error or "").strip() or "Local companion run failed."
    _server.emit_log(run["logs"], "error", message[:1200], event="run_error")
    if resolved_worker:
        _mark_local_worker_seen(resolved_worker, None, "idle", note="failed_run")
    _server.set_run_status(run_id_str, "failed")
    run["logs"].put(None)
    return {"status": "ok", "run_id": run_id_str}
