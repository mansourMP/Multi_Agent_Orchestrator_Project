from __future__ import annotations
import sentry_sdk
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Depends, Request
from sse_starlette.sse import EventSourceResponse
from server_modules.auth import (
    allowed_workspace_ids,
    build_workspace_authorization_metadata,
    enforce_workspace_access,
)

from server_modules.agent_turn import (
    agent_turn as execute_canonical_agent_turn,
    resolve_direct_chat_turn_request,
    resolve_run_start_turn_request,
)
from server_modules.api_contract import (
    ApiAgentTurnRequest,
    ApiAgentTurnResponse,
    ApiRunListResponse,
    ApiSessionRequest,
    ApiSessionResponse,
    build_turn_chat_body,
    model_to_dict,
    normalize_agent_turn_result,
    normalize_session_record,
    request_body_to_turn_request,
)
from server_modules import session_service
from server_modules import run_state_repository
from server_modules.direct_chat_stream_response_service import build_direct_chat_stream_response
from server_modules.direct_chat_service import (
    build_direct_chat_execution_services,
    build_direct_chat_event_producer as _service_build_direct_chat_event_producer,
    build_direct_chat_request_meta as _service_build_direct_chat_request_meta,
    direct_chat_actor_key as _service_direct_chat_actor_key,
    direct_chat_request_signature as _service_direct_chat_request_signature,
    direct_chat_session_manager_enabled as _service_direct_chat_session_manager_enabled,
    direct_chat_stream_key as _service_direct_chat_stream_key,
)
from server_modules import direct_chat_stream_runtime_service as chat_stream_runtime_service
from server_modules import direct_chat_stream_state_service as chat_stream_state_service
from server_modules import direct_chat_stream_transport_service as chat_stream_transport_service
from server_modules.heartbeat import HeartbeatScheduler
from server_modules.run_service import (
    build_server_run_creation_services,
    build_server_run_execution_services,
    build_server_run_routing_preview_services,
)
from server_modules.turn_runtime import (
    build_turn_execution_services,
    execute_run_start_request_via_turn_runtime,
    execute_system_run_start_request_via_turn_runtime,
)
from server_modules.runtime_policy import (
    browser_automation_plan_hash_from_pack_inputs,
    build_browser_execution_binding,
)
from server_modules.runtime_state_store import (
    delete_chat_stream_sessions_older_than,
    get_chat_stream_state,
    mark_stale_chat_stream_sessions_interrupted,
    upsert_chat_stream_state,
)
from server_modules import runtime_heartbeat_service
from server_modules import runtime_local_execution_approval_service
from server_modules import runtime_route_registration_service
from server_modules import runtime_run_access_service
from server_modules import runtime_run_detail_service
from server_modules import runtime_run_query_service
from server_modules import runtime_run_resume_service
from server_modules import runtime_usage_service
from server_modules import runtime_webhook_trigger_service

_CHAT_STREAM_LOCK = threading.Lock()
_CHAT_STREAM_BUFFER_LIMIT = 50
_CHAT_STREAM_TTL_SECONDS = 15 * 60
_CHAT_STREAM_STATE_STALE_AFTER_SECONDS = 10 * 60
_CHAT_STREAM_STATE_TTL_SECONDS = 60 * 60
_CHAT_STREAM_SESSIONS: dict[str, dict[str, Any]] = {}
_HEARTBEAT_SCHEDULER_LOCK = threading.Lock()
_HEARTBEAT_SCHEDULER: Optional[HeartbeatScheduler] = None
_WEBHOOK_TRIGGER_LOCK = threading.Lock()
_WEBHOOK_TRIGGERS_LOADED = False
_WEBHOOK_TRIGGERS: dict[str, dict[str, Any]] = {}


def _late_server_export(name: str):
    import server as _server

    return getattr(_server, name)


def _refresh_server_exports():
    import server as _server

    globals().update(_server.__dict__)
    return _server


def _chat_stream_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _chat_stream_now_iso()


def _workspace_filtered_items(items: list[dict[str, Any]], current_user: Any) -> list[dict[str, Any]]:
    allowed = allowed_workspace_ids(current_user)
    if allowed is None:
        return items
    filtered: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        workspace_id = str(item.get("workspace_id") or "default").strip() or "default"
        if workspace_id in allowed:
            filtered.append(item)
    return filtered


