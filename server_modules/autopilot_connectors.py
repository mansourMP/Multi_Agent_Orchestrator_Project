from __future__ import annotations
import asyncio, os, json, time, threading, certifi, html, ssl, re, uuid, hashlib
from pathlib import Path
from contextlib import contextmanager
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, quote_plus
from urllib import request as urlrequest, error as urlerror
from server_modules.automation_intents import classify_automation_intent
from server_modules.connectors.autopilot_approval_service import AutopilotApprovalService
from server_modules.connectors.autopilot_channel_support_service import AutopilotChannelSupportService
from server_modules.connectors.autopilot_common_support_service import AutopilotCommonSupportService
from server_modules.connectors.autopilot_event_bridge_service import AutopilotEventBridgeService
from server_modules.connectors.autopilot_skill_service import AutopilotSkillService
from server_modules.connectors.autopilot_workflow_setup_service import AutopilotWorkflowSetupService
from server_modules.connectors.autopilot_run_entry_service import AutopilotRunEntryService
from server_modules.connectors.autopilot_runtime_support_service import AutopilotRuntimeSupportService
from server_modules.connectors.autopilot_shared_service_registry import AutopilotSharedServiceRegistry
from server_modules.connectors.autopilot_profile_service import AutopilotProfileService
from server_modules.connectors.runtime_status_service import RuntimeStatusService
from server_modules.connectors.telegram_autopilot_helper_registry import TelegramAutopilotHelperRegistry
from server_modules.connectors.telegram_connector_context_service import TelegramConnectorContextService
from server_modules.connectors.telegram_connector_support_service import TelegramConnectorSupportService
from server_modules.connectors.telegram_menu_service import TelegramMenuService
from server_modules.connectors.telegram_autopilot_service_registry import TelegramAutopilotServiceRegistry
from server_modules.connectors.telegram_connector_poll_service import TelegramConnectorPollService
from server_modules.connectors.telegram_media_service import telegram_safe_path_token
from server_modules.connectors.telegram_profile_service import TELEGRAM_PROFILE_FIELDS as _TELEGRAM_PROFILE_FIELDS
from server_modules.connectors.telegram_space_service import telegram_space_question_via_mcp
from server_modules.connectors.telegram_terminal_service import TelegramTerminalService
from server_modules.connectors.telegram_transport_service import TelegramTransportService
from server_modules.connectors.whatsapp_autopilot_service_registry import WhatsAppAutopilotServiceRegistry
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
_AUTOPILOT_SHARED_SERVICE_REGISTRY: Optional[AutopilotSharedServiceRegistry] = None
_TELEGRAM_AUTOPILOT_SERVICE_REGISTRY: Optional[TelegramAutopilotServiceRegistry] = None
_WHATSAPP_AUTOPILOT_SERVICE_REGISTRY: Optional[WhatsAppAutopilotServiceRegistry] = None
_TELEGRAM_AUTOPILOT_HELPER_REGISTRY: Optional[TelegramAutopilotHelperRegistry] = None
_AUTOPILOT_PROFILE_SERVICE: Optional[AutopilotProfileService] = None
_RUNTIME_STATUS_SERVICE: Optional[RuntimeStatusService] = None
_AUTOPILOT_WORKFLOW_SETUP_SERVICE: Optional[AutopilotWorkflowSetupService] = None
_AUTOPILOT_EVENT_BRIDGE_SERVICE: Optional[AutopilotEventBridgeService] = None
_TELEGRAM_CONNECTOR_CONTEXT_SERVICE: Optional[TelegramConnectorContextService] = None
_AUTOPILOT_APPROVAL_SERVICE: Optional[AutopilotApprovalService] = None
_TELEGRAM_TRANSPORT_SERVICE: Optional[TelegramTransportService] = None
_TELEGRAM_TERMINAL_SERVICE: Optional[TelegramTerminalService] = None
_AUTOPILOT_RUN_ENTRY_SERVICE: Optional[AutopilotRunEntryService] = None
_AUTOPILOT_RUNTIME_SUPPORT_SERVICE: Optional[AutopilotRuntimeSupportService] = None
_AUTOPILOT_SKILL_SERVICE: Optional[AutopilotSkillService] = None
_AUTOPILOT_CHANNEL_SUPPORT_SERVICE: Optional[AutopilotChannelSupportService] = None
_TELEGRAM_CONNECTOR_SUPPORT_SERVICE: Optional[TelegramConnectorSupportService] = None
_AUTOPILOT_COMMON_SUPPORT_SERVICE: Optional[AutopilotCommonSupportService] = None
_TELEGRAM_MENU_SERVICE: Optional[TelegramMenuService] = None


