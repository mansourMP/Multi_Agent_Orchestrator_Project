from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from server_modules.direct_chat_intervention_service import build_intervention


@dataclass(slots=True)
class DirectChatRouteDecision:
    prefer_durable_run_handoff: bool
    preview: Optional[Dict[str, Any]]
    connector_preview_requested: bool
    allow_connector_direct_tools: bool
    allow_local_direct_tools: bool
    allow_builtin_direct_tools: bool
    allow_direct_tool_calls: bool
    should_auto_start_run: bool


@dataclass(frozen=True)
class DirectChatRoutingPolicyCallbacks:
    compact_text: Callable[[Any], str]
    mentions_any: Callable[[str, tuple[str, ...] | list[str]], bool]
    question_like: Callable[[str], bool]
    is_explicit_workflow_request: Callable[[str], bool]
    starts_like_direct_run: Callable[[str], bool]
    workflow_action: Callable[[str], Dict[str, Any]]
    run_action: Callable[[str], Dict[str, Any]]
    message_requests_local_file_tool: Callable[[str], bool]
    message_requests_local_shell_tool: Callable[[str], bool]
    message_requests_local_screenshot_tool: Callable[[str], bool]
    message_requests_local_computer_tool: Callable[[str], bool]
    complex_task_sequence_markers: tuple[str, ...] | list[str]
    complex_task_outcome_markers: tuple[str, ...] | list[str]
    execution_markers: tuple[str, ...] | list[str]
    google_workspace_keywords: tuple[str, ...] | list[str]
    telegram_keywords: tuple[str, ...] | list[str]
    slack_keywords: tuple[str, ...] | list[str]
    dropbox_keywords: tuple[str, ...] | list[str]
    s3_keywords: tuple[str, ...] | list[str]


def preview_run_response(
    message: str,
    availability: Dict[str, Any],
    callbacks: DirectChatRoutingPolicyCallbacks,
) -> Optional[Dict[str, Any]]:
    compact = callbacks.compact_text(message)
    if status_readiness_request(compact):
        return None
    local_request = (
        callbacks.message_requests_local_file_tool(message)
        or callbacks.message_requests_local_shell_tool(message)
        or callbacks.message_requests_local_screenshot_tool(message)
        or callbacks.message_requests_local_computer_tool(message)
    )
    if local_request and not local_tools_available(availability):
        return None
    if callbacks.is_explicit_workflow_request(message):
        return {
            "reply": "",
            "actions": [callbacks.workflow_action(message)],
            "mode": "answer_with_action",
            "interventions": [
                build_intervention(
                    "workflow_offer",
                    "Ready to turn this into a workflow",
                    detail="This request looks like a repeatable workflow.",
                    severity="info",
                    status="ready",
                )
            ],
        }
    if callbacks.mentions_any(compact, callbacks.execution_markers) and callbacks.starts_like_direct_run(compact) and not callbacks.question_like(compact):
        return {
            "reply": "",
            "actions": [callbacks.run_action(message)],
            "mode": "answer_with_action",
            "interventions": [
                build_intervention(
                    "run_offer",
                    "Ready to run this task",
                    detail="This request looks like an execution task the runtime can perform directly.",
                    severity="info",
                    status="ready",
                )
            ],
        }
    return None


def status_readiness_request(compact_message: str) -> bool:
    compact = str(compact_message or "").strip().lower()
    if not compact:
        return False
    subject = any(
        token in compact
        for token in (
            "agent computer",
            "hardware",
            "gateway",
            "computer connection",
            "connection status",
            "connections",
        )
    )
    status_word = any(
        token in compact
        for token in (
            "status",
            "ready",
            "readiness",
            "health",
            "doctor",
            "connected",
            "disconnected",
            "offline",
            "online",
        )
    )
    return subject and status_word


def local_tools_available(availability: Dict[str, Any]) -> bool:
    if not isinstance(availability, dict):
        return False
    capability_truth = availability.get("capability_truth")
    if isinstance(capability_truth, dict):
        my_computer = capability_truth.get("my_computer")
        if isinstance(my_computer, dict) and "local_tools_available" in my_computer:
            return bool(my_computer.get("local_tools_available"))
    connection_mode = str(availability.get("connection_mode") or "").strip().lower()
    return connection_mode == "local_companion" and bool(availability.get("local_gateway_online"))


def action_marker_count(compact_message: str, execution_markers: tuple[str, ...] | list[str]) -> int:
    if not compact_message:
        return 0
    count = 0
    for marker in execution_markers:
        if re.search(rf"\b{re.escape(marker)}\b", compact_message):
            count += 1
    return count


def path_like_reference_count(message: str) -> int:
    if not message:
        return 0
    return len(
        re.findall(
            r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])\S+",
            str(message),
            flags=re.IGNORECASE,
        )
    )


