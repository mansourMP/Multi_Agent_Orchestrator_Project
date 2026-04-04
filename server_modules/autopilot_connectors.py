from __future__ import annotations
import asyncio, os, json, time, threading, base64, certifi, html, ssl, re, uuid, mimetypes, hashlib
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, quote_plus
from urllib import request as urlrequest, error as urlerror
from server_modules.automation_intents import classify_automation_intent
from server_modules.connectors.telegram_camera_setup_service import TelegramCameraSetupService
from server_modules.connectors.telegram_media_service import TelegramMediaService, telegram_safe_path_token
from server_modules.connectors.telegram_profile_service import (
    TELEGRAM_PROFILE_FIELDS as _TELEGRAM_PROFILE_FIELDS,
    TelegramProfileService,
)
from server_modules.connectors.telegram_action_service import TelegramActionService
from server_modules.connectors.autopilot_status_service import AutopilotStatusService
from server_modules.connectors.telegram_inbound_context_service import TelegramInboundContextService
from server_modules.connectors.telegram_autopilot_loop_service import TelegramAutopilotLoopService
from server_modules.connectors.telegram_poll_cycle_service import TelegramPollCycleService
from server_modules.connectors.telegram_poll_dispatch_service import TelegramPollDispatchService
from server_modules.connectors.telegram_poll_state_service import TelegramPollStateService
from server_modules.connectors.telegram_run_action_service import TelegramRunActionService
from server_modules.connectors.telegram_run_dispatch_service import TelegramRunDispatchService
from server_modules.connectors.telegram_routing_service import TelegramRoutingService
from server_modules.connectors.telegram_sender_filter_service import TelegramSenderFilterService
from server_modules.connectors.telegram_space_service import telegram_space_question_via_mcp
from server_modules.connectors.whatsapp_run_dispatch_service import WhatsAppRunDispatchService
from server_modules.connectors.whatsapp_webhook_service import WhatsAppWebhookService
from server_modules.installed_skills import query_active_installed_skills
try:
    from fastapi import Request, Response
except Exception:  # pragma: no cover - test fallback when FastAPI is unavailable
    class Request:  # type: ignore[override]
        pass

    class Response:  # type: ignore[override]
        pass
try:
    import fcntl
except Exception:  # pragma: no cover - unavailable on some platforms
    fcntl = None  # type: ignore[assignment]

_server = None
_SYNC_SERVER_GLOBALS = (
    "TELEGRAM_AUTOPILOT_THREAD",
    "TELEGRAM_AUTOPILOT_STATE",
    "WHATSAPP_AUTOPILOT_STATE",
)

_AUTOPILOT_ERROR_CATEGORY_HINTS = (
    ("timed out", "timeout"),
    ("timeout", "timeout"),
    ("connection reset", "connection_reset"),
    ("reset by peer", "connection_reset"),
    ("temporarily unavailable", "network"),
    ("name or service not known", "network"),
    ("network is unreachable", "network"),
    ("connection refused", "network"),
    ("forbidden", "auth"),
    ("unauthorized", "auth"),
    ("invalid api key", "auth"),
    ("authentication", "auth"),
    ("429", "rate_limit"),
    ("too many requests", "rate_limit"),
    ("rate limit", "rate_limit"),
    ("not found", "not_found"),
    ("missing bot_token", "invalid_config"),
    ("missing chat_id", "invalid_config"),
    ("missing account sid", "invalid_config"),
    ("missing auth token", "invalid_config"),
    ("missing from number", "invalid_config"),
    ("no matching whatsapp connector", "connector_match"),
)

_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS = (
    "missing scopes",
    "api.responses.write",
    "invalid api key",
    "incorrect api key",
    "unauthorized",
    "forbidden",
    "no credentials available",
    "api key is required",
    "api_key is required",
    "reconnect your ai account",
)

_AUTOPILOT_EVENT_DEDUP_LOCK = threading.Lock()
_AUTOPILOT_EVENT_DEDUP: Dict[str, float] = {}

EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
EMPYRALIST_RUNTIME_URL = os.getenv("EMPYRALIST_RUNTIME_URL", "http://127.0.0.1:8001").strip().rstrip("/") or "http://127.0.0.1:8001"
EMPYRALIST_WORKFLOW_API_URL = os.getenv("EMPYRALIST_WORKFLOW_API_URL", "http://127.0.0.1:4000/api/v1").strip().rstrip("/") or "http://127.0.0.1:4000/api/v1"
_TELEGRAM_POLL_LOCK_DIR = EMPYRALIS_STATE_HOME / "channels" / "telegram"


@contextmanager
def _telegram_get_updates_process_lock(bot_token: str):
    if fcntl is None:
        yield True
        return
    _TELEGRAM_POLL_LOCK_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(str(bot_token or "").encode("utf-8")).hexdigest()[:16]
    lock_path = _TELEGRAM_POLL_LOCK_DIR / f"getupdates-{digest}.lock"
    handle = lock_path.open("a+", encoding="utf-8")
    acquired = False
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
        except BlockingIOError:
            yield False
            return
        yield True
    finally:
        if acquired:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass
        handle.close()
EMPYRALIST_WEB_URL = os.getenv("EMPYRALIST_WEB_URL", "http://127.0.0.1:3000").strip().rstrip("/") or "http://127.0.0.1:3000"


def _resolve_state_file(env_name: str, default_relative: str, legacy_filename: Optional[str] = None) -> Path:
    explicit = os.getenv(env_name)
    if explicit is not None and explicit.strip():
        return Path(explicit.strip()).expanduser()
    preferred = (EMPYRALIS_STATE_HOME / default_relative).expanduser()
    if legacy_filename:
        legacy_path = Path(legacy_filename)
        if legacy_path.exists() and not preferred.exists():
            return legacy_path
    return preferred


def _resolve_state_dir(env_name: str, default_relative: str, legacy_dirname: Optional[str] = None) -> Path:
    explicit = os.getenv(env_name)
    if explicit is not None and explicit.strip():
        return Path(explicit.strip()).expanduser()
    preferred = (EMPYRALIS_STATE_HOME / default_relative).expanduser()
    if legacy_dirname:
        legacy_path = Path(legacy_dirname)
        if legacy_path.exists() and not preferred.exists():
            return legacy_path
    return preferred


ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE",
    "channels/telegram/camera_setup_state.json",
    ".orion_telegram_camera_setup_state.json",
)


ORION_TELEGRAM_SPACE_STATUS_ENABLED = os.getenv("ORION_TELEGRAM_SPACE_STATUS_ENABLED", "0") == "1"

ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS = os.getenv("ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS", "0") == "1"
ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED = os.getenv("ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED", "0") == "1"
ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED = os.getenv("ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED", "0") == "1"
ORION_TELEGRAM_MEDIA_ENABLED = os.getenv("ORION_TELEGRAM_MEDIA_ENABLED", "1") == "1"
ORION_TELEGRAM_MEDIA_DIR = _resolve_state_dir(
    "ORION_TELEGRAM_MEDIA_DIR",
    "channels/telegram/media",
    ".orion-media/telegram",
)
ORION_TELEGRAM_MEDIA_MAX_ITEMS = max(1, int(os.getenv("ORION_TELEGRAM_MEDIA_MAX_ITEMS", "4") or 4))
ORION_TELEGRAM_MEDIA_MAX_BYTES = max(1024 * 128, int(os.getenv("ORION_TELEGRAM_MEDIA_MAX_BYTES", str(10 * 1024 * 1024)) or str(10 * 1024 * 1024)))
ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL = os.getenv("ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL", "1") == "1"
ORION_CHANNEL_DEAD_LETTER_FILE = _resolve_state_file(
    "ORION_CHANNEL_DEAD_LETTER_FILE",
    "channels/dead_letters.json",
    ".orion_channel_dead_letters.json",
)
ORION_CHANNEL_DEAD_LETTER_LIMIT = max(50, int(os.getenv("ORION_CHANNEL_DEAD_LETTER_LIMIT", "500") or 500))
_CHANNEL_DEAD_LETTER_LOCK = threading.Lock()
ORION_TELEGRAM_PROFILE_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_PROFILE_STATE_FILE",
    "channels/telegram/chat_profiles.json",
    ".orion_telegram_chat_profiles.json",
)
ORION_TELEGRAM_ONBOARDING_ENABLED = os.getenv("ORION_TELEGRAM_ONBOARDING_ENABLED", "1") == "1"
ORION_TELEGRAM_ONBOARDING_STATE_FILE = _resolve_state_file(
    "ORION_TELEGRAM_ONBOARDING_STATE_FILE",
    "channels/telegram/chat_onboarding.json",
    ".orion_telegram_chat_onboarding.json",
)
_TELEGRAM_QUICK_GOAL_TEMPLATES: Dict[str, str] = {
    "project update": "Give me a concise update for my current project with top priorities, blockers, and next 3 actions.",
    "today priorities": "Set my top priorities for today with a realistic execution order and time blocks.",
    "next steps": "Based on my current context, give me the next practical steps I should execute now.",
    "inbox triage": "Triage my incoming messages and tell me what needs urgent action, what can wait, and what should be delegated.",
    "draft message": "Draft a clear, professional message for my current task context. Keep it concise and actionable.",
    "meeting prep": "Prepare me for my next meeting: agenda, talking points, likely questions, and decisions needed.",
    "task breakdown": "Break my goal into a practical task list with priorities and estimated effort.",
}
_TELEGRAM_MENU_GOAL_TEMPLATES: Dict[str, str] = {
    "project update": _TELEGRAM_QUICK_GOAL_TEMPLATES["project update"],
    "today priorities": _TELEGRAM_QUICK_GOAL_TEMPLATES["today priorities"],
    "next steps": _TELEGRAM_QUICK_GOAL_TEMPLATES["next steps"],
    "inbox triage": _TELEGRAM_QUICK_GOAL_TEMPLATES["inbox triage"],
    "draft message": _TELEGRAM_QUICK_GOAL_TEMPLATES["draft message"],
    "meeting prep": _TELEGRAM_QUICK_GOAL_TEMPLATES["meeting prep"],
    "task breakdown": _TELEGRAM_QUICK_GOAL_TEMPLATES["task breakdown"],
    "write follow-up": "Draft a concise professional follow-up message for my current project context.",
    "exam plan": "Build my exam preparation plan for this week with daily tasks, time blocks, and revision checkpoints.",
}
DEFAULT_CHAT_PREFIX = "/empyralis"
_TELEGRAM_PROFILE_SERVICE = TelegramProfileService(
    profile_state_file=ORION_TELEGRAM_PROFILE_STATE_FILE,
    onboarding_state_file=ORION_TELEGRAM_ONBOARDING_STATE_FILE,
    default_chat_prefix=DEFAULT_CHAT_PREFIX,
    read_json=lambda path, default: _safe_read_json(path, default),
    write_json=lambda path, payload: _safe_write_json(path, payload),
    now_iso=lambda: _utc_now_iso(),
    truncate_one_line=lambda text, limit: _truncate_one_line(text, limit),
)
_TELEGRAM_CAMERA_SETUP_SERVICE = TelegramCameraSetupService(
    state_file=ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
    read_json=lambda path, default: _safe_read_json(path, default),
    write_json=lambda path, payload: _safe_write_json(path, payload),
    now_iso=lambda: _utc_now_iso(),
    session_key_builder=lambda workspace_id, chat_id: _telegram_profile_key(workspace_id, chat_id),
)
_TELEGRAM_MEDIA_SERVICE = TelegramMediaService(
    media_dir=ORION_TELEGRAM_MEDIA_DIR,
    media_enabled=ORION_TELEGRAM_MEDIA_ENABLED,
    media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
    media_max_bytes=ORION_TELEGRAM_MEDIA_MAX_BYTES,
    media_include_in_goal=ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL,
    telegram_api_request=lambda bot_token, method, **kwargs: _telegram_api_request(bot_token, method, **kwargs),
)
_TELEGRAM_ROUTING_SERVICE = TelegramRoutingService(
    default_chat_prefix=DEFAULT_CHAT_PREFIX,
    quick_goal_templates=_TELEGRAM_QUICK_GOAL_TEMPLATES,
    menu_goal_templates=_TELEGRAM_MENU_GOAL_TEMPLATES,
    normalize_profile_field=lambda raw_value: _normalize_telegram_profile_field(raw_value),
    select_skill_from_text=lambda raw_text: _telegram_select_skill_from_text(raw_text),
    skill_goal_builder=lambda skill: _telegram_skill_goal(skill),
)
_AUTOPILOT_STATUS_SERVICE: Optional[AutopilotStatusService] = None
_TELEGRAM_RUN_DISPATCH_SERVICE: Optional[TelegramRunDispatchService] = None
_TELEGRAM_SENDER_FILTER_SERVICE: Optional[TelegramSenderFilterService] = None
_TELEGRAM_ACTION_SERVICE: Optional[TelegramActionService] = None
_TELEGRAM_INBOUND_CONTEXT_SERVICE: Optional[TelegramInboundContextService] = None
_TELEGRAM_AUTOPILOT_LOOP_SERVICE: Optional[TelegramAutopilotLoopService] = None
_TELEGRAM_POLL_CYCLE_SERVICE: Optional[TelegramPollCycleService] = None
_TELEGRAM_POLL_DISPATCH_SERVICE: Optional[TelegramPollDispatchService] = None
_TELEGRAM_POLL_STATE_SERVICE: Optional[TelegramPollStateService] = None
_TELEGRAM_RUN_ACTION_SERVICE: Optional[TelegramRunActionService] = None
_WHATSAPP_RUN_DISPATCH_SERVICE: Optional[WhatsAppRunDispatchService] = None
_WHATSAPP_WEBHOOK_SERVICE: Optional[WhatsAppWebhookService] = None


