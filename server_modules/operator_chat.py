from __future__ import annotations

import json
import os
import re
import sys
import importlib.util
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional
from uuid import uuid4

from scripts.orion_local_worker_llm import (
    SUPPORTED_PROVIDERS,
    generate_chat_reply_stream_with_provider_fallback,
    generate_chat_reply_with_provider_fallback,
    get_claude_code_session_token,
    parse_json_object_loose,
    provider_has_key,
)
from scripts.orion_local_worker_utils import build_operator_system_prompt
from server_modules.provider_profiles import _build_provider_credential_candidates, normalize_auth_mode
try:
    from server_modules.tool_availability_truth import resolve_workspace_tool_capabilities
except Exception:
    _tool_availability_path = Path(__file__).resolve().parent / "tool_availability_truth.py"
    _tool_availability_spec = importlib.util.spec_from_file_location("operator_chat_tool_availability_truth", _tool_availability_path)
    _tool_availability_module = importlib.util.module_from_spec(_tool_availability_spec)
    sys.modules["operator_chat_tool_availability_truth"] = _tool_availability_module
    assert _tool_availability_spec and _tool_availability_spec.loader
    _tool_availability_spec.loader.exec_module(_tool_availability_module)
    resolve_workspace_tool_capabilities = _tool_availability_module.resolve_workspace_tool_capabilities

WORKFLOW_REQUEST_MARKERS = (
    "turn this into a workflow",
    "turn this into workflow",
    "make this a workflow",
    "make this workflow",
    "create a workflow",
    "create workflow",
    "build a workflow",
    "build workflow",
    "set up a workflow",
    "set this up as a workflow",
    "turn this into an automation",
    "turn this into automation",
    "set this up as automation",
    "automate this",
    "repeat this every day",
    "repeat this every week",
)
EXECUTION_MARKERS = (
    "run",
    "execute",
    "send",
    "draft",
    "check",
    "triage",
    "summarize",
    "review",
    "search",
    "find",
    "inspect",
    "pull",
    "organize",
    "schedule",
    "prepare",
    "update",
    "create",
)
QUESTION_OPENERS = ("what", "why", "how", "should", "can", "could", "would", "is", "are", "do", "does")
GOOGLE_WORKSPACE_KEYWORDS = ("email", "emails", "gmail", "inbox", "calendar", "drive", "meeting", "meetings")
TELEGRAM_KEYWORDS = ("telegram", "bot", "chat reply", "message on telegram")
LOCAL_FILE_KEYWORDS = (
    "read file",
    "open file",
    "write file",
    "save file",
    "save to",
    "append to",
    "delete file",
    "file at",
    "path",
)
LOCAL_SHELL_KEYWORDS = (
    "shell command",
    "terminal command",
    "run command",
    "execute command",
    "in the shell",
    "in terminal",
    "bash",
    "zsh",
)
LOCAL_SCREENSHOT_KEYWORDS = (
    "screenshot",
    "screen shot",
    "capture screen",
    "capture the screen",
    "take a screenshot",
)
DIRECT_RUN_OPENERS = (
    "summarize",
    "check",
    "search",
    "find",
    "review",
    "triage",
    "draft",
    "send",
    "schedule",
    "prepare",
    "update",
    "create",
    "organize",
    "pull",
    "inspect",
    "please",
    "can you",
    "could you",
    "would you",
)
MAX_DIRECT_CHAT_PRIOR_MESSAGES = 6
MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS = 280
MAX_CONTEXT_TOOL_CAPABILITIES = 6
MAX_CONTEXT_TOOL_ACTIONS = 6


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _normalize_tool_capabilities(availability: Any) -> List[Dict[str, Any]]:
    tools = availability.get("tool_capabilities") if isinstance(availability, dict) else []
    normalized: List[Dict[str, Any]] = []
    if not isinstance(tools, list):
        return normalized
    for item in tools:
        if not isinstance(item, dict):
            continue
        tool_id = str(item.get("id") or "").strip().lower()
        if not tool_id:
            continue
        normalized.append(
            {
                "id": tool_id,
                "label": str(item.get("label") or tool_id).strip() or tool_id,
                "connected": bool(item.get("connected")),
                "authenticated": item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None,
                "runtime_usable": item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None,
                "read_actions": [
                    str(entry or "").strip()
                    for entry in (item.get("read_actions") if isinstance(item.get("read_actions"), list) else [])
                    if str(entry or "").strip()
                ],
                "write_actions": [
                    str(entry or "").strip()
                    for entry in (item.get("write_actions") if isinstance(item.get("write_actions"), list) else [])
                    if str(entry or "").strip()
                ],
                "approval_required_actions": [
                    str(entry or "").strip()
                    for entry in (item.get("approval_required_actions") if isinstance(item.get("approval_required_actions"), list) else [])
                    if str(entry or "").strip()
                ],
            }
        )
    return normalized


def _tool_capability(availability: Dict[str, Any], tool_id: str) -> Optional[Dict[str, Any]]:
    token = str(tool_id or "").strip().lower()
    for item in _normalize_tool_capabilities(availability):
        if item.get("id") == token:
            return item
    return None


def _tool_connected(availability: Dict[str, Any], tool_id: str) -> bool:
    item = _tool_capability(availability, tool_id)
    return bool(item and item.get("connected"))


def _tool_runtime_usable(availability: Dict[str, Any], tool_id: str) -> Optional[bool]:
    item = _tool_capability(availability, tool_id)
    if not isinstance(item, dict):
        return None
    return item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None


def _local_worker_available(availability: Dict[str, Any]) -> bool:
    if not isinstance(availability, dict):
        return False
    return bool(availability.get("runtime_ok"))


def _availability_lines(workspace_id: str, availability: Dict[str, Any]) -> List[str]:
    ai_ready = bool(availability.get("ai_ready"))
    tools = _normalize_tool_capabilities(availability)
    connected_labels = [str(item.get("label") or "").strip() for item in tools if item.get("connected")]
    unavailable_labels = [str(item.get("label") or "").strip() for item in tools if item.get("connected") and item.get("runtime_usable") is False]
    unverified_labels = [str(item.get("label") or "").strip() for item in tools if item.get("connected") and item.get("runtime_usable") is None]
    return [
        f"Workspace: {workspace_id or 'default'}",
        f"AI account: {'ready' if ai_ready else 'not ready'}",
        f"Connected systems: {', '.join(connected_labels) if connected_labels else 'none'}",
        f"Unavailable now: {', '.join(unavailable_labels) if unavailable_labels else 'none'}",
        f"Not verified: {', '.join(unverified_labels) if unverified_labels else 'none'}",
    ]


def _connected_system_labels(availability: Dict[str, Any]) -> List[str]:
    return [str(item.get("label") or "").strip() for item in _normalize_tool_capabilities(availability) if item.get("connected")]


