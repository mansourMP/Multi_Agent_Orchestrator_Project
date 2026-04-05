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
from functools import partial
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
from server_modules import direct_chat_composition_service
from server_modules import direct_chat_handoff_facade_service
from server_modules import direct_chat_memory_facade_service
from server_modules import direct_chat_entry_policy_service
from server_modules import direct_chat_operator_binding_service
from server_modules import direct_chat_support_binding_service
from server_modules import direct_chat_provider_facade_service
from server_modules import direct_chat_prompt_service
from server_modules import direct_chat_runtime_entry_facade_service
from server_modules import direct_chat_handoff_service
from server_modules import direct_chat_generation_service
from server_modules import direct_chat_routing_service
from server_modules import direct_chat_entry_service
from server_modules import direct_chat_callback_facade_service
from server_modules import direct_chat_context_service
from server_modules import direct_chat_metadata_service
from server_modules import direct_chat_response_service
from server_modules import direct_chat_runtime_facade_service
from server_modules import direct_chat_runtime_service
from server_modules import direct_chat_tool_catalog_service
from server_modules import direct_tool_approval_service
from server_modules import direct_tool_config_service
from server_modules import direct_tool_execution_service
from server_modules import direct_tool_loop_guard_service
from server_modules import direct_tool_runtime_facade_service
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
    return direct_chat_entry_policy_service.safe_positive_int(value, default)


def _resolved_chat_iteration_limit(explicit: Any = None) -> int:
    return direct_chat_entry_policy_service.resolved_chat_iteration_limit(
        explicit,
        default_limit=CHAT_MAX_ITERATIONS_DEFAULT,
        ceiling=CHAT_MAX_ITERATIONS_CEILING,
        env_var_name="ORION_MAX_CHAT_ITERATIONS",
        safe_positive_int_fn=_safe_positive_int,
    )


def _chat_iteration_limit_reply(limit: int) -> str:
    return direct_chat_entry_policy_service.chat_iteration_limit_reply(limit)
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


