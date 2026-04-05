from __future__ import annotations

import json
import logging
import os
import re
import sentry_sdk
import sys
import time
import importlib.util
from functools import partial
from pathlib import Path
from typing import Any, Dict, List, Optional

from scripts.orion_local_worker_llm import (
    SUPPORTED_PROVIDERS,
    generate_chat_reply_stream_with_provider_fallback,
    generate_chat_reply_with_provider_fallback,
    get_claude_code_session_token,
    parse_json_object_loose,
    provider_has_key,
)
from scripts.orion_local_worker_utils import build_operator_system_prompt
from server_modules import direct_chat_availability_service
from server_modules import direct_chat_handoff_facade_service
from server_modules import direct_chat_memory_facade_service
from server_modules import direct_chat_entry_policy_service
from server_modules import direct_chat_operator_binding_service
from server_modules import direct_chat_operator_support_service
from server_modules import direct_chat_support_binding_service
from server_modules import direct_chat_provider_facade_service
from server_modules import direct_chat_runtime_entry_facade_service
from server_modules import direct_chat_routing_service
from server_modules import direct_chat_context_service
from server_modules import direct_chat_metadata_service
from server_modules import direct_chat_runtime_facade_service
from server_modules import direct_chat_tool_catalog_service
from server_modules import direct_tool_approval_service
from server_modules import direct_tool_config_service
from server_modules import direct_tool_execution_service
from server_modules import direct_tool_loop_guard_service
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


_safe_positive_int = direct_chat_entry_policy_service.safe_positive_int
_resolved_chat_iteration_limit = partial(
    direct_chat_entry_policy_service.resolved_chat_iteration_limit,
    default_limit=CHAT_MAX_ITERATIONS_DEFAULT,
    ceiling=CHAT_MAX_ITERATIONS_CEILING,
    env_var_name="ORION_MAX_CHAT_ITERATIONS",
    safe_positive_int_fn=_safe_positive_int,
)
_chat_iteration_limit_reply = direct_chat_entry_policy_service.chat_iteration_limit_reply
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


_compact_text = lambda value: re.sub(r"\s+", " ", str(value or "").strip()).lower()


_normalize_tool_capabilities = direct_chat_operator_support_service.normalize_tool_capabilities
_tool_capability = direct_chat_operator_support_service.tool_capability
_tool_connected = direct_chat_operator_support_service.tool_connected
_tool_runtime_usable = direct_chat_operator_support_service.tool_runtime_usable
_local_worker_available = direct_chat_operator_support_service.local_worker_available


_agent_machine_owner_user_id = direct_chat_context_service.agent_machine_owner_user_id
_agent_machine_full_trust_for_session = lambda session_ctx: runtime_config.agent_machine_full_trust_enabled(
    _agent_machine_owner_user_id(session_ctx),
)
_availability_lines = partial(
    direct_chat_entry_policy_service.availability_lines,
    normalize_tool_capabilities=_normalize_tool_capabilities,
)
_connected_system_labels = partial(
    direct_chat_entry_policy_service.connected_system_labels,
    normalize_tool_capabilities=_normalize_tool_capabilities,
)
_context_tool_capabilities = partial(
    direct_chat_entry_policy_service.context_tool_capabilities,
    normalize_tool_capabilities=_normalize_tool_capabilities,
    max_context_tool_actions=MAX_CONTEXT_TOOL_ACTIONS,
    max_context_tool_capabilities=MAX_CONTEXT_TOOL_CAPABILITIES,
)
_normalize_prior_messages = partial(
    direct_chat_entry_policy_service.normalize_prior_messages,
    max_direct_chat_prior_message_chars=MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS,
    max_direct_chat_prior_messages=MAX_DIRECT_CHAT_PRIOR_MESSAGES,
)
_direct_tool_session_key = direct_chat_entry_policy_service.direct_tool_session_key
_direct_chat_session_key = direct_chat_entry_policy_service.direct_chat_session_key
_parse_slash_command = direct_chat_entry_policy_service.parse_slash_command
_session_model_preference = partial(
    direct_chat_entry_policy_service.session_model_preference,
    store=_DIRECT_CHAT_MODEL_PREFERENCES,
)
_set_session_model_preference = partial(
    direct_chat_entry_policy_service.set_session_model_preference,
    store=_DIRECT_CHAT_MODEL_PREFERENCES,
)
_mark_thread_cleared = partial(
    direct_chat_entry_policy_service.mark_thread_cleared,
    clear_markers=_DIRECT_CHAT_CLEAR_MARKERS,
)
_consume_thread_cleared = partial(
    direct_chat_entry_policy_service.consume_thread_cleared,
    clear_markers=_DIRECT_CHAT_CLEAR_MARKERS,
)


