import unittest
from types import SimpleNamespace
from unittest import mock

from server_modules import agent_trace_service
from server_modules import direct_chat_generation_service
from server_modules import direct_chat_response_service
from server_modules import direct_chat_runtime_service
from server_modules import no_provider_service


class DirectChatRuntimeServiceTests(unittest.TestCase):
    def _response_services(self) -> direct_chat_response_service.DirectChatResponseServices:
        return direct_chat_response_service.DirectChatResponseServices(
            with_context_used=lambda payload, context: {**payload, "context_used": context},
            build_context_used=lambda **kwargs: kwargs,
            connected_provider_tokens=lambda _workspace_id: ["openai"],
            active_run_count=lambda _workspace_id: 0,
            slash_command_help_text=lambda: "help text",
            execute_direct_tool_calls=lambda **kwargs: "tool reply",
            direct_chat_credentials=lambda _workspace_id, _provider: {"api_key": "sk-test"},
            capture_exception=lambda exc: None,
        )

    def _runtime_services(self, prepared: SimpleNamespace) -> direct_chat_runtime_service.DirectChatRuntimeServices:
        return direct_chat_runtime_service.DirectChatRuntimeServices(
            prepare_direct_chat_request=lambda **kwargs: prepared,
            direct_chat_response_services=self._response_services(),
            tool_gate_response=lambda message, availability: None,
            with_context_used=lambda payload, context: {**payload, "context_used": context},
            tool_write_action_available=lambda connector, action, capabilities: True,
            approved_action_to_tool_call=lambda approved_action: {},
            message_has_obvious_direct_tool_intent=lambda message, tools: False,
            no_provider_execution_services=no_provider_service.NoProviderExecutionServices(
                compact_text=lambda value: str(value or "").strip().lower(),
                safe_positive_int=lambda value, default=0: default,
                resolve_local_path=lambda path: mock.MagicMock(),
                extract_first_path_reference=lambda message: "",
                extract_first_url=lambda message: "",
                parse_page_state=lambda payload: payload,
                parse_memory_write=lambda message: None,
                parse_memory_read=lambda message: None,
                handle_memory_request=lambda workspace_id, message: None,
                parse_tool_name=lambda name: ("", ""),
                tool_arguments_payload=lambda arguments: {},
                approval_required_for_tool=lambda connector, action, payload, capabilities: False,
                agent_machine_full_trust_for_session=lambda session_ctx: False,
                execute_single_tool_call=lambda **kwargs: "tool reply",
            ),
            build_context_used=lambda **kwargs: kwargs,
            resolve_provider_for_direct_chat_message=lambda workspace_id, requested_provider, message: ("openai", {}),
            plan_direct_chat_route=lambda **kwargs: SimpleNamespace(
                allow_direct_tool_calls=True,
                preview=None,
                should_auto_start_run=False,
            ),
            start_direct_chat_run_handoff=lambda **kwargs: {"run_id": "run-1"},
            direct_chat_run_handoff_reply=lambda started: {"detail": "Run started"},
            stream_direct_chat_run_handoff=lambda **kwargs: iter(()),
            direct_chat_run_handoff_failure_payload=lambda message, detail: {"reply": detail},
            supports_direct_message_native_chat=lambda provider, credentials: True,
            supported_providers=["openai"],
            build_direct_chat_system_prompt=lambda **kwargs: "system prompt",
            direct_chat_workspace_context_text=lambda workspace_id, memory_query="": "",
            direct_chat_generation_services=direct_chat_generation_service.DirectChatGenerationServices(
                thinking_step_payload=lambda iteration, status, detail=None: {"type": "step", "label": "Thinking"},
                build_context_used=lambda **kwargs: kwargs,
                build_direct_tool_approval_response=lambda **kwargs: None,
                parse_tool_name=lambda name: ("", ""),
                tool_arguments_payload=lambda arguments: {},
                parse_page_state=lambda payload: payload,
                direct_tool_step_payload=lambda *args, **kwargs: {"type": "step", "label": "Tool"},
                execute_single_direct_tool_call=lambda **kwargs: "done",
                direct_tool_followup_message=lambda tool_name, result: result,
                suggest_actions=lambda reply, availability: [],
                clear_direct_tool_loop_state=lambda session_key: None,
                persist_direct_chat_memory_best_effort=lambda **kwargs: None,
                persist_direct_chat_transcript_best_effort=lambda **kwargs: None,
                persist_direct_chat_hosted_usage_best_effort=lambda **kwargs: None,
                record_direct_tool_signature=lambda session_key, tool_call: False,
                direct_chat_error_reply=lambda error: error,
                capture_exception=lambda exc: None,
                generate_chat_reply_stream_with_provider_fallback=lambda **kwargs: iter(()),
            ),
            no_provider_reasoning_required_response=lambda: {
                "reply": "",
                "actions": [],
                "mode": "error",
                "error": "no_provider",
            },
            capture_exception=lambda exc: None,
        )

    def test_build_direct_operator_reply_returns_empty_message_payload(self) -> None:
        prepared = SimpleNamespace(
            normalized_message="",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="openai",
            normalized_requested_model="gpt-5.4",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[],
            proactive_suggestions=["next"],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )

        events = list(
            direct_chat_runtime_service.build_direct_operator_reply(
                services=self._runtime_services(prepared),
                message="",
                workspace_id="default",
                requested_model="gpt-5.4",
                requested_provider="openai",
            )
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "final")
        self.assertEqual(events[0]["payload"]["reply"], "")
        self.assertEqual(events[0]["payload"]["interventions"][0]["kind"], "system_notice")
        self.assertEqual(events[0]["payload"]["interventions"][0]["title"], "Describe the outcome you want")
        self.assertIn("Tell the system what you want done", events[0]["payload"]["interventions"][0]["detail"])
        self.assertEqual(events[0]["payload"]["suggestions"], ["next"])

    def test_collect_direct_operator_reply_accumulates_chunks(self) -> None:
        services = self._runtime_services(SimpleNamespace())

        with mock.patch.object(
            direct_chat_runtime_service,
            "build_direct_operator_reply",
            return_value=iter(
                [
                    {"type": "chunk", "delta": "Hello "},
                    {"type": "chunk", "delta": "world"},
                    {"type": "final", "payload": {"actions": [], "mode": "answer"}},
                ]
            ),
        ):
            payload = direct_chat_runtime_service.collect_direct_operator_reply(
                services=services,
                message="hi",
                workspace_id="default",
                requested_model="gpt-5.4",
                requested_provider="openai",
            )

        self.assertEqual(payload["reply"], "Hello world")
        self.assertEqual(payload["mode"], "answer")

    def test_build_direct_operator_reply_uses_session_turn_request_fallback(self) -> None:
        captured: dict[str, object] = {}
        prepared = SimpleNamespace(
            normalized_message="hello from turn",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="openai",
            normalized_requested_model="gpt-5.4",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[],
            proactive_suggestions=[],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="help",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )
        services = self._runtime_services(prepared)
        def _prepare_direct_chat_request(**kwargs):
            captured["kwargs"] = kwargs
            return prepared
        services.prepare_direct_chat_request = _prepare_direct_chat_request

        turn_request = {
            "workspace_id": "default",
            "session_id": "thread-1",
            "channel": "web",
            "actor": {"type": "user", "id": "user-1", "display_name": "user-1"},
            "message": "hello from turn",
        }

        list(
            direct_chat_runtime_service.build_direct_operator_reply(
                services=services,
                message="fallback",
                workspace_id="default",
                requested_model="gpt-5.4",
                requested_provider="openai",
                session_ctx={"agent_turn_request": turn_request},
            )
        )

        resolved_turn_request = captured["kwargs"]["resolved_turn_request"]
        self.assertEqual(resolved_turn_request.workspace_id, "default")
        self.assertEqual(resolved_turn_request.message, "hello from turn")

    def test_build_direct_operator_reply_hydrates_prior_messages_from_thread_store(self) -> None:
        captured: dict[str, object] = {}
        prepared = SimpleNamespace(
            normalized_message="hello from turn",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="openai",
            normalized_requested_model="gpt-5.4",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[{"role": "user", "content": "Earlier instruction"}],
            proactive_suggestions=[],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="help",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )
        services = self._runtime_services(prepared)

        def _prepare_direct_chat_request(**kwargs):
            captured["kwargs"] = kwargs
            return prepared

        services.prepare_direct_chat_request = _prepare_direct_chat_request
        turn_request = {
            "tenant_id": "tenant-1",
            "workspace_id": "default",
            "thread_id": "thread-1",
            "session_id": "thread-1",
            "channel": "web",
            "actor": {"type": "user", "id": "user-1", "display_name": "user-1"},
            "message": "hello from turn",
        }

        with mock.patch.object(
            direct_chat_runtime_service,
            "_hydrate_prior_messages_from_thread_store",
            return_value=[
                {"role": "user", "content": "Earlier instruction"},
                {"role": "assistant", "content": "Earlier reply"},
            ],
        ) as hydrate_mock:
            list(
                direct_chat_runtime_service.build_direct_operator_reply(
                    services=services,
                    message="fallback",
                    workspace_id="default",
                    thread_id="thread-1",
                    requested_model="gpt-5.4",
                    requested_provider="openai",
                    prior_messages=[],
                    session_ctx={"agent_turn_request": turn_request},
                )
            )

        hydrate_mock.assert_called_once_with(
            workspace_id="default",
            tenant_id="tenant-1",
            thread_id="thread-1",
            current_message="hello from turn",
        )
        self.assertEqual(
            captured["kwargs"]["prior_messages"],
            [
                {"role": "user", "content": "Earlier instruction"},
                {"role": "assistant", "content": "Earlier reply"},
            ],
        )

    def test_build_chat_turn_event_stream_prefers_request_meta_turn_request(self) -> None:
        captured: dict[str, object] = {}
        services = self._runtime_services(SimpleNamespace())

        def _build_direct_operator_reply(**kwargs):
            captured.update(kwargs)
            return iter(())

        with mock.patch.object(
            direct_chat_runtime_service,
            "build_direct_operator_reply",
            side_effect=_build_direct_operator_reply,
        ):
            list(
                direct_chat_runtime_service.build_chat_turn_event_stream(
                    services=services,
                    session_ctx={
                        "workspace_id": "context-workspace",
                        "thread_id": "context-thread",
                        "agent_turn_request": {
                            "workspace_id": "context-workspace",
                            "session_id": "context-thread",
                            "channel": "web",
                            "actor": {"type": "user", "id": "context-user", "display_name": "context-user"},
                            "message": "context message",
                        },
                    },
                    message="fallback",
                    request_meta={
                        "workspace_id": "meta-workspace",
                        "thread_id": "meta-thread",
                        "agent_turn_request": {
                            "workspace_id": "meta-workspace",
                            "session_id": "meta-thread",
                            "channel": "web",
                            "actor": {"type": "user", "id": "meta-user", "display_name": "meta-user"},
                            "message": "meta message",
                        },
                    },
                )
            )

        self.assertEqual(captured["message"], "meta message")
        self.assertEqual(captured["workspace_id"], "meta-workspace")
        self.assertEqual(captured["thread_id"], "meta-thread")
        self.assertEqual(captured["agent_turn_request"].workspace_id, "meta-workspace")

    def test_build_chat_turn_event_stream_resumes_trace_context_from_request_meta(self) -> None:
        captured: dict[str, object] = {}
        services = self._runtime_services(SimpleNamespace())
        trace_context = agent_trace_service.TraceContext(
            trace_id="trace-1",
            workspace_id="meta-workspace",
            tenant_id="tenant-1",
            thread_id="meta-thread",
            run_id=None,
            root_agent_id="sage",
        )

        def _build_direct_operator_reply(**kwargs):
            captured.update(kwargs)
            return iter(())

        with mock.patch.object(
            direct_chat_runtime_service,
            "build_direct_operator_reply",
            side_effect=_build_direct_operator_reply,
        ), mock.patch.object(
            direct_chat_runtime_service,
            "run_async_tool_call",
            side_effect=lambda awaitable: (awaitable.close(), trace_context)[1],
        ):
            list(
                direct_chat_runtime_service.build_chat_turn_event_stream(
                    services=services,
                    session_ctx={"workspace_id": "meta-workspace", "thread_id": "meta-thread"},
                    message="fallback",
                    request_meta={
                        "workspace_id": "meta-workspace",
                        "thread_id": "meta-thread",
                        "trace": {
                            "trace_id": "trace-1",
                            "workspace_id": "meta-workspace",
                            "tenant_id": "tenant-1",
                            "thread_id": "meta-thread",
                            "root_agent_id": "sage",
                        },
                    },
                )
            )

        self.assertIs(captured["trace_context"], trace_context)

    def test_build_direct_operator_reply_returns_explicit_provider_unavailable_when_provider_changes(self) -> None:
        prepared = SimpleNamespace(
            normalized_message="hello",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="anthropic",
            normalized_requested_model="claude-3-7-sonnet",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[],
            proactive_suggestions=["Connect Anthropic"],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )
        services = self._runtime_services(prepared)
        services.resolve_provider_for_direct_chat_message = lambda workspace_id, requested_provider, message, tools_present=False: ("openai", {"api_key": "sk-test"})

        events = list(
            direct_chat_runtime_service.build_direct_operator_reply(
                services=services,
                message="hello",
                workspace_id="default",
                requested_model="claude-3-7-sonnet",
                requested_provider="anthropic",
            )
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "final")
        payload = events[0]["payload"]
        self.assertEqual(payload["mode"], "connect")
        self.assertEqual(payload["interventions"][0]["title"], "Anthropic is not available")
        self.assertEqual(payload["suggestions"], ["Connect Anthropic"])

    def test_build_direct_operator_reply_returns_explicit_provider_unavailable_when_not_ready(self) -> None:
        prepared = SimpleNamespace(
            normalized_message="hello",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="anthropic",
            normalized_requested_model="claude-3-7-sonnet",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[],
            proactive_suggestions=["Connect Anthropic"],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )
        services = self._runtime_services(prepared)
        services.resolve_provider_for_direct_chat_message = lambda workspace_id, requested_provider, message, tools_present=False: ("anthropic", {})
        services.supports_direct_message_native_chat = lambda provider, credentials: provider == "openai" and bool(credentials)
        services.supported_providers = ["openai", "anthropic"]

        events = list(
            direct_chat_runtime_service.build_direct_operator_reply(
                services=services,
                message="hello",
                workspace_id="default",
                requested_model="claude-3-7-sonnet",
                requested_provider="anthropic",
            )
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "final")
        payload = events[0]["payload"]
        self.assertEqual(payload["mode"], "connect")
        self.assertEqual(payload["interventions"][0]["title"], "Anthropic is not available")
        self.assertEqual(payload["suggestions"], ["Connect Anthropic"])

    def test_build_direct_operator_reply_keeps_obvious_tool_intent_provider_backed_when_provider_ready(self) -> None:
        prepared = SimpleNamespace(
            normalized_message="List the files on my desktop.",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="deepseek",
            normalized_requested_model="deepseek-chat",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[],
            proactive_suggestions=[],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[{"name": "file__read"}, {"name": "memory_search"}],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )
        services = self._runtime_services(prepared)
        services.supported_providers = ["openai", "deepseek"]
        services.message_has_obvious_direct_tool_intent = lambda message, tools: True
        services.resolve_provider_for_direct_chat_message = (
            lambda workspace_id, requested_provider, message, tools_present=False: ("deepseek", {"api_key": "sk-test"})
        )
        services.supports_direct_message_native_chat = lambda provider, credentials: provider == "deepseek" and bool(credentials)
        captured: dict[str, object] = {}

        def _provider_stream(**kwargs):
            captured["context_tools"] = (kwargs.get("context") or {}).get("tools")
            captured["metadata_tools"] = (kwargs.get("metadata") or {}).get("tools")
            yield {
                "type": "result",
                "reply": "",
                "provider": "deepseek",
                "model": "deepseek-chat",
                "tool_calls": [{"id": "call-1", "name": "file__read", "arguments": {"path": "~/Desktop"}}],
                "attempted_providers": "deepseek",
                "error": "",
                "usage_masked": {},
            }

        services.direct_chat_generation_services.generate_chat_reply_stream_with_provider_fallback = _provider_stream

        events = list(
            direct_chat_runtime_service.build_direct_operator_reply(
                services=services,
                message="List the files on my desktop.",
                workspace_id="default",
                requested_model="deepseek-chat",
                requested_provider="deepseek",
            )
        )

        self.assertEqual(captured["context_tools"], [{"name": "file__read"}])
        self.assertEqual(captured["metadata_tools"], [{"name": "file__read"}])
        self.assertFalse(any(event.get("detail") == "Completed" and event.get("id") == "direct-tools:auto" for event in events))

    def test_build_direct_operator_reply_forces_explicit_tool_request_even_when_provider_ready(self) -> None:
        prepared = SimpleNamespace(
            normalized_message="Use the local shell tool to run ls ~/Desktop and return the result exactly.",
            normalized_workspace_id="default",
            normalized_thread_id="thread-1",
            normalized_requested_provider="ollama",
            normalized_requested_model="qwen2.5:1.5b",
            normalized_reasoning_effort="medium",
            compaction={},
            compacted_prior_messages=[],
            proactive_suggestions=[],
            tool_loop_session_key="loop",
            availability_payload={"ai_ready": True},
            connected_systems=[],
            tool_capabilities=[],
            tools=[{"name": "shell__exec"}],
            approved_action_payload=None,
            base_context_used={"workspace_id": "default"},
            slash_command_name="",
            slash_remainder="",
            resolved_chat_max_iterations=3,
        )
        services = self._runtime_services(prepared)
        services.supported_providers = ["ollama"]
        services.message_has_obvious_direct_tool_intent = lambda message, tools: True
        services.resolve_provider_for_direct_chat_message = (
            lambda workspace_id, requested_provider, message, tools_present=False: ("ollama", {})
        )
        services.supports_direct_message_native_chat = lambda provider, credentials: provider == "ollama"
        services.no_provider_execution_services.parse_tool_name = lambda name: tuple(str(name).split("__", 1))
        services.no_provider_execution_services.tool_arguments_payload = (
            lambda arguments: arguments if isinstance(arguments, dict) else {}
        )
        executed: dict[str, object] = {}

        def _execute_single_tool_call(**kwargs):
            executed.update(kwargs)
            return "Desktop file A\nDesktop file B"

        services.no_provider_execution_services.execute_single_tool_call = _execute_single_tool_call
        services.direct_chat_generation_services.generate_chat_reply_stream_with_provider_fallback = (
            lambda **kwargs: (_ for _ in ()).throw(AssertionError("provider generation should not run"))
        )

        events = list(
            direct_chat_runtime_service.build_direct_operator_reply(
                services=services,
                message=prepared.normalized_message,
                workspace_id="default",
                requested_model="qwen2.5:1.5b",
                requested_provider="ollama",
            )
        )

        self.assertEqual(executed["tool_call"]["name"], "shell__exec")
        self.assertEqual(executed["tool_call"]["arguments"]["command"], "ls ~/Desktop")
        self.assertEqual(events[-1]["type"], "final")
        self.assertIn("Desktop file A", events[-1]["payload"]["reply"])
        self.assertEqual(events[-1]["payload"]["provider"], "ollama")
        self.assertEqual(events[-1]["payload"]["context_used"]["effective_provider"], "ollama")


if __name__ == "__main__":
    unittest.main()