def prefer_durable_run_handoff(
    message: str,
    availability: Dict[str, Any],
    callbacks: DirectChatRoutingPolicyCallbacks,
) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    if not isinstance(availability, dict) or not bool(availability.get("ai_ready")):
        return False
    if status_readiness_request(compact):
        return False
    connection_mode = str(availability.get("connection_mode") or "").strip().lower()

    local_file = callbacks.message_requests_local_file_tool(message)
    local_shell = callbacks.message_requests_local_shell_tool(message)
    local_screenshot = callbacks.message_requests_local_screenshot_tool(message)
    local_computer = callbacks.message_requests_local_computer_tool(message)
    local_request_count = sum(1 for flag in (local_file, local_shell, local_screenshot, local_computer) if flag)
    if local_request_count > 0 and not local_tools_available(availability):
        return False
    sequence_requested = any(marker in compact for marker in callbacks.complex_task_sequence_markers)
    outcome_requested = any(marker in compact for marker in callbacks.complex_task_outcome_markers)
    path_reference_total = path_like_reference_count(message)
    marker_count = action_marker_count(compact, callbacks.execution_markers)
    if local_request_count <= 0:
        return connection_mode in {"local_companion", "byok"} and outcome_requested and marker_count >= 1 and len(compact) >= 40
    if local_computer and connection_mode == "local_companion":
        return True

    mixes_connector_work = (
        callbacks.mentions_any(compact, callbacks.google_workspace_keywords)
        or callbacks.mentions_any(compact, callbacks.telegram_keywords)
        or callbacks.mentions_any(compact, callbacks.slack_keywords)
        or callbacks.mentions_any(compact, callbacks.dropbox_keywords)
        or callbacks.mentions_any(compact, callbacks.s3_keywords)
    )

    if local_request_count >= 2:
        return True
    if path_reference_total >= 2:
        return True
    if mixes_connector_work:
        return True
    if sequence_requested and (marker_count >= 2 or len(compact) >= 110):
        return True
    if outcome_requested and (sequence_requested or marker_count >= 2):
        return True
    return False


def plan_direct_chat_route(
    *,
    message: str,
    availability: Dict[str, Any],
    provider: str,
    tools: List[Dict[str, Any]],
    compact_text_fn: Callable[[Any], str],
    mentions_any_fn: Callable[[str, tuple[str, ...] | list[str]], bool],
    is_obvious_smtp_write_request_fn: Callable[[str], bool],
    preview_run_response_fn: Callable[[str, Dict[str, Any]], Optional[Dict[str, Any]]],
    prefer_durable_run_handoff_fn: Callable[[str, Dict[str, Any]], bool],
    durable_run_preferred_response_fn: Callable[[str], Dict[str, Any]],
    message_can_use_direct_connector_tools_fn: Callable[[str], bool],
    message_can_use_direct_local_tools_fn: Callable[[str], bool],
    message_can_use_builtin_direct_tools_fn: Callable[[str], bool],
    can_auto_start_run_handoff_fn: Callable[[Dict[str, Any]], bool],
    google_workspace_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    discord_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
) -> DirectChatRouteDecision:
    compact_message = compact_text_fn(message)
    prefer_durable_run_handoff = prefer_durable_run_handoff_fn(message, availability)
    preview = preview_run_response_fn(message, availability)
    connector_preview_requested = bool(preview) and (
        mentions_any_fn(compact_message, google_workspace_keywords)
        or is_obvious_smtp_write_request_fn(compact_message)
        or mentions_any_fn(compact_message, telegram_keywords)
        or mentions_any_fn(compact_message, slack_keywords)
        or mentions_any_fn(compact_message, discord_keywords)
        or mentions_any_fn(compact_message, dropbox_keywords)
        or mentions_any_fn(compact_message, s3_keywords)
    )
    allow_connector_direct_tools = message_can_use_direct_connector_tools_fn(message)
    allow_local_direct_tools = message_can_use_direct_local_tools_fn(message)
    allow_builtin_direct_tools = message_can_use_builtin_direct_tools_fn(message)
    if connector_preview_requested and not allow_connector_direct_tools and not allow_local_direct_tools:
        allow_builtin_direct_tools = False
    allow_direct_tool_calls = allow_connector_direct_tools or allow_local_direct_tools or allow_builtin_direct_tools
    if prefer_durable_run_handoff:
        allow_direct_tool_calls = False
    if preview is None and prefer_durable_run_handoff:
        preview = durable_run_preferred_response_fn(message)
    preview_actions = preview.get("actions") if isinstance(preview, dict) and isinstance(preview.get("actions"), list) else []
    should_auto_start_run = (
        bool(preview)
        and not allow_direct_tool_calls
        and any(isinstance(action, dict) and str(action.get("kind") or "").strip().lower() == "run" for action in preview_actions)
        and can_auto_start_run_handoff_fn(availability)
    )
    return DirectChatRouteDecision(
        prefer_durable_run_handoff=prefer_durable_run_handoff,
        preview=preview,
        connector_preview_requested=connector_preview_requested,
        allow_connector_direct_tools=allow_connector_direct_tools,
        allow_local_direct_tools=allow_local_direct_tools,
        allow_builtin_direct_tools=allow_builtin_direct_tools,
        allow_direct_tool_calls=allow_direct_tool_calls,
        should_auto_start_run=should_auto_start_run,
    )