def _context_tool_capabilities(availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    trimmed: List[Dict[str, Any]] = []
    for item in _normalize_tool_capabilities(availability):
        if not item.get("connected"):
            continue
        trimmed.append(
            {
                "id": item.get("id"),
                "label": item.get("label"),
                "connected": True,
                "authenticated": item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None,
                "runtime_usable": item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None,
                "read_actions": (item.get("read_actions") or [])[:MAX_CONTEXT_TOOL_ACTIONS],
                "write_actions": (item.get("write_actions") or [])[:MAX_CONTEXT_TOOL_ACTIONS],
                "approval_required_actions": (item.get("approval_required_actions") or [])[:MAX_CONTEXT_TOOL_ACTIONS],
            }
        )
        if len(trimmed) >= MAX_CONTEXT_TOOL_CAPABILITIES:
            break
    return trimmed


def _normalize_prior_messages(prior_messages: Any) -> List[Dict[str, str]]:
    if not isinstance(prior_messages, list):
        return []
    normalized: List[Dict[str, str]] = []
    for item in prior_messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = re.sub(r"\s+", " ", str(item.get("content") or "").strip())
        if not content:
            continue
        if len(content) > MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS:
            content = content[: MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS - 1].rstrip() + "…"
        normalized.append({"role": role, "content": content})
    return normalized[-MAX_DIRECT_CHAT_PRIOR_MESSAGES:]


def _build_context_used(
    *,
    workspace_id: str,
    requested_provider: str,
    effective_provider: Optional[str],
    requested_model: str,
    effective_model: Optional[str],
    reasoning_effort: Optional[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    prior_messages_used: bool,
    history_mode: str,
    run_created: bool,
    fallback_used: bool = False,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    provider_overridden = bool(
        requested_provider and effective_provider and requested_provider != effective_provider
    )
    model_overridden = bool(
        requested_model and effective_model and requested_model != effective_model
    )
    payload = {
        "workspace": workspace_id or "default",
        "requested_provider": requested_provider or None,
        "effective_provider": effective_provider or None,
        "requested_model": requested_model or None,
        "effective_model": effective_model or None,
        "provider_overridden": provider_overridden,
        "model_overridden": model_overridden,
        "fallback_used": bool(fallback_used),
        "reasoning_effort": reasoning_effort or None,
        "connected_systems": connected_systems,
        "tool_capabilities": tool_capabilities,
        "prior_messages_used": bool(prior_messages_used),
        "history_mode": history_mode if history_mode in {"none", "raw_messages", "summary"} else "none",
        "run_created": bool(run_created),
    }
    if fallback_reason:
        payload["fallback_reason"] = fallback_reason
    return payload


def _with_context_used(payload: Dict[str, Any], context_used: Dict[str, Any]) -> Dict[str, Any]:
    next_payload = dict(payload)
    next_payload["context_used"] = context_used
    return next_payload


def _connect_action(label: str, href: str) -> Dict[str, Any]:
    return {
        "id": f"connect:{href}",
        "kind": "connect",
        "label": label,
        "href": href,
        "variant": "primary",
    }


def _google_repair_action() -> Dict[str, Any]:
    return _connect_action("Reconnect Google Workspace", "/credentials?connector=google_workspace")


def _run_action(message: str) -> Dict[str, Any]:
    return {
        "id": "run:this",
        "kind": "run",
        "label": "Run this",
        "goal": str(message or "").strip(),
        "variant": "primary",
    }


def _workflow_action(message: str) -> Dict[str, Any]:
    return {
        "id": "workflow:create",
        "kind": "workflow",
        "label": "Turn into workflow",
        "goal": str(message or "").strip(),
        "href": "/builder/new",
        "variant": "secondary",
    }


def _question_like(compact_message: str) -> bool:
    return compact_message.startswith(tuple(f"{token} " for token in QUESTION_OPENERS))


def _mentions_any(compact_message: str, markers: tuple[str, ...]) -> bool:
    return any(marker in compact_message for marker in markers)


def _starts_like_direct_run(compact_message: str) -> bool:
    return compact_message.startswith(tuple(f"{token} " for token in DIRECT_RUN_OPENERS))


def _is_obvious_telegram_write_request(compact_message: str) -> bool:
    if not compact_message or _question_like(compact_message):
        return False
    return _mentions_any(compact_message, TELEGRAM_KEYWORDS) and _starts_like_direct_run(compact_message)


def _is_obvious_google_write_request(compact_message: str) -> bool:
    if not compact_message or _question_like(compact_message):
        return False
    if "send an email" in compact_message or "draft an email" in compact_message:
        return True
    if "send email" in compact_message or "draft email" in compact_message:
        return True
    if "calendar event" in compact_message and _starts_like_direct_run(compact_message):
        return True
    if "meeting invite" in compact_message and _starts_like_direct_run(compact_message):
        return True
    return False


def _connector_write_preview_allowed(message: str, availability: Dict[str, Any]) -> bool:
    compact = _compact_text(message)
    if _is_obvious_telegram_write_request(compact):
        return _tool_runtime_usable(availability, "telegram_bot") is True
    if _is_obvious_google_write_request(compact):
        return _tool_runtime_usable(availability, "google_workspace") is True
    return False


def _is_explicit_workflow_request(message: str) -> bool:
    compact = _compact_text(message)
    if not compact:
        return False
    return _mentions_any(compact, WORKFLOW_REQUEST_MARKERS)


def _no_ai_chat_response(availability: Dict[str, Any]) -> Dict[str, Any]:
    capabilities = _normalize_tool_capabilities(availability)
    connected_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected")]
    usable_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("runtime_usable") is True]
    unavailable_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected") and item.get("runtime_usable") is False]
    unverified_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected") and item.get("runtime_usable") is None]
    connected_line = ", ".join(connected_labels) if connected_labels else "none"
    usable_line = ", ".join(usable_labels) if usable_labels else "none verified"
    unavailable_line = ", ".join(unavailable_labels) if unavailable_labels else "none"
    unverified_line = ", ".join(unverified_labels) if unverified_labels else "none"
    reply = (
        "AI chat is not available right now because the workspace AI account is not ready. "
        f"Connected here right now: {connected_line}. "
        f"Usable now: {usable_line}. "
        f"Unavailable now: {unavailable_line}. "
        f"Not verified: {unverified_line}. "
        "Connect the workspace AI account to use normal chat and reasoning."
    )
    return {
        "reply": reply,
        "actions": [_connect_action("Connect", "/connect-ai")],
        "mode": "connect",
    }


def _tool_gate_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    compact = _compact_text(message)
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and not _tool_connected(availability, "google_workspace"):
        return {
            "reply": "Google Workspace is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=google_workspace")],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is False:
        return {
            "reply": "Google Workspace is connected here, but is not usable right now.",
            "actions": [_google_repair_action()],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is not True:
        return {
            "reply": "Google Workspace is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and not _tool_connected(availability, "telegram_bot"):
        return {
            "reply": "Telegram is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=telegram_bot")],
            "mode": "connect",
        }
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is False:
        return {
            "reply": "Telegram is connected here, but is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is not True:
        return {
            "reply": "Telegram is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    return None


def _suggest_actions(message: str, availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    compact = _compact_text(message)
    actions: List[Dict[str, Any]] = []
    if _is_explicit_workflow_request(message):
        actions.append(_workflow_action(message))
        return actions
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, EXECUTION_MARKERS) and not _question_like(compact):
        actions.append(_run_action(message))
    return actions


def _preview_run_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    compact = _compact_text(message)
    if _is_explicit_workflow_request(message):
        return {
            "reply": "I can help turn that into a workflow.",
            "actions": [_workflow_action(message)],
            "mode": "answer_with_action",
        }
    if _mentions_any(compact, EXECUTION_MARKERS) and _starts_like_direct_run(compact) and not _question_like(compact):
        return {
            "reply": "I can run that here.",
            "actions": [_run_action(message)],
            "mode": "answer_with_action",
        }
    return None


def _provider_supports_direct_tool_calls(provider: str) -> bool:
    return str(provider or "").strip().lower() == "codex_cli"


def _build_local_direct_chat_tools(availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not _local_worker_available(availability):
        return []
    return [
        {
            "name": "file__read",
            "description": "Read a file from the local machine",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path to read"}
                },
                "required": ["path"],
            },
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
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run"}
                },
                "required": ["command"],
            },
        },
        {
            "name": "screenshot__capture",
            "description": "Take a screenshot of the current screen",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    ]


def _build_direct_chat_tools(tool_capabilities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for cap in tool_capabilities:
        if not isinstance(cap, dict):
            continue
        if cap.get("runtime_usable") is not True:
            continue
        connector_id = str(cap.get("id") or "").strip().lower()
        label = str(cap.get("label") or connector_id).strip() or connector_id
        if not connector_id:
            continue
        for raw_action in cap.get("write_actions", []):
            action = str(raw_action or "").strip()
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
                        "properties": {
                            "input": {
                                "type": "string",
                                "description": "The input for this action",
                            }
                        },
                        "required": ["input"],
                    },
                }
            )
    return tools