def _telegram_run_dispatch_service() -> TelegramRunDispatchService:
    global _TELEGRAM_RUN_DISPATCH_SERVICE
    if _TELEGRAM_RUN_DISPATCH_SERVICE is None:
        _TELEGRAM_RUN_DISPATCH_SERVICE = TelegramRunDispatchService(
            project_root=PROJECT_ROOT,
            default_timeout_seconds=int(globals().get("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            default_max_reply_chars=int(globals().get("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            send_ack=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_SEND_ACK")),
            include_run_meta=lambda: _autopilot_include_run_meta(),
            humanize_run_summary=lambda text: _humanize_telegram_run_summary(text),
            truncate_one_line=lambda text, limit: _truncate_one_line(text, limit),
            runs_get=lambda run_id: runs.get(run_id),
            latest_run_error_message=lambda run: _latest_run_error_message(run),
            is_non_retryable_run_error=lambda error: _is_non_retryable_run_error(error),
            friendly_run_error=lambda error: _friendly_autopilot_run_error(error),
            summarize_run_terminal_result=lambda run, limit: _summarize_run_terminal_result(run, limit),
            local_companion_snapshot=lambda: _local_companion_snapshot(),
            can_auto_approve_wait=lambda run: _autopilot_can_auto_approve_wait(run),
            pending_confirmation_payload=lambda run: _pending_confirmation_payload(run),
        )
    return _TELEGRAM_RUN_DISPATCH_SERVICE


def _autopilot_status_service() -> AutopilotStatusService:
    global _AUTOPILOT_STATUS_SERVICE
    if _AUTOPILOT_STATUS_SERVICE is None:
        _AUTOPILOT_STATUS_SERVICE = AutopilotStatusService(
            normalize_workspace_id=lambda value: _normalize_workspace_id(value),
            telegram_snapshot=lambda: _telegram_autopilot_snapshot(include_connectors=True),
            telegram_list_entries=lambda: _list_telegram_connector_entries(),
            resolve_telegram_profile=lambda entry: _resolve_telegram_autopilot_profile(entry),
            whatsapp_snapshot=lambda: _whatsapp_autopilot_snapshot(include_connectors=True),
            whatsapp_list_entries=lambda: _list_whatsapp_connector_entries(),
            resolve_whatsapp_profile=lambda entry: _resolve_whatsapp_autopilot_profile(entry),
        )
    return _AUTOPILOT_STATUS_SERVICE


def _telegram_sender_filter_service() -> TelegramSenderFilterService:
    global _TELEGRAM_SENDER_FILTER_SERVICE
    if _TELEGRAM_SENDER_FILTER_SERVICE is None:
        _TELEGRAM_SENDER_FILTER_SERVICE = TelegramSenderFilterService(
            record_channel_event_throttled=lambda **kwargs: _record_channel_event_throttled(**kwargs),
            set_connector_state=lambda connector_id, patch: _set_telegram_connector_state(connector_id, patch),
            utc_now_iso=lambda: _utc_now_iso(),
        )
    return _TELEGRAM_SENDER_FILTER_SERVICE


def _telegram_action_service() -> TelegramActionService:
    global _TELEGRAM_ACTION_SERVICE
    if _TELEGRAM_ACTION_SERVICE is None:
        _TELEGRAM_ACTION_SERVICE = TelegramActionService(
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            onboarding_enabled=ORION_TELEGRAM_ONBOARDING_ENABLED,
            help_text=lambda profile: _telegram_help_text(profile),
            skills_menu_text=lambda profile: _telegram_skills_menu_text(profile),
            menu_keyboard=lambda profile, menu_id: _telegram_menu_keyboard(profile, menu_id),
            onboarding_prompt=lambda step_index, retry: _telegram_onboarding_prompt(step_index, retry),
            onboarding_start=lambda workspace_id, chat_id: _start_telegram_onboarding(workspace_id, chat_id),
            profile_text=lambda profile, chat_profile: _telegram_profile_text(profile, chat_profile),
            profile_help_text=lambda profile: _telegram_profile_help_text(profile),
            profile_set=lambda workspace_id, chat_id, field_name, value: _set_telegram_profile_field(
                workspace_id,
                chat_id,
                field_name,
                value,
            ),
            profile_clear=lambda workspace_id, chat_id, field_name: _clear_telegram_profile(
                workspace_id,
                chat_id,
                field_name,
            ),
            runtime_status_text=lambda workspace_id: _telegram_runtime_status_text(workspace_id),
            approvals_list=lambda limit: _autopilot_approvals_list(limit=limit),
            approvals_text=lambda payload, prefix: _autopilot_approvals_text(payload, prefix=prefix),
            approval_resolve=lambda event_id, approved, note: _autopilot_approval_resolve(
                event_id=event_id,
                approved=approved,
                note=note,
            ),
            approval_result_text=lambda payload, approved: _autopilot_approval_result_text(payload, approved=approved),
            send_message=lambda **kwargs: _telegram_send_message(
                bot_token=kwargs.pop("bot_token", ""),
                chat_id=kwargs.pop("chat_id", ""),
                text=kwargs.pop("text", ""),
                **kwargs,
            ),
        )
    return _TELEGRAM_ACTION_SERVICE


def _telegram_inbound_context_service() -> TelegramInboundContextService:
    global _TELEGRAM_INBOUND_CONTEXT_SERVICE
    if _TELEGRAM_INBOUND_CONTEXT_SERVICE is None:
        _TELEGRAM_INBOUND_CONTEXT_SERVICE = TelegramInboundContextService(
            media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            extract_message=lambda update: _telegram_extract_message(update),
            chat_matches=lambda configured_chat_id, chat: _telegram_chat_matches(configured_chat_id, chat),
            store_attachments=lambda **kwargs: _telegram_store_attachments(**kwargs),
            route_message=lambda message_text, profile: _telegram_route_message(message_text, profile),
            session_key_builder=lambda chat_id: _telegram_session_key(chat_id),
            trace_id_builder=lambda chat_id, update_id, message_id: _telegram_trace_id(chat_id, update_id, message_id),
            record_channel_event=lambda **kwargs: _record_channel_event(**kwargs),
            guided_setup_handler=lambda **kwargs: _telegram_handle_guided_automation_setup(**kwargs),
            send_message=lambda **kwargs: _telegram_send_message(
                kwargs.pop("bot_token", ""),
                kwargs.pop("chat_id", ""),
                kwargs.pop("text", ""),
                **kwargs,
            ),
        )
    return _TELEGRAM_INBOUND_CONTEXT_SERVICE


def _telegram_autopilot_loop_service() -> TelegramAutopilotLoopService:
    global _TELEGRAM_AUTOPILOT_LOOP_SERVICE
    if _TELEGRAM_AUTOPILOT_LOOP_SERVICE is None:
        _TELEGRAM_AUTOPILOT_LOOP_SERVICE = TelegramAutopilotLoopService(
            poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            list_connector_entries=lambda: _list_telegram_connector_entries(),
            set_connectors_seen=lambda count: _telegram_set_connectors_seen(count),
            mark_poll=lambda clear_error: _telegram_autopilot_mark_poll(clear_error=clear_error),
            poll_connector=lambda entry: _telegram_poll_connector(entry),
            autopilot_log=lambda message: _telegram_autopilot_log(message),
            record_channel_event_throttled=lambda **kwargs: _record_channel_event_throttled(**kwargs),
            normalize_workspace_id=lambda value: _normalize_workspace_id(value),
            persist_state=lambda: _persist_telegram_autopilot_state(),
            autopilot_mark_error=lambda detail, source: _telegram_autopilot_mark_error(detail, source=source),
        )
    return _TELEGRAM_AUTOPILOT_LOOP_SERVICE


def _telegram_poll_cycle_service() -> TelegramPollCycleService:
    global _TELEGRAM_POLL_CYCLE_SERVICE
    if _TELEGRAM_POLL_CYCLE_SERVICE is None:
        _TELEGRAM_POLL_CYCLE_SERVICE = TelegramPollCycleService(
            max_updates=ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            notify_pending_approvals=lambda **kwargs: _telegram_notify_pending_approvals(**kwargs),
            get_updates_process_lock=lambda bot_token: _telegram_get_updates_process_lock(bot_token),
            autopilot_log=lambda message: _telegram_autopilot_log(message),
            telegram_api_request=lambda bot_token, method, **kwargs: _telegram_api_request(bot_token, method, **kwargs),
            poll_state_service=lambda: _telegram_poll_state_service(),
            record_channel_event_throttled=lambda **kwargs: _record_channel_event_throttled(**kwargs),
            classify_error=lambda detail: _classify_autopilot_error(detail),
            autopilot_mark_error=lambda detail, source: _telegram_autopilot_mark_error(detail, source=source),
        )
    return _TELEGRAM_POLL_CYCLE_SERVICE


def _telegram_poll_dispatch_service() -> TelegramPollDispatchService:
    global _TELEGRAM_POLL_DISPATCH_SERVICE
    if _TELEGRAM_POLL_DISPATCH_SERVICE is None:
        _TELEGRAM_POLL_DISPATCH_SERVICE = TelegramPollDispatchService(
            sender_allowed=lambda sender, allow_from: _telegram_sender_allowed(sender, allow_from),
            session_key_builder=lambda chat_id: _telegram_session_key(chat_id),
            inbound_context_service=lambda: _telegram_inbound_context_service(),
            sender_filter_service=lambda: _telegram_sender_filter_service(),
            action_service=lambda: _telegram_action_service(),
            run_action_service=lambda: _telegram_run_action_service(),
            get_chat_profile=lambda workspace_id, chat_id: _get_telegram_profile(workspace_id, chat_id),
            explicit_run_command=lambda raw_text: _telegram_is_explicit_run_command(raw_text),
            help_text=lambda profile: _telegram_help_text(profile),
            send_message=lambda *args, **kwargs: _telegram_send_message(*args, **kwargs),
        )
    return _TELEGRAM_POLL_DISPATCH_SERVICE


def _telegram_increment_processed_updates() -> None:
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["processed_updates"] = int(TELEGRAM_AUTOPILOT_STATE.get("processed_updates") or 0) + 1


def _telegram_set_connectors_seen(count: int) -> None:
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["connectors_seen"] = max(0, int(count or 0))


def _telegram_poll_state_service() -> TelegramPollStateService:
    global _TELEGRAM_POLL_STATE_SERVICE
    if _TELEGRAM_POLL_STATE_SERVICE is None:
        _TELEGRAM_POLL_STATE_SERVICE = TelegramPollStateService(
            set_connector_state=lambda connector_id, patch: _set_telegram_connector_state(connector_id, patch),
            utc_now_iso=lambda: _utc_now_iso(),
            increment_processed_updates=lambda: _telegram_increment_processed_updates(),
        )
    return _TELEGRAM_POLL_STATE_SERVICE


def _telegram_run_action_service() -> TelegramRunActionService:
    global _TELEGRAM_RUN_ACTION_SERVICE
    if _TELEGRAM_RUN_ACTION_SERVICE is None:
        _TELEGRAM_RUN_ACTION_SERVICE = TelegramRunActionService(
            onboarding_enabled=ORION_TELEGRAM_ONBOARDING_ENABLED,
            space_status_enabled=ORION_TELEGRAM_SPACE_STATUS_ENABLED,
            max_reply_chars=ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS,
            project_root=PROJECT_ROOT,
            onboarding_get_state=lambda workspace_id, chat_id: _get_telegram_onboarding_state(workspace_id, chat_id),
            onboarding_start=lambda workspace_id, chat_id: _start_telegram_onboarding(workspace_id, chat_id),
            onboarding_consume_answer=lambda workspace_id, chat_id, text: _telegram_onboarding_consume_answer(
                workspace_id,
                chat_id,
                text,
            ),
            onboarding_prompt=lambda step_index, retry: _telegram_onboarding_prompt(step_index, retry=retry),
            profile_get=lambda workspace_id, chat_id: _get_telegram_profile(workspace_id, chat_id),
            profile_has_context=lambda chat_profile: _telegram_profile_has_context(chat_profile),
            help_text=lambda profile: _telegram_help_text(profile),
            build_goal_with_profile=lambda goal, chat_profile: _telegram_build_goal_with_profile(goal, chat_profile),
            build_goal_with_attachments=lambda goal, attachments: _telegram_build_goal_with_attachments(goal, attachments),
            workspace_connector_context=lambda **kwargs: _telegram_workspace_connector_context(**kwargs),
            build_goal_with_connector_context=lambda goal, prompt_append: _telegram_build_goal_with_connector_context(
                goal,
                prompt_append,
            ),
            space_question_via_mcp=lambda goal, enabled, project_root: telegram_space_question_via_mcp(
                goal,
                enabled=enabled,
                project_root=project_root,
            ),
            installed_skill_query=lambda **kwargs: _telegram_installed_skill_query(**kwargs),
            truncate_one_line=lambda text, limit: _truncate_one_line(text, limit),
            send_message=lambda *args, **kwargs: _telegram_send_message(*args, **kwargs),
            send_chat_action=lambda *args, **kwargs: _telegram_send_chat_action(*args, **kwargs),
            edit_message=lambda *args, **kwargs: _telegram_edit_message(*args, **kwargs),
            record_channel_event=lambda **kwargs: _record_channel_event(**kwargs),
            run_dispatch_service=lambda: _telegram_run_dispatch_service(),
            create_run=lambda **kwargs: _create_telegram_run(**kwargs),
        )
    return _TELEGRAM_RUN_ACTION_SERVICE


def _whatsapp_run_dispatch_service() -> WhatsAppRunDispatchService:
    global _WHATSAPP_RUN_DISPATCH_SERVICE
    if _WHATSAPP_RUN_DISPATCH_SERVICE is None:
        _WHATSAPP_RUN_DISPATCH_SERVICE = WhatsAppRunDispatchService(
            default_timeout_seconds=int(globals().get("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            default_max_reply_chars=int(globals().get("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            send_ack=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_SEND_ACK")),
            include_run_meta=lambda: _autopilot_include_run_meta(),
            truncate_one_line=lambda text, limit: _truncate_one_line(text, limit),
            wait_for_run_terminal_status=lambda run_id, timeout_seconds=None, max_reply_chars=None: _wait_for_run_terminal_status(
                run_id,
                timeout_seconds=timeout_seconds,
                max_reply_chars=max_reply_chars,
            ),
            run_reply_text=lambda status, run_id, summary: _autopilot_run_reply_text(status, run_id, summary),
            send_whatsapp_message=lambda **kwargs: _twilio_send_whatsapp_message(**kwargs),
            append_dead_letter=lambda **kwargs: _append_channel_dead_letter(**kwargs),
            record_channel_event=lambda **kwargs: _record_channel_event(**kwargs),
            set_connector_state=lambda connector_id, payload: _set_whatsapp_connector_state(connector_id, payload),
            utc_now_iso=lambda: _utc_now_iso(),
            classify_error=lambda detail: _classify_autopilot_error(detail),
            log_error=lambda message: _whatsapp_autopilot_log(message),
            mark_error=lambda detail: _whatsapp_autopilot_mark_error(detail, source="run_finalize"),
            session_key_builder=lambda reply_to, from_number: _whatsapp_session_key(reply_to, from_number),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
        )
    return _WHATSAPP_RUN_DISPATCH_SERVICE


def _whatsapp_webhook_service() -> WhatsAppWebhookService:
    global _WHATSAPP_WEBHOOK_SERVICE
    if _WHATSAPP_WEBHOOK_SERVICE is None:
        _WHATSAPP_WEBHOOK_SERVICE = WhatsAppWebhookService(
            normalize_number=lambda value: _normalize_whatsapp_number(value),
            session_key_builder=lambda inbound_from, inbound_to: _whatsapp_session_key(inbound_from, inbound_to),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            connector_match=lambda account_sid, inbound_from, inbound_to: _whatsapp_connector_match(
                account_sid,
                inbound_from,
                inbound_to,
            ),
            resolve_profile=lambda entry: _resolve_whatsapp_autopilot_profile(entry),
            route_message=lambda body, profile: _telegram_route_message(body, profile),
            help_text=lambda profile: _whatsapp_help_text(profile),
            runtime_status_text=lambda workspace_id: _runtime_status_text(workspace_id),
            approvals_list=lambda limit: _autopilot_approvals_list(limit=limit),
            approvals_text=lambda payload, prefix: _autopilot_approvals_text(payload, prefix=prefix),
            approval_resolve=lambda event_id, approved, note: _autopilot_approval_resolve(
                event_id=event_id,
                approved=approved,
                note=note,
            ),
            approval_result_text=lambda payload, approved: _autopilot_approval_result_text(payload, approved=approved),
            create_run=lambda **kwargs: _create_whatsapp_run(**kwargs),
            run_dispatch_service=lambda: _whatsapp_run_dispatch_service(),
            record_channel_event=lambda **kwargs: _record_channel_event(**kwargs),
            set_connector_state=lambda connector_id, payload: _set_whatsapp_connector_state(connector_id, payload),
            persist_state=lambda: _persist_whatsapp_autopilot_state(),
            increment_processed=lambda: _whatsapp_autopilot_increment_processed(),
            autopilot_activate=lambda: _whatsapp_autopilot_activate(),
            mark_inbound=lambda **kwargs: _whatsapp_autopilot_mark_inbound(**kwargs),
            mark_error=lambda detail: _whatsapp_autopilot_mark_error(detail, source="match_connector"),
            utc_now_iso=lambda: _utc_now_iso(),
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
        )
    return _WHATSAPP_WEBHOOK_SERVICE


def _runtime_skills_snapshot_safe() -> Dict[str, Any]:
    _init()
    fn = globals().get("_runtime_skills_snapshot")
    if callable(fn):
        try:
            payload = fn()
            if isinstance(payload, dict):
                return payload
        except Exception:
            return {}
    return {}


def _runtime_builtin_skills() -> List[Dict[str, Any]]:
    _init()
    raw = globals().get("RUNTIME_BUILTIN_SKILLS")
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    return []


def _normalize_runtime_skill_card(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    skill_id = str(raw.get("id") or "").strip().lower()
    title = str(raw.get("title") or "").strip()
    intent = str(raw.get("intent") or "").strip()
    if not skill_id or not title or not intent:
        return None
    tools_raw = raw.get("tools")
    tools: List[str] = []
    if isinstance(tools_raw, list):
        for item in tools_raw:
            token = str(item or "").strip()
            if token:
                tools.append(token[:120])
    guardrail = str(raw.get("guardrail") or "").strip()
    return {
        "id": skill_id[:80],
        "title": title[:120],
        "intent": intent[:1200],
        "tools": tools[:30],
        "guardrail": guardrail[:1200],
    }


def _runtime_active_skills(scope_key: str = "assistant_defaults", limit: int = 8) -> List[Dict[str, Any]]:
    scope = "assistant_defaults" if str(scope_key or "").strip().lower() != "automation_defaults" else "automation_defaults"
    snapshot = _runtime_skills_snapshot_safe()
    custom = snapshot.get("custom_skills") if isinstance(snapshot.get("custom_skills"), list) else []
    bindings = snapshot.get("bindings") if isinstance(snapshot.get("bindings"), dict) else {}
    selected_ids_raw = bindings.get(scope) if isinstance(bindings.get(scope), list) else []
    selected_ids = [str(item or "").strip().lower() for item in selected_ids_raw if str(item or "").strip()]
    catalog: Dict[str, Dict[str, Any]] = {}
    for item in _runtime_builtin_skills() + [entry for entry in custom if isinstance(entry, dict)]:
        card = _normalize_runtime_skill_card(item)
        if not card:
            continue
        catalog[card["id"]] = card
    result: List[Dict[str, Any]] = []
    if selected_ids:
        for skill_id in selected_ids:
            item = catalog.get(skill_id)
            if item:
                result.append(item)
    else:
        result = [_normalize_runtime_skill_card(item) for item in _runtime_builtin_skills()]
        result = [item for item in result if isinstance(item, dict)]
    return result[: max(1, int(limit or 8))]


def _telegram_skill_goal(skill: Dict[str, Any]) -> str:
    title = str(skill.get("title") or "").strip() or "Assistant Skill"
    intent = str(skill.get("intent") or "").strip()
    guardrail = str(skill.get("guardrail") or "").strip()
    tools_raw = skill.get("tools") if isinstance(skill.get("tools"), list) else []
    tools = ", ".join(str(item).strip() for item in tools_raw if str(item).strip()) or "none"
    return (
        f"Apply skill '{title}' for this conversation.\n"
        f"Intent: {intent}\n"
        f"Guardrail: {guardrail or 'none'}\n"
        f"Preferred tools: {tools}\n\n"
        "Use my current chat context and give concrete next actions."
    )


def _telegram_select_skill_from_text(raw_text: str) -> Optional[Dict[str, Any]]:
    text = str(raw_text or "").strip()
    if not text:
        return None
    token = text.lower()
    if token.startswith("skill:"):
        token = token.split(":", 1)[1].strip()
    if token.startswith("skill "):
        token = token.split(" ", 1)[1].strip()
    active = _runtime_active_skills("assistant_defaults", limit=20)
    for skill in active:
        skill_id = str(skill.get("id") or "").strip().lower()
        title = str(skill.get("title") or "").strip().lower()
        if token == skill_id or token == title:
            return skill
    if len(token) >= 3:
        for skill in active:
            title = str(skill.get("title") or "").strip().lower()
            if token in title:
                return skill
    return None


def _telegram_skills_menu_text(profile: Dict[str, Any]) -> str:
    skills = _runtime_active_skills("assistant_defaults", limit=8)
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    cmd_prefix = f"{prefix} " if bool(profile.get("require_prefix")) else ""
    lines = ["Skills Menu"]
    if not skills:
        lines.append("- No active skills found. Configure skills in the Empyralis web UI.")
    else:
        lines.append("Tap a skill button or run one directly:")
        for skill in skills:
            lines.append(f"- {cmd_prefix}skill {skill.get('id')}")
    lines.append(f"- {cmd_prefix}menu (back to main)")
    return "\n".join(lines)


def _init():
    global _server
    if _server is None:
        import server as _s
        _server = _s
        for k, v in vars(_s).items():
            if not k.startswith("__") and k not in globals():
                globals()[k] = v
    for k in _SYNC_SERVER_GLOBALS:
        if hasattr(_server, k):
            globals()[k] = getattr(_server, k)


def _classify_autopilot_error(detail: Any) -> str:
    text = str(detail or "").strip().lower()
    if not text:
        return "unknown"
    for hint, category in _AUTOPILOT_ERROR_CATEGORY_HINTS:
        if hint in text:
            return category
    return "unknown"


def _iso_from_epoch(ts: float) -> str:
    value = float(ts)
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")

# --- COPIED LOGIC ---
def _telegram_autopilot_log(message: str):
    ts = _utc_now_iso()
    print(f"[telegram-autopilot {ts}] {message}", flush=True)


def _record_channel_event(
    channel: str,
    direction: str,
    event_type: str,
    text: str = "",
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    session_id: Optional[str] = None,
    message_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    action: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    _init()
    append_fn = globals().get("_append_channel_event")
    if not callable(append_fn):
        return None
    try:
        return append_fn(
            channel=channel,
            direction=direction,
            event_type=event_type,
            text=text,
            workspace_id=workspace_id,
            session_key=session_key,
            session_id=session_id,
            message_id=message_id,
            parent_id=parent_id,
            run_id=run_id,
            action=action,
            metadata=metadata or {},
        )
    except Exception:
        return None


def _append_channel_dead_letter(
    *,
    channel: str,
    direction: str,
    event_type: str,
    reason: str,
    text: str = "",
    workspace_id: str = "",
    session_key: str = "",
    run_id: str = "",
    action: str = "",
    connector_id: str = "",
    trace_id: str = "",
    source_event_id: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    _init()
    item = {
        "id": str(uuid.uuid4()),
        "ts": _utc_now_iso(),
        "channel": str(channel or "").strip().lower(),
        "direction": str(direction or "").strip().lower() or "outbound",
        "event_type": str(event_type or "").strip().lower() or "message",
        "workspace_id": _normalize_workspace_id(workspace_id),
        "session_key": str(session_key or "").strip(),
        "run_id": str(run_id or "").strip(),
        "action": str(action or "").strip().lower(),
        "reason": _truncate_one_line(str(reason or "").strip(), 240),
        "text": _truncate_one_line(str(text or "").strip(), 1600),
        "connector_id": str(connector_id or "").strip(),
        "trace_id": str(trace_id or "").strip(),
        "source_event_id": str(source_event_id or "").strip(),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    with _CHANNEL_DEAD_LETTER_LOCK:
        payload = _safe_read_json(ORION_CHANNEL_DEAD_LETTER_FILE, {"version": 1, "items": []})
        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        items.insert(0, item)
        payload["version"] = 1
        payload["updated_at"] = _utc_now_iso()
        payload["items"] = items[:ORION_CHANNEL_DEAD_LETTER_LIMIT]
        _safe_write_json(ORION_CHANNEL_DEAD_LETTER_FILE, payload)


def _record_channel_event_throttled(
    *,
    channel: str,
    direction: str,
    event_type: str,
    text: str = "",
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    session_id: Optional[str] = None,
    message_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    run_id: Optional[str] = None,
    action: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    dedupe_seconds: float = 30.0,
) -> bool:
    _init()
    normalize_workspace = globals().get("_normalize_workspace_id")
    normalized_workspace_id = workspace_id
    if callable(normalize_workspace):
        try:
            normalized_workspace_id = normalize_workspace(workspace_id)
        except Exception:
            normalized_workspace_id = workspace_id
    normalized_text = re.sub(r"\s+", " ", str(text or "").strip().lower())
    key = "|".join(
        [
            str(channel or "").strip().lower(),
            str(direction or "").strip().lower(),
            str(event_type or "").strip().lower(),
            str(action or "").strip().lower(),
            str(normalized_workspace_id or ""),
            normalized_text[:220],
        ]
    )
    now_ts = time.time()
    window = max(0.0, float(dedupe_seconds))
    if window > 0.0:
        with _AUTOPILOT_EVENT_DEDUP_LOCK:
            last_ts = float(_AUTOPILOT_EVENT_DEDUP.get(key) or 0.0)
            if (now_ts - last_ts) < window:
                return False
            _AUTOPILOT_EVENT_DEDUP[key] = now_ts
            # Keep in-memory index bounded.
            if len(_AUTOPILOT_EVENT_DEDUP) > 2048:
                cutoff = now_ts - max(window * 4.0, 120.0)
                stale = [k for k, ts in _AUTOPILOT_EVENT_DEDUP.items() if ts < cutoff]
                for stale_key in stale[:1024]:
                    _AUTOPILOT_EVENT_DEDUP.pop(stale_key, None)
    _record_channel_event(
        channel=channel,
        direction=direction,
        event_type=event_type,
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        session_id=session_id,
        message_id=message_id,
        parent_id=parent_id,
        run_id=run_id,
        action=action,
        metadata=metadata,
    )
    return True


def _telegram_session_key(chat_id: str) -> str:
    cid = str(chat_id or "").strip()
    return f"telegram:{cid}" if cid else "telegram:unknown"


def _telegram_trace_id(chat_id: str, update_id: Any, message_id: Any = "") -> str:
    cid = _telegram_safe_path_token(chat_id or "unknown")
    upid = _telegram_safe_path_token(update_id or "0")
    mid = _telegram_safe_path_token(message_id or "")
    if mid:
        return f"tg:{cid}:{upid}:{mid}"
    return f"tg:{cid}:{upid}"


def _whatsapp_session_key(from_number: str, to_number: str) -> str:
    sender = _normalize_whatsapp_number(from_number) or "whatsapp:unknown"
    receiver = _normalize_whatsapp_number(to_number) or "whatsapp:unknown"
    return f"whatsapp:{sender}->{receiver}"


def _telegram_profile_key(workspace_id: str, chat_id: str) -> str:
    return _TELEGRAM_PROFILE_SERVICE.telegram_profile_key(workspace_id, chat_id)


def _load_telegram_profile_state() -> None:
    _TELEGRAM_PROFILE_SERVICE.load_profile_state()


def _ensure_telegram_profile_state_loaded() -> None:
    _TELEGRAM_PROFILE_SERVICE.ensure_profile_state_loaded()


def _persist_telegram_profile_state() -> None:
    _TELEGRAM_PROFILE_SERVICE.persist_profile_state()


def _normalize_telegram_profile_field(raw_value: str) -> str:
    return _TELEGRAM_PROFILE_SERVICE.normalize_profile_field(raw_value)


def _get_telegram_profile(workspace_id: str, chat_id: str) -> Dict[str, str]:
    return _TELEGRAM_PROFILE_SERVICE.get_profile(workspace_id, chat_id)


def _set_telegram_profile_field(workspace_id: str, chat_id: str, field_name: str, value: str) -> Dict[str, str]:
    return _TELEGRAM_PROFILE_SERVICE.set_profile_field(workspace_id, chat_id, field_name, value)


def _clear_telegram_profile(workspace_id: str, chat_id: str, field_name: str = "") -> Dict[str, str]:
    return _TELEGRAM_PROFILE_SERVICE.clear_profile(workspace_id, chat_id, field_name)


def _telegram_onboarding_key(workspace_id: str, chat_id: str) -> str:
    return _TELEGRAM_PROFILE_SERVICE.telegram_onboarding_key(workspace_id, chat_id)


def _load_telegram_onboarding_state() -> None:
    _TELEGRAM_PROFILE_SERVICE.load_onboarding_state()


def _ensure_telegram_onboarding_state_loaded() -> None:
    _TELEGRAM_PROFILE_SERVICE.ensure_onboarding_state_loaded()


def _persist_telegram_onboarding_state() -> None:
    _TELEGRAM_PROFILE_SERVICE.persist_onboarding_state()


def _get_telegram_onboarding_state(workspace_id: str, chat_id: str) -> Dict[str, Any]:
    return _TELEGRAM_PROFILE_SERVICE.get_onboarding_state(workspace_id, chat_id)


def _start_telegram_onboarding(workspace_id: str, chat_id: str) -> Dict[str, Any]:
    return _TELEGRAM_PROFILE_SERVICE.start_onboarding(workspace_id, chat_id)


def _advance_telegram_onboarding(workspace_id: str, chat_id: str, step_index: int, active: bool) -> Dict[str, Any]:
    return _TELEGRAM_PROFILE_SERVICE.advance_onboarding(workspace_id, chat_id, step_index, active)


def _telegram_camera_setup_key(workspace_id: str, chat_id: str) -> str:
    return _TELEGRAM_CAMERA_SETUP_SERVICE.camera_setup_key(workspace_id, chat_id)


def _load_telegram_camera_setup_state() -> None:
    _TELEGRAM_CAMERA_SETUP_SERVICE.load_state()


def _ensure_telegram_camera_setup_state_loaded() -> None:
    _TELEGRAM_CAMERA_SETUP_SERVICE.ensure_state_loaded()


def _persist_telegram_camera_setup_state() -> None:
    _TELEGRAM_CAMERA_SETUP_SERVICE.persist_state()


def _get_telegram_camera_setup_state(workspace_id: str, chat_id: str) -> Dict[str, Any]:
    return _TELEGRAM_CAMERA_SETUP_SERVICE.get_state(workspace_id, chat_id)


def _set_telegram_camera_setup_state(
    workspace_id: str,
    chat_id: str,
    stage: str,
    original_prompt: str,
    intent: str = "",
) -> Dict[str, Any]:
    return _TELEGRAM_CAMERA_SETUP_SERVICE.set_state(workspace_id, chat_id, stage, original_prompt, intent=intent)


def _clear_telegram_camera_setup_state(workspace_id: str, chat_id: str) -> None:
    _TELEGRAM_CAMERA_SETUP_SERVICE.clear_state(workspace_id, chat_id)


def _runtime_api_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    api_key = str(globals().get("ORION_API_KEY") or "").strip()
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


def _data_url_from_local_file(path_value: str, mime_type: str = "") -> str:
    path = Path(str(path_value or "").strip()).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise RuntimeError("Attached image file is not available.")
    raw = path.read_bytes()
    guessed_mime = str(mime_type or "").strip().lower() or mimetypes.guess_type(str(path.name))[0] or "image/jpeg"
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{guessed_mime};base64,{encoded}"


def _workspace_connector_flags(workspace_id: str) -> Dict[str, bool]:
    _init()
    list_fn = globals().get("list_vault_connectors")
    if not callable(list_fn):
        return {"telegram": False, "email": False}
    try:
        rows = list_fn(str(workspace_id or "").strip() or "default")
    except Exception:
        rows = []
    flags = {"telegram": False, "email": False}
    if not isinstance(rows, list):
        return flags
    for row in rows:
        if not isinstance(row, dict):
            continue
        connector = str(row.get("connector") or row.get("provider") or "").strip().lower()
        if connector == "telegram_bot":
            flags["telegram"] = True
        if connector in {"google_workspace", "microsoft_365"}:
            flags["email"] = True
    return flags


def _primary_email_connector_id(workspace_id: str) -> Optional[str]:
    _init()
    list_fn = globals().get("list_vault_connectors")
    if not callable(list_fn):
        return None
    try:
        rows = list_fn(str(workspace_id or "").strip() or "default")
    except Exception:
        rows = []
    if not isinstance(rows, list):
        return None
    for row in rows:
        if not isinstance(row, dict):
            continue
        connector = str(row.get("connector") or row.get("provider") or "").strip().lower()
        if connector in {"google_workspace", "microsoft_365"}:
            connector_id = str(row.get("id") or "").strip()
            if connector_id:
                return connector_id
    return None


def _email_summary_workflow_definition(target_label: str, *, telegram_connected: bool) -> Dict[str, Any]:
    label = str(target_label or "").strip() or "Inbox"
    return {
        "nodes": [
            {
                "id": "trigger-daily",
                "type": "trigger",
                "position": {"x": 265, "y": 50},
                "data": {"label": "Daily Summary", "triggerType": "schedule"},
            },
            {
                "id": "agent-summary",
                "type": "agent",
                "position": {"x": 265, "y": 220},
                "data": {
                    "label": "Inbox Summary",
                    "modelId": "gpt-4o",
                    "prompt": f"Summarize important messages from {label} and highlight what needs action.",
                    "tools": ["email"],
                    "provider": "openai",
                    "role": "Summary",
                    "duty": f"Review {label} and produce a concise daily summary.",
                    "status": "ready",
                    "description": f"{label} daily summary",
                },
            },
            {
                "id": "action-summary",
                "type": "action",
                "position": {"x": 265, "y": 390},
                "data": {
                    "label": "Send Telegram" if telegram_connected else "Write Report",
                    "actionType": "send_telegram" if telegram_connected else "write_file",
                },
            },
        ],
        "edges": [
            {
                "id": "edge-daily-summary",
                "source": "trigger-daily",
                "target": "agent-summary",
                "sourceHandle": "bottom",
                "targetHandle": "top",
                "type": "smoothstep",
            },
            {
                "id": "edge-summary-action",
                "source": "agent-summary",
                "target": "action-summary",
                "sourceHandle": "bottom",
                "targetHandle": "top",
                "type": "smoothstep",
            },
        ],
        "meta": {"automationMode": "scheduled", "created_from": "email_summary_chat_bridge"},
    }


def _lead_followup_workflow_definition(flow_label: str, *, email_connected: bool, telegram_connected: bool) -> Dict[str, Any]:
    label = str(flow_label or "").strip() or "Leads"
    action_type = "send_email" if email_connected else "send_telegram" if telegram_connected else "write_file"
    action_label = "Send Email" if email_connected else "Send Telegram" if telegram_connected else "Write Draft"
    return {
        "nodes": [
            {
                "id": "trigger-followup",
                "type": "trigger",
                "position": {"x": 265, "y": 50},
                "data": {"label": "Follow-up Review", "triggerType": "schedule"},
            },
            {
                "id": "agent-followup",
                "type": "agent",
                "position": {"x": 265, "y": 220},
                "data": {
                    "label": "Lead Follow-up",
                    "modelId": "gpt-4o",
                    "prompt": f"Review {label} and draft concise follow-up messages for the leads that need attention.",
                    "tools": ["crm"],
                    "provider": "openai",
                    "role": "Follow-up",
                    "duty": f"Prepare next-step follow-up messages for {label}.",
                    "status": "ready",
                    "description": f"{label} lead follow-up",
                },
            },
            {
                "id": "action-followup",
                "type": "action",
                "position": {"x": 265, "y": 390},
                "data": {"label": action_label, "actionType": action_type},
            },
        ],
        "edges": [
            {
                "id": "edge-followup-agent",
                "source": "trigger-followup",
                "target": "agent-followup",
                "sourceHandle": "bottom",
                "targetHandle": "top",
                "type": "smoothstep",
            },
            {
                "id": "edge-followup-action",
                "source": "agent-followup",
                "target": "action-followup",
                "sourceHandle": "bottom",
                "targetHandle": "top",
                "type": "smoothstep",
            },
        ],
        "meta": {"automationMode": "scheduled", "created_from": "lead_followup_chat_bridge"},
    }


def _create_published_workflow_record(name: str, description: str, definition: Dict[str, Any]) -> Optional[str]:
    _init()
    create_res = http_json_request(
        f"{EMPYRALIST_WORKFLOW_API_URL}/workflows?workspaceId=default",
        method="POST",
        headers={"Content-Type": "application/json"},
        payload={
            "name": name,
            "description": description,
            "definition": definition,
        },
        timeout=20,
    )
    create_json = create_res.get("json") if isinstance(create_res.get("json"), dict) else {}
    workflow_id = str(create_json.get("id") or "").strip()
    if workflow_id:
        try:
            http_json_request(
                f"{EMPYRALIST_WORKFLOW_API_URL}/workflows/{quote_plus(workflow_id)}/publish",
                method="POST",
                headers={"Content-Type": "application/json"},
                timeout=20,
            )
        except Exception:
            pass
    return workflow_id or None


def _create_email_summary_visibility_record(target_label: str, *, telegram_connected: bool) -> Optional[str]:
    label = str(target_label or "").strip() or "Inbox"
    return _create_published_workflow_record(
        f"Summarize {label} Daily",
        f"Daily inbox summary for {label}",
        _email_summary_workflow_definition(label, telegram_connected=telegram_connected),
    )


def _create_email_summary_execution_schedules(workspace_id: str, target_label: str) -> int:
    connector_id = _primary_email_connector_id(workspace_id)
    if not connector_id:
        return 0
    label = str(target_label or "").strip() or "Inbox"
    run_request = {
        "engine": "orion",
        "workspace_id": str(workspace_id or "").strip() or "default",
        "user_goal": f"Summarize the most recent emails from {label} and highlight what needs attention.",
        "agent_role": "support",
        "metadata": {
            "source": "scheduled",
            "execution_target": "cloud",
            "outcome_pack": "customer-ops-autopilot",
            "outcome_pack_label": "Client Workflow Autopilot",
            "outcome_scope": ["Inbox triage"],
            "connector_credential_id": connector_id,
            "pack_inputs": {"inbox": "", "leads": "", "slots": ""},
            "automation_kind": "email_summary_recent",
            "automation_label": label,
            "summary_limit": 5,
        },
    }
    created = 0
    for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"):
        http_json_request(
            f"{EMPYRALIST_RUNTIME_URL}/schedules/weekly",
            method="POST",
            headers=_runtime_api_headers(),
            payload={
                "name": f"Email Summary · {label} · {day}",
                "workspace_id": str(workspace_id or "").strip() or "default",
                "enabled": True,
                "day_of_week": day,
                "time_hhmm": "08:00",
                "timezone": "local",
                "run_request": run_request,
            },
            timeout=20,
        )
        created += 1
    return created


def _create_lead_followup_execution_schedules(workspace_id: str, flow_label: str) -> int:
    connector_id = _primary_email_connector_id(workspace_id)
    if not connector_id:
        return 0
    label = str(flow_label or "").strip() or "Leads"
    run_request = {
        "engine": "orion",
        "workspace_id": str(workspace_id or "").strip() or "default",
        "user_goal": f"Review the most recent leads from {label} and draft the next outbound follow-ups.",
        "agent_role": "support",
        "metadata": {
            "source": "scheduled",
            "execution_target": "cloud",
            "outcome_pack": "customer-ops-autopilot",
            "outcome_pack_label": "Client Workflow Autopilot",
            "outcome_scope": ["Lead follow-up"],
            "connector_credential_id": connector_id,
            "pack_inputs": {"inbox": "", "leads": "", "slots": ""},
            "automation_kind": "lead_followup_recent",
            "automation_label": label,
            "summary_limit": 5,
        },
    }
    created = 0
    for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"):
        http_json_request(
            f"{EMPYRALIST_RUNTIME_URL}/schedules/weekly",
            method="POST",
            headers=_runtime_api_headers(),
            payload={
                "name": f"Lead Follow-up · {label} · {day}",
                "workspace_id": str(workspace_id or "").strip() or "default",
                "enabled": True,
                "day_of_week": day,
                "time_hhmm": "09:00",
                "timezone": "local",
                "run_request": run_request,
            },
            timeout=20,
        )
        created += 1
    return created


def _create_lead_followup_visibility_record(flow_label: str, *, email_connected: bool, telegram_connected: bool) -> Optional[str]:
    label = str(flow_label or "").strip() or "Leads"
    return _create_published_workflow_record(
        f"Follow up {label}",
        f"Lead follow-up automation for {label}",
        _lead_followup_workflow_definition(label, email_connected=email_connected, telegram_connected=telegram_connected),
    )


def _email_summary_completion_text(
    target_label: str,
    *,
    schedule_count: int,
    email_connected: bool,
    workflow_id: Optional[str] = None,
) -> str:
    label = str(target_label or "").strip() or "Inbox"
    is_active = schedule_count > 0
    lines = [
        f"Done. Your {label} daily summary is {'active' if is_active else 'ready'}.",
        "It will run every morning and add results to your activity feed." if is_active else (
            "Finish setup to run daily summaries automatically." if email_connected else "Connect Google Workspace or Microsoft 365 to start daily summaries."
        ),
        f"Open automations: {EMPYRALIST_WEB_URL}/workflows",
    ]
    if workflow_id:
        lines.append(f"Open automation: {EMPYRALIST_WEB_URL}/workflows/{workflow_id}")
    if not email_connected:
        lines.append(f"Connect email → {EMPYRALIST_WEB_URL}/credentials")
    if email_connected and not is_active:
        lines.append(f"Finish setup → {EMPYRALIST_WEB_URL}/setup")
    return "\n\n".join(lines)


def _lead_followup_completion_text(
    flow_label: str,
    *,
    schedule_count: int,
    email_connected: bool,
    workflow_id: Optional[str] = None,
) -> str:
    label = str(flow_label or "").strip() or "Leads"
    is_active = schedule_count > 0
    lines = [
        f"Done. Your {label} follow-up automation is {'active' if is_active else 'ready'}.",
        "It will review recent leads every morning and prepare outbound follow-ups." if is_active else (
            "Finish setup to run follow-ups automatically." if email_connected else "Connect an email account to send follow-ups automatically."
        ),
        f"Open automations: {EMPYRALIST_WEB_URL}/workflows",
    ]
    if workflow_id:
        lines.append(f"Open automation: {EMPYRALIST_WEB_URL}/workflows/{workflow_id}")
    if not email_connected:
        lines.append(f"Connect email → {EMPYRALIST_WEB_URL}/credentials")
    if email_connected and not is_active:
        lines.append(f"Finish setup → {EMPYRALIST_WEB_URL}/setup")
    return "\n\n".join(lines)


def _telegram_handle_guided_automation_setup(
    *,
    workspace_id: str,
    chat_id: str,
    message_text: str,
) -> Dict[str, Any]:
    return _TELEGRAM_CAMERA_SETUP_SERVICE.handle_guided_automation_setup(
        workspace_id=workspace_id,
        chat_id=chat_id,
        message_text=message_text,
        enabled=ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED,
        classify_intent=classify_automation_intent,
        workspace_connector_flags=_workspace_connector_flags,
        create_email_summary_visibility_record=_create_email_summary_visibility_record,
        create_email_summary_execution_schedules=_create_email_summary_execution_schedules,
        email_summary_completion_text=_email_summary_completion_text,
        create_lead_followup_visibility_record=_create_lead_followup_visibility_record,
        create_lead_followup_execution_schedules=_create_lead_followup_execution_schedules,
        lead_followup_completion_text=_lead_followup_completion_text,
    )


def _telegram_profile_has_context(profile_data: Dict[str, str]) -> bool:
    return _TELEGRAM_PROFILE_SERVICE.profile_has_context(profile_data)


def _telegram_next_onboarding_step_index(profile_data: Dict[str, str]) -> int:
    return _TELEGRAM_PROFILE_SERVICE.next_onboarding_step_index(profile_data)


def _is_low_quality_onboarding_answer(raw_value: str) -> bool:
    return _TELEGRAM_PROFILE_SERVICE.is_low_quality_onboarding_answer(raw_value)


def _telegram_onboarding_prompt(step_index: int, retry: bool = False) -> str:
    return _TELEGRAM_PROFILE_SERVICE.onboarding_prompt(step_index, retry=retry)


def _telegram_onboarding_consume_answer(
    workspace_id: str,
    chat_id: str,
    answer_text: str,
) -> Dict[str, Any]:
    return _TELEGRAM_PROFILE_SERVICE.onboarding_consume_answer(workspace_id, chat_id, answer_text)


def _telegram_profile_lines(profile_data: Dict[str, str]) -> List[str]:
    return _TELEGRAM_PROFILE_SERVICE.profile_lines(profile_data)


def _telegram_profile_text(profile: Dict[str, Any], profile_data: Dict[str, str]) -> str:
    return _TELEGRAM_PROFILE_SERVICE.profile_text(profile, profile_data)


def _telegram_profile_help_text(profile: Dict[str, Any]) -> str:
    return _TELEGRAM_PROFILE_SERVICE.profile_help_text(profile)


def _telegram_build_goal_with_profile(goal: str, profile_data: Dict[str, str]) -> str:
    return _TELEGRAM_PROFILE_SERVICE.build_goal_with_profile(goal, profile_data)


def _connector_capability_summary(connector_id: str) -> str:
    provider = str(connector_id or "").strip().lower()
    if provider == "google_workspace":
        return "email, calendar, drive"
    if provider == "microsoft_365":
        return "email, calendar, files"
    if provider == "telegram_bot":
        return "telegram chat"
    if provider == "whatsapp_twilio":
        return "whatsapp chat"
    if provider == "discord_bot":
        return "discord chat"
    return "connected tool"


def _telegram_requested_recent_email_limit(goal: str) -> int:
    raw = str(goal or "").strip().lower()
    if not raw:
        return 0
    if not any(token in raw for token in ("email", "emails", "gmail", "inbox", "mailbox")):
        return 0
    if not any(token in raw for token in ("read", "summarize", "summary", "show", "latest", "recent", "last")):
        return 0
    match = re.search(r"\b(?:last|latest|recent)\s+(\d+)\s+emails?\b", raw)
    if match:
        try:
            return max(1, min(int(match.group(1)), 10))
        except Exception:
            return 3
    return 3


def _telegram_workspace_connector_context(
    goal: str,
    workspace_id: str,
    current_connector_id: str,
) -> Dict[str, Any]:
    _init()
    raw_goal = str(goal or "").strip().lower()
    entries = list_vault_connectors(workspace_id)
    summaries: List[Dict[str, Any]] = []
    preferred_email_entry: Optional[Dict[str, Any]] = None
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        connector_id = str(entry.get("id") or "").strip()
        provider = str(entry.get("connector") or "").strip().lower()
        label = str(entry.get("label") or provider or "Connector").strip()
        summaries.append(
            {
                "id": connector_id,
                "connector": provider,
                "label": label,
                "capabilities": _connector_capability_summary(provider),
                "session_connector": connector_id == str(current_connector_id or "").strip(),
            }
        )
        if provider in {"google_workspace", "microsoft_365"} and preferred_email_entry is None:
            preferred_email_entry = entry

    email_limit = _telegram_requested_recent_email_limit(goal)
    needs_prompt = bool(
        email_limit > 0
        or any(token in raw_goal for token in ("connector", "email", "gmail", "inbox", "calendar", "drive", "document", "spreadsheet", "sheet"))
    )

    prompt_lines: List[str] = []
    if summaries and needs_prompt:
        prompt_lines.append("Workspace connectors available for this request:")
        for item in summaries:
            label = str(item.get("label") or "Connector").strip()
            capabilities = str(item.get("capabilities") or "connected tool").strip()
            prompt_lines.append(f"- {label}: {capabilities}")

    selected_connector_id = ""
    selected_connector_provider = ""
    if email_limit > 0 and isinstance(preferred_email_entry, dict):
        selected_connector_id = str(preferred_email_entry.get("id") or "").strip()
        selected_connector_provider = str(preferred_email_entry.get("connector") or "").strip().lower()
        try:
            secret = resolve_vault_credential(selected_connector_id, workspace_id)
            messages = list_recent_connector_messages(secret, limit=email_limit)
        except Exception as exc:
            prompt_lines.append(f"Connector fetch warning: {str(exc).strip()}")
            messages = []
        if messages:
            prompt_lines.append("")
            prompt_lines.append(
                f"Recent emails fetched from {preferred_email_entry.get('label') or selected_connector_provider}:"
            )
            for idx, message in enumerate(messages, start=1):
                subject = str(message.get("subject") or "(no subject)").strip()
                sender = str(message.get("from") or "unknown sender").strip()
                date = str(message.get("date") or "").strip()
                snippet = re.sub(r"\s+", " ", str(message.get("snippet") or "").strip())
                if len(snippet) > 280:
                    snippet = snippet[:277] + "..."
                line = f"{idx}. From: {sender} | Subject: {subject}"
                if date:
                    line += f" | Date: {date}"
                prompt_lines.append(line)
                if snippet:
                    prompt_lines.append(f"   Snippet: {snippet}")

    return {
        "channel_connectors": [
            {"connector": str(item.get("connector") or "").strip(), "credential_id": str(item.get("id") or "").strip()}
            for item in summaries
            if str(item.get("connector") or "").strip() and str(item.get("id") or "").strip()
        ],
        "available_connectors": summaries,
        "connector_credential_id": selected_connector_id or None,
        "connector_provider": selected_connector_provider or None,
        "prompt_append": "\n".join(prompt_lines).strip(),
    }


def _telegram_build_goal_with_connector_context(goal: str, connector_prompt: str) -> str:
    request_text = str(goal or "").strip()
    prompt = str(connector_prompt or "").strip()
    if not prompt:
        return request_text
    if not request_text:
        return prompt
    return f"{request_text}\n\n{prompt}"


def _telegram_installed_skill_query(
    goal: str,
    workspace_id: str,
    connector_id: str,
    chat_id: str,
    session_key: str,
) -> Dict[str, Any]:
    if not ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED:
        return {
            "handled": False,
            "response": "",
            "prompt_append": "",
            "active_skill_ids": [],
            "errors": [],
        }
    try:
        return query_active_installed_skills(
            query=goal,
            channel="telegram",
            workspace_id=workspace_id,
            connector_id=connector_id,
            chat_id=chat_id,
            session_key=session_key,
        )
    except Exception as exc:
        return {
            "handled": False,
            "response": "",
            "prompt_append": "",
            "active_skill_ids": [],
            "errors": [{"skill_id": "installed_skills", "error": str(exc)}],
        }


def _telegram_prefixed_command(profile: Dict[str, Any], command_text: str) -> str:
    clean = str(command_text or "").strip()
    if not clean:
        return ""
    if bool(profile.get("require_prefix")):
        prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
        return f"{prefix} {clean}".strip()
    return clean


def _telegram_menu_keyboard(profile: Dict[str, Any], menu_id: str = "main") -> Dict[str, Any]:
    if not ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS:
        return {"remove_keyboard": True}
    require_prefix = bool(profile.get("require_prefix"))
    status_cmd = _telegram_prefixed_command(profile, "status") if require_prefix else "Status"
    approvals_cmd = _telegram_prefixed_command(profile, "approvals") if require_prefix else "Approvals"
    help_cmd = _telegram_prefixed_command(profile, "help") if require_prefix else "Help"
    me_cmd = _telegram_prefixed_command(profile, "me") if require_prefix else "My context"

    if menu_id == "study":
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "run inbox triage")}, {"text": _telegram_prefixed_command(profile, "run draft message")}],
                [{"text": _telegram_prefixed_command(profile, "run today priorities")}, {"text": _telegram_prefixed_command(profile, "run task breakdown")}],
                [{"text": _telegram_prefixed_command(profile, "menu")}],
            ]
        else:
            keyboard = [
                [{"text": "Inbox triage"}, {"text": "Draft message"}],
                [{"text": "Today priorities"}, {"text": "Task breakdown"}],
                [{"text": "Back to main"}],
            ]
    elif menu_id == "project":
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "run project update")}, {"text": _telegram_prefixed_command(profile, "run next steps")}],
                [{"text": _telegram_prefixed_command(profile, "run meeting prep")}, {"text": _telegram_prefixed_command(profile, "run write follow-up")}],
                [{"text": _telegram_prefixed_command(profile, "menu")}],
            ]
        else:
            keyboard = [
                [{"text": "Project update"}, {"text": "Next steps"}],
                [{"text": "Meeting prep"}, {"text": "Write follow-up"}],
                [{"text": "Back to main"}],
            ]
    elif menu_id == "context":
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "me")}, {"text": _telegram_prefixed_command(profile, "help")}],
                [{"text": _telegram_prefixed_command(profile, "menu")}],
            ]
        else:
            keyboard = [
                [{"text": "My context"}, {"text": "Context help"}],
                [{"text": "Back to main"}],
            ]
    elif menu_id == "skills":
        active_skills = _runtime_active_skills("assistant_defaults", limit=8)
        if require_prefix:
            keyboard = []
            row: List[Dict[str, str]] = []
            for skill in active_skills:
                row.append({"text": _telegram_prefixed_command(profile, f"skill {skill.get('id')}")})
                if len(row) >= 2:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            keyboard.append([{"text": _telegram_prefixed_command(profile, "menu")}])
        else:
            keyboard = []
            row = []
            for skill in active_skills:
                label = f"Skill: {str(skill.get('title') or '').strip()}"[:48]
                row.append({"text": label})
                if len(row) >= 2:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            keyboard.append([{"text": "Back to main"}])
    else:
        if require_prefix:
            keyboard = [
                [{"text": _telegram_prefixed_command(profile, "menu work")}, {"text": _telegram_prefixed_command(profile, "menu project")}],
                [{"text": _telegram_prefixed_command(profile, "menu skills")}, {"text": _telegram_prefixed_command(profile, "menu context")}],
                [{"text": status_cmd}],
                [{"text": approvals_cmd}, {"text": help_cmd}],
            ]
        else:
            keyboard = [
                [{"text": "Work menu"}, {"text": "Project menu"}],
                [{"text": "Skills"}, {"text": "Context"}],
                [{"text": status_cmd}],
                [{"text": approvals_cmd}, {"text": help_cmd}],
            ]

    return {
        "keyboard": keyboard if keyboard else [[{"text": me_cmd}]],
        "resize_keyboard": True,
        "is_persistent": True,
        "one_time_keyboard": False,
        "input_field_placeholder": "Message Empyralis...",
    }