def _workspace_id_from_turn_payload(payload: dict[str, Any]) -> str:
    return str(payload.get("workspace_id") or "default").strip() or "default"


def _machine_target_from_turn_payload(payload: dict[str, Any]) -> str | None:
    context_hints = payload.get("context_hints") if isinstance(payload.get("context_hints"), dict) else {}
    metadata = context_hints.get("metadata") if isinstance(context_hints.get("metadata"), dict) else {}
    token = (
        str(payload.get("machine_target") or "").strip()
        or str(metadata.get("machine_id") or "").strip()
        or str(metadata.get("machine_target") or "").strip()
    )
    return token or None


def _stamp_workspace_authorization_on_turn_payload(
    payload: dict[str, Any],
    *,
    current_user: Any,
    minimum_role: str,
) -> dict[str, Any]:
    body = dict(payload or {})
    workspace_id = enforce_workspace_access(
        current_user,
        _workspace_id_from_turn_payload(body),
        minimum_role=minimum_role,
    )
    machine_target = _machine_target_from_turn_payload(body)
    context_hints = body.get("context_hints") if isinstance(body.get("context_hints"), dict) else {}
    metadata = context_hints.get("metadata") if isinstance(context_hints.get("metadata"), dict) else {}
    metadata = {
        **metadata,
        **build_workspace_authorization_metadata(
            current_user,
            workspace_id,
            machine_id=machine_target,
        ),
    }
    body["workspace_id"] = workspace_id
    body["context_hints"] = {
        **context_hints,
        "metadata": metadata,
    }
    return body


def _chat_stream_metrics_inc(key: str, amount: float = 1) -> None:
    try:
        metrics_fn = _late_server_export("metrics_inc")
    except Exception:
        return


def _looks_like_legacy_run_start_body(payload: dict[str, Any]) -> bool:
    if not isinstance(payload, dict) or not payload:
        return False
    if "actor" in payload or "session_id" in payload or "thread_id" in payload:
        return False
    return any(key in payload for key in ("user_goal", "business_plan", "workflow_id", "engine"))
    try:
        metrics_fn(key, amount)
    except Exception:
        return


_heartbeat_scheduler = lambda: runtime_heartbeat_service.heartbeat_scheduler(
    lock=_HEARTBEAT_SCHEDULER_LOCK,
    scheduler=_HEARTBEAT_SCHEDULER,
)


_run_creation_services = lambda: build_server_run_creation_services(
    late_server_export=_late_server_export,
)


_run_execution_services = lambda: build_server_run_execution_services(
    stamp_request_owner=_stamp_request_owner,
    late_server_export=_late_server_export,
)


_run_routing_preview_services = lambda: build_server_run_routing_preview_services(
    late_server_export=_late_server_export,
)


_get_webhook_triggers_loaded = lambda: _WEBHOOK_TRIGGERS_LOADED


def _set_webhook_triggers_loaded(loaded: bool) -> None:
    global _WEBHOOK_TRIGGERS_LOADED
    _WEBHOOK_TRIGGERS_LOADED = bool(loaded)


_load_webhook_triggers = runtime_webhook_trigger_service.build_load_webhook_triggers_fn(
    _WEBHOOK_TRIGGERS,
    lock=_WEBHOOK_TRIGGER_LOCK,
    get_loaded=_get_webhook_triggers_loaded,
    set_loaded=_set_webhook_triggers_loaded,
    path=lambda: _late_server_export("ORION_WEBHOOK_TRIGGERS_FILE"),
    safe_read_json=lambda: _late_server_export("_safe_read_json"),
)


_persist_webhook_triggers_locked = runtime_webhook_trigger_service.build_persist_webhook_triggers_locked_fn(
    _WEBHOOK_TRIGGERS,
    path=lambda: _late_server_export("ORION_WEBHOOK_TRIGGERS_FILE"),
    safe_write_json=lambda: _late_server_export("_safe_write_json"),
)


_match_webhook_trigger = runtime_webhook_trigger_service.build_match_webhook_trigger_fn(
    _WEBHOOK_TRIGGERS,
    lock=_WEBHOOK_TRIGGER_LOCK,
    load_webhook_triggers_fn=_load_webhook_triggers,
)


_normalize_usage_period = runtime_usage_service.normalize_usage_period


