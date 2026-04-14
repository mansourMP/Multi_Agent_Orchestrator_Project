from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from server_modules.agent_turn import AgentTurnRequest
from server_modules import error_response_service
from server_modules.error_contracts import INTERNAL_ERROR, POLICY_BLOCK, USER_INPUT_ERROR


@dataclass(slots=True)
class DirectChatStreamResponseServices:
    resolve_direct_chat_turn_request: Callable[..., Any]
    chat_stream_request_signature: Callable[..., str]
    execute_agent_turn_request: Callable[..., Any]
    build_turn_execution_services: Callable[..., Any]
    run_execution_services: Callable[[], Any]
    direct_chat_execution_services: Callable[[], Any]
    get_chat_stream_state: Callable[[Any, str], Optional[dict[str, Any]]]
    chat_stream_state_db_path: Callable[[], Any]
    get_or_create_chat_stream_session: Callable[..., dict[str, Any]]
    extract_direct_chat_error_response: Callable[[Any], Optional[dict[str, str]]]
    start_chat_stream_producer: Callable[[dict[str, Any], Any], None]
    iter_chat_stream_events: Callable[[dict[str, Any], Any], Any]


def _turn_request_request_id(turn_request: AgentTurnRequest) -> str:
    context_hints = turn_request.context_hints if isinstance(turn_request.context_hints, dict) else {}
    return str(context_hints.get("request_id") or "").strip()


async def build_agent_turn_stream_response(
    *,
    current_user: dict[str, Any],
    turn_request: AgentTurnRequest,
    last_event_id: Any,
    services: DirectChatStreamResponseServices,
    chat_body: Optional[dict[str, Any]] = None,
    fallback_workspace_id: Optional[str] = None,
    fallback_thread_id: Optional[str] = None,
    fallback_client_request_id: Optional[str] = None,
) -> JSONResponse | StreamingResponse:
    run_execution_services = services.run_execution_services()
    direct_chat_execution_services = services.direct_chat_execution_services()
    try:
        execution = await services.execute_agent_turn_request(
            turn_request=turn_request,
            current_user=current_user,
            run_execution_services=run_execution_services,
            direct_chat_services=direct_chat_execution_services,
            chat_body=chat_body,
        )
    except TypeError as exc:
        if "unexpected keyword argument 'run_execution_services'" not in str(exc):
            raise
        execution = await services.execute_agent_turn_request(
            turn_request=turn_request,
            current_user=current_user,
            services=services.build_turn_execution_services(
                run_execution=run_execution_services,
                direct_chat=direct_chat_execution_services,
            ),
            chat_body=chat_body,
        )
    workspace_id = (
        str(execution.get("workspace_id") or "").strip()
        or str(fallback_workspace_id or "").strip()
        or str(turn_request.workspace_id or "").strip()
        or "default"
    )
    session_key = str(execution.get("session_key") or "").strip()
    thread_id = (
        str(execution.get("thread_id") or "").strip()
        or str(fallback_thread_id or "").strip()
        or str(turn_request.session_id or "").strip()
        or "direct-chat"
    )
    client_request_id = (
        str(execution.get("client_request_id") or "").strip()
        or str(fallback_client_request_id or "").strip()
        or _turn_request_request_id(turn_request)
    )
    producer = execution["producer"]

    existing_state = services.get_chat_stream_state(services.chat_stream_state_db_path(), session_key)
    session = services.get_or_create_chat_stream_session(
        session_key,
        thread_id=thread_id,
        request_id=client_request_id,
        workspace_id=workspace_id,
    )
    if not bool(session.get("producer_started")) and not isinstance(existing_state, dict):
        producer_iter = producer()
        try:
            first_event = next(producer_iter)
        except StopIteration:
            error = error_response_service.platform_error(
                code="chat_unavailable",
                message="Chat ended before producing a response.",
                error_class=INTERNAL_ERROR,
                retryable=True,
                status_code=500,
                request_id=client_request_id,
            )
            content = error_response_service.serialize_http_error_envelope(
                error_response_service.build_http_error_envelope(error)
            )
            content.update(
                {
                    "error_code": error.code,
                    "message": error.message,
                }
            )
            return JSONResponse(status_code=500, content=content)
        immediate_error = services.extract_direct_chat_error_response(first_event)
        if isinstance(immediate_error, dict):
            error = error_response_service.platform_error(
                code=str(immediate_error.get("error") or "direct_chat_conflict").strip() or "direct_chat_conflict",
                message=str(immediate_error.get("message") or "Direct chat could not start.").strip()
                or "Direct chat could not start.",
                error_class=POLICY_BLOCK,
                retryable=True,
                status_code=409,
                request_id=client_request_id,
            )
            content = error_response_service.serialize_http_error_envelope(
                error_response_service.build_http_error_envelope(error)
            )
            content.update(immediate_error)
            return JSONResponse(status_code=409, content=content)

        def replaying_producer():
            yield first_event
            for item in producer_iter:
                yield item

        services.start_chat_stream_producer(session, replaying_producer)
    else:
        services.start_chat_stream_producer(session, producer)

    return StreamingResponse(
        services.iter_chat_stream_events(session, last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def build_direct_chat_stream_response(
    *,
    current_user: dict[str, Any],
    body: dict[str, Any],
    last_event_id: Any,
    services: DirectChatStreamResponseServices,
) -> JSONResponse | StreamingResponse:
    try:
        direct_resolution = services.resolve_direct_chat_turn_request(
            current_user=current_user,
            body=body,
            request_signature_fn=services.chat_stream_request_signature,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_direct_chat_request",
                "message": str(exc),
                "class": USER_INPUT_ERROR,
            },
        ) from exc

    return await build_agent_turn_stream_response(
        current_user=current_user,
        turn_request=direct_resolution.turn_request,
        last_event_id=last_event_id,
        services=services,
        chat_body=body,
        fallback_workspace_id=direct_resolution.workspace_id,
        fallback_thread_id=direct_resolution.thread_id,
        fallback_client_request_id=direct_resolution.client_request_id,
    )
