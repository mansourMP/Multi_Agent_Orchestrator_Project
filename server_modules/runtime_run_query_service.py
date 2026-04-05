from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


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
        fromlist=["_trim_memory_trace"],
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
        trim_memory_trace_fn=memory_service._trim_memory_trace,
        get_pending_confirmation_fn=get_pending_confirmation_fn,
        build_archived_run_detail_response=build_archived_run_detail_response,
        build_live_run_detail_response=build_live_run_detail_response,
    )


def build_run_detail_response(
    run_id: str,
    *,
    current_user: Any,
    runs: dict[str, dict[str, Any]],
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
    run = runs.get(run_id)

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
