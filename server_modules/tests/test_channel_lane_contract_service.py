import unittest

from server_modules import channel_lane_contract_service as service
from server_modules import routes_connectors, routes_personal_channels


class ChannelLaneContractServiceTests(unittest.TestCase):
    def test_personal_and_studio_routes_stay_in_separate_prefixes(self) -> None:
        personal_paths = {route.path for route in routes_personal_channels.router.routes}
        connector_paths = {route.path for route in routes_connectors.router.routes}

        self.assertTrue(personal_paths)
        self.assertTrue(connector_paths)
        self.assertTrue(all(service.is_personal_route_path(path) for path in personal_paths))
        self.assertFalse(any(service.is_personal_route_path(path) for path in connector_paths))

        webhook_paths = {
            "/channels/whatsapp/twilio/webhook",
            "/channels/telegram/webhook/{connector_id}",
            "/channels/slack/events",
            "/channels/github/webhook",
            "/connectors/discord/webhook",
        }
        self.assertTrue(webhook_paths.issubset(connector_paths))

    def test_build_personal_runtime_context_blocks_studio_session_fields(self) -> None:
        runtime_context = service.build_personal_gateway_runtime_context(
            surface_channel="whatsapp_personal",
            workspace_id="workspace-1",
            gateway_id="gateway-1",
            remote_jid="user-1",
        )

        self.assertEqual(runtime_context["availability"]["runtime_lane"], service.PERSONAL_GATEWAY_RUNTIME_LANE)
        self.assertEqual(runtime_context["session_ctx"]["memory_surface"], service.DIRECT_CHAT_MEMORY_SURFACE)

        with self.assertRaisesRegex(ValueError, "Studio deployment state"):
            service.assert_personal_runtime_session_ctx(
                {
                    **runtime_context["session_ctx"],
                    "responder_install_id": "install-studio-1",
                }
            )

    def test_personal_provider_contract_rejects_connector_provider(self) -> None:
        with self.assertRaisesRegex(ValueError, "mismatched personal provider"):
            service.assert_personal_gateway_channel("whatsapp_personal", "twilio_whatsapp")

    def test_studio_webhook_contract_rejects_personal_route_path(self) -> None:
        with self.assertRaisesRegex(ValueError, "outside the Studio connector lane"):
            service.assert_public_studio_webhook_path("/personal-channels/whatsapp/gateways/gateway-1")

    def test_channel_catalog_keeps_personal_priority_and_studio_boundary(self) -> None:
        personal_catalog = service.personal_channel_catalog()
        studio_catalog = service.studio_channel_catalog()

        self.assertEqual(
            [entry["channel_key"] for entry in personal_catalog],
            ["telegram_personal", "whatsapp_personal", "signal_personal", "imessage_personal", "wechat_personal"],
        )
        self.assertEqual(
            [entry["stage"] for entry in personal_catalog],
            ["live", "live", "live", "live", "live"],
        )
        self.assertTrue(
            all(entry["runtime_lane"] == service.PERSONAL_GATEWAY_RUNTIME_LANE for entry in personal_catalog)
        )
        self.assertEqual(
            [entry["live_capable"] for entry in personal_catalog],
            ["true", "true", "true", "true", "true"],
        )

        self.assertEqual(
            [entry["channel_key"] for entry in studio_catalog],
            ["web_chat", "email", "telegram_bot", "whatsapp_twilio", "slack", "discord_bot"],
        )
        by_key = {entry["channel_key"]: entry for entry in studio_catalog}
        self.assertEqual(by_key["web_chat"]["status"], "roadmap")
        self.assertEqual(by_key["email"]["status"], "partial")
        self.assertEqual(by_key["telegram_bot"]["status"], "working_when_configured")
        self.assertEqual(by_key["whatsapp_twilio"]["status"], "out_of_scope")
        self.assertEqual(by_key["slack"]["status"], "partial")
        self.assertEqual(by_key["discord_bot"]["status"], "roadmap")
        self.assertEqual(by_key["telegram_bot"]["launch_allowed"], "true")
        self.assertTrue(
            all(
                entry["launch_allowed"] == "false"
                for entry in studio_catalog
                if entry["channel_key"] != "telegram_bot"
            )
        )
        self.assertTrue(
            all(entry["runtime_lane"] == service.STUDIO_CONNECTOR_RUNTIME_LANE for entry in studio_catalog)
        )

    def test_discord_is_not_accepted_as_personal_channel(self) -> None:
        self.assertFalse(service.is_personal_channel_key("discord_bot"))

        with self.assertRaisesRegex(ValueError, "non-personal channel"):
            service.assert_personal_gateway_channel("discord_bot", "discord_webhook")

    def test_platform_channel_catalog_keeps_business_and_personal_lanes_explicit(self) -> None:
        catalog = service.platform_channel_catalog()
        by_key = {entry["channel_key"]: entry for entry in catalog}

        self.assertEqual(len(catalog), 18)
        self.assertEqual(by_key["telegram_bot"]["binding_channel_key"], "telegram")
        self.assertEqual(by_key["telegram_bot"]["runtime_lane"], service.STUDIO_CONNECTOR_RUNTIME_LANE)
        self.assertEqual(by_key["telegram_personal"]["runtime_lane"], service.PERSONAL_GATEWAY_RUNTIME_LANE)
        self.assertTrue(by_key["telegram_personal"]["requires_agent_computer"])
        self.assertEqual(by_key["telegram_personal"]["surface_kind"], "messaging_channel")
        self.assertEqual(by_key["telegram_personal"]["product_surface"], "personal_messaging")
        self.assertEqual(by_key["telegram_personal"]["navigation_group"], "personal_messaging")
        self.assertEqual(by_key["telegram_personal"]["ownership_boundary"], "agent_computer")
        self.assertEqual(by_key["whatsapp_personal"]["surface_support"], ["sage"])
        self.assertEqual(by_key["signal_personal"]["status"], "agent_computer_bridge")
        self.assertEqual(by_key["imessage_personal"]["provider"], "bluebubbles_local_bridge")
        self.assertFalse(by_key["wechat_personal"]["launch_allowed"])
        self.assertEqual(by_key["github"]["category"], "work_system")
        self.assertEqual(by_key["github"]["surface_kind"], "connected_app")
        self.assertEqual(by_key["github"]["product_surface"], "connected_app")
        self.assertEqual(by_key["github"]["extension_kind"], "app_connector")
        self.assertEqual(by_key["telegram_bot"]["surface_kind"], "messaging_channel")
        self.assertEqual(by_key["telegram_bot"]["product_surface"], "business_channel")

        reserved = {entry["channel_key"] for entry in service.reserved_private_runtime_channel_catalog()}
        self.assertFalse({"imessage_personal", "signal_personal", "wechat_personal"} & reserved)
        self.assertTrue({"voice_wake", "mobile_nodes", "plugin_marketplace"}.issubset(reserved))

    def test_reserved_personal_specs_stay_on_personal_gateway_lane(self) -> None:
        for channel_key, provider in (
            ("signal_personal", "signal_local_bridge"),
            ("imessage_personal", "bluebubbles_local_bridge"),
            ("wechat_personal", "wechat_local_bridge"),
        ):
            spec = service.assert_personal_gateway_channel(channel_key, provider)

            self.assertEqual(spec["runtime_lane"], service.PERSONAL_GATEWAY_RUNTIME_LANE)
            self.assertEqual(spec["memory_surface"], service.DIRECT_CHAT_MEMORY_SURFACE)
            self.assertEqual(spec["live_capable"], "true")

    def test_agent_computer_bridge_channels_pass_personal_preflight(self) -> None:
        for channel_key in ("signal_personal", "imessage_personal", "wechat_personal"):
            preflight = service.personal_bridge_preflight(channel_key)

            self.assertEqual(preflight["status"], "pass")
            self.assertTrue(preflight["launch_allowed"])
            self.assertEqual(preflight["reason"], "live_personal_gateway_runtime")

        telegram_preflight = service.personal_bridge_preflight("telegram_personal")
        self.assertEqual(telegram_preflight["status"], "pass")
        self.assertTrue(telegram_preflight["launch_allowed"])


if __name__ == "__main__":
    unittest.main()
