import unittest
from unittest import mock

from server_modules import agent_trace_service
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
                trace_context=None,
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
                trace_context=None,
                resolved_chat_max_iterations=1,
                direct_tool_result_summary_system_message="Summarize tool results.",
            )
        )

        self.assertEqual(events[-1]["type"], "final")
        self.assertEqual(events[-1]["payload"]["reply"], "")
        self.assertEqual(events[-1]["payload"]["interventions"][0]["kind"], "system_error")
        self.assertEqual(events[-1]["payload"]["interventions"][0]["detail"], "Chat failed: temporary backend error")
        self.assertEqual(events[-1]["payload"]["attempted_providers"], "openai")

    def test_stream_provider_backed_direct_chat_applies_health_safety_disclaimer_and_citation_trace(self) -> None:
        trace_context = agent_trace_service.TraceContext(
            trace_id="trace-health-1",
            workspace_id="default",
            tenant_id="tenant-1",
            thread_id="thread-1",
            run_id=None,
            root_agent_id="sage",
        )
        emitted: list[dict[str, object]] = []

        async def _emit_with_envelope(trace_ctx, event_type, data, **kwargs):
            seq = trace_ctx.next_seq()
            envelope = {
                "id": f"tevent-{seq}",
                "trace_id": trace_ctx.trace_id,
                "seq": seq,
                "event_type": event_type,
                "persisted": bool(kwargs.get("persisted", True)),
                "agent_id": trace_ctx.root_agent_id,
                "data": dict(data or {}),
            }
            emitted.append(envelope)
            return envelope

        session_ctx = {
            "agent_turn_request": {
                "context_hints": {
                    "metadata": {
                        "health_safety_enabled": True,
                        "health_safety_assistant_name": "HealthGuide",
                    }
                }
            }
        }
        with mock.patch.object(
            direct_chat_generation_service.agent_trace_service,
            "emit_with_envelope",
            side_effect=_emit_with_envelope,
        ), mock.patch.object(
            direct_chat_generation_service.agent_trace_service,
            "finish_trace",
            new=mock.AsyncMock(return_value={}),
        ):
            events = list(
                direct_chat_generation_service.stream_provider_backed_direct_chat(
                    services=self._services(
                        stream_events=[
                            {
                                "type": "result",
                                "reply": "Stay hydrated and monitor your symptoms.",
                                "usage_masked": {"provider": "openai"},
                                "provider": "openai",
                                "model": "gpt-5.4",
                                "attempted_providers": "openai",
                                "error": "",
                                "tool_calls": [],
                                "citation_refs": ["CDC Flu Symptoms (https://www.cdc.gov/flu/symptoms/index.html)"],
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
                    normalized_message="What are common flu symptoms?",
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
                    session_ctx=session_ctx,
                    trace_context=trace_context,
                    resolved_chat_max_iterations=1,
                    direct_tool_result_summary_system_message="Summarize tool results.",
                )
            )

        final_payload = events[-1]["payload"]
        self.assertIn("not a doctor", final_payload["reply"])
        self.assertIn("Sources:", final_payload["reply"])
        completed_events = [
            event["payload"]
            for event in events
            if event.get("type") == "trace" and event.get("payload", {}).get("event_type") == "assistant.message.completed"
        ]
        self.assertTrue(completed_events)
        self.assertEqual(
            completed_events[-1]["data"]["citation_refs"],
            ["CDC Flu Symptoms (https://www.cdc.gov/flu/symptoms/index.html)"],
        )

    def test_stream_provider_backed_direct_chat_emits_trace_plan_tool_search_and_message_events(self) -> None:
        trace_context = agent_trace_service.TraceContext(
            trace_id="trace-1",
            workspace_id="default",
            tenant_id="tenant-1",
            thread_id="thread-1",
            run_id=None,
            root_agent_id="sage",
        )
        emitted: list[dict[str, object]] = []

        async def _emit_with_envelope(trace_ctx, event_type, data, **kwargs):
            seq = trace_ctx.next_seq()
            envelope = {
                "id": f"tevent-{seq}",
                "trace_id": trace_ctx.trace_id,
                "seq": seq,
                "event_type": event_type,
                "persisted": bool(kwargs.get("persisted", True)),
                "agent_id": trace_ctx.root_agent_id,
                "parent_id": kwargs.get("parent_id"),
                "item_id": kwargs.get("item_id"),
                "tool_call_id": kwargs.get("tool_call_id"),
                "child_run_id": kwargs.get("child_run_id"),
                "approval_id": kwargs.get("approval_id"),
                "artifact_id": kwargs.get("artifact_id"),
                "data": dict(data or {}),
            }
            emitted.append(envelope)
            return envelope

        stream_rounds = iter(
            [
                [
                    {
                        "type": "result",
                        "reply": "Here is the final answer",
                        "usage_masked": {"provider": "openai"},
                        "provider": "openai",
                        "model": "gpt-5.4",
                        "attempted_providers": "openai",
                        "error": "",
                        "tool_calls": [
                            {
                                "id": "tool-call-1",
                                "name": "web__search",
                                "arguments": {"query": "latest sage trace ui"},
                            }
                        ],
                    }
                ],
                [
                    {
                        "type": "chunk",
                        "delta": "Here ",
                    },
                    {
                        "type": "chunk",
                        "delta": "you go",
                    },
                    {
                        "type": "result",
                        "reply": "Here you go",
                        "usage_masked": {"provider": "openai"},
                        "provider": "openai",
                        "model": "gpt-5.4",
                        "attempted_providers": "openai",
                        "error": "",
                        "tool_calls": [],
                    },
                ],
            ]
        )

        def _stream_events(**kwargs):
            return iter(next(stream_rounds))

        services = self._services(stream_events=[])
        services.generate_chat_reply_stream_with_provider_fallback = _stream_events

        with mock.patch.object(
            direct_chat_generation_service.agent_trace_service,
            "emit_with_envelope",
            side_effect=_emit_with_envelope,
        ), mock.patch.object(
            direct_chat_generation_service.agent_trace_service,
            "finish_trace",
            new=mock.AsyncMock(return_value={}),
        ):
            events = list(
                direct_chat_generation_service.stream_provider_backed_direct_chat(
                    services=services,
                    context={"provider": "openai"},
                    metadata={"provider": "openai", "model": "gpt-5.4"},
                    system_prompt="System prompt",
                    normalized_workspace_id="default",
                    normalized_requested_provider="openai",
                    normalized_requested_model="gpt-5.4",
                    normalized_reasoning_effort="medium",
                    normalized_thread_id="thread-1",
                    normalized_message="Research the latest Sage trace UI references",
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
                    trace_context=trace_context,
                    resolved_chat_max_iterations=3,
                    direct_tool_result_summary_system_message="Summarize tool results.",
                )
            )

        trace_events = [event["payload"] for event in events if event.get("type") == "trace"]
        event_types = [payload["event_type"] for payload in trace_events]
        self.assertIn("plan.started", event_types)
        self.assertIn("plan.item.created", event_types)
        self.assertIn("tool.started", event_types)
        self.assertIn("tool.result", event_types)
        self.assertIn("search.query", event_types)
        self.assertIn("search.results", event_types)
        self.assertIn("assistant.message.delta", event_types)
        self.assertIn("assistant.message.completed", event_types)
        self.assertLess(event_types.index("plan.started"), event_types.index("tool.started"))
        self.assertEqual(events[-1]["type"], "final")
        self.assertEqual(events[-1]["payload"]["reply"], "Here you go")


if __name__ == "__main__":
    unittest.main()
