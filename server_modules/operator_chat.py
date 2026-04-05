from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sentry_sdk
import sys
import time
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional

from scripts.orion_local_worker_llm import (
    SUPPORTED_PROVIDERS,
    generate_chat_reply_stream_with_provider_fallback,
    generate_chat_reply_with_provider_fallback,
    get_claude_code_session_token,
    parse_json_object_loose,
    provider_has_key,
)
from server_modules import direct_chat_provider_service
from scripts.orion_local_worker_utils import build_operator_system_prompt
from server_modules import direct_chat_prompt_service
from server_modules import direct_chat_handoff_service
from server_modules import direct_chat_generation_service
from server_modules import direct_chat_routing_service
from server_modules import direct_chat_entry_service
from server_modules import direct_chat_response_service
from server_modules import direct_chat_runtime_service
from server_modules import direct_tool_approval_service
from server_modules import direct_tool_execution_service
from server_modules import memory_service
from server_modules import no_provider_service
from server_modules import runtime_config as runtime_config
from server_modules.provider_profiles import _build_provider_credential_candidates, normalize_auth_mode
from server_modules.local_queue import _is_worker_online
from server_modules.shared import LOCAL_WORKER_REGISTRY
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

from server_modules.memory_service import (
    delete_memory,
    get_memory_notebook_excerpt,
    get_memory,
    list_memory_entries,
    search_memory_notebook,
)
from server_modules.agent_turn import resolve_agent_turn_request
from server_modules.conversation_compaction import compact_conversation_history
from server_modules.llm_task import llm_task
from server_modules.session_transcript_store import save_session_transcript
from server_modules.web_tools import web_fetch, web_search
from server_modules.workspace_context import workspace_context_dir

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
SMTP_KEYWORDS = ("smtp", "generic email", "mail server", "imap")
TELEGRAM_KEYWORDS = ("telegram", "bot", "chat reply", "message on telegram")
SLACK_KEYWORDS = ("slack", "slack dm", "slack message", "post to slack", "send to slack")
DISCORD_KEYWORDS = ("discord", "discord dm", "discord message", "post to discord", "send to discord")
DROPBOX_KEYWORDS = ("dropbox", "dropbox folder", "shared link", "dropbox file")
S3_KEYWORDS = ("s3", "amazon s3", "bucket", "buckets", "presigned url", "object storage")
BROWSER_KEYWORDS = ("browser", "go to", "open page", "page title", "main heading", "click", "fill form")
CHAT_MAX_ITERATIONS_DEFAULT = 30
CHAT_MAX_ITERATIONS_CEILING = 100
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
LOCAL_COMPUTER_CONTROL_KEYWORDS = (
    "ocr",
    "screen text",
    "read the screen",
    "click at",
    "click the screen",
    "type text",
    "paste this",
    "copy to clipboard",
    "read clipboard",
    "write clipboard",
    "launch app",
    "open finder",
    "open mail",
    "applescript",
    "notification",
    "notify me",
    "list running apps",
    "speak this",
    "read this aloud",
    "say this",
)
LOGGER = logging.getLogger(__name__)


def _safe_positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        return int(default)
    return parsed if parsed > 0 else int(default)


def _resolved_chat_iteration_limit(explicit: Any = None) -> int:
    configured = _safe_positive_int(
        explicit,
        _safe_positive_int(os.getenv("ORION_MAX_CHAT_ITERATIONS", CHAT_MAX_ITERATIONS_DEFAULT), CHAT_MAX_ITERATIONS_DEFAULT),
    )
    return max(1, min(configured, CHAT_MAX_ITERATIONS_CEILING))


def _chat_iteration_limit_reply(limit: int) -> str:
    return (
        f"Reached maximum steps ({limit}). "
        "To continue, start a new run or increase ORION_MAX_CHAT_ITERATIONS."
    )