def _telegram_reply_keyboard(profile: Dict[str, Any]) -> Dict[str, Any]:
    if not ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS:
        return {"remove_keyboard": True}
    return _telegram_menu_keyboard(profile, "main")


def _load_telegram_autopilot_state():
    _init()
    payload = _safe_read_json(
        ORION_TELEGRAM_AUTOPILOT_STATE_FILE,
        {
            "version": 1,
            "state": {
                "connectors": {},
                "processed_updates": 0,
                "runs_started": 0,
                "last_poll_at": None,
                "last_error": None,
                "last_error_at": None,
                "last_error_category": None,
                "last_error_source": None,
                "error_count": 0,
                "consecutive_errors": 0,
                "retry_count": 0,
                "last_retry_at": None,
                "backoff_seconds": 0.0,
                "next_retry_at": None,
                "last_success_at": None,
            },
        },
    )
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    connectors = state.get("connectors") if isinstance(state.get("connectors"), dict) else {}
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["connectors"] = connectors
        TELEGRAM_AUTOPILOT_STATE["processed_updates"] = int(state.get("processed_updates") or 0)
        TELEGRAM_AUTOPILOT_STATE["runs_started"] = int(state.get("runs_started") or 0)
        TELEGRAM_AUTOPILOT_STATE["last_poll_at"] = state.get("last_poll_at")
        TELEGRAM_AUTOPILOT_STATE["last_error"] = state.get("last_error")
        TELEGRAM_AUTOPILOT_STATE["last_error_at"] = state.get("last_error_at")
        TELEGRAM_AUTOPILOT_STATE["last_error_category"] = state.get("last_error_category")
        TELEGRAM_AUTOPILOT_STATE["last_error_source"] = state.get("last_error_source")
        TELEGRAM_AUTOPILOT_STATE["error_count"] = int(state.get("error_count") or 0)
        TELEGRAM_AUTOPILOT_STATE["consecutive_errors"] = int(state.get("consecutive_errors") or 0)
        TELEGRAM_AUTOPILOT_STATE["retry_count"] = int(state.get("retry_count") or 0)
        TELEGRAM_AUTOPILOT_STATE["last_retry_at"] = state.get("last_retry_at")
        TELEGRAM_AUTOPILOT_STATE["backoff_seconds"] = float(state.get("backoff_seconds") or 0.0)
        TELEGRAM_AUTOPILOT_STATE["next_retry_at"] = state.get("next_retry_at")
        TELEGRAM_AUTOPILOT_STATE["last_success_at"] = state.get("last_success_at")


