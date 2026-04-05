from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from server_modules import direct_chat_availability_service
from server_modules import direct_chat_composition_service
from server_modules import direct_chat_entry_policy_service
from server_modules import direct_chat_handoff_facade_service
from server_modules import direct_chat_operator_support_service
from server_modules import direct_chat_prompt_service
from server_modules import direct_chat_provider_facade_service
from server_modules import direct_chat_routing_service
from server_modules import direct_chat_support_binding_service
from server_modules import direct_chat_tool_catalog_service
from server_modules import direct_tool_approval_service
from server_modules import direct_tool_execution_service
from server_modules import direct_tool_runtime_facade_service


@dataclass(slots=True)
class DirectChatOperatorRuntimeBindings:
    callback_facade_inputs: Any
    generation_services: Any
    runtime_facade_callbacks: Any
    prepare_request: Any
    response_services: Any
    runtime_services: Any


@dataclass(slots=True)
class DirectChatOperatorPolicyBindings:
    routing_policy_callbacks: Any
    tool_policy_callbacks: Any
    direct_tool_execution_callbacks: Any


@dataclass(slots=True)
class DirectChatOperatorToolRuntimeBindings:
    direct_tool_step_payload: Any
    no_provider_execution_services: Any
    build_direct_tool_approval_response: Any
    message_has_obvious_direct_tool_intent: Any
    execute_single_direct_tool_call: Any
    execute_direct_tool_calls: Any


@dataclass(slots=True)
class DirectChatOperatorEntryBindings:
    build_direct_chat_system_prompt: Any
    direct_chat_runtime_available: Any
    resolve_direct_chat_availability: Any
    connected_provider_tokens: Any
    resolve_provider_for_direct_chat_message: Any
    plan_direct_chat_route: Any
    credential_auth_mode: Any
    supports_direct_message_native_chat: Any
    preferred_provider: Any
    provider_unavailable_response: Any
    direct_chat_credentials: Any
    direct_chat_error_reply: Any


@dataclass(slots=True)
class DirectChatOperatorHandoffBindings:
    durable_run_preferred_response: Any
    run_handoff_execution_target: Any
    can_auto_start_run_handoff: Any
    direct_chat_run_handoff_failure_payload: Any
    start_direct_chat_run_handoff: Any
    direct_chat_run_handoff_reply: Any
    direct_chat_run_actions: Any
    direct_chat_run_snapshot: Any
    direct_chat_run_event_to_step: Any
    direct_chat_run_snapshot_to_step: Any
    direct_chat_run_final_payload: Any
    stream_direct_chat_run_handoff: Any


@dataclass(slots=True)
class DirectChatOperatorAvailabilityBindings:
    question_like: Any
    mentions_any: Any
    starts_like_direct_run: Any
    is_obvious_telegram_write_request: Any
    is_obvious_google_write_request: Any
    is_obvious_smtp_write_request: Any
    connector_write_preview_allowed: Any
    is_explicit_workflow_request: Any
    no_ai_chat_response: Any
    tool_gate_response: Any
    suggest_actions: Any
    heartbeat_pending_tasks_for_suggestions: Any
    recent_run_prompts_for_suggestions: Any
    build_proactive_suggestions: Any


@dataclass(slots=True)
class DirectChatOperatorToolRoutingBindings:
    message_requests_http_request_tool: Any
    message_requests_image_generation_tool: Any
    message_requests_browser_tool: Any
    message_can_use_direct_connector_tools: Any
    looks_like_local_path_request: Any
    message_requests_local_file_tool: Any
    message_requests_local_shell_tool: Any
    message_requests_local_screenshot_tool: Any
    message_requests_local_computer_tool: Any
    message_can_use_direct_local_tools: Any
    message_can_use_builtin_direct_tools: Any
    approval_required_for_direct_tool: Any
    preview_run_response: Any
    prefer_durable_run_handoff: Any


def _lookup(namespace: Dict[str, Any], name: str) -> Any:
    if name in namespace:
        value = namespace[name]
    else:
        value = namespace.get(f"_{name}")
    if value is None:
        raise KeyError(f"Missing operator binding '{name}'")
    return value


def parse_tool_name(tool_name: str) -> tuple[str, str]:
    token = str(tool_name or "").strip()
    if token == "http_request":
        return "http", "request"
    if token == "generate_image":
        return "image", "generate"
    if token == "memory_search":
        return "memory", "search"
    if token == "memory_get":
        return "memory", "get"
    if "__" not in token:
        raise RuntimeError(f"Unsupported direct chat tool '{token}'.")
    connector_id, action_id = token.split("__", 1)
    connector_id = connector_id.strip().lower()
    action_id = action_id.strip()
    if not connector_id or not action_id:
        raise RuntimeError(f"Unsupported direct chat tool '{token}'.")
    return connector_id, action_id


def tool_arguments_payload(arguments: Any, *, parse_json_object_loose_fn: Any) -> Dict[str, Any]:
    if isinstance(arguments, dict):
        return dict(arguments)
    parsed = parse_json_object_loose_fn(str(arguments or ""))
    return dict(parsed) if isinstance(parsed, dict) else {}


def normalize_direct_approved_action(value: Any) -> Optional[Dict[str, str]]:
    if not isinstance(value, dict):
        return None
    connector_id = str(value.get("connector") or "").strip().lower()
    action_id = str(value.get("action") or "").strip()
    tool_input = str(value.get("input") or "").strip()
    if not connector_id or not action_id or not tool_input:
        return None
    return {
        "connector": connector_id,
        "action": action_id,
        "input": tool_input,
    }


def titleize_direct_step_token(value: str) -> str:
    words = [part for part in str(value or "").strip().replace("-", "_").split("_") if part]
    return " ".join(word.capitalize() for word in words)


