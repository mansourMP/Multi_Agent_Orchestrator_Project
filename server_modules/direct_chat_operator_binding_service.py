from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from server_modules import direct_chat_composition_service
from server_modules import direct_chat_routing_service
from server_modules import direct_chat_tool_catalog_service
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
