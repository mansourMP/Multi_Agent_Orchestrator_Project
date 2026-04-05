from __future__ import annotations
import os, threading, re
from typing import Any, Dict, List, Optional
from server_modules.automation_intents import classify_automation_intent
from server_modules.connectors.autopilot_connector_config import (
    _AUTOPILOT_ERROR_CATEGORY_HINTS,
    _AUTOPILOT_EVENT_DEDUP,
    _AUTOPILOT_EVENT_DEDUP_LOCK,
    _AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS,
    _CHANNEL_DEAD_LETTER_LOCK,
    _TELEGRAM_MENU_GOAL_TEMPLATES,
    _TELEGRAM_QUICK_GOAL_TEMPLATES,
    _resolve_state_dir,
    _resolve_state_file,
    _telegram_get_updates_process_lock,
    DEFAULT_CHAT_PREFIX,
    EMPYRALIS_STATE_HOME,
    EMPYRALIST_RUNTIME_URL,
    EMPYRALIST_WEB_URL,
    EMPYRALIST_WORKFLOW_API_URL,
    ORION_CHANNEL_DEAD_LETTER_FILE,
    ORION_CHANNEL_DEAD_LETTER_LIMIT,
    ORION_LOCAL_LEASE_SECONDS,
    ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
    ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
    ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS,
    ORION_TELEGRAM_AUTOPILOT_STATE_FILE,
    ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
    ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED,
    ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED,
    ORION_TELEGRAM_MEDIA_DIR,
    ORION_TELEGRAM_MEDIA_ENABLED,
    ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL,
    ORION_TELEGRAM_MEDIA_MAX_BYTES,
    ORION_TELEGRAM_MEDIA_MAX_ITEMS,
    ORION_TELEGRAM_ONBOARDING_ENABLED,
    ORION_TELEGRAM_ONBOARDING_STATE_FILE,
    ORION_TELEGRAM_PROFILE_STATE_FILE,
    ORION_TELEGRAM_SPACE_STATUS_ENABLED,
    ORION_WHATSAPP_AUTOPILOT_STATE_FILE,
    PROJECT_ROOT,
)
from server_modules.connectors.autopilot_connector_shell_service import AutopilotConnectorShellService
from server_modules.connectors.autopilot_approval_service import AutopilotApprovalService
from server_modules.connectors.autopilot_bridge_facade_service import AutopilotBridgeFacadeService
from server_modules.connectors.autopilot_channel_registry_bridge_service import AutopilotChannelRegistryBridgeService
from server_modules.connectors.autopilot_common_support_service import AutopilotCommonSupportService
from server_modules.connectors.autopilot_event_bridge_service import AutopilotEventBridgeService
from server_modules.connectors.autopilot_registry_facade_service import AutopilotRegistryFacadeService
from server_modules.connectors.autopilot_state_bridge_service import AutopilotStateBridgeService
from server_modules.connectors.autopilot_terminal_bridge_service import AutopilotTerminalBridgeService
from server_modules.connectors.autopilot_skill_service import AutopilotSkillService
from server_modules.connectors.autopilot_workflow_setup_service import AutopilotWorkflowSetupService
from server_modules.connectors.autopilot_run_entry_service import AutopilotRunEntryService
from server_modules.connectors.autopilot_runtime_support_service import AutopilotRuntimeSupportService
from server_modules.connectors.autopilot_shared_service_registry import AutopilotSharedServiceRegistry
from server_modules.connectors.autopilot_profile_service import AutopilotProfileService
from server_modules.connectors.autopilot_runtime_facade_service import AutopilotRuntimeFacadeService
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
_server = None
_SYNC_SERVER_GLOBALS = (
    "TELEGRAM_AUTOPILOT_THREAD",
    "TELEGRAM_AUTOPILOT_STATE",
    "WHATSAPP_AUTOPILOT_STATE",
)
_AUTOPILOT_CONNECTOR_SHELL_SERVICE: Optional[AutopilotConnectorShellService] = None


def _autopilot_module_global(name: str, default: Any = None) -> Any:
    return globals()[name] if name in globals() else default


