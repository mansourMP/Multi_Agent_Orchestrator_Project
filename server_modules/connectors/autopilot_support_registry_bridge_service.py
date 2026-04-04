from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from server_modules.automation_intents import classify_automation_intent
from server_modules.connectors.autopilot_approval_service import AutopilotApprovalService
from server_modules.connectors.autopilot_channel_support_service import AutopilotChannelSupportService
from server_modules.connectors.autopilot_common_support_service import AutopilotCommonSupportService
from server_modules.connectors.autopilot_profile_service import AutopilotProfileService
from server_modules.connectors.autopilot_skill_service import AutopilotSkillService
from server_modules.connectors.autopilot_support_service_registry import AutopilotSupportServiceRegistry
from server_modules.connectors.autopilot_workflow_setup_service import AutopilotWorkflowSetupService
from server_modules.connectors.runtime_status_service import RuntimeStatusService
from server_modules.connectors.telegram_connector_context_service import TelegramConnectorContextService


class AutopilotSupportRegistryBridgeService:
    def __init__(
        self,
        *,
        project_root: Path,
        default_chat_prefix: str,
        telegram_default_profile: str,
        telegram_default_prefix: str,
        telegram_default_require_prefix: bool,
        telegram_profile_catalog: Dict[str, Any],
        whatsapp_default_profile: str,
        whatsapp_default_prefix: str,
        whatsapp_default_require_prefix: bool,
        whatsapp_profile_catalog: Dict[str, Any],
        workflow_api_url: str,
        runtime_url: str,
        web_url: str,
        installed_skills_enabled: bool,
        error_category_hints: Any,
        engine_validation_errors: Any,
        env_get: Callable[[str, str], str],
        init_runtime: Callable[[], Any],
        bool_from_any: Callable[[Any, bool], bool],
        local_companion_snapshot: Callable[[], Dict[str, Any]],
        current_runtime_metrics: Callable[[], Dict[str, Any]],
        latest_runtime_run_summary: Callable[[], str],
        list_vault_connectors: Callable[[str], Any],
        http_json_request: Callable[..., Any],
        camera_setup_service: Callable[[], Any],
        resolve_vault_credential: Callable[[str, Optional[str]], Any],
        list_recent_connector_messages: Callable[[Any, int], Any],
        query_active_installed_skills: Callable[..., Any],
        cognitive_module: Callable[[], Any],
        cognitive_defaults: Callable[[], Any],
        truncate_one_line: Callable[[str, int], str],
        normalize_string_list: Callable[[Any], Any],
        utc_now_iso: Callable[[], str],
        send_message: Callable[..., Any],
        runtime_builtin_skills_getter: Callable[[], Any],
        runtime_skills_snapshot_getter: Callable[[], Any],
        normalize_whatsapp_number: Callable[[Any], str],
        safe_path_token: Callable[[Any], str],
        support_registry_class: Callable[..., Any] = AutopilotSupportServiceRegistry,
        profile_service_class: Callable[..., Any] = AutopilotProfileService,
        runtime_status_service_class: Callable[..., Any] = RuntimeStatusService,
        workflow_setup_service_class: Callable[..., Any] = AutopilotWorkflowSetupService,
        connector_context_service_class: Callable[..., Any] = TelegramConnectorContextService,
        approval_service_class: Callable[..., Any] = AutopilotApprovalService,
        common_support_service_class: Callable[..., Any] = AutopilotCommonSupportService,
        skill_service_class: Callable[..., Any] = AutopilotSkillService,
        channel_support_service_class: Callable[..., Any] = AutopilotChannelSupportService,
    ) -> None:
        self.project_root = Path(project_root)
        self.default_chat_prefix = str(default_chat_prefix or "")
        self.telegram_default_profile = str(telegram_default_profile or "")
        self.telegram_default_prefix = str(telegram_default_prefix or "")
        self.telegram_default_require_prefix = bool(telegram_default_require_prefix)
        self.telegram_profile_catalog = telegram_profile_catalog
        self.whatsapp_default_profile = str(whatsapp_default_profile or "")
        self.whatsapp_default_prefix = str(whatsapp_default_prefix or "")
        self.whatsapp_default_require_prefix = bool(whatsapp_default_require_prefix)
        self.whatsapp_profile_catalog = whatsapp_profile_catalog
        self.workflow_api_url = str(workflow_api_url or "")
        self.runtime_url = str(runtime_url or "")
        self.web_url = str(web_url or "")
        self.installed_skills_enabled = bool(installed_skills_enabled)
        self.error_category_hints = error_category_hints
        self.engine_validation_errors = engine_validation_errors
        self.env_get = env_get
        self.init_runtime = init_runtime
        self.bool_from_any = bool_from_any
        self.local_companion_snapshot = local_companion_snapshot
        self.current_runtime_metrics = current_runtime_metrics
        self.latest_runtime_run_summary = latest_runtime_run_summary
        self.list_vault_connectors = list_vault_connectors
        self.http_json_request = http_json_request
        self.camera_setup_service = camera_setup_service
        self.resolve_vault_credential = resolve_vault_credential
        self.list_recent_connector_messages = list_recent_connector_messages
        self.query_active_installed_skills = query_active_installed_skills
        self.cognitive_module = cognitive_module
        self.cognitive_defaults = cognitive_defaults
        self.truncate_one_line = truncate_one_line
        self.normalize_string_list = normalize_string_list
        self.utc_now_iso = utc_now_iso
        self.send_message = send_message
        self.runtime_builtin_skills_getter = runtime_builtin_skills_getter
        self.runtime_skills_snapshot_getter = runtime_skills_snapshot_getter
        self.normalize_whatsapp_number = normalize_whatsapp_number
        self.safe_path_token = safe_path_token
        self.support_registry_class = support_registry_class
        self.profile_service_class = profile_service_class
        self.runtime_status_service_class = runtime_status_service_class
        self.workflow_setup_service_class = workflow_setup_service_class
        self.connector_context_service_class = connector_context_service_class
        self.approval_service_class = approval_service_class
        self.common_support_service_class = common_support_service_class
        self.skill_service_class = skill_service_class
        self.channel_support_service_class = channel_support_service_class

        self._support_registry: Optional[Any] = None

    def support_service_registry(self) -> Any:
        if self._support_registry is None:
            def _build_common_support_service() -> Any:
                def _import_cognitive_module():
                    from python_engine import cognitive_daemon as _cd  # type: ignore

                    return _cd

                return self.common_support_service_class(
                    project_root=self.project_root,
                    env_get=self.env_get,
                    import_cognitive_module=_import_cognitive_module,
                )

            self._support_registry = self.support_registry_class(
                build_profile_service=lambda: self.profile_service_class(
                    default_chat_prefix=self.default_chat_prefix,
                    bool_from_any=self.bool_from_any,
                    telegram_default_profile=self.telegram_default_profile,
                    telegram_default_prefix=self.telegram_default_prefix,
                    telegram_default_require_prefix=self.telegram_default_require_prefix,
                    telegram_profile_catalog=self.telegram_profile_catalog,
                    whatsapp_default_profile=self.whatsapp_default_profile,
                    whatsapp_default_prefix=self.whatsapp_default_prefix,
                    whatsapp_default_require_prefix=self.whatsapp_default_require_prefix,
                    whatsapp_profile_catalog=self.whatsapp_profile_catalog,
                ),
                build_runtime_status_service=lambda: self.runtime_status_service_class(
                    local_companion_snapshot=self.local_companion_snapshot,
                    current_metrics=self.current_runtime_metrics,
                    latest_run_summary=self.latest_runtime_run_summary,
                    runtime_valid=lambda: not self.engine_validation_errors,
                ),
                build_workflow_setup_service=lambda: self.workflow_setup_service_class(
                    workflow_api_url=self.workflow_api_url,
                    runtime_url=self.runtime_url,
                    web_url=self.web_url,
                    init_runtime=self.init_runtime,
                    classify_automation_intent=classify_automation_intent,
                    list_vault_connectors=self.list_vault_connectors,
                    http_json_request=self.http_json_request,
                    runtime_api_headers=lambda: {
                        "Content-Type": "application/json",
                        **(
                            {"X-API-Key": str(self.env_get("ORION_API_KEY", "") or "").strip()}
                            if str(self.env_get("ORION_API_KEY", "") or "").strip()
                            else {}
                        ),
                    },
                    camera_setup_service=self.camera_setup_service,
                ),
                build_connector_context_service=lambda: self.connector_context_service_class(
                    installed_skills_enabled=self.installed_skills_enabled,
                    init_runtime=self.init_runtime,
                    list_vault_connectors=self.list_vault_connectors,
                    resolve_vault_credential=self.resolve_vault_credential,
                    list_recent_connector_messages=lambda credentials, limit: self.list_recent_connector_messages(credentials, limit),
                    query_active_installed_skills=self.query_active_installed_skills,
                ),
                build_approval_service=lambda: self.approval_service_class(
                    default_chat_prefix=self.default_chat_prefix,
                    cognitive_module=self.cognitive_module,
                    cognitive_defaults=self.cognitive_defaults,
                    truncate_one_line=self.truncate_one_line,
                    normalize_string_list=self.normalize_string_list,
                    utc_now_iso=self.utc_now_iso,
                    send_message=self.send_message,
                ),
                build_common_support_service=_build_common_support_service,
                build_skill_service=lambda: self.skill_service_class(
                    default_chat_prefix=self.default_chat_prefix,
                    init_runtime=self.init_runtime,
                    runtime_builtin_skills_getter=self.runtime_builtin_skills_getter,
                    runtime_skills_snapshot_getter=self.runtime_skills_snapshot_getter,
                ),
                build_channel_support_service=lambda: self.channel_support_service_class(
                    error_category_hints=self.error_category_hints,
                    utc_now_iso=self.utc_now_iso,
                    normalize_whatsapp_number=self.normalize_whatsapp_number,
                    safe_path_token=self.safe_path_token,
                    env_get=self.env_get,
                ),
            )
        return self._support_registry