def _message_can_use_direct_connector_tools(
    message: str,
    *,
    provider: str,
    tools: List[Dict[str, Any]],
) -> bool:
    if not _provider_supports_direct_tool_calls(provider) or not tools:
        return False
    compact = _compact_text(message)
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS):
        return any(str(item.get("name") or "").startswith("google_workspace__") for item in tools)
    if _mentions_any(compact, TELEGRAM_KEYWORDS):
        return any(str(item.get("name") or "").startswith("telegram_bot__") for item in tools)
    return False


def _looks_like_local_path_request(compact_message: str) -> bool:
    if not compact_message:
        return False
    return bool(
        re.search(
            r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])",
            compact_message,
            flags=re.IGNORECASE,
        )
    )


def _message_requests_local_file_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    if _mentions_any(compact, LOCAL_FILE_KEYWORDS):
        return True
    return _looks_like_local_path_request(compact) and any(
        token in compact for token in ("read", "open", "write", "save", "append", "delete")
    )


def _message_requests_local_shell_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    if _mentions_any(compact, LOCAL_SHELL_KEYWORDS):
        return True
    return bool(re.search(r"`[^`]+`", str(message or ""))) and any(
        token in compact for token in ("run", "exec", "execute", "shell", "terminal", "command")
    )


def _message_requests_local_screenshot_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    return _mentions_any(compact, LOCAL_SCREENSHOT_KEYWORDS)


def _message_can_use_direct_local_tools(
    message: str,
    *,
    provider: str,
    tools: List[Dict[str, Any]],
) -> bool:
    if not _provider_supports_direct_tool_calls(provider) or not tools:
        return False
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    if _message_requests_local_file_tool(message) and {"file__read", "file__write"} & tool_names:
        return True
    if _message_requests_local_shell_tool(message) and "shell__exec" in tool_names:
        return True
    if _message_requests_local_screenshot_tool(message) and "screenshot__capture" in tool_names:
        return True
    return False


def _parse_tool_name(tool_name: str) -> tuple[str, str]:
    token = str(tool_name or "").strip()
    if "__" not in token:
        raise RuntimeError(f"Unsupported direct chat tool '{token}'.")
    connector_id, action_id = token.split("__", 1)
    connector_id = connector_id.strip().lower()
    action_id = action_id.strip()
    if not connector_id or not action_id:
        raise RuntimeError(f"Unsupported direct chat tool '{token}'.")
    return connector_id, action_id


def _tool_arguments_payload(arguments: Any) -> Dict[str, Any]:
    if isinstance(arguments, dict):
        return dict(arguments)
    parsed = parse_json_object_loose(str(arguments or ""))
    return dict(parsed) if isinstance(parsed, dict) else {}


def _extract_first_email(text: str) -> str:
    match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", str(text or ""), flags=re.IGNORECASE)
    return match.group(0).strip() if match else ""


def _extract_subject_text(text: str) -> str:
    raw = str(text or "").strip()
    for pattern in (
        r"subject\s*[:=]\s*([^\n]+)",
        r"subject\s+(.+?)(?:\s+body\s*:|\s+message\s*:|$)",
    ):
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip(" \"'")
    return ""


def _extract_body_text(text: str) -> str:
    raw = str(text or "").strip()
    for pattern in (
        r"(?:body|message|content|saying)\s*[:=]?\s+(.+)$",
    ):
        match = re.search(pattern, raw, flags=re.IGNORECASE | re.DOTALL)
        if match:
            body = str(match.group(1) or "").strip()
            if body:
                return body
    return raw


def _first_non_empty_line(text: str) -> str:
    for line in str(text or "").splitlines():
        token = line.strip()
        if token:
            return token
    return ""