def _telegram_service_registry() -> TelegramAutopilotServiceRegistry:
    global _TELEGRAM_AUTOPILOT_SERVICE_REGISTRY
    if _TELEGRAM_AUTOPILOT_SERVICE_REGISTRY is None:
        _TELEGRAM_AUTOPILOT_SERVICE_REGISTRY = TelegramAutopilotServiceRegistry(
            project_root=PROJECT_ROOT,
            default_workspace_id=ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID or "default",
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            onboarding_enabled=ORION_TELEGRAM_ONBOARDING_ENABLED,
            require_prefix=ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX,
            prefix=ORION_TELEGRAM_AUTOPILOT_PREFIX,
            space_status_enabled=ORION_TELEGRAM_SPACE_STATUS_ENABLED,
            media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            max_updates=ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            run_timeout_seconds=int(globals().get("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            max_reply_chars=int(globals().get("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            send_ack=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_SEND_ACK")),
            state=TELEGRAM_AUTOPILOT_STATE,
            lock=TELEGRAM_AUTOPILOT_LOCK,
            state_file=ORION_TELEGRAM_AUTOPILOT_STATE_FILE,
            read_json=lambda path, default: _safe_read_json(path, default),
            write_json=lambda path, payload: _safe_write_json(path, payload),
            persist_state=lambda: _telegram_service_registry().telegram_autopilot_state_service().persist_state(),
            utc_now_iso=lambda: _utc_now_iso(),
            classify_error=lambda detail: _autopilot_channel_support_service().classify_error(detail),
            iso_from_epoch=lambda ts: _autopilot_channel_support_service().iso_from_epoch(ts),
            normalize_workspace_id=lambda value: _normalize_workspace_id_fallback(value),
            thread_alive=lambda: bool(
                (getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else TELEGRAM_AUTOPILOT_THREAD)
                and (getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else TELEGRAM_AUTOPILOT_THREAD).is_alive()
            ),
            enabled=ORION_TELEGRAM_AUTOPILOT_ENABLED,
            default_profile=ORION_TELEGRAM_AUTOPILOT_PROFILE,
            list_connector_entries=lambda: _telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID
            ),
            resolve_profile=lambda entry: _autopilot_profile_service().resolve_telegram_profile(entry),
            resolve_allow_from=lambda entry: _telegram_connector_support_service().resolve_allow_from(
                entry,
                os.getenv("ORION_TELEGRAM_AUTOPILOT_ALLOW_FROM", ""),
            ),
            connector_state=lambda connector_id: _telegram_service_registry().telegram_autopilot_state_service().connector_state(connector_id),
            set_connector_state=lambda connector_id, patch: _telegram_service_registry().telegram_autopilot_state_service().set_connector_state(
                connector_id,
                patch,
            ),
            resolve_secret=lambda entry: _telegram_connector_support_service().get_secret(entry),
            load_vault=lambda: load_vault(),
            workspace_visible=lambda workspace_id, requested_ws: _workspace_visible(workspace_id, requested_ws),
            connector_paused=lambda item: _telegram_connector_support_service().connector_paused(item),
            get_updates_process_lock=lambda bot_token: _telegram_get_updates_process_lock(bot_token),
            notify_pending_approvals=lambda **kwargs: _autopilot_approval_service().notify_pending_approvals(**kwargs),
            telegram_api_request=lambda bot_token, method, **kwargs: _telegram_transport_service().api_request(
                bot_token,
                method,
                **kwargs,
            ),
            record_channel_event=lambda **kwargs: _autopilot_event_bridge_service().record_channel_event(**kwargs),
            record_channel_event_throttled=lambda **kwargs: _autopilot_event_bridge_service().record_channel_event_throttled(**kwargs),
            send_message=lambda *args, **kwargs: _telegram_transport_service().send_message(*args, **kwargs),
            send_chat_action=lambda *args, **kwargs: _telegram_transport_service().send_chat_action(*args, **kwargs),
            edit_message=lambda *args, **kwargs: _telegram_transport_service().edit_message(*args, **kwargs),
            autopilot_log=lambda message: _autopilot_channel_support_service().telegram_autopilot_log(message),
            autopilot_mark_error=lambda detail, source: _telegram_service_registry().telegram_autopilot_runtime_service().mark_error(
                detail,
                source=source,
            ),
            mark_poll=lambda clear_error: _telegram_service_registry().telegram_autopilot_runtime_service().mark_poll(
                clear_error=clear_error
            ),
            mark_started=lambda started_at: _mark_telegram_autopilot_started(started_at),
            normalize_profile_field=lambda raw_value: _telegram_helper_registry().profile_service().normalize_profile_field(raw_value),
            select_skill_from_text=lambda raw_text: _autopilot_skill_service().select_skill_from_text(raw_text),
            skill_goal_builder=lambda skill: _autopilot_skill_service().telegram_skill_goal(skill),
            help_text=lambda profile: _telegram_helper_registry().routing_service().help_text(profile),
            skills_menu_text=lambda profile: _autopilot_skill_service().telegram_skills_menu_text(profile),
            menu_keyboard=lambda profile, menu_id: _telegram_menu_service().menu_keyboard(profile, menu_id),
            onboarding_prompt=lambda step_index, retry: _telegram_helper_registry().profile_service().onboarding_prompt(
                step_index,
                retry=retry,
            ),
            onboarding_start=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().start_onboarding(
                workspace_id,
                chat_id,
            ),
            profile_text=lambda profile, chat_profile: _telegram_helper_registry().profile_service().profile_text(
                profile,
                chat_profile,
            ),
            profile_help_text=lambda profile: _telegram_helper_registry().profile_service().profile_help_text(profile),
            profile_set=lambda workspace_id, chat_id, field_name, value: _telegram_helper_registry().profile_service().set_profile_field(
                workspace_id,
                chat_id,
                field_name,
                value,
            ),
            profile_clear=lambda workspace_id, chat_id, field_name: _telegram_helper_registry().profile_service().clear_profile(
                workspace_id,
                chat_id,
                field_name,
            ),
            runtime_status_text=lambda workspace_id: _runtime_status_service().runtime_status_text(workspace_id),
            approvals_list=lambda limit: _autopilot_approval_service().approvals_list(limit=limit),
            approvals_text=lambda payload, prefix: _autopilot_approval_service().approvals_text(payload, prefix=prefix),
            approval_resolve=lambda event_id, approved, note: _autopilot_approval_service().approval_resolve(
                event_id=event_id,
                approved=approved,
                note=note,
            ),
            approval_result_text=lambda payload, approved: _autopilot_approval_service().approval_result_text(
                payload,
                approved=approved,
            ),
            extract_message=lambda update: _telegram_helper_registry().media_service().extract_message(update),
            chat_matches=lambda configured_chat_id, chat: _telegram_connector_support_service().chat_matches(
                configured_chat_id,
                chat,
            ),
            store_attachments=lambda **kwargs: _telegram_helper_registry().media_service().store_attachments(**kwargs),
            route_message=lambda message_text, profile: _telegram_helper_registry().routing_service().route_message(
                message_text,
                profile,
            ),
            session_key_builder=lambda chat_id: _autopilot_channel_support_service().telegram_session_key(chat_id),
            trace_id_builder=lambda chat_id, update_id, message_id: _autopilot_channel_support_service().telegram_trace_id(chat_id, update_id, message_id),
            guided_setup_handler=lambda **kwargs: _autopilot_workflow_setup_service().handle_telegram_guided_automation_setup(
                **kwargs,
                enabled=ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED,
            ),
            sender_allowed=lambda sender, allow_from: _telegram_connector_support_service().sender_allowed(
                sender,
                allow_from,
            ),
            get_chat_profile=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().get_profile(
                workspace_id,
                chat_id,
            ),
            explicit_run_command=lambda raw_text: _telegram_helper_registry().routing_service().is_explicit_run_command(
                raw_text
            ),
            onboarding_get_state=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().get_onboarding_state(
                workspace_id,
                chat_id,
            ),
            onboarding_consume_answer=lambda workspace_id, chat_id, text: _telegram_helper_registry().profile_service().onboarding_consume_answer(
                workspace_id,
                chat_id,
                text,
            ),
            profile_get=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().get_profile(
                workspace_id,
                chat_id,
            ),
            profile_has_context=lambda chat_profile: _telegram_helper_registry().profile_service().profile_has_context(
                chat_profile
            ),
            build_goal_with_profile=lambda goal, chat_profile: _telegram_helper_registry().profile_service().build_goal_with_profile(
                goal,
                chat_profile,
            ),
            build_goal_with_attachments=lambda goal, attachments: _telegram_helper_registry().media_service().build_goal_with_attachments(
                goal,
                attachments,
            ),
            workspace_connector_context=lambda **kwargs: _telegram_connector_context_service().workspace_connector_context(**kwargs),
            build_goal_with_connector_context=lambda goal, prompt_append: _telegram_connector_context_service().build_goal_with_connector_context(
                goal,
                prompt_append,
            ),
            space_question_via_mcp=lambda goal, enabled, project_root: telegram_space_question_via_mcp(
                goal,
                enabled=enabled,
                project_root=project_root,
            ),
            installed_skill_query=lambda **kwargs: _telegram_connector_context_service().installed_skill_query(**kwargs),
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            create_run=lambda **kwargs: _autopilot_run_entry_service().create_telegram_run(
                **kwargs,
                media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
                trust_mode_value=ORION_TELEGRAM_AUTOPILOT_TRUST_MODE,
                execution_target_value=ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET,
            ),
            include_run_meta=lambda: _autopilot_channel_support_service().include_run_meta(),
            humanize_run_summary=lambda text: _autopilot_runtime_support_service().humanize_telegram_run_summary(text),
            runs_get=lambda run_id: runs.get(run_id),
            latest_run_error_message=lambda run: _autopilot_runtime_support_service().latest_run_error_message(run),
            is_non_retryable_run_error=lambda error: _autopilot_runtime_support_service().is_non_retryable_run_error(error),
            friendly_run_error=lambda error: _autopilot_runtime_support_service().friendly_run_error(error),
            summarize_run_terminal_result=lambda run, limit: _autopilot_runtime_support_service().summarize_run_terminal_result(run, limit),
            local_companion_snapshot=lambda: _autopilot_runtime_support_service().local_companion_snapshot(),
            can_auto_approve_wait=lambda run: _autopilot_run_entry_service().can_auto_approve_wait(run),
            pending_confirmation_payload=lambda run: _autopilot_run_entry_service().pending_confirmation_payload(run),
            sleep=lambda seconds: time.sleep(seconds),
        )
    return _TELEGRAM_AUTOPILOT_SERVICE_REGISTRY


def _telegram_helper_registry() -> TelegramAutopilotHelperRegistry:
    global _TELEGRAM_AUTOPILOT_HELPER_REGISTRY
    if _TELEGRAM_AUTOPILOT_HELPER_REGISTRY is None:
        _TELEGRAM_AUTOPILOT_HELPER_REGISTRY = TelegramAutopilotHelperRegistry(
            profile_state_file=ORION_TELEGRAM_PROFILE_STATE_FILE,
            onboarding_state_file=ORION_TELEGRAM_ONBOARDING_STATE_FILE,
            camera_setup_state_file=ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
            media_dir=ORION_TELEGRAM_MEDIA_DIR,
            media_enabled=ORION_TELEGRAM_MEDIA_ENABLED,
            media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            media_max_bytes=ORION_TELEGRAM_MEDIA_MAX_BYTES,
            media_include_in_goal=ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL,
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            quick_goal_templates=_TELEGRAM_QUICK_GOAL_TEMPLATES,
            menu_goal_templates=_TELEGRAM_MENU_GOAL_TEMPLATES,
            read_json=lambda path, default: _safe_read_json(path, default),
            write_json=lambda path, payload: _safe_write_json(path, payload),
            now_iso=lambda: _utc_now_iso(),
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            session_key_builder=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().telegram_profile_key(
                workspace_id,
                chat_id,
            ),
            telegram_api_request=lambda bot_token, method, **kwargs: _telegram_transport_service().api_request(
                bot_token,
                method,
                **kwargs,
            ),
            normalize_profile_field=lambda raw_value: _telegram_helper_registry().profile_service().normalize_profile_field(raw_value),
            select_skill_from_text=lambda raw_text: _autopilot_skill_service().select_skill_from_text(raw_text),
            skill_goal_builder=lambda skill: _autopilot_skill_service().telegram_skill_goal(skill),
        )
    return _TELEGRAM_AUTOPILOT_HELPER_REGISTRY


def _telegram_run_dispatch_service():
    return _telegram_service_registry().telegram_run_dispatch_service()


def _autopilot_shared_service_registry() -> AutopilotSharedServiceRegistry:
    global _AUTOPILOT_SHARED_SERVICE_REGISTRY
    if _AUTOPILOT_SHARED_SERVICE_REGISTRY is None:
        _AUTOPILOT_SHARED_SERVICE_REGISTRY = AutopilotSharedServiceRegistry(
            normalize_workspace_id=lambda value: _normalize_workspace_id_fallback(value),
            append_channel_event=lambda **kwargs: globals().get("_append_channel_event")(**kwargs),
            utc_now_iso=lambda: _utc_now_iso(),
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            json_safe=lambda value: (globals().get("_json_safe") or (lambda item: item))(value),
            dead_letter_lock=_CHANNEL_DEAD_LETTER_LOCK,
            read_dead_letter_json=lambda path, default: _safe_read_json(path, default),
            write_dead_letter_json=lambda path, payload: _safe_write_json(path, payload),
            dead_letter_file=ORION_CHANNEL_DEAD_LETTER_FILE,
            dead_letter_limit=ORION_CHANNEL_DEAD_LETTER_LIMIT,
            collapse_whitespace=lambda text: re.sub(r"\s+", " ", str(text or "").strip().lower()),
            telegram_snapshot=lambda: _telegram_service_registry().telegram_autopilot_state_service().snapshot(include_connectors=True),
            telegram_list_entries=lambda: _telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID
            ),
            resolve_telegram_profile=lambda entry: _autopilot_profile_service().resolve_telegram_profile(entry),
            whatsapp_snapshot=lambda: _whatsapp_service_registry().whatsapp_autopilot_state_service().snapshot(include_connectors=True),
            whatsapp_list_entries=lambda: _whatsapp_service_registry().whatsapp_autopilot_state_service().list_connector_entries(
                ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID
            ),
            resolve_whatsapp_profile=lambda entry: _autopilot_profile_service().resolve_whatsapp_profile(entry),
        )
    return _AUTOPILOT_SHARED_SERVICE_REGISTRY


