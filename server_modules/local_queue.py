"""
Local worker queue and heartbeat logic.
Extracted from server.py to reduce hotspot size.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel

_server = None


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
        next_record: Dict[str, Any] = {
            "worker_id": worker,
            "last_seen_at": now_iso,
            "status": status_hint or str(previous.get("status") or "idle"),
            "current_run_id": current_run_id if current_run_id is not None else previous.get("current_run_id"),
            "lease_seconds": int(previous.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS),
            "note": str(previous.get("note") or ""),
        }
        if note:
            next_record["note"] = str(note)[:280]
        _server.LOCAL_WORKER_REGISTRY[worker] = next_record


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

    with _server.LOCAL_QUEUE_LOCK:
        for run_id, claim in list(_server.LOCAL_CLAIMED_RUNS.items()):
            if not isinstance(claim, dict):
                _server.LOCAL_CLAIMED_RUNS.pop(run_id, None)
                continue
            lease_seconds = max(10, int(claim.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS))
            last_heartbeat = _server._parse_utc_ts(claim.get("last_heartbeat_at")) or _server._parse_utc_ts(claim.get("claimed_at"))
            if last_heartbeat is None:
                last_heartbeat = now
            if (now - last_heartbeat).total_seconds() <= lease_seconds:
                continue

            worker_id = str(claim.get("worker_id") or "").strip() or None
            _server.LOCAL_CLAIMED_RUNS.pop(run_id, None)
            if run_id not in _server.LOCAL_PENDING_RUN_IDS:
                _server.LOCAL_PENDING_RUN_IDS.append(run_id)
            if worker_id:
                worker_state = _server.LOCAL_WORKER_REGISTRY.get(worker_id) if isinstance(_server.LOCAL_WORKER_REGISTRY.get(worker_id), dict) else {}
                worker_state["worker_id"] = worker_id
                worker_state["current_run_id"] = None
                worker_state["status"] = "offline"
                worker_state["lease_seconds"] = int(worker_state.get("lease_seconds") or lease_seconds)
                worker_state["last_seen_at"] = worker_state.get("last_seen_at") or claim.get("last_heartbeat_at") or claim.get("claimed_at") or _server._utc_now_iso()
                _server.LOCAL_WORKER_REGISTRY[worker_id] = worker_state
            stale.append(
                {
                    "run_id": run_id,
                    "worker_id": worker_id,
                    "lease_seconds": lease_seconds,
                    "last_heartbeat_at": claim.get("last_heartbeat_at"),
                }
            )

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
        _server.set_run_status(run_id, "queued_local")
        log_queue = run.get("logs")
        if log_queue is not None:
            _server.emit_log(
                log_queue,
                "warn",
                "Local companion lease expired. Run returned to local queue.",
                event="local_lease_expired",
                data={
                    "run_id": run_id,
                    "worker_id": item.get("worker_id"),
                    "lease_seconds": item.get("lease_seconds"),
                    "last_heartbeat_at": item.get("last_heartbeat_at"),
                },
            )

    return [str(item.get("run_id") or "") for item in stale]


def _claim_local_run(worker_id: str) -> Optional[str]:
    _init()
    _cleanup_stale_local_claims()
    claimed_run_id: Optional[str] = None
    with _server.LOCAL_QUEUE_LOCK:
        while _server.LOCAL_PENDING_RUN_IDS:
            run_id = _server.LOCAL_PENDING_RUN_IDS.pop(0)
            run = _server.runs.get(run_id)
            if not isinstance(run, dict):
                continue
            status = str(run.get("status") or "").strip().lower()
            if status not in {"queued_local", "starting"}:
                continue
            _server.LOCAL_CLAIMED_RUNS[run_id] = {
                "worker_id": worker_id,
                "claimed_at": datetime.utcnow().isoformat() + "Z",
                "last_heartbeat_at": datetime.utcnow().isoformat() + "Z",
                "lease_seconds": _server.ORION_LOCAL_LEASE_SECONDS,
            }
            claimed_run_id = run_id
            break
    if claimed_run_id:
        _mark_local_worker_seen(worker_id, claimed_run_id, "busy", note="claimed_local_run")
    else:
        _mark_local_worker_seen(worker_id, None, "idle", note="idle_poll")
    return claimed_run_id


def _local_run_summary(run_id: str, run: Dict[str, Any], claim: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    _init()
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
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
        "workspace_id": str(context.get("workspace_id") or ""),
        "worker_id": str(claim.get("worker_id") or "") if isinstance(claim, dict) else None,
        "claimed_at": claim.get("claimed_at") if isinstance(claim, dict) else None,
        "last_heartbeat_at": claim.get("last_heartbeat_at") if isinstance(claim, dict) else None,
        "lease_seconds": int(claim.get("lease_seconds") or _server.ORION_LOCAL_LEASE_SECONDS) if isinstance(claim, dict) else _server.ORION_LOCAL_LEASE_SECONDS,
    }


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

    known = len(items)
    online = len([item for item in items if item.get("online")])
    busy = len([item for item in items if item.get("online") and item.get("current_run_id")])
    idle = max(0, online - busy)
    offline = max(0, known - online)

    items.sort(key=lambda item: ((0 if item.get("online") else 1), str(item.get("worker_id") or "")))

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
        if isinstance(run, dict):
            with _server.LOCAL_QUEUE_LOCK:
                claim = _server.LOCAL_CLAIMED_RUNS.get(current_run_id)
                if isinstance(claim, dict) and str(claim.get("worker_id") or "") == worker:
                    now_iso = _server._utc_now_iso()
                    claim["last_heartbeat_at"] = now_iso
                    _server.LOCAL_CLAIMED_RUNS[current_run_id] = claim
                    run["local_last_heartbeat_at"] = now_iso

    return {"status": "ok", "worker_id": worker, "current_run_id": current_run_id or None, "last_seen_at": _server._utc_now_iso()}


def handle_claim_local_run(body: Optional[LocalRunClaimRequest] = None) -> Dict[str, Any]:
    _init()
    if not _server.ORION_LOCAL_COMPANION_ENABLED:
        raise HTTPException(status_code=400, detail="Local companion routing is disabled on this runtime.")

    worker_id = str((body.worker_id if body else None) or "").strip() if body else ""
    if not worker_id:
        worker_id = f"local-worker-{uuid.uuid4().hex[:8]}"

    run_id = _claim_local_run(worker_id)
    if not run_id:
        return {"ok": True, "worker_id": worker_id, "run": None}

    run = _server.runs.get(run_id)
    if not isinstance(run, dict):
        return {"ok": True, "worker_id": worker_id, "run": None}

    now = datetime.utcnow().isoformat() + "Z"
    run["local_worker_id"] = worker_id
    run["local_claimed_at"] = now
    run["local_last_heartbeat_at"] = now
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
