from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from server_modules.agent_turn import AgentTurnRequest
from server_modules.run_service import RunExecutionServices, execute_durable_turn_request


@dataclass(slots=True)
class TurnExecutionServices:
    run_execution: RunExecutionServices
    chat_stream_key: Callable[[Any, dict], tuple[str, str, str]]
    build_direct_chat_event_producer: Callable[..., Any]


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
    body.setdefault("workspace_id", turn_request.workspace_id)
    body.setdefault("thread_id", turn_request.session_id)
    body.setdefault("message", turn_request.message)
    workspace_id = str(turn_request.workspace_id or body.get("workspace_id") or "default").strip() or "default"
    session_key, thread_id, client_request_id = services.chat_stream_key(current_user, body)

    def producer():
        return services.build_direct_chat_event_producer(
            current_user=current_user,
            body=body,
            message=turn_request.message,
            workspace_id=workspace_id,
            session_key=session_key,
            thread_id=thread_id,
            client_request_id=client_request_id,
            agent_turn_request=turn_request,
        )

    return {
        "kind": "direct_chat_stream",
        "workspace_id": workspace_id,
        "session_key": session_key,
        "thread_id": thread_id,
        "client_request_id": client_request_id,
        "producer": producer,
        "turn_request": turn_request,
    }