def compact_step_detail(value: Any, limit: int = 120) -> Optional[str]:
    normalized = " ".join(str(value or "").split()).strip()
    if not normalized:
        return None
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 1].rstrip()}…"


def build_direct_tool_execution_callbacks(
    *,
    namespace: Dict[str, Any],
    parse_json_object_loose: Any,
    llm_task: Any,
    web_search: Any,
    web_fetch: Any,
    search_memory_notebook: Any,
    get_memory_notebook_excerpt: Any,
):
    return direct_tool_runtime_facade_service.build_direct_tool_execution_callbacks(
        namespace={
            "compact_step_detail": _lookup(namespace, "compact_step_detail"),
            "titleize_direct_step_token": _lookup(namespace, "titleize_direct_step_token"),
            "run_async_tool_call": _lookup(namespace, "run_async_tool_call"),
            "parse_tool_name": _lookup(namespace, "parse_tool_name"),
            "tool_arguments_payload": _lookup(namespace, "tool_arguments_payload"),
            "safe_positive_int": _lookup(namespace, "safe_positive_int"),
            "normalize_reasoning_effort": _lookup(namespace, "normalize_reasoning_effort"),
            "build_direct_local_tool_config": _lookup(namespace, "build_direct_local_tool_config"),
            "format_direct_local_tool_result": _lookup(namespace, "format_direct_local_tool_result"),
            "build_direct_tool_config": _lookup(namespace, "build_direct_tool_config"),
            "format_direct_tool_result": _lookup(namespace, "format_direct_tool_result"),
        },
        parse_json_object_loose=parse_json_object_loose,
        llm_task=llm_task,
        web_search=web_search,
        web_fetch=web_fetch,
        search_memory_notebook=search_memory_notebook,
        get_memory_notebook_excerpt=get_memory_notebook_excerpt,
    )


def build_direct_chat_routing_policy_callbacks(
    *,
    namespace: Dict[str, Any],
    complex_task_sequence_markers: tuple[str, ...] | list[str],
    complex_task_outcome_markers: tuple[str, ...] | list[str],
    execution_markers: tuple[str, ...] | list[str],
    google_workspace_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
) -> direct_chat_routing_service.DirectChatRoutingPolicyCallbacks:
    return direct_chat_routing_service.DirectChatRoutingPolicyCallbacks(
        compact_text=_lookup(namespace, "compact_text"),
        mentions_any=_lookup(namespace, "mentions_any"),
        question_like=_lookup(namespace, "question_like"),
        is_explicit_workflow_request=_lookup(namespace, "is_explicit_workflow_request"),
        starts_like_direct_run=_lookup(namespace, "starts_like_direct_run"),
        workflow_action=_lookup(namespace, "workflow_action"),
        run_action=_lookup(namespace, "run_action"),
        message_requests_local_file_tool=_lookup(namespace, "message_requests_local_file_tool"),
        message_requests_local_shell_tool=_lookup(namespace, "message_requests_local_shell_tool"),
        message_requests_local_screenshot_tool=_lookup(namespace, "message_requests_local_screenshot_tool"),
        complex_task_sequence_markers=complex_task_sequence_markers,
        complex_task_outcome_markers=complex_task_outcome_markers,
        execution_markers=execution_markers,
        google_workspace_keywords=google_workspace_keywords,
        telegram_keywords=telegram_keywords,
        slack_keywords=slack_keywords,
        dropbox_keywords=dropbox_keywords,
        s3_keywords=s3_keywords,
    )


def build_direct_chat_tool_policy_callbacks(
    *,
    namespace: Dict[str, Any],
    google_workspace_keywords: tuple[str, ...] | list[str],
    smtp_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    discord_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
    browser_keywords: tuple[str, ...] | list[str],
    local_file_keywords: tuple[str, ...] | list[str],
    local_shell_keywords: tuple[str, ...] | list[str],
    local_screenshot_keywords: tuple[str, ...] | list[str],
    local_computer_control_keywords: tuple[str, ...] | list[str],
    web_lookup_keywords: tuple[str, ...] | list[str],
    http_request_keywords: tuple[str, ...] | list[str],
    image_generation_keywords: tuple[str, ...] | list[str],
    llm_task_keywords: tuple[str, ...] | list[str],
) -> direct_chat_tool_catalog_service.DirectChatToolPolicyCallbacks:
    return direct_chat_tool_catalog_service.DirectChatToolPolicyCallbacks(
        compact_text=_lookup(namespace, "compact_text"),
        question_like=_lookup(namespace, "question_like"),
        mentions_any=_lookup(namespace, "mentions_any"),
        extract_first_path_reference=_lookup(namespace, "extract_first_path_reference"),
        extract_first_url=_lookup(namespace, "extract_first_url"),
        provider_supports_direct_tool_calls=_lookup(namespace, "provider_supports_direct_tool_calls"),
        is_obvious_smtp_write_request=_lookup(namespace, "is_obvious_smtp_write_request"),
        google_workspace_keywords=google_workspace_keywords,
        smtp_keywords=smtp_keywords,
        telegram_keywords=telegram_keywords,
        slack_keywords=slack_keywords,
        discord_keywords=discord_keywords,
        dropbox_keywords=dropbox_keywords,
        s3_keywords=s3_keywords,
        browser_keywords=browser_keywords,
        local_file_keywords=local_file_keywords,
        local_shell_keywords=local_shell_keywords,
        local_screenshot_keywords=local_screenshot_keywords,
        local_computer_control_keywords=local_computer_control_keywords,
        web_lookup_keywords=web_lookup_keywords,
        http_request_keywords=http_request_keywords,
        image_generation_keywords=image_generation_keywords,
        llm_task_keywords=llm_task_keywords,
    )