def _persist_telegram_autopilot_state():
    _init()
    with TELEGRAM_AUTOPILOT_LOCK:
        payload = {
            "version": 1,
            "state": {
                "connectors": TELEGRAM_AUTOPILOT_STATE.get("connectors", {}),
                "processed_updates": int(TELEGRAM_AUTOPILOT_STATE.get("processed_updates") or 0),
                "runs_started": int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0),
                "last_poll_at": TELEGRAM_AUTOPILOT_STATE.get("last_poll_at"),
                "last_error": TELEGRAM_AUTOPILOT_STATE.get("last_error"),
                "last_error_at": TELEGRAM_AUTOPILOT_STATE.get("last_error_at"),
                "last_error_category": TELEGRAM_AUTOPILOT_STATE.get("last_error_category"),
                "last_error_source": TELEGRAM_AUTOPILOT_STATE.get("last_error_source"),
                "error_count": int(TELEGRAM_AUTOPILOT_STATE.get("error_count") or 0),
                "consecutive_errors": int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0),
                "retry_count": int(TELEGRAM_AUTOPILOT_STATE.get("retry_count") or 0),
                "last_retry_at": TELEGRAM_AUTOPILOT_STATE.get("last_retry_at"),
                "backoff_seconds": float(TELEGRAM_AUTOPILOT_STATE.get("backoff_seconds") or 0.0),
                "next_retry_at": TELEGRAM_AUTOPILOT_STATE.get("next_retry_at"),
                "last_success_at": TELEGRAM_AUTOPILOT_STATE.get("last_success_at"),
            },
        }
    _safe_write_json(ORION_TELEGRAM_AUTOPILOT_STATE_FILE, payload)


