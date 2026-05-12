from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence
import uuid

from server_modules.agent_turn import (
    resolve_agent_turn_request_from_runtime_context,
    resolve_agent_turn_request_with_fallback,
)
from server_modules import agent_trace_service
from server_modules import direct_chat_tool_catalog_service
from server_modules import direct_chat_generation_service
from server_modules import direct_chat_provider_service
from server_modules import direct_chat_prompt_service
from server_modules import direct_chat_response_service
from server_modules import no_provider_service
from server_modules import thread_service
from server_modules.direct_chat_context_service import should_exclude_prior_message
from server_modules.direct_tool_config_service import run_async_tool_call


@dataclass(slots=True)
class DirectChatRuntimeServices:
    prepare_direct_chat_request: Callable[..., Any]
    direct_chat_response_services: direct_chat_response_service.DirectChatResponseServices
    tool_gate_response: Callable[[str, Dict[str, Any]], Optional[Dict[str, Any]]]
    with_context_used: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
    tool_write_action_available: Callable[[str, str, List[Dict[str, Any]]], bool]
    approved_action_to_tool_call: Callable[[Dict[str, str]], Dict[str, Any]]
    message_has_obvious_direct_tool_intent: Callable[[str, List[Dict[str, Any]]], bool]
    no_provider_execution_services: no_provider_service.NoProviderExecutionServices
    build_context_used: Callable[..., Dict[str, Any]]
    resolve_provider_for_direct_chat_message: Callable[[str, str, str], tuple[str, Dict[str, Any]]]
    plan_direct_chat_route: Callable[..., Any]
    start_direct_chat_run_handoff: Callable[..., Dict[str, Any]]
    direct_chat_run_handoff_reply: Callable[[Dict[str, Any]], Dict[str, Any]]
    stream_direct_chat_run_handoff: Callable[..., Iterator[Dict[str, Any]]]
    direct_chat_run_handoff_failure_payload: Callable[[str, str], Dict[str, Any]]
    supports_direct_message_native_chat: Callable[[str, Optional[Dict[str, Any]]], bool]
    supported_providers: Sequence[str]
    build_direct_chat_system_prompt: Callable[..., str]
    direct_chat_workspace_context_text: Callable[[str], str]
    direct_chat_generation_services: direct_chat_generation_service.DirectChatGenerationServices
    no_provider_reasoning_required_response: Callable[[], Dict[str, Any]]
    capture_exception: Callable[[BaseException], None]


def _message_targets_local_file_inventory(message: str) -> bool:
    compact = " ".join(str(message or "").strip().lower().split())
    if not compact:
        return False
    if no_provider_service.looks_like_directory_listing_request(message):
        return True
    listing_tokens = (
        "list files",
        "show files",
        "what files",
        "which files",
        "files on my",
        "files in my",
        "files in the",
        "contents of",
        "folder contents",
        "directory contents",
        "directory listing",
        "list the contents",
    )
    location_tokens = ("desktop", "downloads", "documents", "folder", "directory", "repo", "repository")
    return any(token in compact for token in listing_tokens) and any(token in compact for token in location_tokens)


def _message_requests_local_machine_action(message: str) -> bool:
    compact = " ".join(str(message or "").strip().lower().split())
    if not compact:
        return False
    if no_provider_service.looks_like_directory_listing_request(message):
        return True
    local_hints = (
        "my laptop",
        "my computer",
        "this computer",
        "my mac",
        "my desktop",
        "desktop",
        "downloads",
        "documents",
        "local file",
        "local files",
        "terminal",
        "shell",
        "screenshot",
        "clipboard",
        "window",
        "app on my",
    )
    action_hints = (
        "find",
        "read",
        "open",
        "show",
        "list",
        "search",
        "run",
        "execute",
        "click",
        "type",
        "copy",
        "paste",
        "capture",
    )
    if any(token in compact for token in local_hints) and any(token in compact for token in action_hints):
        return True
    return bool(re.search(r"(^|\s)(/|~/|\./|\.\./|[a-z]:[/\\])", compact, flags=re.IGNORECASE)) and any(
        token in compact for token in action_hints
    )


def _local_setup_required_payload(
    *,
    availability_payload: Dict[str, Any],
    proactive_suggestions: List[str],
    base_context_used: Dict[str, Any],
    services: DirectChatRuntimeServices,
) -> Dict[str, Any]:
    capability_truth = (
        availability_payload.get("capability_truth")
        if isinstance(availability_payload.get("capability_truth"), dict)
        else {}
    )
    my_computer = capability_truth.get("my_computer") if isinstance(capability_truth.get("my_computer"), dict) else {}
    setup_actions_raw = (
        capability_truth.get("required_setup_actions")
        if isinstance(capability_truth.get("required_setup_actions"), list)
        else []
    )
    actions: List[Dict[str, Any]] = []
    for item in setup_actions_raw:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        href = str(item.get("href") or "").strip()
        if not label or not href:
            continue
        actions.append(
            {
                "id": str(item.get("id") or f"open:{href}").strip() or f"open:{href}",
                "kind": "open",
                "label": label,
                "href": href,
                "variant": "primary",
            }
        )
        if len(actions) >= 3:
            break
    if not actions:
        actions.append(
            {
                "id": "open:/integrations",
                "kind": "open",
                "label": "Open Connected Apps",
                "href": "/integrations",
                "variant": "primary",
            }
        )

    local_tools_available = bool(my_computer.get("local_tools_available"))
    online = bool(my_computer.get("online"))
    runtime_ok = bool(my_computer.get("runtime_ok"))
    if not online:
        detail = "I can do that after you connect My Computer. Open Connected Apps to connect this device."
    elif online and not runtime_ok:
        detail = "My Computer is connected, but Gateway is not ready. Open Connected Apps and restart Gateway."
    elif not local_tools_available:
        detail = "Local computer tools are not ready yet for this workspace. Open Connected Apps to finish setup."
    else:
        detail = "This local action needs setup before I can run it. Open Connected Apps to continue."

    return services.with_context_used(
        {
            "reply": "",
            "actions": actions,
            "mode": "connect",
            "interventions": [
                direct_chat_response_service.build_intervention(
                    "connect_required",
                    "My Computer setup required",
                    detail=detail,
                    severity="warning",
                    status="waiting",
                    code="local_setup_required",
                )
            ],
            "suggestions": proactive_suggestions,
        },
        base_context_used,
    )