WEB_LOOKUP_KEYWORDS = (
    "latest",
    "today",
    "current",
    "look up",
    "lookup",
    "search the web",
    "search web",
    "online",
    "website",
    "web",
    "news",
)
HTTP_REQUEST_KEYWORDS = (
    "http request",
    "api request",
    "call the api",
    "call this api",
    "call this endpoint",
    "endpoint",
    "webhook",
    "rest api",
    "post to",
    "put to",
    "patch",
    "delete",
    "curl",
)
IMAGE_GENERATION_KEYWORDS = (
    "generate image",
    "create image",
    "make an image",
    "image prompt",
    "illustration",
    "render an image",
    "poster",
    "concept art",
)
LLM_TASK_KEYWORDS = (
    "analyze",
    "classify",
    "extract",
    "compare",
    "summarize",
    "rewrite",
    "convert",
)
COMPLEX_TASK_SEQUENCE_MARKERS = (
    " and then ",
    " then ",
    " after that ",
    " afterwards ",
    " next ",
    " finally ",
    " step by step",
    " end to end",
)
COMPLEX_TASK_OUTCOME_MARKERS = (
    "next steps",
    "plan",
    "report",
    "investigate",
    "debug",
    "fix",
    "compare",
    "audit",
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
MAX_DIRECT_CHAT_PRIOR_MESSAGES = 80
MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS = 4000
MAX_CONTEXT_TOOL_CAPABILITIES = 6
MAX_CONTEXT_TOOL_ACTIONS = 6
DIRECT_CHAT_RUN_HANDOFF_LIVE_WINDOW_SECONDS = 12.0
DIRECT_CHAT_RUN_HANDOFF_POLL_SECONDS = 0.25
DIRECT_CHAT_COMPACTION_TOKEN_LIMIT = 8000
DIRECT_CHAT_LOOP_REPEAT_LIMIT = 3
_DIRECT_CHAT_MEMORY_SYSTEM_PREFIX = (
    "Persistent workspace memory. Use this only as background context when it is relevant, "
    "and do not repeat it unless it helps answer the user.\n"
)
_DIRECT_CHAT_MEMORY_EXTRACTION_SYSTEM_PROMPT = (
    "You extract durable memory from a chat. Return only a JSON array of strings. "
    "Include stable user preferences, facts, and lasting project context that will be useful in future conversations. "
    "Do not include temporary task details, one-off requests, raw tool outputs, or assistant opinions."
)
_DIRECT_CHAT_MEMORY_EXTRACTION_PROMPT = (
    "What important facts about the user or their preferences were revealed in this conversation? "
    "Reply with a JSON list or empty list."
)
_DIRECT_CHAT_LOOP_REPLY = "I appear to be stuck in a loop. Please clarify what you want me to do."
_DIRECT_TOOL_LOOP_STATE: Dict[str, Dict[str, Any]] = {}
_DIRECT_CHAT_MODEL_PREFERENCES: Dict[str, Dict[str, Optional[str]]] = {}
_DIRECT_CHAT_CLEAR_MARKERS: set[str] = set()
_MEMORY_NOTEBOOK_TOOL_NAMES = {"memory_search", "memory_get"}


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _build_direct_chat_system_prompt(
    *,
    workspace_id: str,
    availability: Dict[str, Any],
    tools: List[Dict[str, Any]],
) -> Optional[str]:
    return direct_chat_prompt_service.build_system_prompt(
        workspace_id=workspace_id,
        availability=availability,
        tools=tools,
        availability_lines=_availability_lines,
        build_operator_system_prompt=build_operator_system_prompt,
        memory_tool_names=_MEMORY_NOTEBOOK_TOOL_NAMES,
    )


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
    runtime_ok = availability.get("runtime_ok")
    if isinstance(runtime_ok, bool):
        return runtime_ok
    return True


def _agent_machine_owner_user_id(session_ctx: Optional[Dict[str, Any]]) -> str:
    context = session_ctx if isinstance(session_ctx, dict) else {}
    meta = context.get("meta") if isinstance(context.get("meta"), dict) else {}
    return (
        str(context.get("user_id") or "").strip()
        or str(meta.get("owner_user_id") or "").strip()
        or str(meta.get("user_id") or "").strip()
    )


def _agent_machine_full_trust_for_session(session_ctx: Optional[Dict[str, Any]]) -> bool:
    return runtime_config.agent_machine_full_trust_enabled(_agent_machine_owner_user_id(session_ctx))


def _direct_chat_runtime_available() -> bool:
    return direct_chat_provider_service.direct_chat_runtime_available(
        LOCAL_WORKER_REGISTRY,
        is_worker_online_fn=_is_worker_online,
    )


def _resolve_direct_chat_availability(
    workspace_id: str,
    requested_provider: str = "",
    availability_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return direct_chat_provider_service.resolve_direct_chat_availability(
        workspace_id,
        requested_provider,
        direct_chat_runtime_available_fn=_direct_chat_runtime_available,
        preferred_provider_fn=_preferred_provider,
        supports_direct_message_native_chat_fn=_supports_direct_message_native_chat,
        resolve_workspace_tool_capabilities_fn=resolve_workspace_tool_capabilities,
        availability_override=availability_override,
    )


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


def _direct_tool_session_key(workspace_id: str, thread_id: str) -> str:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_thread_id = str(thread_id or "").strip() or "direct-chat"
    return f"{normalized_workspace_id}:{normalized_thread_id}"


def _direct_chat_session_key(workspace_id: str, thread_id: str) -> str:
    return _direct_tool_session_key(workspace_id, thread_id)


def _parse_slash_command(message: str) -> Dict[str, str]:
    normalized = str(message or "").strip()
    if not normalized.startswith("/"):
        return {}
    tokens = normalized.split()
    if not tokens:
        return {}
    command = tokens[0][1:].strip().lower()
    remainder = normalized[len(tokens[0]):].strip()
    return {
        "command": command,
        "remainder": remainder,
    }


def _session_model_preference(session_key: str) -> Dict[str, Optional[str]]:
    stored = _DIRECT_CHAT_MODEL_PREFERENCES.get(session_key)
    if not isinstance(stored, dict):
        return {"provider": None, "model": None}
    return {
        "provider": str(stored.get("provider") or "").strip() or None,
        "model": str(stored.get("model") or "").strip() or None,
    }


def _set_session_model_preference(session_key: str, *, provider: Optional[str], model: Optional[str]) -> None:
    _DIRECT_CHAT_MODEL_PREFERENCES[session_key] = {
        "provider": str(provider or "").strip() or None,
        "model": str(model or "").strip() or None,
    }


def _mark_thread_cleared(session_key: str) -> None:
    _DIRECT_CHAT_CLEAR_MARKERS.add(session_key)


def _consume_thread_cleared(session_key: str) -> bool:
    if session_key not in _DIRECT_CHAT_CLEAR_MARKERS:
        return False
    _DIRECT_CHAT_CLEAR_MARKERS.discard(session_key)
    return True


def _connected_provider_tokens(workspace_id: str) -> List[str]:
    return direct_chat_provider_service.connected_provider_tokens(
        workspace_id,
        supported_providers=SUPPORTED_PROVIDERS,
        direct_chat_credentials_fn=_direct_chat_credentials,
    )


def _resolve_provider_for_direct_chat_message(
    workspace_id: str,
    requested_provider: str,
    message: str,
    *,
    tools_present: bool,
) -> tuple[str, Dict[str, Any]]:
    return direct_chat_provider_service.resolve_provider_for_direct_chat_message(
        workspace_id,
        requested_provider,
        message,
        tools_present=tools_present,
        preferred_provider_fn=_preferred_provider,
        direct_chat_credentials_fn=_direct_chat_credentials,
        supports_direct_message_native_chat_fn=_supports_direct_message_native_chat,
        compact_text_fn=_compact_text,
        mentions_any_fn=_mentions_any,
        message_requests_local_file_tool_fn=_message_requests_local_file_tool,
        message_requests_local_shell_tool_fn=_message_requests_local_shell_tool,
        message_requests_local_screenshot_tool_fn=_message_requests_local_screenshot_tool,
        message_requests_local_computer_tool_fn=_message_requests_local_computer_tool,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
    )


def _plan_direct_chat_route(
    *,
    message: str,
    availability: Dict[str, Any],
    provider: str,
    tools: List[Dict[str, Any]],
) -> direct_chat_routing_service.DirectChatRouteDecision:
    return direct_chat_routing_service.plan_direct_chat_route(
        message=message,
        availability=availability,
        provider=provider,
        tools=tools,
        compact_text_fn=_compact_text,
        mentions_any_fn=_mentions_any,
        is_obvious_smtp_write_request_fn=_is_obvious_smtp_write_request,
        preview_run_response_fn=_preview_run_response,
        prefer_durable_run_handoff_fn=_prefer_durable_run_handoff,
        durable_run_preferred_response_fn=_durable_run_preferred_response,
        message_can_use_direct_connector_tools_fn=lambda message: _message_can_use_direct_connector_tools(
            message,
            provider=provider,
            tools=tools,
        ),
        message_can_use_direct_local_tools_fn=lambda message: _message_can_use_direct_local_tools(
            message,
            provider=provider,
            tools=tools,
        ),
        message_can_use_builtin_direct_tools_fn=lambda message: _message_can_use_builtin_direct_tools(
            message,
            tools=tools,
        ),
        can_auto_start_run_handoff_fn=_can_auto_start_run_handoff,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        discord_keywords=DISCORD_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
    )


def _active_run_count(workspace_id: str) -> int:
    try:
        from server_modules.shared import runs as live_runs
    except Exception:
        return 0
    total = 0
    for run in list(live_runs.values()) if isinstance(live_runs, dict) else []:
        if not isinstance(run, dict):
            continue
        status = str(run.get("status") or "").strip().lower()
        if status in {"completed", "failed", "timeout", "stopped", "cancelled"}:
            continue
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        run_workspace_id = str(context.get("workspace_id") or "").strip() or "default"
        if run_workspace_id == workspace_id:
            total += 1
    return total


def _slash_command_help_text() -> str:
    return (
        "Available commands:\n"
        "/status\n"
        "/memory\n"
        "/forget <key>\n"
        "/model <name>\n"
        "/clear\n"
        "/help\n\n"
        "Built-in tools when relevant:\n"
        "memory_search / memory_get\n"
        "web search\n"
        "web fetch\n"
        "http_request\n"
        "generate_image\n"
        "browser navigate / screenshot / click / fill / get_page_state\n"
        "computer ocr / click / type / applescript / clipboard / notify / list_apps / launch_app / speak"
    )


def _tool_call_signature(tool_call: Dict[str, Any]) -> str:
    name = str(tool_call.get("name") or "").strip()
    argument_payload = _tool_arguments_payload(tool_call.get("arguments"))
    if "__" in name:
        connector_id, _action_id = _parse_tool_name(name)
        if connector_id in {"file", "shell", "screenshot", "computer"} and isinstance(argument_payload.get("input"), str):
            nested_input = parse_json_object_loose(str(argument_payload.get("input") or ""))
            if isinstance(nested_input, dict):
                argument_payload = nested_input
    try:
        normalized_payload = json.dumps(argument_payload, sort_keys=True, ensure_ascii=False)
    except Exception:
        normalized_payload = str(argument_payload)
    return f"{name}:{normalized_payload}"


def _record_direct_tool_signature(session_key: str, tool_call: Dict[str, Any]) -> bool:
    signature = _tool_call_signature(tool_call)
    state = _DIRECT_TOOL_LOOP_STATE.get(session_key) or {"signature": "", "count": 0}
    if state.get("signature") == signature:
        state["count"] = int(state.get("count") or 0) + 1
    else:
        state = {"signature": signature, "count": 1}
    _DIRECT_TOOL_LOOP_STATE[session_key] = state
    return int(state.get("count") or 0) >= DIRECT_CHAT_LOOP_REPEAT_LIMIT


def _clear_direct_tool_loop_state(session_key: str) -> None:
    _DIRECT_TOOL_LOOP_STATE.pop(session_key, None)


def _direct_chat_memory_context_message(workspace_id: str) -> Optional[Dict[str, str]]:
    return memory_service.direct_chat_memory_context_message(
        workspace_id,
        system_prefix=_DIRECT_CHAT_MEMORY_SYSTEM_PREFIX,
    )


def _direct_chat_workspace_context_text(workspace_id: str, *, memory_query: str = "") -> str:
    return memory_service.direct_chat_workspace_context_text(workspace_id, memory_query=memory_query)


def _build_direct_chat_daily_log_summary(*, user_message: str, assistant_reply: str) -> str:
    return memory_service.build_direct_chat_daily_log_summary(
        user_message=user_message,
        assistant_reply=assistant_reply,
    )


def _persist_direct_chat_memory_best_effort(
    *,
    workspace_id: str,
    provider: Optional[str],
    model: Optional[str],
    credentials: Optional[Dict[str, Any]],
    reasoning_effort: str,
    prior_messages: List[Dict[str, str]],
    user_message: str,
    assistant_reply: str,
) -> None:
    memory_service.persist_direct_chat_memory_best_effort(
        workspace_id=workspace_id,
        provider=provider,
        model=model,
        credentials=credentials,
        reasoning_effort=reasoning_effort,
        prior_messages=prior_messages,
        user_message=user_message,
        assistant_reply=assistant_reply,
        generate_reply=generate_chat_reply_with_provider_fallback,
        extraction_prompt=_DIRECT_CHAT_MEMORY_EXTRACTION_PROMPT,
        extraction_system_prompt=_DIRECT_CHAT_MEMORY_EXTRACTION_SYSTEM_PROMPT,
    )


def _persist_direct_chat_transcript_best_effort(
    *,
    workspace_id: str,
    thread_id: str,
    provider: Optional[str],
    model: Optional[str],
    messages: List[Dict[str, str]],
    user_message: str,
    assistant_reply: str,
) -> None:
    try:
        save_session_transcript(
            workspace_id=workspace_id,
            thread_id=thread_id,
            provider=provider,
            model=model,
            messages=messages,
            user_message=user_message,
            assistant_reply=assistant_reply,
        )
    except Exception:
        return


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


def _open_action(label: str, href: str, *, variant: str = "primary") -> Dict[str, Any]:
    return {
        "id": f"open:{href}",
        "kind": "open",
        "label": label,
        "href": href,
        "variant": variant,
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


def _is_obvious_smtp_write_request(compact_message: str) -> bool:
    if not compact_message or _question_like(compact_message):
        return False
    if "send an email" in compact_message or "send email" in compact_message:
        return True
    return _mentions_any(compact_message, SMTP_KEYWORDS) and _starts_like_direct_run(compact_message)


def _connector_write_preview_allowed(message: str, availability: Dict[str, Any]) -> bool:
    compact = _compact_text(message)
    if _is_obvious_telegram_write_request(compact):
        return _tool_runtime_usable(availability, "telegram_bot") is True
    if _is_obvious_google_write_request(compact):
        return (
            _tool_runtime_usable(availability, "google_workspace") is True
            or (_is_obvious_smtp_write_request(compact) and _tool_runtime_usable(availability, "smtp") is True)
        )
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
    if _is_obvious_smtp_write_request(compact) and not _tool_connected(availability, "google_workspace") and not _tool_connected(availability, "smtp"):
        return {
            "reply": "No email connector is connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=smtp")],
            "mode": "connect",
        }
    if _is_obvious_smtp_write_request(compact) and _tool_runtime_usable(availability, "google_workspace") is not True and _tool_runtime_usable(availability, "smtp") is False:
        return {
            "reply": "An email connector is connected here, but it is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if _is_obvious_smtp_write_request(compact) and _tool_runtime_usable(availability, "google_workspace") is not True and _tool_runtime_usable(availability, "smtp") is not True and _tool_connected(availability, "smtp"):
        return {
            "reply": "SMTP is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and not _is_obvious_smtp_write_request(compact) and not _tool_connected(availability, "google_workspace"):
        return {
            "reply": "Google Workspace is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=google_workspace")],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and not _is_obvious_smtp_write_request(compact) and _tool_runtime_usable(availability, "google_workspace") is False:
        return {
            "reply": "Google Workspace is connected here, but is not usable right now.",
            "actions": [_google_repair_action()],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and not _is_obvious_smtp_write_request(compact) and _tool_runtime_usable(availability, "google_workspace") is not True:
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
    if _mentions_any(compact, SLACK_KEYWORDS) and not _tool_connected(availability, "slack"):
        return {
            "reply": "Slack is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=slack")],
            "mode": "connect",
        }
    if _mentions_any(compact, SLACK_KEYWORDS) and _tool_runtime_usable(availability, "slack") is False:
        return {
            "reply": "Slack is connected here, but is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, SLACK_KEYWORDS) and _tool_runtime_usable(availability, "slack") is not True:
        return {
            "reply": "Slack is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, DROPBOX_KEYWORDS) and not _tool_connected(availability, "dropbox"):
        return {
            "reply": "Dropbox is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=dropbox")],
            "mode": "connect",
        }
    if _mentions_any(compact, DROPBOX_KEYWORDS) and _tool_runtime_usable(availability, "dropbox") is False:
        return {
            "reply": "Dropbox is connected here, but is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, DROPBOX_KEYWORDS) and _tool_runtime_usable(availability, "dropbox") is not True:
        return {
            "reply": "Dropbox is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, S3_KEYWORDS) and not _tool_connected(availability, "s3"):
        return {
            "reply": "Amazon S3 is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=s3")],
            "mode": "connect",
        }
    if _mentions_any(compact, S3_KEYWORDS) and _tool_runtime_usable(availability, "s3") is False:
        return {
            "reply": "Amazon S3 is connected here, but is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, S3_KEYWORDS) and _tool_runtime_usable(availability, "s3") is not True:
        return {
            "reply": "Amazon S3 is connected here, but its capability state is not verified right now.",
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
    if _is_obvious_smtp_write_request(compact) and _tool_runtime_usable(availability, "smtp") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, SLACK_KEYWORDS) and _tool_runtime_usable(availability, "slack") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, DROPBOX_KEYWORDS) and _tool_runtime_usable(availability, "dropbox") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, S3_KEYWORDS) and _tool_runtime_usable(availability, "s3") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, EXECUTION_MARKERS) and not _question_like(compact):
        actions.append(_run_action(message))
    return actions


