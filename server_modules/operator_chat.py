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
from server_modules import direct_chat_availability_service
from server_modules import direct_chat_prompt_service
from server_modules import direct_chat_handoff_service
from server_modules import direct_chat_generation_service
from server_modules import direct_chat_routing_service
from server_modules import direct_chat_entry_service
from server_modules import direct_chat_callback_facade_service
from server_modules import direct_chat_context_service
from server_modules import direct_chat_response_service
from server_modules import direct_chat_runtime_facade_service
from server_modules import direct_chat_runtime_service
from server_modules import direct_chat_tool_catalog_service
from server_modules import direct_tool_approval_service
from server_modules import direct_tool_config_service
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
    return direct_chat_context_service.agent_machine_owner_user_id(session_ctx)


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
    return direct_chat_context_service.availability_lines(
        workspace_id,
        availability,
        normalize_tool_capabilities=_normalize_tool_capabilities,
    )


def _connected_system_labels(availability: Dict[str, Any]) -> List[str]:
    return direct_chat_context_service.connected_system_labels(
        availability,
        normalize_tool_capabilities=_normalize_tool_capabilities,
    )


def _context_tool_capabilities(availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    return direct_chat_context_service.context_tool_capabilities(
        availability,
        normalize_tool_capabilities=_normalize_tool_capabilities,
        max_context_tool_actions=MAX_CONTEXT_TOOL_ACTIONS,
        max_context_tool_capabilities=MAX_CONTEXT_TOOL_CAPABILITIES,
    )


def _normalize_prior_messages(prior_messages: Any) -> List[Dict[str, str]]:
    return direct_chat_context_service.normalize_prior_messages(
        prior_messages,
        max_direct_chat_prior_message_chars=MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS,
        max_direct_chat_prior_messages=MAX_DIRECT_CHAT_PRIOR_MESSAGES,
    )


def _direct_tool_session_key(workspace_id: str, thread_id: str) -> str:
    return direct_chat_context_service.direct_tool_session_key(workspace_id, thread_id)


def _direct_chat_session_key(workspace_id: str, thread_id: str) -> str:
    return direct_chat_context_service.direct_chat_session_key(workspace_id, thread_id)


def _parse_slash_command(message: str) -> Dict[str, str]:
    return direct_chat_context_service.parse_slash_command(message)


def _session_model_preference(session_key: str) -> Dict[str, Optional[str]]:
    return direct_chat_context_service.session_model_preference(
        session_key,
        store=_DIRECT_CHAT_MODEL_PREFERENCES,
    )


def _set_session_model_preference(session_key: str, *, provider: Optional[str], model: Optional[str]) -> None:
    direct_chat_context_service.set_session_model_preference(
        session_key,
        provider=provider,
        model=model,
        store=_DIRECT_CHAT_MODEL_PREFERENCES,
    )


def _mark_thread_cleared(session_key: str) -> None:
    direct_chat_context_service.mark_thread_cleared(
        session_key,
        clear_markers=_DIRECT_CHAT_CLEAR_MARKERS,
    )


def _consume_thread_cleared(session_key: str) -> bool:
    return direct_chat_context_service.consume_thread_cleared(
        session_key,
        clear_markers=_DIRECT_CHAT_CLEAR_MARKERS,
    )


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
    return direct_chat_context_service.active_run_count(workspace_id, live_runs=live_runs)


def _slash_command_help_text() -> str:
    return direct_chat_context_service.slash_command_help_text()


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
    return direct_chat_availability_service.connect_action(label, href)


def _open_action(label: str, href: str, *, variant: str = "primary") -> Dict[str, Any]:
    return direct_chat_availability_service.open_action(label, href, variant=variant)


def _google_repair_action() -> Dict[str, Any]:
    return direct_chat_availability_service.google_repair_action(
        connect_action_fn=_connect_action,
    )


def _run_action(message: str) -> Dict[str, Any]:
    return direct_chat_availability_service.run_action(message)


def _workflow_action(message: str) -> Dict[str, Any]:
    return direct_chat_availability_service.workflow_action(message)


def _question_like(compact_message: str) -> bool:
    return direct_chat_availability_service.question_like(
        compact_message,
        question_openers=QUESTION_OPENERS,
    )


def _mentions_any(compact_message: str, markers: tuple[str, ...]) -> bool:
    return direct_chat_availability_service.mentions_any(
        compact_message,
        markers=markers,
    )


def _starts_like_direct_run(compact_message: str) -> bool:
    return direct_chat_availability_service.starts_like_direct_run(
        compact_message,
        direct_run_openers=DIRECT_RUN_OPENERS,
    )


def _is_obvious_telegram_write_request(compact_message: str) -> bool:
    return direct_chat_availability_service.is_obvious_telegram_write_request(
        compact_message,
        question_like_fn=_question_like,
        mentions_any_fn=_mentions_any,
        starts_like_direct_run_fn=_starts_like_direct_run,
        telegram_keywords=TELEGRAM_KEYWORDS,
    )


def _is_obvious_google_write_request(compact_message: str) -> bool:
    return direct_chat_availability_service.is_obvious_google_write_request(
        compact_message,
        question_like_fn=_question_like,
        starts_like_direct_run_fn=_starts_like_direct_run,
    )


def _is_obvious_smtp_write_request(compact_message: str) -> bool:
    return direct_chat_availability_service.is_obvious_smtp_write_request(
        compact_message,
        question_like_fn=_question_like,
        mentions_any_fn=_mentions_any,
        starts_like_direct_run_fn=_starts_like_direct_run,
        smtp_keywords=SMTP_KEYWORDS,
    )


def _connector_write_preview_allowed(message: str, availability: Dict[str, Any]) -> bool:
    return direct_chat_availability_service.connector_write_preview_allowed(
        message,
        availability,
        compact_text_fn=_compact_text,
        is_obvious_telegram_write_request_fn=_is_obvious_telegram_write_request,
        is_obvious_google_write_request_fn=_is_obvious_google_write_request,
        is_obvious_smtp_write_request_fn=_is_obvious_smtp_write_request,
        tool_runtime_usable_fn=_tool_runtime_usable,
    )


def _is_explicit_workflow_request(message: str) -> bool:
    return direct_chat_availability_service.is_explicit_workflow_request(
        message,
        compact_text_fn=_compact_text,
        mentions_any_fn=_mentions_any,
        workflow_request_markers=WORKFLOW_REQUEST_MARKERS,
    )


def _no_ai_chat_response(availability: Dict[str, Any]) -> Dict[str, Any]:
    return direct_chat_availability_service.no_ai_chat_response(
        availability,
        normalize_tool_capabilities_fn=_normalize_tool_capabilities,
        connect_action_fn=_connect_action,
    )


def _tool_gate_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return direct_chat_availability_service.tool_gate_response(
        message,
        availability,
        compact_text_fn=_compact_text,
        mentions_any_fn=_mentions_any,
        is_obvious_smtp_write_request_fn=_is_obvious_smtp_write_request,
        tool_connected_fn=_tool_connected,
        tool_runtime_usable_fn=_tool_runtime_usable,
        connect_action_fn=_connect_action,
        google_repair_action_fn=_google_repair_action,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
    )


def _suggest_actions(message: str, availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    return direct_chat_availability_service.suggest_actions(
        message,
        availability,
        compact_text_fn=_compact_text,
        mentions_any_fn=_mentions_any,
        question_like_fn=_question_like,
        is_explicit_workflow_request_fn=_is_explicit_workflow_request,
        is_obvious_smtp_write_request_fn=_is_obvious_smtp_write_request,
        tool_runtime_usable_fn=_tool_runtime_usable,
        workflow_action_fn=_workflow_action,
        run_action_fn=_run_action,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
        execution_markers=EXECUTION_MARKERS,
    )


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
    return direct_chat_routing_service.preview_run_response(
        message,
        availability,
        _direct_chat_routing_policy_callbacks(),
    )


def _action_marker_count(compact_message: str) -> int:
    return direct_chat_routing_service.action_marker_count(compact_message, EXECUTION_MARKERS)


def _path_like_reference_count(message: str) -> int:
    return direct_chat_routing_service.path_like_reference_count(message)


def _prefer_durable_run_handoff(message: str, availability: Dict[str, Any]) -> bool:
    return direct_chat_routing_service.prefer_durable_run_handoff(
        message,
        availability,
        _direct_chat_routing_policy_callbacks(),
    )


def _direct_chat_routing_policy_callbacks() -> direct_chat_routing_service.DirectChatRoutingPolicyCallbacks:
    return direct_chat_routing_service.DirectChatRoutingPolicyCallbacks(
        compact_text=_compact_text,
        mentions_any=_mentions_any,
        question_like=_question_like,
        is_explicit_workflow_request=_is_explicit_workflow_request,
        starts_like_direct_run=_starts_like_direct_run,
        workflow_action=_workflow_action,
        run_action=_run_action,
        message_requests_local_file_tool=_message_requests_local_file_tool,
        message_requests_local_shell_tool=_message_requests_local_shell_tool,
        message_requests_local_screenshot_tool=_message_requests_local_screenshot_tool,
        complex_task_sequence_markers=COMPLEX_TASK_SEQUENCE_MARKERS,
        complex_task_outcome_markers=COMPLEX_TASK_OUTCOME_MARKERS,
        execution_markers=EXECUTION_MARKERS,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
    )


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
    return direct_chat_tool_catalog_service.provider_supports_direct_tool_calls(provider)


def _direct_chat_tool_policy_callbacks() -> direct_chat_tool_catalog_service.DirectChatToolPolicyCallbacks:
    return direct_chat_tool_catalog_service.DirectChatToolPolicyCallbacks(
        compact_text=_compact_text,
        question_like=_question_like,
        mentions_any=_mentions_any,
        extract_first_path_reference=_extract_first_path_reference,
        extract_first_url=_extract_first_url,
        provider_supports_direct_tool_calls=_provider_supports_direct_tool_calls,
        is_obvious_smtp_write_request=_is_obvious_smtp_write_request,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        smtp_keywords=SMTP_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        discord_keywords=DISCORD_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
        browser_keywords=BROWSER_KEYWORDS,
        local_file_keywords=LOCAL_FILE_KEYWORDS,
        local_shell_keywords=LOCAL_SHELL_KEYWORDS,
        local_screenshot_keywords=LOCAL_SCREENSHOT_KEYWORDS,
        local_computer_control_keywords=LOCAL_COMPUTER_CONTROL_KEYWORDS,
        web_lookup_keywords=WEB_LOOKUP_KEYWORDS,
        http_request_keywords=HTTP_REQUEST_KEYWORDS,
        image_generation_keywords=IMAGE_GENERATION_KEYWORDS,
        llm_task_keywords=LLM_TASK_KEYWORDS,
    )


def _build_local_direct_chat_tools(availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    return direct_chat_tool_catalog_service.build_local_direct_chat_tools(
        availability,
        local_worker_available=_local_worker_available,
    )


def _build_direct_chat_tools(tool_capabilities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return direct_chat_tool_catalog_service.build_direct_chat_tools(tool_capabilities)


def _build_builtin_direct_chat_tools() -> List[Dict[str, Any]]:
    return direct_chat_tool_catalog_service.build_builtin_direct_chat_tools()


def registered_direct_chat_tool_names_for_logging() -> List[str]:
    return direct_chat_tool_catalog_service.registered_direct_chat_tool_names_for_logging()


def _message_requests_http_request_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_http_request_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_requests_image_generation_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_image_generation_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_requests_browser_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_browser_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_can_use_direct_connector_tools(
    message: str,
    *,
    provider: str,
    tools: List[Dict[str, Any]],
) -> bool:
    return direct_chat_tool_catalog_service.message_can_use_direct_connector_tools(
        message,
        provider=provider,
        tools=tools,
        callbacks=_direct_chat_tool_policy_callbacks(),
    )


def _looks_like_local_path_request(compact_message: str) -> bool:
    return direct_chat_tool_catalog_service.looks_like_local_path_request(compact_message)


def _message_requests_local_file_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_local_file_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_requests_local_shell_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_local_shell_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_requests_local_screenshot_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_local_screenshot_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_requests_local_computer_tool(message: str) -> bool:
    return direct_chat_tool_catalog_service.message_requests_local_computer_tool(
        message,
        _direct_chat_tool_policy_callbacks(),
    )


def _message_can_use_direct_local_tools(
    message: str,
    *,
    provider: str,
    tools: List[Dict[str, Any]],
) -> bool:
    return direct_chat_tool_catalog_service.message_can_use_direct_local_tools(
        message,
        provider=provider,
        tools=tools,
        callbacks=_direct_chat_tool_policy_callbacks(),
    )


def _message_can_use_builtin_direct_tools(
    message: str,
    *,
    tools: List[Dict[str, Any]],
) -> bool:
    return direct_chat_tool_catalog_service.message_can_use_builtin_direct_tools(
        message,
        tools=tools,
        callbacks=_direct_chat_tool_policy_callbacks(),
    )


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
    return direct_tool_config_service.extract_first_email(text)


def _extract_subject_text(text: str) -> str:
    return direct_tool_config_service.extract_subject_text(text)


def _extract_body_text(text: str) -> str:
    return direct_tool_config_service.extract_body_text(text)


def _first_non_empty_line(text: str) -> str:
    return direct_tool_config_service.first_non_empty_line(text)


def _build_direct_tool_config(connector_id: str, action_id: str, tool_input: str) -> Dict[str, Any]:
    return direct_tool_config_service.build_direct_tool_config(
        connector_id,
        action_id,
        tool_input,
        parse_json_object_loose=parse_json_object_loose,
    )


def _build_direct_local_tool_config(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
) -> tuple[str, Dict[str, Any]]:
    return direct_tool_config_service.build_direct_local_tool_config(
        connector_id,
        action_id,
        arguments,
    )


def _tool_write_action_available(
    connector_id: str,
    action_id: str,
    tool_capabilities: List[Dict[str, Any]],
) -> bool:
    return direct_tool_config_service.tool_write_action_available(
        connector_id,
        action_id,
        tool_capabilities,
    )


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
    return direct_tool_config_service.approved_action_to_tool_call(
        approved_action,
        parse_json_object_loose=parse_json_object_loose,
    )


def _run_async_tool_call(coro: Any) -> Any:
    return direct_tool_config_service.run_async_tool_call(coro)


def _format_direct_tool_result(result: Dict[str, Any]) -> str:
    return direct_tool_config_service.format_direct_tool_result(result)


def _format_direct_local_tool_result(result: Dict[str, Any]) -> str:
    return direct_tool_config_service.format_direct_local_tool_result(result)


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
    return direct_chat_runtime_facade_service.build_no_provider_execution_services(
        _direct_chat_runtime_facade_callbacks(),
    )


def _build_direct_tool_approval_response(
    *,
    tool_calls: List[Dict[str, Any]],
    tool_capabilities: List[Dict[str, Any]],
    session_ctx: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return direct_chat_runtime_facade_service.build_direct_tool_approval_response(
        tool_calls=tool_calls,
        tool_capabilities=tool_capabilities,
        session_ctx=session_ctx,
        callbacks=_direct_chat_runtime_facade_callbacks(),
    )


def _message_has_obvious_direct_tool_intent(message: str, tools: List[Dict[str, Any]]) -> bool:
    return direct_chat_runtime_facade_service.message_has_obvious_direct_tool_intent(
        message,
        tools,
        _direct_chat_runtime_facade_callbacks(),
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
    return direct_chat_callback_facade_service.build_direct_chat_generation_services(
        _direct_chat_callback_facade_inputs(),
    )


def _direct_chat_callback_facade_inputs() -> direct_chat_callback_facade_service.DirectChatCallbackFacadeInputs:
    return direct_chat_callback_facade_service.DirectChatCallbackFacadeInputs(
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
        compact_text=_compact_text,
        safe_positive_int=_safe_positive_int,
        resolve_chat_local_path=_resolve_chat_local_path,
        extract_first_path_reference=_extract_first_path_reference,
        extract_first_url=_extract_first_url,
        parse_memory_write=memory_service.parse_no_provider_memory_write,
        parse_memory_read=memory_service.parse_no_provider_memory_read,
        handle_memory_request=memory_service.handle_no_provider_memory_request,
        approval_required_for_direct_tool=_approval_required_for_direct_tool,
        agent_machine_full_trust_for_session=_agent_machine_full_trust_for_session,
        direct_chat_session_key=_direct_chat_session_key,
        resolved_chat_iteration_limit=_resolved_chat_iteration_limit,
        session_model_preference=_session_model_preference,
        normalize_reasoning_effort=_normalize_reasoning_effort,
        parse_slash_command=_parse_slash_command,
        set_session_model_preference=_set_session_model_preference,
        mark_thread_cleared=_mark_thread_cleared,
        normalize_prior_messages=_normalize_prior_messages,
        consume_thread_cleared=_consume_thread_cleared,
        compact_conversation_history=compact_conversation_history,
        build_proactive_suggestions=_build_proactive_suggestions,
        direct_tool_session_key=_direct_tool_session_key,
        resolve_direct_chat_availability=_resolve_direct_chat_availability,
        connected_system_labels=_connected_system_labels,
        context_tool_capabilities=_context_tool_capabilities,
        build_direct_chat_tools=_build_direct_chat_tools,
        build_local_direct_chat_tools=_build_local_direct_chat_tools,
        build_builtin_direct_chat_tools=_build_builtin_direct_chat_tools,
        normalize_direct_approved_action=_normalize_direct_approved_action,
        direct_chat_compaction_token_limit=DIRECT_CHAT_COMPACTION_TOKEN_LIMIT,
        with_context_used=_with_context_used,
        connected_provider_tokens=_connected_provider_tokens,
        list_memory_entries=list_memory_entries,
        active_run_count=_active_run_count,
        get_memory=get_memory,
        delete_memory=delete_memory,
        slash_command_help_text=_slash_command_help_text,
        execute_direct_tool_calls=_execute_direct_tool_calls,
        direct_chat_credentials=_direct_chat_credentials,
        tool_gate_response=_tool_gate_response,
        tool_write_action_available=_tool_write_action_available,
        approved_action_to_tool_call=_approved_action_to_tool_call,
        resolve_provider_for_direct_chat_message=_resolve_provider_for_direct_chat_message,
        plan_direct_chat_route=_plan_direct_chat_route,
        start_direct_chat_run_handoff=_start_direct_chat_run_handoff,
        direct_chat_run_handoff_reply=_direct_chat_run_handoff_reply,
        stream_direct_chat_run_handoff=_stream_direct_chat_run_handoff,
        direct_chat_run_handoff_failure_payload=_direct_chat_run_handoff_failure_payload,
        supports_direct_message_native_chat=_supports_direct_message_native_chat,
        supported_providers=list(SUPPORTED_PROVIDERS),
        build_direct_chat_system_prompt=_build_direct_chat_system_prompt,
        direct_chat_workspace_context_text=_direct_chat_workspace_context_text,
        no_provider_reasoning_required_response=no_provider_service.no_provider_reasoning_required_response,
    )


def _direct_chat_runtime_facade_callbacks() -> direct_chat_runtime_facade_service.DirectChatRuntimeFacadeCallbacks:
    return direct_chat_callback_facade_service.build_direct_chat_runtime_facade_callbacks(
        _direct_chat_callback_facade_inputs(),
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
    return direct_chat_runtime_facade_service.prepare_direct_chat_request(
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
        callbacks=_direct_chat_runtime_facade_callbacks(),
    )


def _direct_chat_response_services() -> direct_chat_response_service.DirectChatResponseServices:
    return direct_chat_runtime_facade_service.build_direct_chat_response_services(
        _direct_chat_runtime_facade_callbacks(),
    )


def _direct_chat_runtime_services() -> direct_chat_runtime_service.DirectChatRuntimeServices:
    return direct_chat_runtime_facade_service.build_direct_chat_runtime_services(
        _direct_chat_runtime_facade_callbacks(),
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