def _autopilot_status_service():
    return _autopilot_shared_service_registry().autopilot_status_service()


def _autopilot_endpoint_service():
    return _autopilot_shared_service_registry().autopilot_endpoint_service()


def _autopilot_event_service():
    return _autopilot_shared_service_registry().autopilot_event_service()


def _whatsapp_service_registry() -> WhatsAppAutopilotServiceRegistry:
    global _WHATSAPP_AUTOPILOT_SERVICE_REGISTRY
    if _WHATSAPP_AUTOPILOT_SERVICE_REGISTRY is None:
        _WHATSAPP_AUTOPILOT_SERVICE_REGISTRY = WhatsAppAutopilotServiceRegistry(
            state=WHATSAPP_AUTOPILOT_STATE,
            lock=WHATSAPP_AUTOPILOT_LOCK,
            read_json=lambda path, default: _safe_read_json(path, default),
            write_json=lambda path, payload: _safe_write_json(path, payload),
            state_file=ORION_WHATSAPP_AUTOPILOT_STATE_FILE,
            utc_now_iso=lambda: _utc_now_iso(),
            classify_error=lambda detail: _autopilot_channel_support_service().classify_error(detail),
            normalize_workspace_id=lambda value: _normalize_workspace_id_fallback(value),
            load_vault=lambda: load_vault(),
            workspace_visible=lambda workspace_id, requested_ws: _workspace_visible(workspace_id, requested_ws),
            connector_paused=lambda item: _telegram_connector_support_service().connector_paused(item),
            resolve_vault_credential=lambda credential_id, workspace_id: resolve_vault_credential(credential_id, workspace_id),
            enabled=ORION_WHATSAPP_AUTOPILOT_ENABLED,
            default_profile=ORION_WHATSAPP_AUTOPILOT_PROFILE,
            require_prefix=ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX,
            prefix=ORION_WHATSAPP_AUTOPILOT_PREFIX,
            run_timeout_seconds=int(globals().get("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            max_reply_chars=int(globals().get("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            send_ack=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_SEND_ACK")),
            include_run_meta=lambda: _autopilot_channel_support_service().include_run_meta(),
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            wait_for_run_terminal_status=lambda run_id, timeout_seconds=None, max_reply_chars=None: _telegram_run_dispatch_service().wait_for_terminal_status(
                run_id,
                timeout_seconds=timeout_seconds,
                max_reply_chars=max_reply_chars,
            ),
            run_reply_text=lambda status, run_id, summary: _telegram_run_dispatch_service().run_reply_text(
                status,
                run_id,
                summary,
            ),
            append_dead_letter=lambda **kwargs: _autopilot_event_bridge_service().append_channel_dead_letter(**kwargs),
            record_channel_event=lambda **kwargs: _autopilot_event_bridge_service().record_channel_event(**kwargs),
            log_error=lambda message: print(f"[whatsapp-autopilot {_utc_now_iso()}] {message}", flush=True),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            resolve_profile=lambda entry: _autopilot_profile_service().resolve_whatsapp_profile(entry),
            route_message=lambda body, profile: _telegram_helper_registry().routing_service().route_message(body, profile),
            help_text=lambda profile: _autopilot_profile_service().whatsapp_help_text(profile),
            runtime_status_text=lambda workspace_id: _runtime_status_service().runtime_status_text(workspace_id),
            approvals_list=lambda limit: _autopilot_approval_service().approvals_list(limit=limit),
            approvals_text=lambda payload, prefix: _autopilot_approval_service().approvals_text(payload, prefix=prefix),
            approval_resolve=lambda event_id, approved, note: _autopilot_approval_service().approval_resolve(
                event_id=event_id,
                approved=approved,
                note=note,
            ),
            approval_result_text=lambda payload, approved: _autopilot_approval_service().approval_result_text(
                payload,
                approved=approved,
            ),
            create_run=lambda **kwargs: _autopilot_run_entry_service().create_whatsapp_run(
                **kwargs,
                trust_mode_value=ORION_WHATSAPP_AUTOPILOT_TRUST_MODE,
                execution_target_value=ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET,
            ),
            session_key_builder=lambda inbound_from, inbound_to: _autopilot_channel_support_service().whatsapp_session_key(
                inbound_from,
                inbound_to,
            ),
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
        )
    return _WHATSAPP_AUTOPILOT_SERVICE_REGISTRY


def _autopilot_profile_service() -> AutopilotProfileService:
    global _AUTOPILOT_PROFILE_SERVICE
    if _AUTOPILOT_PROFILE_SERVICE is None:
        _AUTOPILOT_PROFILE_SERVICE = AutopilotProfileService(
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            bool_from_any=lambda value, default=False: _telegram_connector_support_service().bool_from_any(value, default),
            telegram_default_profile=ORION_TELEGRAM_AUTOPILOT_PROFILE,
            telegram_default_prefix=ORION_TELEGRAM_AUTOPILOT_PREFIX,
            telegram_default_require_prefix=ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX,
            telegram_profile_catalog=TELEGRAM_AUTOPILOT_PROFILE_CATALOG,
            whatsapp_default_profile=ORION_WHATSAPP_AUTOPILOT_PROFILE,
            whatsapp_default_prefix=ORION_WHATSAPP_AUTOPILOT_PREFIX,
            whatsapp_default_require_prefix=ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX,
            whatsapp_profile_catalog=WHATSAPP_AUTOPILOT_PROFILE_CATALOG,
        )
    return _AUTOPILOT_PROFILE_SERVICE


def _telegram_connector_support_service() -> TelegramConnectorSupportService:
    global _TELEGRAM_CONNECTOR_SUPPORT_SERVICE
    if _TELEGRAM_CONNECTOR_SUPPORT_SERVICE is None:
        normalize_role = globals().get("normalize_agent_role")
        _TELEGRAM_CONNECTOR_SUPPORT_SERVICE = TelegramConnectorSupportService(
            normalize_workspace_id=lambda value: _normalize_workspace_id_fallback(value),
            resolve_vault_credential=lambda credential_id, workspace_id: resolve_vault_credential(credential_id, workspace_id),
            normalize_agent_role=lambda value: (
                str(normalize_role(value) or "").strip().lower()
                if callable(normalize_role)
                else str(value or "").strip().lower()
            ),
            allow_any_chat=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT", False)),
        )
    return _TELEGRAM_CONNECTOR_SUPPORT_SERVICE


def _runtime_status_service() -> RuntimeStatusService:
    global _RUNTIME_STATUS_SERVICE
    if _RUNTIME_STATUS_SERVICE is None:
        _RUNTIME_STATUS_SERVICE = RuntimeStatusService(
            local_companion_snapshot=lambda: _autopilot_runtime_support_service().local_companion_snapshot(),
            current_metrics=lambda: _autopilot_runtime_support_service().current_runtime_metrics(),
            latest_run_summary=lambda: _autopilot_runtime_support_service().latest_runtime_run_summary(),
            runtime_valid=lambda: not ORION_ENGINE_VALIDATION_ERRORS,
        )
    return _RUNTIME_STATUS_SERVICE


def _autopilot_workflow_setup_service() -> AutopilotWorkflowSetupService:
    global _AUTOPILOT_WORKFLOW_SETUP_SERVICE
    if _AUTOPILOT_WORKFLOW_SETUP_SERVICE is None:
        _AUTOPILOT_WORKFLOW_SETUP_SERVICE = AutopilotWorkflowSetupService(
            workflow_api_url=EMPYRALIST_WORKFLOW_API_URL,
            runtime_url=EMPYRALIST_RUNTIME_URL,
            web_url=EMPYRALIST_WEB_URL,
            init_runtime=lambda: _init(),
            classify_automation_intent=lambda text: classify_automation_intent(text),
            list_vault_connectors=lambda workspace_id: list_vault_connectors(workspace_id),
            http_json_request=lambda *args, **kwargs: http_json_request(*args, **kwargs),
            runtime_api_headers=lambda: {"Content-Type": "application/json", **({"X-API-Key": str(globals().get("ORION_API_KEY") or "").strip()} if str(globals().get("ORION_API_KEY") or "").strip() else {})},
            camera_setup_service=lambda: _telegram_helper_registry().camera_setup_service(),
        )
    return _AUTOPILOT_WORKFLOW_SETUP_SERVICE


def _telegram_connector_context_service() -> TelegramConnectorContextService:
    global _TELEGRAM_CONNECTOR_CONTEXT_SERVICE
    if _TELEGRAM_CONNECTOR_CONTEXT_SERVICE is None:
        _TELEGRAM_CONNECTOR_CONTEXT_SERVICE = TelegramConnectorContextService(
            installed_skills_enabled=ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED,
            init_runtime=lambda: _init(),
            list_vault_connectors=lambda workspace_id: list_vault_connectors(workspace_id),
            resolve_vault_credential=lambda credential_id, workspace_id: resolve_vault_credential(credential_id, workspace_id),
            list_recent_connector_messages=lambda credentials, limit: list_recent_connector_messages(credentials, limit=limit),
            query_active_installed_skills=lambda **kwargs: query_active_installed_skills(**kwargs),
        )
    return _TELEGRAM_CONNECTOR_CONTEXT_SERVICE


def _autopilot_approval_service() -> AutopilotApprovalService:
    global _AUTOPILOT_APPROVAL_SERVICE
    if _AUTOPILOT_APPROVAL_SERVICE is None:
        _AUTOPILOT_APPROVAL_SERVICE = AutopilotApprovalService(
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            cognitive_module=lambda: _autopilot_common_support_service().cognitive_module(),
            cognitive_defaults=lambda: _autopilot_common_support_service().cognitive_defaults(),
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            normalize_string_list=lambda value: _autopilot_common_support_service().normalize_string_list(value),
            utc_now_iso=lambda: _utc_now_iso(),
            send_message=lambda **kwargs: _telegram_transport_service().send_message(**kwargs),
        )
    return _AUTOPILOT_APPROVAL_SERVICE


def _telegram_transport_service() -> TelegramTransportService:
    global _TELEGRAM_TRANSPORT_SERVICE
    if _TELEGRAM_TRANSPORT_SERVICE is None:
        _TELEGRAM_TRANSPORT_SERVICE = TelegramTransportService(
            poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            http_json_request=lambda *args, **kwargs: http_json_request(*args, **kwargs),
            session_key=lambda chat_id: _autopilot_channel_support_service().telegram_session_key(chat_id),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            reply_keyboard=lambda profile: _telegram_menu_service().reply_keyboard(profile),
            append_dead_letter=lambda **kwargs: _autopilot_event_bridge_service().append_channel_dead_letter(**kwargs),
            record_channel_event=lambda **kwargs: _autopilot_event_bridge_service().record_channel_event(**kwargs),
            utc_now_iso=lambda: _utc_now_iso(),
        )
    return _TELEGRAM_TRANSPORT_SERVICE


def _telegram_terminal_service() -> TelegramTerminalService:
    global _TELEGRAM_TERMINAL_SERVICE
    if _TELEGRAM_TERMINAL_SERVICE is None:
        _TELEGRAM_TERMINAL_SERVICE = TelegramTerminalService(
            normalize_workspace_id=lambda value: _normalize_workspace_id_fallback(value),
            chat_id_from_session_key=lambda key: _autopilot_common_support_service().chat_id_from_session_key(key),
            list_connector_entries=lambda: _telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID
            ),
            get_secret=lambda entry: _telegram_connector_support_service().get_secret(entry),
            resolve_profile=lambda entry: _autopilot_profile_service().resolve_telegram_profile(entry),
            route_message=lambda text, profile: _telegram_helper_registry().routing_service().route_message(text, profile),
            get_chat_profile=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().get_profile(
                workspace_id,
                chat_id,
            ),
            build_goal_with_profile=lambda goal, profile: _telegram_helper_registry().profile_service().build_goal_with_profile(goal, profile),
            workspace_connector_context=lambda **kwargs: _telegram_connector_context_service().workspace_connector_context(**kwargs),
            build_goal_with_connector_context=lambda goal, prompt: _telegram_connector_context_service().build_goal_with_connector_context(goal, prompt),
            installed_skill_query=lambda **kwargs: _telegram_connector_context_service().installed_skill_query(**kwargs),
            create_run=lambda **kwargs: _autopilot_run_entry_service().create_telegram_run(
                **kwargs,
                media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
                trust_mode_value=ORION_TELEGRAM_AUTOPILOT_TRUST_MODE,
                execution_target_value=ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET,
            ),
            wait_for_run_terminal_status=lambda run_id, timeout_seconds=None, max_reply_chars=None: _telegram_run_dispatch_service().wait_for_terminal_status(
                run_id,
                timeout_seconds=timeout_seconds,
                max_reply_chars=max_reply_chars,
            ),
            runs_get=lambda run_id: runs.get(run_id) if isinstance(runs, dict) else None,
            session_key=lambda chat_id: _autopilot_channel_support_service().telegram_session_key(chat_id),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            send_message=lambda **kwargs: _telegram_transport_service().send_message(**kwargs),
            set_connector_state=lambda connector_id, patch: _telegram_service_registry().telegram_autopilot_state_service().set_connector_state(
                connector_id,
                patch,
            ),
            utc_now_iso=lambda: _utc_now_iso(),
        )
    return _TELEGRAM_TERMINAL_SERVICE


def _autopilot_common_support_service() -> AutopilotCommonSupportService:
    global _AUTOPILOT_COMMON_SUPPORT_SERVICE
    if _AUTOPILOT_COMMON_SUPPORT_SERVICE is None:
        def _import_cognitive_module():
            from python_engine import cognitive_daemon as _cd  # type: ignore
            return _cd

        _AUTOPILOT_COMMON_SUPPORT_SERVICE = AutopilotCommonSupportService(
            project_root=PROJECT_ROOT,
            env_get=lambda key, default="": os.getenv(key, default),
            import_cognitive_module=_import_cognitive_module,
        )
    return _AUTOPILOT_COMMON_SUPPORT_SERVICE


def _autopilot_run_entry_service() -> AutopilotRunEntryService:
    global _AUTOPILOT_RUN_ENTRY_SERVICE
    if _AUTOPILOT_RUN_ENTRY_SERVICE is None:
        from server_modules import runtime_config

        _AUTOPILOT_RUN_ENTRY_SERVICE = AutopilotRunEntryService(
            telegram_profile_fields=list(_TELEGRAM_PROFILE_FIELDS),
            telegram_engine=ORION_TELEGRAM_AUTOPILOT_ENGINE if ORION_TELEGRAM_AUTOPILOT_ENGINE in ENGINE_REGISTRY else "orion",
            whatsapp_engine=ORION_WHATSAPP_AUTOPILOT_ENGINE if ORION_WHATSAPP_AUTOPILOT_ENGINE in ENGINE_REGISTRY else "orion",
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            assigned_agent_role=lambda entry: _telegram_connector_support_service().connector_assigned_agent_role(entry),
            normalize_trust_mode=lambda value: normalize_trust_mode(value),
            normalize_execution_target=lambda value: normalize_execution_target(value),
            decide_execution_target=lambda metadata: decide_execution_target(metadata),
            apply_execution_route_metadata=lambda metadata, route: apply_execution_route_metadata(metadata, route),
            create_run=lambda **kwargs: create_run(**kwargs),
            record_channel_event=lambda **kwargs: _autopilot_event_bridge_service().record_channel_event(**kwargs),
            telegram_session_key=lambda chat_id: _autopilot_channel_support_service().telegram_session_key(chat_id),
            whatsapp_session_key=lambda from_number, to_number: _autopilot_channel_support_service().whatsapp_session_key(from_number, to_number),
            inherit_owner_user_id=lambda owner_user_id=None: runtime_config.agent_machine_inherited_owner_user_id(owner_user_id),
            agent_machine_full_trust_enabled=lambda owner_user_id: runtime_config.agent_machine_full_trust_enabled(owner_user_id),
            telegram_runs_started=lambda: (
                TELEGRAM_AUTOPILOT_STATE.__setitem__("runs_started", int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0) + 1),
                _telegram_service_registry().telegram_autopilot_state_service().persist_state(),
            ),
            whatsapp_runs_started=lambda: (
                WHATSAPP_AUTOPILOT_STATE.__setitem__("runs_started", int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0) + 1),
                _whatsapp_service_registry().whatsapp_autopilot_state_service().persist_state(),
            ),
        )
    return _AUTOPILOT_RUN_ENTRY_SERVICE


