from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


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