def _telegram_autopilot_snapshot(include_connectors: bool = False) -> Dict[str, Any]:
    _init()
    thread_ref = getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else TELEGRAM_AUTOPILOT_THREAD
    with TELEGRAM_AUTOPILOT_LOCK:
        connectors_raw = TELEGRAM_AUTOPILOT_STATE.get("connectors", {})
        connectors = dict(connectors_raw) if isinstance(connectors_raw, dict) else {}
        snapshot: Dict[str, Any] = {
            "enabled": bool(ORION_TELEGRAM_AUTOPILOT_ENABLED),
            "active": bool(TELEGRAM_AUTOPILOT_STATE.get("active")),
            "started_at": TELEGRAM_AUTOPILOT_STATE.get("started_at"),
            "last_poll_at": TELEGRAM_AUTOPILOT_STATE.get("last_poll_at"),
            "last_error": TELEGRAM_AUTOPILOT_STATE.get("last_error"),
            "last_error_at": TELEGRAM_AUTOPILOT_STATE.get("last_error_at"),
            "last_error_category": TELEGRAM_AUTOPILOT_STATE.get("last_error_category"),
            "last_error_source": TELEGRAM_AUTOPILOT_STATE.get("last_error_source"),
            "error_count": int(TELEGRAM_AUTOPILOT_STATE.get("error_count") or 0),
            "consecutive_errors": int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0),
            "retry_count": int(TELEGRAM_AUTOPILOT_STATE.get("retry_count") or 0),
            "last_retry_at": TELEGRAM_AUTOPILOT_STATE.get("last_retry_at"),
            "backoff_seconds": float(TELEGRAM_AUTOPILOT_STATE.get("backoff_seconds") or 0.0),
            "next_retry_at": TELEGRAM_AUTOPILOT_STATE.get("next_retry_at"),
            "last_success_at": TELEGRAM_AUTOPILOT_STATE.get("last_success_at"),
            "connectors_seen": int(TELEGRAM_AUTOPILOT_STATE.get("connectors_seen") or 0),
            "processed_updates": int(TELEGRAM_AUTOPILOT_STATE.get("processed_updates") or 0),
            "runs_started": int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0),
            "poll_seconds": ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            "max_updates": ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            "run_timeout_seconds": ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS,
            "max_reply_chars": ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS,
            "require_prefix": bool(ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX),
            "prefix": ORION_TELEGRAM_AUTOPILOT_PREFIX,
            "default_profile": ORION_TELEGRAM_AUTOPILOT_PROFILE,
            "state_file": str(ORION_TELEGRAM_AUTOPILOT_STATE_FILE),
            "thread_alive": bool(thread_ref and thread_ref.is_alive()),
        }
    connector_error_count = 0
    dropped_sender_count = 0
    for connector_state in connectors.values():
        if isinstance(connector_state, dict):
            if connector_state.get("last_error"):
                connector_error_count += 1
            dropped_sender_count += int(connector_state.get("dropped_sender_count") or 0)
    snapshot["connector_state_count"] = len(connectors)
    snapshot["connector_error_count"] = connector_error_count
    snapshot["dropped_sender_count"] = dropped_sender_count
    if include_connectors:
        snapshot["connectors"] = connectors
    return snapshot


def _whatsapp_autopilot_log(message: str):
    ts = _utc_now_iso()
    print(f"[whatsapp-autopilot {ts}] {message}", flush=True)


def _load_whatsapp_autopilot_state():
    _init()
    payload = _safe_read_json(
        ORION_WHATSAPP_AUTOPILOT_STATE_FILE,
        {
            "version": 1,
            "state": {
                "connectors": {},
                "processed_messages": 0,
                "runs_started": 0,
                "last_inbound_at": None,
                "last_error": None,
                "last_error_at": None,
                "last_error_category": None,
                "last_error_source": None,
                "error_count": 0,
                "consecutive_errors": 0,
            },
        },
    )
    state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
    connectors = state.get("connectors") if isinstance(state.get("connectors"), dict) else {}
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["connectors"] = connectors
        WHATSAPP_AUTOPILOT_STATE["processed_messages"] = int(state.get("processed_messages") or 0)
        WHATSAPP_AUTOPILOT_STATE["runs_started"] = int(state.get("runs_started") or 0)
        WHATSAPP_AUTOPILOT_STATE["last_inbound_at"] = state.get("last_inbound_at")
        WHATSAPP_AUTOPILOT_STATE["last_error"] = state.get("last_error")
        WHATSAPP_AUTOPILOT_STATE["last_error_at"] = state.get("last_error_at")
        WHATSAPP_AUTOPILOT_STATE["last_error_category"] = state.get("last_error_category")
        WHATSAPP_AUTOPILOT_STATE["last_error_source"] = state.get("last_error_source")
        WHATSAPP_AUTOPILOT_STATE["error_count"] = int(state.get("error_count") or 0)
        WHATSAPP_AUTOPILOT_STATE["consecutive_errors"] = int(state.get("consecutive_errors") or 0)


def _persist_whatsapp_autopilot_state():
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        payload = {
            "version": 1,
            "state": {
                "connectors": WHATSAPP_AUTOPILOT_STATE.get("connectors", {}),
                "processed_messages": int(WHATSAPP_AUTOPILOT_STATE.get("processed_messages") or 0),
                "runs_started": int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0),
                "last_inbound_at": WHATSAPP_AUTOPILOT_STATE.get("last_inbound_at"),
                "last_error": WHATSAPP_AUTOPILOT_STATE.get("last_error"),
                "last_error_at": WHATSAPP_AUTOPILOT_STATE.get("last_error_at"),
                "last_error_category": WHATSAPP_AUTOPILOT_STATE.get("last_error_category"),
                "last_error_source": WHATSAPP_AUTOPILOT_STATE.get("last_error_source"),
                "error_count": int(WHATSAPP_AUTOPILOT_STATE.get("error_count") or 0),
                "consecutive_errors": int(WHATSAPP_AUTOPILOT_STATE.get("consecutive_errors") or 0),
            },
        }
    _safe_write_json(ORION_WHATSAPP_AUTOPILOT_STATE_FILE, payload)


def _whatsapp_autopilot_mark_error(detail: str, source: str = "webhook"):
    _init()
    now = _utc_now_iso()
    category = _classify_autopilot_error(detail)
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["last_error"] = detail
        WHATSAPP_AUTOPILOT_STATE["last_error_at"] = now
        WHATSAPP_AUTOPILOT_STATE["last_error_category"] = category
        WHATSAPP_AUTOPILOT_STATE["last_error_source"] = str(source or "webhook")
        WHATSAPP_AUTOPILOT_STATE["error_count"] = int(WHATSAPP_AUTOPILOT_STATE.get("error_count") or 0) + 1
        WHATSAPP_AUTOPILOT_STATE["consecutive_errors"] = int(WHATSAPP_AUTOPILOT_STATE.get("consecutive_errors") or 0) + 1
        WHATSAPP_AUTOPILOT_STATE["last_inbound_at"] = now
    _persist_whatsapp_autopilot_state()


def _whatsapp_autopilot_activate():
    _init()
    if not ORION_WHATSAPP_AUTOPILOT_ENABLED:
        return
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["enabled"] = True
        WHATSAPP_AUTOPILOT_STATE["active"] = True
        if not WHATSAPP_AUTOPILOT_STATE.get("started_at"):
            WHATSAPP_AUTOPILOT_STATE["started_at"] = _utc_now_iso()
    _persist_whatsapp_autopilot_state()


def _whatsapp_autopilot_mark_inbound(clear_error: bool = True):
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["last_inbound_at"] = _utc_now_iso()
        if clear_error:
            WHATSAPP_AUTOPILOT_STATE["last_error"] = None
            WHATSAPP_AUTOPILOT_STATE["last_error_at"] = None
            WHATSAPP_AUTOPILOT_STATE["last_error_category"] = None
            WHATSAPP_AUTOPILOT_STATE["last_error_source"] = None
            WHATSAPP_AUTOPILOT_STATE["consecutive_errors"] = 0
    _persist_whatsapp_autopilot_state()


def _whatsapp_autopilot_increment_processed():
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["processed_messages"] = int(WHATSAPP_AUTOPILOT_STATE.get("processed_messages") or 0) + 1


def _whatsapp_connector_state(credential_id: str) -> Dict[str, Any]:
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        connectors = WHATSAPP_AUTOPILOT_STATE.setdefault("connectors", {})
        raw = connectors.get(credential_id)
        if not isinstance(raw, dict):
            raw = {}
        connectors[credential_id] = raw
        return raw


def _set_whatsapp_connector_state(credential_id: str, patch: Dict[str, Any]):
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        connectors = WHATSAPP_AUTOPILOT_STATE.setdefault("connectors", {})
        current = connectors.get(credential_id)
        if not isinstance(current, dict):
            current = {}
        for key, value in patch.items():
            current[key] = value
        connectors[credential_id] = current
    _persist_whatsapp_autopilot_state()


def _list_whatsapp_connector_entries() -> List[Dict[str, Any]]:
    _init()
    requested_ws = _normalize_workspace_id(ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID)
    entries: List[Dict[str, Any]] = []
    seen_identities: set[str] = set()
    for item in load_vault().get("credentials", []):
        if not isinstance(item, dict):
            continue
        if str(item.get("provider") or "").strip().lower() != "whatsapp_twilio":
            continue
        if not _workspace_visible(item.get("workspace_id"), requested_ws):
            continue
        if _connector_paused(item):
            continue
        credential_id = str(item.get("id") or "").strip()
        workspace_id = _normalize_workspace_id(item.get("workspace_id"))
        if not credential_id:
            continue
        try:
            secret = resolve_vault_credential(credential_id, workspace_id)
        except Exception:
            continue
        account_sid = str(secret.get("account_sid") or "").strip()
        from_number = _normalize_whatsapp_number(secret.get("from_number"))
        to_number = _normalize_whatsapp_number(secret.get("to_number"))
        identity = f"{account_sid}:{from_number}:{to_number}" if account_sid and from_number and to_number else ""
        if identity:
            if identity in seen_identities:
                continue
            seen_identities.add(identity)
        entries.append(item)
    entries.sort(key=lambda item: str(item.get("label") or "").lower())
    return entries


def _whatsapp_autopilot_snapshot(include_connectors: bool = False) -> Dict[str, Any]:
    _init()
    with WHATSAPP_AUTOPILOT_LOCK:
        connectors_raw = WHATSAPP_AUTOPILOT_STATE.get("connectors", {})
        connectors = dict(connectors_raw) if isinstance(connectors_raw, dict) else {}
        snapshot: Dict[str, Any] = {
            "enabled": bool(ORION_WHATSAPP_AUTOPILOT_ENABLED),
            "active": bool(WHATSAPP_AUTOPILOT_STATE.get("active")),
            "started_at": WHATSAPP_AUTOPILOT_STATE.get("started_at"),
            "last_inbound_at": WHATSAPP_AUTOPILOT_STATE.get("last_inbound_at"),
            "last_error": WHATSAPP_AUTOPILOT_STATE.get("last_error"),
            "last_error_at": WHATSAPP_AUTOPILOT_STATE.get("last_error_at"),
            "last_error_category": WHATSAPP_AUTOPILOT_STATE.get("last_error_category"),
            "last_error_source": WHATSAPP_AUTOPILOT_STATE.get("last_error_source"),
            "error_count": int(WHATSAPP_AUTOPILOT_STATE.get("error_count") or 0),
            "consecutive_errors": int(WHATSAPP_AUTOPILOT_STATE.get("consecutive_errors") or 0),
            "processed_messages": int(WHATSAPP_AUTOPILOT_STATE.get("processed_messages") or 0),
            "runs_started": int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0),
            "run_timeout_seconds": ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS,
            "max_reply_chars": ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS,
            "require_prefix": bool(ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX),
            "prefix": ORION_WHATSAPP_AUTOPILOT_PREFIX,
            "default_profile": ORION_WHATSAPP_AUTOPILOT_PROFILE,
            "state_file": str(ORION_WHATSAPP_AUTOPILOT_STATE_FILE),
            # WhatsApp autopilot is webhook-driven (no poll thread); treat active state as listener liveliness.
            "thread_alive": bool(ORION_WHATSAPP_AUTOPILOT_ENABLED and WHATSAPP_AUTOPILOT_STATE.get("active")),
        }
    connector_error_count = 0
    for connector_state in connectors.values():
        if isinstance(connector_state, dict) and connector_state.get("last_error"):
            connector_error_count += 1
    snapshot["connector_state_count"] = len(connectors)
    snapshot["connector_error_count"] = connector_error_count
    try:
        snapshot["connectors_seen"] = len(_list_whatsapp_connector_entries())
    except Exception as exc:
        snapshot["connectors_seen"] = 0
        if not snapshot.get("last_error"):
            snapshot["last_error"] = str(exc)
            snapshot["last_error_category"] = _classify_autopilot_error(exc)
            snapshot["last_error_source"] = "list_connectors"
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["connectors_seen"] = int(snapshot.get("connectors_seen") or 0)
    if include_connectors:
        snapshot["connectors"] = connectors
    return snapshot


def _telegram_autopilot_mark_error(detail: str, source: str = "loop") -> float:
    _init()
    now_ts = time.time()
    now_iso = _utc_now_iso()
    category = _classify_autopilot_error(detail)
    source_name = str(source or "loop")
    backoff_seconds = 0.0
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["last_error"] = detail
        TELEGRAM_AUTOPILOT_STATE["last_poll_at"] = now_iso
        TELEGRAM_AUTOPILOT_STATE["last_error_at"] = now_iso
        TELEGRAM_AUTOPILOT_STATE["last_error_category"] = category
        TELEGRAM_AUTOPILOT_STATE["last_error_source"] = source_name
        TELEGRAM_AUTOPILOT_STATE["error_count"] = int(TELEGRAM_AUTOPILOT_STATE.get("error_count") or 0) + 1
        TELEGRAM_AUTOPILOT_STATE["consecutive_errors"] = int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0) + 1
        if source_name == "loop":
            TELEGRAM_AUTOPILOT_STATE["retry_count"] = int(TELEGRAM_AUTOPILOT_STATE.get("retry_count") or 0) + 1
            TELEGRAM_AUTOPILOT_STATE["last_retry_at"] = now_iso
            consecutive = int(TELEGRAM_AUTOPILOT_STATE.get("consecutive_errors") or 0)
            base_delay = max(1.0, float(ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS))
            backoff_seconds = min(60.0, base_delay * (1.6 ** min(consecutive, 8)))
            TELEGRAM_AUTOPILOT_STATE["backoff_seconds"] = round(backoff_seconds, 3)
            TELEGRAM_AUTOPILOT_STATE["next_retry_at"] = _iso_from_epoch(now_ts + backoff_seconds)
    _persist_telegram_autopilot_state()
    return backoff_seconds


def _telegram_autopilot_mark_poll(clear_error: bool = True):
    _init()
    now = _utc_now_iso()
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["last_poll_at"] = now
        if clear_error:
            TELEGRAM_AUTOPILOT_STATE["last_error"] = None
            TELEGRAM_AUTOPILOT_STATE["last_error_at"] = None
            TELEGRAM_AUTOPILOT_STATE["last_error_category"] = None
            TELEGRAM_AUTOPILOT_STATE["last_error_source"] = None
            TELEGRAM_AUTOPILOT_STATE["consecutive_errors"] = 0
            TELEGRAM_AUTOPILOT_STATE["backoff_seconds"] = 0.0
            TELEGRAM_AUTOPILOT_STATE["next_retry_at"] = None
            TELEGRAM_AUTOPILOT_STATE["last_success_at"] = now


def _telegram_connector_state(credential_id: str) -> Dict[str, Any]:
    _init()
    with TELEGRAM_AUTOPILOT_LOCK:
        connectors = TELEGRAM_AUTOPILOT_STATE.setdefault("connectors", {})
        raw = connectors.get(credential_id)
        if not isinstance(raw, dict):
            raw = {}
        connectors[credential_id] = raw
        return raw


def _set_telegram_connector_state(credential_id: str, patch: Dict[str, Any]):
    _init()
    with TELEGRAM_AUTOPILOT_LOCK:
        connectors = TELEGRAM_AUTOPILOT_STATE.setdefault("connectors", {})
        current = connectors.get(credential_id)
        if not isinstance(current, dict):
            current = {}
        for key, value in patch.items():
            current[key] = value
        connectors[credential_id] = current
    _persist_telegram_autopilot_state()


def _list_telegram_connector_entries() -> List[Dict[str, Any]]:
    _init()
    requested_ws = _normalize_workspace_id(ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID)
    entries: List[Dict[str, Any]] = []
    seen_identities: set[str] = set()
    for item in load_vault().get("credentials", []):
        if not isinstance(item, dict):
            continue
        if str(item.get("provider") or "").strip().lower() != "telegram_bot":
            continue
        if not _workspace_visible(item.get("workspace_id"), requested_ws):
            continue
        if _connector_paused(item):
            continue
        try:
            secret = _telegram_get_secret(item)
        except Exception:
            continue
        bot_token = str(secret.get("bot_token") or "").strip()
        chat_id = str(secret.get("chat_id") or "").strip()
        identity = f"{bot_token}:{chat_id}" if bot_token and chat_id else ""
        if identity:
            if identity in seen_identities:
                continue
            seen_identities.add(identity)
        entries.append(item)
    entries.sort(key=lambda item: str(item.get("label") or "").lower())
    return entries


def _telegram_get_secret(entry: Dict[str, Any]) -> Dict[str, Any]:
    credential_id = str(entry.get("id") or "").strip()
    workspace_id = _normalize_workspace_id(entry.get("workspace_id"))
    if not credential_id:
        raise RuntimeError("Connector entry is missing id.")
    return resolve_vault_credential(credential_id, workspace_id)


