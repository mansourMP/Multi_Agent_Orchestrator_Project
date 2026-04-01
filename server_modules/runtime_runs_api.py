from __future__ import annotations

import fnmatch
import hashlib
import json
import threading
import time
import uuid

from fastapi.responses import StreamingResponse

from server_modules.doctor_gate import build_doctor_run_gate_live
from server_modules.heartbeat import HeartbeatScheduler
from server_modules.runtime_policy import (
    browser_automation_plan_hash_from_pack_inputs,
    build_browser_execution_binding,
)

_CHAT_STREAM_LOCK = threading.Lock()
_CHAT_STREAM_BUFFER_LIMIT = 50
_CHAT_STREAM_TTL_SECONDS = 15 * 60
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


def _heartbeat_scheduler() -> Optional[HeartbeatScheduler]:
    with _HEARTBEAT_SCHEDULER_LOCK:
        return _HEARTBEAT_SCHEDULER


def _load_webhook_triggers() -> None:
    global _WEBHOOK_TRIGGERS_LOADED
    with _WEBHOOK_TRIGGER_LOCK:
        if _WEBHOOK_TRIGGERS_LOADED:
            return
        path = _late_server_export("ORION_WEBHOOK_TRIGGERS_FILE")
        payload = _late_server_export("_safe_read_json")(path, {"version": 1, "items": []})
        items = payload.get("items") if isinstance(payload, dict) else []
        _WEBHOOK_TRIGGERS.clear()
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                trigger_id = str(item.get("id") or "").strip()
                if not trigger_id:
                    continue
                _WEBHOOK_TRIGGERS[trigger_id] = dict(item)
        _WEBHOOK_TRIGGERS_LOADED = True


def _persist_webhook_triggers_locked() -> None:
    path = _late_server_export("ORION_WEBHOOK_TRIGGERS_FILE")
    _late_server_export("_safe_write_json")(
        path,
        {
            "version": 1,
            "updated_at": time.time(),
            "items": list(_WEBHOOK_TRIGGERS.values()),
        },
    )


def _match_webhook_trigger(workspace_id: str, request_url: str) -> Optional[dict[str, Any]]:
    _load_webhook_triggers()
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    with _WEBHOOK_TRIGGER_LOCK:
        for item in _WEBHOOK_TRIGGERS.values():
            if not isinstance(item, dict) or not bool(item.get("enabled", True)):
                continue
            if str(item.get("workspace_id") or "default").strip() != normalized_workspace_id:
                continue
            pattern = str(item.get("url_pattern") or "").strip()
            if not pattern or fnmatch.fnmatch(request_url, pattern) or fnmatch.fnmatch(f"/webhooks/ingest/{normalized_workspace_id}", pattern):
                return dict(item)
    return None


def _normalize_chat_stream_cursor(value: Any) -> int:
    token = str(value or "").strip()
    if not token:
        return 0
    try:
        return max(0, int(token))
    except Exception:
        return 0