def _autopilot_import_attr(module_name: str, attr_name: str) -> Any:
    return getattr(__import__(module_name, fromlist=[attr_name]), attr_name)


def _autopilot_channel_registry_bridge_service() -> AutopilotChannelRegistryBridgeService:
    return _autopilot_registry_facade_service().channel_registry_bridge_service()


def _telegram_service_registry() -> TelegramAutopilotServiceRegistry:
    return _autopilot_registry_facade_service().telegram_service_registry()


def _telegram_helper_registry_bridge_service() -> TelegramHelperRegistryBridgeService:
    return _autopilot_registry_facade_service().helper_registry_bridge_service()


def _telegram_helper_registry() -> TelegramAutopilotHelperRegistry:
    return _autopilot_registry_facade_service().telegram_helper_registry()


def _telegram_run_dispatch_service():
    return _telegram_service_registry().telegram_run_dispatch_service()


def _autopilot_support_service_registry() -> AutopilotSupportServiceRegistry:
    return _autopilot_registry_facade_service().support_service_registry()


def _autopilot_runtime_service_registry() -> AutopilotRuntimeServiceRegistry:
    return _autopilot_registry_facade_service().runtime_service_registry()


def _autopilot_connector_shell_service() -> AutopilotConnectorShellService:
    global _AUTOPILOT_CONNECTOR_SHELL_SERVICE
    if _AUTOPILOT_CONNECTOR_SHELL_SERVICE is None:
        _AUTOPILOT_CONNECTOR_SHELL_SERVICE = AutopilotConnectorShellService(
            global_namespace=globals(),
            sync_server_globals=_SYNC_SERVER_GLOBALS,
            project_root=PROJECT_ROOT,
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            telegram_onboarding_enabled=ORION_TELEGRAM_ONBOARDING_ENABLED,
            telegram_space_status_enabled=ORION_TELEGRAM_SPACE_STATUS_ENABLED,
            telegram_media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            telegram_max_updates=ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            telegram_poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            telegram_guided_automation_setup_enabled=ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED,
            telegram_media_enabled=ORION_TELEGRAM_MEDIA_ENABLED,
            telegram_media_dir=ORION_TELEGRAM_MEDIA_DIR,
            telegram_media_max_bytes=ORION_TELEGRAM_MEDIA_MAX_BYTES,
            telegram_media_include_in_goal=ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL,
            telegram_camera_setup_state_file=ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
            telegram_profile_state_file=ORION_TELEGRAM_PROFILE_STATE_FILE,
            telegram_onboarding_state_file=ORION_TELEGRAM_ONBOARDING_STATE_FILE,
            quick_goal_templates=_TELEGRAM_QUICK_GOAL_TEMPLATES,
            menu_goal_templates=_TELEGRAM_MENU_GOAL_TEMPLATES,
            workflow_api_url=EMPYRALIST_WORKFLOW_API_URL,
            runtime_url=EMPYRALIST_RUNTIME_URL,
            web_url=EMPYRALIST_WEB_URL,
            installed_skills_enabled=ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED,
            error_category_hints=_AUTOPILOT_ERROR_CATEGORY_HINTS,
            non_retryable_run_error_hints=_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS,
            dead_letter_lock=_CHANNEL_DEAD_LETTER_LOCK,
            dead_letter_file=ORION_CHANNEL_DEAD_LETTER_FILE,
            dead_letter_limit=ORION_CHANNEL_DEAD_LETTER_LIMIT,
            local_lease_seconds=ORION_LOCAL_LEASE_SECONDS,
            telegram_show_buttons=ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS,
            telegram_profile_fields=_TELEGRAM_PROFILE_FIELDS,
            run_history=_autopilot_module_global("RUN_HISTORY", {}),
            run_history_lock=_autopilot_module_global("RUN_HISTORY_LOCK", threading.Lock()),
            runtime_metrics=_autopilot_module_global("RUNTIME_METRICS", {}),
            metrics_lock=_autopilot_module_global("METRICS_LOCK", threading.Lock()),
            local_queue_lock=_autopilot_module_global("LOCAL_QUEUE_LOCK", threading.Lock()),
            local_pending_run_ids=_autopilot_module_global("LOCAL_PENDING_RUN_IDS", set()),
            local_claimed_runs=_autopilot_module_global("LOCAL_CLAIMED_RUNS", {}),
            local_worker_registry=_autopilot_module_global("LOCAL_WORKER_REGISTRY", {}),
            server_getter=lambda: _server,
            server_setter=lambda value: globals().__setitem__("_server", value),
            import_server=lambda: __import__("server", fromlist=["*"]),
            read_json=lambda path, default: (
                _autopilot_module_global("_safe_read_json")
                or _autopilot_import_attr("server_modules.runtime_common", "_safe_read_json")
            )(path, default),
            write_json=lambda path, payload: (
                _autopilot_module_global("_safe_write_json")
                or _autopilot_import_attr("server_modules.runtime_common", "_safe_write_json")
            )(path, payload),
            utc_now_iso=lambda: (
                _autopilot_module_global("_utc_now_iso")
                or _autopilot_import_attr("server_modules.runtime_common", "_utc_now_iso")
            )(),
            normalize_workspace_id=_normalize_workspace_id_fallback,
            load_vault=lambda: (
                _autopilot_module_global("load_vault")
                or _autopilot_import_attr("server_modules.vault_store", "load_vault")
            )(),
            workspace_visible=lambda workspace_id, requested_workspace_id: (
                _autopilot_module_global("_workspace_visible")
                or _autopilot_import_attr("server_modules.runtime_common", "_workspace_visible")
            )(workspace_id, requested_workspace_id),
            get_updates_process_lock=_telegram_get_updates_process_lock,
            resolve_vault_credential=lambda credential_id, workspace_id=None: (
                _autopilot_module_global("resolve_vault_credential")
                or _autopilot_import_attr("server_modules.vault_helpers", "resolve_vault_credential")
            )(credential_id, workspace_id),
            http_json_request=lambda *args, **kwargs: (
                _autopilot_module_global("http_json_request")
                or _autopilot_import_attr("server_modules.runtime_common", "http_json_request")
            )(*args, **kwargs),
            safe_path_token_impl=telegram_safe_path_token,
            telegram_space_question_via_mcp=telegram_space_question_via_mcp,
            utc_now=lambda: (
                _autopilot_module_global("_utc_now")
                or _autopilot_import_attr("server_modules.runtime_common", "_utc_now")
            )(),
            parse_utc_ts=lambda value: (
                _autopilot_module_global("_parse_utc_ts")
                or _autopilot_import_attr("server_modules.runtime_common", "_parse_utc_ts")
            )(value),
            create_run=lambda **kwargs: (
                _autopilot_module_global("create_run")
                or _autopilot_import_attr("server_modules.runs_execution", "create_run")
            )(**kwargs),
            decide_execution_target=lambda metadata: (
                _autopilot_module_global("decide_execution_target")
                or _autopilot_import_attr("server_modules.runtime_policy", "decide_execution_target")
            )(metadata),
            apply_execution_route_metadata=lambda metadata, route: (
                _autopilot_module_global("apply_execution_route_metadata")
                or _autopilot_import_attr("server_modules.runtime_policy", "apply_execution_route_metadata")
            )(metadata, route),
            normalize_trust_mode=lambda value: (
                _autopilot_module_global("normalize_trust_mode")
                or _autopilot_import_attr("server_modules.runtime_policy", "normalize_trust_mode")
            )(value),
            normalize_execution_target=lambda value: (
                _autopilot_module_global("normalize_execution_target")
                or _autopilot_import_attr("server_modules.runtime_policy", "normalize_execution_target")
            )(value),
        )
    return _AUTOPILOT_CONNECTOR_SHELL_SERVICE


