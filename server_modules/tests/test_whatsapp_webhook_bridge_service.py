import unittest

from server_modules.connectors.whatsapp_webhook_bridge_service import WhatsAppWebhookBridgeService


class WhatsAppWebhookBridgeServiceTests(unittest.TestCase):
    def test_bridge_returns_forbidden_response(self) -> None:
        calls = []
        service = WhatsAppWebhookBridgeService(
            init_runtime=lambda: calls.append("init"),
            parse_form_urlencoded=lambda raw: {"Body": raw.decode("utf-8")},
            webhook_result=lambda **kwargs: {"status_code": 403, "content": "forbidden"},
            handle_inbound=lambda payload: None,
            twiml_response=lambda text: {"kind": "twiml", "text": text},
            forbidden_response=lambda content: {"kind": "forbidden", "content": content},
            enabled=True,
            configured_secret="secret-1",
        )

        result = service.handle_webhook(raw_body=b"hello", query_secret="bad")

        self.assertEqual(result, {"kind": "forbidden", "content": "forbidden"})
        self.assertEqual(calls[0], "init")

    def test_bridge_returns_twiml_response(self) -> None:
        captured = {}

        def _webhook_result(**kwargs):
            captured.update(kwargs)
            return {"status_code": 200, "text": "ok"}

        service = WhatsAppWebhookBridgeService(
            init_runtime=lambda: None,
            parse_form_urlencoded=lambda raw: {"Body": raw.decode("utf-8")},
            webhook_result=_webhook_result,
            handle_inbound=lambda payload: {"ok": True},
            twiml_response=lambda text: {"kind": "twiml", "text": text},
            forbidden_response=lambda content: {"kind": "forbidden", "content": content},
            enabled=True,
            configured_secret="secret-1",
        )

        result = service.handle_webhook(raw_body=b"hello", header_secret="secret-1")

        self.assertEqual(result, {"kind": "twiml", "text": "ok"})
        self.assertEqual(captured["provided_secret"], "secret-1")
        self.assertEqual(captured["form"], {"Body": "hello"})


if __name__ == "__main__":
    unittest.main()