def _heartbeat_pending_tasks_for_suggestions() -> List[str]:
    try:
        from server_modules.heartbeat import parse_unchecked_heartbeat_tasks
    except Exception:
        return []
    heartbeat_path = workspace_context_dir() / "HEARTBEAT.md"
    if not heartbeat_path.exists():
        return []
    try:
        text = heartbeat_path.read_text(encoding="utf-8")
    except Exception:
        return []
    return parse_unchecked_heartbeat_tasks(text)[:3]


def _recent_run_prompts_for_suggestions(workspace_id: str) -> List[str]:
    try:
        from server_modules.shared import RUN_HISTORY, RUN_HISTORY_LOCK
    except Exception:
        return []
    prompts: List[str] = []
    seen: set[str] = set()
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    with RUN_HISTORY_LOCK:
        history_items = list(RUN_HISTORY)
    for item in history_items:
        if not isinstance(item, dict):
            continue
        if str(item.get("workspace_id") or "").strip() != normalized_workspace_id:
            continue
        goal = re.sub(r"\s+", " ", str(item.get("user_goal") or "").strip())
        if len(goal) < 12:
            continue
        key = goal.lower()
        if key in seen:
            continue
        seen.add(key)
        prompts.append(goal)
        if len(prompts) >= 3:
            break
    return prompts