def _autopilot_registry_facade_service() -> AutopilotRegistryFacadeService:
    return _autopilot_connector_shell_service().registry_facade_service()


def _autopilot_bridge_facade_service() -> AutopilotBridgeFacadeService:
    return _autopilot_connector_shell_service().bridge_facade_service()


def _autopilot_shared_service_registry() -> AutopilotSharedServiceRegistry:
    return _autopilot_bridge_facade_service().shared_service_registry()


def _autopilot_status_service():
    return _autopilot_bridge_facade_service().autopilot_status_service()


def _autopilot_endpoint_service():
    return _autopilot_bridge_facade_service().autopilot_endpoint_service()


def _autopilot_event_service():
    return _autopilot_bridge_facade_service().autopilot_event_service()


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
    return _autopilot_bridge_facade_service().event_bridge_service()


def _autopilot_terminal_bridge_service() -> AutopilotTerminalBridgeService:
    return _autopilot_bridge_facade_service().terminal_bridge_service()


def _autopilot_state_bridge_service() -> AutopilotStateBridgeService:
    return _autopilot_bridge_facade_service().state_bridge_service()


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
    return _autopilot_bridge_facade_service().compatibility_bridge_service()


def _whatsapp_webhook_bridge_service() -> WhatsAppWebhookBridgeService:
    return _autopilot_bridge_facade_service().webhook_bridge_service()


