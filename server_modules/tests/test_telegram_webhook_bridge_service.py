import unittest

from server_modules.connectors.telegram_webhook_bridge_service import TelegramWebhookBridgeService


class TelegramWebhookBridgeServiceTests(unittest.TestCase):
    def test_handle_webhook_validates_secret_and_dispatches(self) -> None:
        calls = []
        service = TelegramWebhookBridgeService(
            init_runtime=lambda: calls.append(("init", None)),
            parse_update=lambda raw: {"update_id": 7, "raw": raw.decode("utf-8")},
            webhook_auth_result=lambda **kwargs: {"status_code": 200, "kwargs": kwargs},
            handle_inbound=lambda connector_id, update: {"connector_id": connector_id, "update": update},
            error_response=lambda status_code, content: {"status_code": status_code, "content": content},
            enabled=True,
            delivery_mode="webhook",
            configured_secret="secret",
        )

        result = service.handle_webhook(
            raw_body=b'{"update_id": 7}',
            connector_id="tg-1",
            header_secret="secret",
        )

        self.assertEqual(calls, [("init", None)])
        self.assertTrue(result["ok"])
        self.assertEqual(result["connector_id"], "tg-1")
        self.assertEqual(result["update"]["update_id"], 7)

    def test_handle_webhook_returns_error_response_on_auth_failure(self) -> None:
        service = TelegramWebhookBridgeService(
            init_runtime=lambda: None,
            parse_update=lambda raw: {"update_id": 7},
            webhook_auth_result=lambda **kwargs: {"status_code": 403, "content": "bad secret"},
            handle_inbound=lambda connector_id, update: {"connector_id": connector_id, "update": update},
            error_response=lambda status_code, content: {"status_code": status_code, "content": content},
            enabled=True,
            delivery_mode="webhook",
            configured_secret="secret",
        )

        result = service.handle_webhook(
            raw_body=b'{"update_id": 7}',
            connector_id="tg-1",
            header_secret="wrong",
        )

        self.assertEqual(result, {"status_code": 403, "content": "bad secret"})


if __name__ == "__main__":
    unittest.main()