def _build_direct_tool_config(connector_id: str, action_id: str, tool_input: str) -> Dict[str, Any]:
    config: Dict[str, Any] = {
        "connector": connector_id,
        "action_id": action_id,
    }
    parsed_input = parse_json_object_loose(tool_input) or {}

    if connector_id == "telegram_bot":
        for key in ("chat_id", "session_key"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        config["text"] = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or tool_input
        ).strip()
        return config

    if connector_id == "google_workspace" and action_id in {"send_email", "send_message", "draft_email"}:
        to_email = str(
            parsed_input.get("to_email")
            or parsed_input.get("to")
            or parsed_input.get("email")
            or parsed_input.get("recipient")
            or _extract_first_email(tool_input)
            or ""
        ).strip()
        subject = str(parsed_input.get("subject") or _extract_subject_text(tool_input) or "").strip()
        body_text = str(
            parsed_input.get("body")
            or parsed_input.get("message")
            or parsed_input.get("content")
            or _extract_body_text(tool_input)
            or ""
        ).strip()
        if to_email:
            config["to_email"] = to_email
        if subject:
            config["subject"] = subject
        if body_text:
            config["text"] = body_text
        return config

    if connector_id == "google_workspace" and action_id == "create_calendar_event":
        payload = parsed_input.get("payload") if isinstance(parsed_input.get("payload"), dict) else None
        if payload:
            config["payload"] = payload
        for key in ("title", "description", "start", "end", "timezone", "calendar_id"):
            value = parsed_input.get(key)
            if value is None:
                continue
            token = str(value).strip()
            if token:
                config[key] = token
        if "description" not in config and tool_input.strip():
            config["description"] = tool_input.strip()
        return config

    if connector_id == "google_workspace" and action_id in {"create_doc", "create_document", "create_sheet", "create_spreadsheet"}:
        title = str(
            parsed_input.get("title")
            or parsed_input.get("name")
            or _first_non_empty_line(tool_input)
            or ""
        ).strip()
        if title:
            config["title"] = title[:180]
        return config

    if tool_input.strip():
        config["text"] = tool_input.strip()
    return config


def _build_direct_local_tool_config(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    if connector_id == "file" and action_id == "read":
        path = str(arguments.get("path") or arguments.get("file_path") or "").strip()
        if not path:
            raise RuntimeError("Tool 'file__read' requires a file path.")
        return "file", {
            "path": path,
            "mode": "read",
            "summary": f"Read local file: {path}",
        }
    if connector_id == "file" and action_id == "write":
        path = str(arguments.get("path") or arguments.get("file_path") or "").strip()
        content = str(arguments.get("content") or "").strip()
        if not path or not content:
            raise RuntimeError("Tool 'file__write' requires path and content.")
        return "file", {
            "path": path,
            "content": content,
            "mode": "write",
            "summary": f"Write local file: {path}",
        }
    if connector_id == "shell" and action_id == "exec":
        command = str(arguments.get("command") or "").strip()
        if not command:
            raise RuntimeError("Tool 'shell__exec' requires a command.")
        return "shell", {
            "command": command,
            "summary": f"Execute shell command: {command}",
        }
    if connector_id == "screenshot" and action_id == "capture":
        return "screenshot", {
            "summary": "Capture screenshot of the current screen.",
        }
    raise RuntimeError(f"Unsupported direct local tool '{connector_id}__{action_id}'.")


def _tool_write_action_available(
    connector_id: str,
    action_id: str,
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    if normalized_connector_id in {"file", "shell", "screenshot"}:
        return normalized_action_id in {"read", "write", "exec", "capture"}
    for item in tool_capabilities:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "").strip().lower() != normalized_connector_id:
            continue
        if not bool(item.get("connected")):
            return False
        write_actions = item.get("write_actions") if isinstance(item.get("write_actions"), list) else []
        return normalized_action_id in {str(entry or "").strip() for entry in write_actions}
    return False


def _normalize_direct_approved_action(value: Any) -> Optional[Dict[str, str]]:
    if not isinstance(value, dict):
        return None
    connector_id = str(value.get("connector") or "").strip().lower()
    action_id = str(value.get("action") or "").strip()
    tool_input = str(value.get("input") or "").strip()
    if not connector_id or not action_id or not tool_input:
        return None
    return {
        "connector": connector_id,
        "action": action_id,
        "input": tool_input,
    }


def _approved_action_to_tool_call(approved_action: Dict[str, str]) -> Dict[str, Any]:
    connector_id = str(approved_action.get("connector") or "").strip().lower()
    raw_input = str(approved_action.get("input") or "").strip()
    if connector_id in {"file", "shell", "screenshot"}:
        parsed_input = parse_json_object_loose(raw_input)
        arguments = parsed_input if isinstance(parsed_input, dict) else ({} if connector_id == "screenshot" else {"input": raw_input})
    else:
        arguments = {"input": raw_input}
    return {
        "name": f"{approved_action['connector']}__{approved_action['action']}",
        "arguments": json.dumps(arguments, ensure_ascii=False),
    }


def _format_direct_tool_result(result: Dict[str, Any]) -> str:
    if not isinstance(result, dict):
        return str(result or "").strip()
    summary = str(result.get("summary") or "").strip()
    result_data = result.get("result_data") if isinstance(result.get("result_data"), dict) else {}
    connector_action = result_data.get("connector_action") if isinstance(result_data.get("connector_action"), dict) else {}
    highlights: List[str] = []
    for key, label in (
        ("recipient", "Recipient"),
        ("subject", "Subject"),
        ("chat_id", "Chat"),
        ("title", "Title"),
        ("calendar_id", "Calendar"),
        ("path", "Path"),
    ):
        value = str(connector_action.get(key) or "").strip()
        if value:
            highlights.append(f"{label}: {value}")
    if summary and highlights:
        return "\n".join([summary, *highlights])
    if summary:
        return summary
    if connector_action:
        try:
            return json.dumps(connector_action, ensure_ascii=True, indent=2)
        except Exception:
            return str(connector_action)
    try:
        return json.dumps(result, ensure_ascii=True, indent=2)
    except Exception:
        return str(result)


def _format_direct_local_tool_result(result: Dict[str, Any]) -> str:
    if not isinstance(result, dict):
        return str(result or "").strip()
    summary = str(result.get("summary") or "").strip()
    result_data = result.get("result_data") if isinstance(result.get("result_data"), dict) else {}
    child_result = result_data.get("child_result") if isinstance(result_data.get("child_result"), dict) else {}
    outputs = child_result.get("outputs") if isinstance(child_result.get("outputs"), dict) else {}
    actions = outputs.get("actions") if isinstance(outputs.get("actions"), list) else []
    artifacts = outputs.get("artifacts") if isinstance(outputs.get("artifacts"), list) else []
    first_action = actions[0] if actions and isinstance(actions[0], dict) else {}
    first_artifact = artifacts[0] if artifacts and isinstance(artifacts[0], dict) else {}
    tool_name = str(first_action.get("tool") or result_data.get("tool_variant") or "").strip().lower()

    if tool_name == "read_write_files":
        mode = str(first_action.get("mode") or "").strip().lower()
        path = str(first_action.get("path") or first_action.get("file_path") or "").strip()
        if mode == "read":
            preview = str(first_action.get("content_preview") or "").strip()
            return "\n".join(part for part in [f"Read file: {path}" if path else summary, preview] if part).strip()
        if mode == "write":
            return f"Wrote file: {path}" if path else (summary or "File write completed.")
        if mode == "append":
            return f"Appended file: {path}" if path else (summary or "File append completed.")
        if mode == "delete":
            return f"Deleted file: {path}" if path else (summary or "File delete completed.")

    if tool_name == "execute_shell_command":
        command = str(first_action.get("command") or "").strip()
        stdout_preview = str(first_action.get("stdout_preview") or "").strip()
        stderr_preview = str(first_action.get("stderr_preview") or "").strip()
        log_path = str(first_action.get("file_path") or "").strip()
        lines = [f"Command completed: {command}" if command else (summary or "Shell command completed.")]
        if stdout_preview:
            lines.append(stdout_preview)
        if stderr_preview:
            lines.append(f"stderr: {stderr_preview}")
        if log_path:
            lines.append(f"Log: {log_path}")
        return "\n".join(part for part in lines if part).strip()

    if tool_name == "capture_screenshot":
        path = str(first_action.get("path") or first_action.get("file_path") or first_artifact.get("file_path") or "").strip()
        return f"Captured screenshot: {path}" if path else (summary or "Screenshot captured.")

    return summary or json.dumps(result, ensure_ascii=True, indent=2)


def _shell_command_requires_approval(command: str) -> bool:
    compact = _compact_text(command)
    if not compact:
        return False
    destructive_markers = (
        "rm -rf",
        "rm -r ",
        "rm -f ",
        "sudo rm",
        "del /f",
        "del /q",
        "rmdir /s",
        "format ",
        "mkfs",
        "diskutil erase",
        "shred ",
        "dd if=",
    )
    return any(marker in compact for marker in destructive_markers)


def _file_write_requires_approval(arguments: Dict[str, Any]) -> bool:
    path = str(arguments.get("path") or arguments.get("file_path") or "").strip().lower()
    if not path:
        return False
    protected_markers = (
        "/etc/",
        "/bin/",
        "/usr/",
        "/system/",
        "/library/",
        ".ssh/",
        ".gnupg/",
        ".env",
        ".git/config",
    )
    return any(marker in path for marker in protected_markers)


def _local_direct_tool_requires_approval(connector_id: str, action_id: str, arguments: Dict[str, Any]) -> bool:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    if normalized_connector == "shell" and normalized_action == "exec":
        return _shell_command_requires_approval(str(arguments.get("command") or ""))
    if normalized_connector == "file" and normalized_action == "write":
        return _file_write_requires_approval(arguments)
    return False


def _titleize_direct_step_token(value: str) -> str:
    words = [part for part in str(value or "").strip().replace("-", "_").split("_") if part]
    return " ".join(word.capitalize() for word in words)


def _compact_step_detail(value: Any, limit: int = 120) -> Optional[str]:
    normalized = " ".join(str(value or "").split()).strip()
    if not normalized:
        return None
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 1].rstrip()}…"