_usage_snapshots_for_user = lambda current_user: runtime_usage_service.usage_snapshots_for_user(
    current_user,
    refresh_server_exports=_refresh_server_exports,
    run_history_lock=RUN_HISTORY_LOCK,
    run_history=RUN_HISTORY,
    runs=runs,
    list_live_runs_fn=run_state_repository.sync_list_live_runs,
    serialize_snapshot=_late_server_export("_serialize_run_snapshot"),
    current_user_is_privileged=_current_user_is_privileged,
    extract_run_owner_user_id=_extract_run_owner_user_id,
)


_normalize_chat_stream_cursor = chat_stream_transport_service.normalize_chat_stream_cursor


_chat_stream_state_db_path = lambda: chat_stream_runtime_service.resolve_chat_stream_state_db_path(
    override=globals().get("_CHAT_STREAM_STATE_DB_OVERRIDE"),
    late_server_export=_late_server_export,
    fallback_db_path=__import__(
        "server_modules.runtime_config",
        fromlist=["ORION_RUNTIME_STATE_DB"],
    ).ORION_RUNTIME_STATE_DB,
)


_configured_direct_chat_worker_count = chat_stream_runtime_service.configured_direct_chat_worker_count


ensure_single_worker_direct_chat_stream_runtime = lambda: chat_stream_state_service.ensure_single_worker_runtime(
    configured_worker_count=_configured_direct_chat_worker_count(),
)


_chat_stream_interrupted_final_payload = chat_stream_state_service.chat_stream_interrupted_final_payload
_chat_stream_replay_payload_from_state = chat_stream_state_service.chat_stream_replay_payload_from_state

_chat_stream_request_signature = _service_direct_chat_request_signature
_chat_stream_key = _service_direct_chat_stream_key
_direct_chat_actor_key = _service_direct_chat_actor_key
_direct_chat_session_manager_enabled = lambda: _service_direct_chat_session_manager_enabled(
    globals().get("ORION_DIRECT_CHAT_SESSION_MANAGER")
)

_build_direct_chat_request_meta = _service_build_direct_chat_request_meta

_prune_chat_stream_sessions_locked = lambda now_ts=None: chat_stream_state_service.prune_chat_stream_sessions_locked(
    _CHAT_STREAM_SESSIONS,
    ttl_seconds=_CHAT_STREAM_TTL_SECONDS,
    now_ts=now_ts,
)

_direct_chat_stream_runtime_bindings = chat_stream_runtime_service.build_direct_chat_stream_runtime_bindings(
    _CHAT_STREAM_SESSIONS,
    lock=_CHAT_STREAM_LOCK,
    ensure_single_worker_runtime_fn=ensure_single_worker_direct_chat_stream_runtime,
    chat_stream_state_db_path=lambda: _chat_stream_state_db_path(),
    stale_after_seconds=_CHAT_STREAM_STATE_STALE_AFTER_SECONDS,
    ttl_seconds=_CHAT_STREAM_STATE_TTL_SECONDS,
    state_ttl_seconds=_CHAT_STREAM_STATE_TTL_SECONDS,
    mark_stale_sessions_interrupted=mark_stale_chat_stream_sessions_interrupted,
    delete_sessions_older_than=delete_chat_stream_sessions_older_than,
    metrics_inc=_chat_stream_metrics_inc,
    session_manager_enabled=lambda: _direct_chat_session_manager_enabled(),
    session_manager_factory=lambda: _direct_chat_session_manager(),
    import_module=__import__,
    now_iso=_chat_stream_now_iso,
    replay_payload_from_state=_chat_stream_replay_payload_from_state,
    get_state=get_chat_stream_state,
    upsert_state=upsert_chat_stream_state,
    interrupted_final_payload=_chat_stream_interrupted_final_payload,
    direct_chat_execution_services_builder=build_direct_chat_execution_services,
    chat_stream_key=_chat_stream_key,
    resolve_direct_chat_turn_request=resolve_direct_chat_turn_request,
    chat_stream_request_signature=_chat_stream_request_signature,
    execute_agent_turn_request=execute_canonical_agent_turn,
    build_turn_execution_services=build_turn_execution_services,
    run_execution_services=_run_execution_services,
    extract_direct_chat_error_response=lambda *args, **kwargs: _extract_direct_chat_error_response(*args, **kwargs),
    start_chat_stream_producer=lambda *args, **kwargs: _start_chat_stream_producer(*args, **kwargs),
    iter_chat_stream_events=lambda *args, **kwargs: _iter_chat_stream_events(*args, **kwargs),
    prune_sessions_locked=_prune_chat_stream_sessions_locked,
)

