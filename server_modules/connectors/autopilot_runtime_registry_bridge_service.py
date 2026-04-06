from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Dict, Optional

from server_modules.connectors.autopilot_run_entry_service import AutopilotRunEntryService
from server_modules.connectors.autopilot_runtime_service_registry import AutopilotRuntimeServiceRegistry
from server_modules.connectors.autopilot_runtime_support_service import AutopilotRuntimeSupportService
from server_modules.connectors.telegram_connector_support_service import TelegramConnectorSupportService
from server_modules.connectors.telegram_menu_service import TelegramMenuService
from server_modules.connectors.telegram_terminal_service import TelegramTerminalService
from server_modules.connectors.telegram_transport_service import TelegramTransportService


class AutopilotRuntimeRegistryBridgeService:
    def __init__(
        self,
        *,
        project_root: Path,
        default_chat_prefix: str,
        telegram_poll_seconds: float,
        telegram_default_workspace_id: str,
        telegram_media_max_items: int,
        telegram_trust_mode_value: str,
        telegram_execution_target_value: str,
        telegram_engine: str,
        whatsapp_engine: str,
        telegram_show_buttons: bool,
        local_lease_seconds: int,
        non_retryable_run_error_hints: Any,
        runtime_builtin_skills_limit_builder: Callable[[str, int], Any],
        normalize_workspace_id: Callable[[Any], str],
        resolve_vault_credential: Callable[[str, Optional[str]], Any],
        normalize_agent_role: Callable[[Any], str],
        allow_any_chat: Callable[[], bool],
        http_json_request: Callable[..., Any],
        telegram_session_key: Callable[[str], str],
        safe_path_token: Callable[[Any], str],
        reply_keyboard: Callable[[Dict[str, Any]], Any],
        append_dead_letter: Callable[..., Any],
        record_channel_event: Callable[..., Any],
        utc_now_iso: Callable[[], str],
        chat_id_from_session_key: Callable[[str], str],
        list_connector_entries: Callable[[], Any],
        get_secret: Callable[[Dict[str, Any]], Any],
        resolve_profile: Callable[[Dict[str, Any]], Dict[str, Any]],
        route_message: Callable[[str, Dict[str, Any]], Dict[str, Any]],
        get_chat_profile: Callable[[str, str], Dict[str, Any]],
        build_goal_with_profile: Callable[[str, Dict[str, Any]], str],
        workspace_connector_context: Callable[..., Dict[str, Any]],
        build_goal_with_connector_context: Callable[[str, str], str],
        installed_skill_query: Callable[..., Dict[str, Any]],
        create_telegram_run: Callable[..., Dict[str, Any]],
        wait_for_run_terminal_status: Callable[..., Dict[str, Any]],
        runs_get: Callable[[str], Any],
        send_message: Callable[..., Any],
        set_connector_state: Callable[[str, Dict[str, Any]], Any],
        telegram_profile_fields: Any,
        assigned_agent_role: Callable[[Dict[str, Any]], str],
        normalize_trust_mode: Callable[[Any], str],
        normalize_execution_target: Callable[[Any], str],
        decide_execution_target: Callable[[Dict[str, Any]], Dict[str, Any]],
        apply_execution_route_metadata: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]],
        run_start_request_class: Optional[Callable[..., Any]],
        start_run_request: Optional[Callable[[Any], Dict[str, Any]]],
        create_run: Callable[..., Any],
        whatsapp_session_key: Callable[[str, str], str],
        inherit_owner_user_id: Callable[[Optional[str]], Optional[str]],
        agent_machine_full_trust_enabled: Callable[[Optional[str]], bool],
        telegram_runs_started: Callable[[], Any],
        whatsapp_runs_started: Callable[[], Any],
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
        runtime_registry_class: Callable[..., Any] = AutopilotRuntimeServiceRegistry,
        connector_support_service_class: Callable[..., Any] = TelegramConnectorSupportService,
        transport_service_class: Callable[..., Any] = TelegramTransportService,
        terminal_service_class: Callable[..., Any] = TelegramTerminalService,
        run_entry_service_class: Callable[..., Any] = AutopilotRunEntryService,
        runtime_support_service_class: Callable[..., Any] = AutopilotRuntimeSupportService,
        menu_service_class: Callable[..., Any] = TelegramMenuService,
    ) -> None:
        self.project_root = Path(project_root)
        self.default_chat_prefix = str(default_chat_prefix or "")
        self.telegram_poll_seconds = float(telegram_poll_seconds)
        self.telegram_default_workspace_id = str(telegram_default_workspace_id or "default").strip() or "default"
        self.telegram_media_max_items = int(telegram_media_max_items)
        self.telegram_trust_mode_value = str(telegram_trust_mode_value or "")
        self.telegram_execution_target_value = str(telegram_execution_target_value or "")
        self.telegram_engine = str(telegram_engine or "")
        self.whatsapp_engine = str(whatsapp_engine or "")
        self.telegram_show_buttons = bool(telegram_show_buttons)
        self.local_lease_seconds = int(local_lease_seconds or 0)
        self.non_retryable_run_error_hints = non_retryable_run_error_hints
        self.runtime_builtin_skills_limit_builder = runtime_builtin_skills_limit_builder
        self.normalize_workspace_id = normalize_workspace_id
        self.resolve_vault_credential = resolve_vault_credential
        self.normalize_agent_role = normalize_agent_role
        self.allow_any_chat = allow_any_chat
        self.http_json_request = http_json_request
        self.telegram_session_key = telegram_session_key
        self.safe_path_token = safe_path_token
        self.reply_keyboard = reply_keyboard
        self.append_dead_letter = append_dead_letter
        self.record_channel_event = record_channel_event
        self.utc_now_iso = utc_now_iso
        self.chat_id_from_session_key = chat_id_from_session_key
        self.list_connector_entries = list_connector_entries
        self.get_secret = get_secret
        self.resolve_profile = resolve_profile
        self.route_message = route_message
        self.get_chat_profile = get_chat_profile
        self.build_goal_with_profile = build_goal_with_profile
        self.workspace_connector_context = workspace_connector_context
        self.build_goal_with_connector_context = build_goal_with_connector_context
        self.installed_skill_query = installed_skill_query
        self.create_telegram_run = create_telegram_run
        self.wait_for_run_terminal_status = wait_for_run_terminal_status
        self.runs_get = runs_get
        self.send_message = send_message
        self.set_connector_state = set_connector_state
        self.telegram_profile_fields = telegram_profile_fields
        self.assigned_agent_role = assigned_agent_role
        self.normalize_trust_mode = normalize_trust_mode
        self.normalize_execution_target = normalize_execution_target
        self.decide_execution_target = decide_execution_target
        self.apply_execution_route_metadata = apply_execution_route_metadata
        self.run_start_request_class = run_start_request_class
        self.start_run_request = start_run_request
        self.create_run = create_run
        self.whatsapp_session_key = whatsapp_session_key
        self.inherit_owner_user_id = inherit_owner_user_id
        self.agent_machine_full_trust_enabled = agent_machine_full_trust_enabled
        self.telegram_runs_started = telegram_runs_started
        self.whatsapp_runs_started = whatsapp_runs_started
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
        self.runtime_registry_class = runtime_registry_class
        self.connector_support_service_class = connector_support_service_class
        self.transport_service_class = transport_service_class
        self.terminal_service_class = terminal_service_class
        self.run_entry_service_class = run_entry_service_class
        self.runtime_support_service_class = runtime_support_service_class
        self.menu_service_class = menu_service_class

        self._runtime_registry: Optional[Any] = None

    def runtime_service_registry(self) -> Any:
        if self._runtime_registry is None:
            self._runtime_registry = self.runtime_registry_class(
                build_connector_support_service=lambda: self.connector_support_service_class(
                    normalize_workspace_id=self.normalize_workspace_id,
                    resolve_vault_credential=self.resolve_vault_credential,
                    normalize_agent_role=self.normalize_agent_role,
                    allow_any_chat=self.allow_any_chat(),
                ),
                build_transport_service=lambda: self.transport_service_class(
                    poll_seconds=self.telegram_poll_seconds,
                    http_json_request=self.http_json_request,
                    session_key=self.telegram_session_key,
                    safe_path_token=self.safe_path_token,
                    reply_keyboard=self.reply_keyboard,
                    append_dead_letter=self.append_dead_letter,
                    record_channel_event=self.record_channel_event,
                    utc_now_iso=self.utc_now_iso,
                ),
                build_terminal_service=lambda: self.terminal_service_class(
                    normalize_workspace_id=self.normalize_workspace_id,
                    chat_id_from_session_key=self.chat_id_from_session_key,
                    list_connector_entries=self.list_connector_entries,
                    get_secret=self.get_secret,
                    resolve_profile=self.resolve_profile,
                    route_message=self.route_message,
                    get_chat_profile=self.get_chat_profile,
                    build_goal_with_profile=self.build_goal_with_profile,
                    workspace_connector_context=self.workspace_connector_context,
                    build_goal_with_connector_context=self.build_goal_with_connector_context,
                    installed_skill_query=self.installed_skill_query,
                    create_run=lambda **kwargs: self.create_telegram_run(
                        **kwargs,
                        media_max_items=self.telegram_media_max_items,
                        trust_mode_value=self.telegram_trust_mode_value,
                        execution_target_value=self.telegram_execution_target_value,
                    ),
                    wait_for_run_terminal_status=self.wait_for_run_terminal_status,
                    runs_get=self.runs_get,
                    session_key=self.telegram_session_key,
                    safe_path_token=self.safe_path_token,
                    send_message=self.send_message,
                    set_connector_state=self.set_connector_state,
                    utc_now_iso=self.utc_now_iso,
                ),
                build_run_entry_service=lambda: self.run_entry_service_class(
                    telegram_profile_fields=list(self.telegram_profile_fields),
                    telegram_engine=self.telegram_engine,
                    whatsapp_engine=self.whatsapp_engine,
                    safe_path_token=self.safe_path_token,
                    assigned_agent_role=self.assigned_agent_role,
                    normalize_trust_mode=self.normalize_trust_mode,
                    normalize_execution_target=self.normalize_execution_target,
                    decide_execution_target=self.decide_execution_target,
                    apply_execution_route_metadata=self.apply_execution_route_metadata,
                    run_start_request_class=self.run_start_request_class,
                    start_run_request=self.start_run_request,
                    create_run=self.create_run,
                    record_channel_event=self.record_channel_event,
                    telegram_session_key=self.telegram_session_key,
                    whatsapp_session_key=self.whatsapp_session_key,
                    inherit_owner_user_id=self.inherit_owner_user_id,
                    agent_machine_full_trust_enabled=self.agent_machine_full_trust_enabled,
                    telegram_runs_started=self.telegram_runs_started,
                    whatsapp_runs_started=self.whatsapp_runs_started,
                ),
                build_runtime_support_service=lambda: self.runtime_support_service_class(
                    run_history=self.run_history,
                    run_history_lock=self.run_history_lock,
                    runtime_metrics=self.runtime_metrics,
                    metrics_lock=self.metrics_lock,
                    utc_now=self.utc_now,
                    parse_utc_ts=self.parse_utc_ts,
                    worker_online_helper=self.worker_online_helper,
                    local_lease_seconds=self.local_lease_seconds,
                    local_queue_lock=self.local_queue_lock,
                    local_pending_run_ids=self.local_pending_run_ids,
                    local_claimed_runs=self.local_claimed_runs,
                    local_worker_registry=self.local_worker_registry,
                    truncate_one_line=self.truncate_one_line,
                    non_retryable_run_error_hints=list(self.non_retryable_run_error_hints),
                ),
                build_menu_service=lambda: self.menu_service_class(
                    default_chat_prefix=self.default_chat_prefix,
                    show_buttons=self.telegram_show_buttons,
                    runtime_active_skills=lambda scope_key, limit: self.runtime_builtin_skills_limit_builder(scope_key, limit),
                ),
            )
        return self._runtime_registry
