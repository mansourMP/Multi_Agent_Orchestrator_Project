from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any, Callable, Dict, Mapping, Optional, Sequence

from server_modules.runtime_state_store import replace_local_runtime_state


LOGGER = logging.getLogger(__name__)

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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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


def emit_approval_resolved_event(
    *,
    approval_id: str,
    run_id: str,
    tenant_id: str,
    workspace_id: str,
    resolution: str,
    actor: str,
    reason: str = "",
    trace_id: str = "",
    persist_outbox_event_fn: Optional[Callable[..., Any]] = None,
) -> OutboxEvent:
    event = OutboxEvent(
        event_id=f"approval-resolved:{approval_id}:{resolution}:{trace_id or _utc_now_iso()}",
        event_type="approval_resolved",
        tenant_id=str(tenant_id or "").strip() or "default",
        workspace_id=str(workspace_id or "").strip() or "default",
        run_id=str(run_id or "").strip() or None,
        trace_id=str(trace_id or "").strip(),
        idempotency_key=f"approval_resolved:{approval_id}:{resolution}",
        payload={
            "approval_id": str(approval_id or "").strip(),
            "run_id": str(run_id or "").strip(),
            "resolution": str(resolution or "").strip() or "approved",
            "actor": str(actor or "").strip() or "system",
            "reason": str(reason or ""),
            "emitted_at": _utc_now_iso(),
        },
    )
    if persist_outbox_event_fn is None:
        try:
            from server_modules import run_state_repository

            persist_outbox_event_fn = run_state_repository.sync_persist_outbox_event
        except Exception:
            persist_outbox_event_fn = None
    if callable(persist_outbox_event_fn):
        try:
            persist_outbox_event_fn(
                event_id=event.event_id,
                event_type=event.event_type,
                tenant_id=event.tenant_id,
                workspace_id=event.workspace_id,
                run_id=event.run_id,
                machine_id=event.machine_id,
                trace_id=event.trace_id,
                idempotency_key=event.idempotency_key,
                payload=dict(event.payload),
            )
        except Exception as exc:
            LOGGER.warning("Failed to persist outbox event %s: %s", event.event_id, exc)
    return event


def replay_undelivered_events_on_startup(
    *,
    older_than_seconds: int = 30,
    limit: int = 200,
    list_undelivered_outbox_events_fn: Optional[Callable[..., Sequence[Mapping[str, Any]]]] = None,
    mark_outbox_event_delivered_fn: Optional[Callable[[str], Any]] = None,
    deliver_event_fn: Optional[Callable[[OutboxEvent], Any]] = None,
) -> list[str]:
    if list_undelivered_outbox_events_fn is None or mark_outbox_event_delivered_fn is None:
        try:
            from server_modules import run_state_repository

            list_undelivered_outbox_events_fn = (
                list_undelivered_outbox_events_fn
                or run_state_repository.sync_list_undelivered_outbox_events
            )
            mark_outbox_event_delivered_fn = (
                mark_outbox_event_delivered_fn
                or run_state_repository.sync_mark_outbox_event_delivered
            )
        except Exception:
            return []
    delivered_ids: list[str] = []
    if not callable(list_undelivered_outbox_events_fn):
        return delivered_ids
    items = list_undelivered_outbox_events_fn(
        older_than_seconds=max(0, int(older_than_seconds or 0)),
        limit=max(1, int(limit or 0)),
    )
    for item in items or []:
        if not isinstance(item, Mapping):
            continue
        event = OutboxEvent(
            event_id=str(item.get("event_id") or "").strip(),
            event_type=str(item.get("event_type") or "").strip() or "runtime_event",
            tenant_id=str(item.get("tenant_id") or "").strip() or "default",
            workspace_id=str(item.get("workspace_id") or "").strip() or "default",
            run_id=str(item.get("run_id") or "").strip() or None,
            machine_id=str(item.get("machine_id") or "").strip() or None,
            trace_id=str(item.get("trace_id") or "").strip(),
            idempotency_key=str(item.get("idempotency_key") or "").strip(),
            payload=dict(item.get("payload") or {}) if isinstance(item.get("payload"), Mapping) else {},
        )
        if not event.event_id:
            continue
        delivered = True
        if callable(deliver_event_fn):
            try:
                delivered = bool(deliver_event_fn(event))
            except Exception as exc:
                LOGGER.warning("Outbox replay failed for %s: %s", event.event_id, exc)
                delivered = False
        if not delivered:
            continue
        try:
            mark_outbox_event_delivered_fn(event.event_id)
            delivered_ids.append(event.event_id)
        except Exception as exc:
            LOGGER.warning("Failed to mark outbox event %s delivered: %s", event.event_id, exc)
    return delivered_ids


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
