from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Dict, Optional

from server_modules import outbox_service
from server_modules.connectors.telegram_autopilot_service_registry import TelegramAutopilotServiceRegistry
from server_modules.connectors.whatsapp_autopilot_service_registry import WhatsAppAutopilotServiceRegistry


class AutopilotChannelRegistryBridgeService:
    def __init__(
        self,
        *,
        project_root: Path,
        default_chat_prefix: str,
        telegram_default_workspace_id: str,
        telegram_onboarding_enabled: bool,
        telegram_require_prefix: bool,
        telegram_prefix: str,
        telegram_space_status_enabled: bool,
        telegram_media_max_items: int,
        telegram_max_updates: int,
        telegram_poll_seconds: float,
        telegram_delivery_mode: str,
        telegram_run_timeout_seconds: int,
        telegram_max_reply_chars: int,
        telegram_send_ack: bool,
        telegram_enabled: bool,
        telegram_default_profile: str,
        telegram_guided_automation_setup_enabled: bool,
        telegram_trust_mode_value: str,
        telegram_execution_target_value: str,
        whatsapp_enabled: bool,
        whatsapp_default_profile: str,
        whatsapp_require_prefix: bool,
        whatsapp_prefix: str,
        whatsapp_run_timeout_seconds: int,
        whatsapp_max_reply_chars: int,
        whatsapp_send_ack: bool,
        whatsapp_require_explicit_opt_in: bool,
        whatsapp_redact_event_text: bool,
        whatsapp_retention_days: int,
        whatsapp_trust_mode_value: str,
        whatsapp_execution_target_value: str,
        telegram_state: Dict[str, Any],
        telegram_lock: Any,
        telegram_state_file: Path,
        whatsapp_state: Dict[str, Any],
        whatsapp_lock: Any,
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
        resolve_vault_credential: Callable[[str, Optional[str]], Dict[str, Any]],
        safe_path_token: Callable[[Any], str],
        runs_get: Callable[[str], Any],
        sleep: Callable[[float], Any],
        telegram_space_question_via_mcp: Callable[..., Dict[str, Any]],
        telegram_helper_registry: Callable[[], Any],
        autopilot_support_service_registry: Callable[[], Any],
        autopilot_runtime_service_registry: Callable[[], Any],
        autopilot_event_bridge_service: Callable[[], Any],
        telegram_registry_class: Callable[..., Any] = TelegramAutopilotServiceRegistry,
        whatsapp_registry_class: Callable[..., Any] = WhatsAppAutopilotServiceRegistry,
    ) -> None:
        self.project_root = Path(project_root)
        self.default_chat_prefix = default_chat_prefix
        self.telegram_default_workspace_id = str(telegram_default_workspace_id or "default").strip() or "default"
        self.telegram_onboarding_enabled = bool(telegram_onboarding_enabled)
        self.telegram_require_prefix = bool(telegram_require_prefix)
        self.telegram_prefix = str(telegram_prefix or "")
        self.telegram_space_status_enabled = bool(telegram_space_status_enabled)
        self.telegram_media_max_items = int(telegram_media_max_items)
        self.telegram_max_updates = int(telegram_max_updates)
        self.telegram_poll_seconds = float(telegram_poll_seconds)
        self.telegram_delivery_mode = str(telegram_delivery_mode or "").strip().lower() or "polling"
        self.telegram_run_timeout_seconds = int(telegram_run_timeout_seconds)
        self.telegram_max_reply_chars = int(telegram_max_reply_chars)
        self.telegram_send_ack = bool(telegram_send_ack)
        self.telegram_enabled = bool(telegram_enabled)
        self.telegram_default_profile = str(telegram_default_profile or "")
        self.telegram_guided_automation_setup_enabled = bool(telegram_guided_automation_setup_enabled)
        self.telegram_trust_mode_value = str(telegram_trust_mode_value or "")
        self.telegram_execution_target_value = str(telegram_execution_target_value or "")
        self.whatsapp_enabled = bool(whatsapp_enabled)
        self.whatsapp_default_profile = str(whatsapp_default_profile or "")
        self.whatsapp_require_prefix = bool(whatsapp_require_prefix)
        self.whatsapp_prefix = str(whatsapp_prefix or "")
        self.whatsapp_run_timeout_seconds = int(whatsapp_run_timeout_seconds)
        self.whatsapp_max_reply_chars = int(whatsapp_max_reply_chars)
        self.whatsapp_send_ack = bool(whatsapp_send_ack)
        self.whatsapp_require_explicit_opt_in = bool(whatsapp_require_explicit_opt_in)
        self.whatsapp_redact_event_text = bool(whatsapp_redact_event_text)
        self.whatsapp_retention_days = max(1, int(whatsapp_retention_days or 30))
        self.whatsapp_trust_mode_value = str(whatsapp_trust_mode_value or "")
        self.whatsapp_execution_target_value = str(whatsapp_execution_target_value or "")
        self.telegram_state = telegram_state
        self.telegram_lock = telegram_lock
        self.telegram_state_file = Path(telegram_state_file)
        self.whatsapp_state = whatsapp_state
        self.whatsapp_lock = whatsapp_lock
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
        self.sleep = sleep
        self.telegram_space_question_via_mcp = telegram_space_question_via_mcp
        self.telegram_helper_registry = telegram_helper_registry
        self.autopilot_support_service_registry = autopilot_support_service_registry
        self.autopilot_runtime_service_registry = autopilot_runtime_service_registry
        self.autopilot_event_bridge_service = autopilot_event_bridge_service
        self.telegram_registry_class = telegram_registry_class
        self.whatsapp_registry_class = whatsapp_registry_class

        self._telegram_service_registry: Optional[Any] = None
        self._whatsapp_service_registry: Optional[Any] = None

    def telegram_service_registry(self) -> Any:
        if self._telegram_service_registry is None:
            support_registry = self.autopilot_support_service_registry()
            runtime_registry = self.autopilot_runtime_service_registry()
            helper_registry = self.telegram_helper_registry()
            event_bridge = self.autopilot_event_bridge_service()
            self._telegram_service_registry = self.telegram_registry_class(
                project_root=self.project_root,
                default_workspace_id=self.telegram_default_workspace_id,
                default_chat_prefix=self.default_chat_prefix,
                onboarding_enabled=self.telegram_onboarding_enabled,
                require_prefix=self.telegram_require_prefix,
                prefix=self.telegram_prefix,
                space_status_enabled=self.telegram_space_status_enabled,
                media_max_items=self.telegram_media_max_items,
                max_updates=self.telegram_max_updates,
                poll_seconds=self.telegram_poll_seconds,
                delivery_mode=self.telegram_delivery_mode,
                run_timeout_seconds=self.telegram_run_timeout_seconds,
                max_reply_chars=self.telegram_max_reply_chars,
                send_ack=self.telegram_send_ack,
                state=self.telegram_state,
                lock=self.telegram_lock,
                state_file=self.telegram_state_file,
                read_json=self.read_json,
                write_json=self.write_json,
                persist_state=lambda: self.telegram_service_registry().telegram_autopilot_state_service().persist_state(),
                utc_now_iso=self.utc_now_iso,
                classify_error=lambda detail: support_registry.channel_support_service().classify_error(detail),
                iso_from_epoch=lambda ts: support_registry.channel_support_service().iso_from_epoch(ts),
                normalize_workspace_id=self.normalize_workspace_id,
                thread_alive=self.telegram_thread_alive,
                enabled=self.telegram_enabled,
                default_profile=self.telegram_default_profile,
                list_connector_entries=lambda: self.telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                    self.telegram_default_workspace_id
                ),
                resolve_profile=lambda entry: support_registry.profile_service().resolve_telegram_profile(entry),
                resolve_allow_from=lambda entry: runtime_registry.connector_support_service().resolve_allow_from(
                    entry,
                    self.telegram_allow_from_value(),
                ),
                connector_state=lambda connector_id: self.telegram_service_registry().telegram_autopilot_state_service().connector_state(
                    connector_id
                ),
                set_connector_state=lambda connector_id, patch: self.telegram_service_registry().telegram_autopilot_state_service().set_connector_state(
                    connector_id,
                    patch,
                ),
                resolve_secret=lambda entry: runtime_registry.connector_support_service().get_secret(entry),
                load_vault=self.load_vault,
                workspace_visible=self.workspace_visible,
                connector_paused=lambda item: runtime_registry.connector_support_service().connector_paused(item),
                get_updates_process_lock=self.get_updates_process_lock,
                notify_pending_approvals=lambda **kwargs: support_registry.approval_service().notify_pending_approvals(**kwargs),
                telegram_api_request=lambda bot_token, method, **kwargs: runtime_registry.transport_service().api_request(
                    bot_token,
                    method,
                    **kwargs,
                ),
                record_channel_event=lambda **kwargs: event_bridge.record_channel_event(**kwargs),
                record_channel_event_throttled=lambda **kwargs: event_bridge.record_channel_event_throttled(**kwargs),
                send_message=lambda *args, **kwargs: runtime_registry.transport_service().send_message(*args, **kwargs),
                send_chat_action=lambda *args, **kwargs: runtime_registry.transport_service().send_chat_action(*args, **kwargs),
                edit_message=lambda *args, **kwargs: runtime_registry.transport_service().edit_message(*args, **kwargs),
                autopilot_log=lambda message: support_registry.channel_support_service().telegram_autopilot_log(message),
                autopilot_mark_error=lambda detail, source: self.telegram_service_registry().telegram_autopilot_runtime_service().mark_error(
                    detail,
                    source=source,
                ),
                mark_poll=lambda clear_error: self.telegram_service_registry().telegram_autopilot_runtime_service().mark_poll(
                    clear_error=clear_error
                ),
                mark_started=self.mark_telegram_started,
                normalize_profile_field=lambda raw_value: helper_registry.profile_service().normalize_profile_field(raw_value),
                select_skill_from_text=lambda raw_text: support_registry.skill_service().select_skill_from_text(raw_text),
                skill_goal_builder=lambda skill: support_registry.skill_service().telegram_skill_goal(skill),
                help_text=lambda profile: helper_registry.routing_service().help_text(profile),
                skills_menu_text=lambda profile: support_registry.skill_service().telegram_skills_menu_text(profile),
                menu_keyboard=lambda profile, menu_id: runtime_registry.menu_service().menu_keyboard(profile, menu_id),
                onboarding_prompt=lambda step_index, retry: helper_registry.profile_service().onboarding_prompt(
                    step_index,
                    retry=retry,
                ),
                onboarding_start=lambda workspace_id, chat_id: helper_registry.profile_service().start_onboarding(
                    workspace_id,
                    chat_id,
                ),
                profile_text=lambda profile, chat_profile: helper_registry.profile_service().profile_text(
                    profile,
                    chat_profile,
                ),
                profile_help_text=lambda profile: helper_registry.profile_service().profile_help_text(profile),
                profile_set=lambda workspace_id, chat_id, field_name, value: helper_registry.profile_service().set_profile_field(
                    workspace_id,
                    chat_id,
                    field_name,
                    value,
                ),
                profile_clear=lambda workspace_id, chat_id, field_name: helper_registry.profile_service().clear_profile(
                    workspace_id,
                    chat_id,
                    field_name,
                ),
                runtime_status_text=lambda workspace_id: support_registry.runtime_status_service().runtime_status_text(workspace_id),
                approvals_list=lambda limit, workspace_id=None: support_registry.approval_service().approvals_list(
                    limit=limit,
                    workspace_id=workspace_id,
                ),
                approvals_text=lambda payload, prefix: support_registry.approval_service().approvals_text(payload, prefix=prefix),
                approval_resolve=lambda event_id, approved, note, workspace_id=None: support_registry.approval_service().approval_resolve(
                    event_id=event_id,
                    approved=approved,
                    note=note,
                    workspace_id=workspace_id,
                ),
                approval_result_text=lambda payload, approved: support_registry.approval_service().approval_result_text(
                    payload,
                    approved=approved,
                ),
                extract_message=lambda update: helper_registry.media_service().extract_message(update),
                chat_matches=lambda configured_chat_id, chat: runtime_registry.connector_support_service().chat_matches(
                    configured_chat_id,
                    chat,
                ),
                store_attachments=lambda **kwargs: helper_registry.media_service().store_attachments(**kwargs),
                route_message=lambda message_text, profile: helper_registry.routing_service().route_message(
                    message_text,
                    profile,
                ),
                session_key_builder=lambda chat_id: support_registry.channel_support_service().telegram_session_key(chat_id),
                trace_id_builder=lambda chat_id, update_id, message_id: support_registry.channel_support_service().telegram_trace_id(
                    chat_id,
                    update_id,
                    message_id,
                ),
                guided_setup_handler=lambda **kwargs: support_registry.workflow_setup_service().handle_telegram_guided_automation_setup(
                    **kwargs,
                    enabled=self.telegram_guided_automation_setup_enabled,
                ),
                sender_allowed=lambda sender, allow_from: runtime_registry.connector_support_service().sender_allowed(
                    sender,
                    allow_from,
                ),
                get_chat_profile=lambda workspace_id, chat_id: helper_registry.profile_service().get_profile(
                    workspace_id,
                    chat_id,
                ),
                explicit_run_command=lambda raw_text: helper_registry.routing_service().is_explicit_run_command(raw_text),
                onboarding_get_state=lambda workspace_id, chat_id: helper_registry.profile_service().get_onboarding_state(
                    workspace_id,
                    chat_id,
                ),
                onboarding_consume_answer=lambda workspace_id, chat_id, text: helper_registry.profile_service().onboarding_consume_answer(
                    workspace_id,
                    chat_id,
                    text,
                ),
                profile_get=lambda workspace_id, chat_id: helper_registry.profile_service().get_profile(
                    workspace_id,
                    chat_id,
                ),
                profile_has_context=lambda chat_profile: helper_registry.profile_service().profile_has_context(chat_profile),
                build_goal_with_profile=lambda goal, chat_profile: helper_registry.profile_service().build_goal_with_profile(
                    goal,
                    chat_profile,
                ),
                build_goal_with_attachments=lambda goal, attachments: helper_registry.media_service().build_goal_with_attachments(
                    goal,
                    attachments,
                ),
                workspace_connector_context=lambda **kwargs: support_registry.connector_context_service().workspace_connector_context(
                    **kwargs
                ),
                build_goal_with_connector_context=lambda goal, prompt_append: support_registry.connector_context_service().build_goal_with_connector_context(
                    goal,
                    prompt_append,
                ),
                space_question_via_mcp=lambda goal, enabled, project_root: self.telegram_space_question_via_mcp(
                    goal,
                    enabled=enabled,
                    project_root=project_root,
                ),
                installed_skill_query=lambda **kwargs: support_registry.connector_context_service().installed_skill_query(
                    **kwargs
                ),
                truncate_one_line=lambda text, limit: support_registry.channel_support_service().truncate_one_line(text, limit),
                create_run=lambda **kwargs: runtime_registry.run_entry_service().create_telegram_run(
                    **kwargs,
                    media_max_items=self.telegram_media_max_items,
                    trust_mode_value=self.telegram_trust_mode_value,
                    execution_target_value=self.telegram_execution_target_value,
                ),
                include_run_meta=lambda: support_registry.channel_support_service().include_run_meta(),
                humanize_run_summary=lambda text: runtime_registry.runtime_support_service().humanize_telegram_run_summary(text),
                runs_get=self.runs_get,
                latest_run_error_message=lambda run: runtime_registry.runtime_support_service().latest_run_error_message(run),
                is_non_retryable_run_error=lambda error: runtime_registry.runtime_support_service().is_non_retryable_run_error(error),
                friendly_run_error=lambda error: runtime_registry.runtime_support_service().friendly_run_error(error),
                summarize_run_terminal_result=lambda run, limit: runtime_registry.runtime_support_service().summarize_run_terminal_result(
                    run,
                    limit,
                ),
                local_companion_snapshot=lambda: runtime_registry.runtime_support_service().local_companion_snapshot(),
                can_auto_approve_wait=lambda run: runtime_registry.run_entry_service().can_auto_approve_wait(run),
                pending_confirmation_payload=lambda run: runtime_registry.run_entry_service().pending_confirmation_payload(run),
                emit_channel_run_delivery_event=outbox_service.emit_channel_run_delivery_event,
                sleep=self.sleep,
            )
        return self._telegram_service_registry

    def whatsapp_service_registry(self) -> Any:
        if self._whatsapp_service_registry is None:
            support_registry = self.autopilot_support_service_registry()
            runtime_registry = self.autopilot_runtime_service_registry()
            helper_registry = self.telegram_helper_registry()
            event_bridge = self.autopilot_event_bridge_service()
            self._whatsapp_service_registry = self.whatsapp_registry_class(
                state=self.whatsapp_state,
                lock=self.whatsapp_lock,
                read_json=self.read_json,
                write_json=self.write_json,
                state_file=self.whatsapp_state_file,
                utc_now_iso=self.utc_now_iso,
                classify_error=lambda detail: support_registry.channel_support_service().classify_error(detail),
                normalize_workspace_id=self.normalize_workspace_id,
                load_vault=self.load_vault,
                workspace_visible=self.workspace_visible,
                connector_paused=lambda item: runtime_registry.connector_support_service().connector_paused(item),
                resolve_vault_credential=self.resolve_vault_credential,
                enabled=self.whatsapp_enabled,
                default_profile=self.whatsapp_default_profile,
                require_prefix=self.whatsapp_require_prefix,
                prefix=self.whatsapp_prefix,
                run_timeout_seconds=self.whatsapp_run_timeout_seconds,
                max_reply_chars=self.whatsapp_max_reply_chars,
                send_ack=self.whatsapp_send_ack,
                include_run_meta=lambda: support_registry.channel_support_service().include_run_meta(),
                truncate_one_line=lambda text, limit: support_registry.channel_support_service().truncate_one_line(text, limit),
                poll_run_terminal_result=lambda run_id, max_reply_chars=None: self.telegram_service_registry().telegram_run_dispatch_service().poll_run_terminal_result(
                    run_id,
                    max_reply_chars=max_reply_chars,
                ),
                run_reply_text=lambda status, run_id, summary: self.telegram_service_registry().telegram_run_dispatch_service().run_reply_text(
                    status,
                    run_id,
                    summary,
                ),
                emit_channel_run_delivery_event=outbox_service.emit_channel_run_delivery_event,
                append_dead_letter=lambda **kwargs: event_bridge.append_channel_dead_letter(**kwargs),
                record_channel_event=lambda **kwargs: event_bridge.record_channel_event(**kwargs),
                log_error=lambda message: print(f"[whatsapp-autopilot {self.utc_now_iso()}] {message}", flush=True),
                safe_path_token=self.safe_path_token,
                resolve_profile=lambda entry: support_registry.profile_service().resolve_whatsapp_profile(entry),
                route_message=lambda body, profile: helper_registry.routing_service().route_message(body, profile),
                help_text=lambda profile: support_registry.profile_service().whatsapp_help_text(profile),
                runtime_status_text=lambda workspace_id: support_registry.runtime_status_service().runtime_status_text(workspace_id),
                approvals_list=lambda limit, workspace_id=None: support_registry.approval_service().approvals_list(
                    limit=limit,
                    workspace_id=workspace_id,
                ),
                approvals_text=lambda payload, prefix: support_registry.approval_service().approvals_text(payload, prefix=prefix),
                approval_resolve=lambda event_id, approved, note, workspace_id=None: support_registry.approval_service().approval_resolve(
                    event_id=event_id,
                    approved=approved,
                    note=note,
                    workspace_id=workspace_id,
                ),
                approval_result_text=lambda payload, approved: support_registry.approval_service().approval_result_text(
                    payload,
                    approved=approved,
                ),
                create_run=lambda **kwargs: runtime_registry.run_entry_service().create_whatsapp_run(
                    **kwargs,
                    trust_mode_value=self.whatsapp_trust_mode_value,
                    execution_target_value=self.whatsapp_execution_target_value,
                ),
                session_key_builder=lambda inbound_from, inbound_to: support_registry.channel_support_service().whatsapp_session_key(
                    inbound_from,
                    inbound_to,
                ),
                default_chat_prefix=self.default_chat_prefix,
                require_explicit_opt_in=self.whatsapp_require_explicit_opt_in,
                redact_event_text=self.whatsapp_redact_event_text,
                retention_days=self.whatsapp_retention_days,
            )
        return self._whatsapp_service_registry
