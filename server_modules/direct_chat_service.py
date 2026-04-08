from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Optional

from server_modules.agent_turn import (
    AgentTurnRequest,
    bind_agent_turn_request_meta,
    build_agent_turn_session_context,
    resolve_agent_turn_session_identity,
    ensure_direct_chat_turn_request,
)
from server_modules.api_contract import build_turn_chat_body
from server_modules import direct_chat_transport_service


@dataclass(slots=True)
class DirectChatExecutionServices:
    chat_stream_key: Callable[[Any, dict], tuple[str, str, str]]
    session_manager_enabled: Callable[[], bool]
    session_manager_factory: Callable[[], Any]
    build_direct_operator_reply: Callable[..., Any]
    build_chat_turn_event_stream: Callable[..., Any]


def build_direct_chat_execution_services(
    *,
    chat_stream_key: Callable[[Any, dict], tuple[str, str, str]],
    session_manager_enabled: Callable[[], bool],
    session_manager_factory: Callable[[], Any],
    build_direct_operator_reply: Callable[..., Any],
    build_chat_turn_event_stream: Callable[..., Any],
) -> DirectChatExecutionServices:
    return DirectChatExecutionServices(
        chat_stream_key=chat_stream_key,
        session_manager_enabled=session_manager_enabled,
        session_manager_factory=session_manager_factory,
        build_direct_operator_reply=build_direct_operator_reply,
        build_chat_turn_event_stream=build_chat_turn_event_stream,
    )


def direct_chat_request_signature(body: dict) -> str:
    return direct_chat_transport_service.direct_chat_request_signature(body)


def direct_chat_stream_key(current_user: Any, body: dict) -> tuple[str, str, str]:
    return direct_chat_transport_service.direct_chat_stream_key(
        current_user,
        body,
        request_signature_fn=direct_chat_request_signature,
    )


def direct_chat_actor_key(current_user: Any, workspace_id: str, thread_id: str) -> str:
    return direct_chat_transport_service.direct_chat_actor_key(
        current_user,
        workspace_id,
        thread_id,
    )


def direct_chat_actor_key_for_user(user_id: str, workspace_id: str, thread_id: str) -> str:
    return direct_chat_transport_service.direct_chat_actor_key_for_user(
        user_id,
        workspace_id,
        thread_id,
    )


def direct_chat_session_manager_enabled(configured: Any = None) -> bool:
    if isinstance(configured, bool):
        return configured
    return str(os.getenv("ORION_DIRECT_CHAT_SESSION_MANAGER") or "").strip().lower() in {"1", "true", "yes", "on"}


def build_direct_chat_request_meta(
    *,
    body: dict,
    workspace_id: str,
    thread_id: str,
    client_request_id: str,
    agent_turn_request: Optional[Any] = None,
) -> dict[str, Any]:
    request_meta = {
        "request_id": client_request_id,
        "client_request_id": client_request_id,
        "workspace_id": workspace_id,
        "thread_id": thread_id,
        "provider": str(body.get("provider") or "").strip(),
        "model": str(body.get("model") or "").strip(),
        "reasoning_effort": str(body.get("reasoning_effort") or "").strip(),
        "prior_messages": body.get("prior_messages") if isinstance(body.get("prior_messages"), list) else [],
        "approved_action": body.get("approved_action") if isinstance(body.get("approved_action"), dict) else None,
        "max_iterations": body.get("max_iterations"),
        "runtime_options": {
            "cwd": str(body.get("cwd") or "").strip(),
            "provider": str(body.get("provider") or "").strip(),
            "model": str(body.get("model") or "").strip(),
            "reasoning_effort": str(body.get("reasoning_effort") or "").strip(),
            "thread_id": thread_id,
        },
    }
    return bind_agent_turn_request_meta(request_meta, agent_turn_request)


