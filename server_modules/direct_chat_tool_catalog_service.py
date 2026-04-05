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
    if not local_worker_available(availability):
        return []
    return [
        {
            "name": "file__read",
            "description": "Read a file from the local machine",
            "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "File path to read"}}, "required": ["path"]},
        },
        {
            "name": "file__write",
            "description": "Write content to a file on the local machine",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "Content to write"},
                },
                "required": ["path", "content"],
            },
        },
        {
            "name": "shell__exec",
            "description": "Execute a shell command on the local machine",
            "parameters": {"type": "object", "properties": {"command": {"type": "string", "description": "Shell command to run"}}, "required": ["command"]},
        },
        {
            "name": "screenshot__capture",
            "description": "Take a screenshot of the current screen",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "computer__ocr",
            "description": "Read visible text from the screen using OCR",
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "integer"},
                            "y": {"type": "integer"},
                            "width": {"type": "integer"},
                            "height": {"type": "integer"},
                        },
                    },
                },
            },
        },
        {
            "name": "computer__click",
            "description": "Click on the screen by coordinates or visible text",
            "parameters": {"type": "object", "properties": {"x": {"type": "integer"}, "y": {"type": "integer"}, "text": {"type": "string"}}},
        },
        {
            "name": "computer__type",
            "description": "Type text into the active application",
            "parameters": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        },
        {
            "name": "computer__applescript",
            "description": "Run AppleScript on macOS",
            "parameters": {"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]},
        },
        {
            "name": "computer__clipboard_read",
            "description": "Read the current system clipboard",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "computer__clipboard_write",
            "description": "Write text to the system clipboard",
            "parameters": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        },
        {
            "name": "computer__notify",
            "description": "Send a system notification",
            "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "message": {"type": "string"}}, "required": ["title", "message"]},
        },
        {
            "name": "computer__list_apps",
            "description": "List running applications and processes",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "computer__launch_app",
            "description": "Launch an application by name or path",
            "parameters": {"type": "object", "properties": {"name_or_path": {"type": "string"}}, "required": ["name_or_path"]},
        },
        {
            "name": "computer__speak",
            "description": "Speak text aloud using the local system voice",
            "parameters": {
                "type": "object",
                "properties": {"text": {"type": "string"}, "voice": {"type": "string"}},
                "required": ["text"],
            },
        },
    ]


