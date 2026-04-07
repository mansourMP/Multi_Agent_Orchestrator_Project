from __future__ import annotations

from dataclasses import dataclass
import queue
from typing import Any, Callable

from server_modules import runtime_history_service
from server_modules import runtime_run_control_service
from server_modules import runtime_run_approval_service
from server_modules import runtime_run_delegation_service
from server_modules import runtime_run_query_service
from server_modules.run_execution_handle import attach_execution_handle


@dataclass(frozen=True)
class RuntimeRouteBindings:
    serialize_run_snapshot: Callable[[str, dict[str, Any]], dict[str, Any]]
    delegate_run_children_callbacks: dict[str, Any]
    auto_delegate_run_children_callbacks: dict[str, Any]
    retry_failed_delegation_callbacks: dict[str, Any]
    run_detail_callbacks: dict[str, Any]
    runs_history_callbacks: dict[str, Any]
    submit_run_decision_callbacks: dict[str, Any]
    resolve_run_approval_callbacks: dict[str, Any]
    resume_waiting_run_callbacks: dict[str, Any]


def build_runtime_route_bindings(
    *,
    late_server_export: Callable[[str], Any],
    enforce_run_owner_access: Callable[[Any, Any], None],
    normalize_agent_role: Callable[[Any], str],
    execute_system_run_start_request_via_turn_runtime: Callable[..., dict[str, Any]],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
    can_view_sensitive_run_payload: Callable[[Any], bool],
    limited_run_context_view: Callable[[Any], Any],
    limited_result_data_view_fn: Callable[[Any], Any],
    get_pending_confirmation_fn: Callable[[dict[str, Any]], Any],
    build_archived_run_detail_response: Callable[..., dict[str, Any]],
    build_live_run_detail_response: Callable[..., dict[str, Any]],
    refresh_server_exports: Callable[[], Any],
    run_history_lock: Any,
    run_history: list[dict[str, Any]],
    history_item_matches: Callable[..., bool],
    current_user_is_privileged: Callable[[Any], bool],
    extract_run_owner_user_id: Callable[[dict[str, Any]], str | None],
    summarize_history_item: Callable[..., dict[str, Any]],
    parse_utc_ts: Callable[[Any], Any],
    build_retry_child_payload: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    approval_correlation_id: Callable[..., str],
    append_approval_audit: Callable[..., None],
    resolve_local_execution_start_approval: Callable[..., dict[str, Any]],
    set_pending_confirmation: Callable[[dict[str, Any], dict[str, Any]], None],
    utc_now: Callable[[], Any],
    utc_now_iso: Callable[[], str],
    run_thread_is_alive: Callable[[dict[str, Any]], bool],
    emit_log: Callable[..., None],
    schedule_restored_run_resume: Callable[[str, dict[str, Any]], bool],
) -> RuntimeRouteBindings:
    serialize_run_snapshot = late_server_export("_serialize_run_snapshot")
    def _ensure_live_run_handle(run_id: str, run_record: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(run_record, dict):
            return None
        try:
            runs_by_id = late_server_export("runs")
            run_queue_index = late_server_export("RUN_QUEUE_INDEX")
            persist_live_run_state = late_server_export("_persist_live_run_state")
        except Exception:
            return None
        existing = runs_by_id.get(run_id) if isinstance(runs_by_id, dict) else None
        if isinstance(existing, dict):
            return existing
        restored = attach_execution_handle(
            dict(run_record),
            log_queue=queue.Queue(),
            input_queue=queue.Queue(),
            started_mono=None,
            finished_mono=None,
            first_value_mono=None,
            hitl_wait_start_mono=None,
            thread_id=None,
            event_seq=int(run_record.get("_event_seq") or 0),
        )
        if isinstance(runs_by_id, dict):
            runs_by_id[run_id] = restored
        log_queue = restored.get("logs")
        if log_queue is not None and isinstance(run_queue_index, dict):
            run_queue_index[id(log_queue)] = run_id
        try:
            persist_live_run_state(run_id, restored)
        except Exception:
            pass
        return restored

    delegate_run_children_callbacks = runtime_run_delegation_service.build_delegate_run_children_callbacks(
        lookup_run_snapshot=late_server_export("_lookup_run_snapshot"),
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        build_delegated_run_request=late_server_export("_build_delegated_run_request"),
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
        normalize_run_id_token=late_server_export("_normalize_run_id_token"),
        refresh_parent_delegation_state=late_server_export("_refresh_parent_delegation_state"),
    )
    auto_delegate_run_children_callbacks = runtime_run_delegation_service.build_auto_delegate_run_children_callbacks(
        lookup_run_snapshot=late_server_export("_lookup_run_snapshot"),
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        build_auto_delegation_plan=late_server_export("_build_auto_delegation_plan"),
        emit_auto_delegation_routing_log=late_server_export("_emit_auto_delegation_routing_log"),
        build_delegated_run_request=late_server_export("_build_delegated_run_request"),
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
        normalize_run_id_token=late_server_export("_normalize_run_id_token"),
        refresh_parent_delegation_state=late_server_export("_refresh_parent_delegation_state"),
    )
    retry_failed_delegation_callbacks = runtime_run_delegation_service.build_retry_failed_delegation_callbacks(
        lookup_run_snapshot=late_server_export("_lookup_run_snapshot"),
        enforce_run_owner_access=enforce_run_owner_access,
        normalize_agent_role=normalize_agent_role,
        find_run_relationships=late_server_export("_find_run_relationships"),
        normalize_run_id_token=late_server_export("_normalize_run_id_token"),
        parse_utc_ts=parse_utc_ts,
        build_retry_child_payload=build_retry_child_payload,
        build_delegated_run_request=late_server_export("_build_delegated_run_request"),
        execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
        stamp_request_owner_fn=stamp_request_owner_fn,
        run_execution_services=run_execution_services,
        refresh_parent_delegation_state=late_server_export("_refresh_parent_delegation_state"),
    )
    run_detail_callbacks = runtime_run_query_service.build_default_run_detail_response_callbacks(
        import_module=__import__,
        enforce_run_owner_access=enforce_run_owner_access,
        can_view_sensitive_run_payload=can_view_sensitive_run_payload,
        limited_run_context_view=limited_run_context_view,
        limited_result_data_view_fn=limited_result_data_view_fn,
        get_pending_confirmation_fn=get_pending_confirmation_fn,
        build_archived_run_detail_response=build_archived_run_detail_response,
        build_live_run_detail_response=build_live_run_detail_response,
    )
    runs_history_callbacks = runtime_history_service.build_runs_history_callbacks(
        refresh_server_exports=refresh_server_exports,
        run_history_lock=run_history_lock,
        run_history=run_history,
        history_item_matches=history_item_matches,
        current_user_is_privileged=current_user_is_privileged,
        extract_run_owner_user_id=extract_run_owner_user_id,
        normalize_run_id_token=late_server_export("_normalize_run_id_token"),
        summarize_history_item=summarize_history_item,
    )
    submit_run_decision_callbacks = runtime_run_approval_service.build_submit_run_decision_callbacks(
        serialize_run_snapshot=serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        get_pending_confirmation=get_pending_confirmation_fn,
        approval_correlation_id=approval_correlation_id,
        append_approval_audit=append_approval_audit,
        resolve_local_execution_start_approval=resolve_local_execution_start_approval,
    )
    resolve_run_approval_callbacks = runtime_run_approval_service.build_resolve_run_approval_callbacks(
        serialize_run_snapshot=serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        get_pending_confirmation=get_pending_confirmation_fn,
        set_pending_confirmation=set_pending_confirmation,
        clear_pending_confirmation=late_server_export("_clear_pending_confirmation"),
        parse_utc_ts=parse_utc_ts,
        utc_now=utc_now,
        utc_now_iso=utc_now_iso,
        approval_correlation_id=approval_correlation_id,
        append_approval_audit=append_approval_audit,
        resolve_local_execution_start_approval=resolve_local_execution_start_approval,
        resolve_local_worker_recovery_approval=runtime_run_control_service.resolve_local_worker_recovery_approval,
        run_thread_is_alive=run_thread_is_alive,
        emit_log=emit_log,
        schedule_restored_run_resume=schedule_restored_run_resume,
        ensure_live_run_handle=_ensure_live_run_handle,
    )
    resume_waiting_run_callbacks = runtime_run_control_service.build_resume_waiting_run_callbacks(
        serialize_run_snapshot=serialize_run_snapshot,
        enforce_run_owner_access=enforce_run_owner_access,
        get_pending_confirmation=get_pending_confirmation_fn,
        begin_run_pending_confirmation=late_server_export("_begin_run_pending_confirmation"),
        emit_log=emit_log,
        schedule_restored_run_resume=schedule_restored_run_resume,
    )

    return RuntimeRouteBindings(
        serialize_run_snapshot=serialize_run_snapshot,
        delegate_run_children_callbacks=delegate_run_children_callbacks,
        auto_delegate_run_children_callbacks=auto_delegate_run_children_callbacks,
        retry_failed_delegation_callbacks=retry_failed_delegation_callbacks,
        run_detail_callbacks=run_detail_callbacks,
        runs_history_callbacks=runs_history_callbacks,
        submit_run_decision_callbacks=submit_run_decision_callbacks,
        resolve_run_approval_callbacks=resolve_run_approval_callbacks,
        resume_waiting_run_callbacks=resume_waiting_run_callbacks,
    )
