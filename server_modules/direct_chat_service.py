from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Optional

from server_modules.agent_turn import (
    AgentTurnRequest,
    ensure_direct_chat_turn_request,
    resolve_agent_turn_request,
    serialize_agent_turn_request,
)


@dataclass(slots=True)
class DirectChatExecutionServices:
    chat_stream_key: Callable[[Any, dict], tuple[str, str, str]]
    session_manager_enabled: Callable[[], bool]
    session_manager_factory: Callable[[], Any]
    build_direct_operator_reply: Callable[..., Any]
    build_chat_turn_event_stream: Callable[..., Any]


def direct_chat_actor_key(current_user: Any, workspace_id: str, thread_id: str) -> str:
    owner = (
        str((current_user or {}).get("user_id") or "").strip()
        or str((current_user or {}).get("email") or "").strip().lower()
        or str((current_user or {}).get("auth_type") or "").strip()
        or "anonymous"
    )
    return f"{owner}:{str(workspace_id or 'default').strip() or 'default'}:{str(thread_id or 'direct-chat').strip() or 'direct-chat'}"


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
    resolved_turn_request = resolve_agent_turn_request(agent_turn_request)
    if isinstance(resolved_turn_request, AgentTurnRequest):
        request_meta["agent_turn_request"] = serialize_agent_turn_request(resolved_turn_request)
    return request_meta


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
    serialized_turn_request = serialize_agent_turn_request(turn_request)
    normalized_workspace_id = str(turn_request.workspace_id or workspace_id or "default").strip() or "default"
    normalized_thread_id = str(turn_request.session_id or thread_id or "direct-chat").strip() or "direct-chat"
    actor_key = direct_chat_actor_key(current_user, normalized_workspace_id, normalized_thread_id)
    user_id = (
        str((current_user or {}).get("user_id") or "").strip()
        or str((current_user or {}).get("email") or "").strip().lower()
        or str((current_user or {}).get("auth_type") or "").strip()
    )
    direct_session_ctx = {
        "workspace_id": normalized_workspace_id,
        "thread_id": normalized_thread_id,
        "user_id": user_id,
        "agent_turn_request": serialized_turn_request,
    }

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
            agent_turn_request=serialized_turn_request,
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
    body = dict(chat_body or {})
    body.setdefault("workspace_id", turn_request.workspace_id)
    body.setdefault("thread_id", turn_request.session_id)
    body.setdefault("message", turn_request.message)
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
