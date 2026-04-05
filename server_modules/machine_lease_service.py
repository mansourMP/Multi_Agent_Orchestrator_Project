from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional

from fastapi import HTTPException


@dataclass(slots=True)
class MachineRecord:
    machine_id: str
    owner_id: str
    platform: str
    capabilities: List[str] = field(default_factory=list)
    permission_probe: Dict[str, bool] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MachineLease:
    lease_id: str
    machine_id: str
    run_id: str
    workspace_id: str
    actor_id: str
    ttl_seconds: int
    capabilities_requested: List[str] = field(default_factory=list)
    capabilities_granted: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


def build_machine_presence_record(
    *,
    previous_record: Optional[Mapping[str, Any]],
    machine_id: str,
    current_run_id: Optional[str],
    status_hint: str,
    lease_seconds: int,
    now_iso: str,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    previous = dict(previous_record or {})
    record: Dict[str, Any] = dict(previous)
    normalized_machine_id = str(machine_id or "").strip()
    if not normalized_machine_id:
        return record
    record.update(
        {
            "worker_id": normalized_machine_id,
            "runtime_id": str(previous.get("runtime_id") or normalized_machine_id).strip() or normalized_machine_id,
            "machine_id": str(previous.get("machine_id") or normalized_machine_id).strip() or normalized_machine_id,
            "last_seen_at": now_iso,
            "status": status_hint or str(previous.get("status") or "idle"),
            "current_run_id": current_run_id if current_run_id is not None else previous.get("current_run_id"),
            "lease_seconds": int(previous.get("lease_seconds") or lease_seconds),
            "note": str(previous.get("note") or ""),
        }
    )
    if note:
        record["note"] = str(note)[:280]
    return record


def build_runtime_registration_record(
    machine_id: str,
    *,
    previous_record: Optional[Mapping[str, Any]],
    runtime_type: str,
    display_name: Optional[str],
    platform: Optional[str],
    policy_mode: Optional[str],
    capabilities: Optional[List[str]],
    execution_targets: Optional[List[str]],
    instance_id: Optional[str],
    capability_digest: Optional[str],
    lease_seconds: int,
    now_iso: str,
    normalize_policy_mode_fn: Callable[[Any], str],
    capability_digest_fn: Callable[[Optional[List[str]]], Optional[str]],
) -> Dict[str, Any]:
    worker = str(machine_id or "").strip()
    if not worker:
        return {}
    previous = dict(previous_record or {})
    record: Dict[str, Any] = dict(previous)
    normalized_capabilities = [
        str(item).strip()
        for item in (
            capabilities if isinstance(capabilities, list) else previous.get("capabilities") or []
        )
        if str(item).strip()
    ]
    record["worker_id"] = worker
    record["runtime_id"] = worker
    record["machine_id"] = str(previous.get("machine_id") or worker).strip() or worker
    record["runtime_type"] = str(runtime_type or previous.get("runtime_type") or "local").strip() or "local"
    record["display_name"] = str(display_name or previous.get("display_name") or worker).strip() or worker
    record["platform"] = str(platform or previous.get("platform") or "").strip() or None
    record["policy_mode"] = normalize_policy_mode_fn(
        policy_mode or previous.get("policy_mode")
    )
    record["capabilities"] = normalized_capabilities
    record["execution_targets"] = [
        str(item).strip()
        for item in (
            execution_targets
            if isinstance(execution_targets, list)
            else previous.get("execution_targets") or []
        )
        if str(item).strip()
    ]
    record["instance_id"] = str(instance_id or previous.get("instance_id") or worker).strip() or worker
    record["capability_digest"] = (
        str(capability_digest or "").strip()
        or str(previous.get("capability_digest") or "").strip()
        or capability_digest_fn(normalized_capabilities)
    )
    record["registered_at"] = str(previous.get("registered_at") or now_iso)
    record["last_registered_at"] = now_iso
    record["lease_seconds"] = int(previous.get("lease_seconds") or lease_seconds)
    record["trust_state"] = str(previous.get("trust_state") or "unverified").strip() or "unverified"
    return record


def issue_machine_session(
    record: Dict[str, Any],
    *,
    token_factory: Callable[[int], str],
    hash_token_fn: Callable[[str], str],
    issued_at: str,
) -> Dict[str, str]:
    token = token_factory(24)
    record["session_token_hash"] = hash_token_fn(token)
    record["session_issued_at"] = issued_at
    record["session_last_authenticated_at"] = issued_at
    record["trust_state"] = "verified"
    return {
        "session_token": token,
        "session_issued_at": issued_at,
    }


def touch_machine_session(record: Dict[str, Any], *, touched_at: str) -> None:
    record["session_last_authenticated_at"] = touched_at
    record["trust_state"] = "verified"


def assert_machine_session(
    machine_id: str,
    session_token: Optional[str],
    *,
    machine_registry: Dict[str, Dict[str, Any]],
    machine_registry_lock: Any,
    instance_id: Optional[str],
    hash_token_fn: Callable[[str], str],
    touch_machine_session_fn: Callable[[Dict[str, Any]], None],
) -> Dict[str, Any]:
    runtime_token = str(machine_id or "").strip()
    if not runtime_token:
        raise HTTPException(status_code=400, detail="runtime_id is required.")
    provided = str(session_token or "").strip()
    if not provided:
        raise HTTPException(status_code=401, detail="runtime session token is required.")
    with machine_registry_lock:
        record = (
            machine_registry.get(runtime_token)
            if isinstance(machine_registry.get(runtime_token), dict)
            else None
        )
        if not isinstance(record, dict):
            raise HTTPException(status_code=404, detail="runtime_id is not registered.")
        expected_hash = str(record.get("session_token_hash") or "").strip()
        if not expected_hash:
            raise HTTPException(status_code=409, detail="runtime session is not active. Re-register this machine.")
        if hash_token_fn(provided) != expected_hash:
            raise HTTPException(status_code=401, detail="runtime session is no longer valid. Re-register this machine.")
        expected_instance = str(record.get("instance_id") or "").strip()
        provided_instance = str(instance_id or "").strip()
        if expected_instance and provided_instance and expected_instance != provided_instance:
            raise HTTPException(status_code=409, detail="runtime instance changed. Re-register this machine.")
        touch_machine_session_fn(record)
        machine_registry[runtime_token] = record
        return dict(record)


def build_machine_lease_record(
    *,
    machine_id: str,
    run_id: str,
    workspace_id: str,
    actor_id: str,
    ttl_seconds: int,
    claimed_at: str,
    capabilities_requested: Optional[List[str]] = None,
    capabilities_granted: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    lease_id_factory: Callable[[], str] = lambda: uuid.uuid4().hex,
) -> Dict[str, Any]:
    lease = MachineLease(
        lease_id=str(lease_id_factory() or "").strip() or uuid.uuid4().hex,
        machine_id=str(machine_id or "").strip(),
        run_id=str(run_id or "").strip(),
        workspace_id=str(workspace_id or "").strip(),
        actor_id=str(actor_id or "").strip(),
        ttl_seconds=int(ttl_seconds or 0),
        capabilities_requested=list(capabilities_requested or []),
        capabilities_granted=list(capabilities_granted or []),
        metadata=dict(metadata or {}),
    )
    return {
        "worker_id": lease.machine_id,
        "machine_id": lease.machine_id,
        "lease_id": lease.lease_id,
        "run_id": lease.run_id,
        "workspace_id": lease.workspace_id,
        "actor_id": lease.actor_id,
        "claimed_at": claimed_at,
        "last_heartbeat_at": claimed_at,
        "last_progress_event_at": claimed_at,
        "lease_seconds": lease.ttl_seconds,
        "capabilities_requested": list(lease.capabilities_requested),
        "capabilities_granted": list(lease.capabilities_granted),
        "metadata": dict(lease.metadata),
    }


def claim_local_machine_lease(
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
    lease_id_factory: Callable[[], str] = lambda: uuid.uuid4().hex,
) -> Optional[str]:
    cleanup_stale_local_claims_fn()
    claimed_run_id: Optional[str] = None
    deferred_run_ids: List[str] = []
    capability_filtered = False
    state_changed = False

    with local_queue_lock:
        worker_state = (
            worker_registry.get(worker_id)
            if isinstance(worker_registry.get(worker_id), dict)
            else {}
        )
        worker_capabilities = normalize_capability_ids_fn(
            worker_state.get("capabilities") if isinstance(worker_state, dict) else []
        )
        worker_capability_set = set(worker_capabilities)
        requested_capability_filter = set(normalize_capability_ids_fn(required_capabilities))
        machine_id = str(
            (worker_state.get("machine_id") if isinstance(worker_state, dict) else None)
            or (worker_state.get("runtime_id") if isinstance(worker_state, dict) else None)
            or worker_id
        ).strip() or str(worker_id or "").strip()
        while pending_run_ids:
            run_id = pending_run_ids.pop(0)
            state_changed = True
            run = runs_by_id.get(run_id)
            if not isinstance(run, dict):
                continue
            status = str(run.get("status") or "").strip().lower()
            if status not in {"queued_local", "starting"}:
                continue
            preferred_runtime_ids = ordered_runtime_preferences_for_run_fn(run)
            preferred_runtime_id = best_online_preferred_runtime_fn(preferred_runtime_ids)
            if preferred_runtime_id and preferred_runtime_id != worker_id:
                deferred_run_ids.append(run_id)
                capability_filtered = True
                continue
            run_required_capabilities = required_capabilities_for_run_fn(run)
            required_capability_set = set(run_required_capabilities)
            if run_required_capabilities and not required_capability_set.issubset(worker_capability_set):
                deferred_run_ids.append(run_id)
                capability_filtered = True
                continue
            if (
                requested_capability_filter
                and run_required_capabilities
                and not required_capability_set.issubset(requested_capability_filter)
            ):
                deferred_run_ids.append(run_id)
                capability_filtered = True
                continue
            now_iso = now_iso_fn()
            context = run.get("context") if isinstance(run.get("context"), dict) else {}
            metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
            workspace_id = str(context.get("workspace_id") or metadata.get("workspace_id") or "").strip()
            actor_id = str(
                metadata.get("owner_user_id")
                or metadata.get("user_id")
                or context.get("user_id")
                or ""
            ).strip()
            claim_record = build_machine_lease_record(
                machine_id=machine_id,
                run_id=run_id,
                workspace_id=workspace_id,
                actor_id=actor_id,
                ttl_seconds=lease_seconds,
                claimed_at=now_iso,
                capabilities_requested=run_required_capabilities,
                capabilities_granted=[
                    capability
                    for capability in run_required_capabilities
                    if capability in worker_capability_set
                ],
                metadata={
                    "runtime_id": worker_id,
                    "contention_strategy": "fifo_preferred_runtime",
                },
                lease_id_factory=lease_id_factory,
            )
            claimed_runs[run_id] = claim_record
            state_changed = True
            claimed_run_id = run_id
            break
        if deferred_run_ids:
            pending_run_ids[:] = deferred_run_ids + list(pending_run_ids)
            state_changed = True

    if state_changed:
        persist_local_runtime_state_fn()
    if claimed_run_id:
        mark_local_worker_seen_fn(worker_id, claimed_run_id, "busy", note="claimed_local_run")
    else:
        mark_local_worker_seen_fn(
            worker_id,
            None,
            "idle",
            note="idle_capability_wait" if capability_filtered else "idle_poll",
        )
    return claimed_run_id


def bind_machine_lease_to_run(
    run: Dict[str, Any],
    *,
    worker_id: str,
    claim: Mapping[str, Any],
    worker_state: Optional[Mapping[str, Any]],
    now_iso: str,
    normalize_policy_mode_fn: Callable[[Any], str],
) -> None:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    metadata["runtime_id"] = worker_id
    metadata["policy_mode"] = normalize_policy_mode_fn(
        worker_state.get("policy_mode") if isinstance(worker_state, dict) else None
    )
    if claim.get("machine_id"):
        metadata["machine_id"] = claim.get("machine_id")
    if claim.get("lease_id"):
        metadata["machine_lease_id"] = claim.get("lease_id")
    context["metadata"] = metadata
    run["context"] = context
    run["local_worker_id"] = worker_id
    run["machine_id"] = claim.get("machine_id") or worker_id
    run["machine_lease_id"] = claim.get("lease_id")
    run["local_claimed_at"] = now_iso
    run["local_last_heartbeat_at"] = now_iso
    run["lease_seconds"] = int(claim.get("lease_seconds") or 0)
    run.pop("_resume_after_confirmation_scheduled", None)


def clear_active_machine_lease_binding(run: Dict[str, Any]) -> None:
    run["local_worker_id"] = None
    run["local_claimed_at"] = None
    run["local_last_heartbeat_at"] = None
    run["machine_lease_id"] = None


def release_machine_lease_claim(
    run_id: str,
    *,
    worker_id: Optional[str],
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    persist_local_runtime_state_fn: Optional[Callable[[], Any]] = None,
    mark_local_worker_seen_fn: Optional[Callable[..., Any]] = None,
    status_hint: Optional[str] = None,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    with local_queue_lock:
        claim = claimed_runs.get(run_id)
        incoming_worker = str(worker_id or "").strip()
        if isinstance(claim, dict) and incoming_worker and incoming_worker != str(claim.get("worker_id")):
            raise HTTPException(status_code=403, detail="Worker does not own this local run.")
        resolved_worker = incoming_worker or (
            str(claim.get("worker_id") or "").strip() if isinstance(claim, dict) else ""
        )
        released_claim = dict(claim) if isinstance(claim, dict) else None
        released = claimed_runs.pop(run_id, None) is not None

    if released and callable(persist_local_runtime_state_fn):
        persist_local_runtime_state_fn()
    if resolved_worker and callable(mark_local_worker_seen_fn) and status_hint:
        mark_local_worker_seen_fn(resolved_worker, None, status_hint, note=note or None)
    return {
        "claim": released_claim,
        "resolved_worker": resolved_worker,
        "released": released,
    }


def reconcile_machine_lease_release(
    run_id: str,
    *,
    local_queue_lock: Any,
    local_pending_run_ids: List[str],
    local_claimed_runs: Dict[str, Dict[str, Any]],
    sync_local_runtime_state_snapshot_fn: Callable[[], Any],
) -> bool:
    changed = False
    with local_queue_lock:
        if run_id in local_pending_run_ids:
            local_pending_run_ids[:] = [rid for rid in local_pending_run_ids if rid != run_id]
            changed = True
        if local_claimed_runs.pop(run_id, None) is not None:
            changed = True
    if changed:
        sync_local_runtime_state_snapshot_fn()
    return changed


def reconcile_recovered_machine_leases(
    recovered_run_ids: List[str],
    *,
    local_queue_lock: Any,
    local_pending_run_ids: List[str],
    local_claimed_runs: Dict[str, Dict[str, Any]],
    persist_local_runtime_state_fn: Callable[[], Any],
) -> bool:
    recovered_set = {str(run_id) for run_id in recovered_run_ids if str(run_id or "").strip()}
    if not recovered_set:
        return False
    changed = False
    with local_queue_lock:
        next_pending = [run_id for run_id in local_pending_run_ids if run_id not in recovered_set]
        if next_pending != list(local_pending_run_ids):
            local_pending_run_ids[:] = next_pending
            changed = True
        for run_id in recovered_set:
            if local_claimed_runs.pop(run_id, None) is not None:
                changed = True
    if changed:
        persist_local_runtime_state_fn()
    return changed


def cleanup_stale_machine_leases(
    *,
    now: Any,
    local_queue_lock: Any,
    claimed_runs: Dict[str, Dict[str, Any]],
    worker_registry: Dict[str, Dict[str, Any]],
    runs_by_id: Mapping[str, Any],
    parse_utc_ts_fn: Callable[[Any], Any],
    utc_now_iso_fn: Callable[[], str],
    persist_local_runtime_state_fn: Callable[[], Any],
    emit_log_fn: Callable[..., Any],
    set_run_status_fn: Callable[[str, str], Any],
    local_worker_lost_timeout_seconds: int,
    default_lease_seconds: int,
) -> List[str]:
    stale: List[Dict[str, Any]] = []
    changed = False

    with local_queue_lock:
        for run_id, claim in list(claimed_runs.items()):
            if not isinstance(claim, dict):
                claimed_runs.pop(run_id, None)
                changed = True
                continue
            lease_seconds = max(10, int(claim.get("lease_seconds") or default_lease_seconds))
            last_heartbeat = parse_utc_ts_fn(claim.get("last_heartbeat_at")) or parse_utc_ts_fn(claim.get("claimed_at"))
            if last_heartbeat is None:
                last_heartbeat = now
            if (now - last_heartbeat).total_seconds() <= local_worker_lost_timeout_seconds:
                continue

            worker_id = str(claim.get("worker_id") or "").strip() or None
            machine_id = str(claim.get("machine_id") or worker_id or "").strip() or None
            claimed_runs.pop(run_id, None)
            changed = True
            if worker_id:
                worker_state = (
                    worker_registry.get(worker_id)
                    if isinstance(worker_registry.get(worker_id), dict)
                    else {}
                )
                last_seen_at = (
                    worker_state.get("last_seen_at")
                    or claim.get("last_heartbeat_at")
                    or claim.get("claimed_at")
                    or utc_now_iso_fn()
                )
                worker_registry[worker_id] = build_machine_presence_record(
                    previous_record=worker_state,
                    machine_id=worker_id,
                    current_run_id=None,
                    status_hint="offline",
                    lease_seconds=int(worker_state.get("lease_seconds") or lease_seconds),
                    now_iso=str(last_seen_at),
                    note=worker_state.get("note") if isinstance(worker_state, dict) else None,
                )
                changed = True
            stale.append(
                {
                    "run_id": run_id,
                    "worker_id": worker_id,
                    "machine_id": machine_id,
                    "lease_seconds": lease_seconds,
                    "last_heartbeat_at": claim.get("last_heartbeat_at"),
                }
            )
    if changed:
        persist_local_runtime_state_fn()

    for item in stale:
        run_id = str(item.get("run_id") or "")
        run = runs_by_id.get(run_id)
        if not isinstance(run, dict):
            continue
        status = str(run.get("status") or "").strip().lower()
        if status in {"completed", "failed", "timeout"}:
            continue
        clear_active_machine_lease_binding(run)
        run["result"] = "Worker lost connection."
        run["result_data"] = {
            "summary": "Worker lost connection.",
            "error": "local_worker_lost_connection",
            "worker_id": item.get("worker_id"),
            "machine_id": item.get("machine_id"),
            "last_heartbeat_at": item.get("last_heartbeat_at"),
        }
        log_queue = run.get("logs")
        if log_queue is not None:
            emit_log_fn(
                log_queue,
                "error",
                "Worker lost connection. Run failed.",
                event="local_worker_lost",
                data={
                    "run_id": run_id,
                    "worker_id": item.get("worker_id"),
                    "machine_id": item.get("machine_id"),
                    "lease_seconds": item.get("lease_seconds"),
                    "last_heartbeat_at": item.get("last_heartbeat_at"),
                },
            )
        set_run_status_fn(run_id, "failed")
        if log_queue is not None:
            log_queue.put(None)

    return [str(item.get("run_id") or "") for item in stale]