_agent_machine_owner_user_id = direct_chat_context_service.agent_machine_owner_user_id
_agent_machine_full_trust_for_session = lambda session_ctx: runtime_config.agent_machine_full_trust_enabled(
    _agent_machine_owner_user_id(session_ctx),
)
_direct_chat_runtime_available = lambda: direct_chat_entry_policy_service.direct_chat_runtime_available(
    LOCAL_WORKER_REGISTRY,
    is_worker_online_fn=_is_worker_online,
)
_resolve_direct_chat_availability = lambda workspace_id, requested_provider="", availability_override=None: direct_chat_entry_policy_service.resolve_direct_chat_availability(
    workspace_id,
    requested_provider,
    direct_chat_runtime_available_fn=_direct_chat_runtime_available,
    preferred_provider_fn=_preferred_provider,
    supports_direct_message_native_chat_fn=_supports_direct_message_native_chat,
    resolve_workspace_tool_capabilities_fn=resolve_workspace_tool_capabilities,
    availability_override=availability_override,
)
_availability_lines = lambda workspace_id, availability: direct_chat_entry_policy_service.availability_lines(
    workspace_id,
    availability,
    normalize_tool_capabilities=_normalize_tool_capabilities,
)
_connected_system_labels = lambda availability: direct_chat_entry_policy_service.connected_system_labels(
    availability,
    normalize_tool_capabilities=_normalize_tool_capabilities,
)
_context_tool_capabilities = lambda availability: direct_chat_entry_policy_service.context_tool_capabilities(
    availability,
    normalize_tool_capabilities=_normalize_tool_capabilities,
    max_context_tool_actions=MAX_CONTEXT_TOOL_ACTIONS,
    max_context_tool_capabilities=MAX_CONTEXT_TOOL_CAPABILITIES,
)
_normalize_prior_messages = lambda prior_messages: direct_chat_entry_policy_service.normalize_prior_messages(
    prior_messages,
    max_direct_chat_prior_message_chars=MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS,
    max_direct_chat_prior_messages=MAX_DIRECT_CHAT_PRIOR_MESSAGES,
)
_direct_tool_session_key = direct_chat_entry_policy_service.direct_tool_session_key
_direct_chat_session_key = direct_chat_entry_policy_service.direct_chat_session_key
_parse_slash_command = direct_chat_entry_policy_service.parse_slash_command
_session_model_preference = lambda session_key: direct_chat_entry_policy_service.session_model_preference(
    session_key,
    store=_DIRECT_CHAT_MODEL_PREFERENCES,
)
_set_session_model_preference = lambda session_key, *, provider, model: direct_chat_entry_policy_service.set_session_model_preference(
    session_key,
    provider=provider,
    model=model,
    store=_DIRECT_CHAT_MODEL_PREFERENCES,
)
_mark_thread_cleared = lambda session_key: direct_chat_entry_policy_service.mark_thread_cleared(
    session_key,
    clear_markers=_DIRECT_CHAT_CLEAR_MARKERS,
)
_consume_thread_cleared = lambda session_key: direct_chat_entry_policy_service.consume_thread_cleared(
    session_key,
    clear_markers=_DIRECT_CHAT_CLEAR_MARKERS,
)
_connected_provider_tokens = lambda workspace_id: direct_chat_entry_policy_service.connected_provider_tokens(
    workspace_id,
    supported_providers=SUPPORTED_PROVIDERS,
    direct_chat_credentials_fn=_direct_chat_credentials,
)
_resolve_provider_for_direct_chat_message = lambda workspace_id, requested_provider, message, *, tools_present: direct_chat_entry_policy_service.resolve_provider_for_direct_chat_message(
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
_plan_direct_chat_route = lambda *, message, availability, provider, tools: direct_chat_entry_policy_service.plan_direct_chat_route(
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
    return direct_chat_entry_policy_service.active_run_count(workspace_id, live_runs=live_runs)


def _slash_command_help_text() -> str:
    return direct_chat_entry_policy_service.slash_command_help_text()


_tool_call_signature = partial(
    direct_tool_loop_guard_service.tool_call_signature,
    tool_arguments_payload_fn=lambda arguments: _tool_arguments_payload(arguments),
    parse_tool_name_fn=lambda tool_name: _parse_tool_name(tool_name),
    parse_json_object_loose_fn=parse_json_object_loose,
)

_record_direct_tool_signature = partial(
    direct_tool_loop_guard_service.record_direct_tool_signature,
    loop_state=_DIRECT_TOOL_LOOP_STATE,
    repeat_limit=DIRECT_CHAT_LOOP_REPEAT_LIMIT,
    tool_call_signature_fn=lambda tool_call: _tool_call_signature(tool_call),
)

_clear_direct_tool_loop_state = partial(
    direct_tool_loop_guard_service.clear_direct_tool_loop_state,
    loop_state=_DIRECT_TOOL_LOOP_STATE,
)

_direct_chat_memory_context_message = partial(
    direct_chat_memory_facade_service.direct_chat_memory_context_message,
    system_prefix=_DIRECT_CHAT_MEMORY_SYSTEM_PREFIX,
)

_direct_chat_workspace_context_text = direct_chat_memory_facade_service.direct_chat_workspace_context_text
_build_direct_chat_daily_log_summary = direct_chat_memory_facade_service.build_direct_chat_daily_log_summary


_persist_direct_chat_memory_best_effort = partial(
    direct_chat_support_binding_service.persist_direct_chat_memory_best_effort,
    generate_reply=generate_chat_reply_with_provider_fallback,
    extraction_prompt=_DIRECT_CHAT_MEMORY_EXTRACTION_PROMPT,
    extraction_system_prompt=_DIRECT_CHAT_MEMORY_EXTRACTION_SYSTEM_PROMPT,
)

_persist_direct_chat_transcript_best_effort = partial(
    direct_chat_support_binding_service.persist_direct_chat_transcript_best_effort,
    save_session_transcript_fn=save_session_transcript,
)

_build_context_used = direct_chat_support_binding_service.build_context_used


_with_context_used = direct_chat_metadata_service.with_context_used


_connect_action = direct_chat_availability_service.connect_action
_open_action = direct_chat_availability_service.open_action


_google_repair_action = partial(
    direct_chat_availability_service.google_repair_action,
    connect_action_fn=_connect_action,
)


_run_action = direct_chat_availability_service.run_action
_workflow_action = direct_chat_availability_service.workflow_action


_question_like = partial(
    direct_chat_availability_service.question_like,
    question_openers=QUESTION_OPENERS,
)


_mentions_any = lambda compact_message, markers: direct_chat_availability_service.mentions_any(
    compact_message,
    markers=markers,
)


_starts_like_direct_run = partial(
    direct_chat_availability_service.starts_like_direct_run,
    direct_run_openers=DIRECT_RUN_OPENERS,
)


_is_obvious_telegram_write_request = lambda compact_message: direct_chat_availability_service.is_obvious_telegram_write_request(
    compact_message,
    question_like_fn=_question_like,
    mentions_any_fn=_mentions_any,
    starts_like_direct_run_fn=_starts_like_direct_run,
    telegram_keywords=TELEGRAM_KEYWORDS,
)
_is_obvious_google_write_request = lambda compact_message: direct_chat_availability_service.is_obvious_google_write_request(
    compact_message,
    question_like_fn=_question_like,
    starts_like_direct_run_fn=_starts_like_direct_run,
)
_is_obvious_smtp_write_request = lambda compact_message: direct_chat_availability_service.is_obvious_smtp_write_request(
    compact_message,
    question_like_fn=_question_like,
    mentions_any_fn=_mentions_any,
    starts_like_direct_run_fn=_starts_like_direct_run,
    smtp_keywords=SMTP_KEYWORDS,
)
_connector_write_preview_allowed = lambda message, availability: direct_chat_availability_service.connector_write_preview_allowed(
    message,
    availability,
    compact_text_fn=_compact_text,
    is_obvious_telegram_write_request_fn=_is_obvious_telegram_write_request,
    is_obvious_google_write_request_fn=_is_obvious_google_write_request,
    is_obvious_smtp_write_request_fn=_is_obvious_smtp_write_request,
    tool_runtime_usable_fn=_tool_runtime_usable,
)


_is_explicit_workflow_request = partial(
    direct_chat_availability_service.is_explicit_workflow_request,
    compact_text_fn=_compact_text,
    mentions_any_fn=_mentions_any,
    workflow_request_markers=WORKFLOW_REQUEST_MARKERS,
)


_no_ai_chat_response = partial(
    direct_chat_availability_service.no_ai_chat_response,
    normalize_tool_capabilities_fn=lambda availability: _normalize_tool_capabilities(availability),
    connect_action_fn=lambda label, href: _connect_action(label, href),
)


_tool_gate_response = lambda message, availability: direct_chat_availability_service.tool_gate_response(
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
_suggest_actions = lambda message, availability: direct_chat_availability_service.suggest_actions(
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
_heartbeat_pending_tasks_for_suggestions = lambda: direct_chat_support_binding_service.heartbeat_pending_tasks_for_suggestions(
    workspace_context_dir_fn=workspace_context_dir,
)


def _recent_run_prompts_for_suggestions(workspace_id: str) -> List[str]:
    try:
        from server_modules.shared import RUN_HISTORY, RUN_HISTORY_LOCK
    except Exception:
        return []
    with RUN_HISTORY_LOCK:
        history_items = list(RUN_HISTORY)
    return direct_chat_support_binding_service.recent_run_prompts_for_suggestions(
        workspace_id,
        run_history=history_items,
    )


_build_proactive_suggestions = partial(
    direct_chat_support_binding_service.build_proactive_suggestions,
    heartbeat_tasks=lambda: _heartbeat_pending_tasks_for_suggestions(),
    recent_run_prompts=lambda workspace_id: _recent_run_prompts_for_suggestions(workspace_id),
    memory_suggestion_prompts=lambda workspace_id: memory_service.memory_suggestion_prompts(
        workspace_id,
        limit=2,
    ),
)


_preview_run_response = lambda message, availability: direct_chat_routing_service.preview_run_response(
    message,
    availability,
    _direct_chat_routing_policy_callbacks(),
)


_action_marker_count = partial(
    direct_chat_routing_service.action_marker_count,
    execution_markers=EXECUTION_MARKERS,
)

_path_like_reference_count = direct_chat_routing_service.path_like_reference_count


_prefer_durable_run_handoff = lambda message, availability: direct_chat_routing_service.prefer_durable_run_handoff(
    message,
    availability,
    _direct_chat_routing_policy_callbacks(),
)


def _direct_chat_routing_policy_callbacks() -> direct_chat_routing_service.DirectChatRoutingPolicyCallbacks:
    return direct_chat_operator_binding_service.build_direct_chat_routing_policy_callbacks(
        namespace=globals(),
        complex_task_sequence_markers=COMPLEX_TASK_SEQUENCE_MARKERS,
        complex_task_outcome_markers=COMPLEX_TASK_OUTCOME_MARKERS,
        execution_markers=EXECUTION_MARKERS,
        google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
        telegram_keywords=TELEGRAM_KEYWORDS,
        slack_keywords=SLACK_KEYWORDS,
        dropbox_keywords=DROPBOX_KEYWORDS,
        s3_keywords=S3_KEYWORDS,
    )


_durable_run_preferred_response = partial(
    direct_chat_handoff_facade_service.durable_run_preferred_response,
    run_action_fn=_run_action,
)

_run_handoff_execution_target = direct_chat_handoff_facade_service.run_handoff_execution_target
_can_auto_start_run_handoff = direct_chat_handoff_facade_service.can_auto_start_run_handoff

_direct_chat_run_handoff_failure_payload = partial(
    direct_chat_handoff_facade_service.direct_chat_run_handoff_failure_payload,
    run_action_fn=_run_action,
)


_start_direct_chat_run_handoff = partial(
    direct_chat_handoff_facade_service.start_direct_chat_run_handoff,
    safe_positive_int_fn=lambda value, default: _safe_positive_int(value, default),
)


_direct_chat_run_handoff_reply = partial(
    direct_chat_handoff_facade_service.direct_chat_run_handoff_reply,
    open_action_fn=_open_action,
)

_direct_chat_run_actions = partial(
    direct_chat_handoff_facade_service.direct_chat_run_actions,
    open_action_fn=_open_action,
)

_direct_chat_run_snapshot = direct_chat_handoff_facade_service.direct_chat_run_snapshot
_direct_chat_run_event_to_step = direct_chat_handoff_facade_service.direct_chat_run_event_to_step
_direct_chat_run_snapshot_to_step = direct_chat_handoff_facade_service.direct_chat_run_snapshot_to_step


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
    return direct_chat_handoff_facade_service.direct_chat_run_final_payload(
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
    yield from direct_chat_handoff_facade_service.stream_direct_chat_run_handoff(
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


_provider_supports_direct_tool_calls = direct_chat_tool_catalog_service.provider_supports_direct_tool_calls


def _direct_chat_tool_policy_callbacks() -> direct_chat_tool_catalog_service.DirectChatToolPolicyCallbacks:
    return direct_chat_operator_binding_service.build_direct_chat_tool_policy_callbacks(
        namespace=globals(),
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


_build_local_direct_chat_tools = partial(
    direct_chat_tool_catalog_service.build_local_direct_chat_tools,
    local_worker_available=_local_worker_available,
)


_build_direct_chat_tools = direct_chat_tool_catalog_service.build_direct_chat_tools
_build_builtin_direct_chat_tools = direct_chat_tool_catalog_service.build_builtin_direct_chat_tools
registered_direct_chat_tool_names_for_logging = direct_chat_tool_catalog_service.registered_direct_chat_tool_names_for_logging


_message_requests_http_request_tool = lambda message: direct_chat_tool_catalog_service.message_requests_http_request_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_requests_image_generation_tool = lambda message: direct_chat_tool_catalog_service.message_requests_image_generation_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_requests_browser_tool = lambda message: direct_chat_tool_catalog_service.message_requests_browser_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_can_use_direct_connector_tools = lambda message, *, provider, tools: direct_chat_tool_catalog_service.message_can_use_direct_connector_tools(
    message,
    provider=provider,
    tools=tools,
    callbacks=_direct_chat_tool_policy_callbacks(),
)
_looks_like_local_path_request = direct_chat_tool_catalog_service.looks_like_local_path_request
_message_requests_local_file_tool = lambda message: direct_chat_tool_catalog_service.message_requests_local_file_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_requests_local_shell_tool = lambda message: direct_chat_tool_catalog_service.message_requests_local_shell_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_requests_local_screenshot_tool = lambda message: direct_chat_tool_catalog_service.message_requests_local_screenshot_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_requests_local_computer_tool = lambda message: direct_chat_tool_catalog_service.message_requests_local_computer_tool(
    message,
    _direct_chat_tool_policy_callbacks(),
)
_message_can_use_direct_local_tools = lambda message, *, provider, tools: direct_chat_tool_catalog_service.message_can_use_direct_local_tools(
    message,
    provider=provider,
    tools=tools,
    callbacks=_direct_chat_tool_policy_callbacks(),
)
_message_can_use_builtin_direct_tools = lambda message, *, tools: direct_chat_tool_catalog_service.message_can_use_builtin_direct_tools(
    message,
    tools=tools,
    callbacks=_direct_chat_tool_policy_callbacks(),
)
_parse_tool_name = direct_chat_operator_binding_service.parse_tool_name
_tool_arguments_payload = lambda arguments: direct_chat_operator_binding_service.tool_arguments_payload(
    arguments,
    parse_json_object_loose_fn=parse_json_object_loose,
)


_extract_first_email = direct_tool_config_service.extract_first_email
_extract_subject_text = direct_tool_config_service.extract_subject_text
_extract_body_text = direct_tool_config_service.extract_body_text
_first_non_empty_line = direct_tool_config_service.first_non_empty_line


_build_direct_tool_config = partial(
    direct_tool_config_service.build_direct_tool_config,
    parse_json_object_loose=parse_json_object_loose,
)


_build_direct_local_tool_config = direct_tool_config_service.build_direct_local_tool_config


_tool_write_action_available = direct_tool_config_service.tool_write_action_available


_normalize_direct_approved_action = direct_chat_operator_binding_service.normalize_direct_approved_action


_approved_action_to_tool_call = partial(
    direct_tool_config_service.approved_action_to_tool_call,
    parse_json_object_loose=parse_json_object_loose,
)


_run_async_tool_call = direct_tool_config_service.run_async_tool_call
_format_direct_tool_result = direct_tool_config_service.format_direct_tool_result
_format_direct_local_tool_result = direct_tool_config_service.format_direct_local_tool_result


_titleize_direct_step_token = direct_chat_operator_binding_service.titleize_direct_step_token
_compact_step_detail = direct_chat_operator_binding_service.compact_step_detail


_direct_tool_step_payload = lambda connector_id, action_id, arguments, *, step_id, status, detail_override=None: direct_tool_execution_service.direct_tool_step_payload(
    connector_id,
    action_id,
    arguments,
    step_id=step_id,
    status=status,
    detail_override=detail_override,
    callbacks=_direct_tool_execution_callbacks(),
)


_thinking_step_payload = direct_tool_execution_service.thinking_step_payload
_extract_first_url = direct_tool_execution_service.extract_first_url
_extract_first_path_reference = direct_tool_execution_service.extract_first_path_reference
_resolve_chat_local_path = direct_tool_execution_service.resolve_chat_local_path


def _direct_tool_execution_callbacks() -> direct_tool_execution_service.DirectToolExecutionCallbacks:
    return direct_chat_operator_binding_service.build_direct_tool_execution_callbacks(
        namespace=globals(),
        parse_json_object_loose=parse_json_object_loose,
        llm_task=llm_task,
        web_search=web_search,
        web_fetch=web_fetch,
        search_memory_notebook=search_memory_notebook,
        get_memory_notebook_excerpt=get_memory_notebook_excerpt,
    )


_no_provider_execution_services = lambda: direct_tool_runtime_facade_service.build_no_provider_execution_services(
    callbacks=_direct_chat_runtime_facade_callbacks(),
)
_build_direct_tool_approval_response = lambda *, tool_calls, tool_capabilities, session_ctx=None: direct_tool_runtime_facade_service.build_direct_tool_approval_response(
    tool_calls=tool_calls,
    tool_capabilities=tool_capabilities,
    session_ctx=session_ctx,
    callbacks=_direct_chat_runtime_facade_callbacks(),
)
_message_has_obvious_direct_tool_intent = lambda message, tools: direct_tool_runtime_facade_service.message_has_obvious_direct_tool_intent(
    message,
    tools,
    callbacks=_direct_chat_runtime_facade_callbacks(),
)


_direct_tool_followup_message = direct_tool_execution_service.direct_tool_followup_message


_execute_single_direct_tool_call = lambda *, tool_call, workspace_id, thread_id, index=1, provider=None, model=None, credentials=None, reasoning_effort="", session_ctx=None: direct_tool_execution_service.execute_single_direct_tool_call(
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
_execute_direct_tool_calls = lambda *, tool_calls, workspace_id, thread_id, provider=None, model=None, credentials=None, reasoning_effort="", session_ctx=None: direct_tool_execution_service.execute_direct_tool_calls(
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


_credential_auth_mode = lambda provider, credentials: direct_chat_provider_facade_service.credential_auth_mode(
    provider,
    credentials,
    normalize_auth_mode_fn=normalize_auth_mode,
)
_supports_direct_message_native_chat = lambda provider, credentials: direct_chat_provider_facade_service.supports_direct_message_native_chat(
    provider,
    credentials,
    credential_auth_mode_fn=_credential_auth_mode,
    get_claude_code_session_token_fn=get_claude_code_session_token,
    provider_has_key_fn=provider_has_key,
)
_preferred_provider = lambda workspace_id, requested_provider="": direct_chat_provider_facade_service.preferred_provider(
    workspace_id,
    requested_provider,
    supported_providers=SUPPORTED_PROVIDERS,
    direct_chat_credentials_fn=_direct_chat_credentials,
    supports_direct_message_native_chat_fn=_supports_direct_message_native_chat,
    credential_auth_mode_fn=_credential_auth_mode,
)


_provider_display_name = direct_chat_provider_facade_service.provider_display_name


_provider_unavailable_response = partial(
    direct_chat_provider_facade_service.provider_unavailable_response,
    connect_action_fn=lambda label, href: _connect_action(label, href),
)


_direct_chat_credentials = lambda workspace_id, provider: direct_chat_provider_facade_service.direct_chat_credentials(
    workspace_id,
    provider,
    build_provider_credential_candidates_fn=_build_provider_credential_candidates,
)


_normalize_reasoning_effort = direct_chat_provider_facade_service.normalize_reasoning_effort


_direct_chat_error_reply = partial(
    direct_chat_provider_facade_service.direct_chat_error_reply,
    chat_iteration_limit_reply_fn=lambda limit: _chat_iteration_limit_reply(limit),
    safe_positive_int_fn=lambda value, default: _safe_positive_int(value, default),
    chat_max_iterations_default=CHAT_MAX_ITERATIONS_DEFAULT,
)


_DIRECT_TOOL_RESULT_SUMMARY_SYSTEM_MESSAGE = (
    "Do not repeat or quote file contents, shell output, or tool results in your response. "
    "Use the information to answer the user's question directly and concisely. "
    "Never paste raw content."
)


def _direct_chat_callback_facade_inputs() -> direct_chat_callback_facade_service.DirectChatCallbackFacadeInputs:
    return direct_chat_operator_binding_service.build_direct_chat_callback_facade_inputs(
        namespace=globals(),
        parse_page_state=parse_json_object_loose,
        capture_exception=sentry_sdk.capture_exception,
        generate_chat_reply_stream_with_provider_fallback=generate_chat_reply_stream_with_provider_fallback,
        parse_memory_write=memory_service.parse_no_provider_memory_write,
        parse_memory_read=memory_service.parse_no_provider_memory_read,
        handle_memory_request=memory_service.handle_no_provider_memory_request,
        compact_conversation_history=compact_conversation_history,
        direct_chat_compaction_token_limit=DIRECT_CHAT_COMPACTION_TOKEN_LIMIT,
        list_memory_entries=list_memory_entries,
        get_memory=get_memory,
        delete_memory=delete_memory,
        no_provider_reasoning_required_response=no_provider_service.no_provider_reasoning_required_response,
        supported_providers=list(SUPPORTED_PROVIDERS),
    )


_direct_chat_generation_services = lambda: direct_chat_composition_service.build_direct_chat_generation_services(
    _direct_chat_callback_facade_inputs(),
)
_direct_chat_runtime_facade_callbacks = lambda: direct_chat_composition_service.build_direct_chat_runtime_facade_callbacks(
    _direct_chat_callback_facade_inputs(),
)
_prepare_direct_chat_request = lambda *, resolved_turn_request, session_ctx, message, workspace_id, thread_id, requested_model, requested_provider, prior_messages, reasoning_effort, availability, approved_action, max_iterations: direct_chat_composition_service.prepare_direct_chat_request(
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
_direct_chat_response_services = lambda: direct_chat_composition_service.build_direct_chat_response_services(
    callbacks=_direct_chat_runtime_facade_callbacks(),
)
_direct_chat_runtime_services = lambda: direct_chat_composition_service.build_direct_chat_runtime_services(
    callbacks=_direct_chat_runtime_facade_callbacks(),
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
    yield from direct_chat_runtime_entry_facade_service.build_direct_operator_reply(
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
    return direct_chat_runtime_entry_facade_service.collect_direct_operator_reply(
        services=_direct_chat_runtime_services(),
        **kwargs,
    )


def build_chat_turn_event_stream(
    *,
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Iterator[Dict[str, Any]]:
    return direct_chat_runtime_entry_facade_service.build_chat_turn_event_stream(
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
    return direct_chat_runtime_entry_facade_service.execute_chat_turn(
        services=_direct_chat_runtime_services(),
        session_ctx=session_ctx,
        message=message,
        stream_sink=stream_sink,
        request_meta=request_meta,
    )