def build_direct_chat_callback_facade_inputs(
    *,
    namespace: Dict[str, Any],
    parse_page_state: Any,
    capture_exception: Any,
    generate_chat_reply_stream_with_provider_fallback: Any,
    compact_conversation_history: Any,
    parse_memory_write: Any,
    parse_memory_read: Any,
    handle_memory_request: Any,
    list_memory_entries: Any,
    get_memory: Any,
    delete_memory: Any,
    no_provider_reasoning_required_response: Any,
    supported_providers: list[str],
    direct_chat_compaction_token_limit: int,
):
    callback_namespace = {
        name: _lookup(namespace, name)
        for name in direct_chat_composition_service._CALLBACK_INPUT_NAMES
    }
    return direct_chat_composition_service.build_direct_chat_callback_facade_inputs(
        namespace=callback_namespace,
        parse_page_state=parse_page_state,
        capture_exception=capture_exception,
        generate_chat_reply_stream_with_provider_fallback=generate_chat_reply_stream_with_provider_fallback,
        compact_conversation_history=compact_conversation_history,
        parse_memory_write=parse_memory_write,
        parse_memory_read=parse_memory_read,
        handle_memory_request=handle_memory_request,
        list_memory_entries=list_memory_entries,
        get_memory=get_memory,
        delete_memory=delete_memory,
        no_provider_reasoning_required_response=no_provider_reasoning_required_response,
        supported_providers=supported_providers,
        direct_chat_compaction_token_limit=direct_chat_compaction_token_limit,
    )


def build_direct_chat_runtime_bindings(
    *,
    namespace: Dict[str, Any],
    parse_page_state: Any,
    capture_exception: Any,
    generate_chat_reply_stream_with_provider_fallback: Any,
    compact_conversation_history: Any,
    parse_memory_write: Any,
    parse_memory_read: Any,
    handle_memory_request: Any,
    list_memory_entries: Any,
    get_memory: Any,
    delete_memory: Any,
    no_provider_reasoning_required_response: Any,
    supported_providers: list[str],
    direct_chat_compaction_token_limit: int,
) -> DirectChatOperatorRuntimeBindings:
    def callback_facade_inputs():
        return build_direct_chat_callback_facade_inputs(
            namespace=namespace,
            parse_page_state=parse_page_state,
            capture_exception=capture_exception,
            generate_chat_reply_stream_with_provider_fallback=generate_chat_reply_stream_with_provider_fallback,
            compact_conversation_history=compact_conversation_history,
            parse_memory_write=parse_memory_write,
            parse_memory_read=parse_memory_read,
            handle_memory_request=handle_memory_request,
            list_memory_entries=list_memory_entries,
            get_memory=get_memory,
            delete_memory=delete_memory,
            no_provider_reasoning_required_response=no_provider_reasoning_required_response,
            supported_providers=supported_providers,
            direct_chat_compaction_token_limit=direct_chat_compaction_token_limit,
        )

    def generation_services():
        return direct_chat_composition_service.build_direct_chat_generation_services(
            callback_facade_inputs()
        )

    def runtime_facade_callbacks():
        return direct_chat_composition_service.build_direct_chat_runtime_facade_callbacks(
            callback_facade_inputs()
        )

    def prepare_request(**kwargs):
        return direct_chat_composition_service.prepare_direct_chat_request(
            callbacks=runtime_facade_callbacks(),
            **kwargs,
        )

    def response_services():
        return direct_chat_composition_service.build_direct_chat_response_services(
            callbacks=runtime_facade_callbacks(),
        )

    def runtime_services():
        return direct_chat_composition_service.build_direct_chat_runtime_services(
            callbacks=runtime_facade_callbacks(),
        )

    return DirectChatOperatorRuntimeBindings(
        callback_facade_inputs=callback_facade_inputs,
        generation_services=generation_services,
        runtime_facade_callbacks=runtime_facade_callbacks,
        prepare_request=prepare_request,
        response_services=response_services,
        runtime_services=runtime_services,
    )


def build_direct_chat_policy_bindings(
    *,
    namespace: Dict[str, Any],
    complex_task_sequence_markers: tuple[str, ...] | list[str],
    complex_task_outcome_markers: tuple[str, ...] | list[str],
    execution_markers: tuple[str, ...] | list[str],
    google_workspace_keywords: tuple[str, ...] | list[str],
    smtp_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    discord_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
    browser_keywords: tuple[str, ...] | list[str],
    local_file_keywords: tuple[str, ...] | list[str],
    local_shell_keywords: tuple[str, ...] | list[str],
    local_screenshot_keywords: tuple[str, ...] | list[str],
    local_computer_control_keywords: tuple[str, ...] | list[str],
    web_lookup_keywords: tuple[str, ...] | list[str],
    http_request_keywords: tuple[str, ...] | list[str],
    image_generation_keywords: tuple[str, ...] | list[str],
    llm_task_keywords: tuple[str, ...] | list[str],
    parse_json_object_loose: Any,
    llm_task: Any,
    web_search: Any,
    web_fetch: Any,
    search_memory_notebook: Any,
    get_memory_notebook_excerpt: Any,
) -> DirectChatOperatorPolicyBindings:
    def routing_policy_callbacks():
        return build_direct_chat_routing_policy_callbacks(
            namespace=namespace,
            complex_task_sequence_markers=complex_task_sequence_markers,
            complex_task_outcome_markers=complex_task_outcome_markers,
            execution_markers=execution_markers,
            google_workspace_keywords=google_workspace_keywords,
            telegram_keywords=telegram_keywords,
            slack_keywords=slack_keywords,
            dropbox_keywords=dropbox_keywords,
            s3_keywords=s3_keywords,
        )

    def tool_policy_callbacks():
        return build_direct_chat_tool_policy_callbacks(
            namespace=namespace,
            google_workspace_keywords=google_workspace_keywords,
            smtp_keywords=smtp_keywords,
            telegram_keywords=telegram_keywords,
            slack_keywords=slack_keywords,
            discord_keywords=discord_keywords,
            dropbox_keywords=dropbox_keywords,
            s3_keywords=s3_keywords,
            browser_keywords=browser_keywords,
            local_file_keywords=local_file_keywords,
            local_shell_keywords=local_shell_keywords,
            local_screenshot_keywords=local_screenshot_keywords,
            local_computer_control_keywords=local_computer_control_keywords,
            web_lookup_keywords=web_lookup_keywords,
            http_request_keywords=http_request_keywords,
            image_generation_keywords=image_generation_keywords,
            llm_task_keywords=llm_task_keywords,
        )

    def direct_tool_execution_callbacks():
        return build_direct_tool_execution_callbacks(
            namespace=namespace,
            parse_json_object_loose=parse_json_object_loose,
            llm_task=llm_task,
            web_search=web_search,
            web_fetch=web_fetch,
            search_memory_notebook=search_memory_notebook,
            get_memory_notebook_excerpt=get_memory_notebook_excerpt,
        )

    return DirectChatOperatorPolicyBindings(
        routing_policy_callbacks=routing_policy_callbacks,
        tool_policy_callbacks=tool_policy_callbacks,
        direct_tool_execution_callbacks=direct_tool_execution_callbacks,
    )


