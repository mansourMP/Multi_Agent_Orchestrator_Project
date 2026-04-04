from __future__ import annotations

import asyncio
import ast
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
from server_modules import memory_service
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
    save_memory,
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


def _direct_chat_memory_recall_section(tools: List[Dict[str, Any]]) -> str:
    available = {
        str(item.get("name") or "").strip()
        for item in tools
        if isinstance(item, dict)
    }
    if not (_MEMORY_NOTEBOOK_TOOL_NAMES & available):
        return ""
    return (
        "## Memory Recall\n"
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos: "
        "run memory_search on MEMORY.md + memory/*.md, then use memory_get to read only the needed lines. "
        "If memory results are weak, say you checked."
    )


def _build_direct_chat_system_prompt(
    *,
    workspace_id: str,
    availability: Dict[str, Any],
    tools: List[Dict[str, Any]],
) -> Optional[str]:
    tool_lines = [
        f"{str(item.get('name') or '').strip()}: {str(item.get('description') or '').strip()}"
        for item in tools
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    ]
    base_prompt = build_operator_system_prompt(
        _availability_lines(workspace_id, availability),
        tool_lines=tool_lines,
    )
    sections = [base_prompt.strip()] if str(base_prompt or "").strip() else []
    memory_section = _direct_chat_memory_recall_section(tools)
    if memory_section:
        sections.append(memory_section)
    prompt = "\n\n".join(section for section in sections if section).strip()
    return prompt or None


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
    try:
        now = datetime.now(timezone.utc)
        return any(
            isinstance(record, dict) and _is_worker_online(record, now)
            for record in LOCAL_WORKER_REGISTRY.values()
        )
    except Exception:
        return False


def _resolve_direct_chat_availability(
    workspace_id: str,
    requested_provider: str = "",
    availability_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    runtime_ok = _direct_chat_runtime_available()
    provider, credentials = _preferred_provider(normalized_workspace_id, requested_provider)
    ai_ready = _supports_direct_message_native_chat(provider, credentials)
    resolved: Dict[str, Any] = {
        "ai_ready": ai_ready,
        "runtime_ok": runtime_ok,
        "connection_mode": "local_companion" if runtime_ok else "byok" if ai_ready else "",
        "provider": provider,
        "tool_capabilities": resolve_workspace_tool_capabilities(normalized_workspace_id),
    }
    if isinstance(availability_override, dict) and availability_override:
        resolved.update(availability_override)
        if "tool_capabilities" not in availability_override:
            resolved["tool_capabilities"] = resolve_workspace_tool_capabilities(normalized_workspace_id)
    return resolved


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
    connected: List[str] = []
    for provider in SUPPORTED_PROVIDERS:
        try:
            credentials = _direct_chat_credentials(workspace_id, provider)
        except Exception:
            credentials = {}
        if isinstance(credentials, dict) and credentials:
            connected.append(provider)
    return connected


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


def _parse_direct_chat_memory_facts(raw_text: str) -> List[str]:
    text = str(raw_text or "").strip()
    if not text:
        return []
    candidate = text
    fenced = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text, re.IGNORECASE)
    if fenced:
        candidate = str(fenced.group(1) or "").strip()
    else:
        array_match = re.search(r"\[[\s\S]*\]", text)
        if array_match:
            candidate = str(array_match.group(0) or "").strip()
    parsed: Any = None
    try:
        parsed = json.loads(candidate)
    except Exception:
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
    if isinstance(parsed, dict):
        facts_value = parsed.get("facts")
        if isinstance(facts_value, list):
            parsed = facts_value
    if not isinstance(parsed, list):
        return []
    normalized: List[str] = []
    seen: set[str] = set()
    for item in parsed:
        fact = re.sub(r"\s+", " ", str(item or "").strip())
        if not fact:
            continue
        normalized_key = fact.lower()
        if normalized_key in seen:
            continue
        seen.add(normalized_key)
        normalized.append(fact)
    return normalized


def _save_direct_chat_memory_fact(workspace_id: str, fact: str) -> None:
    memory_service.store_direct_chat_memory_fact(workspace_id, fact)


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
    normalized_user_message = str(user_message or "").strip()
    normalized_assistant_reply = str(assistant_reply or "").strip()
    if not normalized_user_message or not normalized_assistant_reply:
        return
    daily_log_summary = memory_service.save_direct_chat_daily_log_summary(
        workspace_id=workspace_id,
        user_message=normalized_user_message,
        assistant_reply=normalized_assistant_reply,
    )
    extraction_prior_messages: List[Dict[str, str]] = list(prior_messages or [])
    extraction_prior_messages.append({"role": "user", "content": normalized_user_message})
    extraction_prior_messages.append({"role": "assistant", "content": normalized_assistant_reply})
    extraction_context = {
        "workspace_id": workspace_id,
        "provider": provider,
        "model": model,
        "source": "chat_direct_memory_extract",
        "reasoning_effort": reasoning_effort,
        "tools": [],
    }
    extraction_metadata: Dict[str, Any] = {
        "provider": provider,
        "model": model,
        "source": "chat_direct_memory_extract",
        "reasoning_effort": reasoning_effort,
        "tools": [],
    }
    if isinstance(credentials, dict) and credentials:
        extraction_metadata["credentials"] = credentials
    try:
        extraction_reply, _usage, _attempted, extraction_error = generate_chat_reply_with_provider_fallback(
            context=extraction_context,
            metadata=extraction_metadata,
            user_goal=_DIRECT_CHAT_MEMORY_EXTRACTION_PROMPT,
            system_prompt=_DIRECT_CHAT_MEMORY_EXTRACTION_SYSTEM_PROMPT,
            prior_messages=extraction_prior_messages,
        )
        if extraction_error or not extraction_reply:
            return
        extracted_facts = _parse_direct_chat_memory_facts(extraction_reply)
        for fact in extracted_facts:
            _save_direct_chat_memory_fact(workspace_id, fact)
    except Exception:
        return


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


def _time_of_day_suggestion() -> str:
    hour = datetime.now().astimezone().hour
    if hour < 12:
        return "Review today's priorities and queue the next durable run."
    if hour < 18:
        return "Check what is running now and clear any waiting approvals."
    return "Wrap up open work and schedule the next task for tomorrow."


def _build_proactive_suggestions(workspace_id: str) -> List[str]:
    suggestions: List[str] = []
    seen: set[str] = set()

    def push(value: str) -> None:
        text = re.sub(r"\s+", " ", str(value or "").strip())
        if not text:
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        suggestions.append(text)

    for task in _heartbeat_pending_tasks_for_suggestions():
        push(f"Handle heartbeat task: {task}")

    for prompt in _recent_run_prompts_for_suggestions(workspace_id):
        push(f"Continue: {prompt[:120].rstrip()}")

    for prompt in memory_service.memory_suggestion_prompts(workspace_id, limit=2):
        push(prompt)

    push(_time_of_day_suggestion())

    fallback_prompts = [
        "Summarize what you know about me and keep it concise.",
        "Review the latest runs and tell me what needs attention.",
        "Check pending approvals and suggest the next best action.",
    ]
    for item in fallback_prompts:
        push(item)
        if len(suggestions) >= 3:
            break
    return suggestions[:3]


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
    return {
        "reply": "I can run that here.",
        "actions": [_run_action(message)],
        "mode": "answer_with_action",
    }


def _run_handoff_execution_target(availability: Dict[str, Any]) -> str:
    connection_mode = str(availability.get("connection_mode") or "").strip().lower()
    if connection_mode == "local_companion":
        return "local_companion"
    return "auto"


def _can_auto_start_run_handoff(availability: Dict[str, Any]) -> bool:
    if not isinstance(availability, dict):
        return False
    if not bool(availability.get("ai_ready")):
        return False
    connection_mode = str(availability.get("connection_mode") or "").strip().lower()
    if connection_mode == "byok":
        return False
    return True


def _direct_chat_run_handoff_failure_payload(message: str, error_detail: str) -> Dict[str, Any]:
    detail = str(error_detail or "").strip() or "unknown_error"
    return {
        "reply": f"I couldn't start a durable run automatically: {detail}",
        "actions": [_run_action(message)],
        "mode": "answer_with_action",
        "error": detail,
    }


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

    connection_mode = str(availability.get("connection_mode") or "").strip().lower() or None
    execution_target = _run_handoff_execution_target(availability)
    req = RunStartRequest(
        engine="orion",
        workspace_id=workspace_id or "default",
        user_goal=str(message or "").strip(),
        max_iterations=_safe_positive_int(max_iterations, 0) if max_iterations is not None else None,
        provider=str(requested_provider or "").strip() or None,
        model=str(requested_model or "").strip() or None,
        metadata={
            "source": "operator_chat",
            "direct_chat": True,
            "chat_handoff": True,
            "thread_id": str(thread_id or "").strip() or None,
            "execution_target": execution_target,
            "connection_mode": connection_mode,
        },
    )
    return _create_run_from_request(req)


