from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from server_modules import memory_service


def direct_chat_memory_context_message(
    workspace_id: str,
    *,
    system_prefix: str,
) -> Optional[Dict[str, str]]:
    return memory_service.direct_chat_memory_context_message(
        workspace_id,
        system_prefix=system_prefix,
    )


def direct_chat_workspace_context_text(
    workspace_id: str,
    *,
    memory_query: str = "",
) -> str:
    return memory_service.direct_chat_workspace_context_text(
        workspace_id,
        memory_query=memory_query,
    )


def build_direct_chat_daily_log_summary(
    *,
    user_message: str,
    assistant_reply: str,
) -> str:
    return memory_service.build_direct_chat_daily_log_summary(
        user_message=user_message,
        assistant_reply=assistant_reply,
    )


def persist_direct_chat_memory_best_effort(
    *,
    workspace_id: str,
    provider: Optional[str],
    model: Optional[str],
    credentials: Optional[Dict[str, Any]],
    reasoning_effort: str,
    prior_messages: List[Dict[str, str]],
    user_message: str,
    assistant_reply: str,
    generate_reply: Callable[..., Any],
    extraction_prompt: str,
    extraction_system_prompt: str,
) -> None:
    memory_service.persist_direct_chat_memory_best_effort(
        workspace_id=workspace_id,
        provider=provider,
        model=model,
        credentials=credentials,
        reasoning_effort=reasoning_effort,
        prior_messages=prior_messages,
        user_message=user_message,
        assistant_reply=assistant_reply,
        generate_reply=generate_reply,
        extraction_prompt=extraction_prompt,
        extraction_system_prompt=extraction_system_prompt,
    )


def persist_direct_chat_transcript_best_effort(
    *,
    workspace_id: str,
    thread_id: str,
    provider: Optional[str],
    model: Optional[str],
    messages: List[Dict[str, str]],
    user_message: str,
    assistant_reply: str,
    save_session_transcript_fn: Callable[..., Any],
) -> None:
    try:
        save_session_transcript_fn(
            workspace_id=workspace_id,
            thread_id=thread_id,
            provider=provider,
            model=model,
            messages=messages,
            user_message=user_message,
            assistant_reply=assistant_reply,
        )
    except Exception:
        return
