from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, Optional, Sequence

from server_modules.runtime_state_store import replace_local_runtime_state


@dataclass(slots=True)
class OutboxEvent:
    event_id: str
    event_type: str
    tenant_id: str
    workspace_id: str
    run_id: Optional[str] = None
    machine_id: Optional[str] = None
    trace_id: str = ""
    idempotency_key: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LocalRuntimeStateSnapshot:
    pending_run_ids: list[str] = field(default_factory=list)
    claimed_runs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    runtime_registrations: Dict[str, Dict[str, Any]] = field(default_factory=dict)


def build_local_runtime_state_snapshot(
    *,
    pending_run_ids: Sequence[Any],
    claimed_runs: Mapping[str, Any],
    runtime_registrations: Mapping[str, Any],
) -> LocalRuntimeStateSnapshot:
    return LocalRuntimeStateSnapshot(
        pending_run_ids=[str(run_id) for run_id in pending_run_ids],
        claimed_runs={
            str(run_id): dict(info)
            for run_id, info in claimed_runs.items()
            if isinstance(info, dict)
        },
        runtime_registrations={
            str(runtime_id): dict(record)
            for runtime_id, record in runtime_registrations.items()
            if isinstance(record, dict)
        },
    )


def replace_local_runtime_state_snapshot(
    db_path: Path,
    snapshot: LocalRuntimeStateSnapshot,
    *,
    replace_local_runtime_state_fn: Callable[..., Any] = replace_local_runtime_state,
) -> bool:
    try:
        replace_local_runtime_state_fn(
            db_path,
            pending_run_ids=list(snapshot.pending_run_ids),
            claimed_runs=dict(snapshot.claimed_runs),
            runtime_registrations=dict(snapshot.runtime_registrations),
        )
    except Exception:
        return False
    return True


def persist_local_runtime_state(
    *,
    db_path: Path,
    pending_run_ids: Sequence[Any],
    claimed_runs: Mapping[str, Any],
    runtime_registrations: Mapping[str, Any],
    replace_local_runtime_state_fn: Callable[..., Any] = replace_local_runtime_state,
) -> bool:
    snapshot = build_local_runtime_state_snapshot(
        pending_run_ids=pending_run_ids,
        claimed_runs=claimed_runs,
        runtime_registrations=runtime_registrations,
    )
    return replace_local_runtime_state_snapshot(
        db_path,
        snapshot,
        replace_local_runtime_state_fn=replace_local_runtime_state_fn,
    )


def enqueue_local_companion_run(
    run_id: str,
    *,
    runs_by_id: Mapping[str, Any],
    set_run_status_fn: Callable[[str, str], Any],
    utc_now_iso_fn: Callable[[], str],
    local_queue_lock: Any,
    pending_run_ids: list[str],
    claimed_runs: Mapping[str, Any],
    runtime_registrations: Mapping[str, Any],
    db_path: Path,
    lease_seconds: int,
    emit_log_fn: Callable[..., Any],
    message: str = "Run queued for Local Companion execution.",
    event: str = "local_queued",
    replace_local_runtime_state_fn: Callable[..., Any] = replace_local_runtime_state,
) -> bool:
    run = runs_by_id.get(run_id)
    if not isinstance(run, dict):
        return False
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    waiting_reason = str(metadata.get("execution_target_reason") or "").strip()
    if message == "Run queued for Local Companion execution." and waiting_reason:
        if bool(metadata.get("execution_target_waiting_for_runtime")) or bool(
            metadata.get("execution_target_waiting_for_capacity")
        ):
            message = waiting_reason

    set_run_status_fn(run_id, "queued_local")
    run["updated_at"] = utc_now_iso_fn()

    snapshot: Optional[LocalRuntimeStateSnapshot] = None
    with local_queue_lock:
        if run_id not in pending_run_ids:
            pending_run_ids.append(run_id)
        snapshot = build_local_runtime_state_snapshot(
            pending_run_ids=pending_run_ids,
            claimed_runs=claimed_runs,
            runtime_registrations=runtime_registrations,
        )

    if snapshot is not None:
        replace_local_runtime_state_snapshot(
            db_path,
            snapshot,
            replace_local_runtime_state_fn=replace_local_runtime_state_fn,
        )

    emit_log_fn(
        run["logs"],
        "info",
        message,
        event=event,
        data={
            "run_id": run_id,
            "lease_seconds": lease_seconds,
            "waiting_for_runtime": bool(metadata.get("execution_target_waiting_for_runtime")),
            "required_capabilities": list(metadata.get("execution_target_required_capabilities") or []),
            "missing_capabilities": list(metadata.get("execution_target_missing_capabilities") or []),
            "matching_runtime_ids": list(metadata.get("execution_target_matching_runtime_ids") or []),
            "available_runtime_ids": list(metadata.get("execution_target_available_runtime_ids") or []),
            "busy_runtime_ids": list(metadata.get("execution_target_busy_runtime_ids") or []),
            "preferred_runtime_id": metadata.get("execution_target_preferred_runtime_id"),
            "preferred_runtime_label": metadata.get("execution_target_preferred_runtime_label"),
            "waiting_for_capacity": bool(metadata.get("execution_target_waiting_for_capacity")),
        },
    )
    return True
