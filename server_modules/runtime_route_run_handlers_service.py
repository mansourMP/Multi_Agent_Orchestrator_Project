from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


async def start_run_route_response(
    body: Any,
    *,
    current_user: Any,
    run_start_request_class: Callable[..., Any],
    start_run_response_fn: Callable[..., Any],
    execute_run_start_request_via_turn_runtime: Callable[..., Any],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
) -> Any:
    return await start_run_response_fn(
        body or run_start_request_class(),
        current_user=current_user,
        execute_run_start_request_via_turn_runtime=execute_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
    )


def preview_routing_route_response(
    body: Any,
    *,
    run_start_request_class: Callable[..., Any],
    preview_routing_response_fn: Callable[..., Any],
    build_run_routing_preview: Callable[..., Any],
    run_routing_preview_services: Callable[[], Any],
) -> Any:
    return preview_routing_response_fn(
        body or run_start_request_class(),
        build_run_routing_preview=build_run_routing_preview,
        run_routing_preview_services=run_routing_preview_services,
    )


async def precheck_run_route_response(
    body: Any,
    *,
    run_start_request_class: Callable[..., Any],
    precheck_run_response_fn: Callable[..., Any],
    build_run_precheck_result: Callable[..., Any],
    run_routing_preview_services: Callable[[], Any],
) -> Any:
    return await precheck_run_response_fn(
        body or run_start_request_class(),
        build_run_precheck_result=build_run_precheck_result,
        run_routing_preview_services=run_routing_preview_services,
    )


def _ensure_delegation_enabled(single_agent_mode: bool) -> None:
    if single_agent_mode:
        raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")


def delegate_run_route_response(
    run_id: Any,
    *,
    body: Any,
    current_user: Any,
    single_agent_mode: bool,
    delegate_run_children_fn: Callable[..., Any],
    callbacks: dict[str, Any],
) -> Any:
    _ensure_delegation_enabled(single_agent_mode)
    return delegate_run_children_fn(
        str(run_id),
        body=body,
        current_user=current_user,
        **callbacks,
    )


def auto_delegate_run_route_response(
    run_id: Any,
    *,
    body: Any,
    current_user: Any,
    single_agent_mode: bool,
    request_payload_class: Callable[..., Any],
    auto_delegate_run_children_fn: Callable[..., Any],
    callbacks: dict[str, Any],
) -> Any:
    _ensure_delegation_enabled(single_agent_mode)
    return auto_delegate_run_children_fn(
        str(run_id),
        request_payload=body or request_payload_class(),
        current_user=current_user,
        **callbacks,
    )


def retry_failed_delegation_runs_route_response(
    run_id: Any,
    *,
    body: Any,
    current_user: Any,
    single_agent_mode: bool,
    request_payload_class: Callable[..., Any],
    retry_failed_delegation_runs_fn: Callable[..., Any],
    callbacks: dict[str, Any],
) -> Any:
    _ensure_delegation_enabled(single_agent_mode)
    return retry_failed_delegation_runs_fn(
        str(run_id),
        request_payload=body or request_payload_class(),
        current_user=current_user,
        **callbacks,
    )


def get_run_replay_route_response(
    run_id: Any,
    *,
    replay_item_response_for_run: Callable[..., Any],
    get_replay_payload: Callable[[str], dict[str, Any]],
) -> Any:
    return replay_item_response_for_run(
        str(run_id),
        get_replay_payload=get_replay_payload,
    )


def replay_run_route_response(
    run_id: Any,
    *,
    replay_run_from_run_id_fn: Callable[..., Any],
    get_replay_payload: Callable[[str], dict[str, Any]],
    run_start_request_class: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., Any],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
) -> Any:
    return replay_run_from_run_id_fn(
        str(run_id),
        get_replay_payload=get_replay_payload,
        run_start_request_class=run_start_request_class,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
    )


def stream_run_route_response(
    run_id: Any,
    *,
    current_user: Any,
    stream_run_response_fn: Callable[..., Any],
    runs: dict[str, Any],
    serialize_run_snapshot: Callable[[str, dict[str, Any]], Any],
    enforce_run_owner_access: Callable[[Any, Any], None],
    event_source_response_class: Callable[[Any], Any],
    iter_logs_for_run: Callable[[str], Any],
) -> Any:
    return stream_run_response_fn(
        str(run_id),
        current_user=current_user,
        runs=runs,
        serialize_run_snapshot=serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        event_source_response_class=event_source_response_class,
        iter_logs_for_run=iter_logs_for_run,
    )


def submit_run_decision_route_response(
    run_id: Any,
    *,
    payload: Any,
    current_user: Any,
    submit_run_decision_fn: Callable[..., Any],
    run: dict[str, Any] | None,
    callbacks: dict[str, Any],
) -> Any:
    payload.validate_fields()
    return submit_run_decision_fn(
        str(run_id),
        run=run,
        payload=payload,
        current_user=current_user,
        **callbacks,
    )


def resolve_run_approval_route_response(
    run_id: Any,
    approval_id: str,
    *,
    payload: Any,
    current_user: Any,
    resolve_run_approval_fn: Callable[..., Any],
    run: dict[str, Any] | None,
    callbacks: dict[str, Any],
) -> Any:
    payload.validate_fields()
    return resolve_run_approval_fn(
        str(run_id),
        approval_id,
        run=run,
        payload=payload,
        current_user=current_user,
        **callbacks,
    )


def resume_run_route_response(
    run_id: Any,
    *,
    current_user: Any,
    resume_waiting_run_fn: Callable[..., Any],
    run: dict[str, Any] | None,
    callbacks: dict[str, Any],
) -> Any:
    return resume_waiting_run_fn(
        str(run_id),
        run=run,
        current_user=current_user,
        **callbacks,
    )
