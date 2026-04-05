from __future__ import annotations

import json
import sentry_sdk
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi.responses import JSONResponse, StreamingResponse

from server_modules.agent_turn import (
    AgentTurnRequest,
    bind_agent_turn_metadata,
    build_direct_chat_turn_request,
    resolve_direct_chat_turn_request,
)
from server_modules.direct_chat_service import (
    build_direct_chat_execution_services,
    build_direct_chat_event_producer as _service_build_direct_chat_event_producer,
    build_direct_chat_request_meta as _service_build_direct_chat_request_meta,
    direct_chat_actor_key as _service_direct_chat_actor_key,
    direct_chat_request_signature as _service_direct_chat_request_signature,
    direct_chat_session_manager_enabled as _service_direct_chat_session_manager_enabled,
    direct_chat_stream_key as _service_direct_chat_stream_key,
)
from server_modules.direct_chat_stream_response_service import (
    DirectChatStreamResponseServices,
    build_direct_chat_stream_response,
)
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
    TurnExecutionServices,
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
from server_modules import runtime_run_access_service
from server_modules import runtime_run_approval_service
from server_modules import runtime_run_control_service
from server_modules import runtime_run_detail_service
from server_modules import runtime_run_replay_service
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


def _heartbeat_scheduler() -> Optional[HeartbeatScheduler]:
    return runtime_heartbeat_service.heartbeat_scheduler(
        lock=_HEARTBEAT_SCHEDULER_LOCK,
        scheduler=_HEARTBEAT_SCHEDULER,
    )


def _run_creation_services() -> RunCreationServices:
    return build_run_creation_services(
        create_run_from_request=_late_server_export("_create_run_from_request"),
    )


def _run_execution_services() -> RunExecutionServices:
    return build_run_execution_services(
        stamp_request_owner=_stamp_request_owner,
        prepare_run_start_request=_late_server_export("_prepare_run_start_request"),
        create_run_from_request=_late_server_export("_create_run_from_request"),
    )


def _run_routing_preview_services() -> RunRoutingPreviewServices:
    return build_run_routing_preview_services(
        prepare_run_start_request=_late_server_export("_prepare_run_start_request"),
        compute_tool_policy_precheck=_late_server_export("_compute_tool_policy_precheck"),
    )