def build_direct_chat_event_producer(
    *,
    current_user: Any,
    body: dict,
    message: str,
    workspace_id: str,
    session_key: str,
    thread_id: str,
    client_request_id: str,
    services: DirectChatExecutionServices,
    agent_turn_request: Optional[AgentTurnRequest] = None,
):
    turn_request = ensure_direct_chat_turn_request(
        current_user=current_user,
        body=body,
        workspace_id=workspace_id,
        thread_id=thread_id,
        client_request_id=client_request_id,
        message=message,
        agent_turn_request=agent_turn_request,
    )
    fallback_user_id = (
        str((current_user or {}).get("user_id") or "").strip()
        or str((current_user or {}).get("email") or "").strip().lower()
        or str((current_user or {}).get("auth_type") or "").strip()
    )
    identity = resolve_agent_turn_session_identity(
        turn_request,
        workspace_id=workspace_id,
        session_id=thread_id,
        user_id=fallback_user_id,
    )
    normalized_workspace_id = identity["workspace_id"]
    normalized_thread_id = identity["thread_id"]
    user_id = identity["user_id"]
    actor_key = direct_chat_actor_key_for_user(user_id, normalized_workspace_id, normalized_thread_id)
    direct_session_ctx = build_agent_turn_session_context(
        turn_request,
        workspace_id=normalized_workspace_id,
        session_id=normalized_thread_id,
        user_id=user_id,
    )

    if not services.session_manager_enabled():
        return services.build_direct_operator_reply(
            message=turn_request.message,
            workspace_id=normalized_workspace_id,
            requested_model=str(body.get("model") or "").strip(),
            requested_provider=str(body.get("provider") or "").strip(),
            thread_id=normalized_thread_id,
            prior_messages=body.get("prior_messages") if isinstance(body.get("prior_messages"), list) else [],
            reasoning_effort=str(body.get("reasoning_effort") or "").strip(),
            approved_action=body.get("approved_action") if isinstance(body.get("approved_action"), dict) else None,
            max_iterations=body.get("max_iterations"),
            session_ctx=direct_session_ctx,
            agent_turn_request=turn_request,
        )

    manager = services.session_manager_factory()
    try:
        manager.evict_idle_handles()
    except Exception:
        pass
    request_meta = build_direct_chat_request_meta(
        body=body,
        workspace_id=normalized_workspace_id,
        thread_id=normalized_thread_id,
        client_request_id=client_request_id,
        agent_turn_request=turn_request,
    )
    return manager.iter_turn_events(
        session_id=actor_key,
        actor_key=actor_key,
        workspace_id=normalized_workspace_id,
        user_id=user_id,
        message=turn_request.message,
        request_meta=request_meta,
        turn_executor=services.build_chat_turn_event_stream,
    )


async def execute_direct_chat_turn_request(
    *,
    turn_request: AgentTurnRequest,
    current_user: Any,
    services: DirectChatExecutionServices,
    chat_body: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    body = build_turn_chat_body(turn_request)
    if isinstance(chat_body, dict):
        for key, value in chat_body.items():
            if value is not None:
                body[key] = value
    body["workspace_id"] = str(body.get("workspace_id") or turn_request.workspace_id or "default").strip() or "default"
    body["thread_id"] = str(body.get("thread_id") or turn_request.session_id or "direct-chat").strip() or "direct-chat"
    body["message"] = str(body.get("message") or turn_request.message or "")
    request_id = str(body.get("client_request_id") or turn_request.context_hints.get("request_id") or "").strip()
    if request_id:
        body["client_request_id"] = request_id
    workspace_id = str(turn_request.workspace_id or body.get("workspace_id") or "default").strip() or "default"
    session_key, thread_id, client_request_id = services.chat_stream_key(current_user, body)

    def producer():
        return build_direct_chat_event_producer(
            current_user=current_user,
            body=body,
            message=turn_request.message,
            workspace_id=workspace_id,
            session_key=session_key,
            thread_id=thread_id,
            client_request_id=client_request_id,
            services=services,
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