_default_chat_stream_session = _direct_chat_stream_runtime_bindings.default_chat_stream_session
_persist_chat_stream_session_state = _direct_chat_stream_runtime_bindings.persist_chat_stream_session_state
_build_chat_stream_replay_session = _direct_chat_stream_runtime_bindings.build_chat_stream_replay_session
_load_replayable_chat_stream_session = _direct_chat_stream_runtime_bindings.load_replayable_chat_stream_session
_direct_chat_session_manager = _direct_chat_stream_runtime_bindings.direct_chat_session_manager
initialize_chat_stream_runtime_state = _direct_chat_stream_runtime_bindings.initialize_chat_stream_runtime_state
_direct_chat_execution_services = _direct_chat_stream_runtime_bindings.direct_chat_execution_services
_direct_chat_stream_response_services = _direct_chat_stream_runtime_bindings.direct_chat_stream_response_services
_get_or_create_chat_stream_session = _direct_chat_stream_runtime_bindings.get_or_create_chat_stream_session

_build_direct_chat_event_producer = lambda *, current_user, body, message, workspace_id, session_key, thread_id, client_request_id, agent_turn_request=None: _service_build_direct_chat_event_producer(
    current_user=current_user,
    body=body,
    message=message,
    workspace_id=workspace_id,
    session_key=session_key,
    thread_id=thread_id,
    client_request_id=client_request_id,
    services=_direct_chat_execution_services(),
    agent_turn_request=agent_turn_request,
)


_chat_stream_payload = chat_stream_transport_service.chat_stream_payload


_append_chat_stream_event = lambda session, event_name, payload: chat_stream_runtime_service.append_chat_stream_event(
    session,
    event_name=event_name,
    payload=payload,
    buffer_limit=_CHAT_STREAM_BUFFER_LIMIT,
    persist_session_state=_persist_chat_stream_session_state,
)


_complete_chat_stream_session = lambda session: chat_stream_runtime_service.complete_chat_stream_session(
    session,
    persist_session_state=_persist_chat_stream_session_state,
)


_chat_stream_error_payload = chat_stream_transport_service.chat_stream_error_payload


_extract_direct_chat_error_response = chat_stream_transport_service.extract_direct_chat_error_response


_start_chat_stream_producer = lambda session, producer_fn: chat_stream_transport_service.start_chat_stream_producer(
    session,
    producer_fn=producer_fn,
    append_event=_append_chat_stream_event,
    complete_session=_complete_chat_stream_session,
    capture_exception=sentry_sdk.capture_exception,
)


_iter_chat_stream_events = lambda session, last_event_id: chat_stream_transport_service.iter_chat_stream_events(
    session,
    last_event_id=last_event_id,
    normalize_cursor=_normalize_chat_stream_cursor,
)


_can_view_sensitive_run_payload = runtime_run_detail_service.can_view_sensitive_run_payload


_limited_run_context_view = runtime_run_detail_service.limited_run_context_view


_limited_result_data_view = runtime_run_detail_service.limited_result_data_view


_extract_run_owner_user_id = runtime_run_access_service.extract_run_owner_user_id


_current_user_is_privileged = lambda current_user: runtime_run_access_service.current_user_is_privileged(
    current_user,
    admin_user_ids=set(globals().get("ORION_ADMIN_USER_IDS") or []),
    admin_emails=set(globals().get("ORION_ADMIN_EMAILS") or []),
)


_enforce_run_owner_access = lambda current_user, payload: runtime_run_access_service.enforce_run_owner_access(
    current_user,
    payload,
    current_user_is_privileged_fn=_current_user_is_privileged,
    extract_run_owner_user_id_fn=_extract_run_owner_user_id,
)


_stamp_request_owner = runtime_run_access_service.stamp_request_owner


