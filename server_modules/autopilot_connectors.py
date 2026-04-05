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
from server_modules.connectors.autopilot_connector_export_facade import AutopilotConnectorExportFacade
from server_modules.connectors.autopilot_connector_shell_builder import build_autopilot_connector_shell_service
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


def _autopilot_connector_shell_service() -> AutopilotConnectorShellService:
    global _AUTOPILOT_CONNECTOR_SHELL_SERVICE
    if _AUTOPILOT_CONNECTOR_SHELL_SERVICE is None:
        _AUTOPILOT_CONNECTOR_SHELL_SERVICE = build_autopilot_connector_shell_service(
            global_namespace=globals(),
            sync_server_globals=_SYNC_SERVER_GLOBALS,
            server_getter=lambda: _server,
            server_setter=lambda value: globals().__setitem__("_server", value),
            import_server=lambda: __import__("server", fromlist=["*"]),
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


def _telegram_compatibility_bridge_service() -> TelegramCompatibilityBridgeService:
    return _autopilot_bridge_facade_service().compatibility_bridge_service()


def _whatsapp_webhook_bridge_service() -> WhatsAppWebhookBridgeService:
    return _autopilot_bridge_facade_service().webhook_bridge_service()


def _autopilot_runtime_facade_service() -> AutopilotRuntimeFacadeService:
    return _autopilot_connector_shell_service().runtime_facade_service()

_AUTOPILOT_EXPORT_FACADE = AutopilotConnectorExportFacade(global_namespace=globals())

_autopilot_channel_registry_bridge_service = _AUTOPILOT_EXPORT_FACADE.autopilot_channel_registry_bridge_service
_telegram_service_registry = _AUTOPILOT_EXPORT_FACADE.telegram_service_registry
_telegram_helper_registry_bridge_service = _AUTOPILOT_EXPORT_FACADE.telegram_helper_registry_bridge_service
_telegram_helper_registry = _AUTOPILOT_EXPORT_FACADE.telegram_helper_registry
_telegram_run_dispatch_service = _AUTOPILOT_EXPORT_FACADE.telegram_run_dispatch_service
_autopilot_support_service_registry = _AUTOPILOT_EXPORT_FACADE.autopilot_support_service_registry
_autopilot_runtime_service_registry = _AUTOPILOT_EXPORT_FACADE.autopilot_runtime_service_registry
_autopilot_shared_service_registry = _AUTOPILOT_EXPORT_FACADE.autopilot_shared_service_registry
_autopilot_status_service = _AUTOPILOT_EXPORT_FACADE.autopilot_status_service
_autopilot_endpoint_service = _AUTOPILOT_EXPORT_FACADE.autopilot_endpoint_service
_autopilot_event_service = _AUTOPILOT_EXPORT_FACADE.autopilot_event_service
_whatsapp_service_registry = _AUTOPILOT_EXPORT_FACADE.whatsapp_service_registry
_autopilot_profile_service = _AUTOPILOT_EXPORT_FACADE.autopilot_profile_service
_telegram_connector_support_service = _AUTOPILOT_EXPORT_FACADE.telegram_connector_support_service
_runtime_status_service = _AUTOPILOT_EXPORT_FACADE.runtime_status_service
_autopilot_workflow_setup_service = _AUTOPILOT_EXPORT_FACADE.autopilot_workflow_setup_service
_telegram_connector_context_service = _AUTOPILOT_EXPORT_FACADE.telegram_connector_context_service
_autopilot_approval_service = _AUTOPILOT_EXPORT_FACADE.autopilot_approval_service
_telegram_transport_service = _AUTOPILOT_EXPORT_FACADE.telegram_transport_service
_telegram_terminal_service = _AUTOPILOT_EXPORT_FACADE.telegram_terminal_service
_autopilot_common_support_service = _AUTOPILOT_EXPORT_FACADE.autopilot_common_support_service
_autopilot_run_entry_service = _AUTOPILOT_EXPORT_FACADE.autopilot_run_entry_service
_autopilot_runtime_support_service = _AUTOPILOT_EXPORT_FACADE.autopilot_runtime_support_service
_autopilot_skill_service = _AUTOPILOT_EXPORT_FACADE.autopilot_skill_service
_autopilot_channel_support_service = _AUTOPILOT_EXPORT_FACADE.autopilot_channel_support_service
_autopilot_event_bridge_service = _AUTOPILOT_EXPORT_FACADE.autopilot_event_bridge_service
_autopilot_terminal_bridge_service = _AUTOPILOT_EXPORT_FACADE.autopilot_terminal_bridge_service
_autopilot_state_bridge_service = _AUTOPILOT_EXPORT_FACADE.autopilot_state_bridge_service
_telegram_compatibility_bridge_service = _AUTOPILOT_EXPORT_FACADE.telegram_compatibility_bridge_service
_whatsapp_webhook_bridge_service = _AUTOPILOT_EXPORT_FACADE.whatsapp_webhook_bridge_service
_load_telegram_autopilot_state = _AUTOPILOT_EXPORT_FACADE.load_telegram_autopilot_state
_load_whatsapp_autopilot_state = _AUTOPILOT_EXPORT_FACADE.load_whatsapp_autopilot_state
_telegram_autopilot_snapshot = _AUTOPILOT_EXPORT_FACADE.telegram_autopilot_snapshot
_whatsapp_autopilot_snapshot = _AUTOPILOT_EXPORT_FACADE.whatsapp_autopilot_snapshot
_whatsapp_autopilot_activate = _AUTOPILOT_EXPORT_FACADE.whatsapp_autopilot_activate
_telegram_increment_processed_updates = _AUTOPILOT_EXPORT_FACADE.telegram_increment_processed_updates
_telegram_set_connectors_seen = _AUTOPILOT_EXPORT_FACADE.telegram_set_connectors_seen
_mark_telegram_autopilot_started = _AUTOPILOT_EXPORT_FACADE.mark_telegram_autopilot_started
_init = _AUTOPILOT_EXPORT_FACADE.init_runtime
_record_channel_event = _AUTOPILOT_EXPORT_FACADE.record_channel_event
_append_channel_dead_letter = _AUTOPILOT_EXPORT_FACADE.append_channel_dead_letter
_record_channel_event_throttled = _AUTOPILOT_EXPORT_FACADE.record_channel_event_throttled
_telegram_menu_service = _AUTOPILOT_EXPORT_FACADE.telegram_menu_service
_telegram_safe_path_token = _AUTOPILOT_EXPORT_FACADE.telegram_safe_path_token
_telegram_build_goal_with_profile = _AUTOPILOT_EXPORT_FACADE.telegram_build_goal_with_profile
_telegram_workspace_connector_context = _AUTOPILOT_EXPORT_FACADE.telegram_workspace_connector_context
_telegram_extract_message = _AUTOPILOT_EXPORT_FACADE.telegram_extract_message
_telegram_build_goal_with_attachments = _AUTOPILOT_EXPORT_FACADE.telegram_build_goal_with_attachments
_telegram_route_message = _AUTOPILOT_EXPORT_FACADE.telegram_route_message
handle_telegram_send_message = _AUTOPILOT_EXPORT_FACADE.handle_telegram_send_message
handle_telegram_autopilot_test_message = _AUTOPILOT_EXPORT_FACADE.handle_telegram_autopilot_test_message
handle_whatsapp_twilio_webhook = _AUTOPILOT_EXPORT_FACADE.handle_whatsapp_twilio_webhook
_run_telegram_autopilot_forever = _AUTOPILOT_EXPORT_FACADE.run_telegram_autopilot_forever
handle_telegram_autopilot_status = _AUTOPILOT_EXPORT_FACADE.handle_telegram_autopilot_status
handle_whatsapp_autopilot_status = _AUTOPILOT_EXPORT_FACADE.handle_whatsapp_autopilot_status
handle_list_autopilot_profiles = _AUTOPILOT_EXPORT_FACADE.handle_list_autopilot_profiles