def _autopilot_runtime_support_service() -> AutopilotRuntimeSupportService:
    global _AUTOPILOT_RUNTIME_SUPPORT_SERVICE
    if _AUTOPILOT_RUNTIME_SUPPORT_SERVICE is None:
        _AUTOPILOT_RUNTIME_SUPPORT_SERVICE = AutopilotRuntimeSupportService(
            run_history=RUN_HISTORY,
            run_history_lock=RUN_HISTORY_LOCK,
            runtime_metrics=RUNTIME_METRICS,
            metrics_lock=METRICS_LOCK,
            utc_now=lambda: _utc_now(),
            parse_utc_ts=lambda value: _parse_utc_ts(value),
            worker_online_helper=lambda record, now=None: bool((globals().get("_is_worker_online") or (lambda *_args, **_kwargs: False))(record, now)),
            local_lease_seconds=ORION_LOCAL_LEASE_SECONDS,
            local_queue_lock=LOCAL_QUEUE_LOCK,
            local_pending_run_ids=LOCAL_PENDING_RUN_IDS,
            local_claimed_runs=LOCAL_CLAIMED_RUNS,
            local_worker_registry=LOCAL_WORKER_REGISTRY,
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            non_retryable_run_error_hints=list(_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS),
        )
    return _AUTOPILOT_RUNTIME_SUPPORT_SERVICE