def _autopilot_runtime_facade_service() -> AutopilotRuntimeFacadeService:
    return _autopilot_connector_shell_service().runtime_facade_service()

def _load_telegram_autopilot_state() -> None:
    _autopilot_runtime_facade_service().load_telegram_autopilot_state()


def _load_whatsapp_autopilot_state() -> None:
    _autopilot_runtime_facade_service().load_whatsapp_autopilot_state()


def _telegram_autopilot_snapshot() -> Dict[str, Any]:
    return _autopilot_runtime_facade_service().telegram_autopilot_snapshot()


def _whatsapp_autopilot_snapshot() -> Dict[str, Any]:
    return _autopilot_runtime_facade_service().whatsapp_autopilot_snapshot()


def _whatsapp_autopilot_activate() -> None:
    _autopilot_runtime_facade_service().whatsapp_autopilot_activate()

def _telegram_increment_processed_updates() -> None:
    _autopilot_runtime_facade_service().telegram_increment_processed_updates()


def _telegram_set_connectors_seen(count: int) -> None:
    _autopilot_runtime_facade_service().telegram_set_connectors_seen(count)


def _mark_telegram_autopilot_started(started_at: str) -> None:
    _autopilot_runtime_facade_service().mark_telegram_autopilot_started(started_at)

def _init():
    _autopilot_runtime_facade_service().init_runtime()

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
    return _autopilot_runtime_facade_service().record_channel_event(**locals())


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
    _autopilot_runtime_facade_service().append_channel_dead_letter(**locals())


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
    kwargs = dict(locals())
    kwargs["record_event_func"] = _record_channel_event
    return _autopilot_runtime_facade_service().record_channel_event_throttled(**kwargs)


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
    return await _autopilot_runtime_facade_service().handle_telegram_send_message(**locals())


async def handle_telegram_autopilot_test_message(
    text: str,
    workspace_id: Optional[str] = None,
    session_key: Optional[str] = None,
    chat_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    sender_id: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    return await _autopilot_runtime_facade_service().handle_telegram_autopilot_test_message(**locals())


# --- COPIED ENDPOINTS ---
async def handle_whatsapp_twilio_webhook(request: Request):
    return await _autopilot_runtime_facade_service().handle_whatsapp_webhook(
        raw_body=await request.body(),
        query_secret=str(request.query_params.get("secret") or ""),
        header_secret=str(request.headers.get("x-orion-webhook-secret") or ""),
    )


def _run_telegram_autopilot_forever():
    _autopilot_runtime_facade_service().run_telegram_autopilot_forever()


async def handle_telegram_autopilot_status():
    return await _autopilot_runtime_facade_service().telegram_status_payload()


async def handle_whatsapp_autopilot_status():
    return await _autopilot_runtime_facade_service().whatsapp_status_payload()


async def handle_list_autopilot_profiles():
    return await _autopilot_runtime_facade_service().autopilot_profiles_payload()
