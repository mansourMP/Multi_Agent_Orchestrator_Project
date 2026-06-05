from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from server_modules.direct_chat_intervention_service import build_intervention
from server_modules import memory_service

DIRECT_CHAT_TOOL_EXECUTION_BLOCKED = "direct_chat_tool_execution_blocked"


@dataclass(slots=True)
class DirectChatResponseServices:
    with_context_used: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
    build_context_used: Callable[..., Dict[str, Any]]
    connected_provider_tokens: Callable[[str], List[str]]
    active_run_count: Callable[[str], int]
    slash_command_help_text: Callable[[], str]
    execute_direct_tool_calls: Callable[..., str]
    direct_chat_credentials: Callable[[str, str], Dict[str, Any]]
    capture_exception: Callable[[BaseException], None]


def _blocked_direct_chat_action_payload(
    *,
    proactive_suggestions: List[str],
    base_context: Dict[str, Any],
    services: DirectChatResponseServices,
) -> Dict[str, Any]:
    return services.with_context_used(
        {
            "reply": "",
            "actions": [],
            "interventions": [
                build_intervention(
                    "system_notice",
                    "Direct chat action is unavailable",
                    detail="Direct chat is limited to text replies and cannot execute connector, HTTP, local, or llm task actions.",
                    severity="warning",
                    status="blocked",
                    code=DIRECT_CHAT_TOOL_EXECUTION_BLOCKED,
                )
            ],
            "suggestions": proactive_suggestions,
            "mode": "answer",
            "error": DIRECT_CHAT_TOOL_EXECUTION_BLOCKED,
        },
        base_context,
    )


def _slash_notice_payload(
    *,
    title: str,
    detail: str,
    code: str,
    proactive_suggestions: List[str],
    base_context: Dict[str, Any],
    services: DirectChatResponseServices,
    severity: str = "info",
    status: str = "completed",
    error: str = "",
) -> Dict[str, Any]:
    return services.with_context_used(
        {
            "reply": "",
            "actions": [],
            "interventions": [
                build_intervention(
                    "system_notice",
                    title,
                    detail=detail,
                    severity=severity,
                    status=status,
                    code=code,
                )
            ],
            "suggestions": proactive_suggestions,
            "mode": "answer",
            "error": error,
        },
        base_context,
    )


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
        detail = (
            "Runtime status\n"
            f"- AI ready: {'yes' if bool(availability_payload.get('ai_ready')) else 'no'}\n"
            f"- Connected providers: {', '.join(connected_providers) if connected_providers else 'none'}\n"
            f"- Memory facts: {len(memory_service.list_memory_entries(workspace_id))}\n"
            f"- Active runs: {services.active_run_count(workspace_id)}"
        )
        return _slash_notice_payload(
            title="Runtime status",
            detail=detail,
            code="slash_status",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name == "memory":
        memory_text = memory_service.get_memory(workspace_id) or "No memory facts saved yet."
        return _slash_notice_payload(
            title="Memory",
            detail=memory_text,
            code="slash_memory",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name == "forget":
        memory_key = str(slash_remainder or "").strip()
        if not memory_key:
            detail = "Usage: /forget <key>"
            title = "Missing memory key"
        else:
            deleted = memory_service.delete_memory(workspace_id, memory_key)
            detail = f"Forgot memory '{memory_key}'." if deleted else f"Memory '{memory_key}' was not found."
            title = "Memory updated" if deleted else "Memory not found"
        return _slash_notice_payload(
            title=title,
            detail=detail,
            code="slash_forget",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name == "model":
        if not requested_model:
            detail = "Usage: /model <name>"
            title = "Missing model name"
        else:
            provider_label = f" ({requested_provider})" if requested_provider else ""
            detail = f"Chat model set to {requested_model}{provider_label} for this session."
            title = "Model selected"
        return _slash_notice_payload(
            title=title,
            detail=detail,
            code="slash_model",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name == "clear":
        return _slash_notice_payload(
            title="Conversation cleared",
            detail="Conversation history cleared for this thread.",
            code="slash_clear",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name == "help":
        return _slash_notice_payload(
            title="Slash commands",
            detail=services.slash_command_help_text(),
            code="slash_help",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name in ("export-trajectory", "export"):
        return _slash_notice_payload(
            title="Trajectory export requested",
            detail="Session transcript and trace data will be compiled. Use the diagnostics API for structured export: GET /api/diagnostics/sessions/{session_id}/export",
            code="slash_export",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    if slash_command_name == "thinking":
        level = str(slash_remainder or "").strip().lower()
        valid_levels = {"off", "minimal", "low", "medium", "high"}
        if level not in valid_levels:
            detail = f"Usage: /thinking <level> - valid levels: {', '.join(sorted(valid_levels))}"
            title = "Invalid thinking level"
        else:
            detail = f"Thinking level set to '{level}' for this session."
            title = "Thinking level updated"
        return _slash_notice_payload(
            title=title,
            detail=detail,
            code="slash_thinking",
            proactive_suggestions=proactive_suggestions,
            base_context=base_context_used,
            services=services,
        )
    return None


def empty_message_payload(
    *,
    proactive_suggestions: List[str],
    base_context_used: Dict[str, Any],
    services: DirectChatResponseServices,
) -> Dict[str, Any]:
    return services.with_context_used(
        {
            "reply": "",
            "actions": [],
            "interventions": [
                build_intervention(
                    "system_notice",
                    "Describe the outcome you want",
                    detail="Tell the system what you want done, and it will help move it forward.",
                    severity="info",
                    status="ready",
                    code="empty_message",
                )
            ],
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
                "reply": "",
                "actions": [],
                "interventions": [
                    build_intervention(
                        "system_error",
                        "Approval confirmation payload is missing",
                        detail="The approved connector action payload was not present, so the action could not be executed.",
                        severity="error",
                        status="failed",
                        code="missing_approved_action",
                    )
                ],
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
                "reply": "",
                "actions": [],
                "interventions": [
                    build_intervention(
                        "system_error",
                        "Connector action is unavailable",
                        detail="That connector action is not available in this workspace right now.",
                        severity="error",
                        status="failed",
                        code="unavailable_approved_action",
                    )
                ],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "error": "unavailable_approved_action",
            },
            base_context,
        )
    tool_call = approved_action_to_tool_call_fn(approved_action_payload)
    try:
        action_result = services.execute_direct_tool_calls(
            tool_calls=[tool_call],
            workspace_id=workspace_id,
            thread_id=thread_id,
            provider=requested_provider,
            model=requested_model,
            credentials=services.direct_chat_credentials(workspace_id, requested_provider)
            if requested_provider
            else {},
            reasoning_effort=reasoning_effort or "",
            session_ctx=session_ctx,
        )
    except Exception as exc:
        services.capture_exception(exc)
        return services.with_context_used(
            {
                "reply": "",
                "actions": [],
                "interventions": [
                    build_intervention(
                        "system_error",
                        "Approved action failed",
                        detail=str(exc) or "The approved connector action could not be executed.",
                        severity="error",
                        status="failed",
                        code="approved_action_failed",
                    )
                ],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "error": "approved_action_failed",
            },
            base_context,
        )
    return services.with_context_used(
        {
            "reply": "",
            "actions": [],
            "interventions": []
            if action_result
            else [
                build_intervention(
                    "approved_action_result_empty",
                    "Action result unavailable",
                    detail="The approved action ran without returning a result that can be shown in chat.",
                    severity="warning",
                    status="completed",
                    code="approved_action_result_empty",
                )
            ],
            "suggestions": proactive_suggestions,
            "mode": "answer",
        },
        base_context,
    )
