from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Optional

from server_modules.agent_turn import AgentTurnRequest, resolve_run_start_turn_request
from server_modules.direct_chat_service import DirectChatExecutionServices, execute_direct_chat_turn_request
from server_modules.run_service import RunExecutionServices, execute_durable_turn_request


@dataclass(slots=True)
class TurnExecutionServices:
    run_execution: RunExecutionServices
    direct_chat: DirectChatExecutionServices


def build_turn_execution_services(
    *,
    run_execution: RunExecutionServices,
    direct_chat: DirectChatExecutionServices,
) -> TurnExecutionServices:
    return TurnExecutionServices(
        run_execution=run_execution,
        direct_chat=direct_chat,
    )


async def execute_agent_turn_request(
    *,
    turn_request: AgentTurnRequest,
    current_user: Any,
    services: TurnExecutionServices,
    chat_body: Optional[dict[str, Any]] = None,
    run_request: Optional[Any] = None,
) -> dict[str, Any]:
    if turn_request.execution_mode == "durable":
        return await execute_durable_turn_request(
            turn_request=turn_request,
            current_user=current_user,
            services=services.run_execution,
            base_request=run_request,
        )

    body = dict(chat_body or {})
    return await execute_direct_chat_turn_request(
        turn_request=turn_request,
        current_user=current_user,
        services=services.direct_chat,
        chat_body=body,
    )


async def execute_run_start_request_via_turn_runtime(
    request: Any,
    *,
    current_user: Any,
    stamp_request_owner_fn: Any,
    services: RunExecutionServices,
) -> Dict[str, Any]:
    resolution = resolve_run_start_turn_request(
        current_user=current_user,
        body=request,
        stamp_request_owner_fn=stamp_request_owner_fn,
    )
    execution = await execute_durable_turn_request(
        turn_request=resolution.turn_request,
        current_user=current_user,
        services=services,
        base_request=resolution.request,
    )
    result = execution.get("result")
    return dict(result) if isinstance(result, dict) else {"result": result}


def execute_system_run_start_request_via_turn_runtime(
    request: Any,
    *,
    stamp_request_owner_fn: Any,
    services: RunExecutionServices,
    current_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    system_user = (
        dict(current_user)
        if isinstance(current_user, dict)
        else {"auth_type": "api_key", "user_id": "", "email": ""}
    )
    return asyncio.run(
        execute_run_start_request_via_turn_runtime(
            request,
            current_user=system_user,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=services,
        )
    )


def execute_unowned_system_run_start_request_via_turn_runtime(
    request: Any,
    *,
    services: RunExecutionServices,
    current_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return execute_system_run_start_request_via_turn_runtime(
        request,
        stamp_request_owner_fn=lambda req, current_user: req,
        services=services,
        current_user=current_user,
    )


def build_execute_unowned_system_run_start_request_via_turn_runtime(
    *,
    execute_unowned_system_run_start_request_via_turn_runtime_fn: Any = execute_unowned_system_run_start_request_via_turn_runtime,
) -> Any:
    def _execute(
        request: Any,
        *,
        stamp_request_owner_fn: Any,
        services: RunExecutionServices,
        current_user: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return execute_unowned_system_run_start_request_via_turn_runtime_fn(
            request,
            services=services,
            current_user=current_user,
        )

    return _execute