def build_direct_chat_tools(tool_capabilities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for cap in tool_capabilities:
        if not isinstance(cap, dict):
            continue
        if skills_service.capability_payload_runtime_usable(cap) is not True:
            continue
        connector_id = str(cap.get("id") or "").strip().lower()
        label = str(cap.get("label") or connector_id).strip() or connector_id
        if not connector_id:
            continue
        for action in skills_service.capability_payload_write_actions(cap):
            if not action:
                continue
            tool_name = f"{connector_id}__{action}"
            if tool_name in seen:
                continue
            seen.add(tool_name)
            tools.append(
                {
                    "name": tool_name,
                    "description": f"Execute {action} on {label}",
                    "parameters": {
                        "type": "object",
                        "properties": {"input": {"type": "string", "description": "The input for this action"}},
                        "required": ["input"],
                    },
                }
            )
    return tools


def build_builtin_direct_chat_tools() -> List[Dict[str, Any]]:
    return [
        {
            "name": "memory_search",
            "description": (
                "Mandatory recall step before answering about prior work, decisions, dates, people, "
                "preferences, or todos. Search MEMORY.md and memory/*.md and return matching snippets "
                "with paths and line numbers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The memory query to search for."},
                    "max_results": {"type": "integer", "description": "Optional maximum number of snippets to return."},
                },
                "required": ["query"],
            },
        },
        {
            "name": "memory_get",
            "description": "Read a small excerpt from MEMORY.md or memory/*.md after memory_search identifies the file and lines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative notebook path such as MEMORY.md or memory/2026-04-02.md."},
                    "from": {"type": "integer", "description": "Starting line number (1-based)."},
                    "lines": {"type": "integer", "description": "Maximum number of lines to read."},
                },
                "required": ["path"],
            },
        },
        {
            "name": "web__search",
            "description": "Search the web and return the top 5 results with titles, URLs, and snippets.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "The search query to run."}}, "required": ["query"]},
        },
        {
            "name": "web__fetch",
            "description": "Fetch a webpage and extract readable text from it.",
            "parameters": {"type": "object", "properties": {"url": {"type": "string", "description": "The URL to fetch."}}, "required": ["url"]},
        },
        {
            "name": "llm__task",
            "description": "Run a focused sub-task with no tools. Optionally require JSON output with a schema.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "The sub-task prompt."},
                    "schema": {"type": "object", "description": "Optional JSON schema for the required output."},
                },
                "required": ["prompt"],
            },
        },
        {
            "name": "http_request",
            "description": "Make a generic HTTP request and return status, headers, and body.",
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
                    "url": {"type": "string", "description": "The target URL."},
                    "headers": {"type": "object", "description": "Optional request headers."},
                    "body": {"description": "Optional request body as a string or JSON object."},
                    "params": {"type": "object", "description": "Optional query parameters."},
                    "timeout": {"type": "integer", "description": "Timeout in seconds."},
                    "auth_type": {"type": "string", "enum": ["none", "bearer", "basic"]},
                    "auth_value": {"type": "string", "description": "Token or user:pass credentials."},
                },
                "required": ["method", "url"],
            },
        },
        {
            "name": "generate_image",
            "description": "Generate one or more images from a prompt and save them locally.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "The image prompt."},
                    "model": {"type": "string", "enum": ["dall-e-3", "dall-e-2", "stable-diffusion"]},
                    "size": {"type": "string", "enum": ["256x256", "512x512", "1024x1024"]},
                    "quality": {"type": "string", "enum": ["standard", "hd"]},
                    "n": {"type": "integer", "minimum": 1, "maximum": 4},
                    "save_to": {"type": "string", "description": "Optional local output path or directory."},
                },
                "required": ["prompt"],
            },
        },
        {
            "name": "browser__navigate",
            "description": "Open a URL in the backend browser engine.",
            "parameters": {"type": "object", "properties": {"url": {"type": "string", "description": "The URL to open."}}, "required": ["url"]},
        },
        {"name": "browser__screenshot", "description": "Capture a screenshot from the backend browser engine.", "parameters": {"type": "object", "properties": {"selector": {"type": "string", "description": "Optional CSS/XPath/text selector."}}}},
        {"name": "browser__observe", "description": "Return the current browser page state plus a screenshot for vision-style reasoning.", "parameters": {"type": "object", "properties": {}}},
        {
            "name": "browser__click",
            "description": "Click an element in the backend browser engine.",
            "parameters": {"type": "object", "properties": {"selector": {"type": "string", "description": "CSS, XPath, or visible text selector."}}, "required": ["selector"]},
        },
        {
            "name": "browser__fill",
            "description": "Fill an input in the backend browser engine.",
            "parameters": {"type": "object", "properties": {"selector": {"type": "string"}, "value": {"type": "string"}}, "required": ["selector", "value"]},
        },
        {"name": "browser__extract_text", "description": "Extract readable text from the current page or a selected element.", "parameters": {"type": "object", "properties": {"selector": {"type": "string"}}}},
        {"name": "browser__get_page_state", "description": "Return the current page title, URL, text preview, and interactive elements.", "parameters": {"type": "object", "properties": {}}},
        {
            "name": "browser__execute_js",
            "description": "Execute JavaScript in the active browser tab.",
            "parameters": {"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]},
        },
        {"name": "browser__new_tab", "description": "Open a new browser tab.", "parameters": {"type": "object", "properties": {"url": {"type": "string"}}}},
        {
            "name": "browser__switch_tab",
            "description": "Switch to another browser tab.",
            "parameters": {"type": "object", "properties": {"tab_id": {"type": "integer"}}, "required": ["tab_id"]},
        },
        {
            "name": "browser__download_file",
            "description": "Download a file through the backend browser engine.",
            "parameters": {"type": "object", "properties": {"url": {"type": "string"}, "save_path": {"type": "string"}}, "required": ["url"]},
        },
        {
            "name": "browser__start_intercept",
            "description": "Start capturing browser network responses matching a URL pattern.",
            "parameters": {"type": "object", "properties": {"url_pattern": {"type": "string"}}},
        },
        {"name": "browser__stop_intercept", "description": "Stop browser network interception and return the captured responses.", "parameters": {"type": "object", "properties": {}}},
        {"name": "browser__pdf", "description": "Print the current browser page to PDF.", "parameters": {"type": "object", "properties": {"output_path": {"type": "string"}}}},
    ]


def registered_direct_chat_tool_names_for_logging() -> List[str]:
    tool_names = {
        str(item.get("name") or "").strip()
        for item in (build_builtin_direct_chat_tools() + build_local_direct_chat_tools({"runtime_ok": True}, local_worker_available=lambda availability: True))
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    }
    return sorted(tool_names)


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
    return callbacks.mentions_any(compact, callbacks.local_computer_control_keywords)


def message_can_use_direct_local_tools(message: str, *, provider: str, tools: List[Dict[str, Any]], callbacks: DirectChatToolPolicyCallbacks) -> bool:
    if not callbacks.provider_supports_direct_tool_calls(provider) or not tools:
        return False
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    if message_requests_local_file_tool(message, callbacks) and {"file__read", "file__write"} & tool_names:
        return True
    if message_requests_local_shell_tool(message, callbacks) and "shell__exec" in tool_names:
        return True
    if message_requests_local_screenshot_tool(message, callbacks) and "screenshot__capture" in tool_names:
        return True
    if message_requests_local_computer_tool(message, callbacks) and any(name.startswith("computer__") for name in tool_names):
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
