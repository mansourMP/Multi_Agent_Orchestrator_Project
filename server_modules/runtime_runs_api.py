from __future__ import annotations
import sentry_sdk
import threading
from datetime import datetime, timezone
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
from server_modules import direct_chat_stream_runtime_service as chat_stream_runtime_service
from server_modules import direct_chat_stream_state_service as chat_stream_state_service
from server_modules import direct_chat_stream_transport_service as chat_stream_transport_service
from server_modules.heartbeat import HeartbeatScheduler
from server_modules.run_service import (
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
from server_modules import runtime_local_execution_approval_service
from server_modules import runtime_route_binding_service
from server_modules import runtime_route_bootstrap_service
from server_modules import runtime_route_registry_service
from server_modules import runtime_run_access_service
from server_modules import runtime_run_detail_service
from server_modules import runtime_run_resume_service
from server_modules import runtime_usage_service
from server_modules import runtime_webhook_trigger_service
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


_direct_chat_session_manager = chat_stream_runtime_service.build_default_direct_chat_session_manager_factory(
    chat_stream_state_db_path=_chat_stream_state_db_path,
    import_module=__import__,
)


initialize_chat_stream_runtime_state = chat_stream_runtime_service.build_initialize_chat_stream_runtime_state_fn(
    ensure_single_worker_runtime_fn=ensure_single_worker_direct_chat_stream_runtime,
    chat_stream_state_db_path=lambda: _chat_stream_state_db_path(),
    stale_after_seconds=_CHAT_STREAM_STATE_STALE_AFTER_SECONDS,
    ttl_seconds=_CHAT_STREAM_STATE_TTL_SECONDS,
    mark_stale_sessions_interrupted=mark_stale_chat_stream_sessions_interrupted,
    delete_sessions_older_than=delete_chat_stream_sessions_older_than,
    metrics_inc=_chat_stream_metrics_inc,
    session_manager_enabled=lambda: _direct_chat_session_manager_enabled(),
    session_manager_factory=lambda: _direct_chat_session_manager(),
)


_direct_chat_execution_services = lambda: chat_stream_runtime_service.build_imported_direct_chat_execution_services(
    builder=build_direct_chat_execution_services,
    chat_stream_key=_chat_stream_key,
    session_manager_enabled=_direct_chat_session_manager_enabled,
    session_manager_factory=_direct_chat_session_manager,
    import_module=__import__,
)

_direct_chat_stream_response_services = chat_stream_runtime_service.build_direct_chat_stream_response_services_factory(
    resolve_direct_chat_turn_request=resolve_direct_chat_turn_request,
    chat_stream_request_signature=_chat_stream_request_signature,
    execute_agent_turn_request=execute_agent_turn_request,
    build_turn_execution_services=build_turn_execution_services,
    run_execution_services=_run_execution_services,
    direct_chat_execution_services=_direct_chat_execution_services,
    get_chat_stream_state=get_chat_stream_state,
    chat_stream_state_db_path=_chat_stream_state_db_path,
    get_or_create_chat_stream_session=lambda *args, **kwargs: _get_or_create_chat_stream_session(*args, **kwargs),
    extract_direct_chat_error_response=lambda *args, **kwargs: _extract_direct_chat_error_response(*args, **kwargs),
    start_chat_stream_producer=lambda *args, **kwargs: _start_chat_stream_producer(*args, **kwargs),
    iter_chat_stream_events=lambda *args, **kwargs: _iter_chat_stream_events(*args, **kwargs),
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


_get_or_create_chat_stream_session = chat_stream_runtime_service.build_get_or_create_chat_stream_session_fn(
    _CHAT_STREAM_SESSIONS,
    lock=_CHAT_STREAM_LOCK,
    prune_sessions_locked=lambda: _prune_chat_stream_sessions_locked(),
    delete_sessions_older_than=delete_chat_stream_sessions_older_than,
    chat_stream_state_db_path=lambda: _chat_stream_state_db_path(),
    state_ttl_seconds=_CHAT_STREAM_STATE_TTL_SECONDS,
    load_replayable_session=lambda *args, **kwargs: _load_replayable_chat_stream_session(*args, **kwargs),
    default_session_factory=lambda *args, **kwargs: _default_chat_stream_session(*args, **kwargs),
    persist_session_state=lambda session: _persist_chat_stream_session_state(session),
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


_resolve_local_execution_start_approval = lambda run_id_str, run, approval_id, decision_text, note="": runtime_local_execution_approval_service.resolve_local_execution_start_approval(
        run_id_str,
        run,
        approval_id,
        decision_text,
        note=note,
        **runtime_local_execution_approval_service.build_local_execution_approval_callbacks(
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
        ),
    )


_run_thread_is_alive = lambda run: runtime_run_resume_service.run_thread_is_alive(
    run,
    enumerate_threads=threading.enumerate,
)


_schedule_restored_run_resume = lambda run_id_str, run: runtime_run_resume_service.schedule_restored_run_resume(
    run_id_str,
    run,
    run_thread_is_alive_fn=_run_thread_is_alive,
    utc_now_iso=_utc_now_iso,
    late_server_export=_late_server_export,
    thread_class=threading.Thread,
)


def register_run_routes(app) -> None:
    import server as _server

    deps = runtime_route_bootstrap_service.import_runtime_run_route_dependencies(
        import_module=__import__,
        module_globals=globals(),
        server_module=_server,
    )

    bootstrap_callbacks = runtime_route_bootstrap_service.build_runtime_run_route_bootstrap_callbacks(
        run_start_request_class=deps.run_start_request_class,
        trigger_pending_heartbeat_schedules=deps.trigger_pending_heartbeat_schedules,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=_stamp_request_owner,
        run_execution_services=_run_execution_services,
        handle_telegram_send_message=deps.handle_telegram_send_message,
        build_heartbeat_run_callback=runtime_heartbeat_service.build_heartbeat_run_callback,
        build_heartbeat_notify_callback=runtime_heartbeat_service.build_heartbeat_notify_callback,
    )

    global _HEARTBEAT_SCHEDULER
    _HEARTBEAT_SCHEDULER = runtime_route_bootstrap_service.ensure_runtime_run_route_bootstrap(
        heartbeat_lock=_HEARTBEAT_SCHEDULER_LOCK,
        heartbeat_scheduler=_HEARTBEAT_SCHEDULER,
        heartbeat_scheduler_factory=lambda: HeartbeatScheduler(
            interval_seconds=30 * 60,
            workspace_id="default",
            run_callback=bootstrap_callbacks.heartbeat_run_callback,
            notify_callback=bootstrap_callbacks.heartbeat_notify_callback,
        ),
        ensure_heartbeat_scheduler_started=runtime_heartbeat_service.ensure_heartbeat_scheduler_started,
        load_webhook_triggers=_load_webhook_triggers,
    )
    route_bindings = runtime_route_binding_service.build_runtime_route_bindings(
        late_server_export=_late_server_export,
        enforce_run_owner_access=_enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=_stamp_request_owner,
        run_execution_services=_run_execution_services,
        can_view_sensitive_run_payload=_can_view_sensitive_run_payload,
        limited_run_context_view=_limited_run_context_view,
        limited_result_data_view_fn=_limited_result_data_view,
        get_pending_confirmation_fn=_get_pending_confirmation,
        build_archived_run_detail_response=runtime_run_detail_service.build_archived_run_detail_response,
        build_live_run_detail_response=runtime_run_detail_service.build_live_run_detail_response,
        refresh_server_exports=_refresh_server_exports,
        run_history_lock=RUN_HISTORY_LOCK,
        run_history=RUN_HISTORY,
        history_item_matches=_history_item_matches,
        current_user_is_privileged=_current_user_is_privileged,
        extract_run_owner_user_id=_extract_run_owner_user_id,
        summarize_history_item=_summarize_history_item,
        parse_utc_ts=_parse_utc_ts,
        build_retry_child_payload=_build_retry_child_payload,
        approval_correlation_id=_approval_correlation_id,
        append_approval_audit=_append_approval_audit,
        resolve_local_execution_start_approval=_resolve_local_execution_start_approval,
        set_pending_confirmation=_set_pending_confirmation,
        utc_now=_utc_now,
        utc_now_iso=_utc_now_iso,
        run_thread_is_alive=_run_thread_is_alive,
        emit_log=emit_log,
        schedule_restored_run_resume=_schedule_restored_run_resume,
    )

    runtime_route_registry_service.register_runtime_run_routes(
        app,
        depends=Depends,
        request_class=Request,
        event_source_response_class=EventSourceResponse,
        require_api_key=require_api_key,
        require_admin_api_key=require_admin_api_key,
        refresh_server_exports=_refresh_server_exports,
        heartbeat_scheduler=_heartbeat_scheduler,
        load_webhook_triggers=_load_webhook_triggers,
        persist_webhook_triggers_locked=_persist_webhook_triggers_locked,
        match_webhook_trigger_fn=_match_webhook_trigger,
        webhook_triggers=_WEBHOOK_TRIGGERS,
        webhook_trigger_lock=_WEBHOOK_TRIGGER_LOCK,
        run_start_request_class=deps.run_start_request_class,
        run_delegation_request_class=RunDelegationRequest,
        run_auto_delegation_request_class=RunAutoDelegationRequest,
        run_delegation_retry_request_class=RunDelegationRetryRequest,
        decision_payload_class=DecisionPayload,
        approval_resolve_payload_class=ApprovalResolvePayload,
        workspace_memory_snapshot=deps.workspace_memory_snapshot,
        delete_memory=deps.delete_memory,
        read_workspace_context_files=deps.read_workspace_context_files,
        write_workspace_context_file=deps.write_workspace_context_file,
        single_agent_mode=ORION_SINGLE_AGENT_MODE,
        runs=runs,
        serialize_run_snapshot=route_bindings.serialize_run_snapshot,
        iter_logs_for_run=iter_logs_for_run,
        get_replay_payload=_get_replay_payload,
        direct_chat_stream_response_services=_direct_chat_stream_response_services,
        execute_run_start_request_via_turn_runtime=execute_run_start_request_via_turn_runtime,
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=_stamp_request_owner,
        run_execution_services=_run_execution_services,
        build_run_routing_preview=build_run_routing_preview,
        build_run_precheck_result=build_run_precheck_result,
        run_routing_preview_services=_run_routing_preview_services,
        delegate_run_children_callbacks=route_bindings.delegate_run_children_callbacks,
        auto_delegate_run_children_callbacks=route_bindings.auto_delegate_run_children_callbacks,
        retry_failed_delegation_callbacks=route_bindings.retry_failed_delegation_callbacks,
        run_detail_callbacks=route_bindings.run_detail_callbacks,
        runs_history_callbacks=route_bindings.runs_history_callbacks,
        usage_snapshots_for_user_fn=_usage_snapshots_for_user,
        aggregate_usage_summary_fn=aggregate_usage_summary,
        list_usage_runs_fn=list_usage_runs,
        submit_run_decision_callbacks=route_bindings.submit_run_decision_callbacks,
        resolve_run_approval_callbacks=route_bindings.resolve_run_approval_callbacks,
        resume_waiting_run_callbacks=route_bindings.resume_waiting_run_callbacks,
        enforce_run_owner_access=_enforce_run_owner_access,
    )
