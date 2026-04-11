from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException

from server_modules import run_state_repository


def build_run_detail_response_callbacks(
    *,
    get_replay_payload: Callable[[str], dict[str, Any]],
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    can_view_sensitive_run_payload: Callable[[Any], bool],
    limited_run_context_view: Callable[[dict[str, Any]], dict[str, Any]],
    build_delegation_summary: Callable[[dict[str, Any], Any], Any],
    find_run_relationships: Callable[[str, dict[str, Any]], tuple[Any, Any]],
    resolve_run_connector_binding: Callable[[dict[str, Any]], Any],
    redact_sensitive: Callable[[dict[str, Any]], dict[str, Any]],
    limited_result_data_view_fn: Callable[[Any], Any],
    limited_node_states_view_fn: Callable[[Any], Any],
    trim_memory_trace_fn: Callable[[dict[str, Any]], Any],
    get_pending_confirmation_fn: Callable[[dict[str, Any]], Any],
    build_archived_run_detail_response: Callable[..., dict[str, Any]],
    build_live_run_detail_response: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    return {
        "get_replay_payload": get_replay_payload,
        "serialize_run_snapshot": serialize_run_snapshot,
        "enforce_run_owner_access": enforce_run_owner_access,
        "can_view_sensitive_run_payload": can_view_sensitive_run_payload,
        "limited_run_context_view": limited_run_context_view,
        "build_delegation_summary": build_delegation_summary,
        "find_run_relationships": find_run_relationships,
        "resolve_run_connector_binding": resolve_run_connector_binding,
        "redact_sensitive": redact_sensitive,
        "limited_result_data_view_fn": limited_result_data_view_fn,
        "limited_node_states_view_fn": limited_node_states_view_fn,
        "trim_memory_trace_fn": trim_memory_trace_fn,
        "get_pending_confirmation_fn": get_pending_confirmation_fn,
        "build_archived_run_detail_response": build_archived_run_detail_response,
        "build_live_run_detail_response": build_live_run_detail_response,
    }


def build_default_run_detail_response_callbacks(
    *,
    import_module: Callable[..., Any],
    enforce_run_owner_access: Callable[[Any, Any], None],
    can_view_sensitive_run_payload: Callable[[Any], bool],
    limited_run_context_view: Callable[[dict[str, Any]], dict[str, Any]],
    limited_result_data_view_fn: Callable[[Any], Any],
    get_pending_confirmation_fn: Callable[[dict[str, Any]], Any],
    build_archived_run_detail_response: Callable[..., dict[str, Any]],
    build_live_run_detail_response: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    runs_delegation = import_module(
        "server_modules.runs_delegation",
        fromlist=["_build_delegation_summary", "_find_run_relationships"],
    )
    runs_output = import_module(
        "server_modules.runs_output",
        fromlist=[
            "_get_replay_payload",
            "_limited_node_states_view",
            "_resolve_run_connector_binding",
            "_serialize_run_snapshot",
            "redact_sensitive",
        ],
    )
    memory_service = import_module(
        "server_modules.memory_service",
        fromlist=["trim_memory_trace"],
    )
    return build_run_detail_response_callbacks(
        get_replay_payload=runs_output._get_replay_payload,
        serialize_run_snapshot=runs_output._serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        can_view_sensitive_run_payload=can_view_sensitive_run_payload,
        limited_run_context_view=limited_run_context_view,
        build_delegation_summary=runs_delegation._build_delegation_summary,
        find_run_relationships=runs_delegation._find_run_relationships,
        resolve_run_connector_binding=runs_output._resolve_run_connector_binding,
        redact_sensitive=runs_output.redact_sensitive,
        limited_result_data_view_fn=limited_result_data_view_fn,
        limited_node_states_view_fn=runs_output._limited_node_states_view,
        trim_memory_trace_fn=memory_service.trim_memory_trace,
        get_pending_confirmation_fn=get_pending_confirmation_fn,
        build_archived_run_detail_response=build_archived_run_detail_response,
        build_live_run_detail_response=build_live_run_detail_response,
    )


def build_run_detail_response(
    run_id: str,
    *,
    current_user: Any,
    runs: dict[str, dict[str, Any]],
    get_live_run_fn: Callable[[str], dict[str, Any] | None] | None = None,
    get_replay_payload: Callable[[str], dict[str, Any]],
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    enforce_run_owner_access: Callable[[Any, Any], None],
    can_view_sensitive_run_payload: Callable[[Any], bool],
    limited_run_context_view: Callable[[dict[str, Any]], dict[str, Any]],
    build_delegation_summary: Callable[[dict[str, Any], Any], Any],
    find_run_relationships: Callable[[str, dict[str, Any]], tuple[Any, Any]],
    resolve_run_connector_binding: Callable[[dict[str, Any]], Any],
    redact_sensitive: Callable[[dict[str, Any]], dict[str, Any]],
    limited_result_data_view_fn: Callable[[Any], Any],
    limited_node_states_view_fn: Callable[[Any], Any],
    trim_memory_trace_fn: Callable[[dict[str, Any]], Any],
    get_pending_confirmation_fn: Callable[[dict[str, Any]], Any],
    build_archived_run_detail_response: Callable[..., dict[str, Any]],
    build_live_run_detail_response: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    include_sensitive = can_view_sensitive_run_payload(current_user)
    run = runs.get(run_id) if isinstance(runs, dict) else None
    if not isinstance(run, dict) and callable(get_live_run_fn):
        run = get_live_run_fn(run_id)

    if run is None:
        try:
            snapshot = get_replay_payload(run_id)
        except HTTPException:
            raise HTTPException(404, "Run ID not found")
        enforce_run_owner_access(current_user, snapshot)
        context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        parent_run, child_runs = find_run_relationships(run_id, snapshot)
        delegation_summary = build_delegation_summary(snapshot, child_runs)
        safe_context = redact_sensitive(context) if include_sensitive else limited_run_context_view(context)
        return build_archived_run_detail_response(
            run_id=run_id,
            snapshot=snapshot,
            metadata=metadata,
            include_sensitive=include_sensitive,
            safe_context=safe_context,
            parent_run=parent_run,
            child_runs=child_runs,
            delegation_summary=delegation_summary,
            connector_binding=resolve_run_connector_binding(snapshot),
            limited_result_data_view_fn=limited_result_data_view_fn,
            limited_node_states_view_fn=limited_node_states_view_fn,
        )

    context = run.get("context", {})
    metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
    snapshot = serialize_run_snapshot(run_id, run)
    enforce_run_owner_access(current_user, snapshot)
    parent_run, child_runs = find_run_relationships(run_id, snapshot)
    delegation_summary = build_delegation_summary(snapshot, child_runs)
    safe_context = redact_sensitive(context) if include_sensitive else limited_run_context_view(context)
    return build_live_run_detail_response(
        run_id=run_id,
        run=run,
        snapshot=snapshot,
        metadata=metadata,
        include_sensitive=include_sensitive,
        safe_context=safe_context,
        parent_run=parent_run,
        child_runs=child_runs,
        delegation_summary=delegation_summary,
        connector_binding=resolve_run_connector_binding(snapshot),
        limited_result_data_view_fn=limited_result_data_view_fn,
        limited_node_states_view_fn=limited_node_states_view_fn,
        trim_memory_trace_fn=trim_memory_trace_fn,
        get_pending_confirmation_fn=get_pending_confirmation_fn,
    )


def build_run_list_response(
    *,
    limit: int,
    offset: int,
    workspace_id: str | None,
    status: str | None,
    pack_id: str | None,
    current_user: Any,
    runs: dict[str, dict[str, Any]],
    list_live_runs_fn: Callable[[], list[dict[str, Any]]] | None = None,
    run_history_lock: Any,
    run_history: list[dict[str, Any]],
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]],
    history_item_matches: Callable[[Any, Any, Any, Any], bool],
    current_user_is_privileged: Callable[[Any], bool],
    extract_run_owner_user_id: Callable[[Any], str],
    summarize_history_item: Callable[[dict[str, Any]], dict[str, Any]],
    parse_utc_ts: Callable[[Any], Any],
    list_live_runs_page_fn: Callable[[int, int, str | None, list[str] | None], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit), 200))
    safe_offset = max(0, int(offset))
    request_user_id = str((current_user or {}).get("user_id") or "").strip()
    include_all = current_user_is_privileged(current_user)
    if not include_all and not request_user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id is required.")

    def _visible(payload: Any) -> bool:
        if include_all:
            return True
        return extract_run_owner_user_id(payload) == request_user_id

    items: list[dict[str, Any]] = []
    seen_run_ids: set[str] = set()

    live_runs: list[dict[str, Any]] = []
    if callable(list_live_runs_page_fn):
        page_size = max(safe_limit + safe_offset, 200)
        page_offset = 0
        requested_states = [str(status or "").strip().lower()] if str(status or "").strip() else None
        while True:
            page = list_live_runs_page_fn(page_size, page_offset, workspace_id, requested_states)
            if not page:
                break
            live_runs.extend(page)
            if len(page) < page_size:
                break
            page_offset += page_size
    else:
        live_runs = list_live_runs_fn() if callable(list_live_runs_fn) else run_state_repository.sync_list_live_runs()
    for run in live_runs:
        if not isinstance(run, dict):
            continue
        run_id = str(run.get("run_id") or "").strip()
        if not run_id:
            continue
        snapshot = serialize_run_snapshot(run_id, run)
        if not history_item_matches(snapshot, workspace_id, status, pack_id):
            continue
        if not _visible(snapshot):
            continue
        summary = summarize_history_item(snapshot)
        summary["source"] = "live"
        items.append(summary)
        token = str(summary.get("run_id") or run_id).strip()
        if token:
            seen_run_ids.add(token)

    with run_history_lock:
        history_items = list(run_history)
    for item in history_items:
        if not isinstance(item, dict):
            continue
        if not history_item_matches(item, workspace_id, status, pack_id):
            continue
        if not _visible(item):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if run_id and run_id in seen_run_ids:
            continue
        summary = summarize_history_item(item)
        summary["source"] = "history"
        items.append(summary)
        if run_id:
            seen_run_ids.add(run_id)

    items.sort(
        key=lambda item: (
            parse_utc_ts(item.get("updated_at")) or parse_utc_ts(item.get("created_at")),
            str(item.get("run_id") or ""),
        ),
        reverse=True,
    )
    total = len(items)
    payload = items[safe_offset : safe_offset + safe_limit]
    next_offset = safe_offset + safe_limit if safe_offset + safe_limit < total else None
    return {
        "items": payload,
        "count": len(payload),
        "total": total,
        "limit": safe_limit,
        "offset": safe_offset,
        "next_offset": next_offset,
    }