def _direct_tool_step_payload(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    *,
    step_id: str,
    status: str,
    detail_override: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    label = "Running tool"
    kind = "connector"
    detail = _compact_step_detail(detail_override)

    if normalized_connector == "file" and normalized_action == "read":
        label = "Reading file"
        kind = "file"
        detail = detail or _compact_step_detail(arguments.get("path") or arguments.get("file_path"))
    elif normalized_connector == "file" and normalized_action == "write":
        label = "Writing file"
        kind = "file"
        detail = detail or _compact_step_detail(arguments.get("path") or arguments.get("file_path"))
    elif normalized_connector == "shell" and normalized_action == "exec":
        label = "Running command"
        kind = "shell"
        detail = detail or _compact_step_detail(arguments.get("command"))
    elif normalized_connector == "screenshot" and normalized_action == "capture":
        label = "Capturing screenshot"
        kind = "screenshot"
        detail = detail or _compact_step_detail(arguments.get("path") or arguments.get("file_path") or "Current screen")
    else:
        action_label = _titleize_direct_step_token(normalized_action) or "Connector action"
        connector_label = _titleize_direct_step_token(normalized_connector) or normalized_connector
        label = action_label
        kind = "connector"
        detail = detail or connector_label

    return {
        "type": "step",
        "id": step_id,
        "kind": kind,
        "label": label,
        "detail": detail,
        "status": status,
    }


def _thinking_step_payload(iteration: int, status: str, detail: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "step",
        "id": f"thinking:{iteration}",
        "kind": "thinking",
        "label": "Thinking",
        "detail": detail or ("Planning the response" if iteration <= 1 else "Planning the next step"),
        "status": status,
    }


def _direct_tool_followup_message(tool_name: str, result_text: str) -> str:
    cleaned_result = str(result_text or "").strip() or "No result."
    return (
        f"Tool result for {tool_name}:\n{cleaned_result}\n\n"
        "Continue until the task is complete. If another tool is needed, call it now. "
        "Otherwise provide the final answer to the user."
    )


def _execute_single_direct_tool_call(
    *,
    tool_call: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    index: int = 1,
) -> str:
    from server_modules.runs_execution import _workflow_execute_connector_action, _workflow_execute_local_tool

    connector_id, action_id = _parse_tool_name(str(tool_call.get("name") or ""))
    argument_payload = _tool_arguments_payload(tool_call.get("arguments"))
    if connector_id in {"file", "shell", "screenshot"} and isinstance(argument_payload.get("input"), str):
        nested_input = parse_json_object_loose(str(argument_payload.get("input") or ""))
        if isinstance(nested_input, dict):
            argument_payload = nested_input

    run_id = f"direct-chat-{uuid4().hex}"
    execution_context: Dict[str, Any] = {
        "workspace_id": workspace_id,
        "workflow_id": "direct_chat",
        "workflow_name": "Direct chat",
        "metadata": {
            "source": "chat_direct",
            "thread_id": thread_id or None,
            "execution_target": "local_companion",
            "execution_target_selected": "local_companion",
        },
    }

    if connector_id in {"file", "shell", "screenshot"}:
        variant, config = _build_direct_local_tool_config(connector_id, action_id, argument_payload)
        result = _workflow_execute_local_tool(
            run_id,
            execution_context,
            config,
            label=f"{connector_id}__{action_id}",
            variant=variant,
            current_text=str(argument_payload.get("content") or argument_payload.get("command") or "").strip(),
        )
        return _format_direct_local_tool_result(result)

    tool_input = str(argument_payload.get("input") or "").strip()
    if not tool_input:
        raise RuntimeError(f"Tool '{connector_id}__{action_id}' requires a non-empty input argument.")
    config = _build_direct_tool_config(connector_id, action_id, tool_input)
    result = _workflow_execute_connector_action(
        run_id,
        f"direct_chat_tool:{index}",
        execution_context,
        config,
        current_text=tool_input,
    )
    return _format_direct_tool_result(result)


def _execute_direct_tool_calls(
    *,
    tool_calls: List[Dict[str, Any]],
    workspace_id: str,
    thread_id: str,
) -> str:
    if not tool_calls:
        return ""
    replies: List[str] = []
    for index, call in enumerate(tool_calls, start=1):
        replies.append(
            _execute_single_direct_tool_call(
                tool_call=call,
                workspace_id=workspace_id,
                thread_id=thread_id,
                index=index,
            )
        )
    return "\n\n".join(part for part in replies if part).strip()


def _approval_required_for_direct_tool(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    if normalized_connector_id in {"file", "shell", "screenshot"}:
        return _local_direct_tool_requires_approval(normalized_connector_id, normalized_action_id, arguments)
    for item in tool_capabilities:
        if not isinstance(item, dict):
            continue
        if str(item.get("id") or "").strip().lower() != normalized_connector_id:
            continue
        required_actions = item.get("approval_required_actions") if isinstance(item.get("approval_required_actions"), list) else []
        return normalized_action_id in {str(entry or "").strip() for entry in required_actions}
    return False


def _build_direct_tool_approval_response(
    *,
    tool_calls: List[Dict[str, Any]],
    tool_capabilities: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    approval_actions: List[Dict[str, Any]] = []
    for index, call in enumerate(tool_calls, start=1):
        connector_id, action_id = _parse_tool_name(str(call.get("name") or ""))
        argument_payload = _tool_arguments_payload(call.get("arguments"))
        if not _approval_required_for_direct_tool(connector_id, action_id, argument_payload, tool_capabilities):
            continue
        tool_input = str(argument_payload.get("input") or "").strip()
        if connector_id in {"file", "shell", "screenshot"}:
            tool_input = json.dumps(argument_payload, ensure_ascii=False)
        approval_actions.append(
            {
                "type": "approval_required",
                "connector": connector_id,
                "action": action_id,
                "input": tool_input,
                "id": f"approval_required:{connector_id}:{action_id}:{index}",
                "kind": "approval_required",
                "label": "Confirm",
                "variant": "primary",
            }
        )
    if not approval_actions:
        return None
    return {
        "reply": "This action requires your approval before I send it. Confirm?",
        "actions": approval_actions,
        "mode": "answer_with_action",
    }


def _credential_auth_mode(provider: str, credentials: Optional[Dict[str, Any]]) -> str:
    payload = credentials if isinstance(credentials, dict) else {}
    return normalize_auth_mode(provider, credentials=payload)


def _supports_direct_message_native_chat(provider: str, credentials: Optional[Dict[str, Any]]) -> bool:
    payload = credentials if isinstance(credentials, dict) else {}
    auth_mode = _credential_auth_mode(provider, payload)
    normalized_provider = str(provider or "").strip().lower()
    if normalized_provider == "anthropic":
        if auth_mode == "local_cli":
            return bool(get_claude_code_session_token())
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("anthropic")
    if normalized_provider == "openai":
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("openai")
    if normalized_provider == "gemini":
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("gemini")
    if normalized_provider == "codex_cli":
        return bool(payload) or provider_has_key("codex_cli")
    return provider_has_key(normalized_provider)


def _preferred_provider(workspace_id: str, requested_provider: str = "") -> tuple[str, Dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    prioritized_message_native = ("anthropic", "openai", "gemini")
    for provider in prioritized_message_native:
        credentials = _direct_chat_credentials(normalized_workspace_id, provider)
        if _supports_direct_message_native_chat(provider, credentials):
            return provider, credentials
    codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
    if _supports_direct_message_native_chat("codex_cli", codex_credentials):
        return "codex_cli", codex_credentials
    requested = str(requested_provider or "").strip().lower()
    fallback_provider = requested if requested in SUPPORTED_PROVIDERS else "openai"
    fallback_credentials = _direct_chat_credentials(normalized_workspace_id, fallback_provider)
    return fallback_provider, fallback_credentials


def _provider_display_name(provider: str) -> str:
    normalized = str(provider or "").strip().lower()
    if normalized == "codex_cli":
        return "Codex/OpenAI"
    if normalized == "claude_code_cli":
        return "Claude Code"
    if normalized == "openai":
        return "OpenAI"
    if normalized == "anthropic":
        return "Anthropic"
    if normalized == "gemini":
        return "Gemini"
    if normalized == "ollama":
        return "Ollama"
    return normalized or "AI"


def _provider_unavailable_response(provider: str) -> Dict[str, Any]:
    label = _provider_display_name(provider)
    if provider == "codex_cli":
        return {
            "reply": "The workspace AI account is not ready to answer chat right now.",
            "actions": [_connect_action("Connect", "/connect-ai")],
            "mode": "connect",
        }
    return {
        "reply": f"{label} is selected for chat but is not available right now.",
        "actions": [_connect_action("Connect", "/connect-ai")],
        "mode": "connect",
    }


def _direct_chat_credentials(workspace_id: str, provider: str) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_provider = str(provider or "").strip().lower()
    candidate_provider = "openai-codex" if normalized_provider == "codex_cli" else normalized_provider
    candidates = _build_provider_credential_candidates(
        {"workspace_id": normalized_workspace_id},
        {"source": "chat_direct"},
        candidate_provider,
    )
    if normalized_provider == "codex_cli" and not candidates:
        openai_candidates = _build_provider_credential_candidates(
            {"workspace_id": normalized_workspace_id},
            {"source": "chat_direct"},
            "openai",
        )
        candidates = [
            item for item in openai_candidates
            if isinstance(item.get("credentials"), dict)
            and str((item.get("credentials") or {}).get("auth_mode") or "").strip().lower() == "oauth_token"
        ]
    first = candidates[0].get("credentials") if candidates else {}
    return dict(first) if isinstance(first, dict) else {}


def _normalize_reasoning_effort(value: str = "") -> Optional[str]:
    normalized = str(value or "").strip().lower()
    if normalized in {"low", "medium", "high"}:
        return normalized
    return None


def _direct_chat_error_reply(llm_error: str) -> str:
    detail = str(llm_error or "").strip() or "unknown_error"
    return f"Chat failed: {detail}"


def build_direct_operator_reply(
    *,
    message: str,
    workspace_id: str,
    requested_model: str,
    requested_provider: str,
    thread_id: str = "",
    prior_messages: Optional[List[Dict[str, Any]]] = None,
    reasoning_effort: str = "",
    availability: Optional[Dict[str, Any]] = None,
    approved_action: Optional[Dict[str, Any]] = None,
) -> Iterator[Dict[str, Any]]:
    normalized_message = str(message or "").strip()
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_thread_id = str(thread_id or "").strip()
    availability_payload = availability if isinstance(availability, dict) else {}
    normalized_requested_provider = str(requested_provider or "").strip().lower()
    normalized_requested_model = str(requested_model or "").strip()
    normalized_reasoning_effort = _normalize_reasoning_effort(reasoning_effort)
    normalized_prior_messages = _normalize_prior_messages(prior_messages)
    availability_payload = {
        **availability_payload,
        "tool_capabilities": resolve_workspace_tool_capabilities(normalized_workspace_id),
    }
    connected_systems = _connected_system_labels(availability_payload)
    tool_capabilities = _context_tool_capabilities(availability_payload)
    tools = _build_direct_chat_tools(tool_capabilities)
    tools.extend(_build_local_direct_chat_tools(availability_payload))
    approved_action_payload = _normalize_direct_approved_action(approved_action)
    base_context_used = _build_context_used(
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

    if not normalized_message:
        yield {
            "type": "final",
            "payload": _with_context_used({
            "reply": "Tell me the outcome you want and I’ll help you move it forward.",
            "actions": [],
            "mode": "answer",
            }, base_context_used),
        }
        return

    if normalized_message == "__approval_confirmed__":
        if approved_action_payload is None:
            yield {
                "type": "final",
                "payload": _with_context_used({
                    "reply": "Approval confirmation is missing the connector action payload.",
                    "actions": [],
                    "mode": "answer",
                    "error": "missing_approved_action",
                }, base_context_used),
            }
            return
        if not _tool_write_action_available(
            approved_action_payload["connector"],
            approved_action_payload["action"],
            tool_capabilities,
        ):
            yield {
                "type": "final",
                "payload": _with_context_used({
                    "reply": "That connector action is not available in this workspace right now.",
                    "actions": [],
                    "mode": "answer",
                    "error": "unavailable_approved_action",
                }, base_context_used),
            }
            return
        try:
            tool_reply = _execute_direct_tool_calls(
                tool_calls=[_approved_action_to_tool_call(approved_action_payload)],
                workspace_id=normalized_workspace_id,
                thread_id=normalized_thread_id,
            )
            yield {
                "type": "final",
                "payload": {
                    "reply": tool_reply or "Connector action completed.",
                    "actions": [],
                    "mode": "answer",
                    "usage_masked": {},
                    "provider": None,
                    "model": None,
                    "attempted_providers": "",
                    "error": "",
                    "context_used": _build_context_used(
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
                        fallback_used=False,
                        fallback_reason=None,
                    ),
                },
            }
            return
        except Exception as exc:
            error_text = str(exc).strip() or "connector_action_failed"
            yield {
                "type": "final",
                "payload": {
                    "reply": f"Connector action failed: {error_text}",
                    "actions": [],
                    "mode": "answer",
                    "usage_masked": {},
                    "provider": None,
                    "model": None,
                    "attempted_providers": "",
                    "error": error_text,
                    "context_used": _build_context_used(
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
                        fallback_used=False,
                        fallback_reason=None,
                    ),
                },
            }
            return

    gated = _tool_gate_response(normalized_message, availability_payload)
    if gated is not None:
        yield {
            "type": "final",
            "payload": _with_context_used(gated, base_context_used),
        }
        return

    if not bool(availability_payload.get("ai_ready")) and not _connector_write_preview_allowed(normalized_message, availability_payload):
        yield {
            "type": "final",
            "payload": _with_context_used(_no_ai_chat_response(availability_payload), base_context_used),
        }
        return

    provider, direct_chat_credentials = _preferred_provider(normalized_workspace_id, normalized_requested_provider)
    if tools and (
        _mentions_any(_compact_text(normalized_message), GOOGLE_WORKSPACE_KEYWORDS)
        or _mentions_any(_compact_text(normalized_message), TELEGRAM_KEYWORDS)
    ):
        codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
        if _supports_direct_message_native_chat("codex_cli", codex_credentials):
            provider = "codex_cli"
            direct_chat_credentials = codex_credentials
    if _message_requests_local_file_tool(normalized_message) or _message_requests_local_shell_tool(normalized_message) or _message_requests_local_screenshot_tool(normalized_message):
        codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
        if _supports_direct_message_native_chat("codex_cli", codex_credentials):
            provider = "codex_cli"
            direct_chat_credentials = codex_credentials
    allow_direct_tool_calls = _message_can_use_direct_connector_tools(
        normalized_message,
        provider=provider,
        tools=tools,
    ) or _message_can_use_direct_local_tools(
        normalized_message,
        provider=provider,
        tools=tools,
    )
    if not allow_direct_tool_calls:
        preview = _preview_run_response(normalized_message, availability_payload)
        if preview is not None:
            yield {
                "type": "final",
                "payload": _with_context_used(preview, base_context_used),
            }
            return
    fallback_reason = None
    if provider not in SUPPORTED_PROVIDERS or not _supports_direct_message_native_chat(provider, direct_chat_credentials):
        yield {
            "type": "final",
            "payload": _with_context_used(
                _provider_unavailable_response(provider),
                _build_context_used(
                workspace_id=normalized_workspace_id,
                requested_provider=normalized_requested_provider,
                effective_provider=provider,
                requested_model=normalized_requested_model,
                effective_model=None,
                reasoning_effort=normalized_reasoning_effort,
                connected_systems=connected_systems,
                tool_capabilities=tool_capabilities,
                prior_messages_used=False,
                history_mode="none",
                run_created=False,
                fallback_used=False,
                fallback_reason=fallback_reason,
            ),
            ),
        }
        return
    selected_model = normalized_requested_model if provider == normalized_requested_provider else ""
    context = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
        "tools": tools,
    }
    metadata = {
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
        "tools": tools,
    }
    if direct_chat_credentials:
        metadata["credentials"] = direct_chat_credentials
    raw_system_prompt = build_operator_system_prompt(
        _availability_lines(normalized_workspace_id, availability_payload),
    )
    system_prompt = raw_system_prompt or None
    history_mode = "raw_messages" if normalized_prior_messages else "none"
    prior_messages_used = bool(normalized_prior_messages)
    usage_masked: Dict[str, Any] = {}
    attempted_providers = ""
    llm_error = ""
    actual_provider: Optional[str] = provider
    actual_model: Optional[str] = normalized_requested_model or None
    executed_any_tools = False
    conversation_messages: List[Dict[str, str]] = list(normalized_prior_messages)
    current_prompt = normalized_message
    max_iterations = 10

    for iteration in range(max_iterations):
        thinking_iteration = iteration + 1
        yield _thinking_step_payload(thinking_iteration, "active")

        iteration_reply = ""
        iteration_tool_calls: List[Dict[str, Any]] = []
        iteration_failed = False

        for event in generate_chat_reply_stream_with_provider_fallback(
            context=context,
            metadata=metadata,
            user_goal=current_prompt,
            system_prompt=system_prompt,
            prior_messages=conversation_messages or None,
        ):
            event_type = str(event.get("type") or "").strip().lower()
            if event_type == "chunk":
                delta = str(event.get("delta") or "")
                if delta:
                    iteration_reply += delta
                continue
            if event_type == "result":
                final_reply = str(event.get("reply") or "").strip() or iteration_reply
                usage_masked = event.get("usage_masked") if isinstance(event.get("usage_masked"), dict) else {}
                attempted_providers = str(event.get("attempted_providers") or "").strip()
                llm_error = str(event.get("error") or "").strip()
                actual_provider = str(event.get("provider") or actual_provider or "").strip() or actual_provider
                actual_model = str(event.get("model") or actual_model or "").strip() or actual_model
                iteration_tool_calls = event.get("tool_calls") if isinstance(event.get("tool_calls"), list) else []
                yield _thinking_step_payload(
                    thinking_iteration,
                    "done",
                    "Prepared the next action" if iteration_tool_calls else "Answer ready",
                )

                conversation_messages.append({"role": "user", "content": current_prompt})
                if final_reply:
                    conversation_messages.append({"role": "assistant", "content": final_reply})

                if iteration_tool_calls:
                    approval_payload = _build_direct_tool_approval_response(
                        tool_calls=iteration_tool_calls,
                        tool_capabilities=tool_capabilities,
                    )
                    if approval_payload is not None:
                        yield {
                            "type": "final",
                            "payload": {
                                **approval_payload,
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": "",
                                "context_used": _build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or provider or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode="raw_messages",
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                    try:
                        connector_id = ""
                        action_id = ""
                        argument_payload: Dict[str, Any] = {}
                        step_id = f"tool:{thinking_iteration}:0"
                        for tool_index, tool_call in enumerate(iteration_tool_calls, start=1):
                            connector_id, action_id = _parse_tool_name(str(tool_call.get("name") or ""))
                            argument_payload = _tool_arguments_payload(tool_call.get("arguments"))
                            if connector_id in {"file", "shell", "screenshot"} and isinstance(argument_payload.get("input"), str):
                                nested_input = parse_json_object_loose(str(argument_payload.get("input") or ""))
                                if isinstance(nested_input, dict):
                                    argument_payload = nested_input
                            step_id = f"tool:{thinking_iteration}:{tool_index}"
                            yield _direct_tool_step_payload(
                                connector_id,
                                action_id,
                                argument_payload,
                                step_id=step_id,
                                status="active",
                            )
                            tool_result = _execute_single_direct_tool_call(
                                tool_call=tool_call,
                                workspace_id=normalized_workspace_id,
                                thread_id=normalized_thread_id,
                                index=tool_index,
                            )
                            executed_any_tools = True
                            yield _direct_tool_step_payload(
                                connector_id,
                                action_id,
                                argument_payload,
                                step_id=step_id,
                                status="done",
                            )
                            conversation_messages.append(
                                {
                                    "role": "user",
                                    "content": _direct_tool_followup_message(
                                        str(tool_call.get("name") or f"{connector_id}__{action_id}"),
                                        tool_result,
                                    ),
                                }
                            )
                        current_prompt = (
                            "Continue until the task is complete. If another tool is needed, call it now. "
                            "Otherwise provide the final answer to the user."
                        )
                        break
                    except Exception as exc:
                        llm_error = str(exc).strip() or "connector_action_failed"
                        yield _direct_tool_step_payload(
                            connector_id,
                            action_id,
                            argument_payload,
                            step_id=step_id,
                            status="error",
                            detail_override=llm_error,
                        )
                        yield {
                            "type": "final",
                            "payload": {
                                "reply": f"Connector action failed: {llm_error}",
                                "actions": [],
                                "mode": "answer",
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": llm_error,
                                "context_used": _build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or provider or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode="raw_messages",
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                actions = [] if executed_any_tools else _suggest_actions(normalized_message, availability_payload)
                if final_reply:
                    yield {"type": "chunk", "delta": final_reply}
                yield {
                    "type": "final",
                    "payload": {
                        "reply": final_reply,
                        "actions": actions,
                        "mode": "answer_with_action" if actions else "answer",
                        "usage_masked": usage_masked,
                        "provider": actual_provider,
                        "model": actual_model,
                        "attempted_providers": attempted_providers,
                        "error": llm_error,
                        "context_used": _build_context_used(
                            workspace_id=normalized_workspace_id,
                            requested_provider=normalized_requested_provider,
                            effective_provider=str(actual_provider or provider or "").strip() or None,
                            requested_model=normalized_requested_model,
                            effective_model=str(actual_model or "").strip() or None,
                            reasoning_effort=normalized_reasoning_effort,
                            connected_systems=connected_systems,
                            tool_capabilities=tool_capabilities,
                            prior_messages_used=bool(conversation_messages),
                            history_mode="raw_messages" if conversation_messages else history_mode,
                            run_created=False,
                            fallback_used=False,
                            fallback_reason=fallback_reason,
                        ),
                    },
                }
                return
            if event_type == "failure":
                attempted_providers = str(event.get("attempted_providers") or "").strip()
                llm_error = str(event.get("error") or "").strip()
                yield _thinking_step_payload(thinking_iteration, "error", llm_error or "Model call failed")
                iteration_failed = True
                break

        if iteration_failed:
            break
        if not iteration_tool_calls:
            break
    else:
        llm_error = llm_error or f"max_tool_iterations_reached:{max_iterations}"

    actions = [] if executed_any_tools else _suggest_actions(normalized_message, availability_payload)
    yield {
        "type": "final",
        "payload": {
            "reply": _direct_chat_error_reply(llm_error),
            "actions": actions,
            "mode": "answer_with_action" if actions else "answer",
            "usage_masked": usage_masked,
            "provider": actual_provider,
            "model": actual_model,
            "attempted_providers": attempted_providers,
            "error": llm_error,
            "context_used": _build_context_used(
            workspace_id=normalized_workspace_id,
            requested_provider=normalized_requested_provider,
            effective_provider=str(actual_provider or provider or "").strip() or None,
            requested_model=normalized_requested_model,
            effective_model=str(actual_model or "").strip() or None,
            reasoning_effort=normalized_reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            prior_messages_used=prior_messages_used,
            history_mode=history_mode,
            run_created=False,
            fallback_used=False,
            fallback_reason=fallback_reason,
            ),
        },
    }


def collect_direct_operator_reply(
    **kwargs: Any,
) -> Dict[str, Any]:
    final_payload: Dict[str, Any] = {}
    accumulated_reply = ""
    for event in build_direct_operator_reply(**kwargs):
        event_type = str(event.get("type") or "").strip().lower()
        if event_type == "chunk":
            accumulated_reply += str(event.get("delta") or "")
            continue
        if event_type == "final" and isinstance(event.get("payload"), dict):
            final_payload = dict(event.get("payload") or {})
            if not str(final_payload.get("reply") or "").strip() and accumulated_reply:
                final_payload["reply"] = accumulated_reply
            return final_payload
    return final_payload or {"reply": accumulated_reply}
