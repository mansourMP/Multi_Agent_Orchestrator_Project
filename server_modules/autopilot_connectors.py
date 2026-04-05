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
    ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS,
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
    PROJECT_ROOT,
)
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
_AUTOPILOT_BRIDGE_FACADE_SERVICE: Optional[AutopilotBridgeFacadeService] = None
_AUTOPILOT_RUNTIME_FACADE_SERVICE: Optional[AutopilotRuntimeFacadeService] = None
_AUTOPILOT_REGISTRY_FACADE_SERVICE: Optional[AutopilotRegistryFacadeService] = None


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


def _autopilot_registry_facade_service() -> AutopilotRegistryFacadeService:
    global _AUTOPILOT_REGISTRY_FACADE_SERVICE
    if _AUTOPILOT_REGISTRY_FACADE_SERVICE is None:
        _AUTOPILOT_REGISTRY_FACADE_SERVICE = AutopilotRegistryFacadeService(
            project_root=PROJECT_ROOT,
            default_chat_prefix=DEFAULT_CHAT_PREFIX,
            telegram_default_workspace_id_getter=lambda: str(globals().get("ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID") or "default"),
            telegram_onboarding_enabled=ORION_TELEGRAM_ONBOARDING_ENABLED,
            telegram_require_prefix_getter=lambda: bool(globals().get("ORION_TELEGRAM_AUTOPILOT_REQUIRE_PREFIX", False)),
            telegram_prefix_getter=lambda: str(globals().get("ORION_TELEGRAM_AUTOPILOT_PREFIX") or ""),
            telegram_space_status_enabled=ORION_TELEGRAM_SPACE_STATUS_ENABLED,
            telegram_media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            telegram_max_updates=ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES,
            telegram_poll_seconds=ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS,
            telegram_run_timeout_seconds_getter=lambda: int(globals().get("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            telegram_max_reply_chars_getter=lambda: int(globals().get("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            telegram_send_ack_getter=lambda: bool(globals().get("ORION_TELEGRAM_AUTOPILOT_SEND_ACK")),
            telegram_enabled_getter=lambda: bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ENABLED", False)),
            telegram_default_profile_getter=lambda: str(globals().get("ORION_TELEGRAM_AUTOPILOT_PROFILE") or ""),
            telegram_guided_automation_setup_enabled=ORION_TELEGRAM_GUIDED_AUTOMATION_SETUP_ENABLED,
            telegram_trust_mode_value_getter=lambda: str(globals().get("ORION_TELEGRAM_AUTOPILOT_TRUST_MODE") or ""),
            telegram_execution_target_value_getter=lambda: str(globals().get("ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET") or ""),
            whatsapp_enabled_getter=lambda: bool(globals().get("ORION_WHATSAPP_AUTOPILOT_ENABLED", False)),
            whatsapp_default_profile_getter=lambda: str(globals().get("ORION_WHATSAPP_AUTOPILOT_PROFILE") or ""),
            whatsapp_require_prefix_getter=lambda: bool(globals().get("ORION_WHATSAPP_AUTOPILOT_REQUIRE_PREFIX", False)),
            whatsapp_prefix_getter=lambda: str(globals().get("ORION_WHATSAPP_AUTOPILOT_PREFIX") or ""),
            whatsapp_run_timeout_seconds_getter=lambda: int(globals().get("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS") or 180),
            whatsapp_max_reply_chars_getter=lambda: int(globals().get("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS") or 1200),
            whatsapp_send_ack_getter=lambda: bool(globals().get("ORION_WHATSAPP_AUTOPILOT_SEND_ACK")),
            whatsapp_trust_mode_value_getter=lambda: str(globals().get("ORION_WHATSAPP_AUTOPILOT_TRUST_MODE") or ""),
            whatsapp_execution_target_value_getter=lambda: str(globals().get("ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET") or ""),
            telegram_state_getter=lambda: globals().get("TELEGRAM_AUTOPILOT_STATE") or {},
            telegram_lock_getter=lambda: globals().get("TELEGRAM_AUTOPILOT_LOCK") or threading.Lock(),
            telegram_state_file=ORION_TELEGRAM_AUTOPILOT_STATE_FILE,
            whatsapp_state_getter=lambda: globals().get("WHATSAPP_AUTOPILOT_STATE") or {},
            whatsapp_lock_getter=lambda: globals().get("WHATSAPP_AUTOPILOT_LOCK") or threading.Lock(),
            whatsapp_state_file=ORION_WHATSAPP_AUTOPILOT_STATE_FILE,
            read_json=_safe_read_json,
            write_json=_safe_write_json,
            utc_now_iso=_utc_now_iso,
            normalize_workspace_id=_normalize_workspace_id_fallback,
            load_vault=load_vault,
            workspace_visible=_workspace_visible,
            telegram_thread_alive=lambda: bool(
                (getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else globals().get("TELEGRAM_AUTOPILOT_THREAD"))
                and (getattr(_server, "TELEGRAM_AUTOPILOT_THREAD", None) if _server is not None else globals().get("TELEGRAM_AUTOPILOT_THREAD")).is_alive()
            ),
            telegram_allow_from_value=lambda: os.getenv("ORION_TELEGRAM_AUTOPILOT_ALLOW_FROM", ""),
            get_updates_process_lock=_telegram_get_updates_process_lock,
            mark_telegram_started=_mark_telegram_autopilot_started,
            resolve_vault_credential=resolve_vault_credential,
            safe_path_token=_telegram_safe_path_token,
            runs_get=lambda run_id: runs.get(run_id) if isinstance(runs, dict) else None,
            telegram_space_question_via_mcp=telegram_space_question_via_mcp,
            helper_profile_state_file=ORION_TELEGRAM_PROFILE_STATE_FILE,
            helper_onboarding_state_file=ORION_TELEGRAM_ONBOARDING_STATE_FILE,
            helper_camera_setup_state_file=ORION_TELEGRAM_CAMERA_SETUP_STATE_FILE,
            helper_media_dir=ORION_TELEGRAM_MEDIA_DIR,
            helper_media_enabled=ORION_TELEGRAM_MEDIA_ENABLED,
            helper_media_max_items=ORION_TELEGRAM_MEDIA_MAX_ITEMS,
            helper_media_max_bytes=ORION_TELEGRAM_MEDIA_MAX_BYTES,
            helper_media_include_in_goal=ORION_TELEGRAM_MEDIA_INCLUDE_IN_GOAL,
            helper_quick_goal_templates=_TELEGRAM_QUICK_GOAL_TEMPLATES,
            helper_menu_goal_templates=_TELEGRAM_MENU_GOAL_TEMPLATES,
            support_workflow_api_url=EMPYRALIST_WORKFLOW_API_URL,
            support_runtime_url=EMPYRALIST_RUNTIME_URL,
            support_web_url=EMPYRALIST_WEB_URL,
            telegram_profile_catalog_getter=lambda: globals().get("TELEGRAM_AUTOPILOT_PROFILE_CATALOG") or {},
            whatsapp_profile_catalog_getter=lambda: globals().get("WHATSAPP_AUTOPILOT_PROFILE_CATALOG") or {},
            support_installed_skills_enabled=ORION_TELEGRAM_INSTALLED_SKILLS_ENABLED,
            support_error_category_hints=_AUTOPILOT_ERROR_CATEGORY_HINTS,
            support_engine_validation_errors_getter=lambda: globals().get("ORION_ENGINE_VALIDATION_ERRORS") or [],
            env_get=lambda key, default="": os.getenv(key, default),
            init_runtime=_init,
            runtime_telegram_engine_getter=lambda: (
                str(globals().get("ORION_TELEGRAM_AUTOPILOT_ENGINE") or "")
                if str(globals().get("ORION_TELEGRAM_AUTOPILOT_ENGINE") or "") in ENGINE_REGISTRY
                else "orion"
            ),
            runtime_whatsapp_engine_getter=lambda: (
                str(globals().get("ORION_WHATSAPP_AUTOPILOT_ENGINE") or "")
                if str(globals().get("ORION_WHATSAPP_AUTOPILOT_ENGINE") or "") in ENGINE_REGISTRY
                else "orion"
            ),
            runtime_telegram_show_buttons=ORION_TELEGRAM_AUTOPILOT_SHOW_BUTTONS,
            runtime_local_lease_seconds=ORION_LOCAL_LEASE_SECONDS,
            runtime_non_retryable_run_error_hints=_AUTOPILOT_NON_RETRYABLE_RUN_ERROR_HINTS,
            runtime_builtin_skills_limit_builder=lambda scope_key, limit: _autopilot_skill_service().runtime_active_skills(scope_key, limit=limit),
            normalize_agent_role=lambda value: str((globals().get("normalize_agent_role") or (lambda item: item))(value) or "").strip().lower(),
            allow_any_chat_getter=lambda: bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ALLOW_ANY_CHAT", False)),
            http_json_request=lambda *args, **kwargs: http_json_request(*args, **kwargs),
            telegram_profile_fields=_TELEGRAM_PROFILE_FIELDS,
            normalize_trust_mode=normalize_trust_mode,
            normalize_execution_target=normalize_execution_target,
            decide_execution_target=decide_execution_target,
            apply_execution_route_metadata=apply_execution_route_metadata,
            create_run=lambda **kwargs: create_run(**kwargs),
            inherit_owner_user_id=lambda owner_user_id=None: __import__("server_modules.runtime_config", fromlist=["x"]).agent_machine_inherited_owner_user_id(owner_user_id),
            agent_machine_full_trust_enabled=lambda owner_user_id: __import__("server_modules.runtime_config", fromlist=["x"]).agent_machine_full_trust_enabled(owner_user_id),
            run_history=RUN_HISTORY,
            run_history_lock=RUN_HISTORY_LOCK,
            runtime_metrics=RUNTIME_METRICS,
            metrics_lock=METRICS_LOCK,
            utc_now=_utc_now,
            parse_utc_ts=_parse_utc_ts,
            worker_online_helper=lambda record, now=None: bool((globals().get("_is_worker_online") or (lambda *_args, **_kwargs: False))(record, now)),
            local_queue_lock=LOCAL_QUEUE_LOCK,
            local_pending_run_ids=LOCAL_PENDING_RUN_IDS,
            local_claimed_runs=LOCAL_CLAIMED_RUNS,
            local_worker_registry=LOCAL_WORKER_REGISTRY,
            truncate_one_line=lambda text, limit: _autopilot_channel_support_service().truncate_one_line(text, limit),
            bool_from_any=lambda value, default=False: _telegram_connector_support_service().bool_from_any(value, default),
            local_companion_snapshot=lambda: _autopilot_runtime_support_service().local_companion_snapshot(),
            current_runtime_metrics=lambda: _autopilot_runtime_support_service().current_runtime_metrics(),
            latest_runtime_run_summary=lambda: _autopilot_runtime_support_service().latest_runtime_run_summary(),
            list_vault_connectors=lambda workspace_id: list_vault_connectors(workspace_id),
            list_recent_connector_messages=lambda credentials, limit: list_recent_connector_messages(credentials, limit=limit),
            query_active_installed_skills=lambda **kwargs: query_active_installed_skills(**kwargs),
            runtime_builtin_skills_getter=lambda: globals().get("RUNTIME_BUILTIN_SKILLS"),
            runtime_skills_snapshot_getter=lambda: globals().get("_runtime_skills_snapshot"),
            bridge_facade_getter=_autopilot_bridge_facade_service,
        )
    return _AUTOPILOT_REGISTRY_FACADE_SERVICE


def _autopilot_bridge_facade_service() -> AutopilotBridgeFacadeService:
    global _AUTOPILOT_BRIDGE_FACADE_SERVICE
    if _AUTOPILOT_BRIDGE_FACADE_SERVICE is None:
        _AUTOPILOT_BRIDGE_FACADE_SERVICE = AutopilotBridgeFacadeService(
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
            telegram_workspace_id=ORION_TELEGRAM_AUTOPILOT_WORKSPACE_ID,
            whatsapp_workspace_id=ORION_WHATSAPP_AUTOPILOT_WORKSPACE_ID,
            telegram_service_registry=_telegram_service_registry,
            whatsapp_service_registry=_whatsapp_service_registry,
            autopilot_profile_service=_autopilot_profile_service,
            init_runtime=_init,
            telegram_terminal_service=lambda: _telegram_terminal_service(),
            telegram_enabled_getter=lambda: bool(globals().get("ORION_TELEGRAM_AUTOPILOT_ENABLED", False)),
            telegram_default_profile_getter=lambda: str(globals().get("ORION_TELEGRAM_AUTOPILOT_PROFILE") or ""),
            telegram_catalog_getter=lambda: globals().get("TELEGRAM_AUTOPILOT_PROFILE_CATALOG") or {},
            whatsapp_enabled_getter=lambda: bool(globals().get("ORION_WHATSAPP_AUTOPILOT_ENABLED", False)),
            whatsapp_default_profile_getter=lambda: str(globals().get("ORION_WHATSAPP_AUTOPILOT_PROFILE") or ""),
            whatsapp_catalog_getter=lambda: globals().get("WHATSAPP_AUTOPILOT_PROFILE_CATALOG") or {},
            telegram_state_getter=lambda: globals().get("TELEGRAM_AUTOPILOT_STATE") or {},
            telegram_lock_getter=lambda: globals().get("TELEGRAM_AUTOPILOT_LOCK") or threading.Lock(),
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
            forbidden_response=lambda content: Response(status_code=403, content=content),
            webhook_enabled_getter=lambda: bool(globals().get("ORION_WHATSAPP_AUTOPILOT_ENABLED", False)),
            configured_webhook_secret_getter=lambda: str(globals().get("ORION_WHATSAPP_AUTOPILOT_WEBHOOK_SECRET") or ""),
        )
    return _AUTOPILOT_BRIDGE_FACADE_SERVICE


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
    global _AUTOPILOT_RUNTIME_FACADE_SERVICE
    if _AUTOPILOT_RUNTIME_FACADE_SERVICE is None:
        _AUTOPILOT_RUNTIME_FACADE_SERVICE = AutopilotRuntimeFacadeService(
            global_namespace=globals(),
            sync_server_globals=_SYNC_SERVER_GLOBALS,
            server_getter=lambda: _server,
            server_setter=lambda value: globals().__setitem__("_server", value),
            import_server=lambda: __import__("server", fromlist=["*"]),
            state_bridge_service=_autopilot_state_bridge_service,
            event_bridge_service=_autopilot_event_bridge_service,
            terminal_bridge_service=_autopilot_terminal_bridge_service,
            webhook_bridge_service=_whatsapp_webhook_bridge_service,
        )
    return _AUTOPILOT_RUNTIME_FACADE_SERVICE

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