def _build_proactive_suggestions(workspace_id: str) -> List[str]:
    return direct_chat_prompt_service.build_proactive_suggestions(
        workspace_id,
        heartbeat_tasks=_heartbeat_pending_tasks_for_suggestions,
        recent_run_prompts=_recent_run_prompts_for_suggestions,
        memory_suggestion_prompts=lambda target_workspace_id: memory_service.memory_suggestion_prompts(
            target_workspace_id,
            limit=2,
        ),
    )


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


def _action_marker_count(compact_message: str) -> int:
    if not compact_message:
        return 0
    count = 0
    for marker in EXECUTION_MARKERS:
        if re.search(rf"\b{re.escape(marker)}\b", compact_message):
            count += 1
    return count


def _path_like_reference_count(message: str) -> int:
    if not message:
        return 0
    return len(
        re.findall(
            r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])\S+",
            str(message),
            flags=re.IGNORECASE,
        )
    )


def _prefer_durable_run_handoff(message: str, availability: Dict[str, Any]) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    if not isinstance(availability, dict) or not bool(availability.get("ai_ready")):
        return False
    connection_mode = str(availability.get("connection_mode") or "").strip().lower()

    local_file = _message_requests_local_file_tool(message)
    local_shell = _message_requests_local_shell_tool(message)
    local_screenshot = _message_requests_local_screenshot_tool(message)
    local_request_count = sum(1 for flag in (local_file, local_shell, local_screenshot) if flag)
    sequence_requested = any(marker in compact for marker in COMPLEX_TASK_SEQUENCE_MARKERS)
    outcome_requested = any(marker in compact for marker in COMPLEX_TASK_OUTCOME_MARKERS)
    path_reference_count = _path_like_reference_count(message)
    action_count = _action_marker_count(compact)
    if local_request_count <= 0:
        return connection_mode in {"local_companion", "byok"} and outcome_requested and action_count >= 1 and len(compact) >= 40

    mixes_connector_work = (
        _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS)
        or _mentions_any(compact, TELEGRAM_KEYWORDS)
        or _mentions_any(compact, SLACK_KEYWORDS)
        or _mentions_any(compact, DROPBOX_KEYWORDS)
        or _mentions_any(compact, S3_KEYWORDS)
    )

    if local_request_count >= 2:
        return True
    if path_reference_count >= 2:
        return True
    if mixes_connector_work:
        return True
    if sequence_requested and (action_count >= 2 or len(compact) >= 110):
        return True
    if outcome_requested and (sequence_requested or action_count >= 2):
        return True
    return False


def _durable_run_preferred_response(message: str) -> Dict[str, Any]:
    return direct_chat_handoff_service.durable_run_preferred_response(
        message,
        run_action_fn=_run_action,
    )


def _run_handoff_execution_target(availability: Dict[str, Any]) -> str:
    return direct_chat_handoff_service.run_handoff_execution_target(availability)


def _can_auto_start_run_handoff(availability: Dict[str, Any]) -> bool:
    return direct_chat_handoff_service.can_auto_start_run_handoff(availability)


def _direct_chat_run_handoff_failure_payload(message: str, error_detail: str) -> Dict[str, Any]:
    return direct_chat_handoff_service.direct_chat_run_handoff_failure_payload(
        message,
        error_detail,
        run_action_fn=_run_action,
    )


def _start_direct_chat_run_handoff(
    *,
    message: str,
    workspace_id: str,
    requested_provider: str,
    requested_model: str,
    thread_id: str,
    availability: Dict[str, Any],
    max_iterations: Optional[int] = None,
) -> Dict[str, Any]:
    from server_modules.runs_delegation import _create_run_from_request
    from server_modules.runtime_models import RunStartRequest

    return direct_chat_handoff_service.start_direct_chat_run_handoff(
        message=message,
        workspace_id=workspace_id,
        requested_provider=requested_provider,
        requested_model=requested_model,
        thread_id=thread_id,
        availability=availability,
        max_iterations=max_iterations,
        create_run_from_request_fn=_create_run_from_request,
        run_start_request_cls=RunStartRequest,
        safe_positive_int_fn=_safe_positive_int,
    )


def _direct_chat_run_handoff_reply(started: Dict[str, Any]) -> Dict[str, Any]:
    return direct_chat_handoff_service.direct_chat_run_handoff_reply(
        started,
        open_action_fn=_open_action,
    )


def _direct_chat_run_actions(run_id: str, *, waiting_for_confirmation: bool = False) -> List[Dict[str, Any]]:
    return direct_chat_handoff_service.direct_chat_run_actions(
        run_id,
        waiting_for_confirmation=waiting_for_confirmation,
        open_action_fn=_open_action,
    )


def _direct_chat_run_snapshot(run_id: str) -> tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    from server_modules.runs_delegation import _lookup_run_snapshot
    from server_modules.runs_output import _serialize_run_snapshot
    from server_modules.shared import runs

    return direct_chat_handoff_service.direct_chat_run_snapshot(
        run_id,
        runs_mapping=runs,
        lookup_run_snapshot_fn=_lookup_run_snapshot,
        serialize_run_snapshot_fn=_serialize_run_snapshot,
    )


