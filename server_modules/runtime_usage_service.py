from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException
from server_modules import run_state_repository


def normalize_usage_period(period: Any) -> str:
    value = str(period or "all").strip().lower()
    return value if value in {"day", "week", "month", "all"} else "all"


def usage_snapshots_for_user(
    current_user: Any,
    *,
    refresh_server_exports: Callable[[], Any],
    run_history_lock: Any,
    run_history: list[Any],
    runs: dict[str, Any],
    list_live_runs_fn: Callable[[], list[dict[str, Any]]] | None = None,
    serialize_snapshot: Callable[[str, Any], dict[str, Any]],
    current_user_is_privileged: Callable[[Any], bool],
    extract_run_owner_user_id: Callable[[Any], str],
) -> list[dict[str, Any]]:
    refresh_server_exports()
    with run_history_lock:
        archived_items = list(run_history)
    combined: dict[str, dict[str, Any]] = {}
    for item in archived_items:
        if isinstance(item, dict):
            run_id = str(item.get("run_id") or "").strip()
            if run_id:
                combined[run_id] = item

    live_runs = list_live_runs_fn() if callable(list_live_runs_fn) else run_state_repository.sync_list_live_runs()
    live_run_items: list[tuple[str, Any]] = []
    if live_runs:
        live_run_items = [
            (str(run.get("run_id") or "").strip(), run)
            for run in live_runs
            if isinstance(run, dict)
        ]
    elif isinstance(runs, dict):
        live_run_items = [(str(run_id or "").strip(), run) for run_id, run in runs.items()]
    for run_id, run in live_run_items:
        if not isinstance(run, dict):
            continue
        if not isinstance(run.get("usage_masked"), dict):
            continue
        if not run_id:
            continue
        try:
            snapshot = serialize_snapshot(run_id, run)
        except Exception:
            continue
        snapshot_run_id = str(snapshot.get("run_id") or run_id).strip()
        if snapshot_run_id:
            combined[snapshot_run_id] = snapshot

    items = list(combined.values())
    if current_user_is_privileged(current_user):
        return items
    request_user_id = str(current_user.get("user_id") or "").strip()
    if not request_user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id is required.")
    return [item for item in items if extract_run_owner_user_id(item) == request_user_id]


def usage_summary_payload(
    *,
    period: Any,
    current_user: Any,
    usage_snapshots_for_user_fn: Callable[..., list[dict[str, Any]]],
    aggregate_usage_summary_fn: Callable[..., Any],
) -> Any:
    snapshots = usage_snapshots_for_user_fn(current_user)
    return aggregate_usage_summary_fn(snapshots, period=normalize_usage_period(period))


def usage_runs_payload(
    *,
    limit: int,
    offset: int,
    period: Any,
    current_user: Any,
    usage_snapshots_for_user_fn: Callable[..., list[dict[str, Any]]],
    list_usage_runs_fn: Callable[..., Any],
) -> Any:
    snapshots = usage_snapshots_for_user_fn(current_user)
    return list_usage_runs_fn(
        snapshots,
        period=normalize_usage_period(period),
        limit=limit,
        offset=offset,
    )
