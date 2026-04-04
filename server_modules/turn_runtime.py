from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from fastapi import HTTPException

from server_modules.agent_turn import AgentTurnRequest
from server_modules.doctor_gate import build_doctor_run_gate_live
from server_modules.run_service import build_run_start_request_from_turn
from server_modules.runtime_policy import apply_execution_route_metadata, decide_execution_target


@dataclass(slots=True)
class TurnExecutionServices:
    stamp_request_owner: Callable[[Any, Any], Any]
    prepare_run_start_request: Callable[[Any], Dict[str, Any]]
    create_run_from_request: Callable[[Any], Dict[str, Any]]
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
        req = build_run_start_request_from_turn(turn_request, base_request=run_request)
        req = services.stamp_request_owner(req, current_user)
        prepared = services.prepare_run_start_request(req)
        metadata = dict(prepared["metadata"])
        route = decide_execution_target(metadata)
        metadata = apply_execution_route_metadata(metadata, route)
        doctor_preflight = await build_doctor_run_gate_live(
            execution_target=route["selected"],
            metadata=metadata,
            provider=req.provider,
            credential_id=req.credential_id,
        )
        if bool(doctor_preflight.get("blocking")):
            raise HTTPException(
                status_code=409,
                detail=str(
                    doctor_preflight.get("detail")
                    or doctor_preflight.get("title")
                    or "Run blocked by doctor policy."
                ),
            )
        result = services.create_run_from_request(req)
        if isinstance(result, dict):
            result["doctor_preflight"] = doctor_preflight
        return {
            "kind": "durable_run",
            "result": result,
            "turn_request": turn_request,
        }

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