def _direct_chat_run_event_to_step(run_id: str, event: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    return direct_chat_handoff_service.direct_chat_run_event_to_step(run_id, event)


def _direct_chat_run_snapshot_to_step(run_id: str, snapshot: Dict[str, Any]) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    return direct_chat_handoff_service.direct_chat_run_snapshot_to_step(run_id, snapshot)


def _direct_chat_run_final_payload(
    *,
    run_id: str,
    run: Optional[Dict[str, Any]],
    snapshot: Dict[str, Any],
    requested_workspace_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    fallback_reason: Optional[str],
    reply_override: Optional[str] = None,
    continuing: bool = False,
) -> Dict[str, Any]:
    return direct_chat_handoff_service.direct_chat_run_final_payload(
        run_id=run_id,
        run=run,
        snapshot=snapshot,
        requested_workspace_id=requested_workspace_id,
        requested_provider=requested_provider,
        requested_model=requested_model,
        reasoning_effort=reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        fallback_reason=fallback_reason,
        reply_override=reply_override,
        continuing=continuing,
        build_context_used_fn=_build_context_used,
        open_action_fn=_open_action,
    )


def _stream_direct_chat_run_handoff(
    *,
    started_run: Dict[str, Any],
    requested_workspace_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    fallback_reason: Optional[str],
) -> Iterator[Dict[str, Any]]:
    yield from direct_chat_handoff_service.stream_direct_chat_run_handoff(
        started_run=started_run,
        requested_workspace_id=requested_workspace_id,
        requested_provider=requested_provider,
        requested_model=requested_model,
        reasoning_effort=reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        fallback_reason=fallback_reason,
        direct_chat_run_snapshot_fn=_direct_chat_run_snapshot,
        direct_chat_run_event_to_step_fn=_direct_chat_run_event_to_step,
        direct_chat_run_snapshot_to_step_fn=_direct_chat_run_snapshot_to_step,
        direct_chat_run_final_payload_fn=_direct_chat_run_final_payload,
        open_action_fn=_open_action,
        build_context_used_fn=_build_context_used,
        live_window_seconds=DIRECT_CHAT_RUN_HANDOFF_LIVE_WINDOW_SECONDS,
        poll_seconds=DIRECT_CHAT_RUN_HANDOFF_POLL_SECONDS,
        monotonic_fn=time.monotonic,
        sleep_fn=time.sleep,
    )


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
            "parameters": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer"},
                    "y": {"type": "integer"},
                    "text": {"type": "string"},
                },
            },
        },
        {
            "name": "computer__type",
            "description": "Type text into the active application",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                },
                "required": ["text"],
            },
        },
        {
            "name": "computer__applescript",
            "description": "Run AppleScript on macOS",
            "parameters": {
                "type": "object",
                "properties": {
                    "script": {"type": "string"},
                },
                "required": ["script"],
            },
        },
        {
            "name": "computer__clipboard_read",
            "description": "Read the current system clipboard",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "computer__clipboard_write",
            "description": "Write text to the system clipboard",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                },
                "required": ["text"],
            },
        },
        {
            "name": "computer__notify",
            "description": "Send a system notification",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "message": {"type": "string"},
                },
                "required": ["title", "message"],
            },
        },
        {
            "name": "computer__list_apps",
            "description": "List running applications and processes",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "computer__launch_app",
            "description": "Launch an application by name or path",
            "parameters": {
                "type": "object",
                "properties": {
                    "name_or_path": {"type": "string"},
                },
                "required": ["name_or_path"],
            },
        },
        {
            "name": "computer__speak",
            "description": "Speak text aloud using the local system voice",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "voice": {"type": "string"},
                },
                "required": ["text"],
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


def _build_builtin_direct_chat_tools() -> List[Dict[str, Any]]:
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
            "description": (
                "Read a small excerpt from MEMORY.md or memory/*.md after memory_search identifies the file and lines."
            ),
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
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query to run."},
                },
                "required": ["query"],
            },
        },
        {
            "name": "web__fetch",
            "description": "Fetch a webpage and extract readable text from it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to fetch."},
                },
                "required": ["url"],
            },
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
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to open."},
                },
                "required": ["url"],
            },
        },
        {
            "name": "browser__screenshot",
            "description": "Capture a screenshot from the backend browser engine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "Optional CSS/XPath/text selector."},
                },
            },
        },
        {
            "name": "browser__observe",
            "description": "Return the current browser page state plus a screenshot for vision-style reasoning.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "browser__click",
            "description": "Click an element in the backend browser engine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS, XPath, or visible text selector."},
                },
                "required": ["selector"],
            },
        },
        {
            "name": "browser__fill",
            "description": "Fill an input in the backend browser engine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["selector", "value"],
            },
        },
        {
            "name": "browser__extract_text",
            "description": "Extract readable text from the current page or a selected element.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {"type": "string"},
                },
            },
        },
        {
            "name": "browser__get_page_state",
            "description": "Return the current page title, URL, text preview, and interactive elements.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "browser__execute_js",
            "description": "Execute JavaScript in the active browser tab.",
            "parameters": {
                "type": "object",
                "properties": {
                    "script": {"type": "string"},
                },
                "required": ["script"],
            },
        },
        {
            "name": "browser__new_tab",
            "description": "Open a new browser tab.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                },
            },
        },
        {
            "name": "browser__switch_tab",
            "description": "Switch to another browser tab.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tab_id": {"type": "integer"},
                },
                "required": ["tab_id"],
            },
        },
        {
            "name": "browser__download_file",
            "description": "Download a file through the backend browser engine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "save_path": {"type": "string"},
                },
                "required": ["url"],
            },
        },
        {
            "name": "browser__start_intercept",
            "description": "Start capturing browser network responses matching a URL pattern.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url_pattern": {"type": "string"},
                },
            },
        },
        {
            "name": "browser__stop_intercept",
            "description": "Stop browser network interception and return the captured responses.",
            "parameters": {"type": "object", "properties": {}},
        },
        {
            "name": "browser__pdf",
            "description": "Print the current browser page to PDF.",
            "parameters": {
                "type": "object",
                "properties": {
                    "output_path": {"type": "string"},
                },
            },
        },
    ]


def registered_direct_chat_tool_names_for_logging() -> List[str]:
    tool_names = {
        str(item.get("name") or "").strip()
        for item in (
            _build_builtin_direct_chat_tools()
            + _build_local_direct_chat_tools({"runtime_ok": True})
        )
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    }
    return sorted(tool_names)


def _message_requests_http_request_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    if bool(re.search(r"https?://", str(message or ""), flags=re.IGNORECASE)):
        return True
    return _mentions_any(compact, HTTP_REQUEST_KEYWORDS)


def _message_requests_image_generation_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    return _mentions_any(compact, IMAGE_GENERATION_KEYWORDS)


def _message_requests_browser_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    if _extract_first_path_reference(message) and any(
        token in compact for token in ("read", "open", "show", "what's in", "whats in", "count", "how many")
    ):
        return False
    if _extract_first_url(message) and (
        _mentions_any(compact, BROWSER_KEYWORDS)
        or any(token in compact for token in ("go to", "open", "title", "heading"))
    ):
        return True
    return _mentions_any(compact, BROWSER_KEYWORDS)


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
        if any(str(item.get("name") or "").startswith("google_workspace__") for item in tools):
            return True
        if _is_obvious_smtp_write_request(compact):
            return any(str(item.get("name") or "").startswith("smtp__") for item in tools)
        return False
    if _mentions_any(compact, SMTP_KEYWORDS) or _is_obvious_smtp_write_request(compact):
        return any(str(item.get("name") or "").startswith("smtp__") for item in tools)
    if _mentions_any(compact, TELEGRAM_KEYWORDS):
        return any(str(item.get("name") or "").startswith("telegram_bot__") for item in tools)
    if _mentions_any(compact, SLACK_KEYWORDS):
        return any(str(item.get("name") or "").startswith("slack__") for item in tools)
    if _mentions_any(compact, DISCORD_KEYWORDS):
        return any(str(item.get("name") or "").startswith("discord_bot__") for item in tools)
    if _mentions_any(compact, DROPBOX_KEYWORDS):
        return any(str(item.get("name") or "").startswith("dropbox__") for item in tools)
    if _mentions_any(compact, S3_KEYWORDS):
        return any(str(item.get("name") or "").startswith("s3__") for item in tools)
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


def _message_requests_local_computer_tool(message: str) -> bool:
    compact = _compact_text(message)
    if not compact or _question_like(compact):
        return False
    return _mentions_any(compact, LOCAL_COMPUTER_CONTROL_KEYWORDS)


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
    if _message_requests_local_computer_tool(message) and any(name.startswith("computer__") for name in tool_names):
        return True
    return False


def _message_can_use_builtin_direct_tools(
    message: str,
    *,
    tools: List[Dict[str, Any]],
) -> bool:
    compact = _compact_text(message)
    if not compact or not tools:
        return False
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    if {"web__search", "web__fetch"} & tool_names:
        if _mentions_any(compact, WEB_LOOKUP_KEYWORDS) or bool(re.search(r"https?://", str(message or ""), flags=re.IGNORECASE)):
            return True
    if "http_request" in tool_names and _message_requests_http_request_tool(message):
        return True
    if "generate_image" in tool_names and _message_requests_image_generation_tool(message):
        return True
    if any(name.startswith("browser__") for name in tool_names) and _message_requests_browser_tool(message):
        return True
    if "llm__task" in tool_names and _mentions_any(compact, LLM_TASK_KEYWORDS):
        return True
    return False


