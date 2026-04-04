import unittest

from server_modules import direct_chat_response_service


class DirectChatResponseServiceTests(unittest.TestCase):
    def _services(self) -> direct_chat_response_service.DirectChatResponseServices:
        return direct_chat_response_service.DirectChatResponseServices(
            with_context_used=lambda payload, context: {**payload, "context_used": context},
            build_context_used=lambda **kwargs: kwargs,
            connected_provider_tokens=lambda _workspace_id: ["openai", "gemini"],
            list_memory_entries=lambda _workspace_id: ["one", "two"],
            active_run_count=lambda _workspace_id: 3,
            get_memory=lambda _workspace_id: "memory text",
            delete_memory=lambda _workspace_id, key: key == "known",
            slash_command_help_text=lambda: "help text",
            execute_direct_tool_calls=lambda **kwargs: "tool reply",
            direct_chat_credentials=lambda _workspace_id, _provider: {"api_key": "sk-test"},
            capture_exception=lambda exc: None,
        )

    def test_slash_command_payload_for_status(self) -> None:
        payload = direct_chat_response_service.slash_command_payload(
            slash_command_name="status",
            slash_remainder="",
            workspace_id="default",
            requested_provider="openai",
            requested_model="gpt-5.4",
            reasoning_effort="medium",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            proactive_suggestions=["next"],
            base_context_used={"workspace_id": "default"},
            services=self._services(),
        )

        assert payload is not None
        self.assertIn("Runtime status", payload["reply"])
        self.assertIn("Connected providers: openai, gemini", payload["reply"])
        self.assertEqual(payload["suggestions"], ["next"])

    def test_approval_confirmation_payload_missing_action(self) -> None:
        payload = direct_chat_response_service.approval_confirmation_payload(
            approved_action_payload=None,
            workspace_id="default",
            thread_id="thread-1",
            requested_provider="openai",
            requested_model="gpt-5.4",
            reasoning_effort="medium",
            session_ctx=None,
            proactive_suggestions=[],
            connected_systems=[],
            tool_capabilities=[],
            tool_write_action_available_fn=lambda connector, action, capabilities: True,
            approved_action_to_tool_call_fn=lambda approved: {"name": "tool", "arguments": {}},
            services=self._services(),
        )

        self.assertEqual(payload["error"], "missing_approved_action")
        self.assertIn("missing the connector action payload", payload["reply"])

    def test_unavailable_fallback_payload_uses_no_provider_response_when_no_tool_result(self) -> None:
        payload = direct_chat_response_service.unavailable_fallback_payload(
            fallback_payload=None,
            proactive_suggestions=["next"],
            workspace_id="default",
            requested_provider="openai",
            requested_model="gpt-5.4",
            reasoning_effort="medium",
            connected_systems=[],
            tool_capabilities=[],
            no_provider_tool_fallback_reason="no_provider_tool_execution",
            unavailable_fallback_reason="provider_unavailable",
            services=self._services(),
            no_provider_reasoning_required_response_fn=lambda: {
                "reply": "",
                "message": "No AI provider configured",
                "actions": [],
                "mode": "error",
                "error": "no_provider",
            },
        )

        self.assertEqual(payload["mode"], "error")
        self.assertEqual(payload["error"], "no_provider")
        self.assertEqual(payload["context_used"]["fallback_reason"], "provider_unavailable")


if __name__ == "__main__":
    unittest.main()