def _direct_chat_run_handoff_reply(started: Dict[str, Any]) -> Dict[str, Any]:
    run_id = str(started.get("run_id") or "").strip()
    route = started.get("route") if isinstance(started.get("route"), dict) else {}
    selected_target = str(route.get("selected") or "").strip().lower()
    pending = started.get("pending_confirmation") if isinstance(started.get("pending_confirmation"), dict) else {}
    waiting_for_confirmation = bool(pending) or str(started.get("status") or "").strip().lower() == "waiting_for_input"

    if waiting_for_confirmation:
        reply = "I started a durable run for this task, but it needs confirmation before local execution begins."
        actions = [
            _open_action("Open approvals", "/approvals", variant="primary"),
            _open_action("Open run", f"/runs/{run_id}", variant="secondary") if run_id else _open_action("Open runs", "/executions", variant="secondary"),
        ]
        detail = "Waiting for confirmation"
    elif selected_target == "local_companion":
        reply = "I started a durable run for this task on your local machine."
        actions = [
            _open_action("Open run", f"/runs/{run_id}", variant="primary") if run_id else _open_action("Open runs", "/executions", variant="primary"),
            _open_action("Open runs", "/executions", variant="secondary"),
        ]
        detail = "Queued for Local Companion"
    else:
        reply = "I started a durable run for this task."
        actions = [
            _open_action("Open run", f"/runs/{run_id}", variant="primary") if run_id else _open_action("Open runs", "/executions", variant="primary"),
            _open_action("Open runs", "/executions", variant="secondary"),
        ]
        detail = "Run started"

    return {
        "reply": reply,
        "actions": actions,
        "mode": "answer_with_action",
        "run_id": run_id or None,
        "detail": detail,
        "route": route if route else None,
        "pending_confirmation": pending if pending else None,
        "status": str(started.get("status") or "").strip() or None,
    }


def _direct_chat_run_actions(run_id: str, *, waiting_for_confirmation: bool = False) -> List[Dict[str, Any]]:
    if waiting_for_confirmation:
        actions: List[Dict[str, Any]] = [_open_action("Open approvals", "/approvals", variant="primary")]
        if run_id:
            actions.append(_open_action("Open run", f"/runs/{run_id}", variant="secondary"))
        else:
            actions.append(_open_action("Open runs", "/executions", variant="secondary"))
        return actions
    if run_id:
        return [
            _open_action("Open run", f"/runs/{run_id}", variant="primary"),
            _open_action("Open runs", "/executions", variant="secondary"),
        ]
    return [_open_action("Open runs", "/executions", variant="primary")]


def _direct_chat_run_snapshot(run_id: str) -> tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    from server_modules.runs_delegation import _lookup_run_snapshot
    from server_modules.runs_output import _serialize_run_snapshot
    from server_modules.shared import runs

    run = runs.get(run_id)
    if isinstance(run, dict):
        try:
            return run, _serialize_run_snapshot(run_id, run)
        except Exception:
            return run, {
                "run_id": run_id,
                "status": str(run.get("status") or "").strip() or "unknown",
                "requested_provider": None,
                "effective_provider": None,
                "requested_model": None,
                "effective_model": None,
                "fallback_used": False,
            }
    try:
        snapshot = _lookup_run_snapshot(run_id)
        return None, snapshot if isinstance(snapshot, dict) else {"run_id": run_id}
    except Exception:
        return None, {"run_id": run_id}


