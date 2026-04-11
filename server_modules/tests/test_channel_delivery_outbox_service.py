import unittest
from unittest.mock import patch

from server_modules.connectors.channel_delivery_outbox_service import deliver_channel_run_delivery_outbox_event
from server_modules.outbox_service import OutboxEvent, OutboxRetryLater


class _TelegramDispatchStub:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def poll_run_terminal_result(self, run_id, max_reply_chars=None):
        self.calls.append(("poll", run_id, max_reply_chars))
        return dict(self.result)

    def deliver_final_response(self, **kwargs):
        self.calls.append(("deliver", kwargs))
        return {"status": kwargs["status"]}


class _WhatsAppDispatchStub:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def poll_run_terminal_result(self, run_id, max_reply_chars=None):
        self.calls.append(("poll", run_id, max_reply_chars))
        return dict(self.result)

    def deliver_final_response(self, **kwargs):
        self.calls.append(("deliver", kwargs))
        return {"status": kwargs["status"]}


class _TelegramRegistryStub:
    def __init__(self, dispatch):
        self.max_reply_chars = 240
        self.record_channel_event = lambda **kwargs: None
        self.send_message = lambda **kwargs: "msg-1"
        self.edit_message = lambda **kwargs: True
        self.resolve_secret = lambda entry: {"bot_token": "bot-token"}
        self.resolve_profile = lambda entry: {"id": "profile-1"}
        self.session_key_builder = lambda chat_id: f"tg:{chat_id}"
        self._dispatch = dispatch
        self._state = type("State", (), {"get_connector_entry": staticmethod(lambda connector_id: {"id": connector_id})})()

    def telegram_run_dispatch_service(self):
        return self._dispatch

    def telegram_autopilot_state_service(self):
        return self._state


class _WhatsAppRegistryStub:
    def __init__(self, dispatch):
        self.max_reply_chars = 240
        self.resolve_vault_credential = lambda connector_id, workspace_id: {
            "account_sid": "AC123",
            "auth_token": "token",
            "from_number": "whatsapp:+100",
        }
        self.resolve_profile = lambda entry: {"id": "profile-1"}
        self._dispatch = dispatch
        self._state = type("State", (), {"get_connector_entry": staticmethod(lambda connector_id: {"id": connector_id})})()

    def whatsapp_run_dispatch_service(self):
        return self._dispatch

    def whatsapp_autopilot_state_service(self):
        return self._state


class _ShellStub:
    def __init__(self, *, telegram_registry=None, whatsapp_registry=None):
        self._telegram_registry = telegram_registry
        self._whatsapp_registry = whatsapp_registry

    def runtime_facade_service(self):
        return type("RuntimeFacade", (), {"init_runtime": staticmethod(lambda: None)})()

    def telegram_service_registry(self):
        return self._telegram_registry

    def whatsapp_service_registry(self):
        return self._whatsapp_registry


class ChannelDeliveryOutboxServiceTests(unittest.TestCase):
    def test_telegram_delivery_defers_until_terminal(self) -> None:
        event = OutboxEvent(
            event_id="evt-1",
            event_type="channel_run_delivery",
            tenant_id="tenant-1",
            workspace_id="ws-1",
            run_id="run-1",
            trace_id="trace-1",
            payload={
                "channel": "telegram",
                "connector_id": "conn-1",
                "chat_id": "chat-1",
            },
        )
        shell = _ShellStub(telegram_registry=_TelegramRegistryStub(_TelegramDispatchStub({"ready": False, "status": "executing"})))

        with patch("server_modules.connectors.channel_delivery_outbox_service._connector_shell", return_value=shell):
            with self.assertRaises(OutboxRetryLater):
                deliver_channel_run_delivery_outbox_event(event)

    def test_whatsapp_delivery_uses_terminal_result(self) -> None:
        dispatch = _WhatsAppDispatchStub({"ready": True, "status": "completed", "summary": "Done"})
        shell = _ShellStub(whatsapp_registry=_WhatsAppRegistryStub(dispatch))
        event = OutboxEvent(
            event_id="evt-2",
            event_type="channel_run_delivery",
            tenant_id="tenant-1",
            workspace_id="ws-1",
            run_id="run-2",
            trace_id="trace-2",
            payload={
                "channel": "whatsapp",
                "connector_id": "conn-2",
                "reply_to_number": "whatsapp:+200",
            },
        )

        with patch("server_modules.connectors.channel_delivery_outbox_service._connector_shell", return_value=shell):
            delivered = deliver_channel_run_delivery_outbox_event(event)

        self.assertTrue(delivered)
        self.assertEqual(dispatch.calls[0], ("poll", "run-2", 240))
        self.assertEqual(dispatch.calls[1][0], "deliver")
        self.assertEqual(dispatch.calls[1][1]["reply_to_number"], "whatsapp:+200")


if __name__ == "__main__":
    unittest.main()
