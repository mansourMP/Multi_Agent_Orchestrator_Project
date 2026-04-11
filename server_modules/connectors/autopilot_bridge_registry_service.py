from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from server_modules.connectors.autopilot_event_bridge_service import AutopilotEventBridgeService
from server_modules.connectors.autopilot_shared_service_registry import AutopilotSharedServiceRegistry
from server_modules.connectors.autopilot_state_bridge_service import AutopilotStateBridgeService
from server_modules.connectors.autopilot_terminal_bridge_service import AutopilotTerminalBridgeService
from server_modules.connectors.telegram_compatibility_bridge_service import TelegramCompatibilityBridgeService
from server_modules.connectors.telegram_webhook_bridge_service import TelegramWebhookBridgeService
from server_modules.connectors.whatsapp_webhook_bridge_service import WhatsAppWebhookBridgeService


class AutopilotBridgeRegistryService:
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
        telegram_snapshot: Callable[[], Dict[str, Any]],
        telegram_list_entries: Callable[[], Any],
        resolve_telegram_profile: Callable[[Dict[str, Any]], Dict[str, Any]],
        telegram_webhook_path: str,
        telegram_public_base_url: str,
        telegram_webhook_secret_configured: bool,
        telegram_delivery_mode: str,
        whatsapp_snapshot: Callable[[], Dict[str, Any]],
        whatsapp_list_entries: Callable[[], Any],
        resolve_whatsapp_profile: Callable[[Dict[str, Any]], Dict[str, Any]],
        init_runtime: Callable[[], None],
        event_service: Callable[[], Any],
        telegram_terminal_service: Callable[[], Any],
        telegram_supervisor_service: Callable[[], Any],
        autopilot_status_service: Callable[[], Any],
        autopilot_endpoint_service: Callable[[], Any],
        telegram_enabled: bool,
        telegram_default_profile: str,
        telegram_catalog: Dict[str, Any],
        whatsapp_enabled: bool,
        whatsapp_default_profile: str,
        whatsapp_catalog: Dict[str, Any],
        whatsapp_webhook_path: str,
        whatsapp_public_base_url: str,
        whatsapp_webhook_secret_configured: bool,
        telegram_state_service: Callable[[], Any],
        whatsapp_state_service: Callable[[], Any],
        telegram_runtime_service: Callable[[], Any],
        telegram_state: Dict[str, Any],
        telegram_lock: Any,
        safe_path_token: Callable[[Any], str],
        build_goal_with_profile: Callable[[str, Dict[str, str]], str],
        workspace_connector_context: Callable[[str, str, str], Dict[str, Any]],
        extract_message: Callable[[Dict[str, Any]], Optional[Dict[str, Any]]],
        build_goal_with_attachments: Callable[[str, Any], str],
        route_message: Callable[[str, Dict[str, Any]], Dict[str, Any]],
        telegram_parse_update: Callable[[bytes], Dict[str, Any]],
        telegram_webhook_auth_result: Callable[..., Dict[str, Any]],
        telegram_handle_inbound: Callable[[str, Dict[str, Any]], Any],
        parse_form_urlencoded: Callable[[bytes], Dict[str, str]],
        webhook_auth_result: Callable[..., Dict[str, Any]],
        resolve_inbound_connector: Callable[[Dict[str, str]], Any],
        validate_webhook_signature: Callable[[str, Dict[str, str], str, str], bool],
        handle_inbound: Callable[[Dict[str, str], Optional[Dict[str, Any]]], Any],
        twiml_response: Callable[[str], Any],
        error_response: Callable[[int, str], Any],
        telegram_webhook_enabled: bool,
        telegram_configured_webhook_secret: str,
        webhook_enabled: bool,
        configured_webhook_secret: str,
        shared_registry_class: Callable[..., Any] = AutopilotSharedServiceRegistry,
        event_bridge_class: Callable[..., Any] = AutopilotEventBridgeService,
        terminal_bridge_class: Callable[..., Any] = AutopilotTerminalBridgeService,
        state_bridge_class: Callable[..., Any] = AutopilotStateBridgeService,
        compatibility_bridge_class: Callable[..., Any] = TelegramCompatibilityBridgeService,
        telegram_webhook_bridge_class: Callable[..., Any] = TelegramWebhookBridgeService,
        webhook_bridge_class: Callable[..., Any] = WhatsAppWebhookBridgeService,
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
        self.telegram_snapshot = telegram_snapshot
        self.telegram_list_entries = telegram_list_entries
        self.resolve_telegram_profile = resolve_telegram_profile
        self.telegram_webhook_path = str(telegram_webhook_path or "/channels/telegram/webhook/{connector_id}")
        self.telegram_public_base_url = str(telegram_public_base_url or "")
        self.telegram_webhook_secret_configured = bool(telegram_webhook_secret_configured)
        self.telegram_delivery_mode = str(telegram_delivery_mode or "").strip().lower() or "polling"
        self.whatsapp_snapshot = whatsapp_snapshot
        self.whatsapp_list_entries = whatsapp_list_entries
        self.resolve_whatsapp_profile = resolve_whatsapp_profile
        self.init_runtime = init_runtime
        self.event_service = event_service
        self.telegram_terminal_service = telegram_terminal_service
        self.telegram_supervisor_service = telegram_supervisor_service
        self.autopilot_status_service = autopilot_status_service
        self.autopilot_endpoint_service = autopilot_endpoint_service
        self.telegram_enabled = bool(telegram_enabled)
        self.telegram_default_profile = str(telegram_default_profile or "")
        self.telegram_catalog = telegram_catalog
        self.whatsapp_enabled = bool(whatsapp_enabled)
        self.whatsapp_default_profile = str(whatsapp_default_profile or "")
        self.whatsapp_catalog = whatsapp_catalog
        self.whatsapp_webhook_path = str(whatsapp_webhook_path or "")
        self.whatsapp_public_base_url = str(whatsapp_public_base_url or "")
        self.whatsapp_webhook_secret_configured = bool(whatsapp_webhook_secret_configured)
        self.telegram_state_service = telegram_state_service
        self.whatsapp_state_service = whatsapp_state_service
        self.telegram_runtime_service = telegram_runtime_service
        self.telegram_state = telegram_state
        self.telegram_lock = telegram_lock
        self.safe_path_token = safe_path_token
        self.build_goal_with_profile = build_goal_with_profile
        self.workspace_connector_context = workspace_connector_context
        self.extract_message = extract_message
        self.build_goal_with_attachments = build_goal_with_attachments
        self.route_message = route_message
        self.telegram_parse_update = telegram_parse_update
        self.telegram_webhook_auth_result = telegram_webhook_auth_result
        self.telegram_handle_inbound = telegram_handle_inbound
        self.parse_form_urlencoded = parse_form_urlencoded
        self.webhook_auth_result = webhook_auth_result
        self.resolve_inbound_connector = resolve_inbound_connector
        self.validate_webhook_signature = validate_webhook_signature
        self.handle_inbound = handle_inbound
        self.twiml_response = twiml_response
        self.error_response = error_response
        self.telegram_webhook_enabled = bool(telegram_webhook_enabled)
        self.telegram_configured_webhook_secret = str(telegram_configured_webhook_secret or "")
        self.webhook_enabled = bool(webhook_enabled)
        self.configured_webhook_secret = str(configured_webhook_secret or "")
        self.shared_registry_class = shared_registry_class
        self.event_bridge_class = event_bridge_class
        self.terminal_bridge_class = terminal_bridge_class
        self.state_bridge_class = state_bridge_class
        self.compatibility_bridge_class = compatibility_bridge_class
        self.telegram_webhook_bridge_class = telegram_webhook_bridge_class
        self.webhook_bridge_class = webhook_bridge_class

        self._shared_service_registry: Optional[Any] = None
        self._event_bridge_service: Optional[Any] = None
        self._terminal_bridge_service: Optional[Any] = None
        self._state_bridge_service: Optional[Any] = None
        self._compatibility_bridge_service: Optional[Any] = None
        self._telegram_webhook_bridge_service: Optional[Any] = None
        self._webhook_bridge_service: Optional[Any] = None

    def shared_service_registry(self) -> Any:
        if self._shared_service_registry is None:
            self._shared_service_registry = self.shared_registry_class(
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
                telegram_snapshot=self.telegram_snapshot,
                telegram_list_entries=self.telegram_list_entries,
                resolve_telegram_profile=self.resolve_telegram_profile,
                telegram_webhook_path=self.telegram_webhook_path,
                telegram_public_base_url=self.telegram_public_base_url,
                telegram_webhook_secret_configured=self.telegram_webhook_secret_configured,
                telegram_delivery_mode=self.telegram_delivery_mode,
                whatsapp_snapshot=self.whatsapp_snapshot,
                whatsapp_list_entries=self.whatsapp_list_entries,
                resolve_whatsapp_profile=self.resolve_whatsapp_profile,
                whatsapp_webhook_path=self.whatsapp_webhook_path,
                whatsapp_public_base_url=self.whatsapp_public_base_url,
                whatsapp_webhook_secret_configured=self.whatsapp_webhook_secret_configured,
            )
        return self._shared_service_registry

    def event_bridge_service(self) -> Any:
        if self._event_bridge_service is None:
            self._event_bridge_service = self.event_bridge_class(
                init_runtime=self.init_runtime,
                event_service=self.event_service,
            )
        return self._event_bridge_service

    def terminal_bridge_service(self) -> Any:
        if self._terminal_bridge_service is None:
            self._terminal_bridge_service = self.terminal_bridge_class(
                init_runtime=self.init_runtime,
                telegram_terminal_service=self.telegram_terminal_service,
                telegram_supervisor_service=self.telegram_supervisor_service,
                autopilot_status_service=self.autopilot_status_service,
                autopilot_endpoint_service=self.autopilot_endpoint_service,
                telegram_enabled=self.telegram_enabled,
                telegram_default_profile=self.telegram_default_profile,
                telegram_catalog=self.telegram_catalog,
                telegram_webhook_path=self.telegram_webhook_path,
                whatsapp_enabled=self.whatsapp_enabled,
                whatsapp_default_profile=self.whatsapp_default_profile,
                whatsapp_catalog=self.whatsapp_catalog,
                whatsapp_webhook_path=self.whatsapp_webhook_path,
            )
        return self._terminal_bridge_service

    def state_bridge_service(self) -> Any:
        if self._state_bridge_service is None:
            self._state_bridge_service = self.state_bridge_class(
                telegram_state_service=self.telegram_state_service,
                whatsapp_state_service=self.whatsapp_state_service,
                telegram_runtime_service=self.telegram_runtime_service,
                telegram_state=self.telegram_state,
                telegram_lock=self.telegram_lock,
            )
        return self._state_bridge_service

    def compatibility_bridge_service(self) -> Any:
        if self._compatibility_bridge_service is None:
            self._compatibility_bridge_service = self.compatibility_bridge_class(
                safe_path_token=self.safe_path_token,
                build_goal_with_profile=self.build_goal_with_profile,
                workspace_connector_context=self.workspace_connector_context,
                extract_message=self.extract_message,
                build_goal_with_attachments=self.build_goal_with_attachments,
                route_message=self.route_message,
            )
        return self._compatibility_bridge_service

    def telegram_webhook_bridge_service(self) -> Any:
        if self._telegram_webhook_bridge_service is None:
            self._telegram_webhook_bridge_service = self.telegram_webhook_bridge_class(
                init_runtime=self.init_runtime,
                parse_update=self.telegram_parse_update,
                webhook_auth_result=self.telegram_webhook_auth_result,
                handle_inbound=self.telegram_handle_inbound,
                error_response=self.error_response,
                enabled=self.telegram_webhook_enabled,
                delivery_mode=self.telegram_delivery_mode,
                configured_secret=self.telegram_configured_webhook_secret,
            )
        return self._telegram_webhook_bridge_service

    def webhook_bridge_service(self) -> Any:
        if self._webhook_bridge_service is None:
            self._webhook_bridge_service = self.webhook_bridge_class(
                init_runtime=self.init_runtime,
                parse_form_urlencoded=self.parse_form_urlencoded,
                webhook_auth_result=self.webhook_auth_result,
                resolve_inbound_connector=self.resolve_inbound_connector,
                validate_signature=self.validate_webhook_signature,
                handle_inbound=self.handle_inbound,
                twiml_response=self.twiml_response,
                error_response=self.error_response,
                enabled=self.webhook_enabled,
                configured_secret=self.configured_webhook_secret,
            )
        return self._webhook_bridge_service
