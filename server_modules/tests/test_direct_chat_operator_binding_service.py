import unittest

from server_modules import direct_chat_operator_binding_service as service


def _operator_namespace() -> dict:
    return {
        "_compact_text": lambda value: str(value or "").strip().lower(),
        "_mentions_any": lambda message, markers: False,
        "_question_like": lambda message: False,
        "_is_explicit_workflow_request": lambda message: False,
        "_starts_like_direct_run": lambda message: True,
        "_workflow_action": lambda message: {"kind": "workflow"},
        "_run_action": lambda message: {"kind": "run"},
        "_message_requests_local_file_tool": lambda message: False,
        "_message_requests_local_shell_tool": lambda message: False,
        "_message_requests_local_screenshot_tool": lambda message: False,
        "_extract_first_path_reference": lambda value: "",
        "_extract_first_url": lambda value: "",
        "_provider_supports_direct_tool_calls": lambda provider: True,
        "_is_obvious_smtp_write_request": lambda message: False,
        "_thinking_step_payload": lambda *args, **kwargs: {"type": "step"},
        "_build_context_used": lambda **kwargs: kwargs,
        "_build_direct_tool_approval_response": lambda **kwargs: None,
        "_parse_tool_name": lambda name: ("connector", "action"),
        "_tool_arguments_payload": lambda arguments: arguments if isinstance(arguments, dict) else {},
        "_direct_tool_step_payload": lambda *args, **kwargs: {"type": "step"},
        "_execute_single_direct_tool_call": lambda **kwargs: "tool reply",
        "_direct_tool_followup_message": lambda tool_name, result_text: result_text,
        "_suggest_actions": lambda message, availability: [],
        "_clear_direct_tool_loop_state": lambda session_key: None,
        "_persist_direct_chat_memory_best_effort": lambda **kwargs: None,
        "_persist_direct_chat_transcript_best_effort": lambda **kwargs: None,
        "_record_direct_tool_signature": lambda session_key, tool_call: False,
        "_direct_chat_error_reply": lambda error: error,
        "_safe_positive_int": lambda value, default=0: default,
        "_resolve_chat_local_path": lambda path: path,
        "_approval_required_for_direct_tool": lambda connector_id, action_id, arguments, tool_capabilities: False,
        "_agent_machine_full_trust_for_session": lambda session_ctx: False,
        "_direct_chat_session_key": lambda workspace_id, thread_id: f"{workspace_id}:{thread_id}",
        "_resolved_chat_iteration_limit": lambda value=None: 3,
        "_session_model_preference": lambda session_key: {"provider": None, "model": None},
        "_normalize_reasoning_effort": lambda value="": str(value or "").strip().lower() or None,
        "_parse_slash_command": lambda message: {},
        "_set_session_model_preference": lambda session_key, provider=None, model=None: None,
        "_mark_thread_cleared": lambda session_key: None,
        "_normalize_prior_messages": lambda prior_messages: list(prior_messages or []),
        "_consume_thread_cleared": lambda session_key: False,
        "_build_proactive_suggestions": lambda workspace_id: [],
        "_direct_tool_session_key": lambda workspace_id, thread_id: f"tool:{workspace_id}:{thread_id}",
        "_resolve_direct_chat_availability": lambda workspace_id, requested_provider="", availability_override=None: {},
        "_connected_system_labels": lambda availability: [],
        "_context_tool_capabilities": lambda availability: [],
        "_build_direct_chat_tools": lambda tool_capabilities: [],
        "_build_local_direct_chat_tools": lambda availability: [],
        "_build_builtin_direct_chat_tools": lambda: [],
        "_normalize_direct_approved_action": lambda value: value,
        "_with_context_used": lambda payload, context: {**payload, "context_used": context},
        "_connected_provider_tokens": lambda workspace_id: ["openai"],
        "_active_run_count": lambda workspace_id: 0,
        "_slash_command_help_text": lambda: "help text",
        "_execute_direct_tool_calls": lambda **kwargs: "tool reply",
        "_direct_chat_credentials": lambda workspace_id, provider: {"api_key": "sk-test"},
        "_tool_gate_response": lambda message, availability: None,
        "_tool_write_action_available": lambda connector, action, capabilities: True,
        "_approved_action_to_tool_call": lambda approved_action: approved_action,
        "_resolve_provider_for_direct_chat_message": lambda workspace_id, requested_provider, message, **kwargs: ("openai", {}),
        "_plan_direct_chat_route": lambda **kwargs: None,
        "_start_direct_chat_run_handoff": lambda **kwargs: {"run_id": "run-1"},
        "_direct_chat_run_handoff_reply": lambda started: {"reply": "handoff"},
        "_stream_direct_chat_run_handoff": lambda **kwargs: iter(()),
        "_direct_chat_run_handoff_failure_payload": lambda message, detail: {"reply": detail},
        "_supports_direct_message_native_chat": lambda provider, credentials: True,
        "_build_direct_chat_system_prompt": lambda **kwargs: "system prompt",
        "_direct_chat_workspace_context_text": lambda workspace_id, memory_query="": "",
        "_compact_step_detail": lambda value, limit=120: "detail",
        "_titleize_direct_step_token": lambda value: "Title",
        "_run_async_tool_call": lambda coro: None,
        "_build_direct_local_tool_config": lambda connector_id, action_id, arguments: ("computer", arguments),
        "_format_direct_local_tool_result": lambda result: "local result",
        "_build_direct_tool_config": lambda connector_id, action_id, tool_input: {"value": tool_input},
        "_format_direct_tool_result": lambda result: "result",
    }