def build_direct_chat_tool_runtime_bindings(
    *,
    direct_chat_runtime_facade_callbacks: Any,
    direct_tool_execution_callbacks: Any,
    execute_single_direct_tool_call_fn: Any,
) -> DirectChatOperatorToolRuntimeBindings:
    def direct_tool_step_payload(
        connector_id,
        action_id,
        arguments,
        *,
        step_id,
        status,
        detail_override=None,
    ):
        return direct_tool_execution_service.direct_tool_step_payload(
            connector_id,
            action_id,
            arguments,
            step_id=step_id,
            status=status,
            detail_override=detail_override,
            callbacks=direct_tool_execution_callbacks(),
        )

    def no_provider_execution_services():
        return direct_tool_runtime_facade_service.build_no_provider_execution_services(
            callbacks=direct_chat_runtime_facade_callbacks(),
        )

    def build_direct_tool_approval_response(*, tool_calls, tool_capabilities, session_ctx=None):
        return direct_tool_runtime_facade_service.build_direct_tool_approval_response(
            tool_calls=tool_calls,
            tool_capabilities=tool_capabilities,
            session_ctx=session_ctx,
            callbacks=direct_chat_runtime_facade_callbacks(),
        )

    def message_has_obvious_direct_tool_intent(message, tools):
        return direct_tool_runtime_facade_service.message_has_obvious_direct_tool_intent(
            message,
            tools,
            callbacks=direct_chat_runtime_facade_callbacks(),
        )

    def execute_single_direct_tool_call(
        *,
        tool_call,
        workspace_id,
        thread_id,
        index=1,
        provider=None,
        model=None,
        credentials=None,
        reasoning_effort="",
        session_ctx=None,
    ):
        return direct_tool_execution_service.execute_single_direct_tool_call(
            tool_call=tool_call,
            workspace_id=workspace_id,
            thread_id=thread_id,
            index=index,
            provider=provider,
            model=model,
            credentials=credentials,
            reasoning_effort=reasoning_effort,
            session_ctx=session_ctx,
            callbacks=direct_tool_execution_callbacks(),
        )

    def execute_direct_tool_calls(
        *,
        tool_calls,
        workspace_id,
        thread_id,
        provider=None,
        model=None,
        credentials=None,
        reasoning_effort="",
        session_ctx=None,
    ):
        return direct_tool_execution_service.execute_direct_tool_calls(
            tool_calls=tool_calls,
            workspace_id=workspace_id,
            thread_id=thread_id,
            provider=provider,
            model=model,
            credentials=credentials,
            reasoning_effort=reasoning_effort,
            session_ctx=session_ctx,
            execute_single_tool_call=execute_single_direct_tool_call_fn,
        )

    return DirectChatOperatorToolRuntimeBindings(
        direct_tool_step_payload=direct_tool_step_payload,
        no_provider_execution_services=no_provider_execution_services,
        build_direct_tool_approval_response=build_direct_tool_approval_response,
        message_has_obvious_direct_tool_intent=message_has_obvious_direct_tool_intent,
        execute_single_direct_tool_call=execute_single_direct_tool_call,
        execute_direct_tool_calls=execute_direct_tool_calls,
    )