def _chat_stream_request_signature(body: dict) -> str:
    payload = {
        "workspace_id": str(body.get("workspace_id") or "").strip(),
        "thread_id": str(body.get("thread_id") or "").strip(),
        "client_request_id": str(body.get("client_request_id") or "").strip(),
        "message": str(body.get("message") or "").strip(),
        "provider": str(body.get("provider") or "").strip(),
        "model": str(body.get("model") or "").strip(),
        "reasoning_effort": str(body.get("reasoning_effort") or "").strip(),
        "prior_messages": body.get("prior_messages") if isinstance(body.get("prior_messages"), list) else [],
        "approved_action": body.get("approved_action") if isinstance(body.get("approved_action"), dict) else None,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _chat_stream_key(current_user: Any, body: dict) -> tuple[str, str, str]:
    owner = (
        str((current_user or {}).get("user_id") or "").strip()
        or str((current_user or {}).get("email") or "").strip().lower()
        or str((current_user or {}).get("auth_type") or "").strip()
        or "anonymous"
    )
    thread_id = str(body.get("thread_id") or "").strip() or "direct-chat"
    client_request_id = str(body.get("client_request_id") or "").strip() or _chat_stream_request_signature(body)
    return f"{owner}:{thread_id}:{client_request_id}", thread_id, client_request_id


def _prune_chat_stream_sessions_locked(now_ts: Optional[float] = None) -> None:
    reference = float(now_ts or time.time())
    stale_keys = [
        key
        for key, session in _CHAT_STREAM_SESSIONS.items()
        if reference - float(session.get("last_accessed_at") or reference) > _CHAT_STREAM_TTL_SECONDS
    ]
    for key in stale_keys:
        _CHAT_STREAM_SESSIONS.pop(key, None)


def _get_or_create_chat_stream_session(key: str, *, thread_id: str, request_id: str) -> dict[str, Any]:
    with _CHAT_STREAM_LOCK:
        _prune_chat_stream_sessions_locked()
        session = _CHAT_STREAM_SESSIONS.get(key)
        if isinstance(session, dict):
            session["last_accessed_at"] = time.time()
            return session
        session = {
            "key": key,
            "thread_id": thread_id,
            "request_id": request_id,
            "condition": threading.Condition(),
            "events": [],
            "next_event_id": 1,
            "producer_started": False,
            "completed": False,
            "last_accessed_at": time.time(),
        }
        _CHAT_STREAM_SESSIONS[key] = session
        return session


def _chat_stream_payload(raw_event: dict[str, Any]) -> tuple[Optional[str], Optional[dict[str, Any]]]:
    if not isinstance(raw_event, dict):
        return None, None
    event_name = str(raw_event.get("type") or "message").strip() or "message"
    if event_name == "final":
        payload = raw_event.get("payload") if isinstance(raw_event.get("payload"), dict) else {}
        return "final", payload
    payload = {key: value for key, value in raw_event.items() if key != "type"}
    return event_name, payload


def _append_chat_stream_event(session: dict[str, Any], event_name: str, payload: dict[str, Any]) -> None:
    condition = session.get("condition")
    if not isinstance(condition, threading.Condition):
        return
    with condition:
        next_event_id = int(session.get("next_event_id") or 1)
        record = {
            "id": str(next_event_id),
            "seq": next_event_id,
            "event": event_name,
            "payload": payload,
        }
        session["next_event_id"] = next_event_id + 1
        events = session.get("events") if isinstance(session.get("events"), list) else []
        events.append(record)
        if len(events) > _CHAT_STREAM_BUFFER_LIMIT:
            del events[:-_CHAT_STREAM_BUFFER_LIMIT]
        session["events"] = events
        session["last_accessed_at"] = time.time()
        if event_name == "final":
            session["completed"] = True
        condition.notify_all()


def _complete_chat_stream_session(session: dict[str, Any]) -> None:
    condition = session.get("condition")
    if not isinstance(condition, threading.Condition):
        return
    with condition:
        session["completed"] = True
        session["last_accessed_at"] = time.time()
        condition.notify_all()


def _chat_stream_error_payload(message: str) -> dict[str, Any]:
    detail = str(message or "").strip() or "unknown_error"
    return {
        "reply": f"Chat failed: {detail}",
        "actions": [],
        "mode": "answer",
        "error": detail,
    }


def _start_chat_stream_producer(session: dict[str, Any], producer_fn) -> None:
    condition = session.get("condition")
    if not isinstance(condition, threading.Condition):
        return
    with condition:
        if bool(session.get("producer_started")):
            return
        session["producer_started"] = True

    def _producer_main() -> None:
        final_emitted = False
        try:
            for raw_event in producer_fn():
                event_name, payload = _chat_stream_payload(raw_event)
                if not event_name or not isinstance(payload, dict):
                    continue
                if event_name == "final":
                    final_emitted = True
                _append_chat_stream_event(session, event_name, payload)
        except Exception as exc:
            if not final_emitted:
                _append_chat_stream_event(session, "final", _chat_stream_error_payload(str(exc)))
        finally:
            _complete_chat_stream_session(session)

    worker = threading.Thread(
        target=_producer_main,
        daemon=True,
        name=f"chat-stream-{str(session.get('request_id') or '')[:10]}",
    )
    worker.start()


def _iter_chat_stream_events(session: dict[str, Any], last_event_id: Any):
    cursor = _normalize_chat_stream_cursor(last_event_id)
    condition = session.get("condition")
    if not isinstance(condition, threading.Condition):
        return
    while True:
        with condition:
            session["last_accessed_at"] = time.time()
            pending = [
                dict(item)
                for item in (session.get("events") if isinstance(session.get("events"), list) else [])
                if int(item.get("seq") or 0) > cursor
            ]
            completed = bool(session.get("completed"))
            if not pending and completed:
                break
            if not pending:
                condition.wait(timeout=15.0)
                continue
        for item in pending:
            cursor = int(item.get("seq") or cursor)
            yield f"id: {item['id']}\n".encode("utf-8")
            yield f"event: {item['event']}\n".encode("utf-8")
            yield f"data: {json.dumps(item.get('payload') or {}, ensure_ascii=False)}\n\n".encode("utf-8")


def _can_view_sensitive_run_payload(user: Optional[dict]) -> bool:
    if not isinstance(user, dict):
        return False
    if bool(user.get("is_admin")):
        return True
    return str(user.get("auth_type") or "").strip() == "api_key"


def _limited_run_context_view(context: dict) -> dict:
    if not isinstance(context, dict):
        return {}
    return {
        "workspace_id": context.get("workspace_id"),
        "workflow_id": context.get("workflow_id"),
        "user_goal": context.get("user_goal"),
        "business_plan": context.get("business_plan"),
    }


def _limited_result_data_view(result_data: Any) -> Optional[dict]:
    if not isinstance(result_data, dict):
        return None
    execution_summary = result_data.get("execution_summary") if isinstance(result_data.get("execution_summary"), dict) else {}
    return {
        "summary": result_data.get("summary"),
        "pack_id": result_data.get("pack_id"),
        "execution_summary": {
            "risk_level": execution_summary.get("risk_level"),
            "next_action": execution_summary.get("next_action"),
            "approval_required": execution_summary.get("approval_required"),
            "approval_reason": execution_summary.get("approval_reason"),
            "estimated_time_saved_minutes": execution_summary.get("estimated_time_saved_minutes"),
        },
    }


def _extract_run_owner_user_id(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = str(payload.get("owner_user_id") or "").strip()
    if direct:
        return direct
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(metadata.get("owner_user_id") or "").strip()


def _current_user_is_privileged(current_user: Any) -> bool:
    if not isinstance(current_user, dict):
        return False
    if bool(current_user.get("is_admin")):
        return True
    if str(current_user.get("auth_type") or "").strip() == "api_key":
        return True
    user_id = str(current_user.get("user_id") or "").strip()
    email = str(current_user.get("email") or "").strip().lower()
    admin_user_ids = set(globals().get("ORION_ADMIN_USER_IDS") or [])
    admin_emails = set(globals().get("ORION_ADMIN_EMAILS") or [])
    return bool((user_id and user_id in admin_user_ids) or (email and email in admin_emails))


def _enforce_run_owner_access(current_user: Any, payload: Any) -> None:
    if _current_user_is_privileged(current_user):
        return
    if not isinstance(current_user, dict):
        raise HTTPException(status_code=401, detail="Authentication required.")
    request_user_id = str(current_user.get("user_id") or "").strip()
    if not request_user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id is required.")
    owner_user_id = _extract_run_owner_user_id(payload)
    if not owner_user_id:
        raise HTTPException(status_code=403, detail="Run is not bound to an owner.")
    if owner_user_id != request_user_id:
        raise HTTPException(status_code=403, detail="Run is owned by another user.")


def _stamp_request_owner(req: Any, current_user: Any) -> Any:
    if not isinstance(current_user, dict):
        return req
    if str(current_user.get("auth_type") or "").strip() == "api_key":
        return req
    owner_user_id = str(current_user.get("user_id") or "").strip()
    if not owner_user_id:
        return req
    metadata = dict(req.metadata or {})
    metadata["owner_user_id"] = owner_user_id
    email = str(current_user.get("email") or "").strip().lower()
    if email:
        metadata["owner_email"] = email
    req.metadata = metadata
    return req


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
    thread_id = run.get("thread_id")
    if not isinstance(thread_id, int) or thread_id <= 0:
        return False
    for worker in threading.enumerate():
        try:
            if worker.ident == thread_id and worker.is_alive():
                return True
        except Exception:
            continue
    return False


def _schedule_restored_run_resume(run_id_str: str, run: dict) -> bool:
    if not isinstance(run, dict):
        return False
    if _run_thread_is_alive(run):
        return False
    if str(run.get("status") or "").strip().lower() != "waiting_for_input":
        return False
    if bool(run.get("_resume_after_confirmation_scheduled")):
        return True
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected_target = str(
        metadata.get("execution_target_selected")
        or metadata.get("execution_target")
        or ""
    ).strip().lower()
    if selected_target == "local_companion":
        run["_resume_after_confirmation_scheduled"] = True
        run["thread_id"] = None
        run["updated_at"] = _utc_now_iso()
        checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
        metadata["browser_resume_supported"] = bool(checkpoint)
        context["metadata"] = metadata
        run["context"] = context
        _late_server_export("_enqueue_local_companion_run")(
            run_id_str,
            message=(
                "Resuming local companion run from saved browser checkpoint."
                if checkpoint
                else "Resuming local companion run."
            ),
            event=("local_resumed_from_checkpoint" if checkpoint else "local_resumed"),
        )
        return True
    run["_resume_after_confirmation_scheduled"] = True
    run["thread_id"] = None
    run["updated_at"] = _utc_now_iso()
    _late_server_export("_persist_live_run_state")(run_id_str, run)
    worker = threading.Thread(
        target=_late_server_export("run_mission"),
        args=(run_id_str,),
        daemon=True,
        name=f"run-resume-{run_id_str[:8]}",
    )
    worker.start()
    return True


def register_run_routes(app) -> None:
    import server as _server
    from server_modules.autopilot_connectors import handle_telegram_send_message
    from server_modules.agent_memory import delete_memory, get_memory, list_memory_entries
    from server_modules.operator_chat import build_direct_operator_reply
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
        result = _late_server_export("_create_run_from_request")(request)
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
    with _HEARTBEAT_SCHEDULER_LOCK:
        if _HEARTBEAT_SCHEDULER is None:
            _HEARTBEAT_SCHEDULER = HeartbeatScheduler(
                interval_seconds=30 * 60,
                workspace_id="default",
                run_callback=_start_heartbeat_run,
                notify_callback=_heartbeat_notify,
            )
            _HEARTBEAT_SCHEDULER.start()
    _load_webhook_triggers()

    @app.post("/runs/start", dependencies=[Depends(require_api_key)])
    async def start_run(body: Optional[RunStartRequest] = None, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        req = _stamp_request_owner(body or RunStartRequest(), current_user)
        prepared = _late_server_export("_prepare_run_start_request")(req)
        metadata = dict(prepared["metadata"])
        route = decide_execution_target(metadata)
        metadata = apply_execution_route_metadata(metadata, route)
        doctor_preflight = await build_doctor_run_gate_live(
            execution_target=route["selected"],
            metadata=metadata,
            provider=req.provider,
            credential_id=req.credential_id,
        )
        if bool(doctor_preflight.get("blocking")):
            raise HTTPException(status_code=409, detail=str(doctor_preflight.get("detail") or doctor_preflight.get("title") or "Run blocked by doctor policy."))
        result = _late_server_export("_create_run_from_request")(req)
        if isinstance(result, dict):
            result["doctor_preflight"] = doctor_preflight
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

        message = str(body.get("message") or "").strip()
        if not message:
            raise HTTPException(status_code=400, detail="Chat message is required.")

        session_key, thread_id, client_request_id = _chat_stream_key(current_user, body)
        session = _get_or_create_chat_stream_session(
            session_key,
            thread_id=thread_id,
            request_id=client_request_id,
        )
        replay_cursor = request.headers.get("last-event-id") or body.get("last_event_id")

        def producer():
            return build_direct_operator_reply(
                message=message,
                workspace_id=str(body.get("workspace_id") or "default").strip() or "default",
                requested_model=str(body.get("model") or "").strip(),
                requested_provider=str(body.get("provider") or "").strip(),
                thread_id=str(body.get("thread_id") or "").strip(),
                prior_messages=body.get("prior_messages") if isinstance(body.get("prior_messages"), list) else [],
                reasoning_effort=str(body.get("reasoning_effort") or "").strip(),
                availability=body.get("availability") if isinstance(body.get("availability"), dict) else {},
                approved_action=body.get("approved_action") if isinstance(body.get("approved_action"), dict) else None,
            )

        _start_chat_stream_producer(session, producer)

        return StreamingResponse(
            _iter_chat_stream_events(session, replay_cursor),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-store",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/memory/{workspace_id}", dependencies=[Depends(require_api_key)])
    async def list_workspace_memory(workspace_id: str, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        normalized_workspace_id = str(workspace_id or "default").strip() or "default"
        return {
            "workspace_id": normalized_workspace_id,
            "entries": list_memory_entries(normalized_workspace_id),
            "text": get_memory(normalized_workspace_id),
        }

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
        scheduler = _heartbeat_scheduler()
        if scheduler is None:
            return {
                "ok": False,
                "detail": "Heartbeat scheduler is not configured.",
            }
        return {
            "ok": True,
            **scheduler.status(),
        }

    @app.post("/heartbeat/trigger", dependencies=[Depends(require_api_key)])
    async def trigger_heartbeat(current_user=Depends(require_api_key)):
        _refresh_server_exports()
        scheduler = _heartbeat_scheduler()
        if scheduler is None:
            raise HTTPException(status_code=503, detail="Heartbeat scheduler is not configured.")
        return {
            "ok": True,
            **scheduler.trigger_now(),
        }

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
        trigger = {
            "id": trigger_id,
            "workspace_id": workspace_id,
            "url_pattern": url_pattern,
            "workflow_id": workflow_id,
            "user_goal": str(body.get("user_goal") or "").strip() or None,
            "metadata": body.get("metadata") if isinstance(body.get("metadata"), dict) else {},
            "enabled": bool(body.get("enabled", True)),
            "created_at": time.time(),
        }
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
        result = _late_server_export("_create_run_from_request")(request_payload)
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
            result = _late_server_export("_create_run_from_request")(delegated_req)
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

        note = str(req.note or "").strip() or "Auto-planned by orchestrator rules."
        created: List[Dict[str, Any]] = []
        for child in plan:
            delegated_req = _late_server_export("_build_delegated_run_request")(parent_snapshot, child, note=note)
            result = _late_server_export("_create_run_from_request")(delegated_req)
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
            result = _late_server_export("_create_run_from_request")(delegated_req)
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
        prepared = _late_server_export("_prepare_run_start_request")(req)
        metadata = dict(prepared["metadata"])
        workflow_snapshot = prepared.get("workflow_snapshot") if isinstance(prepared.get("workflow_snapshot"), dict) else None
        route = decide_execution_target(metadata)
        metadata = apply_execution_route_metadata(metadata, route)
        precheck = _compute_tool_policy_precheck(
            {
                "workflow_id": req.workflow_id,
                "workspace_id": req.workspace_id,
                "user_goal": req.user_goal,
                "business_plan": req.business_plan,
                "agent_role": req.agent_role,
                "provider": req.provider,
                "model": req.model,
                "credential_id": req.credential_id,
                "agents": req.agents or [],
                "metadata": metadata,
                "workflow_definition": workflow_snapshot.get("definition") if isinstance(workflow_snapshot, dict) else None,
                "workflow_name": workflow_snapshot.get("name") if isinstance(workflow_snapshot, dict) else None,
                "workflow_status": workflow_snapshot.get("status") if isinstance(workflow_snapshot, dict) else None,
            }
        )
        return {
            "engine": prepared["engine"],
            "agent_role": metadata.get("agent_role"),
            "agent_role_source": metadata.get("agent_role_source"),
            "route": route,
            "tool_policy_precheck": precheck,
        }

    @app.post("/runs/precheck", dependencies=[Depends(require_api_key)])
    async def precheck_run(body: Optional[RunStartRequest] = None):
        _refresh_server_exports()
        req = body or RunStartRequest()
        prepared = _late_server_export("_prepare_run_start_request")(req)
        metadata = dict(prepared["metadata"])
        workflow_snapshot = prepared.get("workflow_snapshot") if isinstance(prepared.get("workflow_snapshot"), dict) else None
        route = decide_execution_target(metadata)
        metadata = apply_execution_route_metadata(metadata, route)
        precheck = _compute_tool_policy_precheck(
            {
                "workflow_id": req.workflow_id,
                "workspace_id": req.workspace_id,
                "user_goal": req.user_goal,
                "business_plan": req.business_plan,
                "agent_role": req.agent_role,
                "provider": req.provider,
                "model": req.model,
                "credential_id": req.credential_id,
                "agents": req.agents or [],
                "metadata": metadata,
                "workflow_definition": workflow_snapshot.get("definition") if isinstance(workflow_snapshot, dict) else None,
                "workflow_name": workflow_snapshot.get("name") if isinstance(workflow_snapshot, dict) else None,
                "workflow_status": workflow_snapshot.get("status") if isinstance(workflow_snapshot, dict) else None,
            }
        )
        doctor_preflight = await build_doctor_run_gate_live(
            execution_target=route["selected"],
            metadata=metadata,
            provider=req.provider,
            credential_id=req.credential_id,
        )
        return {
            "ok": True,
            "engine": prepared["engine"],
            "agent_role": metadata.get("agent_role"),
            "agent_role_source": metadata.get("agent_role_source"),
            "route": route,
            "tool_policy_precheck": precheck,
            "doctor_preflight": doctor_preflight,
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
            response = {
                "run_id": run_id_str,
                "engine": snapshot.get("engine", "orion"),
                "status": snapshot.get("status", "unknown"),
                "owner_user_id": snapshot.get("owner_user_id"),
                "owner_email": snapshot.get("owner_email"),
                "created_at": snapshot.get("created_at"),
                "updated_at": snapshot.get("updated_at"),
                "duration_ms": snapshot.get("duration_ms"),
                "time_to_first_value_ms": snapshot.get("time_to_first_value_ms"),
                "hitl_wait_total_ms": round(float(snapshot.get("hitl_wait_total_ms") or 0.0), 2),
                "usage_masked": snapshot.get("usage_masked"),
                "active_profile_id": snapshot.get("active_profile_id"),
                "active_profile_label": snapshot.get("active_profile_label"),
                "active_profile_provider": snapshot.get("active_profile_provider"),
                "active_profile_model": snapshot.get("active_profile_model"),
                "active_adapter": snapshot.get("active_adapter"),
                "requested_provider": snapshot.get("requested_provider"),
                "effective_provider": snapshot.get("effective_provider"),
                "requested_model": snapshot.get("requested_model"),
                "effective_model": snapshot.get("effective_model"),
                "provider_overridden": bool(snapshot.get("provider_overridden")),
                "model_overridden": bool(snapshot.get("model_overridden")),
                "fallback_used": bool(snapshot.get("fallback_used")),
                "result": snapshot.get("result_summary"),
                "result_data": snapshot.get("result_data") if include_sensitive else _limited_result_data_view(snapshot.get("result_data")),
                "agent_role": metadata.get("agent_role"),
                "agent_role_source": metadata.get("agent_role_source"),
                "parent_run_id": snapshot.get("parent_run_id"),
                "delegation_root_run_id": snapshot.get("delegation_root_run_id"),
                "delegated_by_run_id": snapshot.get("delegated_by_run_id"),
                "delegated_by_role": snapshot.get("delegated_by_role"),
                "delegation_note": snapshot.get("delegation_note"),
                "parent_run": parent_run,
                "child_runs": child_runs,
                "delegation_summary": delegation_summary,
                "connector_binding": _late_server_export("_resolve_run_connector_binding")(snapshot),
                "tool_capabilities": snapshot.get("tool_capabilities") if isinstance(snapshot.get("tool_capabilities"), list) else [],
                "approval_outcome": snapshot.get("approval_outcome"),
                "evidence_items": snapshot.get("evidence_items") if isinstance(snapshot.get("evidence_items"), list) else [],
                "run_detail_contract": snapshot.get("run_detail_contract") if isinstance(snapshot.get("run_detail_contract"), dict) else {},
                "node_states": snapshot.get("node_states") if include_sensitive else _limited_node_states_view(snapshot.get("node_states")),
                "tool_policy_precheck": snapshot.get("tool_policy_precheck") if include_sensitive else None,
                "tool_policy_audit": snapshot.get("tool_policy_audit") if include_sensitive else [],
                "memory_trace": snapshot.get("memory_trace") if include_sensitive else {},
                "pending_confirmation": snapshot.get("pending_confirmation") or snapshot.get("pending_approval"),
                # Deprecated compatibility alias. Prefer `pending_confirmation`.
                "pending_approval": snapshot.get("pending_confirmation") or snapshot.get("pending_approval"),
                "browser_checkpoint": snapshot.get("browser_checkpoint") if include_sensitive else None,
                "dag": snapshot.get("dag") if include_sensitive else None,
                "context": safe_context,
                "execution_target_requested": snapshot.get("execution_target_requested"),
                "execution_target_selected": snapshot.get("execution_target_selected"),
                "execution_target_reason": snapshot.get("execution_target_reason"),
                "execution_target_fallback": snapshot.get("execution_target_fallback"),
                "execution_target_required_capabilities": snapshot.get("execution_target_required_capabilities"),
                "execution_target_missing_capabilities": snapshot.get("execution_target_missing_capabilities"),
                "execution_target_matching_runtime_ids": snapshot.get("execution_target_matching_runtime_ids"),
                "execution_target_available_runtime_ids": snapshot.get("execution_target_available_runtime_ids"),
                "execution_target_busy_runtime_ids": snapshot.get("execution_target_busy_runtime_ids"),
                "execution_target_busy_runtime_labels": snapshot.get("execution_target_busy_runtime_labels"),
                "execution_target_queued_ahead_count": snapshot.get("execution_target_queued_ahead_count"),
                "execution_target_estimated_wait_band": snapshot.get("execution_target_estimated_wait_band"),
                "execution_target_waiting_for_runtime": snapshot.get("execution_target_waiting_for_runtime"),
                "execution_target_waiting_for_capacity": snapshot.get("execution_target_waiting_for_capacity"),
                "execution_target_preferred_runtime_id": snapshot.get("execution_target_preferred_runtime_id"),
                "execution_target_preferred_runtime_label": snapshot.get("execution_target_preferred_runtime_label"),
                "execution_target_preferred_runtime_reason": snapshot.get("execution_target_preferred_runtime_reason"),
                "route": {
                    "requested": snapshot.get("execution_target_requested"),
                    "selected": snapshot.get("execution_target_selected"),
                    "reason": snapshot.get("execution_target_reason"),
                    "fallback": snapshot.get("execution_target_fallback"),
                    "required_capabilities": snapshot.get("execution_target_required_capabilities"),
                    "missing_capabilities": snapshot.get("execution_target_missing_capabilities"),
                    "matching_runtime_ids": snapshot.get("execution_target_matching_runtime_ids"),
                    "available_runtime_ids": snapshot.get("execution_target_available_runtime_ids"),
                    "busy_runtime_ids": snapshot.get("execution_target_busy_runtime_ids"),
                    "busy_runtime_labels": snapshot.get("execution_target_busy_runtime_labels"),
                    "queued_ahead_count": snapshot.get("execution_target_queued_ahead_count"),
                    "estimated_wait_band": snapshot.get("execution_target_estimated_wait_band"),
                    "waiting_for_runtime": snapshot.get("execution_target_waiting_for_runtime"),
                    "waiting_for_capacity": snapshot.get("execution_target_waiting_for_capacity"),
                    "preferred_runtime_id": snapshot.get("execution_target_preferred_runtime_id"),
                    "preferred_runtime_label": snapshot.get("execution_target_preferred_runtime_label"),
                    "preferred_runtime_reason": snapshot.get("execution_target_preferred_runtime_reason"),
                },
                "archived": True,
            }
            if snapshot.get("fallback_reason"):
                response["fallback_reason"] = snapshot.get("fallback_reason")
            return response

        context = run.get("context", {})
        metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
        snapshot = _serialize_run_snapshot(run_id_str, run)
        _enforce_run_owner_access(current_user, snapshot)
        parent_run, child_runs = _late_server_export("_find_run_relationships")(run_id_str, snapshot)
        delegation_summary = _late_server_export("_build_delegation_summary")(snapshot, child_runs)
        safe_context = redact_sensitive(context) if include_sensitive else _limited_run_context_view(context)
        response = {
            "run_id": run_id_str,
            "engine": run.get("engine", "orion"),
            "status": run.get("status", "unknown"),
            "owner_user_id": str(metadata.get("owner_user_id") or "").strip() or None,
            "owner_email": str(metadata.get("owner_email") or "").strip().lower() or None,
            "created_at": run.get("created_at"),
            "updated_at": run.get("updated_at"),
            "duration_ms": run.get("duration_ms"),
            "time_to_first_value_ms": run.get("time_to_first_value_ms"),
            "hitl_wait_total_ms": round(float(run.get("_hitl_wait_total_ms", 0.0)), 2),
            "usage_masked": run.get("usage_masked"),
            "active_profile_id": snapshot.get("active_profile_id"),
            "active_profile_label": snapshot.get("active_profile_label"),
            "active_profile_provider": snapshot.get("active_profile_provider"),
            "active_profile_model": snapshot.get("active_profile_model"),
            "active_adapter": snapshot.get("active_adapter"),
            "requested_provider": snapshot.get("requested_provider"),
            "effective_provider": snapshot.get("effective_provider"),
            "requested_model": snapshot.get("requested_model"),
            "effective_model": snapshot.get("effective_model"),
            "provider_overridden": bool(snapshot.get("provider_overridden")),
            "model_overridden": bool(snapshot.get("model_overridden")),
            "fallback_used": bool(snapshot.get("fallback_used")),
            "result": run.get("result"),
            "result_data": run.get("result_data") if include_sensitive else _limited_result_data_view(run.get("result_data")),
            "agent_role": metadata.get("agent_role"),
            "agent_role_source": metadata.get("agent_role_source"),
            "parent_run_id": metadata.get("parent_run_id"),
            "delegation_root_run_id": metadata.get("delegation_root_run_id"),
            "delegated_by_run_id": metadata.get("delegated_by_run_id"),
            "delegated_by_role": metadata.get("delegated_by_role"),
            "delegation_note": metadata.get("delegation_note"),
            "parent_run": parent_run,
            "child_runs": child_runs,
            "delegation_summary": delegation_summary,
            "connector_binding": _late_server_export("_resolve_run_connector_binding")(snapshot),
            "tool_capabilities": snapshot.get("tool_capabilities") if isinstance(snapshot.get("tool_capabilities"), list) else [],
            "approval_outcome": snapshot.get("approval_outcome"),
            "evidence_items": snapshot.get("evidence_items") if isinstance(snapshot.get("evidence_items"), list) else [],
            "run_detail_contract": snapshot.get("run_detail_contract") if isinstance(snapshot.get("run_detail_contract"), dict) else {},
            "node_states": snapshot.get("node_states") if include_sensitive else _limited_node_states_view(snapshot.get("node_states")),
            "tool_policy_precheck": metadata.get("tool_policy_precheck") if include_sensitive else None,
            "tool_policy_audit": run.get("tool_policy_audit") if include_sensitive and isinstance(run.get("tool_policy_audit"), list) else [],
            "memory_trace": _trim_memory_trace(run.get("memory_trace") if include_sensitive and isinstance(run.get("memory_trace"), dict) else {}),
            "pending_confirmation": _get_pending_confirmation(run) or None,
            # Deprecated compatibility alias. Prefer `pending_confirmation`.
            "pending_approval": _get_pending_confirmation(run) or None,
            "browser_checkpoint": run.get("browser_checkpoint") if include_sensitive and isinstance(run.get("browser_checkpoint"), dict) else None,
            "dag": run.get("dag") if include_sensitive else None,
            "context": safe_context,
            "execution_target_requested": metadata.get("execution_target_requested"),
            "execution_target_selected": metadata.get("execution_target_selected"),
            "execution_target_reason": metadata.get("execution_target_reason"),
            "execution_target_fallback": metadata.get("execution_target_fallback"),
            "execution_target_required_capabilities": metadata.get("execution_target_required_capabilities"),
            "execution_target_missing_capabilities": metadata.get("execution_target_missing_capabilities"),
            "execution_target_matching_runtime_ids": metadata.get("execution_target_matching_runtime_ids"),
            "execution_target_available_runtime_ids": metadata.get("execution_target_available_runtime_ids"),
            "execution_target_busy_runtime_ids": metadata.get("execution_target_busy_runtime_ids"),
            "execution_target_busy_runtime_labels": metadata.get("execution_target_busy_runtime_labels"),
            "execution_target_queued_ahead_count": metadata.get("execution_target_queued_ahead_count"),
            "execution_target_estimated_wait_band": metadata.get("execution_target_estimated_wait_band"),
            "execution_target_waiting_for_runtime": metadata.get("execution_target_waiting_for_runtime"),
            "execution_target_waiting_for_capacity": metadata.get("execution_target_waiting_for_capacity"),
            "execution_target_preferred_runtime_id": metadata.get("execution_target_preferred_runtime_id"),
            "execution_target_preferred_runtime_label": metadata.get("execution_target_preferred_runtime_label"),
            "execution_target_preferred_runtime_reason": metadata.get("execution_target_preferred_runtime_reason"),
            "route": {
                "requested": metadata.get("execution_target_requested"),
                "selected": metadata.get("execution_target_selected"),
                "reason": metadata.get("execution_target_reason"),
                "fallback": metadata.get("execution_target_fallback"),
                "required_capabilities": metadata.get("execution_target_required_capabilities"),
                "missing_capabilities": metadata.get("execution_target_missing_capabilities"),
                "matching_runtime_ids": metadata.get("execution_target_matching_runtime_ids"),
                "available_runtime_ids": metadata.get("execution_target_available_runtime_ids"),
                "busy_runtime_ids": metadata.get("execution_target_busy_runtime_ids"),
                "busy_runtime_labels": metadata.get("execution_target_busy_runtime_labels"),
                "queued_ahead_count": metadata.get("execution_target_queued_ahead_count"),
                "estimated_wait_band": metadata.get("execution_target_estimated_wait_band"),
                "waiting_for_runtime": metadata.get("execution_target_waiting_for_runtime"),
                "waiting_for_capacity": metadata.get("execution_target_waiting_for_capacity"),
                "preferred_runtime_id": metadata.get("execution_target_preferred_runtime_id"),
                "preferred_runtime_label": metadata.get("execution_target_preferred_runtime_label"),
                "preferred_runtime_reason": metadata.get("execution_target_preferred_runtime_reason"),
            },
            "archived": archived,
        }
        if snapshot.get("fallback_reason"):
            response["fallback_reason"] = snapshot.get("fallback_reason")
        return response

    @app.get("/history/runs", dependencies=[Depends(require_api_key)])
    async def get_runs_history(
        limit: int = 30,
        workspace_id: Optional[str] = None,
        status: Optional[str] = None,
        pack_id: Optional[str] = None,
        current_user=Depends(require_api_key),
    ):
        _refresh_server_exports()
        safe_limit = max(1, min(limit, 200))
        with RUN_HISTORY_LOCK:
            items = list(RUN_HISTORY)
        filtered = [item for item in items if _history_item_matches(item, workspace_id, status, pack_id)]
        if not _current_user_is_privileged(current_user):
            request_user_id = str(current_user.get("user_id") or "").strip()
            if not request_user_id:
                raise HTTPException(status_code=401, detail="Authenticated user id is required.")
            filtered = [item for item in filtered if _extract_run_owner_user_id(item) == request_user_id]
        child_counts: Dict[str, int] = {}
        for item in filtered:
            parent_run_id = _late_server_export("_normalize_run_id_token")(item.get("parent_run_id"))
            if parent_run_id:
                child_counts[parent_run_id] = child_counts.get(parent_run_id, 0) + 1
        payload = []
        for item in filtered[:safe_limit]:
            summary = _summarize_history_item(item)
            run_id_value = str(summary.get("run_id") or "").strip()
            summary["child_run_count"] = child_counts.get(run_id_value, 0)
            payload.append(summary)
        return {
            "items": payload,
            "count": len(payload),
            "total": len(filtered),
        }

    @app.get("/runs/{run_id}/replay", dependencies=[Depends(require_admin_api_key)])
    async def get_run_replay(run_id: uuid.UUID):
        _refresh_server_exports()
        item = _get_replay_payload(str(run_id))
        return {"item": item}

    @app.post("/runs/{run_id}/replay", dependencies=[Depends(require_admin_api_key)])
    async def replay_run(run_id: uuid.UUID):
        _refresh_server_exports()
        item = _get_replay_payload(str(run_id))
        replay_payload = item.get("replay_request")
        if not isinstance(replay_payload, dict):
            raise HTTPException(status_code=400, detail="Replay request is not available for this run.")
        try:
            req = RunStartRequest(**replay_payload)
            return _late_server_export("_create_run_from_request")(req)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

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
        if run_id_str in runs:
            run = runs[run_id_str]
            snapshot = _late_server_export("_serialize_run_snapshot")(run_id_str, run)
            _enforce_run_owner_access(current_user, snapshot)
            pending = _get_pending_confirmation(run)
            approval_id = str(pending.get("approval_id") or "").strip() if isinstance(pending, dict) else ""
            correlation_id = str(pending.get("correlation_id") or "").strip() if isinstance(pending, dict) else ""
            context = run.get("context")
            metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
            if approval_id and (
                bool(metadata.get("local_execution_waiting_confirmation"))
                or bool(metadata.get("local_execution_waiting_approval"))
            ):
                return _resolve_local_execution_start_approval(
                    run_id_str,
                    run,
                    approval_id,
                    str(payload.decision or "").strip().lower(),
                    str(payload.note or ""),
                )
            if approval_id:
                _append_approval_audit(
                    approval_id=approval_id,
                    stage="decision_submitted",
                    decision=str(payload.decision or "").strip().lower(),
                    actor="user",
                    source="runs_decision_api",
                    run_id=run_id_str,
                    note=str(payload.note or ""),
                    correlation_id=correlation_id or _approval_correlation_id(approval_id, run_id=run_id_str),
                    metadata={"scope": "once", "reusable": False},
                )
                run["input_queue"].put({"approval_id": approval_id, "decision": payload.decision, "note": payload.note})
                return {
                    "status": "ok",
                    "approval_id": approval_id,
                    "correlation_id": correlation_id or None,
                    "scope": "once",
                    "reusable": False,
                    "consequence": "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.",
                }
            run["input_queue"].put(payload.decision)
            return {"status": "ok", "approval_id": None}
        raise HTTPException(404, "Run ID not found")

    @app.post("/runs/{run_id}/approvals/{approval_id}/resolve", dependencies=[Depends(require_api_key)])
    async def resolve_run_approval(run_id: uuid.UUID, approval_id: str, payload: ApprovalResolvePayload, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        payload.validate_fields()
        run_id_str = str(run_id)
        run = runs.get(run_id_str)
        if not isinstance(run, dict):
            raise HTTPException(status_code=404, detail="Run ID not found")
        snapshot = _late_server_export("_serialize_run_snapshot")(run_id_str, run)
        _enforce_run_owner_access(current_user, snapshot)
        pending = _get_pending_confirmation(run)
        if not isinstance(pending, dict):
            raise HTTPException(status_code=409, detail="No pending confirmation for this run.")
        expected = str(pending.get("approval_id") or "").strip()
        if expected != approval_id:
            raise HTTPException(status_code=409, detail="approval_id does not match pending confirmation.")
        decision_text = str(payload.decision or "").strip().lower()
        context = run.get("context")
        metadata = context.get("metadata") if isinstance(context, dict) and isinstance(context.get("metadata"), dict) else {}
        if bool(metadata.get("local_execution_waiting_confirmation")) or bool(metadata.get("local_execution_waiting_approval")):
            return _resolve_local_execution_start_approval(
                run_id_str,
                run,
                approval_id,
                decision_text,
                str(payload.note or ""),
            )
        approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
        reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
        escalate_tokens = {"escalate", "escalated"}
        approved = decision_text in approve_tokens
        escalated = decision_text in escalate_tokens
        rejected = decision_text in reject_tokens or (not approved and not escalated)
        correlation_id = str(pending.get("correlation_id") or "").strip() or _approval_correlation_id(approval_id, run_id=run_id_str)
        expires_at = _parse_utc_ts(pending.get("expires_at"))
        if expires_at is not None and _utc_now() > expires_at:
            pending["status"] = "expired"
            pending["expired_at"] = _utc_now_iso()
            _set_pending_confirmation(run, pending)
            raise HTTPException(status_code=409, detail="Confirmation request has already expired.")
        run["input_queue"].put(
            {
                "approval_id": approval_id,
                "decision": payload.decision,
                "note": payload.note,
            }
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="decision_submitted",
            decision=("approved" if approved else "escalated" if escalated else "rejected"),
            actor="user",
            source="runs_approval_api",
            run_id=run_id_str,
            note=str(payload.note or ""),
            correlation_id=correlation_id,
            metadata={
                "raw_decision": decision_text,
                "approved": bool(approved),
                "rejected": bool(rejected),
                "escalated": bool(escalated),
                "scope": "once",
                "reusable": False,
            },
        )
        if not _run_thread_is_alive(run) and str(run.get("status") or "").strip().lower() == "waiting_for_input":
            pending["status"] = "resolved"
            pending["resolved_at"] = _utc_now_iso()
            pending["decision"] = decision_text
            pending["note"] = str(payload.note or "")
            _set_pending_confirmation(run, pending)
            emit_log(
                run["logs"],
                "info" if approved else "warn",
                "Confirmation recorded. Restored run is resuming.",
                event="approval_resume_scheduled",
                data={
                    "approval_id": approval_id,
                    "correlation_id": correlation_id,
                    "decision": decision_text,
                    "scope": "once",
                    "reusable": False,
                },
            )
            _schedule_restored_run_resume(run_id_str, run)
        return {
            "status": "ok",
            "run_id": run_id_str,
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "decision_kind": ("approved" if approved else "escalated" if escalated else "rejected"),
            "scope": "once",
            "reusable": False,
            "consequence": "This confirmation applies only to this pending step in this run. Later runs or later confirmation points will ask again.",
        }

    @app.post("/runs/{run_id}/resume", dependencies=[Depends(require_api_key)])
    async def resume_run(run_id: uuid.UUID, current_user=Depends(require_api_key)):
        _refresh_server_exports()
        run_id_str = str(run_id)
        run = runs.get(run_id_str)
        if not isinstance(run, dict):
            raise HTTPException(status_code=404, detail="Run ID not found")
        snapshot = _late_server_export("_serialize_run_snapshot")(run_id_str, run)
        _enforce_run_owner_access(current_user, snapshot)
        if str(run.get("status") or "").strip().lower() != "waiting_for_input":
            raise HTTPException(status_code=409, detail="Run is not waiting for input.")
        if isinstance(_get_pending_confirmation(run), dict) and _get_pending_confirmation(run):
            raise HTTPException(status_code=409, detail="Run requires confirmation resolution, not direct resume.")
        checkpoint = run.get("browser_checkpoint") if isinstance(run.get("browser_checkpoint"), dict) else {}
        if not checkpoint:
            raise HTTPException(status_code=409, detail="Run does not have a resumable browser checkpoint.")
        emit_log(
            run["logs"],
            "info",
            "Resume requested for paused browser operator run.",
            event="browser_resume_requested",
            data={
                "run_id": run_id_str,
                "next_action_index": checkpoint.get("next_action_index"),
                "session_profile": checkpoint.get("session_profile"),
            },
        )
        if not _schedule_restored_run_resume(run_id_str, run):
            raise HTTPException(status_code=409, detail="Run could not be resumed.")
        return {
            "status": "ok",
            "run_id": run_id_str,
            "resume_kind": "browser_checkpoint",
            "next_action_index": checkpoint.get("next_action_index"),
        }
