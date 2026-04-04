from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterator, List, Optional


@dataclass(slots=True)
class DirectChatGenerationServices:
    thinking_step_payload: Callable[[int, str, Optional[str]], Dict[str, Any]]
    build_context_used: Callable[..., Dict[str, Any]]
    build_direct_tool_approval_response: Callable[..., Optional[Dict[str, Any]]]
    parse_tool_name: Callable[[str], tuple[str, str]]
    tool_arguments_payload: Callable[[Any], Dict[str, Any]]
    parse_page_state: Callable[[str], Any]
    direct_tool_step_payload: Callable[..., Dict[str, Any]]
    execute_single_direct_tool_call: Callable[..., str]
    direct_tool_followup_message: Callable[[str, str], str]
    suggest_actions: Callable[[str, Dict[str, Any]], List[Dict[str, Any]]]
    clear_direct_tool_loop_state: Callable[[str], None]
    persist_direct_chat_memory_best_effort: Callable[..., None]
    persist_direct_chat_transcript_best_effort: Callable[..., None]
    record_direct_tool_signature: Callable[[str, Dict[str, Any]], bool]
    direct_chat_error_reply: Callable[[str], str]
    capture_exception: Callable[[BaseException], None]
    generate_chat_reply_stream_with_provider_fallback: Callable[..., Iterator[Dict[str, Any]]]