def _autopilot_skill_service() -> AutopilotSkillService:
    global _AUTOPILOT_SKILL_SERVICE
    if _AUTOPILOT_SKILL_SERVICE is None:
        _AUTOPILOT_SKILL_SERVICE = AutopilotSkillService(
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            init_runtime=lambda: _init(),
            runtime_builtin_skills_getter=lambda: globals().get("RUNTIME_BUILTIN_SKILLS"),
            runtime_skills_snapshot_getter=lambda: globals().get("_runtime_skills_snapshot"),
        )
    return _AUTOPILOT_SKILL_SERVICE


def _autopilot_channel_support_service() -> AutopilotChannelSupportService:
    global _AUTOPILOT_CHANNEL_SUPPORT_SERVICE
    if _AUTOPILOT_CHANNEL_SUPPORT_SERVICE is None:
        _AUTOPILOT_CHANNEL_SUPPORT_SERVICE = AutopilotChannelSupportService(
            error_category_hints=_AUTOPILOT_ERROR_CATEGORY_HINTS,
            utc_now_iso=lambda: _utc_now_iso(),
            normalize_whatsapp_number=lambda value: _whatsapp_service_registry().whatsapp_transport_service().normalize_number(value),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            env_get=lambda key, default="": os.getenv(key, default),
        )
    return _AUTOPILOT_CHANNEL_SUPPORT_SERVICE


