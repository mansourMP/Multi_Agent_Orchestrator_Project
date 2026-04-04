import unittest

from server_modules import direct_chat_generation_service


class DirectChatGenerationServiceTests(unittest.TestCase):
    def _services(self, *, stream_events):
        return direct_chat_generation_service.DirectChatGenerationServices(
            thinking_step_payload=lambda iteration, status, detail=None: {
                "type": "step",
                "iteration": iteration,
                "status": status,
                "detail": detail,
            },
            build_context_used=lambda **kwargs: kwargs,
            build_direct_tool_approval_response=lambda **kwargs: None,
            parse_tool_name=lambda name: tuple(str(name).split("__", 1)) if "__" in str(name) else ("", ""),
            tool_arguments_payload=lambda value: value if isinstance(value, dict) else {},
            parse_page_state=lambda value: {},
            direct_tool_step_payload=lambda connector_id, action_id, arguments, **kwargs: {
                "type": "step",
                "connector": connector_id,
                "action": action_id,
                "arguments": arguments,
                **kwargs,
            },
            execute_single_direct_tool_call=lambda **kwargs: "tool result",
            direct_tool_followup_message=lambda tool_name, result_text: f"{tool_name}: {result_text}",
            suggest_actions=lambda _message, _availability: [{"kind": "open"}],
            clear_direct_tool_loop_state=lambda _session_key: None,
            persist_direct_chat_memory_best_effort=lambda **kwargs: None,
            persist_direct_chat_transcript_best_effort=lambda **kwargs: None,
            record_direct_tool_signature=lambda _session_key, _tool_call: False,
            direct_chat_error_reply=lambda error: f"Chat failed: {error}",
            capture_exception=lambda exc: None,
            generate_chat_reply_stream_with_provider_fallback=lambda **kwargs: iter(stream_events),
        )

    def test_stream_provider_backed_direct_chat_returns_final_answer(self) -> None:
        events = list(
            direct_chat_generation_service.stream_provider_backed_direct_chat(
                services=self._services(
                    stream_events=[
                        {
                            "type": "result",
                            "reply": "Hello",
                            "usage_masked": {"provider": "openai"},
                            "provider": "openai",
                            "model": "gpt-5.4",
                            "attempted_providers": "openai",
                            "error": "",
                            "tool_calls": [],
                        }
                    ]
                ),
                context={"provider": "openai"},
                metadata={"provider": "openai", "model": "gpt-5.4"},
                system_prompt="System prompt",
                normalized_workspace_id="default",
                normalized_requested_provider="openai",
                normalized_requested_model="gpt-5.4",
                normalized_reasoning_effort="medium",
                normalized_thread_id="thread-1",
                normalized_message="hello",
                compacted_prior_messages=[],
                prior_messages_used=False,
                history_mode="none",
                connected_systems=[],
                tool_capabilities=[],
                availability_payload={"ai_ready": True},
                tools=[],
                direct_chat_credentials={},
                proactive_suggestions=["next"],
                tool_loop_session_key="session-1",
                fallback_reason=None,
                session_ctx=None,
                resolved_chat_max_iterations=3,
                direct_tool_result_summary_system_message="Summarize tool results.",
            )
        )

        self.assertEqual(events[0]["type"], "step")
        self.assertEqual(events[-1]["type"], "final")
        self.assertEqual(events[-1]["payload"]["reply"], "Hello")
        self.assertEqual(events[-1]["payload"]["provider"], "openai")

    def test_stream_provider_backed_direct_chat_returns_error_reply_on_failure(self) -> None:
        events = list(
            direct_chat_generation_service.stream_provider_backed_direct_chat(
                services=self._services(
                    stream_events=[
                        {
                            "type": "failure",
                            "attempted_providers": "openai",
                            "error": "temporary backend error",
                        }
                    ]
                ),
                context={"provider": "openai"},
                metadata={"provider": "openai", "model": "gpt-5.4"},
                system_prompt="System prompt",
                normalized_workspace_id="default",
                normalized_requested_provider="openai",
                normalized_requested_model="gpt-5.4",
                normalized_reasoning_effort="medium",
                normalized_thread_id="thread-1",
                normalized_message="hello",
                compacted_prior_messages=[],
                prior_messages_used=False,
                history_mode="none",
                connected_systems=[],
                tool_capabilities=[],
                availability_payload={"ai_ready": True},
                tools=[],
                direct_chat_credentials={},
                proactive_suggestions=[],
                tool_loop_session_key="session-1",
                fallback_reason=None,
                session_ctx=None,
                resolved_chat_max_iterations=1,
                direct_tool_result_summary_system_message="Summarize tool results.",
            )
        )

        self.assertEqual(events[-1]["type"], "final")
        self.assertEqual(events[-1]["payload"]["reply"], "Chat failed: temporary backend error")
        self.assertEqual(events[-1]["payload"]["attempted_providers"], "openai")


if __name__ == "__main__":
    unittest.main()
