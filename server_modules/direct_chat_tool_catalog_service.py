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
    return bool(str(provider or "").strip())


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
    if not tools:
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
    listing_tokens = (
        "list files",
        "show files",
        "what files",
        "which files",
        "files on my",
        "files in my",
        "files in the",
        "contents of",
        "folder contents",
        "directory contents",
        "directory listing",
        "list the contents",
    )
    location_tokens = (
        "desktop",
        "downloads",
        "documents",
        "folder",
        "directory",
        "repo",
        "repository",
        "project root",
        "current folder",
        "current directory",
    )
    if any(token in compact for token in listing_tokens) and any(token in compact for token in location_tokens):
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


def message_requests_tool_inventory(message: str) -> bool:
    compact = " ".join(str(message or "").lower().split())
    if not compact:
        return False
    inventory_phrases = (
        "what tools do you have",
        "what tools can you use",
        "which tools do you have",
        "which tools can you use",
        "show me your tools",
        "list your tools",
        "available tools",
        "tools available",
        "what can you do with tools",
        "do you have any tools",
    )
    return any(phrase in compact for phrase in inventory_phrases)


def _tool_group_label(name: str) -> str:
    normalized = str(name or "").strip()
    connector = normalized.split("__", 1)[0] if "__" in normalized else normalized
    if connector in {"file", "shell", "screenshot", "computer", "browser"}:
        return "Local machine"
    if connector in {"web", "http"}:
        return "Web"
    if connector in {"image"} or normalized == "generate_image":
        return "Media"
    if connector in {"telegram_bot", "smtp", "google_workspace", "microsoft_365", "slack", "discord_bot"}:
        return "Communication"
    if connector in {"memory", "llm", "sage_service"}:
        return "Data"
    return "Other"


def _tool_label(tool: Dict[str, Any]) -> str:
    name = str(tool.get("name") or "").strip()
    description = str(tool.get("description") or "").strip()
    if not name:
        return ""
    return f"{name} — {description}" if description else name


def direct_chat_tool_inventory_reply(tools: List[Dict[str, Any]], availability_payload: Dict[str, Any]) -> str:
    grouped: Dict[str, List[str]] = {}
    for item in tools:
        if not isinstance(item, dict):
            continue
        label = _tool_label(item)
        if not label:
            continue
        grouped.setdefault(_tool_group_label(str(item.get("name") or "")), []).append(label)

    gateway_online = bool(
        availability_payload.get("local_gateway_online")
        or availability_payload.get("gateway_online")
        or availability_payload.get("local_worker_online")
    )
    cloud_computer_online = bool(
        availability_payload.get("cloud_computer_online")
        or availability_payload.get("cloud_computer_available")
    )
    lines = ["These are the tools currently available in this workspace:"]
    if not grouped:
        lines.append("")
        lines.append("- No tools are currently available.")
    for group in ("Local machine", "Web", "Media", "Communication", "Data", "Other"):
        entries = sorted(grouped.get(group, []))
        if not entries:
            continue
        lines.append("")
        lines.append(f"{group}:")
        lines.extend(f"- {entry}" for entry in entries)
    lines.append("")
    if gateway_online:
        lines.append("Local machine tools are available through the paired gateway.")
    elif cloud_computer_online:
        lines.append(
            "Computer tools are available through Sage Cloud Computer. Personal-device tools still require a paired gateway."
        )
    else:
        lines.append("Local machine tools require the gateway to be online. Sage Cloud Computer can run cloud-side computer tasks only when enabled.")
    lines.append("Tool availability is based on gateway status, connector state, and workspace policy, not the selected model provider.")
    return "\n".join(lines).strip()