_resolve_local_execution_start_approval = runtime_local_execution_approval_service.build_resolve_local_execution_start_approval_fn(
    get_pending_confirmation=lambda run: _get_pending_confirmation(run),
    approval_correlation_id=lambda *args, **kwargs: _approval_correlation_id(*args, **kwargs),
    parse_utc_ts=lambda value: _parse_utc_ts(value),
    utc_now=_utc_now,
    utc_now_iso=_utc_now_iso,
    set_pending_confirmation=lambda run, pending: _set_pending_confirmation(run, pending),
    emit_log=lambda *args, **kwargs: emit_log(*args, **kwargs),
    append_approval_audit=lambda **kwargs: _append_approval_audit(**kwargs),
    browser_plan_hash_from_inputs=browser_automation_plan_hash_from_pack_inputs,
    clear_pending_confirmation=lambda run: _clear_pending_confirmation(run),
    set_run_status=lambda run_id, status: set_run_status(run_id, status),
    mark_local_execution_tools_approved=lambda metadata: _mark_local_execution_tools_approved(metadata),
    build_browser_execution_binding=build_browser_execution_binding,
    root_dir=lambda: _late_server_export("ROOT_DIR"),
    enqueue_local_companion_run=lambda run_id, **kwargs: _enqueue_local_companion_run(run_id, **kwargs),
)


_run_thread_is_alive = runtime_run_resume_service.build_run_thread_is_alive_fn(
    enumerate_threads=lambda: threading.enumerate(),
)


_schedule_restored_run_resume = runtime_run_resume_service.build_schedule_restored_run_resume_fn(
    run_thread_is_alive_fn=lambda run: _run_thread_is_alive(run),
    utc_now_iso=_utc_now_iso,
    late_server_export=lambda name: _late_server_export(name),
    thread_class=lambda **kwargs: threading.Thread(**kwargs),
)