def build_direct_chat_entry_bindings(
    *,
    availability_lines: Any,
    build_operator_system_prompt: Any,
    memory_tool_names: Any,
    local_worker_registry: Dict[str, Any],
    is_worker_online_fn: Any,
    preferred_provider_fn: Any,
    supports_direct_message_native_chat_fn: Any,
    resolve_workspace_tool_capabilities_fn: Any,
    supported_providers: list[str] | tuple[str, ...],
    direct_chat_credentials_fn: Any,
    build_provider_credential_candidates_fn: Any,
    compact_text_fn: Any,
    mentions_any_fn: Any,
    message_requests_local_file_tool_fn: Any,
    message_requests_local_shell_tool_fn: Any,
    message_requests_local_screenshot_tool_fn: Any,
    message_requests_local_computer_tool_fn: Any,
    is_obvious_smtp_write_request_fn: Any,
    preview_run_response_fn: Any,
    prefer_durable_run_handoff_fn: Any,
    durable_run_preferred_response_fn: Any,
    message_can_use_direct_connector_tools_fn: Any,
    message_can_use_direct_local_tools_fn: Any,
    message_can_use_builtin_direct_tools_fn: Any,
    can_auto_start_run_handoff_fn: Any,
    credential_auth_mode_fn: Any,
    normalize_auth_mode_fn: Any,
    get_claude_code_session_token_fn: Any,
    provider_has_key_fn: Any,
    connect_action_fn: Any,
    chat_iteration_limit_reply_fn: Any,
    safe_positive_int_fn: Any,
    chat_max_iterations_default: int,
    google_workspace_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    discord_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
) -> DirectChatOperatorEntryBindings:
    def build_direct_chat_system_prompt(*, workspace_id, availability, tools):
        return direct_chat_prompt_service.build_system_prompt(
            workspace_id=workspace_id,
            availability=availability,
            tools=tools,
            availability_lines=availability_lines,
            build_operator_system_prompt=build_operator_system_prompt,
            memory_tool_names=memory_tool_names,
        )

    def direct_chat_runtime_available():
        return direct_chat_entry_policy_service.direct_chat_runtime_available(
            local_worker_registry,
            is_worker_online_fn=is_worker_online_fn,
        )

    def resolve_direct_chat_availability(workspace_id, requested_provider="", availability_override=None):
        return direct_chat_entry_policy_service.resolve_direct_chat_availability(
            workspace_id,
            requested_provider,
            direct_chat_runtime_available_fn=direct_chat_runtime_available,
            preferred_provider_fn=preferred_provider_fn,
            supports_direct_message_native_chat_fn=supports_direct_message_native_chat_fn,
            resolve_workspace_tool_capabilities_fn=resolve_workspace_tool_capabilities_fn,
            availability_override=availability_override,
        )

    def connected_provider_tokens(workspace_id):
        return direct_chat_entry_policy_service.connected_provider_tokens(
            workspace_id,
            supported_providers=supported_providers,
            direct_chat_credentials_fn=direct_chat_credentials_fn,
        )

    def resolve_provider_for_direct_chat_message(workspace_id, requested_provider, message, *, tools_present):
        return direct_chat_entry_policy_service.resolve_provider_for_direct_chat_message(
            workspace_id,
            requested_provider,
            message,
            tools_present=tools_present,
            preferred_provider_fn=preferred_provider_fn,
            direct_chat_credentials_fn=direct_chat_credentials_fn,
            supports_direct_message_native_chat_fn=supports_direct_message_native_chat_fn,
            compact_text_fn=compact_text_fn,
            mentions_any_fn=mentions_any_fn,
            message_requests_local_file_tool_fn=message_requests_local_file_tool_fn,
            message_requests_local_shell_tool_fn=message_requests_local_shell_tool_fn,
            message_requests_local_screenshot_tool_fn=message_requests_local_screenshot_tool_fn,
            message_requests_local_computer_tool_fn=message_requests_local_computer_tool_fn,
            google_workspace_keywords=google_workspace_keywords,
            telegram_keywords=telegram_keywords,
            slack_keywords=slack_keywords,
            dropbox_keywords=dropbox_keywords,
            s3_keywords=s3_keywords,
        )

    def plan_direct_chat_route(*, message, availability, provider, tools):
        return direct_chat_entry_policy_service.plan_direct_chat_route(
            message=message,
            availability=availability,
            provider=provider,
            tools=tools,
            compact_text_fn=compact_text_fn,
            mentions_any_fn=mentions_any_fn,
            is_obvious_smtp_write_request_fn=is_obvious_smtp_write_request_fn,
            preview_run_response_fn=preview_run_response_fn,
            prefer_durable_run_handoff_fn=prefer_durable_run_handoff_fn,
            durable_run_preferred_response_fn=durable_run_preferred_response_fn,
            message_can_use_direct_connector_tools_fn=lambda inner_message: message_can_use_direct_connector_tools_fn(
                inner_message,
                provider=provider,
                tools=tools,
            ),
            message_can_use_direct_local_tools_fn=lambda inner_message: message_can_use_direct_local_tools_fn(
                inner_message,
                provider=provider,
                tools=tools,
            ),
            message_can_use_builtin_direct_tools_fn=lambda inner_message: message_can_use_builtin_direct_tools_fn(
                inner_message,
                tools=tools,
            ),
            can_auto_start_run_handoff_fn=can_auto_start_run_handoff_fn,
            google_workspace_keywords=google_workspace_keywords,
            telegram_keywords=telegram_keywords,
            slack_keywords=slack_keywords,
            discord_keywords=discord_keywords,
            dropbox_keywords=dropbox_keywords,
            s3_keywords=s3_keywords,
        )

    def credential_auth_mode(provider, credentials):
        return direct_chat_provider_facade_service.credential_auth_mode(
            provider,
            credentials,
            normalize_auth_mode_fn=normalize_auth_mode_fn,
        )

    def supports_direct_message_native_chat(provider, credentials):
        return direct_chat_provider_facade_service.supports_direct_message_native_chat(
            provider,
            credentials,
            credential_auth_mode_fn=credential_auth_mode_fn,
            get_claude_code_session_token_fn=get_claude_code_session_token_fn,
            provider_has_key_fn=provider_has_key_fn,
        )

    def preferred_provider(workspace_id, requested_provider=""):
        return direct_chat_provider_facade_service.preferred_provider(
            workspace_id,
            requested_provider,
            supported_providers=supported_providers,
            direct_chat_credentials_fn=direct_chat_credentials_fn,
            supports_direct_message_native_chat_fn=supports_direct_message_native_chat_fn,
            credential_auth_mode_fn=credential_auth_mode_fn,
        )

    def provider_unavailable_response(provider):
        return direct_chat_provider_facade_service.provider_unavailable_response(
            provider,
            connect_action_fn=connect_action_fn,
        )

    def direct_chat_credentials(workspace_id, provider):
        return direct_chat_provider_facade_service.direct_chat_credentials(
            workspace_id,
            provider,
            build_provider_credential_candidates_fn=build_provider_credential_candidates_fn,
        )

    def direct_chat_error_reply(llm_error):
        return direct_chat_provider_facade_service.direct_chat_error_reply(
            llm_error,
            chat_iteration_limit_reply_fn=chat_iteration_limit_reply_fn,
            safe_positive_int_fn=safe_positive_int_fn,
            chat_max_iterations_default=chat_max_iterations_default,
        )

    return DirectChatOperatorEntryBindings(
        build_direct_chat_system_prompt=build_direct_chat_system_prompt,
        direct_chat_runtime_available=direct_chat_runtime_available,
        resolve_direct_chat_availability=resolve_direct_chat_availability,
        connected_provider_tokens=connected_provider_tokens,
        resolve_provider_for_direct_chat_message=resolve_provider_for_direct_chat_message,
        plan_direct_chat_route=plan_direct_chat_route,
        credential_auth_mode=credential_auth_mode,
        supports_direct_message_native_chat=supports_direct_message_native_chat,
        preferred_provider=preferred_provider,
        provider_unavailable_response=provider_unavailable_response,
        direct_chat_credentials=direct_chat_credentials,
        direct_chat_error_reply=direct_chat_error_reply,
    )


