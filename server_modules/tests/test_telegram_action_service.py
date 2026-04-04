import unittest

from server_modules.connectors.telegram_action_service import TelegramActionService


class TelegramActionServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramActionService:
        messages = overrides.pop("messages", [])
        approvals = overrides.pop("approvals", {"events": []})
        return TelegramActionService(
            default_chat_prefix="/empyralis",
            onboarding_enabled=overrides.pop("onboarding_enabled", True),
            help_text=lambda profile: "help",
            skills_menu_text=lambda profile: "skills",
            menu_keyboard=lambda profile, menu_id: {"menu": menu_id},
            onboarding_prompt=lambda step, retry: f"prompt-{step}",
            onboarding_start=lambda workspace_id, chat_id: {"active": True, "step_index": 0},
            profile_text=lambda profile, chat_profile: "profile",
            profile_help_text=lambda profile: "profile-help",
            profile_set=lambda workspace_id, chat_id, field_name, value: {"field": field_name, "value": value},
            profile_clear=lambda workspace_id, chat_id, field_name: {},
            runtime_status_text=lambda workspace_id: "status",
            approvals_list=lambda limit: approvals,
            approvals_text=lambda payload, prefix: "approvals",
            approval_resolve=lambda event_id, approved, note: {"ok": True},
            approval_result_text=lambda payload, approved: "approved" if approved else "rejected",
            send_message=lambda **kwargs: messages.append(kwargs),
        )

    def test_help_action_sends_message(self) -> None:
        messages = []
        service = self._make_service(messages=messages)
        result = service.handle_non_run_action(
            action="help",
            routed={},
            profile={},
            chat_profile={},
            workspace_id="ws",
            connector_id="conn",
            bot_token="token",
            chat_id="chat",
            inbound_message_id="msg",
            trace_id="trace",
            source_event_id="evt",
        )

        self.assertTrue(result["handled"])
        self.assertEqual(messages[0]["text"], "help")

    def test_profile_set_updates_profile(self) -> None:
        messages = []
        service = self._make_service(messages=messages)
        result = service.handle_non_run_action(
            action="profile_set",
            routed={"field": "project", "value": "alpha"},
            profile={},
            chat_profile={},
            workspace_id="ws",
            connector_id="conn",
            bot_token="token",
            chat_id="chat",
            inbound_message_id="msg",
            trace_id="trace",
            source_event_id="evt",
        )

        self.assertTrue(result["handled"])
        self.assertEqual(result["chat_profile"]["field"], "project")
        self.assertIn("Saved", messages[0]["text"])

    def test_approvals_action_sends_payload(self) -> None:
        messages = []
        service = self._make_service(messages=messages, approvals={"events": ["a"]})
        result = service.handle_non_run_action(
            action="approvals",
            routed={"limit": 3},
            profile={},
            chat_profile={},
            workspace_id="ws",
            connector_id="conn",
            bot_token="token",
            chat_id="chat",
            inbound_message_id="msg",
            trace_id="trace",
            source_event_id="evt",
        )

        self.assertTrue(result["handled"])
        self.assertEqual(messages[0]["text"], "approvals")


if __name__ == "__main__":
    unittest.main()