def _provider_chat_tools_for_message(message: str, tools: List[Dict[str, Any]], *, obvious_direct_tool_intent: bool) -> List[Dict[str, Any]]:
    if not obvious_direct_tool_intent:
        return []
    if not tools:
        return []
    if not _message_targets_local_file_inventory(message):
        return tools
    preferred_tool_names = {"file__read", "shell__exec"}
    local_file_tools = [
        item
        for item in tools
        if isinstance(item, dict)
        and str(item.get("name") or "").strip() in preferred_tool_names
    ]
    return local_file_tools or tools


def _message_explicitly_names_direct_tool(message: str, services: DirectChatRuntimeServices) -> bool:
    compact = services.no_provider_execution_services.compact_text(message)
    if "use" not in compact or "tool" not in compact:
        return False
    return any(
        marker in compact
        for marker in (
            "local shell tool",
            "shell tool",
            "web search tool",
            "search tool",
            "fetch url tool",
            "fetch tool",
        )
    )


def _explicit_provider_parity_tool_calls(
    message: str,
    tools: List[Dict[str, Any]],
    services: DirectChatRuntimeServices,
) -> List[Dict[str, Any]]:
    if not _message_explicitly_names_direct_tool(message, services):
        return []
    tool_names = {str(item.get("name") or "").strip() for item in tools if isinstance(item, dict)}
    shell_match = re.search(
        r"\b(?:local\s+)?shell\s+tool\s+to\s+run\s+(.+?)(?:\s+and\s+return\b|\s+then\b|$)",
        str(message or ""),
        flags=re.IGNORECASE,
    )
    if shell_match and "shell__exec" in tool_names:
        command = shell_match.group(1).strip().rstrip(".")
        if command:
            return [{"name": "shell__exec", "arguments": {"command": command}}]
    search_match = re.search(
        r"\bweb\s+search\s+tool\s+to\s+(?:find|search\s+for|look\s+up)\s+(.+?)(?:\s+and\s+return\b|\s+then\b|$)",
        str(message or ""),
        flags=re.IGNORECASE,
    )
    if search_match and "web__search" in tool_names:
        query = search_match.group(1).strip().rstrip(".")
        if query:
            return [{"name": "web__search", "arguments": {"query": query}}]
    execution_services = services.no_provider_execution_services
    planned = no_provider_service.plan_tool_calls(
        message,
        tools,
        compact_text=execution_services.compact_text,
        extract_first_path_reference=execution_services.extract_first_path_reference,
        extract_first_url=execution_services.extract_first_url,
    )
    return [
        call
        for call in planned
        if isinstance(call, dict)
        and str(call.get("name") or "").strip() in tool_names
    ]


