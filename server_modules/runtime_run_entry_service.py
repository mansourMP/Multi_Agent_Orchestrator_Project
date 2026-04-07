from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


async def start_run_response(
    request_payload: Any,
    *,
    current_user: Any,
    execute_run_start_request_via_turn_runtime: Callable[..., Any],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
) -> Any:
    return await execute_run_start_request_via_turn_runtime(
        request_payload,
        current_user=current_user,
        stamp_request_owner_fn=stamp_request_owner_fn,
        services=run_execution_services(),
    )


def preview_routing_response(
    request_payload: Any,
    *,
    build_run_routing_preview: Callable[..., dict[str, Any]],
    run_routing_preview_services: Callable[[], Any],
) -> dict[str, Any]:
    preview = build_run_routing_preview(request_payload, services=run_routing_preview_services())
    return {
        "engine": preview["engine"],
        "agent_role": preview["metadata"].get("agent_role"),
        "agent_role_source": preview["metadata"].get("agent_role_source"),
        "route": preview["route"],
        "tool_policy_precheck": preview["tool_policy_precheck"],
    }


async def precheck_run_response(
    request_payload: Any,
    *,
    build_run_precheck_result: Callable[..., Any],
    run_routing_preview_services: Callable[[], Any],
) -> dict[str, Any]:
    preview = await build_run_precheck_result(request_payload, services=run_routing_preview_services())
    return {
        "ok": True,
        "engine": preview["engine"],
        "agent_role": preview["metadata"].get("agent_role"),
        "agent_role_source": preview["metadata"].get("agent_role_source"),
        "route": preview["route"],
        "tool_policy_precheck": preview["tool_policy_precheck"],
        "doctor_preflight": preview["doctor_preflight"],
    }


def stream_run_response(
    run_id: str,
    *,
    current_user: Any,
    runs: dict[str, Any],
    get_live_run_fn: Callable[[str], dict[str, Any] | None],
    serialize_run_snapshot: Callable[[str, dict[str, Any]], Any],
    enforce_run_owner_access: Callable[[Any, Any], None],
    event_source_response_class: Callable[[Any], Any],
    iter_logs_for_run: Callable[[str], Any],
) -> Any:
    run_record = get_live_run_fn(run_id)
    if not isinstance(run_record, dict):
        raise HTTPException(404, "Run ID not found")
    snapshot = serialize_run_snapshot(run_id, run_record)
    enforce_run_owner_access(current_user, snapshot)
    if run_id not in runs:
        raise HTTPException(409, "Run is not active in this process.")
    return event_source_response_class(iter_logs_for_run(run_id))
