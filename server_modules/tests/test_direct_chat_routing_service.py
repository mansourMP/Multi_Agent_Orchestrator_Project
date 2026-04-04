import unittest

from server_modules import direct_chat_routing_service


class DirectChatRoutingServiceTests(unittest.TestCase):
    def test_connector_preview_disables_builtin_tools_when_connector_tools_are_not_allowed(self) -> None:
        decision = direct_chat_routing_service.plan_direct_chat_route(
            message="Send a Slack message to the team",
            availability={"ai_ready": True},
            provider="codex_cli",
            tools=[{"name": "slack__send"}],
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, keywords: any(keyword in text for keyword in keywords),
            is_obvious_smtp_write_request_fn=lambda _text: False,
            preview_run_response_fn=lambda _message, _availability: {"actions": [{"kind": "run"}]},
            prefer_durable_run_handoff_fn=lambda _message, _availability: False,
            durable_run_preferred_response_fn=lambda _message: {"actions": [{"kind": "run"}]},
            message_can_use_direct_connector_tools_fn=lambda _message: False,
            message_can_use_direct_local_tools_fn=lambda _message: False,
            message_can_use_builtin_direct_tools_fn=lambda _message: True,
            can_auto_start_run_handoff_fn=lambda _availability: True,
            google_workspace_keywords=("gmail",),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            discord_keywords=("discord",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
        )

        self.assertTrue(decision.connector_preview_requested)
        self.assertFalse(decision.allow_builtin_direct_tools)
        self.assertFalse(decision.allow_direct_tool_calls)
        self.assertTrue(decision.should_auto_start_run)

    def test_prefer_durable_run_handoff_disables_direct_tool_calls(self) -> None:
        decision = direct_chat_routing_service.plan_direct_chat_route(
            message="Investigate and fix the issue end to end",
            availability={"ai_ready": True},
            provider="openai",
            tools=[],
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, keywords: any(keyword in text for keyword in keywords),
            is_obvious_smtp_write_request_fn=lambda _text: False,
            preview_run_response_fn=lambda _message, _availability: None,
            prefer_durable_run_handoff_fn=lambda _message, _availability: True,
            durable_run_preferred_response_fn=lambda _message: {"actions": [{"kind": "run"}]},
            message_can_use_direct_connector_tools_fn=lambda _message: False,
            message_can_use_direct_local_tools_fn=lambda _message: True,
            message_can_use_builtin_direct_tools_fn=lambda _message: True,
            can_auto_start_run_handoff_fn=lambda _availability: True,
            google_workspace_keywords=("gmail",),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            discord_keywords=("discord",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
        )

        self.assertTrue(decision.prefer_durable_run_handoff)
        self.assertEqual(decision.preview, {"actions": [{"kind": "run"}]})
        self.assertFalse(decision.allow_direct_tool_calls)
        self.assertTrue(decision.should_auto_start_run)

    def test_without_preview_auto_start_run_stays_false(self) -> None:
        decision = direct_chat_routing_service.plan_direct_chat_route(
            message="hello",
            availability={"ai_ready": True},
            provider="openai",
            tools=[],
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, keywords: any(keyword in text for keyword in keywords),
            is_obvious_smtp_write_request_fn=lambda _text: False,
            preview_run_response_fn=lambda _message, _availability: None,
            prefer_durable_run_handoff_fn=lambda _message, _availability: False,
            durable_run_preferred_response_fn=lambda _message: {"actions": [{"kind": "run"}]},
            message_can_use_direct_connector_tools_fn=lambda _message: False,
            message_can_use_direct_local_tools_fn=lambda _message: False,
            message_can_use_builtin_direct_tools_fn=lambda _message: False,
            can_auto_start_run_handoff_fn=lambda _availability: True,
            google_workspace_keywords=("gmail",),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            discord_keywords=("discord",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
        )

        self.assertIsNone(decision.preview)
        self.assertFalse(decision.allow_direct_tool_calls)
        self.assertFalse(decision.should_auto_start_run)


if __name__ == "__main__":
    unittest.main()
