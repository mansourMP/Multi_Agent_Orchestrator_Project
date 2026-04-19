from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Sequence

from server_modules import skills_service


@dataclass(frozen=True)
class DirectChatToolPolicyCallbacks:
    compact_text: Callable[[Any], str]
    question_like: Callable[[str], bool]
    mentions_any: Callable[[str, Sequence[str]], bool]
    extract_first_path_reference: Callable[[str], str]
    extract_first_url: Callable[[str], str]
    provider_supports_direct_tool_calls: Callable[[str], bool]
    is_obvious_smtp_write_request: Callable[[str], bool]
    google_workspace_keywords: Sequence[str]
    smtp_keywords: Sequence[str]
    telegram_keywords: Sequence[str]
    slack_keywords: Sequence[str]
    discord_keywords: Sequence[str]
    dropbox_keywords: Sequence[str]
    s3_keywords: Sequence[str]
    browser_keywords: Sequence[str]
    local_file_keywords: Sequence[str]
    local_shell_keywords: Sequence[str]
    local_screenshot_keywords: Sequence[str]
    local_computer_control_keywords: Sequence[str]
    web_lookup_keywords: Sequence[str]
    http_request_keywords: Sequence[str]
    image_generation_keywords: Sequence[str]
    llm_task_keywords: Sequence[str]


def provider_supports_direct_tool_calls(provider: str) -> bool:
    return str(provider or "").strip().lower() == "codex_cli"


def build_local_direct_chat_tools(availability: Dict[str, Any], *, local_worker_available: Callable[[Dict[str, Any]], bool]) -> List[Dict[str, Any]]:
    return skills_service.build_local_direct_chat_tools(
        availability,
        local_worker_available=local_worker_available,
    )


def build_direct_chat_tools(tool_capabilities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return skills_service.build_direct_chat_tools(tool_capabilities)


def build_builtin_direct_chat_tools() -> List[Dict[str, Any]]:
    return skills_service.build_builtin_direct_chat_tools()


def registered_direct_chat_tool_names_for_logging() -> List[str]:
    return skills_service.registered_direct_chat_tool_names_for_logging()


def message_requests_http_request_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    if bool(re.search(r"https?://", str(message or ""), flags=re.IGNORECASE)):
        return True
    return callbacks.mentions_any(compact, callbacks.http_request_keywords)


def message_requests_image_generation_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    return callbacks.mentions_any(compact, callbacks.image_generation_keywords)


def message_requests_browser_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    if callbacks.extract_first_path_reference(message) and any(token in compact for token in ("read", "open", "show", "what's in", "whats in", "count", "how many")):
        return False
    if callbacks.extract_first_url(message) and (
        callbacks.mentions_any(compact, callbacks.browser_keywords) or any(token in compact for token in ("go to", "open", "title", "heading"))
    ):
        return True
    return callbacks.mentions_any(compact, callbacks.browser_keywords)


def message_can_use_direct_connector_tools(message: str, *, provider: str, tools: List[Dict[str, Any]], callbacks: DirectChatToolPolicyCallbacks) -> bool:
    if not callbacks.provider_supports_direct_tool_calls(provider) or not tools:
        return False
    compact = callbacks.compact_text(message)
    if callbacks.mentions_any(compact, callbacks.google_workspace_keywords):
        if any(str(item.get("name") or "").startswith("google_workspace__") for item in tools):
            return True
        if callbacks.is_obvious_smtp_write_request(compact):
            return any(str(item.get("name") or "").startswith("smtp__") for item in tools)
        return False
    if callbacks.mentions_any(compact, callbacks.smtp_keywords) or callbacks.is_obvious_smtp_write_request(compact):
        return any(str(item.get("name") or "").startswith("smtp__") for item in tools)
    if callbacks.mentions_any(compact, callbacks.telegram_keywords):
        return any(str(item.get("name") or "").startswith("telegram_bot__") for item in tools)
    if callbacks.mentions_any(compact, callbacks.slack_keywords):
        return any(str(item.get("name") or "").startswith("slack__") for item in tools)
    if callbacks.mentions_any(compact, callbacks.discord_keywords):
        return any(str(item.get("name") or "").startswith("discord_bot__") for item in tools)
    if callbacks.mentions_any(compact, callbacks.dropbox_keywords):
        return any(str(item.get("name") or "").startswith("dropbox__") for item in tools)
    if callbacks.mentions_any(compact, callbacks.s3_keywords):
        return any(str(item.get("name") or "").startswith("s3__") for item in tools)
    return False


def looks_like_local_path_request(compact_message: str) -> bool:
    if not compact_message:
        return False
    return bool(re.search(r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])", compact_message, flags=re.IGNORECASE))


def message_requests_local_file_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    if callbacks.mentions_any(compact, callbacks.local_file_keywords):
        return True
    return looks_like_local_path_request(compact) and any(token in compact for token in ("read", "open", "write", "save", "append", "delete"))


def message_requests_local_shell_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    if callbacks.mentions_any(compact, callbacks.local_shell_keywords):
        return True
    return bool(re.search(r"`[^`]+`", str(message or ""))) and any(token in compact for token in ("run", "exec", "execute", "shell", "terminal", "command"))


def message_requests_local_screenshot_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    return callbacks.mentions_any(compact, callbacks.local_screenshot_keywords)


def message_requests_local_computer_tool(message: str, callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or callbacks.question_like(compact):
        return False
    if callbacks.mentions_any(compact, callbacks.local_computer_control_keywords):
        return True
    return bool(
        re.search(
            r"\b(click|type|press|open|launch|close|clipboard|copy|paste|computer|screen|window)\b",
            compact,
            flags=re.IGNORECASE,
        )
    )


def message_can_use_direct_local_tools(message: str, *, provider: str, tools: List[Dict[str, Any]], callbacks: DirectChatToolPolicyCallbacks) -> bool:
    if not tools:
        return False
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    if message_requests_local_computer_tool(message, callbacks) and any(name.startswith("computer__") for name in tool_names):
        return True
    if not callbacks.provider_supports_direct_tool_calls(provider):
        return False
    if message_requests_local_file_tool(message, callbacks) and {"file__read", "file__write"} & tool_names:
        return True
    if message_requests_local_shell_tool(message, callbacks) and "shell__exec" in tool_names:
        return True
    if message_requests_local_screenshot_tool(message, callbacks) and "screenshot__capture" in tool_names:
        return True
    return False


def message_can_use_builtin_direct_tools(message: str, *, tools: List[Dict[str, Any]], callbacks: DirectChatToolPolicyCallbacks) -> bool:
    compact = callbacks.compact_text(message)
    if not compact or not tools:
        return False
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    if {"web__search", "web__fetch"} & tool_names:
        if callbacks.mentions_any(compact, callbacks.web_lookup_keywords) or bool(re.search(r"https?://", str(message or ""), flags=re.IGNORECASE)):
            return True
    if "http_request" in tool_names and message_requests_http_request_tool(message, callbacks):
        return True
    if "generate_image" in tool_names and message_requests_image_generation_tool(message, callbacks):
        return True
    if any(name.startswith("browser__") for name in tool_names) and message_requests_browser_tool(message, callbacks):
        return True
    if "llm__task" in tool_names and callbacks.mentions_any(compact, callbacks.llm_task_keywords):
        return True
    return False
