from __future__ import annotations
import asyncio, os, json, time, threading, certifi, html, ssl, re, uuid, hashlib
from pathlib import Path
from contextlib import contextmanager
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, quote_plus
from urllib import request as urlrequest, error as urlerror
from server_modules.automation_intents import classify_automation_intent
from server_modules.connectors.autopilot_approval_service import AutopilotApprovalService
from server_modules.connectors.autopilot_channel_registry_bridge_service import AutopilotChannelRegistryBridgeService
from server_modules.connectors.autopilot_bridge_registry_service import AutopilotBridgeRegistryService
from server_modules.connectors.autopilot_channel_support_service import AutopilotChannelSupportService
from server_modules.connectors.autopilot_common_support_service import AutopilotCommonSupportService
from server_modules.connectors.autopilot_event_bridge_service import AutopilotEventBridgeService
from server_modules.connectors.autopilot_state_bridge_service import AutopilotStateBridgeService
from server_modules.connectors.autopilot_terminal_bridge_service import AutopilotTerminalBridgeService
from server_modules.connectors.autopilot_skill_service import AutopilotSkillService
from server_modules.connectors.autopilot_workflow_setup_service import AutopilotWorkflowSetupService
from server_modules.connectors.autopilot_run_entry_service import AutopilotRunEntryService
from server_modules.connectors.autopilot_runtime_support_service import AutopilotRuntimeSupportService
from server_modules.connectors.autopilot_shared_service_registry import AutopilotSharedServiceRegistry
from server_modules.connectors.autopilot_profile_service import AutopilotProfileService
from server_modules.connectors.autopilot_runtime_registry_bridge_service import AutopilotRuntimeRegistryBridgeService
from server_modules.connectors.autopilot_runtime_service_registry import AutopilotRuntimeServiceRegistry
from server_modules.connectors.autopilot_support_service_registry import AutopilotSupportServiceRegistry
from server_modules.connectors.autopilot_support_registry_bridge_service import AutopilotSupportRegistryBridgeService
from server_modules.connectors.runtime_status_service import RuntimeStatusService
from server_modules.connectors.telegram_autopilot_helper_registry import TelegramAutopilotHelperRegistry
from server_modules.connectors.telegram_helper_registry_bridge_service import TelegramHelperRegistryBridgeService
from server_modules.connectors.telegram_compatibility_bridge_service import TelegramCompatibilityBridgeService
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
from server_modules.connectors.whatsapp_webhook_bridge_service import WhatsAppWebhookBridgeService
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
_AUTOPILOT_CHANNEL_REGISTRY_BRIDGE_SERVICE: Optional[AutopilotChannelRegistryBridgeService] = None
_AUTOPILOT_BRIDGE_REGISTRY_SERVICE: Optional[AutopilotBridgeRegistryService] = None
_AUTOPILOT_RUNTIME_REGISTRY_BRIDGE_SERVICE: Optional[AutopilotRuntimeRegistryBridgeService] = None
_AUTOPILOT_SUPPORT_REGISTRY_BRIDGE_SERVICE: Optional[AutopilotSupportRegistryBridgeService] = None
_AUTOPILOT_PROFILE_SERVICE: Optional[AutopilotProfileService] = None
_RUNTIME_STATUS_SERVICE: Optional[RuntimeStatusService] = None
_AUTOPILOT_WORKFLOW_SETUP_SERVICE: Optional[AutopilotWorkflowSetupService] = None
_AUTOPILOT_EVENT_BRIDGE_SERVICE: Optional[AutopilotEventBridgeService] = None
_AUTOPILOT_STATE_BRIDGE_SERVICE: Optional[AutopilotStateBridgeService] = None
_AUTOPILOT_TERMINAL_BRIDGE_SERVICE: Optional[AutopilotTerminalBridgeService] = None
_TELEGRAM_COMPATIBILITY_BRIDGE_SERVICE: Optional[TelegramCompatibilityBridgeService] = None
_WHATSAPP_WEBHOOK_BRIDGE_SERVICE: Optional[WhatsAppWebhookBridgeService] = None
_TELEGRAM_CONNECTOR_CONTEXT_SERVICE: Optional[TelegramConnectorContextService] = None
_AUTOPILOT_APPROVAL_SERVICE: Optional[AutopilotApprovalService] = None
_TELEGRAM_TRANSPORT_SERVICE: Optional[TelegramTransportService] = None
_TELEGRAM_TERMINAL_SERVICE: Optional[TelegramTerminalService] = None
_TELEGRAM_HELPER_REGISTRY_BRIDGE_SERVICE: Optional[TelegramHelperRegistryBridgeService] = None
_AUTOPILOT_RUN_ENTRY_SERVICE: Optional[AutopilotRunEntryService] = None
_AUTOPILOT_RUNTIME_SUPPORT_SERVICE: Optional[AutopilotRuntimeSupportService] = None
_AUTOPILOT_SKILL_SERVICE: Optional[AutopilotSkillService] = None
_AUTOPILOT_CHANNEL_SUPPORT_SERVICE: Optional[AutopilotChannelSupportService] = None
_TELEGRAM_CONNECTOR_SUPPORT_SERVICE: Optional[TelegramConnectorSupportService] = None
_AUTOPILOT_COMMON_SUPPORT_SERVICE: Optional[AutopilotCommonSupportService] = None
_TELEGRAM_MENU_SERVICE: Optional[TelegramMenuService] = None