def _create_run_result(request: RunStartRequest, *, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    return create_run_result_from_request(
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


def _configured_direct_chat_worker_count() -> int:
    return chat_stream_runtime_service.configured_direct_chat_worker_count()


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


_default_chat_stream_session = lambda key, *, thread_id, request_id, workspace_id: chat_stream_state_service.default_chat_stream_session(
    key,
    thread_id=thread_id,
    request_id=request_id,
    workspace_id=workspace_id,
    now_ts=time.time(),
    now_iso=_chat_stream_now_iso,
)


_persist_chat_stream_session_state = lambda session: chat_stream_state_service.persist_chat_stream_session_state(
    session,
    db_path=_chat_stream_state_db_path(),
    now_iso=_chat_stream_now_iso,
    upsert_state=upsert_chat_stream_state,
)


_chat_stream_interrupted_final_payload = chat_stream_state_service.chat_stream_interrupted_final_payload
_chat_stream_replay_payload_from_state = chat_stream_state_service.chat_stream_replay_payload_from_state


def _build_chat_stream_replay_session(
    key: str,
    *,
    thread_id: str,
    request_id: str,
    workspace_id: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    return chat_stream_state_service.build_chat_stream_replay_session(
        key,
        thread_id=thread_id,
        request_id=request_id,
        workspace_id=workspace_id,
        state=state,
        default_session_factory=_default_chat_stream_session,
        replay_payload_from_state=_chat_stream_replay_payload_from_state,
        now_iso=_chat_stream_now_iso,
    )


def _load_replayable_chat_stream_session(
    key: str,
    *,
    thread_id: str,
    request_id: str,
    workspace_id: str,
) -> Optional[dict[str, Any]]:
    return chat_stream_state_service.load_replayable_chat_stream_session(
        key,
        thread_id=thread_id,
        request_id=request_id,
        workspace_id=workspace_id,
        db_path=_chat_stream_state_db_path(),
        get_state=get_chat_stream_state,
        upsert_state=upsert_chat_stream_state,
        metrics_inc=_chat_stream_metrics_inc,
        now_iso=_chat_stream_now_iso,
        interrupted_final_payload=_chat_stream_interrupted_final_payload,
        build_replay_session=_build_chat_stream_replay_session,
    )


_chat_stream_request_signature = _service_direct_chat_request_signature
_chat_stream_key = _service_direct_chat_stream_key
_direct_chat_actor_key = _service_direct_chat_actor_key
_direct_chat_session_manager_enabled = lambda: _service_direct_chat_session_manager_enabled(
    globals().get("ORION_DIRECT_CHAT_SESSION_MANAGER")
)


def _direct_chat_session_manager():
    from server_modules.session_manager.manager import get_default_session_manager

    return chat_stream_runtime_service.build_direct_chat_session_manager(
        get_default_session_manager=get_default_session_manager,
        db_path=_chat_stream_state_db_path(),
    )


def _direct_chat_execution_services():
    from server_modules.operator_chat import build_chat_turn_event_stream, build_direct_operator_reply

    return chat_stream_runtime_service.build_direct_chat_execution_services(
        builder=build_direct_chat_execution_services,
        chat_stream_key=_chat_stream_key,
        session_manager_enabled=_direct_chat_session_manager_enabled,
        session_manager_factory=_direct_chat_session_manager,
        build_direct_operator_reply=build_direct_operator_reply,
        build_chat_turn_event_stream=build_chat_turn_event_stream,
    )


def _direct_chat_stream_response_services() -> DirectChatStreamResponseServices:
    return DirectChatStreamResponseServices(
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


def _prune_chat_stream_sessions_locked(now_ts: Optional[float] = None) -> None:
    return chat_stream_state_service.prune_chat_stream_sessions_locked(
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


def _chat_stream_payload(raw_event: dict[str, Any]) -> tuple[Optional[str], Optional[dict[str, Any]]]:
    return chat_stream_transport_service.chat_stream_payload(raw_event)


def _append_chat_stream_event(session: dict[str, Any], event_name: str, payload: dict[str, Any]) -> None:
    return chat_stream_runtime_service.append_chat_stream_event(
        session,
        event_name=event_name,
        payload=payload,
        buffer_limit=_CHAT_STREAM_BUFFER_LIMIT,
        persist_session_state=_persist_chat_stream_session_state,
    )


def _complete_chat_stream_session(session: dict[str, Any]) -> None:
    return chat_stream_runtime_service.complete_chat_stream_session(
        session,
        persist_session_state=_persist_chat_stream_session_state,
    )


def _chat_stream_error_payload(message: str) -> dict[str, Any]:
    return chat_stream_transport_service.chat_stream_error_payload(message)


def _extract_direct_chat_error_response(raw_event: Any) -> Optional[dict[str, str]]:
    return chat_stream_transport_service.extract_direct_chat_error_response(raw_event)


def _start_chat_stream_producer(session: dict[str, Any], producer_fn) -> None:
    return chat_stream_transport_service.start_chat_stream_producer(
        session,
        producer_fn=producer_fn,
        append_event=_append_chat_stream_event,
        complete_session=_complete_chat_stream_session,
        capture_exception=sentry_sdk.capture_exception,
    )


def _iter_chat_stream_events(session: dict[str, Any], last_event_id: Any):
    yield from chat_stream_transport_service.iter_chat_stream_events(
        session,
        last_event_id=last_event_id,
        normalize_cursor=_normalize_chat_stream_cursor,
    )


_can_view_sensitive_run_payload = runtime_run_detail_service.can_view_sensitive_run_payload


_limited_run_context_view = runtime_run_detail_service.limited_run_context_view


_limited_result_data_view = runtime_run_detail_service.limited_result_data_view


def _extract_run_owner_user_id(payload: Any) -> str:
    return runtime_run_access_service.extract_run_owner_user_id(payload)


def _current_user_is_privileged(current_user: Any) -> bool:
    return runtime_run_access_service.current_user_is_privileged(
        current_user,
        admin_user_ids=set(globals().get("ORION_ADMIN_USER_IDS") or []),
        admin_emails=set(globals().get("ORION_ADMIN_EMAILS") or []),
    )


def _enforce_run_owner_access(current_user: Any, payload: Any) -> None:
    return runtime_run_access_service.enforce_run_owner_access(
        current_user,
        payload,
        current_user_is_privileged_fn=_current_user_is_privileged,
        extract_run_owner_user_id_fn=_extract_run_owner_user_id,
    )


def _stamp_request_owner(req: Any, current_user: Any) -> Any:
    return runtime_run_access_service.stamp_request_owner(req, current_user)


def _resolve_local_execution_start_approval(
    run_id_str: str,
    run: dict,
    approval_id: str,
    decision_text: str,
    note: str = "",
) -> dict:
    scope_value = "once"
    consequence = "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again."
    pending = _get_pending_confirmation(run)
    correlation_id = str(pending.get("correlation_id") or "").strip() or _approval_correlation_id(approval_id, run_id=run_id_str)
    expires_at = _parse_utc_ts(pending.get("expires_at"))
    if expires_at is not None and _utc_now() > expires_at:
        pending["status"] = "expired"
        pending["expired_at"] = _utc_now_iso()
        _set_pending_confirmation(run, pending)
        raise HTTPException(status_code=409, detail="Confirmation request has already expired.")

    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    approved = decision_text in approve_tokens
    escalated = decision_text in escalate_tokens
    rejected = decision_text in reject_tokens or (not approved and not escalated)

    pending["status"] = "resolved"
    pending["resolved_at"] = _utc_now_iso()
    pending["decision"] = decision_text
    _set_pending_confirmation(run, pending)
    emit_log(
        run["logs"],
        "info" if approved else "warn",
        f"Decision received: {decision_text}",
        event="approval_received",
        data={"approval_id": approval_id, "correlation_id": correlation_id, "decision": decision_text, "scope": scope_value, "reusable": False},
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="received",
        decision=decision_text,
        actor="user",
        source="local_execution_start",
        run_id=run_id_str,
        note=note,
        correlation_id=correlation_id,
        metadata={"scope": scope_value, "reusable": False},
    )

    if approved:
        context = run.get("context")
        metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
        precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else {}
        browser_policy = precheck.get("browser_automation_policy") if isinstance(precheck.get("browser_automation_policy"), dict) else {}
        expected_plan_hash = (
            str(metadata.get("browser_immutable_plan_hash") or "").strip()
            or str(browser_policy.get("immutable_plan_hash") or "").strip()
        )
        current_plan_hash = browser_automation_plan_hash_from_pack_inputs(metadata.get("pack_inputs")) if isinstance(metadata, dict) else ""
        if expected_plan_hash and current_plan_hash and expected_plan_hash != current_plan_hash:
            _clear_pending_confirmation(run)
            run["result"] = "Local browser execution plan changed after approval."
            run["result_data"] = {
                "summary": "Local browser execution plan changed after approval.",
                "error": "browser_plan_hash_mismatch",
                "expected_plan_hash": expected_plan_hash,
                "current_plan_hash": current_plan_hash,
            }
            emit_log(
                run["logs"],
                "error",
                "Approved browser plan changed before execution. Run failed.",
                event="approval_plan_hash_mismatch",
                data={
                    "approval_id": approval_id,
                    "correlation_id": correlation_id,
                    "expected_plan_hash": expected_plan_hash,
                    "current_plan_hash": current_plan_hash,
                },
            )
            set_run_status(run_id_str, "failed")
            run["logs"].put(None)
            raise HTTPException(status_code=409, detail="Approved browser execution plan changed before execution.")
        _clear_pending_confirmation(run)
        if isinstance(context, dict):
            if isinstance(metadata, dict):
                metadata.pop("local_execution_waiting_confirmation", None)
                metadata.pop("local_execution_waiting_approval", None)
                _mark_local_execution_tools_approved(metadata)
                if expected_plan_hash or current_plan_hash:
                    metadata["browser_immutable_plan_hash"] = current_plan_hash or expected_plan_hash
                    try:
                        metadata["browser_execution_binding"] = build_browser_execution_binding(
                            _late_server_export("ROOT_DIR"),
                            current_plan_hash or expected_plan_hash,
                            str(metadata.get("browser_session_profile") or "").strip(),
                        )
                    except Exception:
                        metadata.pop("browser_execution_binding", None)
                if bool(browser_policy.get("reviewed_approval_required")):
                    metadata["browser_reviewed_approved"] = True
                    metadata["browser_reviewed_approved_at"] = _utc_now_iso()
                context["metadata"] = metadata
        emit_log(
            run["logs"],
            "info",
            "Confirmation received. Run queued for Local Companion execution.",
            event="approval_resolved",
            data={"approval_id": approval_id, "correlation_id": correlation_id, "decision": decision_text, "approved": True, "scope": scope_value, "reusable": False},
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="resolved",
            decision="approved",
            actor="runtime",
            source="local_execution_start",
            run_id=run_id_str,
            correlation_id=correlation_id,
            metadata={"scope": scope_value, "reusable": False},
        )
        _enqueue_local_companion_run(
            run_id_str,
            message="Confirmation received. Run queued for Local Companion execution.",
            event="local_queued_after_approval",
        )
        return {
            "status": "ok",
            "run_id": run_id_str,
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision_kind": "approved",
            "scope": scope_value,
            "reusable": False,
            "consequence": consequence,
        }

    _clear_pending_confirmation(run)
    context = run.get("context")
    if isinstance(context, dict):
        metadata = context.get("metadata")
        if isinstance(metadata, dict):
            metadata.pop("local_execution_waiting_confirmation", None)
            metadata.pop("local_execution_waiting_approval", None)
            context["metadata"] = metadata
    emit_log(
        run["logs"],
        "warn",
        "Local companion execution was not started because confirmation was not granted.",
        event="approval_resolved",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision": decision_text,
            "approved": False,
            "rejected": bool(rejected),
            "escalated": bool(escalated),
            "scope": scope_value,
            "reusable": False,
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="resolved",
        decision=("escalated" if escalated else "rejected"),
        actor="runtime",
        source="local_execution_start",
        run_id=run_id_str,
        correlation_id=correlation_id,
        metadata={
            "raw_decision": decision_text,
            "approved": False,
            "rejected": bool(rejected),
            "escalated": bool(escalated),
            "scope": scope_value,
            "reusable": False,
        },
    )
    run["result"] = "Local companion execution was not started because confirmation was not granted."
    set_run_status(run_id_str, "failed")
    run["logs"].put(None)
    return {
        "status": "ok",
        "run_id": run_id_str,
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "decision_kind": ("escalated" if escalated else "rejected"),
        "scope": scope_value,
        "reusable": False,
        "consequence": consequence,
    }


def _run_thread_is_alive(run: dict) -> bool:
    return runtime_run_resume_service.run_thread_is_alive(
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

    def _start_heartbeat_run(tasks: List[str], metadata: Dict[str, Any]) -> Dict[str, Any]:
        from server_modules import runs_core as _runs_core

        pending_schedule_result = _runs_core.trigger_pending_heartbeat_schedules()
        pending_started = pending_schedule_result.get("started") if isinstance(pending_schedule_result, dict) else []
        if not tasks:
            if pending_started:
                first = pending_started[0] if isinstance(pending_started, list) and pending_started else {}
                return {
                    "acted": True,
                    "run_id": str((first or {}).get("run_id") or "").strip() or None,
                    "summary": f"Heartbeat started {len(pending_started)} pending schedule(s).",
                }
            return {
                "acted": False,
                "summary": "No pending heartbeat tasks.",
            }
        heartbeat_goal = (
            "Heartbeat checklist tasks:\n"
            + "\n".join(f"- {task}" for task in tasks)
            + "\n\nHandle the pending items from HEARTBEAT.md."
        )
        request = RunStartRequest(
            engine="orion",
            workspace_id=str(metadata.get("workspace_id") or "default").strip() or "default",
            user_goal=heartbeat_goal,
            agent_role="orchestrator",
            metadata={
                "source": "heartbeat",
                "heartbeat_tasks": list(tasks),
                "heartbeat_pending_schedules": pending_started if isinstance(pending_started, list) else [],
                "heartbeat_trigger": str(metadata.get("trigger") or "scheduled"),
                "heartbeat_file": str(metadata.get("heartbeat_file") or ""),
            },
        )
        result = execute_system_run_start_request_via_turn_runtime(
            request,
            stamp_request_owner_fn=_stamp_request_owner,
            services=_run_execution_services(),
        )
        return {
            "acted": True,
            **(result if isinstance(result, dict) else {}),
            "summary": (
                f"Heartbeat started a run for {len(tasks)} task(s)."
                + (f" Also started {len(pending_started)} pending schedule(s)." if pending_started else "")
            ),
        }

    def _heartbeat_notify(message: str) -> None:
        try:
            import asyncio

            asyncio.run(handle_telegram_send_message(message, workspace_id="default"))
        except Exception:
            return

    global _HEARTBEAT_SCHEDULER
    _HEARTBEAT_SCHEDULER = runtime_heartbeat_service.ensure_heartbeat_scheduler_started(
        lock=_HEARTBEAT_SCHEDULER_LOCK,
        scheduler=_HEARTBEAT_SCHEDULER,
        scheduler_factory=lambda: HeartbeatScheduler(
            interval_seconds=30 * 60,
            workspace_id="default",
            run_callback=_start_heartbeat_run,
            notify_callback=_heartbeat_notify,
        ),
    )
    _load_webhook_triggers()

    @app.post("/runs/start", dependencies=[Depends(require_api_key)])
    async def start_run(body: Optional[RunStartRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        request_payload = body or RunStartRequest()
        result = await execute_run_start_request_via_turn_runtime(
            request_payload,
            current_user=current_user,
            stamp_request_owner_fn=_stamp_request_owner,
            services=_run_execution_services(),
        )
        return result

    @app.post("/chat/respond", dependencies=[Depends(require_api_key)])
    async def respond_chat(request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if not isinstance(current_user, dict):
            raise HTTPException(status_code=401, detail="Authentication required.")
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid chat payload: {exc}") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Invalid chat payload.")
        return await build_direct_chat_stream_response(
            current_user=current_user,
            body=body,
            last_event_id=request.headers.get("last-event-id") or body.get("last_event_id"),
            services=_direct_chat_stream_response_services(),
        )

    @app.get("/memory/{workspace_id}", dependencies=[Depends(require_api_key)])
    async def list_workspace_memory(workspace_id: str, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        normalized_workspace_id = str(workspace_id or "default").strip() or "default"
        return workspace_memory_snapshot(normalized_workspace_id).as_payload()

    @app.delete("/memory/{workspace_id}/{key}", dependencies=[Depends(require_api_key)])
    async def delete_workspace_memory(workspace_id: str, key: str, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        normalized_workspace_id = str(workspace_id or "default").strip() or "default"
        normalized_key = str(key or "").strip()
        if not normalized_key:
            raise HTTPException(status_code=400, detail="Memory key is required.")
        deleted = delete_memory(normalized_workspace_id, normalized_key)
        if not deleted:
            raise HTTPException(status_code=404, detail="Memory entry not found.")
        return {
            "ok": True,
            "workspace_id": normalized_workspace_id,
            "key": normalized_key,
        }

    @app.get("/workspace/context-files", dependencies=[Depends(require_api_key)])
    async def get_workspace_context_files(current_user=Depends(require_api_key)):
        _refresh_server_exports()
        files = read_workspace_context_files()
        return {
            "ok": True,
            "files": [
                {
                    "filename": filename,
                    "content": str(content or ""),
                }
                for filename, content in files.items()
            ],
        }

    @app.post("/workspace/context-files/{filename}", dependencies=[Depends(require_api_key)])
    async def update_workspace_context_file(filename: str, request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid context file payload: {exc}") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Invalid context file payload.")
        content = body.get("content")
        if content is None:
            raise HTTPException(status_code=400, detail="Field 'content' is required.")
        try:
            saved = write_workspace_context_file(filename, str(content))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            **saved,
        }

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
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid webhook trigger payload: {exc}") from exc
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="Invalid webhook trigger payload.")
        workspace_id = str(body.get("workspace_id") or "default").strip() or "default"
        url_pattern = str(body.get("url_pattern") or "").strip()
        workflow_id = str(body.get("workflow_id") or "").strip()
        if not url_pattern:
            raise HTTPException(status_code=400, detail="url_pattern is required.")
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id is required.")
        trigger_id = str(uuid.uuid4())
        trigger = runtime_webhook_trigger_service.build_webhook_trigger(
            trigger_id=trigger_id,
            workspace_id=workspace_id,
            url_pattern=url_pattern,
            workflow_id=workflow_id,
            user_goal=body.get("user_goal"),
            metadata=body.get("metadata"),
            enabled=body.get("enabled", True),
        )
        with _WEBHOOK_TRIGGER_LOCK:
            _WEBHOOK_TRIGGERS[trigger_id] = trigger
            _persist_webhook_triggers_locked()
        return {"ok": True, **trigger}

    @app.post("/webhooks/ingest/{workspace_id}", dependencies=[Depends(require_api_key)])
    async def ingest_webhook(workspace_id: str, request: Request, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        normalized_workspace_id = str(workspace_id or "default").strip() or "default"
        try:
            payload = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid webhook payload: {exc}") from exc
        matched_trigger = _match_webhook_trigger(normalized_workspace_id, str(request.url))
        if not isinstance(matched_trigger, dict):
            raise HTTPException(status_code=404, detail="No webhook trigger matched this request.")
        workflow_id = str(matched_trigger.get("workflow_id") or "").strip()
        user_goal = str(matched_trigger.get("user_goal") or "").strip() or f"Handle webhook event for workflow '{workflow_id}'."
        request_payload = RunStartRequest(
            engine="orion",
            workflow_id=workflow_id or None,
            workspace_id=normalized_workspace_id,
            user_goal=user_goal,
            metadata={
                "source": "webhook",
                "webhook_trigger_id": str(matched_trigger.get("id") or "").strip() or None,
                "webhook_url_pattern": str(matched_trigger.get("url_pattern") or "").strip(),
                "webhook_request_url": str(request.url),
                "webhook_payload": payload,
                **(matched_trigger.get("metadata") if isinstance(matched_trigger.get("metadata"), dict) else {}),
            },
        )
        result = await execute_run_start_request_via_turn_runtime(
            request_payload,
            current_user=current_user,
            stamp_request_owner_fn=_stamp_request_owner,
            services=_run_execution_services(),
        )
        return {
            "ok": True,
            "run_id": str((result or {}).get("run_id") or "").strip() or None,
            "trigger_id": str(matched_trigger.get("id") or "").strip() or None,
        }

    @app.post("/runs/{run_id}/delegate", dependencies=[Depends(require_api_key)])
    async def delegate_run(run_id: uuid.UUID, body: RunDelegationRequest, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        body.validate_fields()
        parent_run_id = str(run_id)
        parent_snapshot = _late_server_export("_lookup_run_snapshot")(parent_run_id)
        _enforce_run_owner_access(current_user, parent_snapshot)
        parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
        parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
        parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or (parent_metadata or {}).get("agent_role"))
        if parent_role != "orchestrator":
            raise HTTPException(status_code=400, detail="Delegation is only available from orchestrator-owned runs.")

        note = str(body.note or "").strip() or None
        created: List[Dict[str, Any]] = []
        for child in body.children:
            target_role = normalize_agent_role(child.agent_role)
            if not target_role or target_role == "orchestrator":
                raise HTTPException(status_code=400, detail="Delegated child runs must target a specialist agent role.")
            child_payload = {
                "agent_role": target_role,
                "user_goal": child.user_goal,
                "business_plan": child.business_plan,
                "metadata": child.metadata if isinstance(child.metadata, dict) else {},
            }
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child_payload, note=note)
            result = execute_system_run_start_request_via_turn_runtime(
                delegated_req,
                stamp_request_owner_fn=_stamp_request_owner,
                services=_run_execution_services(),
            )
            created.append(
                {
                    **result,
                    "parent_run_id": parent_run_id,
                    "delegation_root_run_id": _late_server_export("_normalize_run_id_token")(
                        parent_snapshot.get("delegation_root_run_id")
                        or (parent_metadata or {}).get("delegation_root_run_id")
                        or parent_run_id
                    )
                    or parent_run_id,
                    "delegated_by_role": parent_role,
                    "user_goal": child.user_goal,
                }
            )

        _late_server_export("_refresh_parent_delegation_state")(parent_run_id)

        return {
            "ok": True,
            "parent_run_id": parent_run_id,
            "count": len(created),
            "items": created,
        }

    @app.post("/runs/{run_id}/delegate/auto", dependencies=[Depends(require_api_key)])
    async def auto_delegate_run(run_id: uuid.UUID, body: Optional[RunAutoDelegationRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        req = body or RunAutoDelegationRequest()
        req.validate_fields()
        parent_run_id = str(run_id)
        parent_snapshot = _late_server_export("_lookup_run_snapshot")(parent_run_id)
        _enforce_run_owner_access(current_user, parent_snapshot)
        parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
        parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
        parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or (parent_metadata or {}).get("agent_role"))
        if parent_role != "orchestrator":
            raise HTTPException(status_code=400, detail="Auto-delegation is only available from orchestrator-owned runs.")

        plan = _late_server_export("_build_auto_delegation_plan")(parent_snapshot, max_children=int(req.max_children or 3))
        if not plan:
            raise HTTPException(status_code=400, detail="No specialist delegation rules matched this run.")
        routing_source = str((((plan[0].get("metadata") if isinstance(plan[0], dict) else {}) or {}).get("auto_delegation_source") or "keyword")).strip() if plan else "keyword"
        routing_reason = str((((plan[0].get("metadata") if isinstance(plan[0], dict) else {}) or {}).get("auto_delegation_reason") or "")).strip()
        emit_routing_log = _late_server_export("_emit_auto_delegation_routing_log")
        if callable(emit_routing_log):
            emit_routing_log(parent_run_id, plan, strategy=routing_source, reason=routing_reason)

        note = str(req.note or "").strip() or "Auto-planned by orchestrator rules."
        created: List[Dict[str, Any]] = []
        for child in plan:
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child, note=note)
            result = execute_system_run_start_request_via_turn_runtime(
                delegated_req,
                stamp_request_owner_fn=_stamp_request_owner,
                services=_run_execution_services(),
            )
            created.append(
                {
                    **result,
                    "parent_run_id": parent_run_id,
                    "delegation_root_run_id": _late_server_export("_normalize_run_id_token")(
                        parent_snapshot.get("delegation_root_run_id")
                        or (parent_metadata or {}).get("delegation_root_run_id")
                        or parent_run_id
                    )
                    or parent_run_id,
                    "delegated_by_role": parent_role,
                    "user_goal": child.get("user_goal"),
                    "auto_delegation_rule": (child.get("metadata") or {}).get("auto_delegation_rule"),
                }
            )

        _late_server_export("_refresh_parent_delegation_state")(parent_run_id)

        return {
            "ok": True,
            "parent_run_id": parent_run_id,
            "count": len(created),
            "note": note,
            "plan": plan,
            "items": created,
        }

    @app.post("/runs/{run_id}/delegate/retry-failed", dependencies=[Depends(require_api_key)])
    async def retry_failed_delegation_runs(run_id: uuid.UUID, body: Optional[RunDelegationRetryRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        if ORION_SINGLE_AGENT_MODE:
            raise HTTPException(status_code=400, detail="Single-agent mode is enabled. Delegation is disabled.")
        req = body or RunDelegationRetryRequest()
        req.validate_fields()
        parent_run_id = str(run_id)
        parent_snapshot = _late_server_export("_lookup_run_snapshot")(parent_run_id)
        _enforce_run_owner_access(current_user, parent_snapshot)
        parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
        parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
        parent_role = normalize_agent_role(parent_snapshot.get("agent_role") or (parent_metadata or {}).get("agent_role"))
        if parent_role != "orchestrator":
            raise HTTPException(status_code=400, detail="Retry delegation is only available from orchestrator-owned runs.")

        _, child_runs = _late_server_export("_find_run_relationships")(parent_run_id, parent_snapshot)
        if not child_runs:
            raise HTTPException(status_code=400, detail="This orchestrator run does not have delegated child runs.")

        latest_by_lineage: Dict[str, Dict[str, Any]] = {}
        for child in child_runs:
            lineage_key = (
                _late_server_export("_normalize_run_id_token")(child.get("retry_root_run_id"))
                or _late_server_export("_normalize_run_id_token")(child.get("retry_of_run_id"))
                or _late_server_export("_normalize_run_id_token")(child.get("run_id"))
                or str(child.get("run_id") or "")
            )
            previous = latest_by_lineage.get(lineage_key)
            child_sort_key = (
                _parse_utc_ts(child.get("updated_at")) or _parse_utc_ts(child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                str(child.get("run_id") or ""),
            )
            previous_sort_key = (
                _parse_utc_ts(previous.get("updated_at")) or _parse_utc_ts(previous.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                str(previous.get("run_id") or ""),
            ) if isinstance(previous, dict) else None
            if previous_sort_key is None or child_sort_key > previous_sort_key:
                latest_by_lineage[lineage_key] = child

        failed_effective_children = [
            child for child in latest_by_lineage.values()
            if str(child.get("status") or "").strip().lower() in {"failed", "error", "timeout", "cancelled", "stopped"}
        ]
        if req.failed_run_ids:
            allowed = set(req.failed_run_ids)
            failed_effective_children = [
                child for child in failed_effective_children if str(child.get("run_id") or "").strip() in allowed
            ]

        if not failed_effective_children:
            raise HTTPException(status_code=400, detail="No retryable failed child runs were found for this orchestrator run.")

        note = str(req.note or "").strip() or "Retry requested from orchestration summary."
        created: List[Dict[str, Any]] = []
        for child in failed_effective_children:
            child_payload = _build_retry_child_payload(parent_snapshot, child, note=note)
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child_payload, note=note)
            result = execute_system_run_start_request_via_turn_runtime(
                delegated_req,
                stamp_request_owner_fn=_stamp_request_owner,
                services=_run_execution_services(),
            )
            created.append(
                {
                    **result,
                    "parent_run_id": parent_run_id,
                    "retry_of_run_id": child_payload.get("metadata", {}).get("retry_of_run_id"),
                    "retry_root_run_id": child_payload.get("metadata", {}).get("retry_root_run_id"),
                    "retry_sequence": child_payload.get("metadata", {}).get("retry_sequence"),
                    "agent_role": child_payload.get("agent_role"),
                    "user_goal": child_payload.get("user_goal"),
                }
            )

        _late_server_export("_refresh_parent_delegation_state")(parent_run_id)

        return {
            "ok": True,
            "parent_run_id": parent_run_id,
            "count": len(created),
            "note": note,
            "items": created,
        }

    @app.post("/routing/preview", dependencies=[Depends(require_api_key)])
    async def preview_routing(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        req = body or RunStartRequest()
        preview = build_run_routing_preview(req, services=_run_routing_preview_services())
        return {
            "engine": preview["engine"],
            "agent_role": preview["metadata"].get("agent_role"),
            "agent_role_source": preview["metadata"].get("agent_role_source"),
            "route": preview["route"],
            "tool_policy_precheck": preview["tool_policy_precheck"],
        }

    @app.post("/runs/precheck", dependencies=[Depends(require_api_key)])
    async def precheck_run(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        req = body or RunStartRequest()
        preview = await build_run_precheck_result(req, services=_run_routing_preview_services())
        return {
            "ok": True,
            "engine": preview["engine"],
            "agent_role": preview["metadata"].get("agent_role"),
            "agent_role_source": preview["metadata"].get("agent_role_source"),
            "route": preview["route"],
            "tool_policy_precheck": preview["tool_policy_precheck"],
            "doctor_preflight": preview["doctor_preflight"],
        }

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
        run_id_str = str(run_id)
        include_sensitive = _can_view_sensitive_run_payload(current_user)
        run = runs.get(run_id_str)
        archived = False

        if run is None:
            try:
                snapshot = _get_replay_payload(run_id_str)
            except HTTPException:
                raise HTTPException(404, "Run ID not found")
            _enforce_run_owner_access(current_user, snapshot)

            context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
            metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
            parent_run, child_runs = _late_server_export("_find_run_relationships")(run_id_str, snapshot)
            delegation_summary = _late_server_export("_build_delegation_summary")(snapshot, child_runs)
            safe_context = redact_sensitive(context) if include_sensitive else _limited_run_context_view(context)
            return runtime_run_detail_service.build_archived_run_detail_response(
                run_id=run_id_str,
                snapshot=snapshot,
                metadata=metadata,
                include_sensitive=include_sensitive,
                safe_context=safe_context,
                parent_run=parent_run,
                child_runs=child_runs,
                delegation_summary=delegation_summary,
                connector_binding=_late_server_export("_resolve_run_connector_binding")(snapshot),
                limited_result_data_view_fn=_limited_result_data_view,
                limited_node_states_view_fn=_limited_node_states_view,
            )

        context = run.get("context", {})
        metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
        snapshot = _serialize_run_snapshot(run_id_str, run)
        _enforce_run_owner_access(current_user, snapshot)
        parent_run, child_runs = _late_server_export("_find_run_relationships")(run_id_str, snapshot)
        delegation_summary = _late_server_export("_build_delegation_summary")(snapshot, child_runs)
        safe_context = redact_sensitive(context) if include_sensitive else _limited_run_context_view(context)
        return runtime_run_detail_service.build_live_run_detail_response(
            run_id=run_id_str,
            run=run,
            snapshot=snapshot,
            metadata=metadata,
            include_sensitive=include_sensitive,
            safe_context=safe_context,
            parent_run=parent_run,
            child_runs=child_runs,
            delegation_summary=delegation_summary,
            connector_binding=_late_server_export("_resolve_run_connector_binding")(snapshot),
            limited_result_data_view_fn=_limited_result_data_view,
            limited_node_states_view_fn=_limited_node_states_view,
            trim_memory_trace_fn=_trim_memory_trace,
            get_pending_confirmation_fn=_get_pending_confirmation,
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
        run_id_str = str(run_id)
        if run_id_str not in runs:
            raise HTTPException(404, "Run ID not found")
        snapshot = _late_server_export("_serialize_run_snapshot")(run_id_str, runs[run_id_str])
        _enforce_run_owner_access(current_user, snapshot)
        return EventSourceResponse(iter_logs_for_run(run_id_str))

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