def _telegram_api_request(
    bot_token: str,
    method_name: str,
    params: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    base = f"https://api.telegram.org/bot{bot_token}/{method_name}"
    if params:
        query_parts = []
        for key, value in params.items():
            if value is None:
                continue
            query_parts.append(f"{quote_plus(str(key))}={quote_plus(str(value))}")
        if query_parts:
            base = f"{base}?{'&'.join(query_parts)}"
    headers: Dict[str, str] = {}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    timeout_seconds = max(6, int(max(1.0, ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS)) + 3)
    res = http_json_request(base, method="POST" if payload is not None else "GET", headers=headers, payload=payload, timeout=timeout_seconds)
    body = res.get("json") if isinstance(res.get("json"), dict) else {}
    if not isinstance(body, dict):
        raise RuntimeError(f"Unexpected Telegram response for {method_name}.")
    if res.get("status") != 200 or not bool(body.get("ok")):
        detail = str(body.get("description") or "").strip()
        raise RuntimeError(detail or f"Telegram {method_name} failed.")
    result = body.get("result")
    return result if isinstance(result, dict) else {"result": result}


def _telegram_chat_matches(configured_chat_id: str, chat: Dict[str, Any]) -> bool:
    if not isinstance(chat, dict):
        return False
    if bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT", False)):
        return bool(str(chat.get("id") or chat.get("username") or "").strip())
    expected = str(configured_chat_id or "").strip()
    if not expected:
        return False
    if expected.lower() in {"*", "any", "all"}:
        return True
    chat_id = str(chat.get("id") or "").strip()
    chat_username = str(chat.get("username") or "").strip().lower()
    if expected.startswith("@"):
        return chat_username == expected[1:].lower()
    return chat_id == expected


def _telegram_parse_allow_from(value: Any) -> List[str]:
    tokens: List[str] = []
    if isinstance(value, list):
        raw_items = value
    elif isinstance(value, str):
        raw_items = value.split(",")
    else:
        raw_items = []
    for item in raw_items:
        token = str(item or "").strip().lower()
        if token:
            tokens.append(token)
    out: List[str] = []
    for token in tokens:
        normalized = token
        if normalized.startswith("id:"):
            normalized = normalized[3:].strip()
        elif normalized.startswith("user:"):
            normalized = f"@{normalized[5:].strip()}"
        if not normalized:
            continue
        if normalized in {"*", "any", "all"}:
            return ["*"]
        if normalized.startswith("@"):
            normalized = f"@{normalized[1:].strip().lower()}"
            if normalized == "@":
                continue
        elif re.fullmatch(r"-?\d+", normalized):
            pass
        else:
            normalized = f"@{normalized}"
        if normalized and normalized not in out:
            out.append(normalized)
    return out


def _telegram_resolve_allow_from(entry: Dict[str, Any]) -> List[str]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    env_value = os.getenv("ORION_TELEGRAM_AUTOPILOT_ALLOW_FROM", "")
    merged: List[str] = []
    for candidate in (
        metadata.get("allow_from"),
        metadata.get("telegram_allow_from"),
        metadata.get("autopilot_allow_from"),
        env_value,
    ):
        parsed = _telegram_parse_allow_from(candidate)
        for token in parsed:
            if token == "*":
                return ["*"]
            if token not in merged:
                merged.append(token)
    return merged


def _telegram_sender_allowed(sender: Dict[str, Any], allow_from: List[str]) -> bool:
    if not allow_from or "*" in allow_from:
        return True
    sender_id = str(sender.get("id") or "").strip()
    sender_username = str(sender.get("username") or "").strip().lower()
    if sender_id and sender_id in allow_from:
        return True
    if sender_username:
        normalized_username = f"@{sender_username}"
        if normalized_username in allow_from:
            return True
    return False


def _telegram_extract_message(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _TELEGRAM_MEDIA_SERVICE.extract_message(update)


def _telegram_safe_path_token(value: Any) -> str:
    return telegram_safe_path_token(value)


def _telegram_extension_from_attachment(attachment: Dict[str, Any], remote_file_path: str) -> str:
    return _TELEGRAM_MEDIA_SERVICE.extension_from_attachment(attachment, remote_file_path)


def _telegram_download_file(bot_token: str, remote_file_path: str, dest_path: Path, max_bytes: int) -> int:
    return _TELEGRAM_MEDIA_SERVICE.download_file(bot_token, remote_file_path, dest_path, max_bytes)


def _telegram_store_attachments(
    *,
    bot_token: str,
    workspace_id: str,
    chat_id: str,
    update_id: int,
    message_id: str,
    attachments: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return _TELEGRAM_MEDIA_SERVICE.store_attachments(
        bot_token=bot_token,
        workspace_id=workspace_id,
        chat_id=chat_id,
        update_id=update_id,
        message_id=message_id,
        attachments=attachments,
    )


def _telegram_build_goal_with_attachments(goal: str, attachments: List[Dict[str, Any]]) -> str:
    return _TELEGRAM_MEDIA_SERVICE.build_goal_with_attachments(goal, attachments)


def _bool_from_any(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    raw = str(value).strip().lower()
    if raw in {"1", "true", "yes", "y", "on"}:
        return True
    if raw in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _connector_metadata(entry: Dict[str, Any]) -> Dict[str, Any]:
    return entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}


def _connector_assigned_agent_role(entry: Dict[str, Any]) -> str:
    _init()
    metadata = _connector_metadata(entry)
    normalize = globals().get("normalize_agent_role")
    if callable(normalize):
        try:
            return str(normalize(metadata.get("agent_role")) or "").strip().lower()
        except Exception:
            return ""
    return str(metadata.get("agent_role") or "").strip().lower()


def _connector_paused(entry: Dict[str, Any]) -> bool:
    return _bool_from_any(_connector_metadata(entry).get("paused"), False)


def _telegram_strip_prefix(text: str, prefix: str) -> Dict[str, Any]:
    return _TELEGRAM_ROUTING_SERVICE.strip_prefix(text, prefix)


def _resolve_telegram_autopilot_profile(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    requested_profile = str(metadata.get("autopilot_profile") or ORION_TELEGRAM_AUTOPILOT_PROFILE).strip().lower()
    if requested_profile not in TELEGRAM_AUTOPILOT_PROFILE_CATALOG:
        requested_profile = "assistant"
    profile_base = TELEGRAM_AUTOPILOT_PROFILE_CATALOG.get(requested_profile, TELEGRAM_AUTOPILOT_PROFILE_CATALOG["assistant"])

    prefix = str(metadata.get("autopilot_prefix") or ORION_TELEGRAM_AUTOPILOT_PREFIX).strip() or ORION_TELEGRAM_AUTOPILOT_PREFIX
    require_prefix = _bool_from_any(metadata.get("autopilot_require_prefix"), ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX)
    allow_free_text = _bool_from_any(metadata.get("autopilot_allow_free_text"), bool(profile_base.get("allow_free_text")))
    allow_status = _bool_from_any(metadata.get("autopilot_allow_status"), bool(profile_base.get("allow_status")))
    allow_help = _bool_from_any(metadata.get("autopilot_allow_help"), bool(profile_base.get("allow_help")))

    return {
        "id": requested_profile,
        "label": profile_base.get("label"),
        "description": profile_base.get("description"),
        "prefix": prefix,
        "require_prefix": require_prefix,
        "allow_free_text": allow_free_text,
        "allow_status": allow_status,
        "allow_help": allow_help,
    }


def _resolve_whatsapp_autopilot_profile(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    requested_profile = str(
        metadata.get("autopilot_profile_whatsapp")
        or metadata.get("autopilot_profile")
        or ORION_WHATSAPP_AUTOPILOT_PROFILE
    ).strip().lower()
    if requested_profile not in WHATSAPP_AUTOPILOT_PROFILE_CATALOG:
        requested_profile = "assistant"
    profile_base = WHATSAPP_AUTOPILOT_PROFILE_CATALOG.get(requested_profile, WHATSAPP_AUTOPILOT_PROFILE_CATALOG["assistant"])

    prefix = str(
        metadata.get("autopilot_prefix_whatsapp")
        or metadata.get("autopilot_prefix")
        or ORION_WHATSAPP_AUTOPILOT_PREFIX
    ).strip() or ORION_WHATSAPP_AUTOPILOT_PREFIX
    require_prefix = _bool_from_any(
        metadata.get("autopilot_require_prefix_whatsapp")
        if metadata.get("autopilot_require_prefix_whatsapp") is not None
        else metadata.get("autopilot_require_prefix"),
        ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX,
    )
    allow_free_text = _bool_from_any(metadata.get("autopilot_allow_free_text"), bool(profile_base.get("allow_free_text")))
    allow_status = _bool_from_any(metadata.get("autopilot_allow_status"), bool(profile_base.get("allow_status")))
    allow_help = _bool_from_any(metadata.get("autopilot_allow_help"), bool(profile_base.get("allow_help")))

    return {
        "id": requested_profile,
        "label": profile_base.get("label"),
        "description": profile_base.get("description"),
        "prefix": prefix,
        "require_prefix": require_prefix,
        "allow_free_text": allow_free_text,
        "allow_status": allow_status,
        "allow_help": allow_help,
    }


def _telegram_route_message(raw_text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    return _TELEGRAM_ROUTING_SERVICE.route_message(raw_text, profile)


def _telegram_help_text(profile: Dict[str, Any]) -> str:
    return _TELEGRAM_ROUTING_SERVICE.help_text(profile)


def _telegram_is_explicit_run_command(raw_text: str) -> bool:
    return _TELEGRAM_ROUTING_SERVICE.is_explicit_run_command(raw_text)


def _runtime_status_text(workspace_id: str) -> str:
    runtime_valid = not ORION_ENGINE_VALIDATION_ERRORS
    runtime_status = "healthy" if runtime_valid else "check"

    with METRICS_LOCK:
        runs_started = int(RUNTIME_METRICS.get("runs_started") or 0)
        runs_completed = int(RUNTIME_METRICS.get("runs_completed") or 0)
        runs_failed = int(RUNTIME_METRICS.get("runs_failed") or 0)
        runs_timeout = int(RUNTIME_METRICS.get("runs_timeout") or 0)

    with LOCAL_QUEUE_LOCK:
        pending_runs = len(LOCAL_PENDING_RUN_IDS)
        claimed_runs = len(LOCAL_CLAIMED_RUNS)
        now = _utc_now()
        online_workers = len(
            [
                record
                for record in LOCAL_WORKER_REGISTRY.values()
                if isinstance(record, dict) and _autopilot_is_worker_online(record, now)
            ]
        )

    recent_line = "none"
    with RUN_HISTORY_LOCK:
        if RUN_HISTORY:
            latest = RUN_HISTORY[0] if isinstance(RUN_HISTORY[0], dict) else {}
            rid = str(latest.get("run_id") or "")[:8]
            status = str(latest.get("status") or "unknown")
            recent_line = f"{rid} {status}" if rid else status

    lines = [
        "Empyralis Runtime Status",
        f"- workspace: {workspace_id}",
        f"- runtime: {runtime_status}",
        f"- runs: started={runs_started} completed={runs_completed} failed={runs_failed} timeout={runs_timeout}",
        f"- local companion: online_workers={online_workers} pending={pending_runs} claimed={claimed_runs}",
        f"- recent: {recent_line}",
    ]
    return "\n".join(lines)


def _autopilot_is_worker_online(record: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    helper = globals().get("_is_worker_online")
    if callable(helper):
        try:
            return bool(helper(record, now))
        except Exception:
            pass

    ref = now or _utc_now()
    seen_at = _parse_utc_ts(record.get("last_seen_at"))
    if seen_at is None:
        return False
    lease_seconds = int(record.get("lease_seconds") or ORION_LOCAL_LEASE_SECONDS)
    # Match local_queue semantics when helper is unavailable.
    online_window_seconds = max(20, lease_seconds * 2)
    return (ref - seen_at).total_seconds() <= online_window_seconds


def _local_companion_snapshot() -> Dict[str, int]:
    now = _utc_now()
    with LOCAL_QUEUE_LOCK:
        pending_runs = len(LOCAL_PENDING_RUN_IDS)
        claimed_runs = len(LOCAL_CLAIMED_RUNS)
        online_workers = len(
            [
                record
                for record in LOCAL_WORKER_REGISTRY.values()
                if isinstance(record, dict) and _autopilot_is_worker_online(record, now)
            ]
        )
    return {
        "online_workers": int(online_workers),
        "pending_runs": int(pending_runs),
        "claimed_runs": int(claimed_runs),
    }


def _telegram_runtime_status_text(workspace_id: str) -> str:
    return _runtime_status_text(workspace_id)


def _whatsapp_help_text(profile: Dict[str, Any]) -> str:
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX).strip() or DEFAULT_CHAT_PREFIX
    lines = [
        "Empyralis WhatsApp Commands",
        f"- {prefix} run <goal>",
    ]
    if bool(profile.get("allow_status")):
        lines.append(f"- {prefix} status")
    lines.append(f"- {prefix} approvals [limit]")
    lines.append(f"- {prefix} approve <event_id> [note]")
    lines.append(f"- {prefix} reject <event_id> [reason]")
    if bool(profile.get("allow_help")):
        lines.append(f"- {prefix} help")
    if bool(profile.get("allow_free_text")):
        lines.append("- Or send plain text to start a run.")
    else:
        lines.append("- Plain text is ignored in this profile.")
    return "\n".join(lines)


def _normalize_whatsapp_number(raw_value: Any) -> str:
    value = str(raw_value or "").strip().replace(" ", "")
    if not value:
        return ""
    if value.lower() in {"*", "whatsapp:*"}:
        return "whatsapp:*"
    if value.lower().startswith("whatsapp:"):
        suffix = value.split(":", 1)[1]
        return f"whatsapp:{suffix}"
    if value.startswith("+"):
        return f"whatsapp:{value}"
    return value.lower()


def _whatsapp_twiml(message: Optional[str] = None) -> Response:
    if message and str(message).strip():
        safe = html.escape(str(message), quote=False)
        xml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{safe}</Message></Response>'
    else:
        xml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    return Response(content=xml, media_type="application/xml")


def _twilio_send_whatsapp_message(
    account_sid: str,
    auth_token: str,
    from_number: str,
    to_number: str,
    body: str,
):
    sid = str(account_sid or "").strip()
    token = str(auth_token or "").strip()
    sender = _normalize_whatsapp_number(from_number)
    receiver = _normalize_whatsapp_number(to_number)
    if not sid or not token:
        raise RuntimeError("Twilio account_sid/auth_token are required.")
    if not sender or not receiver:
        raise RuntimeError("Twilio From/To numbers are required.")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{quote_plus(sid)}/Messages.json"
    basic = base64.b64encode(f"{sid}:{token}".encode("utf-8")).decode("ascii")
    payload = urlencode({"From": sender, "To": receiver, "Body": str(body or "")}).encode("utf-8")
    headers = {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    req = urlrequest.Request(url, data=payload, headers=headers, method="POST")
    context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urlrequest.urlopen(req, timeout=15, context=context) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
            parsed = json.loads(raw) if raw else {}
            if resp.status not in {200, 201}:
                raise RuntimeError(f"Twilio send failed: status {resp.status}")
            return parsed if isinstance(parsed, dict) else {}
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        detail = raw or str(exc)
        raise RuntimeError(f"Twilio send failed: HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc


def _truncate_one_line(text: str, limit: int) -> str:
    flat = re.sub(r"\s+", " ", str(text or "")).strip()
    cap = max(120, limit)
    if len(flat) <= cap:
        return flat
    return flat[: cap - 1].rstrip() + "…"


def _extract_run_error_messages(run: Dict[str, Any]) -> List[str]:
    messages: List[str] = []
    events = run.get("events") if isinstance(run.get("events"), list) else []
    for event in events:
        if not isinstance(event, dict):
            continue
        event_name = str(event.get("event") or "").strip().lower()
        if event_name != "run_error":
            continue
        message = str(event.get("message") or "").strip()
        if message:
            messages.append(message)
    for key in ("error", "last_error"):
        message = str(run.get(key) or "").strip()
        if message:
            messages.append(message)
    deduped: List[str] = []
    seen: set[str] = set()
    for message in messages:
        marker = message.lower()
        if marker in seen:
            continue
        seen.add(marker)
        deduped.append(message)
    return deduped


def _latest_run_error_message(run: Dict[str, Any]) -> str:
    messages = _extract_run_error_messages(run)
    if not messages:
        return ""
    return messages[-1]


def _is_non_retryable_run_error(detail: str) -> bool:
    text = str(detail or "").strip().lower()
    if not text:
        return False
    return any(marker in text for marker in _AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS)


def _friendly_autopilot_run_error(detail: str) -> str:
    text = str(detail or "").strip()
    lower = text.lower()
    if "missing scopes" in lower or "api.responses.write" in lower:
        return "AI account authorization failed. Missing required scope: api.responses.write. Open Setup and reconnect your AI account."
    if (
        "invalid api key" in lower
        or "incorrect api key" in lower
        or "unauthorized" in lower
        or "forbidden" in lower
    ):
        return "AI account authorization failed. Open Setup and reconnect your AI account."
    if "no credentials available" in lower or "api key is required" in lower or "api_key is required" in lower:
        return "No valid AI account is connected. Open Setup and connect an account."
    return text or "Run failed."


def _humanize_telegram_run_summary(summary: str) -> str:
    text = str(summary or "").strip()
    if not text:
        return "Something went wrong. Please try again."

    lower = text.lower()
    if "run timed out waiting on local companion" in lower:
        return "Still working on it, but the local helper is taking too long. Give me a moment and try again."
    if "local companion is offline" in lower:
        return "The local helper is offline right now. Start it in Setup and try again."
    if lower == "run not found." or "run not found" in lower:
        return "I lost track of that request. Please send it again."
    if "missing required scope" in lower or "api.responses.write" in lower:
        return "I couldn’t get a model reply right now. Please retry in a moment."
    if (
        "ai account authorization failed" in lower
        or "invalid api key" in lower
        or "incorrect api key" in lower
        or "unauthorized" in lower
        or "forbidden" in lower
    ):
        return "I couldn’t get a model reply right now. Please retry in a moment."
    if "no valid ai account is connected" in lower or "no credentials available" in lower:
        return "I don’t have a working model connection right now. Please retry in a moment."
    if "approval window timed out" in lower or "approval timeout" in lower:
        return "I waited too long for approval. Please send the request again and approve it when prompted."
    if "requires local companion execution" in lower:
        return "That task needs local execution first. Start the local helper in Setup and try again."
    if "run blocked by safety policy" in lower or "action policy blocked" in lower:
        return "That action is blocked by your current safety settings. Review approvals or trust settings and try again."
    if lower == "run failed." or "run failed on attempt" in lower:
        return "Something went wrong while I was handling that. Please try again."
    if "run timed out while waiting for completion" in lower:
        return "I am taking longer than expected. Please try again in a moment."
    return text


def _summarize_run_terminal_result(run: Dict[str, Any], summary_limit: int) -> str:
    summary = str(run.get("result") or "").strip()
    if not summary and isinstance(run.get("result_data"), dict):
        summary = _truncate_one_line(json.dumps(run.get("result_data")), summary_limit)
    if not summary:
        latest_error = _latest_run_error_message(run)
        if latest_error:
            summary = _friendly_autopilot_run_error(latest_error)
    if not summary:
        summary = "Run finished."
    return _truncate_one_line(summary, summary_limit)


def _autopilot_include_run_meta() -> bool:
    raw = str(os.getenv("ORION_AUTOPILOT_INCLUDE_RUN_META", "0") or "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _autopilot_run_reply_text(status: str, run_id: str, summary: str) -> str:
    return _telegram_run_dispatch_service().run_reply_text(status, run_id, summary)


def _cognitive_defaults() -> Dict[str, str]:
    niche_id = str(os.getenv("ORION_COGNITIVE_NICHE_ID") or "astronomy").strip() or "astronomy"
    db_override = str(os.getenv("ORION_COGNITIVE_DB_PATH") or "").strip()
    if db_override:
        db_path = db_override
    else:
        root_dir = Path(__file__).resolve().parents[1]
        db_path = str(root_dir / "python_engine" / "agency_memory.db")
    return {"niche_id": niche_id, "db_path": db_path}


def _cognitive_module():
    try:
        from python_engine import cognitive_daemon as _cd  # type: ignore
        return _cd
    except Exception:
        return None


def _autopilot_approvals_list(limit: int = 5) -> Dict[str, Any]:
    mod = _cognitive_module()
    if mod is None:
        return {"ok": False, "error": "cognitive_daemon_unavailable"}
    conf = _cognitive_defaults()
    try:
        items = mod.list_pending_approvals(
            db_path=conf["db_path"],
            niche_id=conf["niche_id"],
            limit=max(1, min(20, int(limit))),
        )
        return {"ok": True, "items": items, "count": len(items)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _autopilot_approval_resolve(event_id: str, approved: bool, note: str = "") -> Dict[str, Any]:
    mod = _cognitive_module()
    if mod is None:
        return {"ok": False, "error": "cognitive_daemon_unavailable"}
    conf = _cognitive_defaults()
    try:
        out = mod.resolve_event_approval(
            db_path=conf["db_path"],
            event_id=str(event_id or "").strip(),
            approved=bool(approved),
            note=str(note or "").strip(),
        )
        return out if isinstance(out, dict) else {"ok": False, "error": "invalid_resolve_response"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _autopilot_approvals_text(payload: Dict[str, Any], prefix: str = DEFAULT_CHAT_PREFIX) -> str:
    if not bool(payload.get("ok")):
        reason = str(payload.get("error") or "unable to load approvals")
        return f"Empyralis approvals unavailable: {reason}"
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    if not items:
        return "No pending approvals."
    lines = ["Pending approvals:"]
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        event_id = str(item.get("event_id") or "").strip()
        short_id = event_id[:8] if event_id else "unknown"
        risk = str(item.get("risk_level") or "").strip() or "unknown"
        summary = _truncate_one_line(str(item.get("summary") or "").strip(), 96)
        objective_title = _truncate_one_line(str(item.get("objective_title") or "").strip(), 40)
        objective_id = str(item.get("objective_id") or "").strip()
        objective_text = ""
        if objective_title:
            objective_text = f" objective={objective_title}"
        elif objective_id:
            objective_text = f" objective={objective_id[:8]}"
        if event_id:
            lines.append(
                f"- {short_id} risk={risk}{objective_text} {summary}\n  event_id: {event_id}".rstrip()
            )
        else:
            lines.append(f"- {short_id} risk={risk}{objective_text} {summary}".rstrip())
    lines.append(f"Use {prefix} approve <event_id> or {prefix} reject <event_id> <reason>")
    return "\n".join(lines)


def _autopilot_approval_result_text(payload: Dict[str, Any], approved: bool) -> str:
    if not bool(payload.get("ok")):
        reason = str(payload.get("error") or "approval update failed")
        return f"Approval update failed: {reason}"
    event_id = str(payload.get("event_id") or "").strip()
    short_id = event_id[:8] if event_id else "unknown"
    status = str(payload.get("status") or "").strip() or ("pending" if approved else "failed")
    if approved:
        return f"Approved {short_id}. Status: {status}."
    note = str(payload.get("note") or "").strip()
    suffix = f" Reason: {note}" if note else ""
    return f"Rejected {short_id}. Status: {status}.{suffix}"


def _telegram_send_message(
    bot_token: str,
    chat_id: str,
    text: str,
    workspace_id: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    parent_message_id: Optional[Any] = None,
    profile: Optional[Dict[str, Any]] = None,
    include_keyboard: bool = True,
    reply_markup: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
    source_event_id: Optional[str] = None,
) -> str:
    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if isinstance(reply_markup, dict) and reply_markup:
        payload["reply_markup"] = reply_markup
    elif include_keyboard and isinstance(profile, dict):
        default_keyboard = _telegram_reply_keyboard(profile)
        if default_keyboard:
            payload["reply_markup"] = default_keyboard
    resolved_trace_id = str(trace_id or "").strip()
    if not resolved_trace_id:
        resolved_trace_id = f"tg-out:{_telegram_safe_path_token(chat_id)}:{str(uuid.uuid4())[:10]}"
    try:
        result = _telegram_api_request(bot_token, "sendMessage", payload=payload)
    except Exception as exc:
        reason = str(exc)
        _append_channel_dead_letter(
            channel="telegram",
            direction="outbound",
            event_type="message",
            reason=reason,
            text=text,
            workspace_id=str(workspace_id or ""),
            session_key=_telegram_session_key(chat_id),
            run_id=str(run_id or ""),
            action=str(action or ""),
            connector_id=str(connector_id or ""),
            trace_id=resolved_trace_id,
            source_event_id=str(source_event_id or "").strip(),
            metadata={"transport": "telegram_sendMessage"},
        )
        raise
    sent = result.get("result") if isinstance(result.get("result"), dict) else {}
    sent_message_id = str(sent.get("message_id") or "").strip()
    session_key = _telegram_session_key(chat_id)
    _record_channel_event(
        channel="telegram",
        direction="outbound",
        event_type="message",
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        session_id=session_key,
        message_id=sent_message_id or None,
        parent_id=str(parent_message_id or "").strip() or None,
        run_id=run_id,
        action=action,
        metadata={
            "connector_id": str(connector_id or "").strip(),
            "trace_id": resolved_trace_id,
            "source_event_id": str(source_event_id or "").strip(),
            "delivery_status": "sent",
            "delivery_transport": "telegram_sendMessage",
        },
    )
    return sent_message_id


def _telegram_send_chat_action(bot_token: str, chat_id: str, action: str = "typing") -> None:
    try:
        _telegram_api_request(
            bot_token,
            "sendChatAction",
            payload={
                "chat_id": chat_id,
                "action": action,
            },
        )
    except Exception:
        return


def _telegram_edit_message(
    bot_token: str,
    chat_id: str,
    message_id: Any,
    text: str,
    *,
    workspace_id: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    parent_message_id: Optional[Any] = None,
    profile: Optional[Dict[str, Any]] = None,
    include_keyboard: bool = True,
    reply_markup: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
    source_event_id: Optional[str] = None,
) -> bool:
    message_token = str(message_id or "").strip()
    if not message_token:
        return False
    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "message_id": int(message_token) if message_token.isdigit() else message_token,
        "text": text,
        "disable_web_page_preview": True,
    }
    if isinstance(reply_markup, dict) and reply_markup:
        payload["reply_markup"] = reply_markup
    elif include_keyboard and isinstance(profile, dict):
        default_keyboard = _telegram_reply_keyboard(profile)
        if default_keyboard:
            payload["reply_markup"] = default_keyboard
    resolved_trace_id = str(trace_id or "").strip()
    if not resolved_trace_id:
        resolved_trace_id = f"tg-edit:{_telegram_safe_path_token(chat_id)}:{str(uuid.uuid4())[:10]}"
    try:
        _telegram_api_request(bot_token, "editMessageText", payload=payload)
    except Exception as exc:
        _append_channel_dead_letter(
            channel="telegram",
            direction="outbound",
            event_type="message_edit",
            reason=str(exc),
            text=text,
            workspace_id=str(workspace_id or ""),
            session_key=_telegram_session_key(chat_id),
            run_id=str(run_id or ""),
            action=str(action or ""),
            connector_id=str(connector_id or ""),
            trace_id=resolved_trace_id,
            source_event_id=str(source_event_id or "").strip(),
            metadata={"transport": "telegram_editMessageText", "message_id": message_token},
        )
        return False
    session_key = _telegram_session_key(chat_id)
    _record_channel_event(
        channel="telegram",
        direction="outbound",
        event_type="message_edit",
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        session_id=session_key,
        message_id=message_token or None,
        parent_id=str(parent_message_id or "").strip() or None,
        run_id=run_id,
        action=action,
        metadata={
            "connector_id": str(connector_id or "").strip(),
            "trace_id": resolved_trace_id,
            "source_event_id": str(source_event_id or "").strip(),
            "delivery_status": "sent",
            "delivery_transport": "telegram_editMessageText",
        },
    )
    return True


def _chat_id_from_session_key(session_key: str) -> str:
    key = str(session_key or "").strip()
    if not key:
        return ""
    if key.startswith("telegram:"):
        return key.split(":", 1)[1].strip()
    return ""


def _normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            token = str(item or "").strip()
            if token:
                out.append(token)
        return out
    return []


def _pending_approval_event_id(item: Dict[str, Any]) -> str:
    return str(item.get("event_id") or "").strip()


def _telegram_notify_pending_approvals(
    *,
    connector_state: Dict[str, Any],
    bot_token: str,
    chat_id: str,
    workspace_id: str,
    profile: Dict[str, Any],
    connector_id: str,
) -> Dict[str, Any]:
    patch: Dict[str, Any] = {}
    prefix = str(profile.get("prefix") or DEFAULT_CHAT_PREFIX)
    payload = _autopilot_approvals_list(limit=20)
    if not bool(payload.get("ok")):
        reason = str(payload.get("error") or "unable to load approvals").strip() or "unable to load approvals"
        if reason != str(connector_state.get("last_approval_notify_error") or "").strip():
            patch["last_approval_notify_error"] = reason
        return patch

    patch["last_approval_notify_error"] = None
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    pending_items = [item for item in items if isinstance(item, dict)]
    pending_ids: List[str] = []
    for item in pending_items:
        event_id = _pending_approval_event_id(item)
        if event_id and event_id not in pending_ids:
            pending_ids.append(event_id)

    previous_ids = _normalize_string_list(connector_state.get("notified_approval_ids"))
    pending_id_set = set(pending_ids)
    retained_ids = [event_id for event_id in previous_ids if event_id in pending_id_set]
    retained_id_set = set(retained_ids)
    new_items = [item for item in pending_items if _pending_approval_event_id(item) not in retained_id_set]

    if new_items:
        new_payload = {"ok": True, "items": new_items}
        notify_text = "⚠️ Approval required.\n" + _autopilot_approvals_text(new_payload, prefix=prefix)
        _telegram_send_message(
            bot_token,
            chat_id,
            notify_text,
            workspace_id=workspace_id,
            action="approval_notify",
            connector_id=connector_id,
            profile=profile,
            include_keyboard=False,
        )
        patch["last_approval_notified_at"] = _utc_now_iso()
        patch["last_approval_notified_count"] = len(new_items)

    patch["notified_approval_ids"] = pending_ids[:40]
    patch["last_pending_approval_count"] = len(pending_ids)
    return patch


async def handle_telegram_send_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    message = str(text or "").strip()
    if not message:
        raise RuntimeError("Message text is required.")
    if len(message) > 3900:
        raise RuntimeError("Message is too long for Telegram. Keep it under 3900 characters.")

    requested_workspace = _normalize_workspace_id(workspace_id)
    requested_chat_id = str(chat_id or "").strip() or _chat_id_from_session_key(str(session_key or "").strip())
    entries = _list_telegram_connector_entries()
    if requested_workspace:
        entries = [item for item in entries if _normalize_workspace_id(item.get("workspace_id")) == requested_workspace]
    if not entries:
        scope = requested_workspace or "visible workspaces"
        raise RuntimeError(f"No Telegram connector found for workspace '{scope}'.")

    selected_entry: Optional[Dict[str, Any]] = None
    selected_secret: Optional[Dict[str, Any]] = None
    target_chat_id = ""
    last_error = ""

    for entry in entries:
        try:
            secret = _telegram_get_secret(entry)
            bot_token = str(secret.get("bot_token") or "").strip()
            configured_chat_id = str(secret.get("chat_id") or "").strip()
            if not bot_token:
                raise RuntimeError("Connector is missing bot_token.")
            resolved_chat_id = requested_chat_id or configured_chat_id
            if not resolved_chat_id:
                raise RuntimeError("Connector is missing chat_id.")
            selected_entry = entry
            selected_secret = secret
            target_chat_id = resolved_chat_id
            break
        except Exception as exc:
            last_error = str(exc)
            continue

    if not selected_entry or not selected_secret:
        if last_error:
            raise RuntimeError(last_error)
        raise RuntimeError("Unable to resolve Telegram connector credentials.")

    connector_id = str(selected_entry.get("id") or "").strip()
    connector_label = str(selected_entry.get("label") or "Telegram Bot").strip()
    workspace_norm = _normalize_workspace_id(selected_entry.get("workspace_id"))
    bot_token = str(selected_secret.get("bot_token") or "").strip()
    trace_id = f"tg-terminal:{_telegram_safe_path_token(target_chat_id)}:{str(uuid.uuid4())[:10]}"

    _telegram_send_message(
        bot_token=bot_token,
        chat_id=target_chat_id,
        text=message,
        workspace_id=workspace_norm,
        action="terminal_send",
        connector_id=connector_id,
        trace_id=trace_id,
    )
    _set_telegram_connector_state(
        connector_id,
        {
            "label": connector_label,
            "workspace_id": workspace_norm,
            "last_action": "terminal_send",
            "last_chat_id": target_chat_id,
            "last_error": None,
            "last_processed_at": _utc_now_iso(),
            "last_poll_at": _utc_now_iso(),
        },
    )

    return {
        "ok": True,
        "channel": "telegram",
        "connector_id": connector_id,
        "connector_label": connector_label,
        "workspace_id": workspace_norm,
        "chat_id": target_chat_id,
        "session_key": _telegram_session_key(target_chat_id),
        "text": message,
        "trace_id": trace_id,
        "sent_at": _utc_now_iso(),
    }


async def handle_telegram_autopilot_test_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    sender_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    _init()
    message = str(text or "").strip()
    if not message:
        raise RuntimeError("Message text is required.")

    requested_workspace = _normalize_workspace_id(workspace_id)
    requested_connector_id = str(connector_id or "").strip()
    requested_chat_id = str(chat_id or "").strip() or _chat_id_from_session_key(str(session_key or "").strip())
    entries = _list_telegram_connector_entries()
    if requested_workspace:
        entries = [item for item in entries if _normalize_workspace_id(item.get("workspace_id")) == requested_workspace]
    if requested_connector_id:
        entries = [item for item in entries if str(item.get("id") or "").strip() == requested_connector_id]
    if not entries:
        scope = requested_workspace or "visible workspaces"
        raise RuntimeError(f"No Telegram connector found for workspace '{scope}'.")

    selected_entry: Optional[Dict[str, Any]] = None
    last_error = ""
    target_chat_id = ""
    for entry in entries:
        try:
            secret = _telegram_get_secret(entry)
            bot_token = str(secret.get("bot_token") or "").strip()
            configured_chat_id = str(secret.get("chat_id") or "").strip()
            if not bot_token:
                raise RuntimeError("Connector is missing bot_token.")
            resolved_chat_id = requested_chat_id or configured_chat_id
            if not resolved_chat_id:
                raise RuntimeError("Connector is missing chat_id.")
            if requested_chat_id and configured_chat_id and requested_chat_id != configured_chat_id:
                continue
            selected_entry = entry
            target_chat_id = resolved_chat_id
            break
        except Exception as exc:
            last_error = str(exc)
            continue

    if not selected_entry:
        if last_error:
            raise RuntimeError(last_error)
        raise RuntimeError("Unable to resolve Telegram connector credentials.")

    profile = _resolve_telegram_autopilot_profile(selected_entry)
    routed = _telegram_route_message(message, profile)
    action = str(routed.get("action") or "ignore").strip().lower()
    if action != "run":
        return {
            "ok": True,
            "channel": "telegram",
            "mode": "autopilot_test",
            "action": action,
            "routed": routed,
            "message": "Telegram autopilot routed the test message without starting a run.",
        }

    workspace_norm = _normalize_workspace_id(selected_entry.get("workspace_id")) or requested_workspace or "default"
    connector_id_value = str(selected_entry.get("id") or "").strip()
    sender_value = str(sender_id or "telegram-test-user").strip() or "telegram-test-user"
    chat_profile = _get_telegram_profile(workspace_norm, target_chat_id)
    goal = str(routed.get("goal") or "").strip()
    run_goal = _telegram_build_goal_with_profile(goal, chat_profile)
    connector_context = _telegram_workspace_connector_context(
        goal=goal,
        workspace_id=workspace_norm,
        current_connector_id=connector_id_value,
    )
    run_goal = _telegram_build_goal_with_connector_context(
        run_goal,
        str(connector_context.get("prompt_append") or "").strip(),
    )
    skill_query = _telegram_installed_skill_query(
        goal=goal,
        workspace_id=workspace_norm,
        connector_id=connector_id_value,
        chat_id=target_chat_id,
        session_key=_telegram_session_key(target_chat_id),
    )
    run_goal = _telegram_build_goal_with_connector_context(
        run_goal,
        str(skill_query.get("prompt_append") or "").strip(),
    )
    direct_response = str(skill_query.get("response") or "").strip() if bool(skill_query.get("handled")) else ""
    if direct_response:
        return {
            "ok": True,
            "channel": "telegram",
            "mode": "autopilot_test",
            "connector_id": connector_id_value,
            "chat_id": target_chat_id,
            "profile_id": str(profile.get("id") or "").strip(),
            "routed": routed,
            "connector_context": connector_context,
            "skill_query": skill_query,
            "result": {
                "status": "completed",
                "summary": direct_response,
                "reply": direct_response,
            },
        }
    run_info = _create_telegram_run(
        goal=run_goal,
        workspace_id=workspace_norm,
        connector_id=connector_id_value,
        chat_id=target_chat_id,
        sender_id=sender_value,
        update_id=int(time.time()),
        message_id=f"test-{str(uuid.uuid4())[:10]}",
        profile_context=chat_profile,
        trace_id=f"tg-test:{_telegram_safe_path_token(target_chat_id)}:{str(uuid.uuid4())[:10]}",
        source_event_id="telegram-test-message",
        connector_entry=selected_entry,
        connector_context=connector_context,
    )
    run_id = str(run_info.get("run_id") or "").strip()
    if not run_id:
        raise RuntimeError("Telegram autopilot test did not create a run.")
    result = await asyncio.to_thread(
        _wait_for_run_terminal_status,
        run_id,
        timeout_seconds,
        None,
    )
    run = runs.get(run_id) if isinstance(runs, dict) else None
    context = run.get("context") if isinstance(run, dict) and isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return {
        "ok": True,
        "channel": "telegram",
        "mode": "autopilot_test",
        "connector_id": connector_id_value,
        "chat_id": target_chat_id,
        "profile_id": str(profile.get("id") or "").strip(),
        "run_id": run_id,
        "routed": routed,
        "route": run_info.get("route"),
        "connector_context": connector_context,
        "skill_query": skill_query,
        "run_metadata": metadata,
        "result": result,
    }


def _create_telegram_run(
    goal: str,
    workspace_id: str,
    connector_id: str,
    chat_id: str,
    sender_id: str,
    update_id: int,
    message_id: Optional[str] = None,
    profile_context: Optional[Dict[str, str]] = None,
    media_attachments: Optional[List[Dict[str, Any]]] = None,
    skill_override: Optional[Dict[str, Any]] = None,
    trace_id: Optional[str] = None,
    source_event_id: Optional[str] = None,
    connector_entry: Optional[Dict[str, Any]] = None,
    connector_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    _init()
    resolved_trace_id = str(trace_id or "").strip() or _telegram_trace_id(chat_id, update_id, message_id or "")
    metadata: Dict[str, Any] = {
        "source": "telegram_autopilot",
        "channel": "telegram",
        "source_channel": "telegram",
        "connector_credential_id": connector_id,
        "source_connector_credential_id": connector_id,
        "trace_id": resolved_trace_id,
        "source_event_id": str(source_event_id or "").strip(),
        "delivery_status": "pending",
        "telegram": {
            "chat_id": chat_id,
            "sender_id": sender_id,
            "update_id": update_id,
            "message_id": str(message_id or "").strip(),
        },
    }
    owner_user_id = _agent_machine_owned_entrypoint_owner_user_id()
    if owner_user_id:
        metadata["owner_user_id"] = owner_user_id
    if isinstance(connector_context, dict):
        available_connectors = (
            connector_context.get("available_connectors")
            if isinstance(connector_context.get("available_connectors"), list)
            else []
        )
        if available_connectors:
            metadata["available_connectors"] = available_connectors
        channel_connectors = (
            connector_context.get("channel_connectors")
            if isinstance(connector_context.get("channel_connectors"), list)
            else []
        )
        if channel_connectors:
            metadata["channel_connectors"] = channel_connectors
        selected_connector_id = str(connector_context.get("connector_credential_id") or "").strip()
        if selected_connector_id:
            metadata["connector_credential_id"] = selected_connector_id
        selected_connector_provider = str(connector_context.get("connector_provider") or "").strip()
        if selected_connector_provider:
            metadata["connector_provider"] = selected_connector_provider
        connector_prompt_append = str(connector_context.get("prompt_append") or "").strip()
        if connector_prompt_append:
            metadata["connector_prompt_append"] = connector_prompt_append[:12000]
    if isinstance(profile_context, dict):
        profile_payload: Dict[str, str] = {}
        for field_name in _TELEGRAM_PROFILE_FIELDS:
            raw_value = str(profile_context.get(field_name) or "").strip()
            if raw_value:
                profile_payload[field_name] = raw_value[:2000]
        if profile_payload:
            metadata["telegram"]["profile_context"] = profile_payload
    if isinstance(media_attachments, list) and media_attachments:
        compact_media: List[Dict[str, Any]] = []
        for item in media_attachments[:ORION_TELEGRAM_MEDIA_MAX_ITEMS]:
            if not isinstance(item, dict):
                continue
            path = str(item.get("relative_path") or item.get("path") or "").strip()
            if not path:
                continue
            compact_media.append(
                {
                    "kind": str(item.get("kind") or "").strip(),
                    "mime_type": str(item.get("mime_type") or "").strip(),
                    "path": path[:2000],
                    "bytes": int(item.get("bytes") or 0),
                }
            )
        if compact_media:
            metadata["telegram"]["attachments"] = compact_media
    if isinstance(skill_override, dict):
        skill_id = str(skill_override.get("id") or "").strip().lower()
        skill_title = str(skill_override.get("title") or "").strip()
        skill_intent = str(skill_override.get("intent") or "").strip()
        if skill_id and skill_title and skill_intent:
            tools_raw = skill_override.get("tools") if isinstance(skill_override.get("tools"), list) else []
            tools = [str(item).strip()[:120] for item in tools_raw if str(item).strip()][:30]
            guardrail = str(skill_override.get("guardrail") or "").strip()[:1000]
            skill_payload = {
                "id": skill_id[:80],
                "title": skill_title[:120],
                "intent": skill_intent[:1200],
                "tools": tools,
                "guardrail": guardrail,
            }
            metadata["skill_scope"] = "assistant_defaults"
            metadata["skill_bundle"] = {
                "skill_ids": [skill_payload["id"]],
                "skills": [skill_payload],
            }
            metadata["skill_prompt_append"] = (
                "Active skill directives (follow unless user overrides explicitly):\n"
                f"- {skill_payload['title']}: {skill_payload['intent']} "
                f"Guardrail: {skill_payload['guardrail'] or 'none'}. "
                f"Tools: {', '.join(skill_payload['tools']) or 'none'}."
            )[:6000]
    assigned_role = _connector_assigned_agent_role(connector_entry or {})
    if assigned_role:
        metadata["agent_role"] = assigned_role
        metadata["agent_role_source"] = "connector_assignment"
    metadata["trust_mode"] = normalize_trust_mode(ORION_TELEGRAM_AUTOPILOT_TRUST_MODE)
    selected_target = normalize_execution_target(ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET)
    metadata["execution_target"] = selected_target
    route = decide_execution_target(metadata)
    metadata = apply_execution_route_metadata(metadata, route)

    engine = ORION_TELEGRAM_AUTOPILOT_ENGINE if ORION_TELEGRAM_AUTOPILOT_ENGINE in ENGINE_REGISTRY else "orion"
    run_id = create_run(
        engine=engine,
        context={
            "workflow_id": None,
            "workspace_id": workspace_id,
            "user_goal": goal,
            "business_plan": None,
            "provider": None,
            "model": None,
            "credential_id": None,
            "agents": [],
            "metadata": metadata,
        },
    )
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["runs_started"] = int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0) + 1
    _persist_telegram_autopilot_state()
    _record_channel_event(
        channel="telegram",
        direction="system",
        event_type="run_started",
        text=f"Run started for chat {chat_id}",
        workspace_id=workspace_id,
        session_key=_telegram_session_key(chat_id),
        session_id=_telegram_session_key(chat_id),
        parent_id=str(message_id or "").strip() or None,
        run_id=run_id,
        action="run",
        metadata={
            "connector_id": connector_id,
            "sender_id": sender_id,
            "update_id": int(update_id or 0),
            "message_id": str(message_id or "").strip(),
            "trace_id": resolved_trace_id,
            "source_event_id": str(source_event_id or "").strip(),
            "delivery_status": "pending",
            "agent_role": assigned_role or None,
        },
    )
    return {"run_id": run_id, "route": route}


def _agent_machine_owned_entrypoint_owner_user_id(owner_user_id: Optional[str] = None) -> str:
    from server_modules import runtime_config

    return runtime_config.agent_machine_inherited_owner_user_id(owner_user_id)


def _agent_machine_full_trust_for_run(run: Dict[str, Any]) -> bool:
    from server_modules import runtime_config

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return runtime_config.agent_machine_full_trust_enabled(str(metadata.get("owner_user_id") or "").strip())


def _pending_confirmation_payload(run: Dict[str, Any]) -> Dict[str, Any]:
    pending = run.get("pending_confirmation")
    if isinstance(pending, dict) and pending:
        return pending
    pending = run.get("pending_approval")
    if isinstance(pending, dict):
        return pending
    return {}


def _autopilot_can_auto_approve_wait(run: Dict[str, Any]) -> bool:
    if not _agent_machine_full_trust_for_run(run):
        return False
    pending = _pending_confirmation_payload(run)
    approval_id = str(pending.get("approval_id") or "").strip()
    if not approval_id:
        return False
    source = str(pending.get("source") or "").strip().lower()
    if source in {"runtime_wait", "local_execution_start"}:
        return True
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return bool(metadata.get("local_execution_waiting_confirmation") or metadata.get("local_execution_waiting_approval"))


def _wait_for_run_terminal_status(
    run_id: str,
    timeout_seconds: Optional[int] = None,
    max_reply_chars: Optional[int] = None,
) -> Dict[str, Any]:
    _init()
    return _telegram_run_dispatch_service().wait_for_terminal_status(
        run_id,
        timeout_seconds=timeout_seconds,
        max_reply_chars=max_reply_chars,
    )


def _create_whatsapp_run(
    goal: str,
    workspace_id: str,
    connector_id: str,
    from_number: str,
    to_number: str,
    message_sid: str,
    account_sid: str,
    connector_entry: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    _init()
    trace_id = f"wa:{_telegram_safe_path_token(to_number or 'to')}:{_telegram_safe_path_token(message_sid or str(uuid.uuid4())[:10])}"
    metadata: Dict[str, Any] = {
        "source": "whatsapp_autopilot",
        "channel": "whatsapp",
        "source_channel": "whatsapp",
        "connector_credential_id": connector_id,
        "trace_id": trace_id,
        "source_event_id": str(message_sid or "").strip(),
        "delivery_status": "pending",
        "whatsapp": {
            "from": from_number,
            "to": to_number,
            "message_sid": message_sid,
            "account_sid": account_sid,
        },
    }
    owner_user_id = _agent_machine_owned_entrypoint_owner_user_id()
    if owner_user_id:
        metadata["owner_user_id"] = owner_user_id
    assigned_role = _connector_assigned_agent_role(connector_entry or {})
    if assigned_role:
        metadata["agent_role"] = assigned_role
        metadata["agent_role_source"] = "connector_assignment"
    metadata["trust_mode"] = normalize_trust_mode(ORION_WHATSAPP_AUTOPILOT_TRUST_MODE)
    selected_target = normalize_execution_target(ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET)
    metadata["execution_target"] = selected_target
    route = decide_execution_target(metadata)
    metadata = apply_execution_route_metadata(metadata, route)

    engine = ORION_WHATSAPP_AUTOPILOT_ENGINE if ORION_WHATSAPP_AUTOPILOT_ENGINE in ENGINE_REGISTRY else "orion"
    run_id = create_run(
        engine=engine,
        context={
            "workflow_id": None,
            "workspace_id": workspace_id,
            "user_goal": goal,
            "business_plan": None,
            "provider": None,
            "model": None,
            "credential_id": None,
            "agents": [],
            "metadata": metadata,
        },
    )
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["runs_started"] = int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0) + 1
    _persist_whatsapp_autopilot_state()
    _record_channel_event(
        channel="whatsapp",
        direction="system",
        event_type="run_started",
        text=f"Run started for WhatsApp inbound {from_number}",
        workspace_id=workspace_id,
        session_key=_whatsapp_session_key(from_number, to_number),
        session_id=_whatsapp_session_key(from_number, to_number),
        parent_id=str(message_sid or "").strip() or None,
        run_id=run_id,
        action="run",
        metadata={
            "connector_id": connector_id,
            "message_sid": message_sid,
            "account_sid": account_sid,
            "to_number": to_number,
            "trace_id": trace_id,
            "source_event_id": str(message_sid or "").strip(),
            "agent_role": assigned_role or None,
            "delivery_status": "pending",
        },
    )
    return {"run_id": run_id, "route": route}


def _whatsapp_connector_match(
    account_sid: str,
    from_number: str,
    to_number: str,
) -> Optional[Dict[str, Any]]:
    inbound_account = str(account_sid or "").strip()
    inbound_from = _normalize_whatsapp_number(from_number)
    inbound_to = _normalize_whatsapp_number(to_number)
    entries = _list_whatsapp_connector_entries()
    with WHATSAPP_AUTOPILOT_LOCK:
        WHATSAPP_AUTOPILOT_STATE["connectors_seen"] = len(entries)
    for entry in entries:
        credential_id = str(entry.get("id") or "").strip()
        workspace_id = _normalize_workspace_id(entry.get("workspace_id"))
        if not credential_id:
            continue
        try:
            secret = resolve_vault_credential(credential_id, workspace_id)
        except Exception:
            continue
        connector_sid = str(secret.get("account_sid") or "").strip()
        if inbound_account and connector_sid and inbound_account != connector_sid:
            continue
        connector_to = _normalize_whatsapp_number(secret.get("from_number"))
        if connector_to and inbound_to and connector_to != inbound_to:
            continue
        connector_from = _normalize_whatsapp_number(secret.get("to_number"))
        if connector_from and connector_from not in {"*", "whatsapp:*"} and inbound_from and connector_from != inbound_from:
            continue
        return {
            "entry": entry,
            "secret": secret,
            "connector_id": credential_id,
            "workspace_id": workspace_id or ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID or "default",
        }
    return None


def _whatsapp_finalize_run_async(
    run_id: str,
    connector_id: str,
    workspace_id: str,
    profile: Dict[str, Any],
    secret: Dict[str, Any],
    reply_to_number: str,
):
    _whatsapp_run_dispatch_service().finalize_run_async(
        run_id,
        connector_id,
        workspace_id,
        profile,
        secret,
        reply_to_number,
    )


async def _parse_form_urlencoded(request: Request) -> Dict[str, str]:
    raw = await request.body()
    return _whatsapp_webhook_service().parse_form_urlencoded(raw)


def _telegram_poll_connector(entry: Dict[str, Any]):
    connector_id = str(entry.get("id") or "").strip()
    if not connector_id:
        return
    label = str(entry.get("label") or connector_id)
    workspace_id = _normalize_workspace_id(entry.get("workspace_id")) or ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID or "default"
    profile = _resolve_telegram_autopilot_profile(entry)
    allow_from = _telegram_resolve_allow_from(entry)

    connector_state = _telegram_connector_state(connector_id)
    last_update_id = int(connector_state.get("last_update_id") or 0)

    try:
        secret = _telegram_get_secret(entry)
        bot_token = str(secret.get("bot_token") or "").strip()
        configured_chat_id = str(secret.get("chat_id") or "").strip()
        if not bot_token or not configured_chat_id:
            raise RuntimeError("Connector is missing bot_token or chat_id.")
        poll_begin = _telegram_poll_cycle_service().begin_poll(
            connector_state=connector_state,
            bot_token=bot_token,
            configured_chat_id=configured_chat_id,
            workspace_id=workspace_id,
            profile=profile,
            connector_id=connector_id,
            label=label,
            last_update_id=last_update_id,
        )
        if bool(poll_begin.get("skipped")):
            return
        approval_state_patch = poll_begin.get("approval_state_patch") if isinstance(poll_begin.get("approval_state_patch"), dict) else {}
        updates = poll_begin.get("updates") if isinstance(poll_begin.get("updates"), list) else []

        max_seen = last_update_id
        for update in updates:
            if not isinstance(update, dict):
                continue
            extracted_message = _telegram_inbound_context_service().extract_inbound_message(
                update=update,
                configured_chat_id=configured_chat_id,
            )
            update_id = int(extracted_message.get("update_id") or 0)
            if update_id <= max_seen:
                continue
            max_seen = update_id
            if not bool(extracted_message.get("handled")):
                continue
            dispatch_result = _telegram_poll_dispatch_service().handle_update(
                entry=entry,
                label=label,
                workspace_id=workspace_id,
                profile=profile,
                allow_from=list(allow_from),
                connector_state=connector_state,
                connector_id=connector_id,
                bot_token=bot_token,
                configured_chat_id=configured_chat_id,
                extracted_message=extracted_message,
                update_id=update_id,
            )
            if not bool(dispatch_result.get("processed")):
                continue
            chat_id = str(dispatch_result.get("chat_id") or "").strip()
            action = str(dispatch_result.get("action") or "").strip().lower()
            run_id = str(dispatch_result.get("run_id") or "")

            _telegram_poll_state_service().record_processed_update(
                connector_id=connector_id,
                label=label,
                workspace_id=workspace_id,
                update_id=update_id,
                chat_id=chat_id,
                action=action,
                profile_id=str(profile.get("id") or ""),
                allow_from=list(allow_from),
                run_id=run_id,
                approval_state_patch=approval_state_patch,
            )

        _telegram_poll_cycle_service().complete_poll(
            connector_id=connector_id,
            label=label,
            workspace_id=workspace_id,
            max_seen=max_seen,
            last_update_id=last_update_id,
            profile_id=str(profile.get("id") or ""),
            allow_from=list(allow_from),
            approval_state_patch=approval_state_patch,
        )
    except Exception as exc:
        detail = str(exc)
        _telegram_poll_cycle_service().handle_connector_error(
            connector_id=connector_id,
            label=label,
            workspace_id=workspace_id,
            detail=detail,
        )
        raise


def _run_telegram_autopilot_forever():
    _init()
    poll_seconds = max(1.0, ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS)
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["active"] = True
        TELEGRAM_AUTOPILOT_STATE["started_at"] = _utc_now_iso()
        TELEGRAM_AUTOPILOT_STATE["enabled"] = True
    _persist_telegram_autopilot_state()
    _telegram_autopilot_log(
        f"enabled (poll={poll_seconds}s, prefix={'on' if ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX else 'off'}:{ORION_TELEGRAM_AUTOPILOT_PREFIX})"
    )

    while True:
        sleep_seconds = _telegram_autopilot_loop_service().run_iteration()
        time.sleep(max(0.25, float(sleep_seconds)))



# --- COPIED ENDPOINTS ---
async def handle_whatsapp_twilio_webhook(request: Request):
    _init()
    if not ORION_WHATSAPP_AUTOPILOT_ENABLED:
        return _whatsapp_twiml("Empyralis WhatsApp autopilot is disabled.")

    if ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET:
        provided_secret = str(
            request.query_params.get("secret")
            or request.headers.get("x-orion-webhook-secret")
            or ""
        ).strip()
        if provided_secret != ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET:
            return Response(status_code=403, content="forbidden")

    form = await _parse_form_urlencoded(request)
    response_text = _whatsapp_webhook_service().handle_inbound(form)
    return _whatsapp_twiml(response_text)


async def handle_telegram_autopilot_status():
    _init()
    return _autopilot_status_service().telegram_status_payload()


async def handle_whatsapp_autopilot_status():
    _init()
    return _autopilot_status_service().whatsapp_status_payload()


async def handle_list_autopilot_profiles():
    _init()
    telegram_profiles = []
    for profile_id, info in TELEGRAM_AUTOPILOT_PROFILE_CATALOG.items():
        telegram_profiles.append(
            {
                "id": profile_id,
                "label": info.get("label", profile_id),
                "description": info.get("description", ""),
                "allow_free_text": bool(info.get("allow_free_text")),
                "allow_status": bool(info.get("allow_status")),
                "allow_help": bool(info.get("allow_help")),
            }
        )
    return {
        "channels": {
            "telegram": {
                "enabled": bool(ORION_TELEGRAM_AUTOPILOT_ENABLED),
                "default_profile": ORION_TELEGRAM_AUTOPILOT_PROFILE,
                "profiles": telegram_profiles,
            },
            "whatsapp": {
                "enabled": bool(ORION_WHATSAPP_AUTOPILOT_ENABLED),
                "default_profile": ORION_WHATSAPP_AUTOPILOT_PROFILE,
                "profiles": [
                    {
                        "id": profile_id,
                        "label": info.get("label", profile_id),
                        "description": info.get("description", ""),
                        "allow_free_text": bool(info.get("allow_free_text")),
                        "allow_status": bool(info.get("allow_status")),
                        "allow_help": bool(info.get("allow_help")),
                    }
                    for profile_id, info in WHATSAPP_AUTOPILOT_PROFILE_CATALOG.items()
                ],
                "webhook_path": "/channels/whatsapp/twilio/webhook",
            },
        }
    }