def _parse_tool_name(tool_name: str) -> tuple[str, str]:
    token = str(tool_name or "").strip()
    if token == "http_request":
        return "http", "request"
    if token == "generate_image":
        return "image", "generate"
    if token == "memory_search":
        return "memory", "search"
    if token == "memory_get":
        return "memory", "get"
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

    if connector_id == "slack":
        for key in ("channel", "channel_id", "user_id", "recipient_id", "thread_ts", "title", "file_path", "path"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        if action_id in {"send_message", "send_dm", "post_reply"}:
            config["text"] = str(
                parsed_input.get("body")
                or parsed_input.get("message")
                or parsed_input.get("content")
                or tool_input
            ).strip()
        if action_id in {"list_channels", "get_history"}:
            try:
                limit = int(parsed_input.get("limit") or 20)
            except Exception:
                limit = 20
            config["limit"] = max(1, min(limit, 200))
        return config

    if connector_id == "discord_bot":
        for key in ("channel_id", "guild_id", "user_id", "message_id", "emoji", "name", "title", "file_path", "path"):
            value = str(parsed_input.get(key) or "").strip()
            if value:
                config[key] = value
        files = parsed_input.get("files")
        if isinstance(files, list) and files:
            config["files"] = files
        embeds = parsed_input.get("embeds")
        if isinstance(embeds, list) and embeds:
            config["embeds"] = embeds
        if action_id in {"send_message", "send_dm", "edit_message", "send_embed"}:
            config["text"] = str(
                parsed_input.get("body")
                or parsed_input.get("message")
                or parsed_input.get("content")
                or tool_input
            ).strip()
        if action_id in {"list_guilds", "list_members", "get_message_history"}:
            try:
                limit = int(parsed_input.get("limit") or 20)
            except Exception:
                limit = 20
            config["limit"] = max(1, min(limit, 100))
        return config

    if connector_id == "smtp" and action_id in {"send_email", "send_message"}:
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

    if connector_id == "smtp" and action_id == "fetch_emails":
        folder = str(parsed_input.get("folder") or "INBOX").strip() or "INBOX"
        try:
            limit = int(parsed_input.get("limit") or 10)
        except Exception:
            limit = 10
        config["folder"] = folder
        config["limit"] = max(1, min(limit, 50))
        if parsed_input.get("unread_only") is not None:
            config["unread_only"] = bool(parsed_input.get("unread_only"))
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
    if connector_id == "computer":
        if action_id == "ocr":
            return "computer", {
                "action": "ocr",
                "region": arguments.get("region"),
                "summary": "Read screen text with OCR.",
            }
        if action_id == "click":
            has_text = bool(str(arguments.get("text") or "").strip())
            has_coords = arguments.get("x") is not None and arguments.get("y") is not None
            if not has_text and not has_coords:
                raise RuntimeError("Tool 'computer__click' requires x/y or text.")
            return "computer", {
                "action": "click",
                "x": arguments.get("x"),
                "y": arguments.get("y"),
                "text": str(arguments.get("text") or "").strip() or None,
                "summary": "Click on the screen.",
            }
        if action_id == "type":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Tool 'computer__type' requires text.")
            return "computer", {
                "action": "type",
                "text": text,
                "summary": "Type into the active application.",
            }
        if action_id == "applescript":
            script = str(arguments.get("script") or arguments.get("input") or "").strip()
            if not script:
                raise RuntimeError("Tool 'computer__applescript' requires a script.")
            return "computer", {
                "action": "applescript",
                "script": script,
                "summary": "Run AppleScript.",
            }
        if action_id == "clipboard_read":
            return "computer", {
                "action": "clipboard_read",
                "summary": "Read the system clipboard.",
            }
        if action_id == "clipboard_write":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Tool 'computer__clipboard_write' requires text.")
            return "computer", {
                "action": "clipboard_write",
                "text": text,
                "summary": "Write to the system clipboard.",
            }
        if action_id == "notify":
            title = str(arguments.get("title") or "").strip()
            message = str(arguments.get("message") or arguments.get("text") or "").strip()
            if not title or not message:
                raise RuntimeError("Tool 'computer__notify' requires title and message.")
            return "computer", {
                "action": "notify",
                "title": title,
                "message": message,
                "summary": "Send a system notification.",
            }
        if action_id == "list_apps":
            return "computer", {
                "action": "list_apps",
                "summary": "List running applications.",
            }
        if action_id == "launch_app":
            name_or_path = str(arguments.get("name_or_path") or arguments.get("input") or "").strip()
            if not name_or_path:
                raise RuntimeError("Tool 'computer__launch_app' requires name_or_path.")
            return "computer", {
                "action": "launch_app",
                "name_or_path": name_or_path,
                "summary": f"Launch application: {name_or_path}",
            }
        if action_id == "speak":
            text = str(arguments.get("text") or arguments.get("input") or "").strip()
            if not text:
                raise RuntimeError("Tool 'computer__speak' requires text.")
            voice = str(arguments.get("voice") or "").strip()
            return "computer", {
                "action": "speak",
                "text": text,
                "voice": voice or None,
                "summary": "Speak text aloud.",
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
    if normalized_connector_id == "computer":
        return normalized_action_id in {
            "ocr",
            "click",
            "type",
            "applescript",
            "clipboard_read",
            "clipboard_write",
            "notify",
            "list_apps",
            "launch_app",
            "speak",
        }
    if normalized_connector_id == "http":
        return normalized_action_id == "request"
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
    if connector_id in {"file", "shell", "screenshot", "http", "computer"}:
        parsed_input = parse_json_object_loose(raw_input)
        arguments = parsed_input if isinstance(parsed_input, dict) else ({} if connector_id == "screenshot" else {"input": raw_input})
    else:
        arguments = {"input": raw_input}
    tool_name = f"{approved_action['connector']}__{approved_action['action']}"
    if connector_id == "http" and str(approved_action.get("action") or "").strip() == "request":
        tool_name = "http_request"
    return {
        "name": tool_name,
        "arguments": json.dumps(arguments, ensure_ascii=False),
    }


def _run_async_tool_call(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError as exc:
        if "asyncio.run() cannot be called from a running event loop" not in str(exc):
            raise

    import threading

    result: Dict[str, Any] = {}
    failure: Dict[str, BaseException] = {}

    def _runner() -> None:
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as err:  # pragma: no cover
            failure["error"] = err

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if "error" in failure:
        raise failure["error"]
    return result.get("value")


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

    if tool_name == "computer_control":
        computer_action = str(first_action.get("computer_action") or "").strip().lower()
        if computer_action == "ocr":
            preview = str(first_action.get("text_preview") or "").strip()
            return "\n".join(part for part in ["Screen OCR completed.", preview] if part).strip()
        if computer_action == "click":
            return summary or "Screen click completed."
        if computer_action == "type":
            return summary or "Typing completed."
        if computer_action == "applescript":
            output = str(first_action.get("output_preview") or "").strip()
            return "\n".join(part for part in ["AppleScript completed.", output] if part).strip()
        if computer_action == "clipboard_read":
            preview = str(first_action.get("text_preview") or "").strip()
            return "\n".join(part for part in ["Clipboard read completed.", preview] if part).strip()
        if computer_action == "clipboard_write":
            return summary or "Clipboard updated."
        if computer_action == "notify":
            return summary or "Notification sent."
        if computer_action == "list_apps":
            apps_preview = str(first_action.get("apps_preview") or "").strip()
            return "\n".join(part for part in ["Listed running apps.", apps_preview] if part).strip()
        if computer_action == "launch_app":
            return summary or "Application launched."
        if computer_action == "speak":
            return summary or "Speech completed."

    return summary or json.dumps(result, ensure_ascii=True, indent=2)


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
    return direct_tool_execution_service.direct_tool_step_payload(
        connector_id,
        action_id,
        arguments,
        step_id=step_id,
        status=status,
        detail_override=detail_override,
        callbacks=_direct_tool_execution_callbacks(),
    )


def _thinking_step_payload(iteration: int, status: str, detail: Optional[str] = None) -> Dict[str, Any]:
    return direct_tool_execution_service.thinking_step_payload(iteration, status, detail)


def _extract_first_url(value: str) -> str:
    return direct_tool_execution_service.extract_first_url(value)


def _extract_first_path_reference(value: str) -> str:
    return direct_tool_execution_service.extract_first_path_reference(value)


def _resolve_chat_local_path(raw_path: str) -> Path:
    return direct_tool_execution_service.resolve_chat_local_path(raw_path)


def _direct_tool_execution_callbacks() -> direct_tool_execution_service.DirectToolExecutionCallbacks:
    return direct_tool_execution_service.DirectToolExecutionCallbacks(
        compact_step_detail=_compact_step_detail,
        titleize_direct_step_token=_titleize_direct_step_token,
        run_async_tool_call=_run_async_tool_call,
        parse_tool_name=_parse_tool_name,
        tool_arguments_payload=_tool_arguments_payload,
        parse_json_object_loose=parse_json_object_loose,
        safe_positive_int=_safe_positive_int,
        normalize_reasoning_effort=_normalize_reasoning_effort,
        build_direct_local_tool_config=_build_direct_local_tool_config,
        format_direct_local_tool_result=_format_direct_local_tool_result,
        build_direct_tool_config=_build_direct_tool_config,
        format_direct_tool_result=_format_direct_tool_result,
        llm_task=llm_task,
        web_search=web_search,
        web_fetch=web_fetch,
        search_memory_notebook=search_memory_notebook,
        get_memory_notebook_excerpt=get_memory_notebook_excerpt,
    )


def _no_provider_execution_services() -> no_provider_service.NoProviderExecutionServices:
    return no_provider_service.NoProviderExecutionServices(
        compact_text=_compact_text,
        safe_positive_int=_safe_positive_int,
        resolve_local_path=_resolve_chat_local_path,
        extract_first_path_reference=_extract_first_path_reference,
        extract_first_url=_extract_first_url,
        parse_page_state=parse_json_object_loose,
        parse_memory_write=memory_service.parse_no_provider_memory_write,
        parse_memory_read=memory_service.parse_no_provider_memory_read,
        handle_memory_request=memory_service.handle_no_provider_memory_request,
        parse_tool_name=_parse_tool_name,
        tool_arguments_payload=_tool_arguments_payload,
        approval_required_for_tool=_approval_required_for_direct_tool,
        agent_machine_full_trust_for_session=_agent_machine_full_trust_for_session,
        execute_single_tool_call=_execute_single_direct_tool_call,
    )


def _build_direct_tool_approval_response(
    *,
    tool_calls: List[Dict[str, Any]],
    tool_capabilities: List[Dict[str, Any]],
    session_ctx: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return no_provider_service.build_direct_tool_approval_response(
        tool_calls=tool_calls,
        tool_capabilities=tool_capabilities,
        services=_no_provider_execution_services(),
        session_ctx=session_ctx,
    )


def _message_has_obvious_direct_tool_intent(message: str, tools: List[Dict[str, Any]]) -> bool:
    return no_provider_service.has_obvious_direct_tool_intent(
        message,
        tools,
        compact_text=_compact_text,
        extract_first_path_reference=_extract_first_path_reference,
        extract_first_url=_extract_first_url,
        parse_memory_write=memory_service.parse_no_provider_memory_write,
        parse_memory_read=memory_service.parse_no_provider_memory_read,
    )


def _direct_tool_followup_message(tool_name: str, result_text: str) -> str:
    return direct_tool_execution_service.direct_tool_followup_message(
        tool_name,
        result_text,
    )


def _execute_single_direct_tool_call(
    *,
    tool_call: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    index: int = 1,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    return direct_tool_execution_service.execute_single_direct_tool_call(
        tool_call=tool_call,
        workspace_id=workspace_id,
        thread_id=thread_id,
        index=index,
        provider=provider,
        model=model,
        credentials=credentials,
        reasoning_effort=reasoning_effort,
        session_ctx=session_ctx,
        callbacks=_direct_tool_execution_callbacks(),
    )


def _execute_direct_tool_calls(
    *,
    tool_calls: List[Dict[str, Any]],
    workspace_id: str,
    thread_id: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    return direct_tool_execution_service.execute_direct_tool_calls(
        tool_calls=tool_calls,
        workspace_id=workspace_id,
        thread_id=thread_id,
        provider=provider,
        model=model,
        credentials=credentials,
        reasoning_effort=reasoning_effort,
        session_ctx=session_ctx,
        execute_single_tool_call=_execute_single_direct_tool_call,
    )


def _approval_required_for_direct_tool(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    from server_modules.tools_http import http_request_requires_approval

    return direct_tool_approval_service.approval_required_for_direct_tool(
        connector_id,
        action_id,
        arguments,
        tool_capabilities,
        compact_text=_compact_text,
        http_request_requires_approval=http_request_requires_approval,
    )


def _credential_auth_mode(provider: str, credentials: Optional[Dict[str, Any]]) -> str:
    return direct_chat_provider_service.credential_auth_mode(
        provider,
        credentials,
        normalize_auth_mode_fn=normalize_auth_mode,
    )


def _supports_direct_message_native_chat(provider: str, credentials: Optional[Dict[str, Any]]) -> bool:
    return direct_chat_provider_service.supports_direct_message_native_chat(
        provider,
        credentials,
        credential_auth_mode_fn=_credential_auth_mode,
        get_claude_code_session_token_fn=get_claude_code_session_token,
        provider_has_key_fn=provider_has_key,
    )


def _preferred_provider(workspace_id: str, requested_provider: str = "") -> tuple[str, Dict[str, Any]]:
    return direct_chat_provider_service.preferred_provider(
        workspace_id,
        requested_provider,
        supported_providers=SUPPORTED_PROVIDERS,
        direct_chat_credentials_fn=_direct_chat_credentials,
        supports_direct_message_native_chat_fn=_supports_direct_message_native_chat,
        credential_auth_mode_fn=_credential_auth_mode,
    )


def _provider_display_name(provider: str) -> str:
    return direct_chat_provider_service.provider_display_name(provider)


def _provider_unavailable_response(provider: str) -> Dict[str, Any]:
    return direct_chat_provider_service.provider_unavailable_response(
        provider,
        connect_action=_connect_action,
    )


def _direct_chat_credentials(workspace_id: str, provider: str) -> Dict[str, Any]:
    return direct_chat_provider_service.direct_chat_credentials(
        workspace_id,
        provider,
        build_provider_credential_candidates_fn=_build_provider_credential_candidates,
    )


def _normalize_reasoning_effort(value: str = "") -> Optional[str]:
    normalized = str(value or "").strip().lower()
    if normalized in {"low", "medium", "high"}:
        return normalized
    return None


def _direct_chat_error_reply(llm_error: str) -> str:
    detail = str(llm_error or "").strip() or "unknown_error"
    if detail.startswith("max_tool_iterations_reached:"):
        _, _, raw_limit = detail.partition(":")
        return _chat_iteration_limit_reply(_safe_positive_int(raw_limit, CHAT_MAX_ITERATIONS_DEFAULT))
    return f"Chat failed: {detail}"


_DIRECT_TOOL_RESULT_SUMMARY_SYSTEM_MESSAGE = (
    "Do not repeat or quote file contents, shell output, or tool results in your response. "
    "Use the information to answer the user's question directly and concisely. "
    "Never paste raw content."
)


def _direct_chat_generation_services() -> direct_chat_generation_service.DirectChatGenerationServices:
    return direct_chat_generation_service.DirectChatGenerationServices(
        thinking_step_payload=_thinking_step_payload,
        build_context_used=_build_context_used,
        build_direct_tool_approval_response=_build_direct_tool_approval_response,
        parse_tool_name=_parse_tool_name,
        tool_arguments_payload=_tool_arguments_payload,
        parse_page_state=parse_json_object_loose,
        direct_tool_step_payload=_direct_tool_step_payload,
        execute_single_direct_tool_call=_execute_single_direct_tool_call,
        direct_tool_followup_message=_direct_tool_followup_message,
        suggest_actions=_suggest_actions,
        clear_direct_tool_loop_state=_clear_direct_tool_loop_state,
        persist_direct_chat_memory_best_effort=_persist_direct_chat_memory_best_effort,
        persist_direct_chat_transcript_best_effort=_persist_direct_chat_transcript_best_effort,
        record_direct_tool_signature=_record_direct_tool_signature,
        direct_chat_error_reply=_direct_chat_error_reply,
        capture_exception=sentry_sdk.capture_exception,
        generate_chat_reply_stream_with_provider_fallback=generate_chat_reply_stream_with_provider_fallback,
    )


def _prepare_direct_chat_request(
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
) -> direct_chat_entry_service.PreparedDirectChatRequest:
    return direct_chat_entry_service.prepare_direct_chat_request(
        resolved_turn_request=resolved_turn_request,
        session_ctx=session_ctx,
        message=message,
        workspace_id=workspace_id,
        thread_id=thread_id,
        requested_model=requested_model,
        requested_provider=requested_provider,
        prior_messages=prior_messages,
        reasoning_effort=reasoning_effort,
        availability=availability,
        approved_action=approved_action,
        max_iterations=max_iterations,
        direct_chat_session_key_fn=_direct_chat_session_key,
        resolved_chat_iteration_limit_fn=_resolved_chat_iteration_limit,
        session_model_preference_fn=_session_model_preference,
        normalize_reasoning_effort_fn=_normalize_reasoning_effort,
        parse_slash_command_fn=_parse_slash_command,
        set_session_model_preference_fn=_set_session_model_preference,
        mark_thread_cleared_fn=_mark_thread_cleared,
        normalize_prior_messages_fn=_normalize_prior_messages,
        consume_thread_cleared_fn=_consume_thread_cleared,
        compact_conversation_history_fn=compact_conversation_history,
        build_proactive_suggestions_fn=_build_proactive_suggestions,
        direct_tool_session_key_fn=_direct_tool_session_key,
        resolve_direct_chat_availability_fn=_resolve_direct_chat_availability,
        connected_system_labels_fn=_connected_system_labels,
        context_tool_capabilities_fn=_context_tool_capabilities,
        build_direct_chat_tools_fn=_build_direct_chat_tools,
        build_local_direct_chat_tools_fn=_build_local_direct_chat_tools,
        build_builtin_direct_chat_tools_fn=_build_builtin_direct_chat_tools,
        normalize_direct_approved_action_fn=_normalize_direct_approved_action,
        build_context_used_fn=_build_context_used,
        direct_chat_compaction_token_limit=DIRECT_CHAT_COMPACTION_TOKEN_LIMIT,
    )


def _direct_chat_response_services() -> direct_chat_response_service.DirectChatResponseServices:
    return direct_chat_response_service.DirectChatResponseServices(
        with_context_used=_with_context_used,
        build_context_used=_build_context_used,
        connected_provider_tokens=_connected_provider_tokens,
        list_memory_entries=list_memory_entries,
        active_run_count=_active_run_count,
        get_memory=get_memory,
        delete_memory=delete_memory,
        slash_command_help_text=_slash_command_help_text,
        execute_direct_tool_calls=_execute_direct_tool_calls,
        direct_chat_credentials=_direct_chat_credentials,
        capture_exception=sentry_sdk.capture_exception,
    )


def _direct_chat_runtime_services() -> direct_chat_runtime_service.DirectChatRuntimeServices:
    return direct_chat_runtime_service.DirectChatRuntimeServices(
        prepare_direct_chat_request=_prepare_direct_chat_request,
        direct_chat_response_services=_direct_chat_response_services(),
        tool_gate_response=_tool_gate_response,
        with_context_used=_with_context_used,
        tool_write_action_available=_tool_write_action_available,
        approved_action_to_tool_call=_approved_action_to_tool_call,
        message_has_obvious_direct_tool_intent=_message_has_obvious_direct_tool_intent,
        no_provider_execution_services=_no_provider_execution_services(),
        build_context_used=_build_context_used,
        resolve_provider_for_direct_chat_message=_resolve_provider_for_direct_chat_message,
        plan_direct_chat_route=_plan_direct_chat_route,
        start_direct_chat_run_handoff=_start_direct_chat_run_handoff,
        direct_chat_run_handoff_reply=_direct_chat_run_handoff_reply,
        stream_direct_chat_run_handoff=_stream_direct_chat_run_handoff,
        direct_chat_run_handoff_failure_payload=_direct_chat_run_handoff_failure_payload,
        supports_direct_message_native_chat=_supports_direct_message_native_chat,
        supported_providers=SUPPORTED_PROVIDERS,
        build_direct_chat_system_prompt=_build_direct_chat_system_prompt,
        direct_chat_workspace_context_text=_direct_chat_workspace_context_text,
        direct_chat_generation_services=_direct_chat_generation_services(),
        no_provider_reasoning_required_response=no_provider_service.no_provider_reasoning_required_response,
        capture_exception=sentry_sdk.capture_exception,
    )


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
    max_iterations: Optional[int] = None,
    session_ctx: Optional[Dict[str, Any]] = None,
    agent_turn_request: Optional[Any] = None,
) -> Iterator[Dict[str, Any]]:
    yield from direct_chat_runtime_service.build_direct_operator_reply(
        services=_direct_chat_runtime_services(),
        message=message,
        workspace_id=workspace_id,
        requested_model=requested_model,
        requested_provider=requested_provider,
        thread_id=thread_id,
        prior_messages=prior_messages,
        reasoning_effort=reasoning_effort,
        availability=availability,
        approved_action=approved_action,
        max_iterations=max_iterations,
        session_ctx=session_ctx,
        agent_turn_request=agent_turn_request,
    )


def collect_direct_operator_reply(
    **kwargs: Any,
) -> Dict[str, Any]:
    return direct_chat_runtime_service.collect_direct_operator_reply(
        services=_direct_chat_runtime_services(),
        **kwargs,
    )


def build_chat_turn_event_stream(
    *,
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Iterator[Dict[str, Any]]:
    return direct_chat_runtime_service.build_chat_turn_event_stream(
        services=_direct_chat_runtime_services(),
        session_ctx=session_ctx,
        message=message,
        request_meta=request_meta,
    )


def execute_chat_turn(
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    stream_sink: Optional[Callable[[Dict[str, Any]], None]] = None,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return direct_chat_runtime_service.execute_chat_turn(
        services=_direct_chat_runtime_services(),
        session_ctx=session_ctx,
        message=message,
        stream_sink=stream_sink,
        request_meta=request_meta,
    )