def build_direct_chat_handoff_bindings(
    *,
    run_action_fn: Any,
    safe_positive_int_fn: Any,
    open_action_fn: Any,
    build_context_used_fn: Any,
    direct_chat_run_snapshot_fn: Any | None = None,
    direct_chat_run_event_to_step_fn: Any | None = None,
    direct_chat_run_snapshot_to_step_fn: Any | None = None,
    direct_chat_run_final_payload_fn: Any | None = None,
    live_window_seconds: float,
    poll_seconds: float,
    monotonic_fn: Any,
    sleep_fn: Any,
) -> DirectChatOperatorHandoffBindings:
    def durable_run_preferred_response(message: str) -> Dict[str, Any]:
        return direct_chat_handoff_facade_service.durable_run_preferred_response(
            message,
            run_action_fn=run_action_fn,
        )

    def direct_chat_run_handoff_failure_payload(message: str, error_detail: str) -> Dict[str, Any]:
        return direct_chat_handoff_facade_service.direct_chat_run_handoff_failure_payload(
            message,
            error_detail,
            run_action_fn=run_action_fn,
        )

    def start_direct_chat_run_handoff(
        *,
        message: str,
        workspace_id: str,
        requested_provider: str,
        requested_model: str,
        thread_id: str,
        availability: Dict[str, Any],
        max_iterations: Optional[int],
    ) -> Dict[str, Any]:
        return direct_chat_handoff_facade_service.start_direct_chat_run_handoff(
            message=message,
            workspace_id=workspace_id,
            requested_provider=requested_provider,
            requested_model=requested_model,
            thread_id=thread_id,
            availability=availability,
            max_iterations=max_iterations,
            safe_positive_int_fn=safe_positive_int_fn,
        )

    def direct_chat_run_handoff_reply(started: Dict[str, Any]) -> Dict[str, Any]:
        return direct_chat_handoff_facade_service.direct_chat_run_handoff_reply(
            started,
            open_action_fn=open_action_fn,
        )

    def direct_chat_run_actions(
        run_id: str,
        *,
        waiting_for_confirmation: bool = False,
    ) -> list[Dict[str, Any]]:
        return direct_chat_handoff_facade_service.direct_chat_run_actions(
            run_id,
            waiting_for_confirmation=waiting_for_confirmation,
            open_action_fn=open_action_fn,
        )

    def direct_chat_run_final_payload(
        *,
        run_id: str,
        run: Optional[Dict[str, Any]],
        snapshot: Dict[str, Any],
        requested_workspace_id: str,
        requested_provider: str,
        requested_model: str,
        reasoning_effort: Optional[str],
        connected_systems: list[str],
        tool_capabilities: list[Dict[str, Any]],
        fallback_reason: Optional[str],
        reply_override: Optional[str] = None,
        continuing: bool = False,
    ) -> Dict[str, Any]:
        return direct_chat_handoff_facade_service.direct_chat_run_final_payload(
            run_id=run_id,
            run=run,
            snapshot=snapshot,
            requested_workspace_id=requested_workspace_id,
            requested_provider=requested_provider,
            requested_model=requested_model,
            reasoning_effort=reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            fallback_reason=fallback_reason,
            reply_override=reply_override,
            continuing=continuing,
            build_context_used_fn=build_context_used_fn,
            open_action_fn=open_action_fn,
        )

    def stream_direct_chat_run_handoff(
        *,
        started_run: Dict[str, Any],
        requested_workspace_id: str,
        requested_provider: str,
        requested_model: str,
        reasoning_effort: Optional[str],
        connected_systems: list[str],
        tool_capabilities: list[Dict[str, Any]],
        fallback_reason: Optional[str],
    ):
        return direct_chat_handoff_facade_service.stream_direct_chat_run_handoff(
            started_run=started_run,
            requested_workspace_id=requested_workspace_id,
            requested_provider=requested_provider,
            requested_model=requested_model,
            reasoning_effort=reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            fallback_reason=fallback_reason,
            direct_chat_run_snapshot_fn=direct_chat_run_snapshot_fn
            or direct_chat_handoff_facade_service.direct_chat_run_snapshot,
            direct_chat_run_event_to_step_fn=direct_chat_run_event_to_step_fn
            or direct_chat_handoff_facade_service.direct_chat_run_event_to_step,
            direct_chat_run_snapshot_to_step_fn=direct_chat_run_snapshot_to_step_fn
            or direct_chat_handoff_facade_service.direct_chat_run_snapshot_to_step,
            direct_chat_run_final_payload_fn=direct_chat_run_final_payload_fn or direct_chat_run_final_payload,
            open_action_fn=open_action_fn,
            build_context_used_fn=build_context_used_fn,
            live_window_seconds=live_window_seconds,
            poll_seconds=poll_seconds,
            monotonic_fn=monotonic_fn,
            sleep_fn=sleep_fn,
        )

    return DirectChatOperatorHandoffBindings(
        durable_run_preferred_response=durable_run_preferred_response,
        run_handoff_execution_target=direct_chat_handoff_facade_service.run_handoff_execution_target,
        can_auto_start_run_handoff=direct_chat_handoff_facade_service.can_auto_start_run_handoff,
        direct_chat_run_handoff_failure_payload=direct_chat_run_handoff_failure_payload,
        start_direct_chat_run_handoff=start_direct_chat_run_handoff,
        direct_chat_run_handoff_reply=direct_chat_run_handoff_reply,
        direct_chat_run_actions=direct_chat_run_actions,
        direct_chat_run_snapshot=direct_chat_handoff_facade_service.direct_chat_run_snapshot,
        direct_chat_run_event_to_step=direct_chat_handoff_facade_service.direct_chat_run_event_to_step,
        direct_chat_run_snapshot_to_step=direct_chat_handoff_facade_service.direct_chat_run_snapshot_to_step,
        direct_chat_run_final_payload=direct_chat_run_final_payload,
        stream_direct_chat_run_handoff=stream_direct_chat_run_handoff,
    )


