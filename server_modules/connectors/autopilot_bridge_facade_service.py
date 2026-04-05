from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from server_modules.connectors.autopilot_bridge_registry_service import AutopilotBridgeRegistryService


class AutopilotBridgeFacadeService:
    def __init__(
        self,
        *,
        normalize_workspace_id: Callable[[Any], str],
        append_channel_event: Callable[..., Any],
        utc_now_iso: Callable[[], str],
        truncate_one_line: Callable[[str, int], str],
        json_safe: Callable[[Any], Any],
        dead_letter_lock: Any,
        read_dead_letter_json: Callable[[Any, Any], Dict[str, Any]],
        write_dead_letter_json: Callable[[Any, Dict[str, Any]], Any],
        dead_letter_file: Any,
        dead_letter_limit: int,
        collapse_whitespace: Callable[[str], str],
        telegram_workspace_id: str,
        whatsapp_workspace_id: str,
        telegram_service_registry: Callable[[], Any],
        whatsapp_service_registry: Callable[[], Any],
        autopilot_profile_service: Callable[[], Any],
        init_runtime: Callable[[], None],
        telegram_terminal_service: Callable[[], Any],
        telegram_enabled_getter: Callable[[], bool],
        telegram_default_profile_getter: Callable[[], str],
        telegram_catalog_getter: Callable[[], Dict[str, Any]],
        whatsapp_enabled_getter: Callable[[], bool],
        whatsapp_default_profile_getter: Callable[[], str],
        whatsapp_catalog_getter: Callable[[], Dict[str, Any]],
        telegram_state_getter: Callable[[], Dict[str, Any]],
        telegram_lock_getter: Callable[[], Any],
        safe_path_token: Callable[[Any], str],
        build_goal_with_profile: Callable[[str, Dict[str, str]], str],
        workspace_connector_context: Callable[[str, str, str], Dict[str, Any]],
        extract_message: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]],
        build_goal_with_attachments: Callable[[str, Any], str],
        route_message: Callable[[str, Dict[str, Any]], Dict[str, Any]],
        parse_form_urlencoded: Callable[[bytes], Dict[str, str]],
        forbidden_response: Callable[[str], Any],
        webhook_enabled_getter: Callable[[], bool],
        configured_webhook_secret_getter: Callable[[], str],
        bridge_registry_class: Callable[..., Any] = AutopilotBridgeRegistryService,
    ) -> None:
        self.normalize_workspace_id = normalize_workspace_id
        self.append_channel_event = append_channel_event
        self.utc_now_iso = utc_now_iso
        self.truncate_one_line = truncate_one_line
        self.json_safe = json_safe
        self.dead_letter_lock = dead_letter_lock
        self.read_dead_letter_json = read_dead_letter_json
        self.write_dead_letter_json = write_dead_letter_json
        self.dead_letter_file = dead_letter_file
        self.dead_letter_limit = int(dead_letter_limit or 0)
        self.collapse_whitespace = collapse_whitespace
        self.telegram_workspace_id = str(telegram_workspace_id or "default")
        self.whatsapp_workspace_id = str(whatsapp_workspace_id or "default")
        self.telegram_service_registry = telegram_service_registry
        self.whatsapp_service_registry = whatsapp_service_registry
        self.autopilot_profile_service = autopilot_profile_service
        self.init_runtime = init_runtime
        self.telegram_terminal_service = telegram_terminal_service
        self.telegram_enabled_getter = telegram_enabled_getter
        self.telegram_default_profile_getter = telegram_default_profile_getter
        self.telegram_catalog_getter = telegram_catalog_getter
        self.whatsapp_enabled_getter = whatsapp_enabled_getter
        self.whatsapp_default_profile_getter = whatsapp_default_profile_getter
        self.whatsapp_catalog_getter = whatsapp_catalog_getter
        self.telegram_state_getter = telegram_state_getter
        self.telegram_lock_getter = telegram_lock_getter
        self.safe_path_token = safe_path_token
        self.build_goal_with_profile = build_goal_with_profile
        self.workspace_connector_context = workspace_connector_context
        self.extract_message = extract_message
        self.build_goal_with_attachments = build_goal_with_attachments
        self.route_message = route_message
        self.parse_form_urlencoded = parse_form_urlencoded
        self.forbidden_response = forbidden_response
        self.webhook_enabled_getter = webhook_enabled_getter
        self.configured_webhook_secret_getter = configured_webhook_secret_getter
        self.bridge_registry_class = bridge_registry_class

        self._bridge_registry: Optional[Any] = None

    def bridge_registry_service(self) -> Any:
        if self._bridge_registry is None:
            self._bridge_registry = self.bridge_registry_class(
                normalize_workspace_id=self.normalize_workspace_id,
                append_channel_event=self.append_channel_event,
                utc_now_iso=self.utc_now_iso,
                truncate_one_line=self.truncate_one_line,
                json_safe=self.json_safe,
                dead_letter_lock=self.dead_letter_lock,
                read_dead_letter_json=self.read_dead_letter_json,
                write_dead_letter_json=self.write_dead_letter_json,
                dead_letter_file=self.dead_letter_file,
                dead_letter_limit=self.dead_letter_limit,
                collapse_whitespace=self.collapse_whitespace,
                telegram_snapshot=lambda: self.telegram_service_registry().telegram_autopilot_state_service().snapshot(include_connectors=True),
                telegram_list_entries=lambda: self.telegram_service_registry().telegram_autopilot_state_service().list_connector_entries(
                    self.telegram_workspace_id
                ),
                resolve_telegram_profile=lambda entry: self.autopilot_profile_service().resolve_telegram_profile(entry),
                whatsapp_snapshot=lambda: self.whatsapp_service_registry().whatsapp_autopilot_state_service().snapshot(include_connectors=True),
                whatsapp_list_entries=lambda: self.whatsapp_service_registry().whatsapp_autopilot_state_service().list_connector_entries(
                    self.whatsapp_workspace_id
                ),
                resolve_whatsapp_profile=lambda entry: self.autopilot_profile_service().resolve_whatsapp_profile(entry),
                init_runtime=self.init_runtime,
                event_service=self.autopilot_event_service,
                telegram_terminal_service=self.telegram_terminal_service,
                telegram_supervisor_service=lambda: self.telegram_service_registry().telegram_autopilot_supervisor_service(),
                autopilot_status_service=self.autopilot_status_service,
                autopilot_endpoint_service=self.autopilot_endpoint_service,
                telegram_enabled=self.telegram_enabled_getter(),
                telegram_default_profile=self.telegram_default_profile_getter(),
                telegram_catalog=self.telegram_catalog_getter(),
                whatsapp_enabled=self.whatsapp_enabled_getter(),
                whatsapp_default_profile=self.whatsapp_default_profile_getter(),
                whatsapp_catalog=self.whatsapp_catalog_getter(),
                whatsapp_webhook_path="/channels/whatsapp/twilio/webhook",
                telegram_state_service=lambda: self.telegram_service_registry().telegram_autopilot_state_service(),
                whatsapp_state_service=lambda: self.whatsapp_service_registry().whatsapp_autopilot_state_service(),
                telegram_runtime_service=lambda: self.telegram_service_registry().telegram_autopilot_runtime_service(),
                telegram_state=self.telegram_state_getter() or {},
                telegram_lock=self.telegram_lock_getter(),
                safe_path_token=self.safe_path_token,
                build_goal_with_profile=self.build_goal_with_profile,
                workspace_connector_context=self.workspace_connector_context,
                extract_message=self.extract_message,
                build_goal_with_attachments=self.build_goal_with_attachments,
                route_message=self.route_message,
                parse_form_urlencoded=self.parse_form_urlencoded,
                webhook_result=lambda **kwargs: self.autopilot_endpoint_service().whatsapp_webhook_result(**kwargs),
                handle_inbound=lambda payload: self.whatsapp_service_registry().whatsapp_webhook_service().handle_inbound(payload),
                twiml_response=lambda text: self.whatsapp_service_registry().whatsapp_transport_service().twiml_response(text),
                forbidden_response=self.forbidden_response,
                webhook_enabled=self.webhook_enabled_getter(),
                configured_webhook_secret=self.configured_webhook_secret_getter(),
            )
        return self._bridge_registry

    def shared_service_registry(self) -> Any:
        return self.bridge_registry_service().shared_service_registry()

    def autopilot_status_service(self) -> Any:
        return self.shared_service_registry().autopilot_status_service()

    def autopilot_endpoint_service(self) -> Any:
        return self.shared_service_registry().autopilot_endpoint_service()

    def autopilot_event_service(self) -> Any:
        return self.shared_service_registry().autopilot_event_service()

    def event_bridge_service(self) -> Any:
        return self.bridge_registry_service().event_bridge_service()

    def terminal_bridge_service(self) -> Any:
        return self.bridge_registry_service().terminal_bridge_service()

    def state_bridge_service(self) -> Any:
        return self.bridge_registry_service().state_bridge_service()

    def compatibility_bridge_service(self) -> Any:
        return self.bridge_registry_service().compatibility_bridge_service()

    def webhook_bridge_service(self) -> Any:
        return self.bridge_registry_service().webhook_bridge_service()
