from __future__ import annotations
import sentry_sdk
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from server_modules.agent_turn import resolve_direct_chat_turn_request
from server_modules.direct_chat_service import (
    build_direct_chat_execution_services,
    build_direct_chat_event_producer as _service_build_direct_chat_event_producer,
    build_direct_chat_request_meta as _service_build_direct_chat_request_meta,
    direct_chat_actor_key as _service_direct_chat_actor_key,
    direct_chat_request_signature as _service_direct_chat_request_signature,
    direct_chat_session_manager_enabled as _service_direct_chat_session_manager_enabled,
    direct_chat_stream_key as _service_direct_chat_stream_key,
)
from server_modules.direct_chat_stream_response_service import build_direct_chat_stream_response
from server_modules import direct_chat_stream_runtime_service as chat_stream_runtime_service
from server_modules import direct_chat_stream_state_service as chat_stream_state_service
from server_modules import direct_chat_stream_transport_service as chat_stream_transport_service
from server_modules.heartbeat import HeartbeatScheduler
from server_modules.run_service import (
    RunCreationServices,
    RunExecutionServices,
    RunRoutingPreviewServices,
    build_run_creation_services,
    build_run_execution_services,
    build_run_precheck_result,
    build_run_routing_preview_services,
    build_run_routing_preview,
    create_run_result_from_request,
)
from server_modules.turn_runtime import (
    build_turn_execution_services,
    execute_agent_turn_request,
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
from server_modules import runtime_history_service
from server_modules import runtime_local_execution_approval_service
from server_modules import runtime_request_service
from server_modules import runtime_run_access_service
from server_modules import runtime_run_approval_service
from server_modules import runtime_run_control_service
from server_modules import runtime_run_delegation_service
from server_modules import runtime_run_detail_service
from server_modules import runtime_run_entry_service
from server_modules import runtime_run_query_service
from server_modules import runtime_run_replay_service
from server_modules import runtime_run_resume_service
from server_modules import runtime_usage_service
from server_modules import runtime_webhook_trigger_service
from server_modules import runtime_workspace_service
from server_modules.usage_reporting import aggregate_usage_summary, list_usage_runs

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


def _chat_stream_metrics_inc(key: str, amount: float = 1) -> None:
    try:
        metrics_fn = _late_server_export("metrics_inc")
    except Exception:
        return
    try:
        metrics_fn(key, amount)
    except Exception:
        return


_heartbeat_scheduler = lambda: runtime_heartbeat_service.heartbeat_scheduler(
    lock=_HEARTBEAT_SCHEDULER_LOCK,
    scheduler=_HEARTBEAT_SCHEDULER,
)


_run_creation_services = lambda: build_run_creation_services(
    create_run_from_request=_late_server_export("_create_run_from_request"),
)


_run_execution_services = lambda: build_run_execution_services(
    stamp_request_owner=_stamp_request_owner,
    prepare_run_start_request=_late_server_export("_prepare_run_start_request"),
    create_run_from_request=_late_server_export("_create_run_from_request"),
)


_run_routing_preview_services = lambda: build_run_routing_preview_services(
    prepare_run_start_request=_late_server_export("_prepare_run_start_request"),
    compute_tool_policy_precheck=_late_server_export("_compute_tool_policy_precheck"),
)


_create_run_result = lambda request, *, schedule_id=None: create_run_result_from_request(
    request,
    services=_run_creation_services(),
    schedule_id=schedule_id,
)

def _load_webhook_triggers() -> None:
    global _WEBHOOK_TRIGGERS_LOADED
    _WEBHOOK_TRIGGERS_LOADED = runtime_webhook_trigger_service.load_webhook_triggers(
        _WEBHOOK_TRIGGERS,
        lock=_WEBHOOK_TRIGGER_LOCK,
        loaded=_WEBHOOK_TRIGGERS_LOADED,
        path=_late_server_export("ORION_WEBHOOK_TRIGGERS_FILE"),
        safe_read_json=_late_server_export("_safe_read_json"),
    )


def _persist_webhook_triggers_locked() -> None:
    return runtime_webhook_trigger_service.persist_webhook_triggers_locked(
        _WEBHOOK_TRIGGERS,
        path=_late_server_export("ORION_WEBHOOK_TRIGGERS_FILE"),
        safe_write_json=_late_server_export("_safe_write_json"),
    )


def _match_webhook_trigger(workspace_id: str, request_url: str) -> Optional[dict[str, Any]]:
    _load_webhook_triggers()
    return runtime_webhook_trigger_service.match_webhook_trigger(
        _WEBHOOK_TRIGGERS,
        lock=_WEBHOOK_TRIGGER_LOCK,
        workspace_id=workspace_id,
        request_url=request_url,
    )


_normalize_usage_period = runtime_usage_service.normalize_usage_period


def _usage_snapshots_for_user(current_user: Any) -> list[dict[str, Any]]:
    return runtime_usage_service.usage_snapshots_for_user(
        current_user,
        refresh_server_exports=_refresh_server_exports,
        run_history_lock=RUN_HISTORY_LOCK,
        run_history=RUN_HISTORY,
        runs=runs,
        serialize_snapshot=_late_server_export("_serialize_run_snapshot"),
        current_user_is_privileged=_current_user_is_privileged,
        extract_run_owner_user_id=_extract_run_owner_user_id,
    )


def _normalize_chat_stream_cursor(value: Any) -> int:
    token = str(value or "").strip()
    if not token:
        return 0
    try:
        return max(0, int(token))
    except Exception:
        return 0


def _chat_stream_state_db_path() -> Path:
    from server_modules.runtime_config import ORION_RUNTIME_STATE_DB

    return chat_stream_runtime_service.resolve_chat_stream_state_db_path(
        override=globals().get("_CHAT_STREAM_STATE_DB_OVERRIDE"),
        late_server_export=_late_server_export,
        fallback_db_path=ORION_RUNTIME_STATE_DB,
    )


_configured_direct_chat_worker_count = chat_stream_runtime_service.configured_direct_chat_worker_count


def ensure_single_worker_direct_chat_stream_runtime() -> None:
    return chat_stream_state_service.ensure_single_worker_runtime(
        configured_worker_count=_configured_direct_chat_worker_count(),
    )


def initialize_chat_stream_runtime_state(*, now_ts: Optional[float] = None) -> None:
    return chat_stream_runtime_service.initialize_chat_stream_runtime_state(
        now_ts=now_ts,
        ensure_single_worker_runtime_fn=ensure_single_worker_direct_chat_stream_runtime,
        db_path=_chat_stream_state_db_path(),
        stale_after_seconds=_CHAT_STREAM_STATE_STALE_AFTER_SECONDS,
        ttl_seconds=_CHAT_STREAM_STATE_TTL_SECONDS,
        mark_stale_sessions_interrupted=mark_stale_chat_stream_sessions_interrupted,
        delete_sessions_older_than=delete_chat_stream_sessions_older_than,
        metrics_inc=_chat_stream_metrics_inc,
        session_manager_enabled=_direct_chat_session_manager_enabled,
        session_manager_factory=_direct_chat_session_manager,
    )


_default_chat_stream_session = chat_stream_runtime_service.build_default_chat_stream_session_factory(
    now_iso=_chat_stream_now_iso,
)


_persist_chat_stream_session_state = lambda session: chat_stream_runtime_service.build_persist_chat_stream_session_state(
    chat_stream_state_db_path=_chat_stream_state_db_path,
    now_iso=_chat_stream_now_iso,
    upsert_state=upsert_chat_stream_state,
)(session)


_chat_stream_interrupted_final_payload = chat_stream_state_service.chat_stream_interrupted_final_payload
_chat_stream_replay_payload_from_state = chat_stream_state_service.chat_stream_replay_payload_from_state


_build_chat_stream_replay_session = chat_stream_runtime_service.build_chat_stream_replay_session_factory(
    default_session_factory=_default_chat_stream_session,
    replay_payload_from_state=_chat_stream_replay_payload_from_state,
    now_iso=_chat_stream_now_iso,
)


_load_replayable_chat_stream_session = lambda key, *, thread_id, request_id, workspace_id: chat_stream_runtime_service.build_replayable_chat_stream_session_loader(
    chat_stream_state_db_path=_chat_stream_state_db_path,
    get_state=get_chat_stream_state,
    upsert_state=upsert_chat_stream_state,
    metrics_inc=_chat_stream_metrics_inc,
    now_iso=_chat_stream_now_iso,
    interrupted_final_payload=_chat_stream_interrupted_final_payload,
    build_replay_session=_build_chat_stream_replay_session,
)(
    key,
    thread_id=thread_id,
    request_id=request_id,
    workspace_id=workspace_id,
)


_chat_stream_request_signature = _service_direct_chat_request_signature
_chat_stream_key = _service_direct_chat_stream_key
_direct_chat_actor_key = _service_direct_chat_actor_key
_direct_chat_session_manager_enabled = lambda: _service_direct_chat_session_manager_enabled(
    globals().get("ORION_DIRECT_CHAT_SESSION_MANAGER")
)


_direct_chat_session_manager = lambda: chat_stream_runtime_service.build_direct_chat_session_manager(
    get_default_session_manager=__import__(
        "server_modules.session_manager.manager",
        fromlist=["get_default_session_manager"],
    ).get_default_session_manager,
    db_path=_chat_stream_state_db_path(),
)


_direct_chat_execution_services = lambda: chat_stream_runtime_service.build_direct_chat_execution_services(
    builder=build_direct_chat_execution_services,
    chat_stream_key=_chat_stream_key,
    session_manager_enabled=_direct_chat_session_manager_enabled,
    session_manager_factory=_direct_chat_session_manager,
    build_direct_operator_reply=__import__(
        "server_modules.operator_chat",
        fromlist=["build_direct_operator_reply"],
    ).build_direct_operator_reply,
    build_chat_turn_event_stream=__import__(
        "server_modules.operator_chat",
        fromlist=["build_chat_turn_event_stream"],
    ).build_chat_turn_event_stream,
)


_direct_chat_stream_response_services = lambda: chat_stream_runtime_service.build_direct_chat_stream_response_services(
    resolve_direct_chat_turn_request=resolve_direct_chat_turn_request,
    chat_stream_request_signature=_chat_stream_request_signature,
    execute_agent_turn_request=execute_agent_turn_request,
    build_turn_execution_services=build_turn_execution_services,
    run_execution_services=_run_execution_services,
    direct_chat_execution_services=_direct_chat_execution_services,
    get_chat_stream_state=get_chat_stream_state,
    chat_stream_state_db_path=_chat_stream_state_db_path,
    get_or_create_chat_stream_session=_get_or_create_chat_stream_session,
    extract_direct_chat_error_response=_extract_direct_chat_error_response,
    start_chat_stream_producer=_start_chat_stream_producer,
    iter_chat_stream_events=_iter_chat_stream_events,
)


_build_direct_chat_request_meta = _service_build_direct_chat_request_meta
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


_prune_chat_stream_sessions_locked = lambda now_ts=None: chat_stream_state_service.prune_chat_stream_sessions_locked(
    _CHAT_STREAM_SESSIONS,
    ttl_seconds=_CHAT_STREAM_TTL_SECONDS,
    now_ts=now_ts,
)


def _get_or_create_chat_stream_session(
    key: str,
    *,
    thread_id: str,
    request_id: str,
    workspace_id: str,
) -> dict[str, Any]:
    with _CHAT_STREAM_LOCK:
        return chat_stream_runtime_service.get_or_create_chat_stream_session(
            _CHAT_STREAM_SESSIONS,
            key=key,
            thread_id=thread_id,
            request_id=request_id,
            workspace_id=workspace_id,
            prune_sessions_locked=lambda: _prune_chat_stream_sessions_locked(),
            delete_sessions_older_than=delete_chat_stream_sessions_older_than,
            db_path=_chat_stream_state_db_path(),
            state_ttl_seconds=_CHAT_STREAM_STATE_TTL_SECONDS,
            load_replayable_session=_load_replayable_chat_stream_session,
            default_session_factory=_default_chat_stream_session,
            persist_session_state=_persist_chat_stream_session_state,
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


def _resolve_local_execution_start_approval(
    run_id_str: str,
    run: dict,
    approval_id: str,
    decision_text: str,
    note: str = "",
) -> dict:
    return runtime_local_execution_approval_service.resolve_local_execution_start_approval(
        run_id_str,
        run,
        approval_id,
        decision_text,
        note=note,
        get_pending_confirmation=_get_pending_confirmation,
        approval_correlation_id=_approval_correlation_id,
        parse_utc_ts=_parse_utc_ts,
        utc_now=_utc_now,
        utc_now_iso=_utc_now_iso,
        set_pending_confirmation=_set_pending_confirmation,
        emit_log=emit_log,
        append_approval_audit=_append_approval_audit,
        browser_plan_hash_from_inputs=browser_automation_plan_hash_from_pack_inputs,
        clear_pending_confirmation=_clear_pending_confirmation,
        set_run_status=set_run_status,
        mark_local_execution_tools_approved=_mark_local_execution_tools_approved,
        build_browser_execution_binding=build_browser_execution_binding,
        root_dir=_late_server_export("ROOT_DIR"),
        enqueue_local_companion_run=_enqueue_local_companion_run,
    )


_run_thread_is_alive = lambda run: runtime_run_resume_service.run_thread_is_alive(
    run,
    enumerate_threads=threading.enumerate,
)


def _schedule_restored_run_resume(run_id_str: str, run: dict) -> bool:
    return runtime_run_resume_service.schedule_restored_run_resume(
        run_id_str,
        run,
        run_thread_is_alive_fn=_run_thread_is_alive,
        utc_now_iso=_utc_now_iso,
        late_server_export=_late_server_export,
        thread_class=threading.Thread,
    )


def register_run_routes(app) -> None:
    import server as _server
    from server_modules.autopilot_connectors import handle_telegram_send_message
    from server_modules.memory_service import delete_memory, workspace_memory_snapshot
    from server_modules.runtime_models import RunStartRequest
    from server_modules.workspace_context import (
        read_workspace_context_files,
        write_workspace_context_file,
    )

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    from server_modules import runs_core as _runs_core

    heartbeat_run_callback = runtime_heartbeat_service.build_heartbeat_run_callback(
        run_start_request_class=RunStartRequest,
        trigger_pending_heartbeat_schedules=_runs_core.trigger_pending_heartbeat_schedules,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=_stamp_request_owner,
        run_execution_services=_run_execution_services,
    )
    heartbeat_notify_callback = runtime_heartbeat_service.build_heartbeat_notify_callback(
        handle_telegram_send_message=handle_telegram_send_message,
    )

    global _HEARTBEAT_SCHEDULER
    _HEARTBEAT_SCHEDULER = runtime_heartbeat_service.ensure_heartbeat_scheduler_started(
        lock=_HEARTBEAT_SCHEDULER_LOCK,
        scheduler=_HEARTBEAT_SCHEDULER,
        scheduler_factory=lambda: HeartbeatScheduler(
            interval_seconds=30 * 60,
            workspace_id="default",
            run_callback=heartbeat_run_callback,
            notify_callback=heartbeat_notify_callback,
        ),
    )
    _load_webhook_triggers()

    @app.post("/runs/start", dependencies=[Depends(require_api_key)])
    async def start_run(body: Optional[RunStartRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        return await runtime_run_entry_service.start_run_response(
            body or RunStartRequest(),
            current_user=current_user,
            execute_run_start_request_via_turn_runtime=execute_run_start_request_via_turn_runtime,
            stamp_request_owner_fn=_stamp_request_owner,
            run_execution_services=_run_execution_services,
        )

    @app.post("/chat/respond", dependencies=[Depends(require_api_key)])
    async def respond_chat(request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        body = await runtime_request_service.read_json_object_payload(
            request,
            invalid_detail="Invalid chat payload",
        )
        return await build_direct_chat_stream_response(
            current_user=runtime_request_service.require_authenticated_user(current_user),
            body=body,
            last_event_id=request.headers.get("last-event-id") or body.get("last_event_id"),
            services=_direct_chat_stream_response_services(),
        )

    @app.get("/memory/{workspace_id}", dependencies=[Depends(require_api_key)])
    async def list_workspace_memory(workspace_id: str, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        return runtime_workspace_service.list_workspace_memory_payload(
            workspace_id,
            workspace_memory_snapshot=workspace_memory_snapshot,
        )

    @app.delete("/memory/{workspace_id}/{key}", dependencies=[Depends(require_api_key)])
    async def delete_workspace_memory(workspace_id: str, key: str, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        return runtime_workspace_service.delete_workspace_memory_payload(
            workspace_id,
            key,
            delete_memory=delete_memory,
        )

    @app.get("/workspace/context-files", dependencies=[Depends(require_api_key)])
    async def get_workspace_context_files(current_user=Depends(require_api_key)):
        _refresh_server_exports()
        return runtime_workspace_service.workspace_context_files_payload(
            read_workspace_context_files=read_workspace_context_files,
        )

    @app.post("/workspace/context-files/{filename}", dependencies=[Depends(require_api_key)])
    async def update_workspace_context_file(filename: str, request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        body = await runtime_request_service.read_json_payload(
            request,
            invalid_detail="Invalid context file payload",
        )
        return runtime_workspace_service.update_workspace_context_file_payload(
            filename,
            body,
            write_workspace_context_file=write_workspace_context_file,
        )

    @app.get("/heartbeat/status", dependencies=[Depends(require_api_key)])
    async def get_heartbeat_status(current_user=Depends(require_api_key)):
        _refresh_server_exports()
        return runtime_heartbeat_service.heartbeat_status_payload(
            scheduler=_heartbeat_scheduler(),
        )

    @app.post("/heartbeat/trigger", dependencies=[Depends(require_api_key)])
    async def trigger_heartbeat(current_user=Depends(require_api_key)):
        _refresh_server_exports()
        try:
            return runtime_heartbeat_service.trigger_heartbeat_payload(
                scheduler=_heartbeat_scheduler(),
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail="Heartbeat scheduler is not configured.")

    @app.post("/webhooks/register", dependencies=[Depends(require_api_key)])
    async def register_webhook_trigger(request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        _load_webhook_triggers()
        body = await runtime_request_service.read_json_payload(
            request,
            invalid_detail="Invalid webhook trigger payload",
        )
        return runtime_webhook_trigger_service.register_webhook_trigger_payload(
            body,
            uuid_factory=uuid.uuid4,
            build_webhook_trigger_fn=runtime_webhook_trigger_service.build_webhook_trigger,
            triggers=_WEBHOOK_TRIGGERS,
            lock=_WEBHOOK_TRIGGER_LOCK,
            persist_webhook_triggers_locked=_persist_webhook_triggers_locked,
        )

    @app.post("/webhooks/ingest/{workspace_id}", dependencies=[Depends(require_api_key)])
    async def ingest_webhook(workspace_id: str, request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        payload = await runtime_request_service.read_json_payload(
            request,
            invalid_detail="Invalid webhook payload",
        )
        return await runtime_webhook_trigger_service.ingest_webhook_payload(
            workspace_id=workspace_id,
            request_url=str(request.url),
            payload=payload,
            current_user=current_user,
            match_webhook_trigger_fn=_match_webhook_trigger,
            run_start_request_class=RunStartRequest,
            execute_run_start_request_via_turn_runtime=execute_run_start_request_via_turn_runtime,
            stamp_request_owner_fn=_stamp_request_owner,
            run_execution_services=_run_execution_services,
        )

    @app.post("/runs/{run_id}/delegate", dependencies=[Depends(require_api_key)])
    async def delegate_run(run_id: uuid.UUID, body: RunDelegationRequest, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        return runtime_run_delegation_service.delegate_run_children(
            str(run_id),
            body=body,
            current_user=current_user,
            lookup_run_snapshot=_late_server_export("_lookup_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            normalize_agent_role=normalize_agent_role,
            build_delegated_run_request=_late_server_export("_build_delegated_run_request"),
            execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
            stamp_request_owner_fn=_stamp_request_owner,
            run_execution_services=_run_execution_services,
            normalize_run_id_token=_late_server_export("_normalize_run_id_token"),
            refresh_parent_delegation_state=_late_server_export("_refresh_parent_delegation_state"),
        )

    @app.post("/runs/{run_id}/delegate/auto", dependencies=[Depends(require_api_key)])
    async def auto_delegate_run(run_id: uuid.UUID, body: Optional[RunAutoDelegationRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        return runtime_run_delegation_service.auto_delegate_run_children(
            str(run_id),
            request_payload=body or RunAutoDelegationRequest(),
            current_user=current_user,
            lookup_run_snapshot=_late_server_export("_lookup_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            normalize_agent_role=normalize_agent_role,
            build_auto_delegation_plan=_late_server_export("_build_auto_delegation_plan"),
            emit_auto_delegation_routing_log=_late_server_export("_emit_auto_delegation_routing_log"),
            build_delegated_run_request=_late_server_export("_build_delegated_run_request"),
            execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
            stamp_request_owner_fn=_stamp_request_owner,
            run_execution_services=_run_execution_services,
            normalize_run_id_token=_late_server_export("_normalize_run_id_token"),
            refresh_parent_delegation_state=_late_server_export("_refresh_parent_delegation_state"),
        )

    @app.post("/runs/{run_id}/delegate/retry-failed", dependencies=[Depends(require_api_key)])
    async def retry_failed_delegation_runs(run_id: uuid.UUID, body: Optional[RunDelegationRetryRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        return runtime_run_delegation_service.retry_failed_delegation_runs(
            str(run_id),
            request_payload=body or RunDelegationRetryRequest(),
            current_user=current_user,
            lookup_run_snapshot=_late_server_export("_lookup_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            normalize_agent_role=normalize_agent_role,
            find_run_relationships=_late_server_export("_find_run_relationships"),
            normalize_run_id_token=_late_server_export("_normalize_run_id_token"),
            parse_utc_ts=_parse_utc_ts,
            build_retry_child_payload=_build_retry_child_payload,
            build_delegated_run_request=_late_server_export("_build_delegated_run_request"),
            execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
            stamp_request_owner_fn=_stamp_request_owner,
            run_execution_services=_run_execution_services,
            refresh_parent_delegation_state=_late_server_export("_refresh_parent_delegation_state"),
        )

    @app.post("/routing/preview", dependencies=[Depends(require_api_key)])
    async def preview_routing(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        return runtime_run_entry_service.preview_routing_response(
            body or RunStartRequest(),
            build_run_routing_preview=build_run_routing_preview,
            run_routing_preview_services=_run_routing_preview_services,
        )

    @app.post("/runs/precheck", dependencies=[Depends(require_api_key)])
    async def precheck_run(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        return await runtime_run_entry_service.precheck_run_response(
            body or RunStartRequest(),
            build_run_precheck_result=build_run_precheck_result,
            run_routing_preview_services=_run_routing_preview_services,
        )

    @app.get("/runs/{run_id}")
    async def get_run(run_id: uuid.UUID, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        from server_modules.runs_delegation import _build_delegation_summary, _find_run_relationships
        from server_modules.runs_output import (
            _get_replay_payload,
            _limited_node_states_view,
            _resolve_run_connector_binding,
            _serialize_run_snapshot,
            redact_sensitive,
        )
        from server_modules.runtime_memory import _trim_memory_trace
        return runtime_run_query_service.build_run_detail_response(
            str(run_id),
            current_user=current_user,
            runs=runs,
            get_replay_payload=_get_replay_payload,
            serialize_run_snapshot=_serialize_run_snapshot,
            enforce_run_owner_access=_enforce_run_owner_access,
            can_view_sensitive_run_payload=_can_view_sensitive_run_payload,
            limited_run_context_view=_limited_run_context_view,
            build_delegation_summary=_build_delegation_summary,
            find_run_relationships=_find_run_relationships,
            resolve_run_connector_binding=_resolve_run_connector_binding,
            redact_sensitive=redact_sensitive,
            limited_result_data_view_fn=_limited_result_data_view,
            limited_node_states_view_fn=_limited_node_states_view,
            trim_memory_trace_fn=_trim_memory_trace,
            get_pending_confirmation_fn=_get_pending_confirmation,
            build_archived_run_detail_response=runtime_run_detail_service.build_archived_run_detail_response,
            build_live_run_detail_response=runtime_run_detail_service.build_live_run_detail_response,
        )

    @app.get("/history/runs", dependencies=[Depends(require_api_key)])
    async def get_runs_history(
        limit: int = 30,
        workspace_id: Optional[str] = None,
        status: Optional[str] = None,
        pack_id: Optional[str] = None,
        current_user=Depends(require_api_key),
    ):
        return runtime_history_service.build_runs_history_payload(
            limit=limit,
            workspace_id=workspace_id,
            status=status,
            pack_id=pack_id,
            current_user=current_user,
            refresh_server_exports=_refresh_server_exports,
            run_history_lock=RUN_HISTORY_LOCK,
            run_history=RUN_HISTORY,
            history_item_matches=_history_item_matches,
            current_user_is_privileged=_current_user_is_privileged,
            extract_run_owner_user_id=_extract_run_owner_user_id,
            normalize_run_id_token=_late_server_export("_normalize_run_id_token"),
            summarize_history_item=_summarize_history_item,
        )

    @app.get("/usage/summary", dependencies=[Depends(require_api_key)])
    async def get_usage_summary(
        period: str = "all",
        current_user=Depends(require_api_key),
    ):
        _refresh_server_exports()
        snapshots = _usage_snapshots_for_user(current_user)
        return aggregate_usage_summary(snapshots, period=_normalize_usage_period(period))

    @app.get("/usage/runs", dependencies=[Depends(require_api_key)])
    async def get_usage_runs(
        limit: int = 50,
        offset: int = 0,
        period: str = "all",
        current_user=Depends(require_api_key),
    ):
        _refresh_server_exports()
        snapshots = _usage_snapshots_for_user(current_user)
        return list_usage_runs(
            snapshots,
            period=_normalize_usage_period(period),
            limit=limit,
            offset=offset,
        )

    @app.get("/runs/{run_id}/replay", dependencies=[Depends(require_admin_api_key)])
    async def get_run_replay(run_id: uuid.UUID):
        _refresh_server_exports()
        return runtime_run_replay_service.replay_item_response(
            item=_get_replay_payload(str(run_id)),
        )

    @app.post("/runs/{run_id}/replay", dependencies=[Depends(require_admin_api_key)])
    async def replay_run(run_id: uuid.UUID):
        _refresh_server_exports()
        return runtime_run_replay_service.replay_run_from_item(
            item=_get_replay_payload(str(run_id)),
            run_start_request_class=RunStartRequest,
            execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
            stamp_request_owner_fn=_stamp_request_owner,
            run_execution_services=_run_execution_services,
        )

    @app.get("/runs/{run_id}/stream", dependencies=[Depends(require_api_key)])
    async def stream_run(run_id: uuid.UUID, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        return runtime_run_entry_service.stream_run_response(
            str(run_id),
            current_user=current_user,
            runs=runs,
            serialize_run_snapshot=_late_server_export("_serialize_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            event_source_response_class=EventSourceResponse,
            iter_logs_for_run=iter_logs_for_run,
        )

    @app.post("/runs/{run_id}/decision", dependencies=[Depends(require_api_key)])
    async def submit_run_decision(run_id: uuid.UUID, payload: DecisionPayload, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        payload.validate_fields()
        run_id_str = str(run_id)
        return runtime_run_approval_service.submit_run_decision(
            run_id_str,
            run=runs.get(run_id_str),
            payload=payload,
            current_user=current_user,
            serialize_run_snapshot=_late_server_export("_serialize_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            get_pending_confirmation=_get_pending_confirmation,
            approval_correlation_id=_approval_correlation_id,
            append_approval_audit=_append_approval_audit,
            resolve_local_execution_start_approval=_resolve_local_execution_start_approval,
        )

    @app.post("/runs/{run_id}/approvals/{approval_id}/resolve", dependencies=[Depends(require_api_key)])
    async def resolve_run_approval(run_id: uuid.UUID, approval_id: str, payload: ApprovalResolvePayload, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        payload.validate_fields()
        run_id_str = str(run_id)
        return runtime_run_approval_service.resolve_run_approval(
            run_id_str,
            approval_id,
            run=runs.get(run_id_str),
            payload=payload,
            current_user=current_user,
            serialize_run_snapshot=_late_server_export("_serialize_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            get_pending_confirmation=_get_pending_confirmation,
            set_pending_confirmation=_set_pending_confirmation,
            parse_utc_ts=_parse_utc_ts,
            utc_now=_utc_now,
            utc_now_iso=_utc_now_iso,
            approval_correlation_id=_approval_correlation_id,
            append_approval_audit=_append_approval_audit,
            resolve_local_execution_start_approval=_resolve_local_execution_start_approval,
            run_thread_is_alive=_run_thread_is_alive,
            emit_log=emit_log,
            schedule_restored_run_resume=_schedule_restored_run_resume,
        )

    @app.post("/runs/{run_id}/resume", dependencies=[Depends(require_api_key)])
    async def resume_run(run_id: uuid.UUID, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        run_id_str = str(run_id)
        return runtime_run_control_service.resume_waiting_run(
            run_id_str,
            run=runs.get(run_id_str),
            current_user=current_user,
            serialize_run_snapshot=_late_server_export("_serialize_run_snapshot"),
            enforce_run_owner_access=_enforce_run_owner_access,
            get_pending_confirmation=_get_pending_confirmation,
            emit_log=emit_log,
            schedule_restored_run_resume=_schedule_restored_run_resume,
        )