def build_direct_chat_availability_bindings(
    *,
    compact_text_fn: Any,
    normalize_tool_capabilities_fn: Any,
    tool_connected_fn: Any,
    tool_runtime_usable_fn: Any,
    connect_action_fn: Any,
    google_repair_action_fn: Any,
    workflow_action_fn: Any,
    run_action_fn: Any,
    workspace_context_dir_fn: Any,
    memory_suggestion_prompts_fn: Any,
    question_openers: tuple[str, ...] | list[str],
    direct_run_openers: tuple[str, ...] | list[str],
    workflow_request_markers: tuple[str, ...] | list[str],
    execution_markers: tuple[str, ...] | list[str],
    google_workspace_keywords: tuple[str, ...] | list[str],
    smtp_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
) -> DirectChatOperatorAvailabilityBindings:
    def question_like(compact_message: str) -> bool:
        return direct_chat_availability_service.question_like(
            compact_message,
            question_openers=question_openers,
        )

    def mentions_any(compact_message: str, markers) -> bool:
        return direct_chat_availability_service.mentions_any(
            compact_message,
            markers=markers,
        )

    def starts_like_direct_run(compact_message: str) -> bool:
        return direct_chat_availability_service.starts_like_direct_run(
            compact_message,
            direct_run_openers=direct_run_openers,
        )

    def is_obvious_telegram_write_request(compact_message: str) -> bool:
        return direct_chat_availability_service.is_obvious_telegram_write_request(
            compact_message,
            question_like_fn=question_like,
            mentions_any_fn=mentions_any,
            starts_like_direct_run_fn=starts_like_direct_run,
            telegram_keywords=telegram_keywords,
        )

    def is_obvious_google_write_request(compact_message: str) -> bool:
        return direct_chat_availability_service.is_obvious_google_write_request(
            compact_message,
            question_like_fn=question_like,
            starts_like_direct_run_fn=starts_like_direct_run,
        )

    def is_obvious_smtp_write_request(compact_message: str) -> bool:
        return direct_chat_availability_service.is_obvious_smtp_write_request(
            compact_message,
            question_like_fn=question_like,
            mentions_any_fn=mentions_any,
            starts_like_direct_run_fn=starts_like_direct_run,
            smtp_keywords=smtp_keywords,
        )

    def connector_write_preview_allowed(message: str, availability: Dict[str, Any]) -> bool:
        return direct_chat_availability_service.connector_write_preview_allowed(
            message,
            availability,
            compact_text_fn=compact_text_fn,
            is_obvious_telegram_write_request_fn=is_obvious_telegram_write_request,
            is_obvious_google_write_request_fn=is_obvious_google_write_request,
            is_obvious_smtp_write_request_fn=is_obvious_smtp_write_request,
            tool_runtime_usable_fn=tool_runtime_usable_fn,
        )

    def is_explicit_workflow_request(message: str) -> bool:
        return direct_chat_availability_service.is_explicit_workflow_request(
            message,
            compact_text_fn=compact_text_fn,
            mentions_any_fn=mentions_any,
            workflow_request_markers=workflow_request_markers,
        )

    def no_ai_chat_response(availability: Dict[str, Any]) -> Dict[str, Any]:
        return direct_chat_availability_service.no_ai_chat_response(
            availability,
            normalize_tool_capabilities_fn=normalize_tool_capabilities_fn,
            connect_action_fn=connect_action_fn,
        )

    def tool_gate_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return direct_chat_availability_service.tool_gate_response(
            message,
            availability,
            compact_text_fn=compact_text_fn,
            mentions_any_fn=mentions_any,
            is_obvious_smtp_write_request_fn=is_obvious_smtp_write_request,
            tool_connected_fn=tool_connected_fn,
            tool_runtime_usable_fn=tool_runtime_usable_fn,
            connect_action_fn=connect_action_fn,
            google_repair_action_fn=google_repair_action_fn,
            google_workspace_keywords=google_workspace_keywords,
            telegram_keywords=telegram_keywords,
            slack_keywords=slack_keywords,
            dropbox_keywords=dropbox_keywords,
            s3_keywords=s3_keywords,
        )

    def suggest_actions(message: str, availability: Dict[str, Any]) -> list[Dict[str, Any]]:
        return direct_chat_availability_service.suggest_actions(
            message,
            availability,
            compact_text_fn=compact_text_fn,
            mentions_any_fn=mentions_any,
            question_like_fn=question_like,
            is_explicit_workflow_request_fn=is_explicit_workflow_request,
            is_obvious_smtp_write_request_fn=is_obvious_smtp_write_request,
            tool_runtime_usable_fn=tool_runtime_usable_fn,
            workflow_action_fn=workflow_action_fn,
            run_action_fn=run_action_fn,
            google_workspace_keywords=google_workspace_keywords,
            telegram_keywords=telegram_keywords,
            slack_keywords=slack_keywords,
            dropbox_keywords=dropbox_keywords,
            s3_keywords=s3_keywords,
            execution_markers=execution_markers,
        )

    def heartbeat_pending_tasks_for_suggestions() -> list[str]:
        return direct_chat_support_binding_service.heartbeat_pending_tasks_for_suggestions(
            workspace_context_dir_fn=workspace_context_dir_fn,
        )

    def recent_run_prompts_for_suggestions(workspace_id: str) -> list[str]:
        return direct_chat_operator_support_service.recent_run_prompts_for_suggestions(workspace_id)

    def build_proactive_suggestions(workspace_id: str) -> list[str]:
        return direct_chat_support_binding_service.build_proactive_suggestions(
            workspace_id,
            heartbeat_tasks=heartbeat_pending_tasks_for_suggestions,
            recent_run_prompts=recent_run_prompts_for_suggestions,
            memory_suggestion_prompts=memory_suggestion_prompts_fn,
        )

    return DirectChatOperatorAvailabilityBindings(
        question_like=question_like,
        mentions_any=mentions_any,
        starts_like_direct_run=starts_like_direct_run,
        is_obvious_telegram_write_request=is_obvious_telegram_write_request,
        is_obvious_google_write_request=is_obvious_google_write_request,
        is_obvious_smtp_write_request=is_obvious_smtp_write_request,
        connector_write_preview_allowed=connector_write_preview_allowed,
        is_explicit_workflow_request=is_explicit_workflow_request,
        no_ai_chat_response=no_ai_chat_response,
        tool_gate_response=tool_gate_response,
        suggest_actions=suggest_actions,
        heartbeat_pending_tasks_for_suggestions=heartbeat_pending_tasks_for_suggestions,
        recent_run_prompts_for_suggestions=recent_run_prompts_for_suggestions,
        build_proactive_suggestions=build_proactive_suggestions,
    )


