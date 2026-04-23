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


if __name__ == "__main__":
    unittest.main()
