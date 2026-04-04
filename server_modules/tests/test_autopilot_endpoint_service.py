import unittest

from server_modules.connectors.autopilot_endpoint_service import AutopilotEndpointService


class AutopilotEndpointServiceTests(unittest.TestCase):
    def test_autopilot_profiles_payload_shapes_both_channels(self) -> None:
        service = AutopilotEndpointService()
        payload = service.autopilot_profiles_payload(
            telegram_enabled=True,
            telegram_default_profile="assistant",
            telegram_catalog={"assistant": {"label": "Assistant", "allow_help": True}},
            whatsapp_enabled=False,
            whatsapp_default_profile="assistant",
            whatsapp_catalog={"assistant": {"label": "Assistant", "allow_status": True}},
            whatsapp_webhook_path="/channels/whatsapp/twilio/webhook",
        )
        self.assertTrue(payload["channels"]["telegram"]["enabled"])
        self.assertEqual(payload["channels"]["telegram"]["profiles"][0]["id"], "assistant")
        self.assertEqual(payload["channels"]["whatsapp"]["webhook_path"], "/channels/whatsapp/twilio/webhook")

    def test_whatsapp_webhook_result_handles_disabled_secret_and_success(self) -> None:
        service = AutopilotEndpointService()

        disabled = service.whatsapp_webhook_result(
            enabled=False,
            configured_secret="",
            provided_secret="",
            form={},
            handle_inbound=lambda form: "ok",
        )
        self.assertEqual(disabled["text"], "Empyralis WhatsApp autopilot is disabled.")

        forbidden = service.whatsapp_webhook_result(
            enabled=True,
            configured_secret="secret",
            provided_secret="wrong",
            form={},
            handle_inbound=lambda form: "ok",
        )
        self.assertEqual(forbidden["status_code"], 403)

        success = service.whatsapp_webhook_result(
            enabled=True,
            configured_secret="secret",
            provided_secret="secret",
            form={"Body": "hello"},
            handle_inbound=lambda form: f"handled:{form['Body']}",
        )
        self.assertEqual(success["status_code"], 200)
        self.assertEqual(success["text"], "handled:hello")


if __name__ == "__main__":
    unittest.main()