def build_direct_chat_tool_routing_bindings(
    *,
    direct_chat_tool_policy_callbacks: Any,
    direct_chat_routing_policy_callbacks: Any,
    compact_text_fn: Any,
) -> DirectChatOperatorToolRoutingBindings:
    def message_requests_http_request_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_http_request_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_requests_image_generation_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_image_generation_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_requests_browser_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_browser_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_can_use_direct_connector_tools(message: str, *, provider: str, tools) -> bool:
        return direct_chat_tool_catalog_service.message_can_use_direct_connector_tools(
            message,
            provider=provider,
            tools=tools,
            callbacks=direct_chat_tool_policy_callbacks(),
        )

    def message_requests_local_file_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_local_file_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_requests_local_shell_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_local_shell_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_requests_local_screenshot_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_local_screenshot_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_requests_local_computer_tool(message: str) -> bool:
        return direct_chat_tool_catalog_service.message_requests_local_computer_tool(
            message,
            direct_chat_tool_policy_callbacks(),
        )

    def message_can_use_direct_local_tools(message: str, *, provider: str, tools) -> bool:
        return direct_chat_tool_catalog_service.message_can_use_direct_local_tools(
            message,
            provider=provider,
            tools=tools,
            callbacks=direct_chat_tool_policy_callbacks(),
        )

    def message_can_use_builtin_direct_tools(message: str, *, tools) -> bool:
        return direct_chat_tool_catalog_service.message_can_use_builtin_direct_tools(
            message,
            tools=tools,
            callbacks=direct_chat_tool_policy_callbacks(),
        )

    def approval_required_for_direct_tool(
        connector_id: str,
        action_id: str,
        arguments: dict[str, Any],
        tool_capabilities: list[dict[str, Any]],
    ) -> bool:
        return direct_tool_approval_service.approval_required_for_direct_tool(
            connector_id,
            action_id,
            arguments,
            tool_capabilities,
            compact_text=compact_text_fn,
        )

    def preview_run_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return direct_chat_routing_service.preview_run_response(
            message,
            availability,
            direct_chat_routing_policy_callbacks(),
        )

    def prefer_durable_run_handoff(message: str, availability: Dict[str, Any]) -> bool:
        return direct_chat_routing_service.prefer_durable_run_handoff(
            message,
            availability,
            direct_chat_routing_policy_callbacks(),
        )

    return DirectChatOperatorToolRoutingBindings(
        message_requests_http_request_tool=message_requests_http_request_tool,
        message_requests_image_generation_tool=message_requests_image_generation_tool,
        message_requests_browser_tool=message_requests_browser_tool,
        message_can_use_direct_connector_tools=message_can_use_direct_connector_tools,
        looks_like_local_path_request=direct_chat_tool_catalog_service.looks_like_local_path_request,
        message_requests_local_file_tool=message_requests_local_file_tool,
        message_requests_local_shell_tool=message_requests_local_shell_tool,
        message_requests_local_screenshot_tool=message_requests_local_screenshot_tool,
        message_requests_local_computer_tool=message_requests_local_computer_tool,
        message_can_use_direct_local_tools=message_can_use_direct_local_tools,
        message_can_use_builtin_direct_tools=message_can_use_builtin_direct_tools,
        approval_required_for_direct_tool=approval_required_for_direct_tool,
        preview_run_response=preview_run_response,
        prefer_durable_run_handoff=prefer_durable_run_handoff,
    )