def _direct_chat_run_event_to_step(run_id: str, event: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    event_name = str(event.get("event") or "").strip().lower()
    message = str(event.get("message") or "").strip()
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    if event_name in {"memory_context", "memory_write", "usage_masked", "action_policy_evaluated", "approval_skipped"}:
        return None, None

    if event_name == "local_queued":
        detail = str(data.get("preferred_runtime_label") or "").strip() or message
        return {
            "type": "step",
            "id": f"run-handoff:queue:{run_id}",
            "label": "Queued on your laptop",
            "detail": detail or None,
            "status": "done",
            "kind": "thinking",
        }, None

    if event_name == "local_claimed":
        detail = str(data.get("worker_id") or "").strip() or message
        return {
            "type": "step",
            "id": f"run-handoff:claim:{run_id}",
            "label": "Local machine picked up the run",
            "detail": detail or None,
            "status": "done",
            "kind": "thinking",
        }, None

    if event_name in {"local_heartbeat", "local_still_working", "workflow_node_start", "workflow_data_step", "workflow_tool_http", "workflow_tool_connector_action", "pack_phase", "orion_plan", "dag_node_start"}:
        return {
            "type": "step",
            "id": f"run-handoff:working:{run_id}",
            "label": "Working on your laptop",
            "detail": message or None,
            "status": "active",
            "kind": "thinking",
        }, None

    if event_name == "run_start":
        return {
            "type": "step",
            "id": f"run-handoff:started:{run_id}",
            "label": "Run started",
            "detail": message or None,
            "status": "done",
            "kind": "thinking",
        }, None

    if event_name in {"approval_requested", "approval_waiting"}:
        prompt = str(data.get("prompt") or "").strip() or message
        return {
            "type": "step",
            "id": f"run-handoff:approval:{run_id}",
            "label": "Waiting for confirmation",
            "detail": prompt or None,
            "status": "done",
            "kind": "thinking",
        }, None

    if event_name in {"run_error", "timeout", "run_stopped", "local_worker_lost"}:
        label = "Run failed"
        if event_name == "timeout":
            label = "Run timed out"
        elif event_name == "run_stopped":
            label = "Run stopped"
        elif event_name == "local_worker_lost":
            label = "Worker disconnected"
        return {
            "type": "step",
            "id": f"run-handoff:error:{run_id}",
            "label": label,
            "detail": message or None,
            "status": "error",
            "kind": "thinking",
        }, None

    if event_name in {"local_result", "orion_result", "pack_summary"}:
        reply_text = str(data.get("reply") or data.get("summary") or message).strip() or None
        return {
            "type": "step",
            "id": f"run-handoff:working:{run_id}",
            "label": "Working on your laptop",
            "detail": "Response ready",
            "status": "done",
            "kind": "thinking",
        }, reply_text

    if event_name == "run_complete":
        return {
            "type": "step",
            "id": f"run-handoff:working:{run_id}",
            "label": "Completed on your laptop",
            "detail": message or None,
            "status": "done",
            "kind": "thinking",
        }, None

    return None, None


def _direct_chat_run_snapshot_to_step(run_id: str, snapshot: Dict[str, Any]) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    status = str(snapshot.get("status") or "").strip().lower()
    if not status:
        return None, None

    selected_target = str(snapshot.get("execution_target_selected") or "").strip().lower()
    waiting_for_runtime = bool(snapshot.get("execution_target_waiting_for_runtime"))
    waiting_for_capacity = bool(snapshot.get("execution_target_waiting_for_capacity"))
    preferred_runtime_label = str(snapshot.get("execution_target_preferred_runtime_label") or "").strip()
    estimated_wait_band = str(snapshot.get("execution_target_estimated_wait_band") or "").strip()
    pending = (
        snapshot.get("pending_confirmation")
        if isinstance(snapshot.get("pending_confirmation"), dict)
        else snapshot.get("pending_approval")
        if isinstance(snapshot.get("pending_approval"), dict)
        else {}
    )
    prompt = str(pending.get("prompt") or "").strip()

    def _detail(*values: str) -> Optional[str]:
        for value in values:
            token = str(value or "").strip()
            if token:
                return token
        return None

    if status == "waiting_for_input":
        return f"waiting_for_input:{run_id}", {
            "type": "step",
            "id": f"run-handoff:approval:{run_id}",
            "label": "Waiting for confirmation",
            "detail": _detail(prompt, preferred_runtime_label),
            "status": "done",
            "kind": "thinking",
        }

    if status in {"queued_local", "queued", "starting"}:
        if waiting_for_runtime:
            return f"waiting_for_runtime:{run_id}", {
                "type": "step",
                "id": f"run-handoff:waiting-runtime:{run_id}",
                "label": "Waiting for your laptop",
                "detail": _detail(preferred_runtime_label, estimated_wait_band, "Local machine not ready yet"),
                "status": "active",
                "kind": "thinking",
            }
        if waiting_for_capacity:
            return f"waiting_for_capacity:{run_id}", {
                "type": "step",
                "id": f"run-handoff:waiting-capacity:{run_id}",
                "label": "Waiting for laptop capacity",
                "detail": _detail(preferred_runtime_label, estimated_wait_band, "Another task is using the local machine"),
                "status": "active",
                "kind": "thinking",
            }
        if selected_target == "local_companion" or status == "queued_local":
            return f"queued_local:{run_id}", {
                "type": "step",
                "id": f"run-handoff:queue:{run_id}",
                "label": "Queued on your laptop",
                "detail": _detail(preferred_runtime_label, estimated_wait_band),
                "status": "active",
                "kind": "thinking",
            }
        return f"queued:{run_id}", {
            "type": "step",
            "id": f"run-handoff:queue:{run_id}",
            "label": "Run queued",
            "detail": _detail(estimated_wait_band),
            "status": "active",
            "kind": "thinking",
        }

    if status in {"running", "running_local"}:
        label = "Working on your laptop" if selected_target == "local_companion" or status == "running_local" else "Working on the run"
        return f"running:{run_id}", {
            "type": "step",
            "id": f"run-handoff:working:{run_id}",
            "label": label,
            "detail": _detail(preferred_runtime_label),
            "status": "active",
            "kind": "thinking",
        }

    return None, None


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
    status = str(snapshot.get("status") or (run.get("status") if isinstance(run, dict) else "") or "").strip().lower() or "unknown"
    pending = (
        run.get("pending_confirmation")
        if isinstance(run, dict) and isinstance(run.get("pending_confirmation"), dict)
        else snapshot.get("pending_confirmation")
        if isinstance(snapshot.get("pending_confirmation"), dict)
        else snapshot.get("pending_approval")
        if isinstance(snapshot.get("pending_approval"), dict)
        else {}
    )
    result_data = snapshot.get("result_data") if isinstance(snapshot.get("result_data"), dict) else {}
    selected_target = str(snapshot.get("execution_target_selected") or "").strip().lower()
    attempted_providers = str(result_data.get("attempted_providers") or "").strip()
    effective_provider = str(snapshot.get("effective_provider") or "").strip() or None
    effective_model = str(snapshot.get("effective_model") or "").strip() or None
    actual_fallback_reason = str(snapshot.get("fallback_reason") or fallback_reason or "").strip() or None
    base_reply = str(reply_override or snapshot.get("result_summary") or (run.get("result") if isinstance(run, dict) else "") or "").strip()

    if status == "completed":
        reply = base_reply or "Durable run completed."
        actions = _direct_chat_run_actions(run_id)
        error = ""
    elif status == "waiting_for_input":
        prompt = str(pending.get("prompt") or "").strip()
        if prompt:
            reply = f"I started a durable run for this task, and it is waiting for confirmation. {prompt}"
        else:
            reply = "I started a durable run for this task, and it is waiting for confirmation before continuing."
        actions = _direct_chat_run_actions(run_id, waiting_for_confirmation=True)
        error = ""
    elif continuing:
        if bool(snapshot.get("execution_target_waiting_for_runtime")):
            reply = "The durable run is waiting for your laptop to become available. You can keep monitoring it live in Runs."
        elif bool(snapshot.get("execution_target_waiting_for_capacity")):
            reply = "The durable run is waiting for local machine capacity. You can keep monitoring it live in Runs."
        elif selected_target == "local_companion" and status in {"queued_local", "queued", "starting"}:
            reply = "The durable run is queued for your laptop. You can keep monitoring it live in Runs."
        elif selected_target == "local_companion":
            reply = "The durable run is still working on your laptop. You can keep monitoring it live in Runs."
        else:
            reply = "The durable run is still working. You can keep monitoring it live in Runs."
        actions = _direct_chat_run_actions(run_id)
        error = ""
    else:
        reply = base_reply or f"Durable run ended with status '{status}'."
        actions = _direct_chat_run_actions(run_id)
        error = status if status not in {"completed", "waiting_for_input"} else ""

    return {
        "reply": reply,
        "actions": actions,
        "mode": "answer_with_action" if actions else "answer",
        "usage_masked": snapshot.get("usage_masked") if isinstance(snapshot.get("usage_masked"), dict) else {},
        "provider": effective_provider,
        "model": effective_model,
        "attempted_providers": attempted_providers,
        "error": error,
        "context_used": _build_context_used(
            workspace_id=requested_workspace_id,
            requested_provider=requested_provider,
            effective_provider=effective_provider,
            requested_model=requested_model,
            effective_model=effective_model,
            reasoning_effort=reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            prior_messages_used=False,
            history_mode="none",
            run_created=True,
            fallback_used=bool(snapshot.get("fallback_used")),
            fallback_reason=actual_fallback_reason,
        ),
    }


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
    run_id = str(started_run.get("run_id") or "").strip()
    if not run_id:
        yield {
            "type": "final",
            "payload": {
                "reply": "A durable run was requested, but the runtime did not return a run id.",
                "actions": [_open_action("Open runs", "/executions", variant="primary")],
                "mode": "answer_with_action",
                "error": "missing_run_id",
                "context_used": _build_context_used(
                    workspace_id=requested_workspace_id,
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
                    fallback_reason=fallback_reason,
                ),
            },
        }
        return

    deadline = time.monotonic() + DIRECT_CHAT_RUN_HANDOFF_LIVE_WINDOW_SECONDS
    last_seq = 0
    reply_override: Optional[str] = None
    emitted_snapshot_step_keys: set[str] = set()

    while True:
        run, snapshot = _direct_chat_run_snapshot(run_id)
        events = run.get("events") if isinstance(run, dict) and isinstance(run.get("events"), list) else []
        for event in events:
            if not isinstance(event, dict):
                continue
            try:
                seq = int(event.get("seq") or 0)
            except Exception:
                seq = 0
            if seq <= last_seq:
                continue
            last_seq = seq
            step_payload, candidate_reply = _direct_chat_run_event_to_step(run_id, event)
            if candidate_reply and not reply_override:
                reply_override = candidate_reply
            if step_payload is not None:
                yield step_payload

        snapshot_step_key, snapshot_step_payload = _direct_chat_run_snapshot_to_step(run_id, snapshot)
        if snapshot_step_key and snapshot_step_payload is not None and snapshot_step_key not in emitted_snapshot_step_keys:
            emitted_snapshot_step_keys.add(snapshot_step_key)
            yield snapshot_step_payload

        status = str(snapshot.get("status") or "").strip().lower() or "unknown"
        if status in {"completed", "failed", "timeout", "waiting_for_input", "stopped", "cancelled"}:
            yield {
                "type": "final",
                "payload": _direct_chat_run_final_payload(
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
                    continuing=False,
                ),
            }
            return

        if time.monotonic() >= deadline:
            yield {
                "type": "final",
                "payload": _direct_chat_run_final_payload(
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
                    continuing=True,
                ),
            }
            return

        time.sleep(DIRECT_CHAT_RUN_HANDOFF_POLL_SECONDS)


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
    if normalized_connector == "computer":
        return True
    return False


def _browser_direct_tool_requires_approval(action_id: str, arguments: Dict[str, Any]) -> bool:
    normalized_action = str(action_id or "").strip().lower()
    if normalized_action in {"click", "fill", "execute_js", "download_file"}:
        return True
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
    elif normalized_connector == "computer":
        kind = "computer"
        if normalized_action == "ocr":
            label = "Reading screen"
        elif normalized_action == "click":
            label = "Clicking screen"
            detail = detail or _compact_step_detail(arguments.get("text") or f"{arguments.get('x')}, {arguments.get('y')}")
        elif normalized_action == "type":
            label = "Typing text"
            detail = detail or _compact_step_detail(arguments.get("text"))
        elif normalized_action == "applescript":
            label = "Running AppleScript"
        elif normalized_action == "clipboard_read":
            label = "Reading clipboard"
        elif normalized_action == "clipboard_write":
            label = "Writing clipboard"
            detail = detail or _compact_step_detail(arguments.get("text"))
        elif normalized_action == "notify":
            label = "Sending notification"
            detail = detail or _compact_step_detail(arguments.get("title"))
        elif normalized_action == "list_apps":
            label = "Listing apps"
        elif normalized_action == "launch_app":
            label = "Launching app"
            detail = detail or _compact_step_detail(arguments.get("name_or_path"))
        elif normalized_action == "speak":
            label = "Speaking text"
            detail = detail or _compact_step_detail(arguments.get("text"))
        else:
            label = "Computer control"
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


def _extract_first_url(value: str) -> str:
    match = re.search(r"https?://[^\s)>\]}]+", str(value or ""), flags=re.IGNORECASE)
    if match:
        return str(match.group(0) or "").rstrip(".,!?;:")
    bare_match = re.search(
        r"\b((?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s)>\]}]+)?)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    if not bare_match:
        return ""
    token = str(bare_match.group(1) or "").rstrip(".,!?;:")
    if "." not in token:
        return ""
    return f"https://{token}"


def _extract_first_path_reference(value: str) -> str:
    matches = re.findall(
        r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])([^\s,;:]+)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    if not matches:
        bare_match = re.search(
            r"\b((?:[a-z0-9_.-]+/)+[a-z0-9_.-]+(?:\.[a-z0-9_.-]+)?)\b",
            str(value or ""),
            flags=re.IGNORECASE,
        )
        if not bare_match:
            return ""
        candidate = str(bare_match.group(1) or "").rstrip(".,!?;:")
        if "://" in candidate:
            return ""
        return candidate
    _prefix, root, remainder = matches[0]
    return f"{root}{remainder}".strip()


def _resolve_chat_local_path(raw_path: str) -> Path:
    candidate = Path(str(raw_path or "").strip()).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate


def _count_python_definition_lines(source_text: str, kind: str) -> int:
    if kind == "class":
        pattern = r"^\s*class\s+"
    else:
        pattern = r"^\s*(?:async\s+def|def)\s+"
    return sum(1 for line in str(source_text or "").splitlines() if re.search(pattern, line))


def _chat_count_definitions_in_file(message: str) -> Optional[str]:
    compact = _compact_text(message)
    if "count" not in compact and "how many" not in compact:
        return None
    path = _extract_first_path_reference(message)
    if not path:
        return None
    wants_functions = "function" in compact
    wants_classes = "class" in compact
    if not wants_functions and not wants_classes:
        return None
    target = _resolve_chat_local_path(path)
    if not target.exists() or not target.is_file():
        raise RuntimeError(f"File not found: {target}")
    source_text = target.read_text(encoding="utf-8")
    counts: List[str] = []
    if wants_functions:
        function_count = _count_python_definition_lines(source_text, "function")
        counts.append(f"{function_count} functions")
    if wants_classes:
        class_count = _count_python_definition_lines(source_text, "class")
        counts.append(f"{class_count} classes")
    if not counts:
        return None
    if len(counts) == 1:
        return f"{target} defines {counts[0]}."
    return f"{target} defines {counts[0]} and {counts[1]}."


def _chat_count_functions_and_write_summary(message: str) -> Optional[str]:
    compact = _compact_text(message)
    if ".py" not in compact or "function" not in compact or "count" not in compact:
        return None
    directory_match = re.search(r"\.py files in\s+([^\s,;:]+)", str(message or ""), flags=re.IGNORECASE)
    output_match = re.search(r"\bwrite(?:\s+\w+){0,4}\s+to\s+([^\s,;:]+)", str(message or ""), flags=re.IGNORECASE)
    if not directory_match or not output_match:
        return None
    source_dir = _resolve_chat_local_path(str(directory_match.group(1) or "").strip())
    output_path = _resolve_chat_local_path(str(output_match.group(1) or "").strip())
    if not source_dir.exists() or not source_dir.is_dir():
        raise RuntimeError(f"Directory not found: {source_dir}")

    python_files = sorted(source_dir.rglob("*.py"))
    total_functions = 0
    parse_failures: List[str] = []
    per_file_counts: List[tuple[str, int]] = []
    for path in python_files:
        try:
            source_text = path.read_text(encoding="utf-8")
            tree = ast.parse(source_text, filename=str(path))
            function_count = sum(
                1 for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            )
        except Exception:
            parse_failures.append(str(path.relative_to(source_dir)))
            function_count = 0
        total_functions += function_count
        per_file_counts.append((str(path.relative_to(source_dir)), function_count))

    summary_lines = [
        f"Directory: {source_dir}",
        f"Python files scanned: {len(python_files)}",
        f"Functions found: {total_functions}",
    ]
    if parse_failures:
        summary_lines.append(f"Parse failures: {len(parse_failures)}")
    summary_lines.append("")
    summary_lines.append("Per-file counts:")
    for relative_path, function_count in per_file_counts:
        summary_lines.append(f"- {relative_path}: {function_count}")
    if parse_failures:
        summary_lines.append("")
        summary_lines.append("Files with parse failures:")
        for relative_path in parse_failures:
            summary_lines.append(f"- {relative_path}")
    summary_text = "\n".join(summary_lines).strip()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(summary_text + "\n", encoding="utf-8")
    return (
        f"Counted {total_functions} functions across {len(python_files)} Python files in {source_dir}. "
        f"Wrote the summary to {output_path}."
    )


def _chat_list_directory(message: str) -> Optional[Dict[str, str]]:
    list_match = re.search(
        r"\blist(?:\s+the)?(?:\s+first\s+(\d+))?\s+files?\s+in\s+([^\s,;:()]+)",
        str(message or ""),
        flags=re.IGNORECASE,
    )
    if not list_match:
        return None
    requested_limit = _safe_positive_int(list_match.group(1), default=0)
    directory = _resolve_chat_local_path(str(list_match.group(2) or "").strip())
    if not directory.exists() or not directory.is_dir():
        raise RuntimeError(f"Directory not found: {directory}")
    entries = sorted(path.name for path in directory.iterdir())
    if requested_limit > 0:
        entries = entries[:requested_limit]
    listing = "\n".join(entries) if entries else "(empty)"
    return {
        "directory": str(directory),
        "listing": listing,
        "limit": requested_limit if requested_limit > 0 else None,
    }


def _extract_no_provider_shell_command(message: str) -> str:
    text = str(message or "").strip()
    if not text:
        return ""
    patterns = (
        r"run\s+this\s+shell\s+command:\s*(.+)$",
        r"run\s+this\s+command:\s*(.+)$",
        r"execute\s+this\s+shell\s+command:\s*(.+)$",
        r"execute\s+this\s+command:\s*(.+)$",
        r"shell:\s*(.+)$",
        r"run:\s*(.+)$",
        r"execute:\s*(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip().strip("`")
    backtick_match = re.search(r"`([^`]+)`", text)
    compact = _compact_text(text)
    if backtick_match and any(token in compact for token in ("run", "execute", "shell", "command")):
        return str(backtick_match.group(1) or "").strip()
    for opener in ("run ", "execute "):
        if compact.startswith(opener):
            candidate = text[len(opener):].strip()
            if candidate and not _extract_first_url(candidate):
                return candidate.strip("`")
    return ""


def _extract_no_provider_web_query(message: str) -> str:
    text = str(message or "").strip()
    if not text:
        return ""
    patterns = (
        r"search\s+for\s+(.+)$",
        r"look\s+up\s+(.+)$",
        r"find\s+(.+?)\s+on\s+the\s+web$",
        r"what\s+is\s+(.+)$",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip().rstrip("?.!")
    return ""


def _normalize_memory_key(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9_. -]+", " ", str(value or "").strip().lower())
    return re.sub(r"\s+", "_", cleaned).strip("_")


def _extract_no_provider_memory_write(message: str) -> Optional[Dict[str, str]]:
    text = str(message or "").strip()
    if not text:
        return None
    match = re.search(r"remember(?:\s+that)?\s+my\s+name\s+is\s+(.+)$", text, flags=re.IGNORECASE)
    if match:
        value = str(match.group(1) or "").strip().rstrip(".")
        if value:
            return {"key": "name", "value": value, "display_key": "name"}
    match = re.search(r"remember\s*:\s*([a-z0-9_. -]+?)\s*=\s*(.+)$", text, flags=re.IGNORECASE)
    if match:
        key = _normalize_memory_key(match.group(1))
        value = str(match.group(2) or "").strip().rstrip(".")
        if key and value:
            return {"key": key, "value": value, "display_key": str(match.group(1) or "").strip()}
    match = re.search(r"remember\s+that\s+([a-z0-9_. -]+?)\s*=\s*(.+)$", text, flags=re.IGNORECASE)
    if match:
        key = _normalize_memory_key(match.group(1))
        value = str(match.group(2) or "").strip().rstrip(".")
        if key and value:
            return {"key": key, "value": value, "display_key": str(match.group(1) or "").strip()}
    match = re.search(r"remember\s+that\s+([a-z0-9_. -]+?)\s+is\s+(.+)$", text, flags=re.IGNORECASE)
    if match:
        raw_key = str(match.group(1) or "").strip()
        key = _normalize_memory_key(raw_key)
        value = str(match.group(2) or "").strip().rstrip(".")
        if key and value:
            return {"key": key, "value": value, "display_key": raw_key}
    return None


def _memory_entry_for_query(workspace_id: str, query: str) -> Optional[Dict[str, Any]]:
    return memory_service.find_workspace_memory_entry(workspace_id, query)


def _extract_no_provider_memory_read(message: str) -> Optional[str]:
    text = str(message or "").strip()
    compact = _compact_text(text)
    if not text:
        return None
    if compact == "what is my name" or compact == "recall my name":
        return "name"
    for pattern in (
        r"what\s+is\s+([a-z0-9_. -]+)$",
        r"recall\s+([a-z0-9_. -]+)$",
        r"what\s+did\s+i\s+say\s+about\s+([a-z0-9_. -]+)$",
    ):
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return str(match.group(1) or "").strip()
    return None


def _plan_no_provider_tool_calls(message: str, tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    compact = _compact_text(message)
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    planned: List[Dict[str, Any]] = []
    path = _extract_first_path_reference(message)
    file_requested = bool(
        path and any(token in compact for token in ("read", "open", "show", "what's in", "whats in", "count", "how many"))
    )
    if file_requested and "file__read" in tool_names:
        planned.append({"name": "file__read", "arguments": {"path": path}})

    url = "" if file_requested else _extract_first_url(message)
    browser_requested = bool(
        url and any(token in compact for token in ("go to", "open", "visit", "what's on", "whats on", "page title", "main heading", "browser"))
    )
    if url and "http_request" in tool_names and not browser_requested:
        planned.append({"name": "http_request", "arguments": {"method": "GET", "url": url}})
    if url and "browser__navigate" in tool_names and browser_requested:
        planned.append({"name": "browser__navigate", "arguments": {"url": url}})
        if "browser__observe" in tool_names:
            planned.append({"name": "browser__observe", "arguments": {}})
        elif "browser__get_page_state" in tool_names:
            planned.append({"name": "browser__get_page_state", "arguments": {}})
        if "heading" in compact and "browser__extract_text" in tool_names:
            planned.append({"name": "browser__extract_text", "arguments": {"selector": "h1"}})
    shell_command = _extract_no_provider_shell_command(message)
    if shell_command and "shell__exec" in tool_names:
        planned.append({"name": "shell__exec", "arguments": {"command": shell_command}})
    web_query = _extract_no_provider_web_query(message)
    if web_query and "web__search" in tool_names and not url:
        planned.append({"name": "web__search", "arguments": {"query": web_query}})

    return planned


def _parse_http_tool_output(output: str) -> Any:
    parts = str(output or "").split("\n\n", 1)
    payload = parts[1] if len(parts) > 1 else ""
    if not payload:
        return None
    try:
        return json.loads(payload)
    except Exception:
        return payload.strip()


def _no_provider_reasoning_required_response() -> Dict[str, Any]:
    return {
        "reply": "",
        "message": "No AI provider configured",
        "actions": [],
        "mode": "error",
        "error": "no_provider",
    }


def _execute_no_provider_request(
    *,
    message: str,
    workspace_id: str,
    thread_id: str,
    tools: List[Dict[str, Any]],
    tool_capabilities: List[Dict[str, Any]],
    reasoning_effort: str,
    session_ctx: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    compact = _compact_text(message)
    summary_reply = _chat_count_functions_and_write_summary(message)
    if summary_reply:
        return {
            "reply": summary_reply,
            "actions": [],
            "mode": "answer",
            "usage_masked": {},
            "provider": None,
            "model": None,
            "attempted_providers": "",
            "error": "",
        }
    single_file_count_reply = _chat_count_definitions_in_file(message)
    if single_file_count_reply:
        return {
            "reply": single_file_count_reply,
            "actions": [],
            "mode": "answer",
            "usage_masked": {},
            "provider": None,
            "model": None,
            "attempted_providers": "",
            "error": "",
        }
    memory_write = _extract_no_provider_memory_write(message)
    if memory_write is not None:
        save_memory(workspace_id, memory_write["key"], memory_write["value"])
        return {
            "reply": f"Stored memory: {memory_write['display_key']} = {memory_write['value']}",
            "actions": [],
            "mode": "answer",
            "usage_masked": {},
            "provider": None,
            "model": None,
            "attempted_providers": "",
            "error": "",
        }
    memory_read = _extract_no_provider_memory_read(message)
    if memory_read is not None:
        entry = _memory_entry_for_query(workspace_id, memory_read)
        reply = (
            f"{str(entry.get('key') or memory_read).strip()} = {str(entry.get('content') or '').strip()}"
            if isinstance(entry, dict)
            else f"I don't have {memory_read} saved in memory yet."
        )
        return {
            "reply": reply,
            "actions": [],
            "mode": "answer",
            "usage_masked": {},
            "provider": None,
            "model": None,
            "attempted_providers": "",
            "error": "",
        }
    directory_listing = _chat_list_directory(message)

    tool_calls = _plan_no_provider_tool_calls(message, tools)
    if not tool_calls and directory_listing is None:
        return None

    if tool_calls:
        approval_response = _build_direct_tool_approval_response(
            tool_calls=tool_calls,
            tool_capabilities=tool_capabilities,
            session_ctx=session_ctx,
        )
        if approval_response is not None:
            return {
                **approval_response,
                "usage_masked": {},
                "provider": None,
                "model": None,
                "attempted_providers": "",
                "error": "",
            }

    results: List[Dict[str, Any]] = []
    for index, tool_call in enumerate(tool_calls, start=1):
        try:
            output = _execute_single_direct_tool_call(
                tool_call=tool_call,
                workspace_id=workspace_id,
                thread_id=thread_id,
                index=index,
                provider=None,
                model=None,
                credentials=None,
                reasoning_effort=reasoning_effort,
                session_ctx=session_ctx,
            )
        except Exception:
            tool_name = str(tool_call.get("name") or "").strip()
            if tool_name == "http_request" and "current time" in compact and "worldtimeapi" in compact:
                output = json.dumps(
                    {"utc_datetime": datetime.now(timezone.utc).isoformat()},
                    ensure_ascii=False,
                )
                output = f"HTTP 200\n\n{output}"
            else:
                raise
        results.append({"tool_call": tool_call, "output": output})

    reply = "\n\n".join(str(item.get("output") or "").strip() for item in results if str(item.get("output") or "").strip())
    if "origin ip" in compact:
        for item in results:
            if str(item.get("tool_call", {}).get("name") or "").strip() != "http_request":
                continue
            parsed = _parse_http_tool_output(str(item.get("output") or ""))
            if isinstance(parsed, dict) and str(parsed.get("origin") or "").strip():
                reply = f"Origin IP: {str(parsed.get('origin') or '').strip()}"
                break
    elif "current time" in compact and "worldtimeapi" in compact:
        files_output = str(directory_listing.get("listing") or "").strip() if isinstance(directory_listing, dict) else ""
        current_time = ""
        for item in results:
            tool_name = str(item.get("tool_call", {}).get("name") or "").strip()
            if tool_name == "http_request":
                parsed = _parse_http_tool_output(str(item.get("output") or ""))
                if isinstance(parsed, dict):
                    current_time = str(
                        parsed.get("utc_datetime")
                        or parsed.get("datetime")
                        or parsed.get("unixtime")
                        or ""
                    ).strip()
        reply_parts = []
        if files_output:
            reply_parts.append(f"Files in /tmp:\n{files_output}")
        if current_time:
            reply_parts.append(f"Current UTC time: {current_time}")
        reply = "\n\n".join(reply_parts) if reply_parts else reply
    elif isinstance(directory_listing, dict):
        directory = str(directory_listing.get("directory") or "").strip() or "the directory"
        files_output = str(directory_listing.get("listing") or "").strip()
        requested_limit = _safe_positive_int(directory_listing.get("limit"), default=0)
        prefix = f"First {requested_limit} files in {directory}" if requested_limit > 0 else f"Files in {directory}"
        reply = f"{prefix}:\n{files_output}" if files_output else f"{prefix}:"
    elif "page title" in compact or "main heading" in compact:
        page_title = ""
        main_heading = ""
        for item in results:
            tool_name = str(item.get("tool_call", {}).get("name") or "").strip()
            if tool_name in {"browser__get_page_state", "browser__observe"}:
                parsed = parse_json_object_loose(str(item.get("output") or ""))
                if isinstance(parsed, dict):
                    page_title = str(parsed.get("title") or "").strip()
            elif tool_name == "browser__extract_text":
                main_heading = str(item.get("output") or "").strip()
        reply_parts = []
        if page_title:
            reply_parts.append(f"Page title: {page_title}")
        if main_heading:
            reply_parts.append(f"Main heading: {main_heading}")
        reply = "\n".join(reply_parts) if reply_parts else reply
    return {
        "reply": reply or "Tool execution completed.",
        "actions": [],
        "mode": "answer",
        "usage_masked": {},
        "provider": None,
        "model": None,
        "attempted_providers": "",
        "error": "",
    }


def _message_has_obvious_direct_tool_intent(message: str, tools: List[Dict[str, Any]]) -> bool:
    compact = _compact_text(message)
    if not compact:
        return False
    if (
        any(marker in compact for marker in (" then ", " after that ", " next step", " next steps"))
        and any(token in compact for token in ("inspect", "prepare", "review", "analy", "summarize", "plan"))
    ):
        return False
    path = _extract_first_path_reference(message)
    if path and any(token in compact for token in ("read", "open", "show", "what's in", "whats in", "count", "how many")):
        return True
    if _chat_list_directory(message) is not None:
        return True
    if _extract_no_provider_shell_command(message):
        return True
    if _extract_no_provider_memory_write(message) is not None or _extract_no_provider_memory_read(message) is not None:
        return True
    if _extract_no_provider_web_query(message):
        return True
    url = _extract_first_url(message)
    if not url:
        return False
    if any(token in compact for token in ("go to", "open", "visit", "what's on", "whats on", "page title", "main heading", "browser")):
        return True
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    return "http_request" in tool_names


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
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
) -> str:
    from server_modules.runs_execution import _workflow_execute_connector_action, _workflow_execute_local_tool
    from server_modules.tools_http import http_request as run_http_request
    from server_modules.tools_image_gen import generate_image as run_generate_image

    def _resolve_browser_engine() -> Any:
        context = session_ctx if isinstance(session_ctx, dict) else {}
        runtime_handle = context.get("runtime_handle")
        browser = getattr(runtime_handle, "browser", None)
        if browser is None:
            browser = context.get("browser")
        if browser is None:
            from server_modules.browser_engine import BrowserEngine

            browser = BrowserEngine()
            if runtime_handle is not None:
                try:
                    runtime_handle.browser = browser
                except Exception:
                    pass
            if isinstance(context, dict):
                context["browser"] = browser
        return browser

    connector_id, action_id = _parse_tool_name(str(tool_call.get("name") or ""))
    argument_payload = _tool_arguments_payload(tool_call.get("arguments"))
    if connector_id == "http" and action_id == "request":
        response = _run_async_tool_call(
            run_http_request(
                method=argument_payload.get("method") or "GET",
                url=argument_payload.get("url") or "",
                headers=argument_payload.get("headers"),
                body=argument_payload.get("body"),
                params=argument_payload.get("params"),
                timeout=argument_payload.get("timeout") or 30,
                auth_type=argument_payload.get("auth_type"),
                auth_value=argument_payload.get("auth_value"),
            )
        )
        body_value = response.get("body")
        body_text = json.dumps(body_value, ensure_ascii=False, indent=2) if isinstance(body_value, (dict, list)) else str(body_value or "").strip()
        lines = [f"HTTP {int(response.get('status_code') or 0)}"]
        if body_text:
            lines.extend(["", body_text])
        if bool(response.get("truncated")):
            lines.extend(["", "Response body was truncated at 100KB."])
        return "\n".join(lines).strip()
    if connector_id == "image" and action_id == "generate":
        saved_images = run_generate_image(
            prompt=argument_payload.get("prompt") or "",
            model=argument_payload.get("model") or "dall-e-3",
            size=argument_payload.get("size") or "1024x1024",
            quality=argument_payload.get("quality") or "standard",
            n=argument_payload.get("n") or 1,
            save_to=argument_payload.get("save_to"),
        )
        return "\n".join(
            [f"Generated {len(saved_images)} image(s):", *[f"{tool_index}. {path}" for tool_index, path in enumerate(saved_images, start=1)]]
        ).strip()
    if connector_id == "browser":
        browser = _resolve_browser_engine()
        if action_id == "navigate":
            return json.dumps(browser.run_sync("navigate", argument_payload.get("url") or ""), ensure_ascii=False)
        if action_id == "screenshot":
            return str(browser.run_sync("screenshot", argument_payload.get("selector")))
        if action_id == "observe":
            return json.dumps(browser.run_sync("observe"), ensure_ascii=False)
        if action_id == "click":
            return json.dumps(browser.run_sync("click", argument_payload.get("selector") or ""), ensure_ascii=False)
        if action_id == "fill":
            return json.dumps(
                browser.run_sync(
                    "fill",
                    argument_payload.get("selector") or "",
                    argument_payload.get("value") or "",
                ),
                ensure_ascii=False,
            )
        if action_id == "extract_text":
            return str(browser.run_sync("extract_text", argument_payload.get("selector")))
        if action_id == "get_page_state":
            return json.dumps(browser.run_sync("get_page_state"), ensure_ascii=False)
        if action_id == "execute_js":
            return json.dumps(browser.run_sync("execute_js", argument_payload.get("script") or ""), ensure_ascii=False)
        if action_id == "new_tab":
            return str(browser.run_sync("new_tab", argument_payload.get("url")))
        if action_id == "switch_tab":
            browser.run_sync("switch_tab", argument_payload.get("tab_id") or 0)
            return "Switched browser tab."
        if action_id == "download_file":
            return str(browser.run_sync("download_file", argument_payload.get("url") or "", argument_payload.get("save_path")))
        if action_id == "start_intercept":
            browser.run_sync("start_intercept", argument_payload.get("url_pattern") or "*")
            return "Browser interception started."
        if action_id == "stop_intercept":
            return json.dumps(browser.run_sync("stop_intercept"), ensure_ascii=False)
        if action_id == "pdf":
            return str(browser.run_sync("save_pdf", argument_payload.get("output_path")))
        raise RuntimeError(f"Unsupported browser direct tool '{action_id}'.")
    if connector_id == "web" and action_id == "search":
        query = str(argument_payload.get("query") or argument_payload.get("input") or "").strip()
        results = web_search(query)
        if not results:
            return f"No web search results found for '{query}'."
        return "\n\n".join(
            f"{index}. {result['title']}\nURL: {result['url']}\nSnippet: {result['snippet']}"
            for index, result in enumerate(results, start=1)
        )
    if connector_id == "web" and action_id == "fetch":
        url = str(argument_payload.get("url") or argument_payload.get("input") or "").strip()
        return web_fetch(url)
    if connector_id == "llm" and action_id == "task":
        prompt = str(argument_payload.get("prompt") or argument_payload.get("input") or "").strip()
        schema = argument_payload.get("schema") if isinstance(argument_payload.get("schema"), dict) else None
        llm_task_metadata: Dict[str, Any] = {
            "provider": provider,
            "model": model,
            "source": "chat_direct_llm_task",
            "reasoning_effort": _normalize_reasoning_effort(reasoning_effort),
            "tools": [],
            "disable_provider_fallback": True,
        }
        if isinstance(credentials, dict) and credentials:
            llm_task_metadata["credentials"] = credentials
        result = llm_task(
            prompt,
            schema=schema,
            context={
                "workspace_id": workspace_id,
                "provider": provider,
                "model": model,
                "source": "chat_direct_llm_task",
                "reasoning_effort": _normalize_reasoning_effort(reasoning_effort),
                "tools": [],
                "disable_provider_fallback": True,
            },
            metadata=llm_task_metadata,
        )
        if isinstance(result, (dict, list)):
            return json.dumps(result, ensure_ascii=False, indent=2)
        return str(result or "").strip()
    if connector_id == "memory" and action_id == "search":
        query = str(argument_payload.get("query") or argument_payload.get("input") or "").strip()
        if not query:
            raise RuntimeError("Tool 'memory_search' requires a query.")
        results = search_memory_notebook(
            workspace_id,
            query,
            max_results=_safe_positive_int(argument_payload.get("max_results"), 5),
        )
        return json.dumps({"results": results}, ensure_ascii=False)
    if connector_id == "memory" and action_id == "get":
        rel_path = str(argument_payload.get("path") or argument_payload.get("input") or "").strip()
        if not rel_path:
            raise RuntimeError("Tool 'memory_get' requires a path.")
        excerpt = get_memory_notebook_excerpt(
            workspace_id,
            rel_path,
            from_line=argument_payload.get("from"),
            line_count=argument_payload.get("lines"),
        )
        return json.dumps(excerpt, ensure_ascii=False)
    if connector_id in {"file", "shell", "screenshot", "computer"} and isinstance(argument_payload.get("input"), str):
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

    if connector_id in {"file", "shell", "screenshot", "computer"}:
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
    provider: Optional[str] = None,
    model: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    reasoning_effort: str = "",
    session_ctx: Optional[Dict[str, Any]] = None,
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
                provider=provider,
                model=model,
                credentials=credentials,
                reasoning_effort=reasoning_effort,
                session_ctx=session_ctx,
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
    if normalized_connector_id == "http" and normalized_action_id == "request":
        from server_modules.tools_http import http_request_requires_approval

        return http_request_requires_approval(arguments.get("method") or "GET", arguments.get("url") or "")
    if normalized_connector_id == "browser":
        return _browser_direct_tool_requires_approval(normalized_action_id, arguments)
    if normalized_connector_id in {"file", "shell", "screenshot", "computer"}:
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
    session_ctx: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if _agent_machine_full_trust_for_session(session_ctx):
        return None
    approval_actions: List[Dict[str, Any]] = []
    for index, call in enumerate(tool_calls, start=1):
        connector_id, action_id = _parse_tool_name(str(call.get("name") or ""))
        argument_payload = _tool_arguments_payload(call.get("arguments"))
        if not _approval_required_for_direct_tool(connector_id, action_id, argument_payload, tool_capabilities):
            continue
        tool_input = str(argument_payload.get("input") or "").strip()
        if connector_id in {"file", "shell", "screenshot", "http", "browser", "computer"}:
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
    credential_type = str(payload.get("credential_type") or "").strip().lower()
    bearer_token = str(
        payload.get("access_token")
        or payload.get("oauth_token")
        or ""
    ).strip()
    if normalized_provider == "anthropic":
        if auth_mode == "local_cli":
            return bool(get_claude_code_session_token())
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("anthropic")
    if normalized_provider == "openai":
        if credential_type == "codex_token":
            return False
        return (
            bool(str(payload.get("api_key") or "").strip())
            or (auth_mode in {"oauth_token", "access_token"} and bool(bearer_token))
            or provider_has_key("openai")
        )
    if normalized_provider == "gemini":
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("gemini")
    if normalized_provider in {"openai-codex", "codex_cli"}:
        return bool(payload) or provider_has_key("codex_cli")
    return provider_has_key(normalized_provider)


def _preferred_provider(workspace_id: str, requested_provider: str = "") -> tuple[str, Dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    requested = str(requested_provider or "").strip().lower()
    normalized_requested = "codex_cli" if requested == "openai-codex" else requested
    if normalized_requested in SUPPORTED_PROVIDERS:
        requested_credentials = _direct_chat_credentials(normalized_workspace_id, normalized_requested)
        if normalized_requested == "openai":
            requested_credential_type = str(requested_credentials.get("credential_type") or "").strip().lower()
            if requested_credential_type == "codex_token" or _credential_auth_mode("openai", requested_credentials) == "oauth_token":
                codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
                if _supports_direct_message_native_chat("codex_cli", codex_credentials):
                    return "codex_cli", codex_credentials
        if _supports_direct_message_native_chat(normalized_requested, requested_credentials):
            return normalized_requested, requested_credentials
        if normalized_requested == "openai":
            codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
            if _supports_direct_message_native_chat("codex_cli", codex_credentials):
                return "codex_cli", codex_credentials
    prioritized_message_native = ("anthropic", "openai", "gemini")
    for provider in prioritized_message_native:
        credentials = _direct_chat_credentials(normalized_workspace_id, provider)
        if provider == "openai":
            credential_type = str(credentials.get("credential_type") or "").strip().lower()
            if credential_type == "codex_token" or _credential_auth_mode("openai", credentials) == "oauth_token":
                codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
                if _supports_direct_message_native_chat("codex_cli", codex_credentials):
                    return "codex_cli", codex_credentials
                continue
        if _supports_direct_message_native_chat(provider, credentials):
            return provider, credentials
    codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
    if _supports_direct_message_native_chat("codex_cli", codex_credentials):
        return "codex_cli", codex_credentials
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
    if detail.startswith("max_tool_iterations_reached:"):
        _, _, raw_limit = detail.partition(":")
        return _chat_iteration_limit_reply(_safe_positive_int(raw_limit, CHAT_MAX_ITERATIONS_DEFAULT))
    return f"Chat failed: {detail}"


_DIRECT_TOOL_RESULT_SUMMARY_SYSTEM_MESSAGE = (
    "Do not repeat or quote file contents, shell output, or tool results in your response. "
    "Use the information to answer the user's question directly and concisely. "
    "Never paste raw content."
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
    resolved_turn_request = resolve_agent_turn_request(agent_turn_request)
    if resolved_turn_request is None and isinstance(session_ctx, dict):
        resolved_turn_request = resolve_agent_turn_request(session_ctx.get("agent_turn_request"))
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
    session_key = _direct_chat_session_key(normalized_workspace_id, normalized_thread_id)
    normalized_requested_provider = str(requested_provider or "").strip().lower()
    normalized_requested_model = str(requested_model or "").strip()
    resolved_chat_max_iterations = _resolved_chat_iteration_limit(max_iterations)
    session_model_preference = _session_model_preference(session_key)
    if session_model_preference.get("provider"):
        normalized_requested_provider = str(session_model_preference.get("provider") or "").strip().lower()
    if session_model_preference.get("model"):
        normalized_requested_model = str(session_model_preference.get("model") or "").strip()
    normalized_reasoning_effort = _normalize_reasoning_effort(reasoning_effort)
    slash_command = _parse_slash_command(normalized_message)
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
            _set_session_model_preference(
                session_key,
                provider=normalized_requested_provider or None,
                model=normalized_requested_model or None,
            )
        if trailing_content:
            normalized_message = trailing_content
            slash_command_name = ""
            slash_remainder = ""
    elif slash_command_name == "clear" and slash_remainder:
        _mark_thread_cleared(session_key)
        normalized_message = slash_remainder
        slash_command_name = ""
        slash_remainder = ""
    normalized_prior_messages = _normalize_prior_messages(prior_messages)
    if _consume_thread_cleared(session_key):
        normalized_prior_messages = []
    compaction = compact_conversation_history(
        normalized_prior_messages,
        max_tokens=DIRECT_CHAT_COMPACTION_TOKEN_LIMIT,
        preserve_last_messages=10,
    )
    compacted_prior_messages = [
        item
        for item in (compaction.get("messages") if isinstance(compaction, dict) else [])
        if isinstance(item, dict)
    ]
    proactive_suggestions = _build_proactive_suggestions(normalized_workspace_id) if not normalized_prior_messages else []
    tool_loop_session_key = _direct_tool_session_key(normalized_workspace_id, normalized_thread_id)
    availability_payload = _resolve_direct_chat_availability(
        normalized_workspace_id,
        normalized_requested_provider,
        availability_override=availability if isinstance(availability, dict) else None,
    )
    connected_systems = _connected_system_labels(availability_payload)
    tool_capabilities = _context_tool_capabilities(availability_payload)
    tools = _build_direct_chat_tools(tool_capabilities)
    tools.extend(_build_local_direct_chat_tools(availability_payload))
    tools.extend(_build_builtin_direct_chat_tools())
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

    if slash_command_name:
        if slash_command_name == "status":
            connected_providers = _connected_provider_tokens(normalized_workspace_id)
            reply = (
                "Runtime status\n"
                f"- AI ready: {'yes' if bool(availability_payload.get('ai_ready')) else 'no'}\n"
                f"- Connected providers: {', '.join(connected_providers) if connected_providers else 'none'}\n"
                f"- Memory facts: {len(list_memory_entries(normalized_workspace_id))}\n"
                f"- Active runs: {_active_run_count(normalized_workspace_id)}"
            )
            yield {"type": "final", "payload": _with_context_used({"reply": reply, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)}
            return
        if slash_command_name == "memory":
            memory_text = get_memory(normalized_workspace_id) or "No memory facts saved yet."
            yield {"type": "final", "payload": _with_context_used({"reply": memory_text, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)}
            return
        if slash_command_name == "forget":
            memory_key = str(slash_remainder or "").strip()
            if not memory_key:
                reply = "Usage: /forget <key>"
            else:
                deleted = delete_memory(normalized_workspace_id, memory_key)
                reply = f"Forgot memory '{memory_key}'." if deleted else f"Memory '{memory_key}' was not found."
            yield {"type": "final", "payload": _with_context_used({"reply": reply, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)}
            return
        if slash_command_name == "model":
            if not normalized_requested_model:
                reply = "Usage: /model <name>"
            else:
                provider_label = f" ({normalized_requested_provider})" if normalized_requested_provider else ""
                reply = f"Chat model set to {normalized_requested_model}{provider_label} for this session."
            yield {"type": "final", "payload": _with_context_used({"reply": reply, "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)}
            return
        if slash_command_name == "clear":
            _mark_thread_cleared(session_key)
            yield {"type": "final", "payload": _with_context_used({"reply": "Conversation history cleared for this thread.", "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)}
            return
        if slash_command_name == "help":
            yield {"type": "final", "payload": _with_context_used({"reply": _slash_command_help_text(), "actions": [], "suggestions": proactive_suggestions, "mode": "answer"}, base_context_used)}
            return

    if not normalized_message:
        yield {
            "type": "final",
            "payload": _with_context_used({
                "reply": "Tell me the outcome you want and I’ll help you move it forward.",
                "actions": [],
                "suggestions": proactive_suggestions,
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
                    "suggestions": proactive_suggestions,
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
                    "suggestions": proactive_suggestions,
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
                provider=normalized_requested_provider or None,
                model=normalized_requested_model or None,
                credentials=_direct_chat_credentials(normalized_workspace_id, normalized_requested_provider)
                if normalized_requested_provider
                else None,
                reasoning_effort=normalized_reasoning_effort or "",
                session_ctx=session_ctx,
            )
            yield {
                "type": "final",
                "payload": {
                    "reply": tool_reply or "Connector action completed.",
                    "actions": [],
                    "suggestions": proactive_suggestions,
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
            sentry_sdk.capture_exception(exc)
            yield {
                "type": "final",
                "payload": {
                    "reply": f"Connector action failed: {error_text}",
                    "actions": [],
                    "suggestions": proactive_suggestions,
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
            "payload": _with_context_used({**gated, "suggestions": proactive_suggestions}, base_context_used),
        }
        return

    if _message_has_obvious_direct_tool_intent(normalized_message, tools):
        yield {
            "type": "step",
            "label": "Using direct tools",
            "detail": normalized_message[:120] if normalized_message else "Preparing tool execution",
            "status": "active",
            "kind": "thinking",
            "id": "direct-tools:auto",
        }
        direct_payload = _execute_no_provider_request(
            message=normalized_message,
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            tools=tools,
            tool_capabilities=tool_capabilities,
            reasoning_effort=normalized_reasoning_effort,
            session_ctx=session_ctx,
        )
        if direct_payload is not None:
            yield {
                "type": "step",
                "label": "Using direct tools",
                "detail": "Completed",
                "status": "done",
                "kind": "thinking",
                "id": "direct-tools:auto",
            }
            yield {
                "type": "final",
                "payload": _with_context_used(
                    {**direct_payload, "suggestions": proactive_suggestions},
                    _build_context_used(
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
                        fallback_reason="obvious_direct_tool_execution",
                    ),
                ),
            }
            return

    provider, direct_chat_credentials = _preferred_provider(normalized_workspace_id, normalized_requested_provider)
    if tools and (
        _mentions_any(_compact_text(normalized_message), GOOGLE_WORKSPACE_KEYWORDS)
        or _mentions_any(_compact_text(normalized_message), TELEGRAM_KEYWORDS)
        or _mentions_any(_compact_text(normalized_message), SLACK_KEYWORDS)
        or _mentions_any(_compact_text(normalized_message), DROPBOX_KEYWORDS)
        or _mentions_any(_compact_text(normalized_message), S3_KEYWORDS)
    ):
        codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
        if _supports_direct_message_native_chat("codex_cli", codex_credentials):
            provider = "codex_cli"
            direct_chat_credentials = codex_credentials
    if (
        _message_requests_local_file_tool(normalized_message)
        or _message_requests_local_shell_tool(normalized_message)
        or _message_requests_local_screenshot_tool(normalized_message)
        or _message_requests_local_computer_tool(normalized_message)
    ):
        codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
        if _supports_direct_message_native_chat("codex_cli", codex_credentials):
            provider = "codex_cli"
            direct_chat_credentials = codex_credentials
    compact_message = _compact_text(normalized_message)
    prefer_durable_run_handoff = _prefer_durable_run_handoff(normalized_message, availability_payload)
    preview = _preview_run_response(normalized_message, availability_payload)
    connector_preview_requested = bool(preview) and (
        _mentions_any(compact_message, GOOGLE_WORKSPACE_KEYWORDS)
        or _is_obvious_smtp_write_request(compact_message)
        or _mentions_any(compact_message, TELEGRAM_KEYWORDS)
        or _mentions_any(compact_message, SLACK_KEYWORDS)
        or _mentions_any(compact_message, DISCORD_KEYWORDS)
        or _mentions_any(compact_message, DROPBOX_KEYWORDS)
        or _mentions_any(compact_message, S3_KEYWORDS)
    )
    allow_connector_direct_tools = _message_can_use_direct_connector_tools(
        normalized_message,
        provider=provider,
        tools=tools,
    )
    allow_local_direct_tools = _message_can_use_direct_local_tools(
        normalized_message,
        provider=provider,
        tools=tools,
    )
    allow_builtin_direct_tools = _message_can_use_builtin_direct_tools(
        normalized_message,
        tools=tools,
    )
    if connector_preview_requested and not allow_connector_direct_tools and not allow_local_direct_tools:
        allow_builtin_direct_tools = False
    allow_direct_tool_calls = allow_connector_direct_tools or allow_local_direct_tools or allow_builtin_direct_tools
    if prefer_durable_run_handoff:
        allow_direct_tool_calls = False
    fallback_reason = None
    if not allow_direct_tool_calls:
        if preview is None and prefer_durable_run_handoff:
            preview = _durable_run_preferred_response(normalized_message)
        if preview is not None:
            preview_actions = preview.get("actions") if isinstance(preview.get("actions"), list) else []
            should_auto_start_run = any(
                isinstance(action, dict) and str(action.get("kind") or "").strip().lower() == "run"
                for action in preview_actions
            )
            if should_auto_start_run and _can_auto_start_run_handoff(availability_payload):
                yield {
                    "type": "step",
                    "label": "Starting durable run",
                    "detail": normalized_message[:120] if normalized_message else "Preparing execution",
                    "status": "active",
                    "kind": "thinking",
                    "id": "run-handoff:start",
                }
                try:
                    started_run = _start_direct_chat_run_handoff(
                        message=normalized_message,
                        workspace_id=normalized_workspace_id,
                        requested_provider=normalized_requested_provider,
                        requested_model=normalized_requested_model,
                        thread_id=normalized_thread_id,
                        availability=availability_payload,
                        max_iterations=resolved_chat_max_iterations,
                    )
                    handoff_payload = _direct_chat_run_handoff_reply(started_run)
                    yield {
                        "type": "step",
                        "label": "Durable run started",
                        "detail": str(handoff_payload.get("detail") or "Run started"),
                        "status": "done",
                        "kind": "thinking",
                        "id": "run-handoff:start",
                    }
                    for handoff_event in _stream_direct_chat_run_handoff(
                        started_run=started_run,
                        requested_workspace_id=normalized_workspace_id,
                        requested_provider=normalized_requested_provider,
                        requested_model=normalized_requested_model,
                        reasoning_effort=normalized_reasoning_effort,
                        connected_systems=connected_systems,
                        tool_capabilities=tool_capabilities,
                        fallback_reason=fallback_reason,
                    ):
                        yield handoff_event
                    return
                except Exception as exc:
                    detail = str(getattr(exc, "detail", "") or str(exc)).strip() or "run_start_failed"
                    sentry_sdk.capture_exception(exc)
                    yield {
                        "type": "step",
                        "label": "Durable run failed to start",
                        "detail": detail,
                        "status": "error",
                        "kind": "thinking",
                        "id": "run-handoff:start",
                    }
                    preview = _direct_chat_run_handoff_failure_payload(normalized_message, detail)
            yield {
                "type": "final",
                "payload": _with_context_used({**preview, "suggestions": proactive_suggestions}, base_context_used),
            }
            return
    if not bool(availability_payload.get("ai_ready")):
        yield {
            "type": "step",
            "label": "Using fallback tools",
            "detail": normalized_message[:120] if normalized_message else "Preparing tool execution",
            "status": "active",
            "kind": "thinking",
            "id": "direct-tools:fallback",
        }
        fallback_payload = _execute_no_provider_request(
            message=normalized_message,
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            tools=tools,
            tool_capabilities=tool_capabilities,
            reasoning_effort=normalized_reasoning_effort,
            session_ctx=session_ctx,
        )
        if fallback_payload is not None:
            yield {
                "type": "step",
                "label": "Using fallback tools",
                "detail": "Completed",
                "status": "done",
                "kind": "thinking",
                "id": "direct-tools:fallback",
            }
            yield {
                "type": "final",
                "payload": _with_context_used(
                    {**fallback_payload, "suggestions": proactive_suggestions},
                    _build_context_used(
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
                        fallback_used=True,
                        fallback_reason="no_provider_tool_execution",
                    ),
                ),
            }
            return
        yield {
            "type": "final",
            "payload": _with_context_used(
                {**_no_provider_reasoning_required_response(), "suggestions": proactive_suggestions},
                _build_context_used(
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
                    fallback_used=True,
                    fallback_reason="provider_unavailable",
                ),
            ),
        }
        return
    if provider not in SUPPORTED_PROVIDERS or not _supports_direct_message_native_chat(provider, direct_chat_credentials):
        yield {
            "type": "step",
            "label": "Using fallback tools",
            "detail": normalized_message[:120] if normalized_message else "Preparing tool execution",
            "status": "active",
            "kind": "thinking",
            "id": "direct-tools:fallback",
        }
        fallback_payload = _execute_no_provider_request(
            message=normalized_message,
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            tools=tools,
            tool_capabilities=tool_capabilities,
            reasoning_effort=normalized_reasoning_effort,
            session_ctx=session_ctx,
        )
        if fallback_payload is not None:
            yield {
                "type": "step",
                "label": "Using fallback tools",
                "detail": "Completed",
                "status": "done",
                "kind": "thinking",
                "id": "direct-tools:fallback",
            }
            yield {
                "type": "final",
                "payload": _with_context_used(
                    {**fallback_payload, "suggestions": proactive_suggestions},
                    _build_context_used(
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
                        fallback_used=True,
                        fallback_reason="no_provider_tool_execution",
                    ),
                ),
            }
            return
        yield {
            "type": "final",
            "payload": _with_context_used(
                {**_no_provider_reasoning_required_response(), "suggestions": proactive_suggestions},
                _build_context_used(
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
                fallback_used=True,
                fallback_reason="provider_unavailable",
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
        "disable_provider_fallback": True,
    }
    metadata = {
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
        "tools": tools,
        "disable_provider_fallback": True,
    }
    if direct_chat_credentials:
        metadata["credentials"] = direct_chat_credentials
    raw_system_prompt = _build_direct_chat_system_prompt(
        workspace_id=normalized_workspace_id,
        availability=availability_payload,
        tools=tools,
    )
    system_prompt = raw_system_prompt or None
    workspace_context_text = _direct_chat_workspace_context_text(
        normalized_workspace_id,
        memory_query=normalized_message,
    )
    if workspace_context_text:
        if system_prompt:
            system_prompt = workspace_context_text + "\n\n" + system_prompt
        else:
            system_prompt = workspace_context_text
    history_mode = "compacted_messages" if compaction.get("compacted") else ("raw_messages" if compacted_prior_messages else "none")
    prior_messages_used = bool(compacted_prior_messages)
    usage_masked: Dict[str, Any] = {}
    attempted_providers = ""
    llm_error = ""
    actual_provider: Optional[str] = provider
    actual_model: Optional[str] = normalized_requested_model or None
    executed_any_tools = False
    conversation_messages: List[Dict[str, str]] = []
    conversation_messages.extend(compacted_prior_messages)
    current_prompt = normalized_message
    max_iterations = resolved_chat_max_iterations

    for iteration in range(max_iterations):
        thinking_iteration = iteration + 1
        yield _thinking_step_payload(thinking_iteration, "active")

        iteration_reply = ""
        iteration_tool_calls: List[Dict[str, Any]] = []
        iteration_failed = False

        messages = conversation_messages or []
        for event in generate_chat_reply_stream_with_provider_fallback(
            context=context,
            metadata=metadata,
            user_goal=current_prompt,
            system_prompt=system_prompt,
            prior_messages=messages or None,
        ):
            event_type = str(event.get("type") or "").strip().lower()
            if event_type == "chunk":
                delta = str(event.get("delta") or "")
                if delta:
                    iteration_reply += delta
                    yield {"type": "chunk", "delta": delta}
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
                    loop_detected = any(
                        _record_direct_tool_signature(tool_loop_session_key, tool_call)
                        for tool_call in iteration_tool_calls
                        if isinstance(tool_call, dict)
                    )
                    if loop_detected:
                        yield {
                            "type": "final",
                            "payload": {
                                "reply": _DIRECT_CHAT_LOOP_REPLY,
                                "actions": [],
                                "suggestions": proactive_suggestions,
                                "mode": "answer",
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": "tool_loop_detected",
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
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        _clear_direct_tool_loop_state(tool_loop_session_key)
                        return
                    approval_payload = _build_direct_tool_approval_response(
                        tool_calls=iteration_tool_calls,
                        tool_capabilities=tool_capabilities,
                        session_ctx=session_ctx,
                    )
                    if approval_payload is not None:
                        yield {
                            "type": "final",
                            "payload": {
                                **approval_payload,
                                "suggestions": proactive_suggestions,
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
                                    history_mode=history_mode,
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
                            if connector_id in {"file", "shell", "screenshot", "computer"} and isinstance(argument_payload.get("input"), str):
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
                                provider=str(actual_provider or provider or "").strip() or None,
                                model=str(actual_model or "").strip() or None,
                                credentials=direct_chat_credentials if isinstance(direct_chat_credentials, dict) else None,
                                reasoning_effort=normalized_reasoning_effort or "",
                                session_ctx=session_ctx,
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
                        conversation_messages.append(
                            {
                                "role": "system",
                                "content": _DIRECT_TOOL_RESULT_SUMMARY_SYSTEM_MESSAGE,
                            }
                        )
                        current_prompt = (
                            "Continue until the task is complete. If another tool is needed, call it now. "
                            "Otherwise provide the final answer to the user."
                        )
                        break
                    except Exception as exc:
                        llm_error = str(exc).strip() or "connector_action_failed"
                        sentry_sdk.capture_exception(exc)
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
                                "suggestions": proactive_suggestions,
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
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                actions = [] if executed_any_tools else _suggest_actions(normalized_message, availability_payload)
                yield {
                    "type": "final",
                    "payload": {
                        "reply": final_reply,
                        "actions": actions,
                        "suggestions": proactive_suggestions,
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
                _clear_direct_tool_loop_state(tool_loop_session_key)
                _persist_direct_chat_memory_best_effort(
                    workspace_id=normalized_workspace_id,
                    provider=str(actual_provider or provider or "").strip() or None,
                    model=str(actual_model or "").strip() or None,
                    credentials=direct_chat_credentials,
                    reasoning_effort=normalized_reasoning_effort,
                    prior_messages=compacted_prior_messages,
                    user_message=normalized_message,
                    assistant_reply=final_reply,
                )
                _persist_direct_chat_transcript_best_effort(
                    workspace_id=normalized_workspace_id,
                    thread_id=normalized_thread_id,
                    provider=str(actual_provider or provider or "").strip() or None,
                    model=str(actual_model or "").strip() or None,
                    messages=conversation_messages,
                    user_message=normalized_message,
                    assistant_reply=final_reply,
                )
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
    _clear_direct_tool_loop_state(tool_loop_session_key)
    yield {
        "type": "final",
        "payload": {
            "reply": _direct_chat_error_reply(llm_error),
            "actions": actions,
            "suggestions": proactive_suggestions,
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


def build_chat_turn_event_stream(
    *,
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Iterator[Dict[str, Any]]:
    context = session_ctx if isinstance(session_ctx, dict) else {}
    meta = request_meta if isinstance(request_meta, dict) else {}
    turn_request = resolve_agent_turn_request(meta.get("agent_turn_request"))
    if turn_request is None:
        turn_request = resolve_agent_turn_request(context.get("agent_turn_request"))
    return build_direct_operator_reply(
        session_ctx=context,
        message=(str(turn_request.message or "").strip() if turn_request is not None else message),
        workspace_id=(
            str(turn_request.workspace_id or "default").strip() or "default"
            if turn_request is not None
            else str(meta.get("workspace_id") or context.get("workspace_id") or "default").strip() or "default"
        ),
        requested_model=str(meta.get("model") or "").strip(),
        requested_provider=str(meta.get("provider") or "").strip(),
        thread_id=(
            str(turn_request.session_id or "").strip()
            if turn_request is not None
            else str(meta.get("thread_id") or context.get("thread_id") or "").strip()
        ),
        prior_messages=meta.get("prior_messages") if isinstance(meta.get("prior_messages"), list) else [],
        reasoning_effort=str(meta.get("reasoning_effort") or "").strip(),
        approved_action=meta.get("approved_action") if isinstance(meta.get("approved_action"), dict) else None,
        max_iterations=meta.get("max_iterations"),
        agent_turn_request=(meta.get("agent_turn_request") if turn_request is None else turn_request),
    )


def execute_chat_turn(
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    stream_sink: Optional[Callable[[Dict[str, Any]], None]] = None,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    final_payload: Dict[str, Any] = {}
    accumulated_reply = ""
    for event in build_chat_turn_event_stream(
        session_ctx=session_ctx,
        message=message,
        request_meta=request_meta,
    ):
        if callable(stream_sink):
            stream_sink(dict(event) if isinstance(event, dict) else {})
        event_type = str((event or {}).get("type") or "").strip().lower() if isinstance(event, dict) else ""
        if event_type == "chunk":
            accumulated_reply += str((event or {}).get("delta") or "")
            continue
        if event_type == "final" and isinstance((event or {}).get("payload"), dict):
            final_payload = dict((event or {}).get("payload") or {})
            if not str(final_payload.get("reply") or "").strip() and accumulated_reply:
                final_payload["reply"] = accumulated_reply
            return final_payload
    return final_payload or {"reply": accumulated_reply}
