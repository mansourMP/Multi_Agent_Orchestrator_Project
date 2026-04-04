from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass(slots=True)
class DirectChatResponseServices:
    with_context_used: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
    build_context_used: Callable[..., Dict[str, Any]]
    connected_provider_tokens: Callable[[str], List[str]]
    list_memory_entries: Callable[[str], List[Any]]
    active_run_count: Callable[[str], int]
    get_memory: Callable[[str], str]
    delete_memory: Callable[[str, str], bool]
    slash_command_help_text: Callable[[], str]
    execute_direct_tool_calls: Callable[..., str]
    direct_chat_credentials: Callable[[str, str], Dict[str, Any]]
    capture_exception: Callable[[BaseException], None]


def slash_command_payload(
    *,
    slash_command_name: str,
    slash_remainder: str,
    workspace_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    availability_payload: Dict[str, Any],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    proactive_suggestions: List[str],
    base_context_used: Dict[str, Any],
    services: DirectChatResponseServices,
) -> Optional[Dict[str, Any]]:
    if not slash_command_name:
        return None
    if slash_command_name == "status":
        connected_providers = services.connected_provider_tokens(workspace_id)
        reply = (
            "Runtime status\n"
            f"- AI ready: {'yes' if bool(availability_payload.get('ai_ready')) else 'no'}\n"
            f"- Connected providers: {', '.join(connected_providers) if connected_providers else 'none'}\n"
            f"- Memory facts: {len(services.list_memory_entries(workspace_id))}\n"
            f"- Active runs: {services.active_run_count(workspace_id)}"
        )
        return services.with_context_used({"reply": reply, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)
    if slash_command_name == "memory":
        memory_text = services.get_memory(workspace_id) or "No memory facts saved yet."
        return services.with_context_used({"reply": memory_text, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)
    if slash_command_name == "forget":
        memory_key = str(slash_remainder or "").strip()
        if not memory_key:
            reply = "Usage: /forget <key>"
        else:
            deleted = services.delete_memory(workspace_id, memory_key)
            reply = f"Forgot memory '{memory_key}'." if deleted else f"Memory '{memory_key}' was not found."
        return services.with_context_used({"reply": reply, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)
    if slash_command_name == "model":
        if not requested_model:
            reply = "Usage: /model <name>"
        else:
            provider_label = f" ({requested_provider})" if requested_provider else ""
            reply = f"Chat model set to {requested_model}{provider_label} for this session."
        return services.with_context_used({"reply": reply, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)
    if slash_command_name == "clear":
        return services.with_context_used({"reply": "Conversation history cleared for this thread.", "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)
    if slash_command_name == "help":
        return services.with_context_used({"reply": services.slash_command_help_text(), "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)
    return None


def empty_message_payload(
    *,
    proactive_suggestions: List[str],
    base_context_used: Dict[str, Any],
    services: DirectChatResponseServices,
) -> Dict[str, Any]:
    return services.with_context_used(
        {
            "reply": "Tell me the outcome you want and I’ll help you move it forward.",
            "actions": [],
            "suggestions": proactive_suggestions,
            "mode": "answer",
        },
        base_context_used,
    )


def approval_confirmation_payload(
    *,
    approved_action_payload: Optional[Dict[str, str]],
    workspace_id: str,
    thread_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    session_ctx: Optional[Dict[str, Any]],
    proactive_suggestions: List[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    tool_write_action_available_fn: Callable[[str, str, List[Dict[str, Any]]], bool],
    approved_action_to_tool_call_fn: Callable[[Dict[str, str]], Dict[str, Any]],
    services: DirectChatResponseServices,
) -> Dict[str, Any]:
    base_context = services.build_context_used(
        workspace_id=workspace_id,
        requested_provider=requested_provider,
        effective_provider=None,
        requested_model=requested_model,
        effective_model=None,
        reasoning_effort=reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        prior_messages_used=False,
        history_mode="none",
        run_created=False,
        fallback_used=False,
        fallback_reason=None,
    )
    if approved_action_payload is None:
        return services.with_context_used(
            {
                "reply": "Approval confirmation is missing the connector action payload.",
                "actions": [],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "error": "missing_approved_action",
            },
            base_context,
        )
    if not tool_write_action_available_fn(
        approved_action_payload["connector"],
        approved_action_payload["action"],
        tool_capabilities,
    ):
        return services.with_context_used(
            {
                "reply": "That connector action is not available in this workspace right now.",
                "actions": [],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "error": "unavailable_approved_action",
            },
            base_context,
        )
    try:
        tool_reply = services.execute_direct_tool_calls(
            tool_calls=[approved_action_to_tool_call_fn(approved_action_payload)],
            workspace_id=workspace_id,
            thread_id=thread_id,
            provider=requested_provider or None,
            model=requested_model or None,
            credentials=services.direct_chat_credentials(workspace_id, requested_provider) if requested_provider else None,
            reasoning_effort=reasoning_effort or "",
            session_ctx=session_ctx,
        )
        return {
            "reply": tool_reply or "Connector action completed.",
            "actions": [],
            "suggestions": proactive_suggestions,
            "mode": "answer",
            "usage_masked": {},
            "provider": None,
            "model": None,
            "attempted_providers": "",
            "error": "",
            "context_used": base_context,
        }
    except Exception as exc:
        error_text = str(exc).strip() or "connector_action_failed"
        services.capture_exception(exc)
        return {
            "reply": f"Connector action failed: {error_text}",
            "actions": [],
            "suggestions": proactive_suggestions,
            "mode": "answer",
            "usage_masked": {},
            "provider": None,
            "model": None,
            "attempted_providers": "",
            "error": error_text,
            "context_used": base_context,
        }


def unavailable_fallback_payload(
    *,
    fallback_payload: Optional[Dict[str, Any]],
    proactive_suggestions: List[str],
    workspace_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    no_provider_tool_fallback_reason: str,
    unavailable_fallback_reason: str,
    services: DirectChatResponseServices,
    no_provider_reasoning_required_response_fn: Callable[[], Dict[str, Any]],
) -> Dict[str, Any]:
    fallback_context = services.build_context_used(
        workspace_id=workspace_id,
        requested_provider=requested_provider,
        effective_provider=None,
        requested_model=requested_model,
        effective_model=None,
        reasoning_effort=reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        prior_messages_used=False,
        history_mode="none",
        run_created=False,
        fallback_used=True,
        fallback_reason=no_provider_tool_fallback_reason if fallback_payload is not None else unavailable_fallback_reason,
    )
    if fallback_payload is not None:
        return services.with_context_used({**fallback_payload, "suggestions": proactive_suggestions}, fallback_context)
    return services.with_context_used(
        {**no_provider_reasoning_required_response_fn(), "suggestions": proactive_suggestions},
        fallback_context,
    )