class DirectChatOperatorBindingServiceTests(unittest.TestCase):
    def test_parse_tool_name_handles_builtin_and_connector_tools(self) -> None:
        self.assertEqual(service.parse_tool_name("memory_search"), ("memory", "search"))
        self.assertEqual(service.parse_tool_name("telegram__send"), ("telegram", "send"))

    def test_build_direct_tool_execution_callbacks_reads_underscored_namespace(self) -> None:
        callbacks = service.build_direct_tool_execution_callbacks(
            namespace=_operator_namespace(),
            parse_json_object_loose=lambda value: {},
            llm_task=lambda **kwargs: None,
            web_search=lambda **kwargs: None,
            web_fetch=lambda **kwargs: None,
            search_memory_notebook=lambda *args, **kwargs: [],
            get_memory_notebook_excerpt=lambda *args, **kwargs: "",
        )

        self.assertEqual(callbacks.titleize_direct_step_token("send"), "Title")
        self.assertEqual(callbacks.compact_step_detail("value"), "detail")

    def test_build_direct_chat_callback_facade_inputs_reads_underscored_namespace(self) -> None:
        namespace = _operator_namespace()

        inputs = service.build_direct_chat_callback_facade_inputs(
            namespace=namespace,
            parse_page_state=lambda payload: payload,
            capture_exception=lambda exc: None,
            generate_chat_reply_stream_with_provider_fallback=lambda **kwargs: iter(()),
            compact_conversation_history=lambda **kwargs: {"messages": [], "history_mode": "none", "prior_messages_used": False},
            parse_memory_write=lambda value: None,
            parse_memory_read=lambda value: None,
            handle_memory_request=lambda workspace_id, message: None,
            list_memory_entries=lambda workspace_id: [],
            get_memory=lambda workspace_id: "",
            delete_memory=lambda workspace_id, key: False,
            no_provider_reasoning_required_response=lambda: {"reply": "fallback", "actions": [], "mode": "answer"},
            supported_providers=["openai"],
            direct_chat_compaction_token_limit=12000,
        )

        self.assertIs(inputs.execute_single_direct_tool_call, namespace["_execute_single_direct_tool_call"])
        self.assertIs(inputs.build_context_used, namespace["_build_context_used"])
        self.assertEqual(inputs.supported_providers, ["openai"])

    def test_build_direct_chat_runtime_bindings_reads_underscored_namespace(self) -> None:
        namespace = _operator_namespace()

        bindings = service.build_direct_chat_runtime_bindings(
            namespace=namespace,
            parse_page_state=lambda payload: payload,
            capture_exception=lambda exc: None,
            generate_chat_reply_stream_with_provider_fallback=lambda **kwargs: iter(()),
            compact_conversation_history=lambda **kwargs: {"messages": [], "history_mode": "none", "prior_messages_used": False},
            parse_memory_write=lambda value: None,
            parse_memory_read=lambda value: None,
            handle_memory_request=lambda workspace_id, message: None,
            list_memory_entries=lambda workspace_id: [],
            get_memory=lambda workspace_id: "",
            delete_memory=lambda workspace_id, key: False,
            no_provider_reasoning_required_response=lambda: {"reply": "fallback", "actions": [], "mode": "answer"},
            supported_providers=["openai"],
            direct_chat_compaction_token_limit=12000,
        )

        inputs = bindings.callback_facade_inputs()
        callbacks = bindings.runtime_facade_callbacks()
        services_payload = bindings.response_services()

        self.assertIs(inputs.build_context_used, namespace["_build_context_used"])
        self.assertIs(callbacks.resolve_provider_for_direct_chat_message, namespace["_resolve_provider_for_direct_chat_message"])
        self.assertIsNotNone(services_payload)


if __name__ == "__main__":
    unittest.main()
