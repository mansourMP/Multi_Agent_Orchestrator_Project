from __future__ import annotations

from typing import Any, Dict


class AutopilotConnectorExportFacade:
    def __init__(self, *, global_namespace: Dict[str, Any]) -> None:
        self.global_namespace = global_namespace

    def _g(self, name: str) -> Any:
        return self.global_namespace[name]

    def _shell(self) -> Any:
        return self._g("_autopilot_connector_shell_service")()

    def _registry_facade(self) -> Any:
        return self._shell().registry_facade_service()

    def _bridge_facade(self) -> Any:
        return self._shell().bridge_facade_service()

    def _runtime_facade(self) -> Any:
        return self._shell().runtime_facade_service()

    @staticmethod
    def _forward_kwargs(payload: Dict[str, Any]) -> Dict[str, Any]:
        kwargs = dict(payload)
        kwargs.pop("self", None)
        return kwargs

    def autopilot_channel_registry_bridge_service(self) -> Any:
        return self._registry_facade().channel_registry_bridge_service()

    def telegram_service_registry(self) -> Any:
        return self._registry_facade().telegram_service_registry()

    def telegram_helper_registry_bridge_service(self) -> Any:
        return self._registry_facade().helper_registry_bridge_service()

    def telegram_helper_registry(self) -> Any:
        return self._registry_facade().telegram_helper_registry()

    def telegram_run_dispatch_service(self) -> Any:
        return self.telegram_service_registry().telegram_run_dispatch_service()

    def autopilot_support_service_registry(self) -> Any:
        return self._registry_facade().support_service_registry()

    def autopilot_runtime_service_registry(self) -> Any:
        return self._registry_facade().runtime_service_registry()

    def autopilot_shared_service_registry(self) -> Any:
        return self._bridge_facade().shared_service_registry()

    def autopilot_status_service(self) -> Any:
        return self._bridge_facade().autopilot_status_service()

    def autopilot_endpoint_service(self) -> Any:
        return self._bridge_facade().autopilot_endpoint_service()

    def autopilot_event_service(self) -> Any:
        return self._bridge_facade().autopilot_event_service()

    def whatsapp_service_registry(self) -> Any:
        return self.autopilot_channel_registry_bridge_service().whatsapp_service_registry()

    def autopilot_profile_service(self) -> Any:
        return self.autopilot_support_service_registry().profile_service()

    def telegram_connector_support_service(self) -> Any:
        return self.autopilot_runtime_service_registry().connector_support_service()

    def runtime_status_service(self) -> Any:
        return self.autopilot_support_service_registry().runtime_status_service()

    def autopilot_workflow_setup_service(self) -> Any:
        return self.autopilot_support_service_registry().workflow_setup_service()

    def telegram_connector_context_service(self) -> Any:
        return self.autopilot_support_service_registry().connector_context_service()

    def autopilot_approval_service(self) -> Any:
        return self.autopilot_support_service_registry().approval_service()

    def telegram_transport_service(self) -> Any:
        return self.autopilot_runtime_service_registry().transport_service()

    def telegram_terminal_service(self) -> Any:
        return self.autopilot_runtime_service_registry().terminal_service()

    def autopilot_common_support_service(self) -> Any:
        return self.autopilot_support_service_registry().common_support_service()

    def autopilot_run_entry_service(self) -> Any:
        return self.autopilot_runtime_service_registry().run_entry_service()

    def autopilot_runtime_support_service(self) -> Any:
        return self.autopilot_runtime_service_registry().runtime_support_service()

    def autopilot_skill_service(self) -> Any:
        return self.autopilot_support_service_registry().skill_service()

    def autopilot_channel_support_service(self) -> Any:
        return self.autopilot_support_service_registry().channel_support_service()

    def autopilot_event_bridge_service(self) -> Any:
        return self._bridge_facade().event_bridge_service()

    def autopilot_terminal_bridge_service(self) -> Any:
        return self._bridge_facade().terminal_bridge_service()

    def autopilot_state_bridge_service(self) -> Any:
        return self._bridge_facade().state_bridge_service()

    def telegram_compatibility_bridge_service(self) -> Any:
        return self._bridge_facade().compatibility_bridge_service()

    def whatsapp_webhook_bridge_service(self) -> Any:
        return self._bridge_facade().webhook_bridge_service()

    def load_telegram_autopilot_state(self) -> None:
        self._runtime_facade().load_telegram_autopilot_state()

    def load_whatsapp_autopilot_state(self) -> None:
        self._runtime_facade().load_whatsapp_autopilot_state()

    def telegram_autopilot_snapshot(self) -> Dict[str, Any]:
        return self._runtime_facade().telegram_autopilot_snapshot()

    def whatsapp_autopilot_snapshot(self) -> Dict[str, Any]:
        return self._runtime_facade().whatsapp_autopilot_snapshot()

    def whatsapp_autopilot_activate(self) -> None:
        self._runtime_facade().whatsapp_autopilot_activate()

    def telegram_increment_processed_updates(self) -> None:
        self._runtime_facade().telegram_increment_processed_updates()

    def telegram_set_connectors_seen(self, count: int) -> None:
        self._runtime_facade().telegram_set_connectors_seen(count)

    def mark_telegram_autopilot_started(self, started_at: str) -> None:
        self._runtime_facade().mark_telegram_autopilot_started(started_at)

    def init_runtime(self) -> None:
        self._runtime_facade().init_runtime()

    def record_channel_event(
        self,
        channel: str,
        direction: str,
        event_type: str,
        text: str = "",
        workspace_id: str | None = None,
        session_key: str | None = None,
        session_id: str | None = None,
        message_id: str | None = None,
        parent_id: str | None = None,
        run_id: str | None = None,
        action: str | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> Dict[str, Any] | None:
        return self._runtime_facade().record_channel_event(**self._forward_kwargs(locals()))

    def append_channel_dead_letter(
        self,
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
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        self._runtime_facade().append_channel_dead_letter(**self._forward_kwargs(locals()))

    def record_channel_event_throttled(
        self,
        *,
        channel: str,
        direction: str,
        event_type: str,
        text: str = "",
        workspace_id: str | None = None,
        session_key: str | None = None,
        session_id: str | None = None,
        message_id: str | None = None,
        parent_id: str | None = None,
        run_id: str | None = None,
        action: str | None = None,
        metadata: Dict[str, Any] | None = None,
        dedupe_seconds: float = 30.0,
    ) -> bool:
        kwargs = self._forward_kwargs(locals())
        kwargs["record_event_func"] = self._g("_record_channel_event")
        return self._runtime_facade().record_channel_event_throttled(**kwargs)

    def telegram_menu_service(self) -> Any:
        return self.autopilot_runtime_service_registry().menu_service()

    def telegram_safe_path_token(self, value: Any) -> str:
        return self.telegram_compatibility_bridge_service().safe_path_token(value)

    def telegram_build_goal_with_profile(self, goal: str, profile_data: Dict[str, str]) -> str:
        return self.telegram_compatibility_bridge_service().build_goal_with_profile(goal, profile_data)

    def telegram_workspace_connector_context(
        self,
        goal: str,
        workspace_id: str,
        current_connector_id: str,
    ) -> Dict[str, Any]:
        return self.telegram_compatibility_bridge_service().workspace_connector_context(
            goal,
            workspace_id,
            current_connector_id,
        )

    def telegram_extract_message(self, update: Dict[str, Any]) -> Dict[str, Any] | None:
        return self.telegram_compatibility_bridge_service().extract_message(update)

    def telegram_build_goal_with_attachments(self, goal: str, attachments: list[Dict[str, Any]]) -> str:
        return self.telegram_compatibility_bridge_service().build_goal_with_attachments(goal, attachments)

    def telegram_route_message(self, raw_text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
        return self.telegram_compatibility_bridge_service().route_message(raw_text, profile)

    async def handle_telegram_send_message(
        self,
        text: str,
        workspace_id: str | None = None,
        session_key: str | None = None,
        chat_id: str | None = None,
    ) -> Dict[str, Any]:
        return await self._runtime_facade().handle_telegram_send_message(**self._forward_kwargs(locals()))

    async def handle_telegram_autopilot_test_message(
        self,
        text: str,
        workspace_id: str | None = None,
        session_key: str | None = None,
        chat_id: str | None = None,
        connector_id: str | None = None,
        sender_id: str | None = None,
        timeout_seconds: int | None = None,
    ) -> Dict[str, Any]:
        return await self._runtime_facade().handle_telegram_autopilot_test_message(**self._forward_kwargs(locals()))

    async def handle_whatsapp_twilio_webhook(self, request: Any) -> Any:
        return await self._runtime_facade().handle_whatsapp_webhook(
            raw_body=await request.body(),
            query_secret=str(request.query_params.get("secret") or ""),
            header_secret=str(request.headers.get("x-orion-webhook-secret") or ""),
        )

    def run_telegram_autopilot_forever(self) -> None:
        self._runtime_facade().run_telegram_autopilot_forever()

    async def handle_telegram_autopilot_status(self) -> Any:
        return await self._runtime_facade().telegram_status_payload()

    async def handle_whatsapp_autopilot_status(self) -> Any:
        return await self._runtime_facade().whatsapp_status_payload()

    async def handle_list_autopilot_profiles(self) -> Any:
        return await self._runtime_facade().autopilot_profiles_payload()