def _autopilot_event_bridge_service() -> AutopilotEventBridgeService:
    global _AUTOPILOT_EVENT_BRIDGE_SERVICE
    if _AUTOPILOT_EVENT_BRIDGE_SERVICE is None:
        _AUTOPILOT_EVENT_BRIDGE_SERVICE = AutopilotEventBridgeService(
            init_runtime=lambda: _init(),
            event_service=lambda: _autopilot_event_service(),
        )
    return _AUTOPILOT_EVENT_BRIDGE_SERVICE


def _normalize_workspace_id_fallback(value: Any) -> str:
    normalize_workspace_id = globals().get("_normalize_workspace_id")
    if callable(normalize_workspace_id):
        try:
            normalized = normalize_workspace_id(value)
        except Exception:
            normalized = None
    else:
        normalized = None
    token = str(normalized if normalized is not None else value or "default").strip()
    return token or "default"

def _load_telegram_autopilot_state() -> None:
    _telegram_service_registry().telegram_autopilot_state_service().load_state()


def _load_whatsapp_autopilot_state() -> None:
    _whatsapp_service_registry().whatsapp_autopilot_state_service().load_state()


def _telegram_autopilot_snapshot() -> Dict[str, Any]:
    return _telegram_service_registry().telegram_autopilot_state_service().snapshot(include_connectors=True)


