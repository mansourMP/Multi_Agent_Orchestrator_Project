import unittest

from server_modules import direct_chat_entry_service


class DirectChatEntryServiceTests(unittest.TestCase):
    def test_prepare_direct_chat_request_applies_model_command_and_builds_tools(self) -> None:
        prepared = direct_chat_entry_service.prepare_direct_chat_request(
            resolved_turn_request=None,
            session_ctx=None,
            message="/model openai:gpt-5.4 Continue with the task",
            workspace_id="default",
            thread_id="thread-1",
            requested_model="",
            requested_provider="",
            prior_messages=[],
            reasoning_effort="medium",
            availability={"ai_ready": True},
            approved_action=None,
            max_iterations=12,
            direct_chat_session_key_fn=lambda workspace_id, thread_id: f"{workspace_id}:{thread_id}",
            resolved_chat_iteration_limit_fn=lambda value: int(value or 30),
            session_model_preference_fn=lambda _session_key: {},
            normalize_reasoning_effort_fn=lambda value: value,
            parse_slash_command_fn=lambda message: {"command": "model", "remainder": "openai:gpt-5.4 Continue with the task"} if str(message).startswith("/model") else {"command": "", "remainder": ""},
            set_session_model_preference_fn=lambda session_key, provider=None, model=None: None,
            mark_thread_cleared_fn=lambda _session_key: None,
            normalize_prior_messages_fn=lambda value: list(value or []),
            consume_thread_cleared_fn=lambda _session_key: False,
            compact_conversation_history_fn=lambda messages, **kwargs: {"messages": list(messages), "compacted": False},
            build_proactive_suggestions_fn=lambda _workspace_id: ["next"],
            direct_tool_session_key_fn=lambda workspace_id, thread_id: f"tool:{workspace_id}:{thread_id}",
            resolve_direct_chat_availability_fn=lambda workspace_id, requested_provider, availability_override=None: {"ai_ready": True, "provider": requested_provider or "openai"},
            connected_system_labels_fn=lambda _availability: ["Memory"],
            context_tool_capabilities_fn=lambda _availability: [{"id": "memory", "connected": True}],
            build_direct_chat_tools_fn=lambda _tool_capabilities: [{"name": "memory_search"}],
            build_local_direct_chat_tools_fn=lambda _availability: [{"name": "file__read"}],
            build_builtin_direct_chat_tools_fn=lambda: [{"name": "web__search"}],
            normalize_direct_approved_action_fn=lambda _value: None,
            build_context_used_fn=lambda **kwargs: kwargs,
            direct_chat_compaction_token_limit=2000,
        )

        self.assertEqual(prepared.normalized_requested_provider, "openai")
        self.assertEqual(prepared.normalized_requested_model, "gpt-5.4")
        self.assertEqual(prepared.normalized_message, "Continue with the task")
        self.assertEqual(prepared.tools[0]["name"], "memory_search")
        self.assertEqual(prepared.tools[1]["name"], "file__read")
        self.assertEqual(prepared.tools[2]["name"], "web__search")
        self.assertEqual(prepared.proactive_suggestions, ["next"])

    def test_prepare_direct_chat_request_respects_thread_clear_and_compaction(self) -> None:
        prepared = direct_chat_entry_service.prepare_direct_chat_request(
            resolved_turn_request=None,
            session_ctx=None,
            message="/clear Keep going",
            workspace_id="default",
            thread_id="thread-1",
            requested_model="gpt-5.4",
            requested_provider="openai",
            prior_messages=[{"role": "user", "content": "old"}],
            reasoning_effort="medium",
            availability={"ai_ready": True},
            approved_action=None,
            max_iterations=4,
            direct_chat_session_key_fn=lambda workspace_id, thread_id: f"{workspace_id}:{thread_id}",
            resolved_chat_iteration_limit_fn=lambda value: int(value or 30),
            session_model_preference_fn=lambda _session_key: {},
            normalize_reasoning_effort_fn=lambda value: value,
            parse_slash_command_fn=lambda message: {"command": "clear", "remainder": "Keep going"} if str(message).startswith("/clear") else {"command": "", "remainder": ""},
            set_session_model_preference_fn=lambda session_key, provider=None, model=None: None,
            mark_thread_cleared_fn=lambda _session_key: None,
            normalize_prior_messages_fn=lambda value: list(value or []),
            consume_thread_cleared_fn=lambda _session_key: True,
            compact_conversation_history_fn=lambda messages, **kwargs: {"messages": list(messages), "compacted": False},
            build_proactive_suggestions_fn=lambda _workspace_id: ["next"],
            direct_tool_session_key_fn=lambda workspace_id, thread_id: f"tool:{workspace_id}:{thread_id}",
            resolve_direct_chat_availability_fn=lambda workspace_id, requested_provider, availability_override=None: {"ai_ready": True, "provider": requested_provider},
            connected_system_labels_fn=lambda _availability: [],
            context_tool_capabilities_fn=lambda _availability: [],
            build_direct_chat_tools_fn=lambda _tool_capabilities: [],
            build_local_direct_chat_tools_fn=lambda _availability: [],
            build_builtin_direct_chat_tools_fn=lambda: [],
            normalize_direct_approved_action_fn=lambda _value: None,
            build_context_used_fn=lambda **kwargs: kwargs,
            direct_chat_compaction_token_limit=2000,
        )

        self.assertEqual(prepared.normalized_message, "Keep going")
        self.assertEqual(prepared.compacted_prior_messages, [])
        self.assertEqual(prepared.base_context_used["workspace_id"], "default")


if __name__ == "__main__":
    unittest.main()