def _autopilot_channel_registry_bridge_service() -> AutopilotChannelRegistryBridgeService:
    global _AUTOPILOT_CHANNEL_REGISTRY_BRIDGE_SERVICE
    if _AUTOPILOT_CHANNEL_REGISTRY_BRIDGE_SERVICE is None:
        _AUTOPILOT_CHANNEL_REGISTRY_BRIDGE_SERVICE = AutopilotChannelRegistryBridgeService(
            project_root=PROJECT_ROOT,
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            telegram_default_workspace_id=ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID or "default",
            telegram_onboarding_enabled=ORION_TELEGRAM_ONBOARDING_ENABLED,
            telegram_require_prefix=ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX,
            telegram_prefix=ORION_TELEGRAM_AUTOPILOT_PREFIX,
            telegram_space_status_enabled=ORION_TELEGRAM_SPACE_STATUS_ENABLED,
            telegram_media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            telegram_max_updates=ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            telegram_poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            telegram_run_timeout_seconds=int(globals().get("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            telegram_max_reply_chars=int(globals().get("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            telegram_send_ack=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_SEND_ACK")),
            telegram_enabled=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ENABLED", False)),
            telegram_default_profile=ORION_TELEGRAM_AUTOPILOT_PROFILE,
            telegram_guided_automation_setup_enabled=ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED,
            telegram_trust_mode_value=ORION_TELEGRAM_AUTOPILOT_TRUST_MODE,
            telegram_execution_target_value=ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET,
            whatsapp_enabled=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_ENABLED", False)),
            whatsapp_default_profile=ORION_WHATSAPP_AUTOPILOT_PROFILE,
            whatsapp_require_prefix=ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX,
            whatsapp_prefix=ORION_WHATSAPP_AUTOPILOT_PREFIX,
            whatsapp_run_timeout_seconds=int(globals().get("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            whatsapp_max_reply_chars=int(globals().get("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            whatsapp_send_ack=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_SEND_ACK")),
            whatsapp_trust_mode_value=ORION_WHATSAPP_AUTOPILOT_TRUST_MODE,
            whatsapp_execution_target_value=ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET,
            telegram_state=globals().get("TELEGRAM_AUTOPILOT_STATE") or {},
            telegram_lock=globals().get("TELEGRAM_AUTOPILOT_LOCK") or threading.Lock(),
            telegram_state_file=ORION_TELEGRAM_AUTOPILOT_STATE_FILE,
            whatsapp_state=WHATSAPP_AUTOPILOT_STATE,
            whatsapp_lock=WHATSAPP_AUTOPILOT_LOCK,
            whatsapp_state_file=ORION_WHATSAPP_AUTOPILOT_STATE_FILE,
            read_json=_safe_read_json,
            write_json=_safe_write_json,
            utc_now_iso=_utc_now_iso,
            normalize_workspace_id=_normalize_workspace_id_fallback,
            load_vault=load_vault,
            workspace_visible=_workspace_visible,
            telegram_thread_alive=lambda: bool(
                (getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else TELEGRAM_AUTOPILOT_THREAD)
                and (getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else TELEGRAM_AUTOPILOT_THREAD).is_alive()
            ),
            telegram_allow_from_value=lambda: os.getenv("ORION_TELEGRAM_AUTOPILOT_ALLOW_FROM", ""),
            get_updates_process_lock=_telegram_get_updates_process_lock,
            mark_telegram_started=_mark_telegram_autopilot_started,
            resolve_vault_credential=resolve_vault_credential,
            safe_path_token=_telegram_safe_path_token,
            runs_get=lambda run_id: runs.get(run_id),
            sleep=time.sleep,
            telegram_space_question_via_mcp=telegram_space_question_via_mcp,
            telegram_helper_registry=_telegram_helper_registry,
            autopilot_support_service_registry=_autopilot_support_service_registry,
            autopilot_runtime_service_registry=_autopilot_runtime_service_registry,
            autopilot_event_bridge_service=_autopilot_event_bridge_service,
        )
    return _AUTOPILOT_CHANNEL_REGISTRY_BRIDGE_SERVICE


def _telegram_service_registry() -> TelegramAutopilotServiceRegistry:
    return _autopilot_channel_registry_bridge_service().telegram_service_registry()


def _telegram_helper_registry_bridge_service() -> TelegramHelperRegistryBridgeService:
    global _TELEGRAM_HELPER_REGISTRY_BRIDGE_SERVICE
    if _TELEGRAM_HELPER_REGISTRY_BRIDGE_SERVICE is None:
        _TELEGRAM_HELPER_REGISTRY_BRIDGE_SERVICE = TelegramHelperRegistryBridgeService(
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
    return _TELEGRAM_HELPER_REGISTRY_BRIDGE_SERVICE


def _telegram_helper_registry() -> TelegramAutopilotHelperRegistry:
    return _telegram_helper_registry_bridge_service().telegram_helper_registry()


def _telegram_run_dispatch_service():
    return _telegram_service_registry().telegram_run_dispatch_service()


def _autopilot_support_service_registry() -> AutopilotSupportServiceRegistry:
    global _AUTOPILOT_SUPPORT_REGISTRY_BRIDGE_SERVICE
    if _AUTOPILOT_SUPPORT_REGISTRY_BRIDGE_SERVICE is None:
        _AUTOPILOT_SUPPORT_REGISTRY_BRIDGE_SERVICE = AutopilotSupportRegistryBridgeService(
            project_root=PROJECT_ROOT,
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            telegram_default_profile=str(globals().get("ORION_TELEGRAM_AUTOPILOT_PROFILE") or ""),
            telegram_default_prefix=str(globals().get("ORION_TELEGRAM_AUTOPILOT_PREFIX") or ""),
            telegram_default_require_prefix=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX", False)),
            telegram_profile_catalog=globals().get("TELEGRAM_AUTOPILOT_PROFILE_CATALOG") or {},
            whatsapp_default_profile=str(globals().get("ORION_WHATSAPP_AUTOPILOT_PROFILE") or ""),
            whatsapp_default_prefix=str(globals().get("ORION_WHATSAPP_AUTOPILOT_PREFIX") or ""),
            whatsapp_default_require_prefix=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX", False)),
            whatsapp_profile_catalog=globals().get("WHATSAPP_AUTOPILOT_PROFILE_CATALOG") or {},
            workflow_api_url=EMPYRALIST_WORKFLOW_API_URL,
            runtime_url=EMPYRALIST_RUNTIME_URL,
            web_url=EMPYRALIST_WEB_URL,
            installed_skills_enabled=ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED,
            error_category_hints=_AUTOPILOT_ERROR_CATEGORY_HINTS,
            engine_validation_errors=globals().get("ORION_ENGINE_VALIDATION_ERRORS") or [],
            env_get=lambda key, default="": os.getenv(key, default),
            init_runtime=_init,
            bool_from_any=lambda value, default=False: _telegram_connector_support_service().bool_from_any(value, default),
            local_companion_snapshot=lambda: _autopilot_runtime_support_service().local_companion_snapshot(),
            current_runtime_metrics=lambda: _autopilot_runtime_support_service().current_runtime_metrics(),
            latest_runtime_run_summary=lambda: _autopilot_runtime_support_service().latest_runtime_run_summary(),
            list_vault_connectors=lambda workspace_id: list_vault_connectors(workspace_id),
            http_json_request=lambda *args, **kwargs: http_json_request(*args, **kwargs),
            camera_setup_service=lambda: _telegram_helper_registry().camera_setup_service(),
            resolve_vault_credential=lambda credential_id, workspace_id: resolve_vault_credential(credential_id, workspace_id),
            list_recent_connector_messages=lambda credentials, limit: list_recent_connector_messages(credentials, limit=limit),
            query_active_installed_skills=lambda **kwargs: query_active_installed_skills(**kwargs),
            cognitive_module=lambda: _autopilot_common_support_service().cognitive_module(),
            cognitive_defaults=lambda: _autopilot_common_support_service().cognitive_defaults(),
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            normalize_string_list=lambda value: _autopilot_common_support_service().normalize_string_list(value),
            utc_now_iso=lambda: _utc_now_iso(),
            send_message=lambda **kwargs: _telegram_transport_service().send_message(**kwargs),
            runtime_builtin_skills_getter=lambda: globals().get("RUNTIME_BUILTIN_SKILLS"),
            runtime_skills_snapshot_getter=lambda: globals().get("_runtime_skills_snapshot"),
            normalize_whatsapp_number=lambda value: _whatsapp_service_registry().whatsapp_transport_service().normalize_number(value),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
        )
    return _AUTOPILOT_SUPPORT_REGISTRY_BRIDGE_SERVICE.support_service_registry()


def _autopilot_runtime_service_registry() -> AutopilotRuntimeServiceRegistry:
    global _AUTOPILOT_RUNTIME_REGISTRY_BRIDGE_SERVICE
    if _AUTOPILOT_RUNTIME_REGISTRY_BRIDGE_SERVICE is None:
        _AUTOPILOT_RUNTIME_REGISTRY_BRIDGE_SERVICE = AutopilotRuntimeRegistryBridgeService(
            project_root=PROJECT_ROOT,
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            telegram_poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            telegram_default_workspace_id=str(globals().get("ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID") or "default"),
            telegram_media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            telegram_trust_mode_value=str(globals().get("ORION_TELEGRAM_AUTOPILOT_TRUST_MODE") or ""),
            telegram_execution_target_value=str(globals().get("ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET") or ""),
            telegram_engine=(
                str(globals().get("ORION_TELEGRAM_AUTOPILOT_ENGINE") or "")
                if str(globals().get("ORION_TELEGRAM_AUTOPILOT_ENGINE") or "") in ENGINE_REGISTRY
                else "orion"
            ),
            whatsapp_engine=(
                str(globals().get("ORION_WHATSAPP_AUTOPILOT_ENGINE") or "")
                if str(globals().get("ORION_WHATSAPP_AUTOPILOT_ENGINE") or "") in ENGINE_REGISTRY
                else "orion"
            ),
            telegram_show_buttons=ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS,
            local_lease_seconds=ORION_LOCAL_LEASE_SECONDS,
            non_retryable_run_error_hints=_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS,
            runtime_builtin_skills_limit_builder=lambda scope_key, limit: _autopilot_skill_service().runtime_active_skills(scope_key, limit=limit),
            normalize_workspace_id=lambda value: _normalize_workspace_id_fallback(value),
            resolve_vault_credential=lambda credential_id, workspace_id: resolve_vault_credential(credential_id, workspace_id),
            normalize_agent_role=lambda value: (
                str((globals().get("normalize_agent_role") or (lambda item: item))(value) or "").strip().lower()
            ),
            allow_any_chat=lambda: bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT", False)),
            http_json_request=lambda *args, **kwargs: http_json_request(*args, **kwargs),
            telegram_session_key=lambda chat_id: _autopilot_channel_support_service().telegram_session_key(chat_id),
            safe_path_token=lambda value: _telegram_safe_path_token(value),
            reply_keyboard=lambda profile: _telegram_menu_service().reply_keyboard(profile),
            append_dead_letter=lambda **kwargs: _autopilot_event_bridge_service().append_channel_dead_letter(**kwargs),
            record_channel_event=lambda **kwargs: _autopilot_event_bridge_service().record_channel_event(**kwargs),
            utc_now_iso=lambda: _utc_now_iso(),
            chat_id_from_session_key=lambda key: _autopilot_common_support_service().chat_id_from_session_key(key),
            list_connector_entries=lambda: _telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID
            ),
            get_secret=lambda entry: _telegram_connector_support_service().get_secret(entry),
            resolve_profile=lambda entry: _autopilot_profile_service().resolve_telegram_profile(entry),
            route_message=lambda text, profile: _telegram_helper_registry().routing_service().route_message(text, profile),
            get_chat_profile=lambda workspace_id, chat_id: _telegram_helper_registry().profile_service().get_profile(workspace_id, chat_id),
            build_goal_with_profile=lambda goal, profile: _telegram_helper_registry().profile_service().build_goal_with_profile(goal, profile),
            workspace_connector_context=lambda **kwargs: _telegram_connector_context_service().workspace_connector_context(**kwargs),
            build_goal_with_connector_context=lambda goal, prompt: _telegram_connector_context_service().build_goal_with_connector_context(goal, prompt),
            installed_skill_query=lambda **kwargs: _telegram_connector_context_service().installed_skill_query(**kwargs),
            create_telegram_run=lambda **kwargs: _autopilot_run_entry_service().create_telegram_run(**kwargs),
            wait_for_run_terminal_status=lambda run_id, timeout_seconds=None, max_reply_chars=None: _telegram_run_dispatch_service().wait_for_terminal_status(
                run_id,
                timeout_seconds=timeout_seconds,
                max_reply_chars=max_reply_chars,
            ),
            runs_get=lambda run_id: runs.get(run_id) if isinstance(runs, dict) else None,
            send_message=lambda **kwargs: _telegram_transport_service().send_message(**kwargs),
            set_connector_state=lambda connector_id, patch: _telegram_service_registry().telegram_autopilot_state_service().set_connector_state(
                connector_id,
                patch,
            ),
            telegram_profile_fields=_TELEGRAM_PROFILE_FIELDS,
            assigned_agent_role=lambda entry: _telegram_connector_support_service().connector_assigned_agent_role(entry),
            normalize_trust_mode=lambda value: normalize_trust_mode(value),
            normalize_execution_target=lambda value: normalize_execution_target(value),
            decide_execution_target=lambda metadata: decide_execution_target(metadata),
            apply_execution_route_metadata=lambda metadata, route: apply_execution_route_metadata(metadata, route),
            create_run=lambda **kwargs: create_run(**kwargs),
            whatsapp_session_key=lambda from_number, to_number: _autopilot_channel_support_service().whatsapp_session_key(from_number, to_number),
            inherit_owner_user_id=lambda owner_user_id=None: __import__("server_modules.runtime_config", fromlist=["x"]).agent_machine_inherited_owner_user_id(owner_user_id),
            agent_machine_full_trust_enabled=lambda owner_user_id: __import__("server_modules.runtime_config", fromlist=["x"]).agent_machine_full_trust_enabled(owner_user_id),
            telegram_runs_started=lambda: (
                TELEGRAM_AUTOPILOT_STATE.__setitem__("runs_started", int(TELEGRAM_AUTOPILOT_STATE.get("runs_started") or 0) + 1),
                _telegram_service_registry().telegram_autopilot_state_service().persist_state(),
            ),
            whatsapp_runs_started=lambda: (
                WHATSAPP_AUTOPILOT_STATE.__setitem__("runs_started", int(WHATSAPP_AUTOPILOT_STATE.get("runs_started") or 0) + 1),
                _whatsapp_service_registry().whatsapp_autopilot_state_service().persist_state(),
            ),
            run_history=RUN_HISTORY,
            run_history_lock=RUN_HISTORY_LOCK,
            runtime_metrics=RUNTIME_METRICS,
            metrics_lock=METRICS_LOCK,
            utc_now=lambda: _utc_now(),
            parse_utc_ts=lambda value: _parse_utc_ts(value),
            worker_online_helper=lambda record, now=None: bool((globals().get("_is_worker_online") or (lambda *_args, **_kwargs: False))(record, now)),
            local_queue_lock=LOCAL_QUEUE_LOCK,
            local_pending_run_ids=LOCAL_PENDING_RUN_IDS,
            local_claimed_runs=LOCAL_CLAIMED_RUNS,
            local_worker_registry=LOCAL_WORKER_REGISTRY,
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
        )
    return _AUTOPILOT_RUNTIME_REGISTRY_BRIDGE_SERVICE.runtime_service_registry()


def _autopilot_shared_service_registry() -> AutopilotSharedServiceRegistry:
    global _AUTOPILOT_BRIDGE_REGISTRY_SERVICE
    if _AUTOPILOT_BRIDGE_REGISTRY_SERVICE is None:
        _AUTOPILOT_BRIDGE_REGISTRY_SERVICE = AutopilotBridgeRegistryService(
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
            init_runtime=lambda: _init(),
            event_service=lambda: _autopilot_event_service(),
            telegram_terminal_service=lambda: _telegram_terminal_service(),
            telegram_supervisor_service=lambda: _telegram_service_registry().telegram_autopilot_supervisor_service(),
            autopilot_status_service=lambda: _autopilot_status_service(),
            autopilot_endpoint_service=lambda: _autopilot_endpoint_service(),
            telegram_enabled=bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ENABLED", False)),
            telegram_default_profile=str(globals().get("ORION_TELEGRAM_AUTOPILOT_PROFILE") or ""),
            telegram_catalog=globals().get("TELEGRAM_AUTOPILOT_PROFILE_CATALOG") or {},
            whatsapp_enabled=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_ENABLED", False)),
            whatsapp_default_profile=str(globals().get("ORION_WHATSAPP_AUTOPILOT_PROFILE") or ""),
            whatsapp_catalog=globals().get("WHATSAPP_AUTOPILOT_PROFILE_CATALOG") or {},
            whatsapp_webhook_path="/channels/whatsapp/twilio/webhook",
            telegram_state_service=lambda: _telegram_service_registry().telegram_autopilot_state_service(),
            whatsapp_state_service=lambda: _whatsapp_service_registry().whatsapp_autopilot_state_service(),
            telegram_runtime_service=lambda: _telegram_service_registry().telegram_autopilot_runtime_service(),
            telegram_state=globals().get("TELEGRAM_AUTOPILOT_STATE") or {},
            telegram_lock=globals().get("TELEGRAM_AUTOPILOT_LOCK") or threading.Lock(),
            safe_path_token=lambda value: telegram_safe_path_token(value),
            build_goal_with_profile=lambda goal, profile_data: _telegram_helper_registry().profile_service().build_goal_with_profile(
                goal,
                profile_data,
            ),
            workspace_connector_context=lambda goal, workspace_id, current_connector_id: _telegram_connector_context_service().workspace_connector_context(
                goal,
                workspace_id,
                current_connector_id,
            ),
            extract_message=lambda update: _telegram_helper_registry().media_service().extract_message(update),
            build_goal_with_attachments=lambda goal, attachments: _telegram_helper_registry().media_service().build_goal_with_attachments(
                goal,
                attachments,
            ),
            route_message=lambda raw_text, profile: _telegram_helper_registry().routing_service().route_message(raw_text, profile),
            parse_form_urlencoded=lambda raw: _whatsapp_service_registry().whatsapp_webhook_service().parse_form_urlencoded(raw),
            webhook_result=lambda **kwargs: _autopilot_endpoint_service().whatsapp_webhook_result(**kwargs),
            handle_inbound=lambda payload: _whatsapp_service_registry().whatsapp_webhook_service().handle_inbound(payload),
            twiml_response=lambda text: _whatsapp_service_registry().whatsapp_transport_service().twiml_response(text),
            forbidden_response=lambda content: Response(status_code=403, content=content),
            webhook_enabled=bool(globals().get("ORION_WHATSAPP_AUTOPILOT_ENABLED", False)),
            configured_webhook_secret=str(globals().get("ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET") or ""),
        )
    return _AUTOPILOT_BRIDGE_REGISTRY_SERVICE.shared_service_registry()


def _autopilot_status_service():
    return _autopilot_shared_service_registry().autopilot_status_service()


def _autopilot_endpoint_service():
    return _autopilot_shared_service_registry().autopilot_endpoint_service()


def _autopilot_event_service():
    return _autopilot_shared_service_registry().autopilot_event_service()


def _whatsapp_service_registry() -> WhatsAppAutopilotServiceRegistry:
    return _autopilot_channel_registry_bridge_service().whatsapp_service_registry()


def _autopilot_profile_service() -> AutopilotProfileService:
    return _autopilot_support_service_registry().profile_service()


def _telegram_connector_support_service() -> TelegramConnectorSupportService:
    return _autopilot_runtime_service_registry().connector_support_service()


def _runtime_status_service() -> RuntimeStatusService:
    return _autopilot_support_service_registry().runtime_status_service()


def _autopilot_workflow_setup_service() -> AutopilotWorkflowSetupService:
    return _autopilot_support_service_registry().workflow_setup_service()


def _telegram_connector_context_service() -> TelegramConnectorContextService:
    return _autopilot_support_service_registry().connector_context_service()


def _autopilot_approval_service() -> AutopilotApprovalService:
    return _autopilot_support_service_registry().approval_service()


def _telegram_transport_service() -> TelegramTransportService:
    return _autopilot_runtime_service_registry().transport_service()


def _telegram_terminal_service() -> TelegramTerminalService:
    return _autopilot_runtime_service_registry().terminal_service()


def _autopilot_common_support_service() -> AutopilotCommonSupportService:
    return _autopilot_support_service_registry().common_support_service()


def _autopilot_run_entry_service() -> AutopilotRunEntryService:
    return _autopilot_runtime_service_registry().run_entry_service()


def _autopilot_runtime_support_service() -> AutopilotRuntimeSupportService:
    return _autopilot_runtime_service_registry().runtime_support_service()


def _autopilot_skill_service() -> AutopilotSkillService:
    return _autopilot_support_service_registry().skill_service()


def _autopilot_channel_support_service() -> AutopilotChannelSupportService:
    return _autopilot_support_service_registry().channel_support_service()


def _autopilot_event_bridge_service() -> AutopilotEventBridgeService:
    return _autopilot_shared_service_registry() and _AUTOPILOT_BRIDGE_REGISTRY_SERVICE.event_bridge_service()


def _autopilot_terminal_bridge_service() -> AutopilotTerminalBridgeService:
    return _autopilot_shared_service_registry() and _AUTOPILOT_BRIDGE_REGISTRY_SERVICE.terminal_bridge_service()


def _autopilot_state_bridge_service() -> AutopilotStateBridgeService:
    return _autopilot_shared_service_registry() and _AUTOPILOT_BRIDGE_REGISTRY_SERVICE.state_bridge_service()


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


def _telegram_compatibility_bridge_service() -> TelegramCompatibilityBridgeService:
    return _autopilot_shared_service_registry() and _AUTOPILOT_BRIDGE_REGISTRY_SERVICE.compatibility_bridge_service()


def _whatsapp_webhook_bridge_service() -> WhatsAppWebhookBridgeService:
    return _autopilot_shared_service_registry() and _AUTOPILOT_BRIDGE_REGISTRY_SERVICE.webhook_bridge_service()

def _load_telegram_autopilot_state() -> None:
    _autopilot_state_bridge_service().load_telegram_autopilot_state()


def _load_whatsapp_autopilot_state() -> None:
    _autopilot_state_bridge_service().load_whatsapp_autopilot_state()


def _telegram_autopilot_snapshot() -> Dict[str, Any]:
    return _autopilot_state_bridge_service().telegram_autopilot_snapshot()


def _whatsapp_autopilot_snapshot() -> Dict[str, Any]:
    return _autopilot_state_bridge_service().whatsapp_autopilot_snapshot()


def _whatsapp_autopilot_activate() -> None:
    _autopilot_state_bridge_service().whatsapp_autopilot_activate()

def _telegram_increment_processed_updates() -> None:
    _autopilot_state_bridge_service().telegram_increment_processed_updates()


def _telegram_set_connectors_seen(count: int) -> None:
    _autopilot_state_bridge_service().telegram_set_connectors_seen(count)


def _mark_telegram_autopilot_started(started_at: str) -> None:
    _autopilot_state_bridge_service().mark_telegram_autopilot_started(started_at)

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
    return _autopilot_runtime_service_registry().menu_service()


def _telegram_safe_path_token(value: Any) -> str:
    return _telegram_compatibility_bridge_service().safe_path_token(value)


def _telegram_build_goal_with_profile(goal: str, profile_data: Dict[str, str]) -> str:
    return _telegram_compatibility_bridge_service().build_goal_with_profile(goal, profile_data)


def _telegram_workspace_connector_context(
    goal: str,
    workspace_id: str,
    current_connector_id: str,
) -> Dict[str, Any]:
    return _telegram_compatibility_bridge_service().workspace_connector_context(
        goal,
        workspace_id,
        current_connector_id,
    )


def _telegram_extract_message(update: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return _telegram_compatibility_bridge_service().extract_message(update)


def _telegram_build_goal_with_attachments(goal: str, attachments: List[Dict[str, Any]]) -> str:
    return _telegram_compatibility_bridge_service().build_goal_with_attachments(goal, attachments)


def _telegram_route_message(raw_text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    return _telegram_compatibility_bridge_service().route_message(raw_text, profile)


async def handle_telegram_send_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    return await _autopilot_terminal_bridge_service().handle_telegram_send_message(
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
    return await _autopilot_terminal_bridge_service().handle_telegram_autopilot_test_message(
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
    return _whatsapp_webhook_bridge_service().handle_webhook(
        raw_body=await request.body(),
        query_secret=str(request.query_params.get("secret") or ""),
        header_secret=str(request.headers.get("x-orion-webhook-secret") or ""),
    )


def _run_telegram_autopilot_forever():
    _autopilot_terminal_bridge_service().run_telegram_autopilot_forever()


async def handle_telegram_autopilot_status():
    return await _autopilot_terminal_bridge_service().telegram_status_payload()


async def handle_whatsapp_autopilot_status():
    return await _autopilot_terminal_bridge_service().whatsapp_status_payload()


async def handle_list_autopilot_profiles():
    return await _autopilot_terminal_bridge_service().autopilot_profiles_payload()
