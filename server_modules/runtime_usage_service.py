from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


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

    for run_id, run in list(runs.items()):
        if not isinstance(run, dict):
            continue
        if not isinstance(run.get("usage_masked"), dict):
            continue
        try:
            snapshot = serialize_snapshot(str(run_id), run)
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
