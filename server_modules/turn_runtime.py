from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from server_modules.agent_turn import AgentTurnRequest
from server_modules.direct_chat_service import DirectChatExecutionServices, execute_direct_chat_turn_request
from server_modules.run_service import RunExecutionServices, execute_durable_turn_request


@dataclass(slots=True)
class TurnExecutionServices:
    run_execution: RunExecutionServices
    direct_chat: DirectChatExecutionServices


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
