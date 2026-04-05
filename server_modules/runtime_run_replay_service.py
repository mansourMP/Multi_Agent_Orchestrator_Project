from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException


def replay_item_response(*, item: dict[str, Any]) -> dict[str, Any]:
    return {"item": item}


def replay_run_from_item(
    *,
    item: dict[str, Any],
    run_start_request_class: Callable[..., Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., Any],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
) -> Any:
    replay_payload = item.get("replay_request")
    if not isinstance(replay_payload, dict):
        raise HTTPException(status_code=400, detail="Replay request is not available for this run.")
    try:
        request = run_start_request_class(**replay_payload)
        return execute_system_run_start_request_via_turn_runtime(
            request,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=run_execution_services(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