def _whatsapp_autopilot_snapshot() -> Dict[str, Any]:
    return _whatsapp_service_registry().whatsapp_autopilot_state_service().snapshot(include_connectors=True)


def _whatsapp_autopilot_activate() -> None:
    _whatsapp_service_registry().whatsapp_autopilot_state_service().activate()

def _telegram_increment_processed_updates() -> None:
    _telegram_service_registry().telegram_autopilot_runtime_service().increment_processed_updates()


def _telegram_set_connectors_seen(count: int) -> None:
    _telegram_service_registry().telegram_autopilot_runtime_service().set_connectors_seen(count)


def _mark_telegram_autopilot_started(started_at: str) -> None:
    with TELEGRAM_AUTOPILOT_LOCK:
        TELEGRAM_AUTOPILOT_STATE["active"] = True
        TELEGRAM_AUTOPILOT_STATE["started_at"] = started_at
        TELEGRAM_AUTOPILOT_STATE["enabled"] = True

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
    return _autopilot_event_bridge_service().record_channel_event(
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
    _autopilot_event_bridge_service().append_channel_dead_letter(
        channel=channel,
        direction=direction,
        event_type=event_type,
        reason=reason,
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        run_id=run_id,
        action=action,
        connector_id=connector_id,
        trace_id=trace_id,
        source_event_id=source_event_id,
        metadata=metadata,
    )


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
    return _autopilot_event_bridge_service().record_channel_event_throttled(
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
        dedupe_seconds=dedupe_seconds,
        record_event_func=_record_channel_event,
    )


def _telegram_menu_service() -> TelegramMenuService:
    global _TELEGRAM_MENU_SERVICE
    if _TELEGRAM_MENU_SERVICE is None:
        _TELEGRAM_MENU_SERVICE = TelegramMenuService(
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            show_buttons=ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS,
            runtime_active_skills=lambda scope_key, limit: _autopilot_skill_service().runtime_active_skills(scope_key, limit=limit),
        )
    return _TELEGRAM_MENU_SERVICE


def _telegram_safe_path_token(value: Any) -> str:
    return telegram_safe_path_token(value)


def _telegram_build_goal_with_profile(goal: str, profile_data: Dict[str, str]) -> str:
    return _telegram_helper_registry().profile_service().build_goal_with_profile(goal, profile_data)


def _telegram_workspace_connector_context(
    goal: str,
    workspace_id: str,
    current_connector_id: str,
) -> Dict[str, Any]:
    return _telegram_connector_context_service().workspace_connector_context(
        goal,
        workspace_id,
        current_connector_id,
    )


def _telegram_extract_message(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _telegram_helper_registry().media_service().extract_message(update)


def _telegram_build_goal_with_attachments(goal: str, attachments: List[Dict[str, Any]]) -> str:
    return _telegram_helper_registry().media_service().build_goal_with_attachments(goal, attachments)


def _telegram_route_message(raw_text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    return _telegram_helper_registry().routing_service().route_message(raw_text, profile)


async def handle_telegram_send_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    _init()
    return await _telegram_terminal_service().handle_send_message(
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        chat_id=chat_id,
    )


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
    return await _telegram_terminal_service().handle_autopilot_test_message(
        text=text,
        workspace_id=workspace_id,
        session_key=session_key,
        chat_id=chat_id,
        connector_id=connector_id,
        sender_id=sender_id,
        timeout_seconds=timeout_seconds,
    )


# --- COPIED ENDPOINTS ---
async def handle_whatsapp_twilio_webhook(request: Request):
    _init()
    form = _whatsapp_service_registry().whatsapp_webhook_service().parse_form_urlencoded(await request.body())
    provided_secret = str(
        request.query_params.get("secret")
        or request.headers.get("x-orion-webhook-secret")
        or ""
    ).strip()
    result = _autopilot_endpoint_service().whatsapp_webhook_result(
        enabled=ORION_WHATSAPP_AUTOPILOT_ENABLED,
        configured_secret=ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET,
        provided_secret=provided_secret,
        form=form,
        handle_inbound=lambda payload: _whatsapp_service_registry().whatsapp_webhook_service().handle_inbound(payload),
    )
    if int(result.get("status_code") or 200) == 403:
        return Response(status_code=403, content=str(result.get("content") or "forbidden"))
    return _whatsapp_service_registry().whatsapp_transport_service().twiml_response(str(result.get("text") or ""))


def _run_telegram_autopilot_forever():
    _init()
    _telegram_service_registry().telegram_autopilot_supervisor_service().run_forever()


async def handle_telegram_autopilot_status():
    _init()
    return _autopilot_status_service().telegram_status_payload()


async def handle_whatsapp_autopilot_status():
    _init()
    return _autopilot_status_service().whatsapp_status_payload()


async def handle_list_autopilot_profiles():
    _init()
    return _autopilot_endpoint_service().autopilot_profiles_payload(
        telegram_enabled=ORION_TELEGRAM_AUTOPILOT_ENABLED,
        telegram_default_profile=ORION_TELEGRAM_AUTOPILOT_PROFILE,
        telegram_catalog=TELEGRAM_AUTOPILOT_PROFILE_CATALOG,
        whatsapp_enabled=ORION_WHATSAPP_AUTOPILOT_ENABLED,
        whatsapp_default_profile=ORION_WHATSAPP_AUTOPILOT_PROFILE,
        whatsapp_catalog=WHATSAPP_AUTOPILOT_PROFILE_CATALOG,
        whatsapp_webhook_path="/channels/whatsapp/twilio/webhook",
    )