def register_run_routes(app) -> None:
    import server as _server
    viewer_dependency = getattr(_server, "require_viewer_api_key", _server.require_api_key)
    member_dependency = getattr(_server, "require_member_api_key", _server.require_api_key)

    global _HEARTBEAT_SCHEDULER
    _HEARTBEAT_SCHEDULER = runtime_route_registration_service.register_runtime_run_routes_from_api(
        app,
        import_module=__import__,
        module_globals=globals(),
        server_module=_server,
        heartbeat_lock=_HEARTBEAT_SCHEDULER_LOCK,
        heartbeat_scheduler=_HEARTBEAT_SCHEDULER,
        heartbeat_scheduler_refresher=lambda scheduler: scheduler,
        load_webhook_triggers=_load_webhook_triggers,
        depends=Depends,
        request_class=Request,
        event_source_response_class=EventSourceResponse,
        require_api_key=_server.require_api_key,
        require_admin_api_key=_server.require_admin_api_key,
        refresh_server_exports=_refresh_server_exports,
        match_webhook_trigger_fn=_match_webhook_trigger,
        webhook_triggers=_WEBHOOK_TRIGGERS,
        webhook_trigger_lock=_WEBHOOK_TRIGGER_LOCK,
        persist_webhook_triggers_locked=_persist_webhook_triggers_locked,
        single_agent_mode=_server.ORION_SINGLE_AGENT_MODE,
        runs=_server.runs,
        iter_logs_for_run=_server.iter_logs_for_run,
        get_replay_payload=_server._get_replay_payload,
        execute_run_start_request_via_turn_runtime=execute_run_start_request_via_turn_runtime,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        enforce_run_owner_access=_enforce_run_owner_access,
    )

    def _looks_like_legacy_direct_chat_body(payload: dict[str, Any]) -> bool:
        if not isinstance(payload, dict):
            return False
        if any(
            key in payload
            for key in (
                "thread_id",
                "prior_messages",
                "approved_action",
                "availability",
                "last_event_id",
            )
        ):
            return True
        return "message" in payload and "session_id" not in payload and "actor" not in payload

    @app.post("/turn", dependencies=[Depends(member_dependency)], response_model=ApiAgentTurnResponse)
    async def canonical_turn(
        request: Request,
        body: Optional[dict[str, Any]] = None,
        current_user=Depends(member_dependency),
    ):
        _refresh_server_exports()
        payload = dict(body or {})
        if not payload:
            payload = await request.json()
            if not isinstance(payload, dict):
                from fastapi import HTTPException

                raise HTTPException(status_code=400, detail="Invalid turn payload")
        payload = _stamp_workspace_authorization_on_turn_payload(
            payload,
            current_user=current_user,
            minimum_role="member",
        )

        if _looks_like_legacy_direct_chat_body(payload):
            return await build_direct_chat_stream_response(
                current_user=current_user,
                body=payload,
                last_event_id=request.headers.get("last-event-id") or payload.get("last_event_id"),
                services=_direct_chat_stream_response_services(),
            )

        if _looks_like_legacy_run_start_body(payload):
            from server_modules.runtime_models import RunStartRequest

            run_request = RunStartRequest(**payload)
            resolution = resolve_run_start_turn_request(
                current_user=current_user,
                body=run_request,
                stamp_request_owner_fn=_stamp_request_owner,
            )
            result = await execute_canonical_agent_turn(
                turn_request=resolution.turn_request,
                current_user=current_user,
                run_execution_services=_run_execution_services(),
                direct_chat_services=_direct_chat_execution_services(),
                chat_body=build_turn_chat_body(resolution.turn_request),
                run_request=resolution.request,
            )
            return normalize_agent_turn_result(result, turn_request=resolution.turn_request)

        turn_request = request_body_to_turn_request(payload)
        if (
            str(turn_request.execution_mode or "").strip().lower() == "sync"
            and str(turn_request.response_mode or "").strip().lower() == "stream"
        ):
            return await build_direct_chat_stream_response(
                current_user=current_user,
                body=build_turn_chat_body(turn_request),
                last_event_id=request.headers.get("last-event-id") or model_to_dict(turn_request.context_hints).get("last_event_id"),
                services=_direct_chat_stream_response_services(),
            )

        result = await execute_canonical_agent_turn(
            turn_request=turn_request,
            current_user=current_user,
            run_execution_services=_run_execution_services(),
            direct_chat_services=_direct_chat_execution_services(),
            chat_body=build_turn_chat_body(turn_request),
        )
        return normalize_agent_turn_result(result, turn_request=turn_request)

    @app.get("/runs", dependencies=[Depends(viewer_dependency)], response_model=ApiRunListResponse)
    async def list_runs(
        limit: int = 50,
        offset: int = 0,
        workspace_id: Optional[str] = None,
        status: Optional[str] = None,
        pack_id: Optional[str] = None,
        current_user=Depends(viewer_dependency),
    ):
        _refresh_server_exports()
        allowed_workspaces = allowed_workspace_ids(current_user)
        requested_workspace_id = (
            enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
            if workspace_id
            else None
        )
        base_history_item_matches = _late_server_export("_history_item_matches")

        def _authorized_history_item_matches(item: Any, requested_workspace: Any, requested_status: Any, requested_pack_id: Any) -> bool:
            if not base_history_item_matches(item, requested_workspace, requested_status, requested_pack_id):
                return False
            if allowed_workspaces is None:
                return True
            if not isinstance(item, dict):
                return False
            run_workspace_id = str(item.get("workspace_id") or "default").strip() or "default"
            return run_workspace_id in allowed_workspaces

        payload = runtime_run_query_service.build_run_list_response(
            limit=limit,
            offset=offset,
            workspace_id=requested_workspace_id,
            status=status,
            pack_id=pack_id,
            current_user=current_user,
            runs=_late_server_export("runs"),
            list_live_runs_fn=run_state_repository.sync_list_live_runs,
            run_history_lock=_late_server_export("RUN_HISTORY_LOCK"),
            run_history=_late_server_export("RUN_HISTORY"),
            serialize_run_snapshot=_late_server_export("_serialize_run_snapshot"),
            history_item_matches=_authorized_history_item_matches,
            current_user_is_privileged=_current_user_is_privileged,
            extract_run_owner_user_id=_extract_run_owner_user_id,
            summarize_history_item=_late_server_export("_summarize_history_item"),
            parse_utc_ts=_late_server_export("_parse_utc_ts"),
        )
        return payload

    @app.get("/approvals", dependencies=[Depends(viewer_dependency)])
    async def list_approvals(
        workspace_id: Optional[str] = None,
        current_user=Depends(viewer_dependency),
    ):
        _refresh_server_exports()
        allowed_workspaces = allowed_workspace_ids(current_user)
        requested_workspace_id = (
            enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
            if workspace_id
            else None
        )
        request_user_id = str((current_user or {}).get("user_id") or "").strip()
        include_all = _current_user_is_privileged(current_user)
        if not include_all and not request_user_id:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Authenticated user id is required.")

        items: list[dict[str, Any]] = []
        for run in run_state_repository.sync_list_live_runs():
            if not isinstance(run, dict):
                continue
            run_id = str(run.get("run_id") or "").strip()
            if not run_id:
                continue
            if not include_all and _extract_run_owner_user_id(run) != request_user_id:
                continue
            context = run.get("context") if isinstance(run.get("context"), dict) else {}
            metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
            run_workspace_id = str(
                run.get("workspace_id")
                or context.get("workspace_id")
                or "default"
            ).strip() or "default"
            if requested_workspace_id and run_workspace_id != requested_workspace_id:
                continue
            if allowed_workspaces is not None and run_workspace_id not in allowed_workspaces:
                continue
            pending = (
                run.get("pending_confirmation")
                if isinstance(run.get("pending_confirmation"), dict)
                else run.get("pending_approval")
                if isinstance(run.get("pending_approval"), dict)
                else None
            )
            if not isinstance(pending, dict):
                continue
            approval_id = str(pending.get("approval_id") or "").strip()
            if not approval_id:
                continue
            items.append(
                {
                    "approval_id": approval_id,
                    "run_id": run_id,
                    "workspace_id": run_workspace_id,
                    "status": str(pending.get("status") or "pending").strip().lower() or "pending",
                    "action": (
                        str(pending.get("action") or "").strip()
                        or str((pending.get("metadata") or {}).get("kind") or "").strip()
                        or str(metadata.get("agent_role") or "").strip()
                        or "Approval"
                    ),
                    "summary": str(pending.get("prompt") or pending.get("reason") or "Approval required.").strip(),
                    "requested_at": pending.get("requested_at") or pending.get("created_at") or run.get("updated_at"),
                    "expires_at": pending.get("expires_at"),
                    "correlation_id": pending.get("correlation_id"),
                }
            )
        items.sort(key=lambda item: str(item.get("requested_at") or ""), reverse=True)
        return {
            "items": items,
            "pending": items,
            "count": len(items),
            "total": len(items),
            "workspace_id": str(requested_workspace_id or "default").strip() or "default",
        }

    @app.post("/sessions", dependencies=[Depends(member_dependency)], response_model=ApiSessionResponse)
    async def create_runtime_session(
        body: ApiSessionRequest,
        current_user=Depends(member_dependency),
    ):
        payload = body.model_dump() if hasattr(body, "model_dump") else body.dict()
        workspace_id = enforce_workspace_access(
            current_user,
            payload.get("workspace_id"),
            minimum_role="member",
        )
        actor = dict(payload.get("actor") or {})
        if not str(actor.get("id") or "").strip():
            actor["id"] = str((current_user or {}).get("user_id") or (current_user or {}).get("email") or "anonymous").strip()
        if not str(actor.get("display_name") or "").strip():
            actor["display_name"] = str((current_user or {}).get("email") or actor.get("id") or "").strip()
        session_id = await session_service.create_session(
            workspace_id=workspace_id,
            tenant_id=str(payload.get("tenant_id") or "default").strip() or "default",
            actor=actor,
            channel=str(payload.get("channel") or "web").strip() or "web",
            metadata=dict(payload.get("metadata") or {}),
            session_id=str(payload.get("session_id") or "").strip() or None,
        )
        record = await session_service.get_session(session_id) or {
            "session_id": session_id,
            "workspace_id": workspace_id,
            "tenant_id": str(payload.get("tenant_id") or "default").strip() or "default",
            "channel": str(payload.get("channel") or "web").strip() or "web",
            "actor": actor,
            "metadata": dict(payload.get("metadata") or {}),
            "status": "active",
        }
        return normalize_session_record(record)

    @app.get("/sessions/{session_id}", dependencies=[Depends(viewer_dependency)], response_model=ApiSessionResponse)
    async def get_runtime_session(
        session_id: str,
        current_user=Depends(viewer_dependency),
    ):
        record = await session_service.get_session(session_id)
        if not isinstance(record, dict):
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Session not found.")
        enforce_workspace_access(
            current_user,
            record.get("workspace_id"),
            minimum_role="viewer",
        )
        return normalize_session_record(record)

    @app.delete("/sessions/{session_id}", dependencies=[Depends(member_dependency)])
    async def delete_runtime_session(
        session_id: str,
        current_user=Depends(member_dependency),
    ):
        record = await session_service.get_session(session_id)
        if isinstance(record, dict):
            enforce_workspace_access(
                current_user,
                record.get("workspace_id"),
                minimum_role="member",
            )
        await session_service.terminate_session(session_id)
        return {"ok": True, "session_id": str(session_id or "").strip()}
