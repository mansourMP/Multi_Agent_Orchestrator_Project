from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass(slots=True)
class PreparedDirectChatRequest:
    normalized_message: str
    normalized_workspace_id: str
    normalized_thread_id: str
    session_key: str
    normalized_requested_provider: str
    normalized_requested_model: str
    normalized_reasoning_effort: Optional[str]
    compaction: Dict[str, Any]
    compacted_prior_messages: List[Dict[str, Any]]
    proactive_suggestions: List[str]
    tool_loop_session_key: str
    availability_payload: Dict[str, Any]
    connected_systems: List[str]
    tool_capabilities: List[Dict[str, Any]]
    tools: List[Dict[str, Any]]
    approved_action_payload: Optional[Dict[str, str]]
    base_context_used: Dict[str, Any]
    slash_command_name: str
    slash_remainder: str
    resolved_chat_max_iterations: int


def prepare_direct_chat_request(
    *,
    resolved_turn_request: Optional[Any],
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    workspace_id: str,
    thread_id: str,
    requested_model: str,
    requested_provider: str,
    prior_messages: Optional[List[Dict[str, Any]]],
    reasoning_effort: str,
    availability: Optional[Dict[str, Any]],
    approved_action: Optional[Dict[str, Any]],
    max_iterations: Optional[int],
    direct_chat_session_key_fn: Callable[[str, str], str],
    resolved_chat_iteration_limit_fn: Callable[[Any], int],
    session_model_preference_fn: Callable[[str], Dict[str, Optional[str]]],
    normalize_reasoning_effort_fn: Callable[[str], Optional[str]],
    parse_slash_command_fn: Callable[[str], Dict[str, str]],
    set_session_model_preference_fn: Callable[..., None],
    mark_thread_cleared_fn: Callable[[str], None],
    normalize_prior_messages_fn: Callable[[Optional[List[Dict[str, Any]]]], List[Dict[str, Any]]],
    consume_thread_cleared_fn: Callable[[str], bool],
    compact_conversation_history_fn: Callable[..., Dict[str, Any]],
    build_proactive_suggestions_fn: Callable[[str], List[str]],
    direct_tool_session_key_fn: Callable[[str, str], str],
    resolve_direct_chat_availability_fn: Callable[[str, str, Optional[Dict[str, Any]]], Dict[str, Any]],
    connected_system_labels_fn: Callable[[Dict[str, Any]], List[str]],
    context_tool_capabilities_fn: Callable[[Dict[str, Any]], List[Dict[str, Any]]],
    build_direct_chat_tools_fn: Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]],
    build_local_direct_chat_tools_fn: Callable[[Dict[str, Any]], List[Dict[str, Any]]],
    build_builtin_direct_chat_tools_fn: Callable[[], List[Dict[str, Any]]],
    normalize_direct_approved_action_fn: Callable[[Any], Optional[Dict[str, str]]],
    build_context_used_fn: Callable[..., Dict[str, Any]],
    direct_chat_compaction_token_limit: int,
) -> PreparedDirectChatRequest:
    normalized_message = (
        str(resolved_turn_request.message or "").strip()
        if resolved_turn_request is not None
        else str(message or "").strip()
    )
    normalized_workspace_id = (
        str(resolved_turn_request.workspace_id or "default").strip() or "default"
        if resolved_turn_request is not None
        else str(workspace_id or "default").strip() or "default"
    )
    normalized_thread_id = (
        str(resolved_turn_request.session_id or "").strip()
        if resolved_turn_request is not None
        else str(thread_id or "").strip()
    )
    session_key = direct_chat_session_key_fn(normalized_workspace_id, normalized_thread_id)
    normalized_requested_provider = str(requested_provider or "").strip().lower()
    normalized_requested_model = str(requested_model or "").strip()
    resolved_chat_max_iterations = resolved_chat_iteration_limit_fn(max_iterations)

    session_model_preference = session_model_preference_fn(session_key)
    if session_model_preference.get("provider"):
        normalized_requested_provider = str(session_model_preference.get("provider") or "").strip().lower()
    if session_model_preference.get("model"):
        normalized_requested_model = str(session_model_preference.get("model") or "").strip()

    normalized_reasoning_effort = normalize_reasoning_effort_fn(reasoning_effort)
    slash_command = parse_slash_command_fn(normalized_message)
    slash_command_name = str(slash_command.get("command") or "").strip().lower()
    slash_remainder = str(slash_command.get("remainder") or "").strip()
    if slash_command_name == "model":
        model_parts = slash_remainder.split(None, 1) if slash_remainder else []
        selected_model_token = str(model_parts[0] or "").strip() if model_parts else ""
        trailing_content = str(model_parts[1] or "").strip() if len(model_parts) > 1 else ""
        selected_provider = normalized_requested_provider or None
        selected_model = selected_model_token
        if ":" in selected_model_token:
            provider_token, model_token = selected_model_token.split(":", 1)
            selected_provider = str(provider_token or "").strip().lower() or selected_provider
            selected_model = str(model_token or "").strip()
        if selected_provider:
            normalized_requested_provider = selected_provider
        if selected_model:
            normalized_requested_model = selected_model
        if selected_provider or selected_model:
            set_session_model_preference_fn(
                session_key,
                provider=normalized_requested_provider or None,
                model=normalized_requested_model or None,
            )
        if trailing_content:
            normalized_message = trailing_content
            slash_command_name = ""
            slash_remainder = ""
    elif slash_command_name == "clear" and slash_remainder:
        mark_thread_cleared_fn(session_key)
        normalized_message = slash_remainder
        slash_command_name = ""
        slash_remainder = ""

    normalized_prior_messages = normalize_prior_messages_fn(prior_messages)
    if consume_thread_cleared_fn(session_key):
        normalized_prior_messages = []
    compaction = compact_conversation_history_fn(
        normalized_prior_messages,
        max_tokens=direct_chat_compaction_token_limit,
        preserve_last_messages=10,
    )
    compacted_prior_messages = [
        item
        for item in (compaction.get("messages") if isinstance(compaction, dict) else [])
        if isinstance(item, dict)
    ]
    proactive_suggestions = build_proactive_suggestions_fn(normalized_workspace_id) if not normalized_prior_messages else []
    tool_loop_session_key = direct_tool_session_key_fn(normalized_workspace_id, normalized_thread_id)
    availability_payload = resolve_direct_chat_availability_fn(
        normalized_workspace_id,
        normalized_requested_provider,
        availability if isinstance(availability, dict) else None,
    )
    connected_systems = connected_system_labels_fn(availability_payload)
    tool_capabilities = context_tool_capabilities_fn(availability_payload)
    tools = build_direct_chat_tools_fn(tool_capabilities)
    tools.extend(build_local_direct_chat_tools_fn(availability_payload))
    tools.extend(build_builtin_direct_chat_tools_fn())
    approved_action_payload = normalize_direct_approved_action_fn(approved_action)
    base_context_used = build_context_used_fn(
        workspace_id=normalized_workspace_id,
        requested_provider=normalized_requested_provider,
        effective_provider=None,
        requested_model=normalized_requested_model,
        effective_model=None,
        reasoning_effort=normalized_reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        prior_messages_used=False,
        history_mode="none",
        run_created=False,
    )
    return PreparedDirectChatRequest(
        normalized_message=normalized_message,
        normalized_workspace_id=normalized_workspace_id,
        normalized_thread_id=normalized_thread_id,
        session_key=session_key,
        normalized_requested_provider=normalized_requested_provider,
        normalized_requested_model=normalized_requested_model,
        normalized_reasoning_effort=normalized_reasoning_effort,
        compaction=compaction if isinstance(compaction, dict) else {},
        compacted_prior_messages=compacted_prior_messages,
        proactive_suggestions=proactive_suggestions,
        tool_loop_session_key=tool_loop_session_key,
        availability_payload=availability_payload,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        tools=tools,
        approved_action_payload=approved_action_payload,
        base_context_used=base_context_used,
        slash_command_name=slash_command_name,
        slash_remainder=slash_remainder,
        resolved_chat_max_iterations=resolved_chat_max_iterations,
    )
