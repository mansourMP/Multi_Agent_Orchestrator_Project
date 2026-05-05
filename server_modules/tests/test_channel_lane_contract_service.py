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
            ["telegram_personal", "whatsapp_personal", "signal_personal", "imessage_personal"],
        )
        self.assertEqual(
            [entry["stage"] for entry in personal_catalog],
            ["live", "live", "next", "later"],
        )
        self.assertTrue(
            all(entry["runtime_lane"] == service.PERSONAL_GATEWAY_RUNTIME_LANE for entry in personal_catalog)
        )

        self.assertEqual(
            [entry["channel_key"] for entry in studio_catalog],
            ["telegram_bot", "whatsapp_twilio", "discord_bot"],
        )
        self.assertEqual(studio_catalog[0]["stage"], "live")
        self.assertEqual(studio_catalog[1]["stage"], "live")
        self.assertEqual(studio_catalog[2]["stage"], "deferred")
        self.assertTrue(
            all(entry["runtime_lane"] == service.STUDIO_CONNECTOR_RUNTIME_LANE for entry in studio_catalog)
        )


if __name__ == "__main__":
    unittest.main()
