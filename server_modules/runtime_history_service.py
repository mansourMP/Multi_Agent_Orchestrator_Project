from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def build_runs_history_callbacks(
    *,
    refresh_server_exports: Callable[[], Any],
    run_history_lock: Any,
    run_history: list[Any],
    history_item_matches: Callable[[Any, Any, Any, Any], bool],
    current_user_is_privileged: Callable[[Any], bool],
    extract_run_owner_user_id: Callable[[Any], str],
    enforce_workspace_access: Callable[..., str] | None,
    normalize_run_id_token: Callable[[Any], str | None],
    summarize_history_item: Callable[[Any], dict[str, Any]],
) -> dict[str, Any]:
    return {
        "refresh_server_exports": refresh_server_exports,
        "run_history_lock": run_history_lock,
        "run_history": run_history,
        "history_item_matches": history_item_matches,
        "current_user_is_privileged": current_user_is_privileged,
        "extract_run_owner_user_id": extract_run_owner_user_id,
        "enforce_workspace_access": enforce_workspace_access,
        "normalize_run_id_token": normalize_run_id_token,
        "summarize_history_item": summarize_history_item,
    }


def build_runs_history_payload(
    *,
    limit: int,
    workspace_id: str | None,
    status: str | None,
    pack_id: str | None,
    current_user: Any,
    refresh_server_exports: Callable[[], Any],
    run_history_lock: Any,
    run_history: list[Any],
    history_item_matches: Callable[[Any, Any, Any, Any], bool],
    current_user_is_privileged: Callable[[Any], bool],
    extract_run_owner_user_id: Callable[[Any], str],
    enforce_workspace_access: Callable[..., str] | None,
    normalize_run_id_token: Callable[[Any], str | None],
    summarize_history_item: Callable[[Any], dict[str, Any]],
) -> dict[str, Any]:
    refresh_server_exports()
    safe_limit = max(1, min(limit, 200))
    resolved_workspace_id = workspace_id
    if workspace_id is not None and callable(enforce_workspace_access):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id,
            minimum_role="viewer",
        )
    with run_history_lock:
        items = list(run_history)
    filtered = [item for item in items if history_item_matches(item, resolved_workspace_id, status, pack_id)]
    if not current_user_is_privileged(current_user):
        request_user_id = str(current_user.get("user_id") or "").strip()
        if not request_user_id:
            raise HTTPException(status_code=401, detail="Authenticated user id is required.")
        filtered = [item for item in filtered if extract_run_owner_user_id(item) == request_user_id]
    child_counts: dict[str, int] = {}
    for item in filtered:
        parent_run_id = normalize_run_id_token(item.get("parent_run_id"))
        if parent_run_id:
            child_counts[parent_run_id] = child_counts.get(parent_run_id, 0) + 1
    payload = []
    for item in filtered[:safe_limit]:
        summary = summarize_history_item(item)
        run_id_value = str(summary.get("run_id") or "").strip()
        summary["child_run_count"] = child_counts.get(run_id_value, 0)
        payload.append(summary)
    return {
        "items": payload,
        "count": len(payload),
        "total": len(filtered),
    }
