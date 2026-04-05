from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Optional

from server_modules import direct_chat_stream_state_service as state_service


def resolve_chat_stream_state_db_path(
    *,
    override: Any,
    late_server_export: Callable[[str], Any],
    fallback_db_path: str,
) -> Path:
    if override:
        return Path(override)
    try:
        return Path(late_server_export("ORION_RUNTIME_STATE_DB"))
    except Exception:
        return Path(fallback_db_path)


def configured_direct_chat_worker_count(
    *,
    getenv: Callable[[str], Optional[str]] = os.getenv,
) -> int:
    for env_name in ("ORION_RUNTIME_UVICORN_WORKERS", "UVICORN_WORKERS", "WEB_CONCURRENCY"):
        raw_value = str(getenv(env_name) or "").strip()
        if not raw_value:
            continue
        try:
            parsed = int(raw_value)
        except Exception:
            continue
        if parsed > 0:
            return parsed
    return 1


def build_direct_chat_session_manager(
    *,
    get_default_session_manager: Callable[..., Any],
    db_path: Any,
) -> Any:
    return get_default_session_manager(db_path=db_path)


def initialize_chat_stream_runtime_state(
    *,
    now_ts: Optional[float],
    ensure_single_worker_runtime_fn: Callable[[], None],
    db_path: Any,
    stale_after_seconds: int,
    ttl_seconds: int,
    mark_stale_sessions_interrupted: Callable[..., int],
    delete_sessions_older_than: Callable[..., int],
    metrics_inc: Callable[[str, float], None],
    session_manager_enabled: Callable[[], bool],
    session_manager_factory: Callable[[], Any],
) -> None:
    return state_service.initialize_runtime_state(
        now_ts=now_ts,
        ensure_single_worker_runtime_fn=ensure_single_worker_runtime_fn,
        db_path=db_path,
        stale_after_seconds=stale_after_seconds,
        ttl_seconds=ttl_seconds,
        mark_stale_sessions_interrupted=mark_stale_sessions_interrupted,
        delete_sessions_older_than=delete_sessions_older_than,
        metrics_inc=metrics_inc,
        session_manager_enabled=session_manager_enabled,
        session_manager_factory=session_manager_factory,
    )


def build_direct_chat_execution_services(
    *,
    builder: Callable[..., Any],
    chat_stream_key: Callable[..., str],
    session_manager_enabled: Callable[[], bool],
    session_manager_factory: Callable[[], Any],
    build_direct_operator_reply: Callable[..., Any],
    build_chat_turn_event_stream: Callable[..., Any],
) -> Any:
    return builder(
        chat_stream_key=chat_stream_key,
        session_manager_enabled=session_manager_enabled,
        session_manager_factory=session_manager_factory,
        build_direct_operator_reply=build_direct_operator_reply,
        build_chat_turn_event_stream=build_chat_turn_event_stream,
    )


def get_or_create_chat_stream_session(
    sessions: dict[str, dict[str, Any]],
    *,
    key: str,
    thread_id: str,
    request_id: str,
    workspace_id: str,
    prune_sessions_locked: Callable[[], None],
    delete_sessions_older_than: Callable[..., int],
    db_path: Any,
    state_ttl_seconds: int,
    load_replayable_session: Callable[..., Optional[dict[str, Any]]],
    default_session_factory: Callable[..., dict[str, Any]],
    persist_session_state: Callable[[dict[str, Any]], None],
) -> dict[str, Any]:
    return state_service.get_or_create_chat_stream_session(
        sessions,
        key=key,
        thread_id=thread_id,
        request_id=request_id,
        workspace_id=workspace_id,
        prune_sessions_locked=prune_sessions_locked,
        delete_sessions_older_than=delete_sessions_older_than,
        db_path=db_path,
        state_ttl_seconds=state_ttl_seconds,
        load_replayable_session=load_replayable_session,
        default_session_factory=default_session_factory,
        persist_session_state=persist_session_state,
    )


def append_chat_stream_event(
    session: dict[str, Any],
    *,
    event_name: str,
    payload: dict[str, Any],
    buffer_limit: int,
    persist_session_state: Callable[[dict[str, Any]], None],
) -> None:
    return state_service.append_chat_stream_event(
        session,
        event_name=event_name,
        payload=payload,
        buffer_limit=buffer_limit,
        persist_session_state=persist_session_state,
    )


def complete_chat_stream_session(
    session: dict[str, Any],
    *,
    persist_session_state: Callable[[dict[str, Any]], None],
) -> None:
    return state_service.complete_chat_stream_session(
        session,
        persist_session_state=persist_session_state,
    )