_active_run_count = direct_chat_operator_support_service.active_run_count


_slash_command_help_text = direct_chat_entry_policy_service.slash_command_help_text


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


_recent_run_prompts_for_suggestions = direct_chat_operator_support_service.recent_run_prompts_for_suggestions


_build_proactive_suggestions = partial(
    direct_chat_support_binding_service.build_proactive_suggestions,
    heartbeat_tasks=lambda: _heartbeat_pending_tasks_for_suggestions(),
    recent_run_prompts=lambda workspace_id: _recent_run_prompts_for_suggestions(workspace_id),
    memory_suggestion_prompts=lambda workspace_id: memory_service.memory_suggestion_prompts(
        workspace_id,
        limit=2,
    ),
)


_action_marker_count = partial(
    direct_chat_routing_service.action_marker_count,
    execution_markers=EXECUTION_MARKERS,
)

_path_like_reference_count = direct_chat_routing_service.path_like_reference_count


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


_direct_chat_run_final_payload = lambda *, run_id, run, snapshot, requested_workspace_id, requested_provider, requested_model, reasoning_effort, connected_systems, tool_capabilities, fallback_reason, reply_override=None, continuing=False: direct_chat_handoff_facade_service.direct_chat_run_final_payload(
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
_stream_direct_chat_run_handoff = lambda *, started_run, requested_workspace_id, requested_provider, requested_model, reasoning_effort, connected_systems, tool_capabilities, fallback_reason: direct_chat_handoff_facade_service.stream_direct_chat_run_handoff(
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


_thinking_step_payload = direct_tool_execution_service.thinking_step_payload
_extract_first_url = direct_tool_execution_service.extract_first_url
_extract_first_path_reference = direct_tool_execution_service.extract_first_path_reference
_resolve_chat_local_path = direct_tool_execution_service.resolve_chat_local_path


_direct_tool_followup_message = direct_tool_execution_service.direct_tool_followup_message


_approval_required_for_direct_tool = lambda connector_id, action_id, arguments, tool_capabilities: direct_tool_approval_service.approval_required_for_direct_tool(
    connector_id,
    action_id,
    arguments,
    tool_capabilities,
    compact_text=_compact_text,
)


_provider_display_name = direct_chat_provider_facade_service.provider_display_name


_normalize_reasoning_effort = direct_chat_provider_facade_service.normalize_reasoning_effort


_DIRECT_TOOL_RESULT_SUMMARY_SYSTEM_MESSAGE = (
    "Do not repeat or quote file contents, shell output, or tool results in your response. "
    "Use the information to answer the user's question directly and concisely. "
    "Never paste raw content."
)


_direct_chat_runtime_bindings = direct_chat_operator_binding_service.build_direct_chat_runtime_bindings(
    namespace=globals(),
    parse_page_state=lambda payload: parse_json_object_loose(payload),
    capture_exception=lambda exc: sentry_sdk.capture_exception(exc),
    generate_chat_reply_stream_with_provider_fallback=lambda **kwargs: generate_chat_reply_stream_with_provider_fallback(**kwargs),
    parse_memory_write=lambda value: memory_service.parse_no_provider_memory_write(value),
    parse_memory_read=lambda value: memory_service.parse_no_provider_memory_read(value),
    handle_memory_request=lambda workspace_id, message: memory_service.handle_no_provider_memory_request(workspace_id, message),
    compact_conversation_history=lambda *args, **kwargs: compact_conversation_history(*args, **kwargs),
    direct_chat_compaction_token_limit=DIRECT_CHAT_COMPACTION_TOKEN_LIMIT,
    list_memory_entries=lambda workspace_id: list_memory_entries(workspace_id),
    get_memory=lambda workspace_id: get_memory(workspace_id),
    delete_memory=lambda workspace_id, key: delete_memory(workspace_id, key),
    no_provider_reasoning_required_response=lambda: no_provider_service.no_provider_reasoning_required_response(),
    supported_providers=list(SUPPORTED_PROVIDERS),
)
_direct_chat_policy_bindings = direct_chat_operator_binding_service.build_direct_chat_policy_bindings(
    namespace=globals(),
    complex_task_sequence_markers=COMPLEX_TASK_SEQUENCE_MARKERS,
    complex_task_outcome_markers=COMPLEX_TASK_OUTCOME_MARKERS,
    execution_markers=EXECUTION_MARKERS,
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
    parse_json_object_loose=lambda value: parse_json_object_loose(value),
    llm_task=lambda **kwargs: llm_task(**kwargs),
    web_search=lambda **kwargs: web_search(**kwargs),
    web_fetch=lambda **kwargs: web_fetch(**kwargs),
    search_memory_notebook=lambda *args, **kwargs: search_memory_notebook(*args, **kwargs),
    get_memory_notebook_excerpt=lambda *args, **kwargs: get_memory_notebook_excerpt(*args, **kwargs),
)
_direct_chat_routing_policy_callbacks = _direct_chat_policy_bindings.routing_policy_callbacks
_direct_chat_tool_policy_callbacks = _direct_chat_policy_bindings.tool_policy_callbacks
_direct_tool_execution_callbacks = _direct_chat_policy_bindings.direct_tool_execution_callbacks
_direct_chat_entry_bindings = direct_chat_operator_binding_service.build_direct_chat_entry_bindings(
    availability_lines=_availability_lines,
    build_operator_system_prompt=build_operator_system_prompt,
    memory_tool_names=_MEMORY_NOTEBOOK_TOOL_NAMES,
    local_worker_registry=LOCAL_WORKER_REGISTRY,
    is_worker_online_fn=lambda *args, **kwargs: _is_worker_online(*args, **kwargs),
    preferred_provider_fn=lambda workspace_id, requested_provider="": _preferred_provider(workspace_id, requested_provider),
    supports_direct_message_native_chat_fn=lambda provider, credentials: _supports_direct_message_native_chat(provider, credentials),
    resolve_workspace_tool_capabilities_fn=lambda workspace_id: resolve_workspace_tool_capabilities(workspace_id),
    supported_providers=SUPPORTED_PROVIDERS,
    direct_chat_credentials_fn=lambda workspace_id, provider: _direct_chat_credentials(workspace_id, provider),
    build_provider_credential_candidates_fn=lambda *args, **kwargs: _build_provider_credential_candidates(*args, **kwargs),
    compact_text_fn=_compact_text,
    mentions_any_fn=_mentions_any,
    message_requests_local_file_tool_fn=lambda message: _message_requests_local_file_tool(message),
    message_requests_local_shell_tool_fn=lambda message: _message_requests_local_shell_tool(message),
    message_requests_local_screenshot_tool_fn=lambda message: _message_requests_local_screenshot_tool(message),
    message_requests_local_computer_tool_fn=lambda message: _message_requests_local_computer_tool(message),
    is_obvious_smtp_write_request_fn=lambda message: _is_obvious_smtp_write_request(message),
    preview_run_response_fn=lambda message, availability: _preview_run_response(message, availability),
    prefer_durable_run_handoff_fn=lambda message, availability: _prefer_durable_run_handoff(message, availability),
    durable_run_preferred_response_fn=lambda message: _durable_run_preferred_response(message),
    message_can_use_direct_connector_tools_fn=lambda message, *, provider, tools: _message_can_use_direct_connector_tools(message, provider=provider, tools=tools),
    message_can_use_direct_local_tools_fn=lambda message, *, provider, tools: _message_can_use_direct_local_tools(message, provider=provider, tools=tools),
    message_can_use_builtin_direct_tools_fn=lambda message, *, tools: _message_can_use_builtin_direct_tools(message, tools=tools),
    can_auto_start_run_handoff_fn=lambda availability: _can_auto_start_run_handoff(availability),
    credential_auth_mode_fn=lambda provider, credentials: _credential_auth_mode(provider, credentials),
    normalize_auth_mode_fn=normalize_auth_mode,
    get_claude_code_session_token_fn=lambda: get_claude_code_session_token(),
    provider_has_key_fn=lambda provider: provider_has_key(provider),
    connect_action_fn=lambda label, href: _connect_action(label, href),
    chat_iteration_limit_reply_fn=lambda limit: _chat_iteration_limit_reply(limit),
    safe_positive_int_fn=lambda value, default: _safe_positive_int(value, default),
    chat_max_iterations_default=CHAT_MAX_ITERATIONS_DEFAULT,
    google_workspace_keywords=GOOGLE_WORKSPACE_KEYWORDS,
    telegram_keywords=TELEGRAM_KEYWORDS,
    slack_keywords=SLACK_KEYWORDS,
    discord_keywords=DISCORD_KEYWORDS,
    dropbox_keywords=DROPBOX_KEYWORDS,
    s3_keywords=S3_KEYWORDS,
)
_build_direct_chat_system_prompt = _direct_chat_entry_bindings.build_direct_chat_system_prompt
_direct_chat_runtime_available = _direct_chat_entry_bindings.direct_chat_runtime_available
_resolve_direct_chat_availability = _direct_chat_entry_bindings.resolve_direct_chat_availability
_connected_provider_tokens = _direct_chat_entry_bindings.connected_provider_tokens
_resolve_provider_for_direct_chat_message = _direct_chat_entry_bindings.resolve_provider_for_direct_chat_message
_plan_direct_chat_route = _direct_chat_entry_bindings.plan_direct_chat_route
_credential_auth_mode = _direct_chat_entry_bindings.credential_auth_mode
_supports_direct_message_native_chat = _direct_chat_entry_bindings.supports_direct_message_native_chat
_preferred_provider = _direct_chat_entry_bindings.preferred_provider
_provider_unavailable_response = _direct_chat_entry_bindings.provider_unavailable_response
_direct_chat_credentials = _direct_chat_entry_bindings.direct_chat_credentials
_direct_chat_error_reply = _direct_chat_entry_bindings.direct_chat_error_reply
_direct_chat_tool_runtime_bindings = direct_chat_operator_binding_service.build_direct_chat_tool_runtime_bindings(
    direct_chat_runtime_facade_callbacks=lambda: _direct_chat_runtime_facade_callbacks(),
    direct_tool_execution_callbacks=lambda: _direct_tool_execution_callbacks(),
    execute_single_direct_tool_call_fn=lambda **kwargs: _execute_single_direct_tool_call(**kwargs),
)
_direct_tool_step_payload = _direct_chat_tool_runtime_bindings.direct_tool_step_payload
_no_provider_execution_services = _direct_chat_tool_runtime_bindings.no_provider_execution_services
_build_direct_tool_approval_response = _direct_chat_tool_runtime_bindings.build_direct_tool_approval_response
_message_has_obvious_direct_tool_intent = _direct_chat_tool_runtime_bindings.message_has_obvious_direct_tool_intent
_execute_single_direct_tool_call = _direct_chat_tool_runtime_bindings.execute_single_direct_tool_call
_execute_direct_tool_calls = _direct_chat_tool_runtime_bindings.execute_direct_tool_calls
_direct_chat_callback_facade_inputs = _direct_chat_runtime_bindings.callback_facade_inputs
_direct_chat_generation_services = _direct_chat_runtime_bindings.generation_services
_direct_chat_runtime_facade_callbacks = _direct_chat_runtime_bindings.runtime_facade_callbacks
_prepare_direct_chat_request = _direct_chat_runtime_bindings.prepare_request
_direct_chat_response_services = _direct_chat_runtime_bindings.response_services
_direct_chat_runtime_services = _direct_chat_runtime_bindings.runtime_services


_preview_run_response = lambda message, availability: direct_chat_routing_service.preview_run_response(
    message,
    availability,
    _direct_chat_routing_policy_callbacks(),
)


_prefer_durable_run_handoff = lambda message, availability: direct_chat_routing_service.prefer_durable_run_handoff(
    message,
    availability,
    _direct_chat_routing_policy_callbacks(),
)


build_direct_operator_reply = lambda *, message, workspace_id, requested_model, requested_provider, thread_id="", prior_messages=None, reasoning_effort="", availability=None, approved_action=None, max_iterations=None, session_ctx=None, agent_turn_request=None: direct_chat_runtime_entry_facade_service.build_direct_operator_reply(
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
collect_direct_operator_reply = lambda **kwargs: direct_chat_runtime_entry_facade_service.collect_direct_operator_reply(
    services=_direct_chat_runtime_services(),
    **kwargs,
)
build_chat_turn_event_stream = lambda *, session_ctx, message, request_meta=None: direct_chat_runtime_entry_facade_service.build_chat_turn_event_stream(
    services=_direct_chat_runtime_services(),
    session_ctx=session_ctx,
    message=message,
    request_meta=request_meta,
)
execute_chat_turn = lambda session_ctx, message, stream_sink=None, request_meta=None: direct_chat_runtime_entry_facade_service.execute_chat_turn(
    services=_direct_chat_runtime_services(),
    session_ctx=session_ctx,
    message=message,
    stream_sink=stream_sink,
    request_meta=request_meta,
)
