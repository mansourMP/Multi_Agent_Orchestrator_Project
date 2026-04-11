import unittest

from server_modules.connectors.telegram_poll_dispatch_service import TelegramPollDispatchService


class _InboundContextStub:
    def __init__(self, *, context=None, guided=None):
        self.context = context or {}
        self.guided = guided or {"handled": False}
        self.build_calls = []
        self.guided_calls = []

    def build_inbound_context(self, **kwargs):
        self.build_calls.append(kwargs)
        return self.context

    def handle_guided_setup(self, **kwargs):
        self.guided_calls.append(kwargs)
        return self.guided


class _SenderFilterStub:
    def __init__(self):
        self.calls = []

    def handle_denied_sender(self, **kwargs):
        self.calls.append(kwargs)


class _ActionStub:
    def __init__(self, result=None):
        self.result = result or {"handled": True, "action": "help"}
        self.calls = []

    def handle_non_run_action(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


class _RunActionStub:
    def __init__(self, result=None):
        self.result = result or {"action": "run", "run_id": "run-1"}
        self.calls = []

    def handle_run_action(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


class _PairingStub:
    def __init__(self, result=None):
        self.result = result or {"authorized": True, "status": "linked", "workspace_id": "ws"}
        self.calls = []

    def authorize_channel_message(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


class TelegramPollDispatchServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramPollDispatchService:
        inbound = overrides.pop("inbound", _InboundContextStub())
        sender_filter = overrides.pop("sender_filter", _SenderFilterStub())
        action_service = overrides.pop("action_service", _ActionStub())
        run_action_service = overrides.pop("run_action_service", _RunActionStub())
        pairing_service = overrides.pop("pairing_service", _PairingStub())
        messages = overrides.pop("messages", [])
        return TelegramPollDispatchService(
            sender_allowed=overrides.pop("sender_allowed", lambda sender, allow_from: True),
            session_key_builder=overrides.pop("session_key_builder", lambda chat_id: f"session:{chat_id}"),
            inbound_context_service=lambda: inbound,
            sender_filter_service=lambda: sender_filter,
            action_service=lambda: action_service,
            run_action_service=lambda: run_action_service,
            get_chat_profile=overrides.pop("get_chat_profile", lambda workspace_id, chat_id: {"project": "alpha"}),
            explicit_run_command=overrides.pop("explicit_run_command", lambda text: text.startswith("run ")),
            help_text=overrides.pop("help_text", lambda profile: "help"),
            send_message=lambda *args, **kwargs: messages.append((args, kwargs)),
            channel_pairing_service=lambda: pairing_service,
        )

    def test_unpaired_sender_gets_guidance_without_processing(self) -> None:
        messages = []
        service = self._make_service(
            pairing_service=_PairingStub(
                {"authorized": False, "status": "pairing_required", "reply_text": "pair me"}
            ),
            messages=messages,
        )
        result = service.handle_update(
            entry={},
            label="Telegram",
            workspace_id="ws",
            profile={"id": "profile-1"},
            allow_from=["alice"],
            connector_state={"dropped_sender_count": 2},
            connector_id="conn",
            bot_token="token",
            configured_chat_id="chat-1",
            extracted_message={
                "message": {"text": "hello"},
                "chat": {"id": "chat-1"},
                "sender": {"id": "user-1", "username": "bob"},
            },
            update_id=7,
        )
        self.assertFalse(result["processed"])
        self.assertEqual(result["reason"], "pairing_required")
        self.assertEqual(len(messages), 1)

    def test_run_action_dispatches_through_run_service(self) -> None:
        inbound = _InboundContextStub(
            context={
                "chat_id": "chat-1",
                "sender_id": "user-1",
                "inbound_message_id": "msg-1",
                "message_text": "run do it",
                "stored_attachments": [],
                "routed": {"action": "run", "goal": "do it"},
                "action": "run",
                "session_key": "session:chat-1",
                "trace_id": "trace-1",
                "source_event_id": "evt-1",
            }
        )
        run_action = _RunActionStub({"action": "run", "run_id": "run-123"})
        service = self._make_service(inbound=inbound, run_action_service=run_action)
        result = service.handle_update(
            entry={"id": "entry-1"},
            label="Telegram",
            workspace_id="ws",
            profile={"id": "profile-1"},
            allow_from=[],
            connector_state={},
            connector_id="conn",
            bot_token="token",
            configured_chat_id="chat-1",
            extracted_message={
                "message": {"text": "run do it"},
                "chat": {"id": "chat-1"},
                "sender": {"id": "user-1"},
            },
            update_id=8,
        )
        self.assertTrue(result["processed"])
        self.assertEqual(result["run_id"], "run-123")
        self.assertEqual(len(run_action.calls), 1)

    def test_non_run_unhandled_falls_back_to_help_message(self) -> None:
        inbound = _InboundContextStub(
            context={
                "chat_id": "chat-1",
                "sender_id": "user-1",
                "inbound_message_id": "msg-1",
                "message_text": "weird",
                "stored_attachments": [],
                "routed": {"action": "status"},
                "action": "status",
                "session_key": "session:chat-1",
                "trace_id": "trace-1",
                "source_event_id": "evt-1",
            }
        )
        messages = []
        action_service = _ActionStub({"handled": False, "action": "status"})
        service = self._make_service(inbound=inbound, action_service=action_service, messages=messages)
        result = service.handle_update(
            entry={},
            label="Telegram",
            workspace_id="ws",
            profile={"id": "profile-1"},
            allow_from=[],
            connector_state={},
            connector_id="conn",
            bot_token="token",
            configured_chat_id="chat-1",
            extracted_message={
                "message": {"text": "status"},
                "chat": {"id": "chat-1"},
                "sender": {"id": "user-1"},
            },
            update_id=9,
        )
        self.assertTrue(result["processed"])
        self.assertEqual(result["action"], "status")
        self.assertEqual(len(messages), 1)


if __name__ == "__main__":
    unittest.main()