def _direct_trace_event(
    trace_context: Optional[Any],
    *,
    event_type: str,
    data: Dict[str, Any],
    tool_call_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if trace_context is None:
        return None
    envelope = run_async_tool_call(
        agent_trace_service.emit_with_envelope(
            trace_context,
            event_type,
            data,
            persisted=True,
            tool_call_id=tool_call_id,
        )
    )
    if not isinstance(envelope, dict):
        return None
    return {"type": "trace", "payload": envelope}


def _stream_explicit_provider_parity_tools(
    *,
    services: DirectChatRuntimeServices,
    tool_calls: List[Dict[str, Any]],
    normalized_workspace_id: str,
    normalized_thread_id: str,
    normalized_requested_provider: str,
    normalized_requested_model: str,
    normalized_reasoning_effort: Optional[str],
    provider: str,
    selected_model: str,
    direct_chat_credentials: Dict[str, Any],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    proactive_suggestions: List[str],
    base_context_used: Dict[str, Any],
    session_ctx: Optional[Dict[str, Any]],
    resolved_trace_context: Optional[Any],
) -> Iterator[Dict[str, Any]]:
    approval_payload = no_provider_service.build_direct_tool_approval_response(
        tool_calls=tool_calls,
        tool_capabilities=tool_capabilities,
        services=services.no_provider_execution_services,
        session_ctx=session_ctx,
    )
    if approval_payload is not None:
        yield {
            "type": "final",
            "payload": _finalize_direct_tool_payload(
                direct_payload={
                    **approval_payload,
                    "provider": provider,
                    "model": selected_model or None,
                    "attempted_providers": provider,
                    "error": "",
                },
                proactive_suggestions=proactive_suggestions,
                workspace_id=normalized_workspace_id,
                requested_provider=normalized_requested_provider,
                requested_model=normalized_requested_model,
                reasoning_effort=normalized_reasoning_effort,
                connected_systems=connected_systems,
                tool_capabilities=tool_capabilities,
                base_context_used=base_context_used,
                services=services,
                fallback_reason="explicit_direct_tool_execution",
                use_base_context=False,
            ),
        }
        return

    yield {
        "type": "step",
        "label": "Using direct tools",
        "detail": "Running explicit tool request",
        "status": "active",
        "kind": "tool",
        "id": "direct-tools:explicit",
    }
    outputs: List[str] = []
    for index, tool_call in enumerate(tool_calls, start=1):
        tool_name = str(tool_call.get("name") or "").strip()
        connector_id, action_id = services.no_provider_execution_services.parse_tool_name(tool_name)
        argument_payload = services.no_provider_execution_services.tool_arguments_payload(tool_call.get("arguments"))
        tool_call_id = str(tool_call.get("id") or "").strip() or f"toolcall_{uuid.uuid4().hex}"
        started = _direct_trace_event(
            resolved_trace_context,
            event_type="tool.started",
            data={
                "tool_name": tool_name,
                "connector_id": connector_id or None,
                "args_preview": argument_payload,
            },
            tool_call_id=tool_call_id,
        )
        if started is not None:
            yield started
        yield services.direct_chat_generation_services.direct_tool_step_payload(
            connector_id,
            action_id,
            argument_payload,
            step_id=f"direct-tools:explicit:{index}",
            status="active",
        )
        tool_result = services.no_provider_execution_services.execute_single_tool_call(
            tool_call=tool_call,
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            index=index,
            provider=provider,
            model=selected_model or None,
            credentials=direct_chat_credentials if isinstance(direct_chat_credentials, dict) else None,
            reasoning_effort=normalized_reasoning_effort or "",
            session_ctx=session_ctx,
        )
        result = _direct_trace_event(
            resolved_trace_context,
            event_type="tool.result",
            data={
                "status": "ok",
                "summary": str(tool_result or "").strip(),
                "artifact_ids": [],
            },
            tool_call_id=tool_call_id,
        )
        if result is not None:
            yield result
        yield services.direct_chat_generation_services.direct_tool_step_payload(
            connector_id,
            action_id,
            argument_payload,
            step_id=f"direct-tools:explicit:{index}",
            status="done",
        )
        outputs.append(str(tool_result or "").strip())

    reply = "\n\n".join(output for output in outputs if output).strip() or "Tool execution completed."
    context_used = services.build_context_used(
        workspace_id=normalized_workspace_id,
        requested_provider=normalized_requested_provider,
        effective_provider=provider,
        requested_model=normalized_requested_model,
        effective_model=selected_model or None,
        reasoning_effort=normalized_reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        prior_messages_used=False,
        history_mode="none",
        run_created=False,
        fallback_used=False,
        fallback_reason="explicit_direct_tool_execution",
    )
    yield {
        "type": "step",
        "label": "Using direct tools",
        "detail": "Completed",
        "status": "done",
        "kind": "tool",
        "id": "direct-tools:explicit",
    }
    yield {
        "type": "final",
        "payload": services.with_context_used(
            {
                "reply": reply,
                "actions": [],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "usage_masked": {},
                "provider": provider,
                "model": selected_model or None,
                "attempted_providers": provider,
                "error": "",
            },
            context_used,
        ),
    }


def _resume_trace_context(
    *,
    session_ctx: Optional[Dict[str, Any]],
    request_meta: Optional[Dict[str, Any]],
    explicit_trace_context: Optional[Any],
) -> Optional[Any]:
    try:
        if explicit_trace_context is not None:
            if isinstance(session_ctx, dict):
                session_ctx.setdefault("trace_context", explicit_trace_context)
            return explicit_trace_context
        if isinstance(session_ctx, dict) and session_ctx.get("trace_context") is not None:
            return session_ctx.get("trace_context")
        trace_payload = None
        if isinstance(request_meta, dict) and isinstance(request_meta.get("trace"), dict):
            trace_payload = dict(request_meta.get("trace") or {})
        elif isinstance(session_ctx, dict) and isinstance(session_ctx.get("trace"), dict):
            trace_payload = dict(session_ctx.get("trace") or {})
        if not isinstance(trace_payload, dict):
            return None
        trace_id = str(trace_payload.get("trace_id") or "").strip()
        tenant_id = str(trace_payload.get("tenant_id") or "").strip()
        workspace_id = str(trace_payload.get("workspace_id") or "").strip()
        if not trace_id or not tenant_id or not workspace_id:
            return None
        resumed = run_async_tool_call(
            agent_trace_service.resume_trace(
                trace_id=trace_id,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                thread_id=str(trace_payload.get("thread_id") or "").strip() or None,
                run_id=str(trace_payload.get("run_id") or "").strip() or None,
                root_agent_id=str(trace_payload.get("root_agent_id") or "").strip() or None,
            )
        )
        if resumed is not None and isinstance(session_ctx, dict):
            session_ctx["trace_context"] = resumed
        return resumed
    except Exception:
        return None


def _hydrate_prior_messages_from_thread_store(
    *,
    workspace_id: str,
    tenant_id: str,
    thread_id: str,
    current_message: str,
) -> List[Dict[str, str]]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_tenant_id = str(tenant_id or "").strip()
    normalized_thread_id = str(thread_id or "").strip()
    normalized_current_message = str(current_message or "").strip()
    if not normalized_workspace_id or not normalized_tenant_id or not normalized_thread_id:
        return []
    try:
        record = run_async_tool_call(
            thread_service.get_thread(
                normalized_thread_id,
                tenant_id=normalized_tenant_id,
                workspace_id=normalized_workspace_id,
                include_turns=True,
            )
        )
    except Exception:
        return []
    if not isinstance(record, dict):
        return []
    hydrated: List[Dict[str, str]] = []
    for turn in list(record.get("turns") or []):
        if not isinstance(turn, dict):
            continue
        role = str(turn.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = str(turn.get("content") or "").strip()
        if not content:
            continue
        if should_exclude_prior_message(role, content, turn.get("status")):
            continue
        hydrated.append({"role": role, "content": content})
    if (
        hydrated
        and hydrated[-1].get("role") == "user"
        and str(hydrated[-1].get("content") or "").strip() == normalized_current_message
    ):
        hydrated.pop()
    return hydrated


def _finalize_direct_tool_payload(
    *,
    direct_payload: Dict[str, Any],
    proactive_suggestions: List[str],
    workspace_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    base_context_used: Dict[str, Any],
    services: DirectChatRuntimeServices,
    fallback_reason: str,
    use_base_context: bool,
) -> Dict[str, Any]:
    if use_base_context:
        context_used = base_context_used
    else:
        context_used = services.build_context_used(
            workspace_id=workspace_id,
            requested_provider=requested_provider,
            effective_provider=None,
            requested_model=requested_model,
            effective_model=None,
            reasoning_effort=reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            prior_messages_used=False,
            history_mode="none",
            run_created=False,
            fallback_used=False,
            fallback_reason=fallback_reason,
        )
    return services.with_context_used({**direct_payload, "suggestions": proactive_suggestions}, context_used)


def _provider_unavailable_payload(
    *,
    provider: str,
    proactive_suggestions: List[str],
    base_context_used: Dict[str, Any],
    services: DirectChatRuntimeServices,
    availability_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    availability = dict(availability_payload or {})
    return services.with_context_used(
        {
            **direct_chat_provider_service.provider_unavailable_response(
                provider,
                connect_action=lambda label, href: {"label": label, "href": href},
                issue_code=str(availability.get("issue_code") or "").strip() or None,
                issue_detail=str(availability.get("issue") or availability.get("runtime_state_detail") or "").strip() or None,
            ),
            "suggestions": proactive_suggestions,
        },
        base_context_used,
    )


def _fallback_tool_payload(
    *,
    message: str,
    workspace_id: str,
    thread_id: str,
    tools: List[Dict[str, Any]],
    tool_capabilities: List[Dict[str, Any]],
    reasoning_effort: Optional[str],
    proactive_suggestions: List[str],
    requested_provider: str,
    requested_model: str,
    connected_systems: List[str],
    services: DirectChatRuntimeServices,
    session_ctx: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    fallback_payload = no_provider_service.execute_no_provider_request(
        message=message,
        workspace_id=workspace_id,
        thread_id=thread_id,
        tools=tools,
        tool_capabilities=tool_capabilities,
        reasoning_effort=reasoning_effort,
        services=services.no_provider_execution_services,
        session_ctx=session_ctx,
    )
    return direct_chat_response_service.unavailable_fallback_payload(
        fallback_payload=fallback_payload,
        proactive_suggestions=proactive_suggestions,
        workspace_id=workspace_id,
        requested_provider=requested_provider,
        requested_model=requested_model,
        reasoning_effort=reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        no_provider_tool_fallback_reason="no_provider_tool_execution",
        unavailable_fallback_reason="provider_unavailable",
        services=services.direct_chat_response_services,
        no_provider_reasoning_required_response_fn=services.no_provider_reasoning_required_response,
    )


def _execute_approved_action_payload(
    *,
    approved_action_payload: Optional[Dict[str, str]],
    workspace_id: str,
    thread_id: str,
    requested_provider: str,
    requested_model: str,
    reasoning_effort: Optional[str],
    session_ctx: Optional[Dict[str, Any]],
    proactive_suggestions: List[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    services: DirectChatRuntimeServices,
) -> Dict[str, Any]:
    from server_modules import direct_tool_config_service, runs_execution

    response_services = services.direct_chat_response_services
    base_context = response_services.build_context_used(
        workspace_id=workspace_id,
        requested_provider=requested_provider,
        effective_provider=None,
        requested_model=requested_model,
        effective_model=None,
        reasoning_effort=reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        prior_messages_used=False,
        history_mode="none",
        run_created=False,
        fallback_used=False,
        fallback_reason=None,
    )
    if approved_action_payload is None:
        return direct_chat_response_service.approval_confirmation_payload(
            approved_action_payload=approved_action_payload,
            workspace_id=workspace_id,
            thread_id=thread_id,
            requested_provider=requested_provider,
            requested_model=requested_model,
            reasoning_effort=reasoning_effort,
            session_ctx=session_ctx,
            proactive_suggestions=proactive_suggestions,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            tool_write_action_available_fn=services.tool_write_action_available,
            approved_action_to_tool_call_fn=services.approved_action_to_tool_call,
            services=response_services,
        )
    if not services.tool_write_action_available(
        approved_action_payload["connector"],
        approved_action_payload["action"],
        tool_capabilities,
    ):
        return direct_chat_response_service.approval_confirmation_payload(
            approved_action_payload=approved_action_payload,
            workspace_id=workspace_id,
            thread_id=thread_id,
            requested_provider=requested_provider,
            requested_model=requested_model,
            reasoning_effort=reasoning_effort,
            session_ctx=session_ctx,
            proactive_suggestions=proactive_suggestions,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            tool_write_action_available_fn=services.tool_write_action_available,
            approved_action_to_tool_call_fn=services.approved_action_to_tool_call,
            services=response_services,
        )
    direct_chat_credentials = response_services.direct_chat_credentials(
        workspace_id,
        requested_provider,
    )

    def _parse_json_object_loose(value: Any) -> Any:
        if isinstance(value, dict):
            return dict(value)
        raw = str(value or "").strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    connector_id = str(approved_action_payload.get("connector") or "").strip().lower()
    action_id = str(approved_action_payload.get("action") or "").strip()
    tool_input = str(approved_action_payload.get("input") or "").strip()
    config = direct_tool_config_service.build_direct_tool_config(
        connector_id,
        action_id,
        tool_input,
        parse_json_object_loose=_parse_json_object_loose,
    )
    try:
        result = runs_execution._workflow_execute_connector_action(
            "direct-chat-approved-action",
            "direct_chat_approved_action",
            {
                "workspace_id": workspace_id,
                "tenant_id": str(
                    (session_ctx or {}).get("tenant_id")
                    or (
                        (session_ctx or {}).get("agent_turn_request", {}).get("tenant_id")
                        if isinstance((session_ctx or {}).get("agent_turn_request"), dict)
                        else ""
                    )
                    or "default"
                ).strip()
                or "default",
                "provider": requested_provider or None,
                "model": requested_model or None,
                "credentials": direct_chat_credentials if isinstance(direct_chat_credentials, dict) else None,
                "metadata": {},
            },
            config,
            current_text=str(config.get("text") or tool_input or "").strip(),
        )
        reply = direct_tool_config_service.format_direct_tool_result(result)
    except Exception as exc:
        response_services.capture_exception(exc)
        return response_services.with_context_used(
            {
                "reply": "",
                "actions": [],
                "interventions": [
                    direct_chat_response_service.build_intervention(
                        "system_error",
                        "Approved action failed",
                        detail=str(exc).strip() or "The approved action could not be executed.",
                        severity="error",
                        status="failed",
                        code="approved_action_failed",
                    )
                ],
                "suggestions": proactive_suggestions,
                "mode": "answer",
                "error": "approved_action_failed",
            },
            base_context,
        )
    return response_services.with_context_used(
        {
            "reply": str(reply or "").strip(),
            "actions": [],
            "suggestions": proactive_suggestions,
            "mode": "answer",
        },
        base_context,
    )


def build_direct_operator_reply(
    *,
    services: DirectChatRuntimeServices,
    message: str,
    workspace_id: str,
    requested_model: str,
    requested_provider: str,
    thread_id: str = "",
    prior_messages: Optional[List[Dict[str, Any]]] = None,
    reasoning_effort: str = "",
    availability: Optional[Dict[str, Any]] = None,
    approved_action: Optional[Dict[str, Any]] = None,
    max_iterations: Optional[int] = None,
    session_ctx: Optional[Dict[str, Any]] = None,
    agent_turn_request: Optional[Any] = None,
    trace_context: Optional[Any] = None,
) -> Iterator[Dict[str, Any]]:
    resolved_trace_context = _resume_trace_context(
        session_ctx=session_ctx,
        request_meta=None,
        explicit_trace_context=trace_context,
    )
    resolved_turn_request = resolve_agent_turn_request_with_fallback(
        agent_turn_request,
        (session_ctx.get("agent_turn_request") if isinstance(session_ctx, dict) else None),
    )
    effective_prior_messages = list(prior_messages or [])
    if not effective_prior_messages:
        effective_prior_messages = _hydrate_prior_messages_from_thread_store(
            workspace_id=(
                str(getattr(resolved_turn_request, "workspace_id", "") or "").strip()
                or str((session_ctx or {}).get("workspace_id") or "").strip()
                or str(workspace_id or "").strip()
            ),
            tenant_id=(
                str(getattr(resolved_turn_request, "tenant_id", "") or "").strip()
                or str((session_ctx or {}).get("tenant_id") or "").strip()
            ),
            thread_id=(
                str(getattr(resolved_turn_request, "thread_id", "") or "").strip()
                or str((session_ctx or {}).get("thread_id") or "").strip()
                or str(thread_id or "").strip()
            ),
            current_message=(
                str(getattr(resolved_turn_request, "message", "") or "").strip()
                or str(message or "").strip()
            ),
        )
    prepared = services.prepare_direct_chat_request(
        resolved_turn_request=resolved_turn_request,
        session_ctx=session_ctx,
        message=message,
        workspace_id=workspace_id,
        thread_id=thread_id,
        requested_model=requested_model,
        requested_provider=requested_provider,
        prior_messages=effective_prior_messages,
        reasoning_effort=reasoning_effort,
        availability=availability,
        approved_action=approved_action,
        max_iterations=max_iterations,
    )
    normalized_message = prepared.normalized_message
    normalized_workspace_id = prepared.normalized_workspace_id
    normalized_thread_id = prepared.normalized_thread_id
    normalized_requested_provider = prepared.normalized_requested_provider
    normalized_requested_model = prepared.normalized_requested_model
    normalized_reasoning_effort = prepared.normalized_reasoning_effort
    compaction = prepared.compaction
    compacted_prior_messages = prepared.compacted_prior_messages
    proactive_suggestions = prepared.proactive_suggestions
    tool_loop_session_key = prepared.tool_loop_session_key
    availability_payload = prepared.availability_payload
    connected_systems = prepared.connected_systems
    tool_capabilities = prepared.tool_capabilities
    tools = prepared.tools
    approved_action_payload = prepared.approved_action_payload
    base_context_used = prepared.base_context_used
    slash_command_name = prepared.slash_command_name
    slash_remainder = prepared.slash_remainder
    resolved_chat_max_iterations = prepared.resolved_chat_max_iterations

    slash_payload = direct_chat_response_service.slash_command_payload(
        slash_command_name=slash_command_name,
        slash_remainder=slash_remainder,
        workspace_id=normalized_workspace_id,
        requested_provider=normalized_requested_provider,
        requested_model=normalized_requested_model,
        reasoning_effort=normalized_reasoning_effort,
        availability_payload=availability_payload,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        proactive_suggestions=proactive_suggestions,
        base_context_used=base_context_used,
        services=services.direct_chat_response_services,
    )
    if slash_payload is not None:
        yield {"type": "final", "payload": slash_payload}
        return

    if not normalized_message:
        yield {
            "type": "final",
            "payload": direct_chat_response_service.empty_message_payload(
                proactive_suggestions=proactive_suggestions,
                base_context_used=base_context_used,
                services=services.direct_chat_response_services,
            ),
        }
        return

    if normalized_message == "__approval_confirmed__":
        yield {
            "type": "final",
            "payload": _execute_approved_action_payload(
                approved_action_payload=approved_action_payload,
                workspace_id=normalized_workspace_id,
                thread_id=normalized_thread_id,
                requested_provider=normalized_requested_provider,
                requested_model=normalized_requested_model,
                reasoning_effort=normalized_reasoning_effort,
                session_ctx=session_ctx,
                proactive_suggestions=proactive_suggestions,
                connected_systems=connected_systems,
                tool_capabilities=tool_capabilities,
                services=services,
            ),
        }
        return

    gated = services.tool_gate_response(normalized_message, availability_payload)
    if gated is not None:
        yield {
            "type": "final",
            "payload": services.with_context_used({**gated, "suggestions": proactive_suggestions}, base_context_used),
        }
        return

    capability_truth = (
        availability_payload.get("capability_truth")
        if isinstance(availability_payload.get("capability_truth"), dict)
        else {}
    )
    my_computer = capability_truth.get("my_computer") if isinstance(capability_truth.get("my_computer"), dict) else {}
    local_tools_available: Optional[bool] = None
    if "local_tools_available" in my_computer:
        local_tools_available = bool(my_computer.get("local_tools_available"))
    elif "local_gateway_online" in availability_payload or "runtime_ok" in availability_payload:
        local_tools_available = bool(availability_payload.get("local_gateway_online")) and bool(availability_payload.get("runtime_ok"))
    if _message_requests_local_machine_action(normalized_message) and local_tools_available is False:
        yield {
            "type": "final",
            "payload": _local_setup_required_payload(
                availability_payload=availability_payload,
                proactive_suggestions=proactive_suggestions,
                base_context_used=base_context_used,
                services=services,
            ),
        }
        return

    obvious_direct_tool_intent = services.message_has_obvious_direct_tool_intent(normalized_message, tools)

    provider, direct_chat_credentials = services.resolve_provider_for_direct_chat_message(
        normalized_workspace_id,
        normalized_requested_provider,
        normalized_message,
        tools_present=bool(tools),
    )
    normalized_requested_provider_alias = "codex_cli" if normalized_requested_provider == "openai-codex" else normalized_requested_provider
    normalized_effective_provider_alias = "codex_cli" if provider == "openai-codex" else provider
    if normalized_requested_provider and normalized_effective_provider_alias != normalized_requested_provider_alias:
        yield {
            "type": "final",
            "payload": _provider_unavailable_payload(
                provider=normalized_requested_provider,
                proactive_suggestions=proactive_suggestions,
                base_context_used=base_context_used,
                services=services,
                availability_payload=availability_payload,
            ),
        }
        return
    provider_supported = provider in set(services.supported_providers)
    provider_ready = bool(availability_payload.get("ai_ready")) and provider_supported and services.supports_direct_message_native_chat(
        provider,
        direct_chat_credentials,
    )
    lock_selected_provider = bool(normalized_requested_provider or normalized_requested_model)
    selected_model = normalized_requested_model if lock_selected_provider else ""
    explicit_provider_tool_calls = _explicit_provider_parity_tool_calls(
        normalized_message,
        tools,
        services,
    )
    if provider_ready and explicit_provider_tool_calls:
        yield from _stream_explicit_provider_parity_tools(
            services=services,
            tool_calls=explicit_provider_tool_calls,
            normalized_workspace_id=normalized_workspace_id,
            normalized_thread_id=normalized_thread_id,
            normalized_requested_provider=normalized_requested_provider,
            normalized_requested_model=normalized_requested_model,
            normalized_reasoning_effort=normalized_reasoning_effort,
            provider=provider,
            selected_model=selected_model,
            direct_chat_credentials=direct_chat_credentials,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            proactive_suggestions=proactive_suggestions,
            base_context_used=base_context_used,
            session_ctx=session_ctx,
            resolved_trace_context=resolved_trace_context,
        )
        return
    route_decision = services.plan_direct_chat_route(
        message=normalized_message,
        availability=availability_payload,
        provider=provider,
        tools=tools,
    )
    fallback_reason = None
    if not route_decision.allow_direct_tool_calls:
        preview = route_decision.preview
        if preview is not None:
            if route_decision.should_auto_start_run:
                yield {
                    "type": "step",
                    "label": "Starting durable run",
                    "detail": normalized_message[:120] if normalized_message else "Preparing execution",
                    "status": "active",
                    "kind": "thinking",
                    "id": "run-handoff:start",
                }
                try:
                    started_run = services.start_direct_chat_run_handoff(
                        message=normalized_message,
                        workspace_id=normalized_workspace_id,
                        requested_provider=normalized_requested_provider,
                        requested_model=normalized_requested_model,
                        thread_id=normalized_thread_id,
                        availability=availability_payload,
                        max_iterations=resolved_chat_max_iterations,
                    )
                    handoff_payload = services.direct_chat_run_handoff_reply(started_run)
                    yield {
                        "type": "step",
                        "label": "Durable run started",
                        "detail": str(handoff_payload.get("detail") or "Run started"),
                        "status": "done",
                        "kind": "thinking",
                        "id": "run-handoff:start",
                    }
                    for handoff_event in services.stream_direct_chat_run_handoff(
                        started_run=started_run,
                        requested_workspace_id=normalized_workspace_id,
                        requested_provider=normalized_requested_provider,
                        requested_model=normalized_requested_model,
                        reasoning_effort=normalized_reasoning_effort,
                        connected_systems=connected_systems,
                        tool_capabilities=tool_capabilities,
                        fallback_reason=fallback_reason,
                    ):
                        yield handoff_event
                    return
                except Exception as exc:
                    detail = str(getattr(exc, "detail", "") or str(exc)).strip() or "run_start_failed"
                    services.capture_exception(exc)
                    yield {
                        "type": "step",
                        "label": "Durable run failed to start",
                        "detail": detail,
                        "status": "error",
                        "kind": "thinking",
                        "id": "run-handoff:start",
                    }
                    preview = services.direct_chat_run_handoff_failure_payload(normalized_message, detail)
            yield {
                "type": "final",
                "payload": services.with_context_used({**preview, "suggestions": proactive_suggestions}, base_context_used),
            }
            return

    if obvious_direct_tool_intent and not provider_ready:
        yield {
            "type": "step",
            "label": "Using direct tools",
            "detail": normalized_message[:120] if normalized_message else "Preparing tool execution",
            "status": "active",
            "kind": "thinking",
            "id": "direct-tools:auto",
        }
        direct_payload = no_provider_service.execute_no_provider_request(
            message=normalized_message,
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            tools=tools,
            tool_capabilities=tool_capabilities,
            reasoning_effort=normalized_reasoning_effort,
            services=services.no_provider_execution_services,
            session_ctx=session_ctx,
        )
        if direct_payload is not None:
            yield {
                "type": "step",
                "label": "Using direct tools",
                "detail": "Completed",
                "status": "done",
                "kind": "thinking",
                "id": "direct-tools:auto",
            }
            yield {
                "type": "final",
                "payload": _finalize_direct_tool_payload(
                    direct_payload=direct_payload,
                    proactive_suggestions=proactive_suggestions,
                    workspace_id=normalized_workspace_id,
                    requested_provider=normalized_requested_provider,
                    requested_model=normalized_requested_model,
                    reasoning_effort=normalized_reasoning_effort,
                    connected_systems=connected_systems,
                    tool_capabilities=tool_capabilities,
                    base_context_used=base_context_used,
                    services=services,
                    fallback_reason="obvious_direct_tool_execution",
                    use_base_context=False,
                ),
            }
            return
    if normalized_requested_provider and not provider_ready:
        yield {
            "type": "final",
            "payload": _provider_unavailable_payload(
                provider=normalized_requested_provider,
                proactive_suggestions=proactive_suggestions,
                base_context_used=base_context_used,
                services=services,
            ),
        }
        return
    if not provider_ready:
        yield {
            "type": "step",
            "label": "Using fallback tools",
            "detail": normalized_message[:120] if normalized_message else "Preparing tool execution",
            "status": "active",
            "kind": "thinking",
            "id": "direct-tools:fallback",
        }
        fallback_payload = _fallback_tool_payload(
            message=normalized_message,
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            tools=tools,
            tool_capabilities=tool_capabilities,
            reasoning_effort=normalized_reasoning_effort,
            proactive_suggestions=proactive_suggestions,
            requested_provider=normalized_requested_provider,
            requested_model=normalized_requested_model,
            connected_systems=connected_systems,
            services=services,
            session_ctx=session_ctx,
        )
        yield {
            "type": "step",
            "label": "Using fallback tools",
            "detail": "Completed" if fallback_payload.get("error") != "no_provider" else "No tool path available",
            "status": "done",
            "kind": "thinking",
            "id": "direct-tools:fallback",
        }
        yield {"type": "final", "payload": fallback_payload}
        return

    provider_chat_tools = _provider_chat_tools_for_message(
        normalized_message,
        tools,
        obvious_direct_tool_intent=obvious_direct_tool_intent,
    )
    generation_tools = (
        tools
        if direct_chat_tool_catalog_service.message_requests_tool_inventory(normalized_message)
        else provider_chat_tools
    )
    context = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
        "tools": generation_tools,
        "disable_provider_fallback": lock_selected_provider,
    }
    metadata = {
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
        "tools": generation_tools,
        "disable_provider_fallback": lock_selected_provider,
    }
    if direct_chat_credentials:
        metadata["credentials"] = direct_chat_credentials
    raw_system_prompt = services.build_direct_chat_system_prompt(
        workspace_id=normalized_workspace_id,
        availability=availability_payload,
        tools=provider_chat_tools,
    )
    system_prompt = raw_system_prompt or None
    workspace_context_text = services.direct_chat_workspace_context_text(
        normalized_workspace_id,
        memory_query=normalized_message,
    )
    identity_guardrail = direct_chat_prompt_service.build_runtime_identity_guardrail(
        provider=provider,
        model=selected_model or None,
    )
    system_prompt = direct_chat_prompt_service.combine_workspace_context(
        system_prompt=system_prompt,
        workspace_context_text=workspace_context_text,
        identity_guardrail=identity_guardrail,
    )
    history_mode = "compacted_messages" if compaction.get("compacted") else ("raw_messages" if compacted_prior_messages else "none")
    prior_messages_used = bool(compacted_prior_messages)
    yield from direct_chat_generation_service.stream_provider_backed_direct_chat(
        services=services.direct_chat_generation_services,
        context=context,
        metadata=metadata,
        system_prompt=system_prompt,
        normalized_workspace_id=normalized_workspace_id,
        normalized_requested_provider=normalized_requested_provider,
        normalized_requested_model=normalized_requested_model,
        normalized_reasoning_effort=normalized_reasoning_effort,
        normalized_thread_id=normalized_thread_id,
        normalized_message=normalized_message,
        compacted_prior_messages=compacted_prior_messages,
        prior_messages_used=prior_messages_used,
        history_mode=history_mode,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        availability_payload=availability_payload,
        tools=generation_tools,
        direct_chat_credentials=direct_chat_credentials,
        proactive_suggestions=proactive_suggestions,
        tool_loop_session_key=tool_loop_session_key,
        fallback_reason=fallback_reason,
        session_ctx=session_ctx,
        trace_context=resolved_trace_context,
        resolved_chat_max_iterations=resolved_chat_max_iterations,
        direct_tool_result_summary_system_message="You have the results from the direct tool calls. Summarize them for the user or continue if another tool is required.",
    )


def collect_direct_operator_reply(
    *,
    services: DirectChatRuntimeServices,
    **kwargs: Any,
) -> Dict[str, Any]:
    # Internal delegate. Not an alternate turn engine. Called only from agent_turn().
    final_payload: Dict[str, Any] = {}
    accumulated_reply = ""
    for event in build_direct_operator_reply(services=services, **kwargs):
        event_type = str(event.get("type") or "").strip().lower()
        if event_type == "chunk":
            accumulated_reply += str(event.get("delta") or "")
            continue
        if event_type == "final" and isinstance(event.get("payload"), dict):
            final_payload = dict(event.get("payload") or {})
            if not str(final_payload.get("reply") or "").strip() and accumulated_reply:
                final_payload["reply"] = accumulated_reply
            return final_payload
    return final_payload or {"reply": accumulated_reply}


def build_chat_turn_event_stream(
    *,
    services: DirectChatRuntimeServices,
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Iterator[Dict[str, Any]]:
    context = session_ctx if isinstance(session_ctx, dict) else {}
    meta = request_meta if isinstance(request_meta, dict) else {}
    trace_context = _resume_trace_context(
        session_ctx=context,
        request_meta=meta,
        explicit_trace_context=None,
    )
    turn_request = resolve_agent_turn_request_from_runtime_context(
        request_meta=meta,
        session_ctx=context,
    )
    return build_direct_operator_reply(
        services=services,
        session_ctx=context,
        message=(str(turn_request.message or "").strip() if turn_request is not None else message),
        workspace_id=(
            str(turn_request.workspace_id or "default").strip() or "default"
            if turn_request is not None
            else str(meta.get("workspace_id") or context.get("workspace_id") or "default").strip() or "default"
        ),
        requested_model=str(meta.get("model") or "").strip(),
        requested_provider=str(meta.get("provider") or "").strip(),
        thread_id=(
            str(turn_request.session_id or "").strip()
            if turn_request is not None
            else str(meta.get("thread_id") or context.get("thread_id") or "").strip()
        ),
        prior_messages=meta.get("prior_messages") if isinstance(meta.get("prior_messages"), list) else [],
        reasoning_effort=str(meta.get("reasoning_effort") or "").strip(),
        approved_action=meta.get("approved_action") if isinstance(meta.get("approved_action"), dict) else None,
        max_iterations=meta.get("max_iterations"),
        agent_turn_request=(meta.get("agent_turn_request") if turn_request is None else turn_request),
        trace_context=trace_context,
    )


def execute_chat_turn(
    *,
    services: DirectChatRuntimeServices,
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    stream_sink: Optional[Callable[[Dict[str, Any]], None]] = None,
    request_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    final_payload: Dict[str, Any] = {}
    accumulated_reply = ""
    for event in build_chat_turn_event_stream(
        services=services,
        session_ctx=session_ctx,
        message=message,
        request_meta=request_meta,
    ):
        if callable(stream_sink):
            stream_sink(dict(event) if isinstance(event, dict) else {})
        event_type = str((event or {}).get("type") or "").strip().lower() if isinstance(event, dict) else ""
        if event_type == "chunk":
            accumulated_reply += str((event or {}).get("delta") or "")
            continue
        if event_type == "final" and isinstance((event or {}).get("payload"), dict):
            final_payload = dict((event or {}).get("payload") or {})
            if not str(final_payload.get("reply") or "").strip() and accumulated_reply:
                final_payload["reply"] = accumulated_reply
            return final_payload
    return final_payload or {"reply": accumulated_reply}