def stream_provider_backed_direct_chat(
    *,
    services: DirectChatGenerationServices,
    context: Dict[str, Any],
    metadata: Dict[str, Any],
    system_prompt: Optional[str],
    normalized_workspace_id: str,
    normalized_requested_provider: str,
    normalized_requested_model: str,
    normalized_reasoning_effort: Optional[str],
    normalized_thread_id: str,
    normalized_message: str,
    compacted_prior_messages: List[Dict[str, Any]],
    prior_messages_used: bool,
    history_mode: str,
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    availability_payload: Dict[str, Any],
    tools: List[Dict[str, Any]],
    direct_chat_credentials: Dict[str, Any],
    proactive_suggestions: List[str],
    tool_loop_session_key: str,
    fallback_reason: Optional[str],
    session_ctx: Optional[Dict[str, Any]],
    resolved_chat_max_iterations: int,
    direct_tool_result_summary_system_message: str,
) -> Iterator[Dict[str, Any]]:
    usage_masked: Dict[str, Any] = {}
    attempted_providers = ""
    llm_error = ""
    actual_provider: Optional[str] = str(metadata.get("provider") or "").strip() or None
    actual_model: Optional[str] = str(metadata.get("model") or "").strip() or None
    executed_any_tools = False
    conversation_messages: List[Dict[str, str]] = []
    conversation_messages.extend(compacted_prior_messages)
    current_prompt = normalized_message
    max_iterations = resolved_chat_max_iterations

    for iteration in range(max_iterations):
        thinking_iteration = iteration + 1
        yield services.thinking_step_payload(thinking_iteration, "active")

        iteration_reply = ""
        iteration_tool_calls: List[Dict[str, Any]] = []
        iteration_failed = False

        messages = conversation_messages or []
        for event in services.generate_chat_reply_stream_with_provider_fallback(
            context=context,
            metadata=metadata,
            user_goal=current_prompt,
            system_prompt=system_prompt,
            prior_messages=messages or None,
        ):
            event_type = str(event.get("type") or "").strip().lower()
            if event_type == "chunk":
                delta = str(event.get("delta") or "")
                if delta:
                    iteration_reply += delta
                    yield {"type": "chunk", "delta": delta}
                continue
            if event_type == "result":
                final_reply = str(event.get("reply") or "").strip() or iteration_reply
                usage_masked = event.get("usage_masked") if isinstance(event.get("usage_masked"), dict) else {}
                attempted_providers = str(event.get("attempted_providers") or "").strip()
                llm_error = str(event.get("error") or "").strip()
                actual_provider = str(event.get("provider") or actual_provider or "").strip() or actual_provider
                actual_model = str(event.get("model") or actual_model or "").strip() or actual_model
                iteration_tool_calls = event.get("tool_calls") if isinstance(event.get("tool_calls"), list) else []
                yield services.thinking_step_payload(
                    thinking_iteration,
                    "done",
                    "Prepared the next action" if iteration_tool_calls else "Answer ready",
                )

                conversation_messages.append({"role": "user", "content": current_prompt})
                if final_reply:
                    conversation_messages.append({"role": "assistant", "content": final_reply})

                if iteration_tool_calls:
                    loop_detected = any(
                        services.record_direct_tool_signature(tool_loop_session_key, tool_call)
                        for tool_call in iteration_tool_calls
                        if isinstance(tool_call, dict)
                    )
                    if loop_detected:
                        yield {
                            "type": "final",
                            "payload": {
                                "reply": "I detected the same tool action repeating, so I stopped here. Start a durable run if you want me to keep going end-to-end.",
                                "actions": [],
                                "suggestions": proactive_suggestions,
                                "mode": "answer",
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": "tool_loop_detected",
                                "context_used": services.build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        services.clear_direct_tool_loop_state(tool_loop_session_key)
                        return
                    approval_payload = services.build_direct_tool_approval_response(
                        tool_calls=iteration_tool_calls,
                        tool_capabilities=tool_capabilities,
                        session_ctx=session_ctx,
                    )
                    if approval_payload is not None:
                        yield {
                            "type": "final",
                            "payload": {
                                **approval_payload,
                                "suggestions": proactive_suggestions,
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": "",
                                "context_used": services.build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                    try:
                        connector_id = ""
                        action_id = ""
                        argument_payload: Dict[str, Any] = {}
                        step_id = f"tool:{thinking_iteration}:0"
                        for tool_index, tool_call in enumerate(iteration_tool_calls, start=1):
                            connector_id, action_id = services.parse_tool_name(str(tool_call.get("name") or ""))
                            argument_payload = services.tool_arguments_payload(tool_call.get("arguments"))
                            if connector_id in {"file", "shell", "screenshot", "computer"} and isinstance(argument_payload.get("input"), str):
                                nested_input = services.parse_page_state(str(argument_payload.get("input") or ""))
                                if isinstance(nested_input, dict):
                                    argument_payload = nested_input
                            step_id = f"tool:{thinking_iteration}:{tool_index}"
                            yield services.direct_tool_step_payload(
                                connector_id,
                                action_id,
                                argument_payload,
                                step_id=step_id,
                                status="active",
                            )
                            tool_result = services.execute_single_direct_tool_call(
                                tool_call=tool_call,
                                workspace_id=normalized_workspace_id,
                                thread_id=normalized_thread_id,
                                index=tool_index,
                                provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                model=str(actual_model or "").strip() or None,
                                credentials=direct_chat_credentials if isinstance(direct_chat_credentials, dict) else None,
                                reasoning_effort=normalized_reasoning_effort or "",
                                session_ctx=session_ctx,
                            )
                            executed_any_tools = True
                            yield services.direct_tool_step_payload(
                                connector_id,
                                action_id,
                                argument_payload,
                                step_id=step_id,
                                status="done",
                            )
                            conversation_messages.append(
                                {
                                    "role": "user",
                                    "content": services.direct_tool_followup_message(
                                        str(tool_call.get("name") or f"{connector_id}__{action_id}"),
                                        tool_result,
                                    ),
                                }
                            )
                        conversation_messages.append({"role": "system", "content": direct_tool_result_summary_system_message})
                        current_prompt = (
                            "Continue until the task is complete. If another tool is needed, call it now. "
                            "Otherwise provide the final answer to the user."
                        )
                        break
                    except Exception as exc:
                        llm_error = str(exc).strip() or "connector_action_failed"
                        services.capture_exception(exc)
                        yield services.direct_tool_step_payload(
                            connector_id,
                            action_id,
                            argument_payload,
                            step_id=step_id,
                            status="error",
                            detail_override=llm_error,
                        )
                        yield {
                            "type": "final",
                            "payload": {
                                "reply": f"Connector action failed: {llm_error}",
                                "actions": [],
                                "suggestions": proactive_suggestions,
                                "mode": "answer",
                                "usage_masked": usage_masked,
                                "provider": actual_provider,
                                "model": actual_model,
                                "attempted_providers": attempted_providers,
                                "error": llm_error,
                                "context_used": services.build_context_used(
                                    workspace_id=normalized_workspace_id,
                                    requested_provider=normalized_requested_provider,
                                    effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                                    requested_model=normalized_requested_model,
                                    effective_model=str(actual_model or "").strip() or None,
                                    reasoning_effort=normalized_reasoning_effort,
                                    connected_systems=connected_systems,
                                    tool_capabilities=tool_capabilities,
                                    prior_messages_used=True,
                                    history_mode=history_mode,
                                    run_created=False,
                                    fallback_used=False,
                                    fallback_reason=fallback_reason,
                                ),
                            },
                        }
                        return

                actions = [] if executed_any_tools else services.suggest_actions(normalized_message, availability_payload)
                yield {
                    "type": "final",
                    "payload": {
                        "reply": final_reply,
                        "actions": actions,
                        "suggestions": proactive_suggestions,
                        "mode": "answer_with_action" if actions else "answer",
                        "usage_masked": usage_masked,
                        "provider": actual_provider,
                        "model": actual_model,
                        "attempted_providers": attempted_providers,
                        "error": llm_error,
                        "context_used": services.build_context_used(
                            workspace_id=normalized_workspace_id,
                            requested_provider=normalized_requested_provider,
                            effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                            requested_model=normalized_requested_model,
                            effective_model=str(actual_model or "").strip() or None,
                            reasoning_effort=normalized_reasoning_effort,
                            connected_systems=connected_systems,
                            tool_capabilities=tool_capabilities,
                            prior_messages_used=prior_messages_used,
                            history_mode=history_mode,
                            run_created=False,
                            fallback_used=False,
                            fallback_reason=fallback_reason,
                        ),
                    },
                }
                services.clear_direct_tool_loop_state(tool_loop_session_key)
                services.persist_direct_chat_memory_best_effort(
                    workspace_id=normalized_workspace_id,
                    provider=str(actual_provider or context.get("provider") or "").strip() or None,
                    model=str(actual_model or "").strip() or None,
                    credentials=direct_chat_credentials,
                    reasoning_effort=normalized_reasoning_effort,
                    prior_messages=compacted_prior_messages,
                    user_message=normalized_message,
                    assistant_reply=final_reply,
                )
                services.persist_direct_chat_transcript_best_effort(
                    workspace_id=normalized_workspace_id,
                    thread_id=normalized_thread_id,
                    provider=str(actual_provider or context.get("provider") or "").strip() or None,
                    model=str(actual_model or "").strip() or None,
                    messages=conversation_messages,
                    user_message=normalized_message,
                    assistant_reply=final_reply,
                )
                return
            if event_type == "failure":
                attempted_providers = str(event.get("attempted_providers") or "").strip()
                llm_error = str(event.get("error") or "").strip()
                yield services.thinking_step_payload(thinking_iteration, "error", llm_error or "Model call failed")
                iteration_failed = True
                break

        if iteration_failed:
            break
        if not iteration_tool_calls:
            break
    else:
        llm_error = llm_error or f"max_tool_iterations_reached:{max_iterations}"

    actions = [] if executed_any_tools else services.suggest_actions(normalized_message, availability_payload)
    services.clear_direct_tool_loop_state(tool_loop_session_key)
    yield {
        "type": "final",
        "payload": {
            "reply": services.direct_chat_error_reply(llm_error),
            "actions": actions,
            "suggestions": proactive_suggestions,
            "mode": "answer_with_action" if actions else "answer",
            "usage_masked": usage_masked,
            "provider": actual_provider,
            "model": actual_model,
            "attempted_providers": attempted_providers,
            "error": llm_error,
            "context_used": services.build_context_used(
                workspace_id=normalized_workspace_id,
                requested_provider=normalized_requested_provider,
                effective_provider=str(actual_provider or context.get("provider") or "").strip() or None,
                requested_model=normalized_requested_model,
                effective_model=str(actual_model or "").strip() or None,
                reasoning_effort=normalized_reasoning_effort,
                connected_systems=connected_systems,
                tool_capabilities=tool_capabilities,
                prior_messages_used=prior_messages_used,
                history_mode=history_mode,
                run_created=False,
                fallback_used=False,
                fallback_reason=fallback_reason,
            ),
        },
    }
