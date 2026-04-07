from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from server_modules.connectors.autopilot_channel_registry_bridge_service import AutopilotChannelRegistryBridgeService
from server_modules.connectors.autopilot_runtime_registry_bridge_service import AutopilotRuntimeRegistryBridgeService
from server_modules.connectors.autopilot_support_registry_bridge_service import AutopilotSupportRegistryBridgeService
from server_modules.connectors.telegram_helper_registry_bridge_service import TelegramHelperRegistryBridgeService


class AutopilotRegistryFacadeService:
    def __init__(
        self,
        *,
        project_root: Path,
        default_chat_prefix: str,
        telegram_default_workspace_id_getter: Callable[[], str],
        telegram_onboarding_enabled: bool,
        telegram_require_prefix_getter: Callable[[], bool],
        telegram_prefix_getter: Callable[[], str],
        telegram_space_status_enabled: bool,
        telegram_media_max_items: int,
        telegram_max_updates: int,
        telegram_poll_seconds: float,
        telegram_run_timeout_seconds_getter: Callable[[], int],
        telegram_max_reply_chars_getter: Callable[[], int],
        telegram_send_ack_getter: Callable[[], bool],
        telegram_enabled_getter: Callable[[], bool],
        telegram_default_profile_getter: Callable[[], str],
        telegram_guided_automation_setup_enabled: bool,
        telegram_trust_mode_value_getter: Callable[[], str],
        telegram_execution_target_value_getter: Callable[[], str],
        whatsapp_enabled_getter: Callable[[], bool],
        whatsapp_default_profile_getter: Callable[[], str],
        whatsapp_require_prefix_getter: Callable[[], bool],
        whatsapp_prefix_getter: Callable[[], str],
        whatsapp_run_timeout_seconds_getter: Callable[[], int],
        whatsapp_max_reply_chars_getter: Callable[[], int],
        whatsapp_send_ack_getter: Callable[[], bool],
        whatsapp_trust_mode_value_getter: Callable[[], str],
        whatsapp_execution_target_value_getter: Callable[[], str],
        telegram_state_getter: Callable[[], Dict[str, Any]],
        telegram_lock_getter: Callable[[], Any],
        telegram_state_file: Path,
        whatsapp_state_getter: Callable[[], Dict[str, Any]],
        whatsapp_lock_getter: Callable[[], Any],
        whatsapp_state_file: Path,
        read_json: Callable[[Path, Any], Any],
        write_json: Callable[[Path, Any], Any],
        utc_now_iso: Callable[[], str],
        normalize_workspace_id: Callable[[Any], str],
        load_vault: Callable[[], Any],
        workspace_visible: Callable[[str, Any], bool],
        telegram_thread_alive: Callable[[], bool],
        telegram_allow_from_value: Callable[[], str],
        get_updates_process_lock: Callable[[str], Any],
        mark_telegram_started: Callable[[str], Any],
        resolve_vault_credential: Callable[[str, Optional[str]], Any],
        safe_path_token: Callable[[Any], str],
        runs_get: Callable[[str], Any],
        telegram_space_question_via_mcp: Callable[..., Dict[str, Any]],
        helper_profile_state_file: Path,
        helper_onboarding_state_file: Path,
        helper_camera_setup_state_file: Path,
        helper_media_dir: Path,
        helper_media_enabled: bool,
        helper_media_max_items: int,
        helper_media_max_bytes: int,
        helper_media_include_in_goal: bool,
        helper_quick_goal_templates: Dict[str, str],
        helper_menu_goal_templates: Dict[str, str],
        support_workflow_api_url: str,
        support_runtime_url: str,
        support_web_url: str,
        telegram_profile_catalog_getter: Callable[[], Dict[str, Any]],
        whatsapp_profile_catalog_getter: Callable[[], Dict[str, Any]],
        support_installed_skills_enabled: bool,
        support_error_category_hints: Any,
        support_engine_validation_errors_getter: Callable[[], Any],
        env_get: Callable[[str, str], str],
        init_runtime: Callable[[], Any],
        runtime_telegram_engine_getter: Callable[[], str],
        runtime_whatsapp_engine_getter: Callable[[], str],
        runtime_telegram_show_buttons: bool,
        runtime_local_lease_seconds: int,
        runtime_non_retryable_run_error_hints: Any,
        runtime_builtin_skills_limit_builder: Callable[[str, int], Any],
        normalize_agent_role: Callable[[Any], str],
        allow_any_chat_getter: Callable[[], bool],
        http_json_request: Callable[..., Any],
        telegram_profile_fields: Any,
        normalize_trust_mode: Callable[[Any], str],
        normalize_execution_target: Callable[[Any], str],
        decide_execution_target: Callable[[Dict[str, Any]], Dict[str, Any]],
        apply_execution_route_metadata: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]],
        execute_agent_turn_request: Optional[Callable[..., Dict[str, Any]]] = None,
        run_start_request_class: Optional[Callable[..., Any]] = None,
        start_run_request: Optional[Callable[[Any], Dict[str, Any]]] = None,
        create_run: Callable[..., Any],
        inherit_owner_user_id: Callable[[Optional[str]], Optional[str]],
        agent_machine_full_trust_enabled: Callable[[Optional[str]], bool],
        run_history: Any,
        run_history_lock: Any,
        runtime_metrics: Dict[str, Any],
        metrics_lock: Any,
        utc_now: Callable[[], Any],
        parse_utc_ts: Callable[[Any], Any],
        worker_online_helper: Callable[[Dict[str, Any], Optional[Any]], bool],
        local_queue_lock: Any,
        local_pending_run_ids: Any,
        local_claimed_runs: Any,
        local_worker_registry: Dict[str, Any],
        truncate_one_line: Callable[[str, int], str],
        bool_from_any: Callable[[Any, bool], bool],
        local_companion_snapshot: Callable[[], Dict[str, Any]],
        current_runtime_metrics: Callable[[], Dict[str, Any]],
        latest_runtime_run_summary: Callable[[], str],
        list_vault_connectors: Callable[[str], Any],
        list_recent_connector_messages: Callable[[Any, int], Any],
        query_active_installed_skills: Callable[..., Any],
        runtime_builtin_skills_getter: Callable[[], Any],
        runtime_skills_snapshot_getter: Callable[[], Any],
        bridge_facade_getter: Callable[[], Any],
        channel_registry_bridge_class: Callable[..., Any] = AutopilotChannelRegistryBridgeService,
        helper_registry_bridge_class: Callable[..., Any] = TelegramHelperRegistryBridgeService,
        support_registry_bridge_class: Callable[..., Any] = AutopilotSupportRegistryBridgeService,
        runtime_registry_bridge_class: Callable[..., Any] = AutopilotRuntimeRegistryBridgeService,
    ) -> None:
        self.project_root = Path(project_root)
        self.default_chat_prefix = str(default_chat_prefix or "")
        self.telegram_default_workspace_id_getter = telegram_default_workspace_id_getter
        self.telegram_onboarding_enabled = bool(telegram_onboarding_enabled)
        self.telegram_require_prefix_getter = telegram_require_prefix_getter
        self.telegram_prefix_getter = telegram_prefix_getter
        self.telegram_space_status_enabled = bool(telegram_space_status_enabled)
        self.telegram_media_max_items = int(telegram_media_max_items)
        self.telegram_max_updates = int(telegram_max_updates)
        self.telegram_poll_seconds = float(telegram_poll_seconds)
        self.telegram_run_timeout_seconds_getter = telegram_run_timeout_seconds_getter
        self.telegram_max_reply_chars_getter = telegram_max_reply_chars_getter
        self.telegram_send_ack_getter = telegram_send_ack_getter
        self.telegram_enabled_getter = telegram_enabled_getter
        self.telegram_default_profile_getter = telegram_default_profile_getter
        self.telegram_guided_automation_setup_enabled = bool(telegram_guided_automation_setup_enabled)
        self.telegram_trust_mode_value_getter = telegram_trust_mode_value_getter
        self.telegram_execution_target_value_getter = telegram_execution_target_value_getter
        self.whatsapp_enabled_getter = whatsapp_enabled_getter
        self.whatsapp_default_profile_getter = whatsapp_default_profile_getter
        self.whatsapp_require_prefix_getter = whatsapp_require_prefix_getter
        self.whatsapp_prefix_getter = whatsapp_prefix_getter
        self.whatsapp_run_timeout_seconds_getter = whatsapp_run_timeout_seconds_getter
        self.whatsapp_max_reply_chars_getter = whatsapp_max_reply_chars_getter
        self.whatsapp_send_ack_getter = whatsapp_send_ack_getter
        self.whatsapp_trust_mode_value_getter = whatsapp_trust_mode_value_getter
        self.whatsapp_execution_target_value_getter = whatsapp_execution_target_value_getter
        self.telegram_state_getter = telegram_state_getter
        self.telegram_lock_getter = telegram_lock_getter
        self.telegram_state_file = Path(telegram_state_file)
        self.whatsapp_state_getter = whatsapp_state_getter
        self.whatsapp_lock_getter = whatsapp_lock_getter
        self.whatsapp_state_file = Path(whatsapp_state_file)
        self.read_json = read_json
        self.write_json = write_json
        self.utc_now_iso = utc_now_iso
        self.normalize_workspace_id = normalize_workspace_id
        self.load_vault = load_vault
        self.workspace_visible = workspace_visible
        self.telegram_thread_alive = telegram_thread_alive
        self.telegram_allow_from_value = telegram_allow_from_value
        self.get_updates_process_lock = get_updates_process_lock
        self.mark_telegram_started = mark_telegram_started
        self.resolve_vault_credential = resolve_vault_credential
        self.safe_path_token = safe_path_token
        self.runs_get = runs_get
        self.telegram_space_question_via_mcp = telegram_space_question_via_mcp
        self.helper_profile_state_file = Path(helper_profile_state_file)
        self.helper_onboarding_state_file = Path(helper_onboarding_state_file)
        self.helper_camera_setup_state_file = Path(helper_camera_setup_state_file)
        self.helper_media_dir = Path(helper_media_dir)
        self.helper_media_enabled = bool(helper_media_enabled)
        self.helper_media_max_items = int(helper_media_max_items)
        self.helper_media_max_bytes = int(helper_media_max_bytes)
        self.helper_media_include_in_goal = bool(helper_media_include_in_goal)
        self.helper_quick_goal_templates = helper_quick_goal_templates
        self.helper_menu_goal_templates = helper_menu_goal_templates
        self.support_workflow_api_url = str(support_workflow_api_url or "")
        self.support_runtime_url = str(support_runtime_url or "")
        self.support_web_url = str(support_web_url or "")
        self.telegram_profile_catalog_getter = telegram_profile_catalog_getter
        self.whatsapp_profile_catalog_getter = whatsapp_profile_catalog_getter
        self.support_installed_skills_enabled = bool(support_installed_skills_enabled)
        self.support_error_category_hints = support_error_category_hints
        self.support_engine_validation_errors_getter = support_engine_validation_errors_getter
        self.env_get = env_get
        self.init_runtime = init_runtime
        self.runtime_telegram_engine_getter = runtime_telegram_engine_getter
        self.runtime_whatsapp_engine_getter = runtime_whatsapp_engine_getter
        self.runtime_telegram_show_buttons = bool(runtime_telegram_show_buttons)
        self.runtime_local_lease_seconds = int(runtime_local_lease_seconds or 0)
        self.runtime_non_retryable_run_error_hints = runtime_non_retryable_run_error_hints
        self.runtime_builtin_skills_limit_builder = runtime_builtin_skills_limit_builder
        self.normalize_agent_role = normalize_agent_role
        self.allow_any_chat_getter = allow_any_chat_getter
        self.http_json_request = http_json_request
        self.telegram_profile_fields = telegram_profile_fields
        self.normalize_trust_mode = normalize_trust_mode
        self.normalize_execution_target = normalize_execution_target
        self.decide_execution_target = decide_execution_target
        self.apply_execution_route_metadata = apply_execution_route_metadata
        self.execute_agent_turn_request = execute_agent_turn_request
        self.run_start_request_class = run_start_request_class
        self.start_run_request = start_run_request
        self.create_run = create_run
        self.inherit_owner_user_id = inherit_owner_user_id
        self.agent_machine_full_trust_enabled = agent_machine_full_trust_enabled
        self.run_history = run_history
        self.run_history_lock = run_history_lock
        self.runtime_metrics = runtime_metrics
        self.metrics_lock = metrics_lock
        self.utc_now = utc_now
        self.parse_utc_ts = parse_utc_ts
        self.worker_online_helper = worker_online_helper
        self.local_queue_lock = local_queue_lock
        self.local_pending_run_ids = local_pending_run_ids
        self.local_claimed_runs = local_claimed_runs
        self.local_worker_registry = local_worker_registry
        self.truncate_one_line = truncate_one_line
        self.bool_from_any = bool_from_any
        self.local_companion_snapshot = local_companion_snapshot
        self.current_runtime_metrics = current_runtime_metrics
        self.latest_runtime_run_summary = latest_runtime_run_summary
        self.list_vault_connectors = list_vault_connectors
        self.list_recent_connector_messages = list_recent_connector_messages
        self.query_active_installed_skills = query_active_installed_skills
        self.runtime_builtin_skills_getter = runtime_builtin_skills_getter
        self.runtime_skills_snapshot_getter = runtime_skills_snapshot_getter
        self.bridge_facade_getter = bridge_facade_getter
        self.channel_registry_bridge_class = channel_registry_bridge_class
        self.helper_registry_bridge_class = helper_registry_bridge_class
        self.support_registry_bridge_class = support_registry_bridge_class
        self.runtime_registry_bridge_class = runtime_registry_bridge_class

        self._channel_registry_bridge: Optional[Any] = None
        self._helper_registry_bridge: Optional[Any] = None
        self._support_registry_bridge: Optional[Any] = None
        self._runtime_registry_bridge: Optional[Any] = None

    def channel_registry_bridge_service(self) -> Any:
        if self._channel_registry_bridge is None:
            self._channel_registry_bridge = self.channel_registry_bridge_class(
                project_root=self.project_root,
                default_chat_prefix=self.default_chat_prefix,
                telegram_default_workspace_id=self.telegram_default_workspace_id_getter(),
                telegram_onboarding_enabled=self.telegram_onboarding_enabled,
                telegram_require_prefix=self.telegram_require_prefix_getter(),
                telegram_prefix=self.telegram_prefix_getter(),
                telegram_space_status_enabled=self.telegram_space_status_enabled,
                telegram_media_max_items=self.telegram_media_max_items,
                telegram_max_updates=self.telegram_max_updates,
                telegram_poll_seconds=self.telegram_poll_seconds,
                telegram_run_timeout_seconds=self.telegram_run_timeout_seconds_getter(),
                telegram_max_reply_chars=self.telegram_max_reply_chars_getter(),
                telegram_send_ack=self.telegram_send_ack_getter(),
                telegram_enabled=self.telegram_enabled_getter(),
                telegram_default_profile=self.telegram_default_profile_getter(),
                telegram_guided_automation_setup_enabled=self.telegram_guided_automation_setup_enabled,
                telegram_trust_mode_value=self.telegram_trust_mode_value_getter(),
                telegram_execution_target_value=self.telegram_execution_target_value_getter(),
                whatsapp_enabled=self.whatsapp_enabled_getter(),
                whatsapp_default_profile=self.whatsapp_default_profile_getter(),
                whatsapp_require_prefix=self.whatsapp_require_prefix_getter(),
                whatsapp_prefix=self.whatsapp_prefix_getter(),
                whatsapp_run_timeout_seconds=self.whatsapp_run_timeout_seconds_getter(),
                whatsapp_max_reply_chars=self.whatsapp_max_reply_chars_getter(),
                whatsapp_send_ack=self.whatsapp_send_ack_getter(),
                whatsapp_trust_mode_value=self.whatsapp_trust_mode_value_getter(),
                whatsapp_execution_target_value=self.whatsapp_execution_target_value_getter(),
                telegram_state=self.telegram_state_getter(),
                telegram_lock=self.telegram_lock_getter(),
                telegram_state_file=self.telegram_state_file,
                whatsapp_state=self.whatsapp_state_getter(),
                whatsapp_lock=self.whatsapp_lock_getter(),
                whatsapp_state_file=self.whatsapp_state_file,
                read_json=self.read_json,
                write_json=self.write_json,
                utc_now_iso=self.utc_now_iso,
                normalize_workspace_id=self.normalize_workspace_id,
                load_vault=self.load_vault,
                workspace_visible=self.workspace_visible,
                telegram_thread_alive=self.telegram_thread_alive,
                telegram_allow_from_value=self.telegram_allow_from_value,
                get_updates_process_lock=self.get_updates_process_lock,
                mark_telegram_started=self.mark_telegram_started,
                resolve_vault_credential=self.resolve_vault_credential,
                safe_path_token=self.safe_path_token,
                runs_get=self.runs_get,
                sleep=time.sleep,
                telegram_space_question_via_mcp=self.telegram_space_question_via_mcp,
                telegram_helper_registry=self.telegram_helper_registry,
                autopilot_support_service_registry=self.support_service_registry,
                autopilot_runtime_service_registry=self.runtime_service_registry,
                autopilot_event_bridge_service=self.event_bridge_service,
            )
        return self._channel_registry_bridge

    def telegram_service_registry(self) -> Any:
        return self.channel_registry_bridge_service().telegram_service_registry()

    def whatsapp_service_registry(self) -> Any:
        return self.channel_registry_bridge_service().whatsapp_service_registry()

    def helper_registry_bridge_service(self) -> Any:
        if self._helper_registry_bridge is None:
            self._helper_registry_bridge = self.helper_registry_bridge_class(
                profile_state_file=self.helper_profile_state_file,
                onboarding_state_file=self.helper_onboarding_state_file,
                camera_setup_state_file=self.helper_camera_setup_state_file,
                media_dir=self.helper_media_dir,
                media_enabled=self.helper_media_enabled,
                media_max_items=self.helper_media_max_items,
                media_max_bytes=self.helper_media_max_bytes,
                media_include_in_goal=self.helper_media_include_in_goal,
                default_chat_prefix=self.default_chat_prefix,
                quick_goal_templates=self.helper_quick_goal_templates,
                menu_goal_templates=self.helper_menu_goal_templates,
                read_json=lambda path, default: self.read_json(path, default),
                write_json=lambda path, payload: self.write_json(path, payload),
                now_iso=self.utc_now_iso,
                truncate_one_line=self.truncate_one_line,
                session_key_builder=lambda workspace_id, chat_id: self.telegram_helper_registry().profile_service().telegram_profile_key(
                    workspace_id,
                    chat_id,
                ),
                telegram_api_request=lambda bot_token, method, **kwargs: self.transport_service().api_request(
                    bot_token,
                    method,
                    **kwargs,
                ),
                normalize_profile_field=lambda raw_value: self.telegram_helper_registry().profile_service().normalize_profile_field(raw_value),
                select_skill_from_text=lambda raw_text: self.skill_service().select_skill_from_text(raw_text),
                skill_goal_builder=lambda skill: self.skill_service().telegram_skill_goal(skill),
            )
        return self._helper_registry_bridge

    def telegram_helper_registry(self) -> Any:
        return self.helper_registry_bridge_service().telegram_helper_registry()

    def support_registry_bridge_service(self) -> Any:
        if self._support_registry_bridge is None:
            self._support_registry_bridge = self.support_registry_bridge_class(
                project_root=self.project_root,
                default_chat_prefix=self.default_chat_prefix,
                telegram_default_profile=self.telegram_default_profile_getter(),
                telegram_default_prefix=self.telegram_prefix_getter(),
                telegram_default_require_prefix=self.telegram_require_prefix_getter(),
                telegram_profile_catalog=self.telegram_profile_catalog_getter(),
                whatsapp_default_profile=self.whatsapp_default_profile_getter(),
                whatsapp_default_prefix=self.whatsapp_prefix_getter(),
                whatsapp_default_require_prefix=self.whatsapp_require_prefix_getter(),
                whatsapp_profile_catalog=self.whatsapp_profile_catalog_getter(),
                workflow_api_url=self.support_workflow_api_url,
                runtime_url=self.support_runtime_url,
                web_url=self.support_web_url,
                installed_skills_enabled=self.support_installed_skills_enabled,
                error_category_hints=self.support_error_category_hints,
                engine_validation_errors=self.support_engine_validation_errors_getter(),
                env_get=self.env_get,
                init_runtime=self.init_runtime,
                bool_from_any=lambda value, default=False: self.connector_support_service().bool_from_any(value, default),
                local_companion_snapshot=lambda: self.runtime_support_service().local_companion_snapshot(),
                current_runtime_metrics=lambda: self.runtime_support_service().current_runtime_metrics(),
                latest_runtime_run_summary=lambda: self.runtime_support_service().latest_runtime_run_summary(),
                list_vault_connectors=self.list_vault_connectors,
                http_json_request=self.http_json_request,
                camera_setup_service=lambda: self.telegram_helper_registry().camera_setup_service(),
                resolve_vault_credential=self.resolve_vault_credential,
                list_recent_connector_messages=lambda credentials, limit: self.list_recent_connector_messages(credentials, limit=limit),
                query_active_installed_skills=self.query_active_installed_skills,
                cognitive_module=lambda: self.common_support_service().cognitive_module(),
                cognitive_defaults=lambda: self.common_support_service().cognitive_defaults(),
                truncate_one_line=self.truncate_one_line,
                normalize_string_list=lambda value: self.common_support_service().normalize_string_list(value),
                utc_now_iso=self.utc_now_iso,
                send_message=lambda **kwargs: self.transport_service().send_message(**kwargs),
                runtime_builtin_skills_getter=self.runtime_builtin_skills_getter,
                runtime_skills_snapshot_getter=self.runtime_skills_snapshot_getter,
                normalize_whatsapp_number=lambda value: self.whatsapp_service_registry().whatsapp_transport_service().normalize_number(value),
                safe_path_token=self.safe_path_token,
            )
        return self._support_registry_bridge

    def support_service_registry(self) -> Any:
        return self.support_registry_bridge_service().support_service_registry()

    def runtime_registry_bridge_service(self) -> Any:
        if self._runtime_registry_bridge is None:
            self._runtime_registry_bridge = self.runtime_registry_bridge_class(
                project_root=self.project_root,
                default_chat_prefix=self.default_chat_prefix,
                telegram_poll_seconds=self.telegram_poll_seconds,
                telegram_default_workspace_id=self.telegram_default_workspace_id_getter(),
                telegram_media_max_items=self.telegram_media_max_items,
                telegram_trust_mode_value=self.telegram_trust_mode_value_getter(),
                telegram_execution_target_value=self.telegram_execution_target_value_getter(),
                telegram_engine=self.runtime_telegram_engine_getter(),
                whatsapp_engine=self.runtime_whatsapp_engine_getter(),
                telegram_show_buttons=self.runtime_telegram_show_buttons,
                local_lease_seconds=self.runtime_local_lease_seconds,
                non_retryable_run_error_hints=self.runtime_non_retryable_run_error_hints,
                runtime_builtin_skills_limit_builder=self.runtime_builtin_skills_limit_builder,
                normalize_workspace_id=self.normalize_workspace_id,
                resolve_vault_credential=self.resolve_vault_credential,
                normalize_agent_role=self.normalize_agent_role,
                allow_any_chat=self.allow_any_chat_getter,
                http_json_request=self.http_json_request,
                telegram_session_key=lambda chat_id: self.channel_support_service().telegram_session_key(chat_id),
                safe_path_token=self.safe_path_token,
                reply_keyboard=lambda profile: self.menu_service().reply_keyboard(profile),
                append_dead_letter=lambda **kwargs: self.event_bridge_service().append_channel_dead_letter(**kwargs),
                record_channel_event=lambda **kwargs: self.event_bridge_service().record_channel_event(**kwargs),
                utc_now_iso=self.utc_now_iso,
                chat_id_from_session_key=lambda key: self.common_support_service().chat_id_from_session_key(key),
                list_connector_entries=lambda: self.telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                    self.telegram_default_workspace_id_getter()
                ),
                get_secret=lambda entry: self.connector_support_service().get_secret(entry),
                resolve_profile=lambda entry: self.profile_service().resolve_telegram_profile(entry),
                route_message=lambda text, profile: self.telegram_helper_registry().routing_service().route_message(text, profile),
                get_chat_profile=lambda workspace_id, chat_id: self.telegram_helper_registry().profile_service().get_profile(workspace_id, chat_id),
                build_goal_with_profile=lambda goal, profile: self.telegram_helper_registry().profile_service().build_goal_with_profile(goal, profile),
                workspace_connector_context=lambda **kwargs: self.connector_context_service().workspace_connector_context(**kwargs),
                build_goal_with_connector_context=lambda goal, prompt: self.connector_context_service().build_goal_with_connector_context(goal, prompt),
                installed_skill_query=lambda **kwargs: self.connector_context_service().installed_skill_query(**kwargs),
                create_telegram_run=lambda **kwargs: self.run_entry_service().create_telegram_run(**kwargs),
                wait_for_run_terminal_status=lambda run_id, timeout_seconds=None, max_reply_chars=None: self.telegram_service_registry().telegram_run_dispatch_service().wait_for_terminal_status(
                    run_id,
                    timeout_seconds=timeout_seconds,
                    max_reply_chars=max_reply_chars,
                ),
                runs_get=self.runs_get,
                send_message=lambda **kwargs: self.transport_service().send_message(**kwargs),
                set_connector_state=lambda connector_id, patch: self.telegram_service_registry().telegram_autopilot_state_service().set_connector_state(
                    connector_id,
                    patch,
                ),
                telegram_profile_fields=self.telegram_profile_fields,
                assigned_agent_role=lambda entry: self.connector_support_service().connector_assigned_agent_role(entry),
                normalize_trust_mode=self.normalize_trust_mode,
                normalize_execution_target=self.normalize_execution_target,
                decide_execution_target=self.decide_execution_target,
                apply_execution_route_metadata=self.apply_execution_route_metadata,
                execute_agent_turn_request=self.execute_agent_turn_request,
                run_start_request_class=self.run_start_request_class,
                start_run_request=self.start_run_request,
                create_run=self.create_run,
                whatsapp_session_key=lambda from_number, to_number: self.channel_support_service().whatsapp_session_key(from_number, to_number),
                inherit_owner_user_id=self.inherit_owner_user_id,
                agent_machine_full_trust_enabled=self.agent_machine_full_trust_enabled,
                telegram_runs_started=lambda: (
                    self.telegram_state_getter().__setitem__("runs_started", int(self.telegram_state_getter().get("runs_started") or 0) + 1),
                    self.telegram_service_registry().telegram_autopilot_state_service().persist_state(),
                ),
                whatsapp_runs_started=lambda: (
                    self.whatsapp_state_getter().__setitem__("runs_started", int(self.whatsapp_state_getter().get("runs_started") or 0) + 1),
                    self.whatsapp_service_registry().whatsapp_autopilot_state_service().persist_state(),
                ),
                run_history=self.run_history,
                run_history_lock=self.run_history_lock,
                runtime_metrics=self.runtime_metrics,
                metrics_lock=self.metrics_lock,
                utc_now=self.utc_now,
                parse_utc_ts=self.parse_utc_ts,
                worker_online_helper=self.worker_online_helper,
                local_queue_lock=self.local_queue_lock,
                local_pending_run_ids=self.local_pending_run_ids,
                local_claimed_runs=self.local_claimed_runs,
                local_worker_registry=self.local_worker_registry,
                truncate_one_line=self.truncate_one_line,
            )
        return self._runtime_registry_bridge

    def runtime_service_registry(self) -> Any:
        return self.runtime_registry_bridge_service().runtime_service_registry()

    def profile_service(self) -> Any:
        return self.support_service_registry().profile_service()

    def connector_support_service(self) -> Any:
        return self.runtime_service_registry().connector_support_service()

    def runtime_status_service(self) -> Any:
        return self.support_service_registry().runtime_status_service()

    def workflow_setup_service(self) -> Any:
        return self.support_service_registry().workflow_setup_service()

    def connector_context_service(self) -> Any:
        return self.support_service_registry().connector_context_service()

    def approval_service(self) -> Any:
        return self.support_service_registry().approval_service()

    def transport_service(self) -> Any:
        return self.runtime_service_registry().transport_service()

    def terminal_service(self) -> Any:
        return self.runtime_service_registry().terminal_service()

    def common_support_service(self) -> Any:
        return self.support_service_registry().common_support_service()

    def run_entry_service(self) -> Any:
        return self.runtime_service_registry().run_entry_service()

    def runtime_support_service(self) -> Any:
        return self.runtime_service_registry().runtime_support_service()

    def skill_service(self) -> Any:
        return self.support_service_registry().skill_service()

    def channel_support_service(self) -> Any:
        return self.support_service_registry().channel_support_service()

    def menu_service(self) -> Any:
        return self.runtime_service_registry().menu_service()

    def event_bridge_service(self) -> Any:
        return self.bridge_facade_getter().event_bridge_service()
