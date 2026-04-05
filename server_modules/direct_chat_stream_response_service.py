from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse, StreamingResponse


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
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    direct_turn_request = direct_resolution.turn_request
    execution = await services.execute_agent_turn_request(
        turn_request=direct_turn_request,
        current_user=current_user,
        services=services.build_turn_execution_services(
            run_execution=services.run_execution_services(),
            direct_chat=services.direct_chat_execution_services(),
        ),
        chat_body=body,
    )
    workspace_id = str(execution.get("workspace_id") or direct_resolution.workspace_id or "default").strip() or "default"
    session_key = str(execution.get("session_key") or "").strip()
    thread_id = str(execution.get("thread_id") or direct_resolution.thread_id or "direct-chat").strip() or "direct-chat"
    client_request_id = str(execution.get("client_request_id") or direct_resolution.client_request_id or "").strip()
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
            return JSONResponse(
                status_code=500,
                content={"error": "chat_unavailable", "message": "Chat ended before producing a response."},
            )
        immediate_error = services.extract_direct_chat_error_response(first_event)
        if isinstance(immediate_error, dict):
            return JSONResponse(status_code=409, content=immediate_error)

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
