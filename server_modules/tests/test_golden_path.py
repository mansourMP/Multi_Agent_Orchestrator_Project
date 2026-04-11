import asyncio
import contextlib
import itertools
import queue
import sys
import threading
import types
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

from server_modules import activity_ledger_service
from server_modules import notification_service
from server_modules import outbox_service
from server_modules import run_state_repository
from server_modules import run_service
from server_modules import runs_core
from server_modules import runs_delegation
from server_modules import runs_output
from server_modules import runtime_common
from server_modules import runtime_events_api
from server_modules import runtime_run_access_service
from server_modules import runtime_run_approval_service
from server_modules import runtime_run_delegation_service
from server_modules import runtime_runs_api
from server_modules.turn_runtime import execute_system_run_start_request_via_turn_runtime


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self._register("POST", path, **kwargs)

    def delete(self, path, **kwargs):
        return self._register("DELETE", path, **kwargs)


class _FakeRequest:
    def __init__(self, payload=None, *, headers=None) -> None:
        self._payload = payload or {}
        self.headers = headers or {}

    async def json(self):
        return self._payload


class _AutoDelegationPayload:
    def __init__(self, *, max_children: int = 1, note: str = "") -> None:
        self.max_children = max_children
        self.note = note

    def validate_fields(self) -> None:
        return None


class GoldenPathSmokeTests(unittest.TestCase):
    def test_golden_path_turn_to_delegation_artifact_activity_and_approval(self) -> None:
        base_dt = datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc)
        time_counter = itertools.count()
        run_counter = itertools.count(1)
        started_counter = itertools.count(1)
        activity_counter = itertools.count(1)
        outbox_events: List[Dict[str, Any]] = []
        channel_events: List[Dict[str, Any]] = []
        notification_rows: List[Dict[str, Any]] = []
        activity_rows: List[Dict[str, Any]] = []
        approval_audit: List[Dict[str, Any]] = []
        live_runs: Dict[str, Dict[str, Any]] = {}
        run_history: List[Dict[str, Any]] = []
        run_history_lock = threading.Lock()
        run_queue_index: Dict[int, str] = {}

        def _next_dt() -> datetime:
            return base_dt + timedelta(seconds=next(time_counter))

        def _next_iso() -> str:
            return _next_dt().isoformat().replace("+00:00", "Z")

        def _current_user() -> Dict[str, Any]:
            return {
                "user_id": "user-1",
                "email": "user@example.com",
                "auth_type": "bearer",
                "role": "owner",
                "is_admin": False,
                "workspace_ids": ["default"],
                "workspace_access": {
                    "default": {
                        "workspace_id": "default",
                        "tenant_id": "default",
                        "role": "owner",
                        "tenant_role": "owner",
                        "capabilities": {"allow": [], "deny": []},
                        "tenant_capabilities": {"allow": [], "deny": []},
                        "workspace_capabilities": {"allow": [], "deny": []},
                        "dangerous_action_classes": {"allow": [], "deny": []},
                        "tenant_dangerous_action_classes": {"allow": [], "deny": []},
                        "workspace_dangerous_action_classes": {"allow": [], "deny": []},
                        "connectors": {"allow": [], "deny": []},
                        "tenant_connectors": {"allow": [], "deny": []},
                        "workspace_connectors": {"allow": [], "deny": []},
                        "machine_enrollment_scope": "workspace",
                        "trusted_owner_machine_ids": [],
                    }
                },
            }

        def _emit_log(log_queue, level, text, event=None, data=None):
            log_queue.put(
                {
                    "level": str(level or "").strip().lower() or "info",
                    "text": str(text or ""),
                    "event": event,
                    "data": data or {},
                    "ts": _next_iso(),
                }
            )

        def _custom_create_run(engine: str, context: Optional[dict] = None, *, defer_local_enqueue: bool = False) -> str:
            run_id = str(uuid.UUID(int=next(run_counter)))
            now_iso = _next_iso()
            context_payload = dict(context or {})
            record = run_service.build_live_run_record(
                run_id=run_id,
                engine=engine,
                context=context_payload,
                now_iso=now_iso,
                started_mono=float(next(started_counter)),
                log_queue=queue.Queue(),
                input_queue=queue.Queue(),
                memory_enabled=True,
                memory_updated_at=now_iso,
                active_profile_id=None,
                active_profile_label=None,
                active_provider=str(context_payload.get("provider") or "").strip() or None,
                active_model=str(context_payload.get("model") or "").strip() or None,
            )
            live_runs[run_id] = record
            run_queue_index[id(record["logs"])] = run_id
            return run_id

        def _safe_created_run(run_id: str) -> Dict[str, Any]:
            run = live_runs.get(run_id)
            if not isinstance(run, dict):
                return {}
            return runs_output._serialize_run_snapshot(run_id, run)

        def _create_run_from_request(req):
            result = runs_core._create_run_from_request(req)
            run_id = str(result.get("run_id") or "").strip()
            if run_id:
                result = dict(result)
                result["created_run"] = _safe_created_run(run_id)
            return result

        def _set_live_status(run_id: str, status: str) -> None:
            run = live_runs.get(run_id)
            if not isinstance(run, dict):
                return
            run["status"] = status
            run["updated_at"] = _next_iso()

        def _archive_run_if_terminal(run_id: str, run: Dict[str, Any]) -> None:
            snapshot = runs_output._serialize_run_snapshot(run_id, run)
            snapshot["_archived"] = True
            with run_history_lock:
                for idx, item in enumerate(run_history):
                    if str(item.get("run_id") or "").strip() == run_id:
                        run_history[idx] = snapshot
                        break
                else:
                    run_history.insert(0, snapshot)

        def _remove_live_run_state(run_id: str) -> None:
            live_runs.pop(run_id, None)

        def _persist_live_run_state(run_id: str, run: Dict[str, Any]) -> None:
            live_runs[run_id] = run

        def _persist_outbox_event(
            *,
            event_id: str,
            event_type: str,
            tenant_id: str,
            workspace_id: str,
            run_id: Optional[str] = None,
            machine_id: Optional[str] = None,
            trace_id: str = "",
            idempotency_key: str = "",
            payload: Optional[Dict[str, Any]] = None,
        ) -> None:
            outbox_events.append(
                {
                    "event_id": event_id,
                    "event_type": event_type,
                    "tenant_id": tenant_id,
                    "workspace_id": workspace_id,
                    "run_id": run_id,
                    "machine_id": machine_id,
                    "trace_id": trace_id,
                    "idempotency_key": idempotency_key,
                    "payload": dict(payload or {}),
                    "created_at": _next_iso(),
                    "retry_count": 0,
                    "last_delivery_error": None,
                    "last_attempted_at": None,
                    "next_attempt_at": None,
                    "poisoned_at": None,
                    "delivered_at": None,
                }
            )

        def _list_undelivered_outbox_events(*, older_than_seconds: int = 0, limit: int = 200):
            return [
                dict(item)
                for item in outbox_events
                if not str(item.get("delivered_at") or "").strip()
            ][: max(1, int(limit or 200))]

        def _mark_outbox_event_delivered(event_id: str) -> None:
            for item in outbox_events:
                if str(item.get("event_id") or "").strip() == str(event_id).strip():
                    item["delivered_at"] = _next_iso()
                    item["last_attempted_at"] = item["delivered_at"]
                    return

        def _record_outbox_delivery_failure(
            event_id: str,
            *,
            error_text: str,
            retry_delay_seconds: Optional[int],
            poison: bool = False,
            increment_retry: bool = True,
        ) -> None:
            for item in outbox_events:
                if str(item.get("event_id") or "").strip() != str(event_id).strip():
                    continue
                item["retry_count"] = int(item.get("retry_count") or 0) + (1 if increment_retry else 0)
                item["last_delivery_error"] = error_text
                item["last_attempted_at"] = _next_iso()
                item["next_attempt_at"] = (
                    None if poison or retry_delay_seconds is None else _next_iso()
                )
                item["poisoned_at"] = _next_iso() if poison else None
                return

        def _get_outbox_delivery_status() -> Dict[str, Any]:
            undelivered = [
                item for item in outbox_events if not str(item.get("delivered_at") or "").strip()
            ]
            poisoned = [
                item for item in undelivered if str(item.get("poisoned_at") or "").strip()
            ]
            return {
                "undelivered_count": len(undelivered),
                "poisoned_count": len(poisoned),
                "total_retry_count": sum(int(item.get("retry_count") or 0) for item in outbox_events),
                "max_retry_count": max([int(item.get("retry_count") or 0) for item in outbox_events] or [0]),
                "last_delivery_error": next(
                    (
                        str(item.get("last_delivery_error") or "").strip()
                        for item in reversed(outbox_events)
                        if str(item.get("last_delivery_error") or "").strip()
                    ),
                    None,
                ),
            }

        def _append_channel_event_item(**kwargs) -> None:
            channel_events.append(dict(kwargs))

        async def _append_activity_ledger_event(**kwargs):
            row = dict(kwargs)
            row["id"] = str(row.get("event_id") or f"aevt-{next(activity_counter)}")
            row["created_at"] = _next_dt()
            row["updated_at"] = row["created_at"]
            activity_rows.append(row)
            return dict(row)

        async def _list_activity_ledger_events(
            *,
            tenant_id: str,
            workspace_id: str,
            event_classes: Optional[List[str]] = None,
            detail_levels: Optional[List[str]] = None,
            actor_type: Optional[str] = None,
            actor_id: Optional[str] = None,
            install_id: Optional[str] = None,
            app_id: Optional[str] = None,
            run_id: Optional[str] = None,
            thread_id: Optional[str] = None,
            channel: Optional[str] = None,
            direction: Optional[str] = None,
            session_key: Optional[str] = None,
            action: Optional[str] = None,
            trace_id: Optional[str] = None,
            status: Optional[str] = None,
            limit: int = 100,
        ) -> List[Dict[str, Any]]:
            normalized_event_classes = {str(item or "").strip().lower() for item in list(event_classes or []) if str(item or "").strip()}
            normalized_detail_levels = {str(item or "").strip().lower() for item in list(detail_levels or []) if str(item or "").strip()}
            items: List[Dict[str, Any]] = []
            for row in activity_rows:
                if str(row.get("tenant_id") or "").strip() != str(tenant_id).strip():
                    continue
                if str(row.get("workspace_id") or "").strip() != str(workspace_id).strip():
                    continue
                if normalized_event_classes and str(row.get("event_class") or "").strip().lower() not in normalized_event_classes:
                    continue
                if normalized_detail_levels and str(row.get("detail_level") or "").strip().lower() not in normalized_detail_levels:
                    continue
                if actor_type and str(row.get("actor_type") or "").strip().lower() != str(actor_type).strip().lower():
                    continue
                if actor_id and str(row.get("actor_id") or "").strip() != str(actor_id).strip():
                    continue
                if install_id and str(row.get("install_id") or "").strip() != str(install_id).strip():
                    continue
                if app_id and str(row.get("app_id") or "").strip() != str(app_id).strip():
                    continue
                if run_id and str(row.get("run_id") or "").strip() != str(run_id).strip():
                    continue
                if thread_id and str(row.get("thread_id") or "").strip() != str(thread_id).strip():
                    continue
                if channel and str(row.get("channel") or "").strip().lower() != str(channel).strip().lower():
                    continue
                if direction and str(row.get("direction") or "").strip().lower() != str(direction).strip().lower():
                    continue
                if session_key and str(row.get("session_key") or "").strip() != str(session_key).strip():
                    continue
                if action and str(row.get("action") or "").strip().lower() != str(action).strip().lower():
                    continue
                if trace_id and str(row.get("trace_id") or "").strip() != str(trace_id).strip():
                    continue
                if status and str(row.get("status") or "").strip().lower() != str(status).strip().lower():
                    continue
                items.append(dict(row))
            items.sort(
                key=lambda row: (
                    row.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
                    str(row.get("id") or ""),
                ),
                reverse=True,
            )
            return items[: max(1, int(limit or 100))]

        def _lookup_run_snapshot(run_id: str) -> Dict[str, Any]:
            live_run = live_runs.get(run_id)
            if isinstance(live_run, dict):
                return runs_output._serialize_run_snapshot(run_id, live_run)
            with run_history_lock:
                for item in run_history:
                    if str(item.get("run_id") or "").strip() == str(run_id).strip():
                        return dict(item)
            raise runtime_runs_api.HTTPException(status_code=404, detail="Run not found")

        def _iter_known_run_snapshots() -> List[Dict[str, Any]]:
            with run_history_lock:
                history_items = list(run_history)
            return run_service.iter_known_run_snapshots(
                runs_by_id=live_runs,
                run_history=history_items,
                serialize_run_snapshot_fn=runs_output._serialize_run_snapshot,
            )

        def _find_run_relationships(target_run_id: str, snapshot: Dict[str, Any]):
            return run_service.find_run_relationships(
                target_run_id,
                snapshot,
                extract_run_relationships_from_context_fn=runs_delegation._extract_run_relationships_from_context,
                iter_known_run_snapshots_fn=_iter_known_run_snapshots,
                normalize_run_id_token=runs_delegation._normalize_run_id_token,
                build_run_relation_summary_fn=lambda item: run_service.build_run_relation_summary(
                    item,
                    agent_workspace_labels=runs_delegation.AGENT_WORKSPACE_LABELS,
                ),
                parse_utc_ts=runtime_common._parse_utc_ts,
            )

        def _refresh_archived_run_snapshot(run_id: str, run: Dict[str, Any]) -> None:
            snapshot = runs_output._serialize_run_snapshot(run_id, run)
            with run_history_lock:
                for idx, item in enumerate(run_history):
                    if str(item.get("run_id") or "").strip() == run_id:
                        run_history[idx] = snapshot
                        break

        def _upsert_run_history_snapshot(snapshot: Dict[str, Any]) -> None:
            run_id = str(snapshot.get("run_id") or "").strip()
            if not run_id:
                return
            with run_history_lock:
                for idx, item in enumerate(run_history):
                    if str(item.get("run_id") or "").strip() == run_id:
                        run_history[idx] = dict(snapshot)
                        break
                else:
                    run_history.insert(0, dict(snapshot))

        def _refresh_parent_state(parent_run_id: str, *, triggering_run_id: Optional[str] = None):
            return run_service.refresh_parent_delegation_state(
                parent_run_id,
                lookup_run_snapshot_fn=_lookup_run_snapshot,
                find_run_relationships_fn=_find_run_relationships,
                timeout_stale_child_runs_fn=lambda _parent, _children: [],
                schedule_auto_retry_for_failed_children_fn=lambda _snapshot, _children, triggering_run_id=None: set(),
                build_delegation_summary_fn=lambda snapshot, child_runs, extra_retry_pending_lineages=None: run_service.build_delegation_summary(
                    snapshot,
                    child_runs,
                    normalize_run_id_token=runs_delegation._normalize_run_id_token,
                    normalize_agent_role=runs_delegation.normalize_agent_role,
                    parse_utc_ts=runtime_common._parse_utc_ts,
                    terminal_run_statuses=runs_delegation.TERMINAL_RUN_STATUSES,
                    agent_workspace_labels=runs_delegation.AGENT_WORKSPACE_LABELS,
                    child_lineage_key=runs_delegation._child_lineage_key,
                    failure_status=runs_delegation._failure_status,
                    parent_pending_retry_lineages=lambda _run_id: set(),
                    extra_retry_pending_lineages=extra_retry_pending_lineages,
                ),
                runs_by_id=live_runs,
                refresh_archived_run_snapshot_fn=_refresh_archived_run_snapshot,
                upsert_run_history_snapshot_fn=_upsert_run_history_snapshot,
                emit_log_fn=_emit_log,
                utc_now_iso_fn=_next_iso,
                triggering_run_id=triggering_run_id,
            )

        def _enforce_owner_access(current_user: Any, payload: Any) -> None:
            return runtime_run_access_service.enforce_run_owner_access(
                current_user,
                payload,
                current_user_is_privileged_fn=lambda _user: False,
                extract_run_owner_user_id_fn=runtime_run_access_service.extract_run_owner_user_id,
            )

        def _run_async(coroutine):
            return asyncio.run(coroutine)

        async def _get_session(session_id: str):
            return {
                "session_id": session_id,
                "workspace_id": "default",
                "tenant_id": "default",
                "status": "active",
            }

        async def _extend_session(session_id: str):
            return None

        async def _ensure_master_thread(**kwargs):
            return None

        async def _record_user_turn(**kwargs):
            return None

        async def _record_assistant_turn(**kwargs):
            return None

        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.require_member_api_key = object()
        fake_server.require_viewer_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = live_runs
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = _lookup_run_snapshot
        fake_server.Depends = lambda dependency: dependency
        fake_server.EventSourceResponse = object
        fake_server.Optional = Optional
        fake_server.HTTPException = RuntimeError
        fake_server.CHANNEL_EVENTS = channel_events
        fake_server.CHANNEL_EVENTS_LOCK = threading.Lock()
        fake_server.ORION_CHANNEL_SESSIONS_LIMIT = 50
        fake_server.ORION_CHANNEL_DEAD_LETTER_FILE = "dead_letters.json"
        fake_server.ORION_CHANNEL_DEAD_LETTER_LIMIT = 10
        fake_server.ORION_RUNTIME_STATE_DB = "runtime-state.sqlite3"
        fake_server._safe_read_json = lambda path, fallback: fallback
        fake_server._normalize_workspace_id = lambda value: str(value or "default").strip() or "default"
        fake_server._channel_event_matches = lambda item, **kwargs: (
            (not kwargs.get("workspace_id") or str(item.get("workspace_id") or "") == str(kwargs["workspace_id"]))
            and (not kwargs.get("tenant_id") or str(item.get("tenant_id") or "") == str(kwargs["tenant_id"]))
            and (not kwargs.get("run_id") or str(item.get("run_id") or "") == str(kwargs["run_id"]))
            and (not kwargs.get("action") or str(item.get("action") or "").lower() == str(kwargs["action"]).lower())
        )
        fake_server._summarize_channel_sessions = lambda items, limit=None: [{"session_key": "run:session"}] if items else []
        fake_server._iter_channel_events_stream = lambda **kwargs: iter([])

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server

        run_execution_services = run_service.build_run_execution_services(
            stamp_request_owner=runtime_run_access_service.stamp_request_owner,
            prepare_run_start_request=runs_core._prepare_run_start_request,
            create_run_from_request=_create_run_from_request,
        )

        turn_body = {
            "workspace_id": "default",
            "session_id": "session-1",
            "channel": "web",
            "actor": {"type": "user", "id": "user-1"},
            "message": "Research AI agent orchestration and draft a summary.",
            "execution_mode": "durable",
            "response_mode": "artifact",
            "context_hints": {
                "agent_role": "orchestrator",
                "metadata": {
                    "agent_role": "orchestrator",
                    "approval_ttl_seconds": 300,
                },
            },
        }

        with contextlib.ExitStack() as stack:
            stack.enter_context(
                patch.object(
                    runtime_runs_api.runtime_route_registration_service,
                    "register_runtime_run_routes_from_api",
                    side_effect=lambda *args, **kwargs: None,
                )
            )
            stack.enter_context(patch.object(runtime_runs_api, "_refresh_server_exports", side_effect=lambda: fake_server))
            stack.enter_context(
                patch.object(
                    runtime_runs_api,
                    "_late_server_export",
                    side_effect=lambda name: {
                        "runs": live_runs,
                        "RUN_HISTORY_LOCK": run_history_lock,
                        "RUN_HISTORY": run_history,
                        "_serialize_run_snapshot": runs_output._serialize_run_snapshot,
                        "_history_item_matches": runs_output._history_item_matches,
                        "_summarize_history_item": runs_output._summarize_history_item,
                        "_parse_utc_ts": runtime_common._parse_utc_ts,
                    }[name],
                )
            )
            stack.enter_context(patch.object(runtime_runs_api, "_run_execution_services", side_effect=lambda: run_execution_services))
            stack.enter_context(patch.object(runtime_runs_api, "_direct_chat_execution_services", side_effect=lambda: object()))
            stack.enter_context(
                patch.object(run_service, "decide_execution_target", side_effect=lambda metadata: {"selected": "cloud"})
            )
            stack.enter_context(
                patch.object(
                    run_service,
                    "apply_execution_route_metadata",
                    side_effect=lambda metadata, route: {
                        **dict(metadata),
                        "execution_target_requested": str(dict(metadata).get("execution_target") or "auto"),
                        "execution_target_selected": route["selected"],
                    },
                )
            )
            stack.enter_context(
                patch.object(
                    run_service,
                    "build_doctor_run_gate_live",
                    new=AsyncMock(return_value={"blocking": False, "title": "ok"}),
                )
            )
            stack.enter_context(
                patch.object(runtime_runs_api.run_state_repository, "sync_list_live_runs", side_effect=lambda: list(live_runs.values()))
            )
            stack.enter_context(patch.object(runtime_runs_api, "_current_user_is_privileged", side_effect=lambda current_user: False))
            stack.enter_context(
                patch.object(
                    runtime_runs_api,
                    "_extract_run_owner_user_id",
                    side_effect=runtime_run_access_service.extract_run_owner_user_id,
                )
            )
            stack.enter_context(patch.object(runs_core, "runs", live_runs))
            stack.enter_context(patch.object(runs_core, "create_run", side_effect=_custom_create_run, create=True))
            stack.enter_context(
                patch.object(
                    runs_core,
                    "_compute_tool_policy_precheck",
                    side_effect=lambda context: {
                        "blocked": [],
                        "blocked_count": 0,
                        "allowed": [],
                        "allow_count": 0,
                        "items": [],
                        "require_confirmation": [],
                        "require_confirmation_count": 0,
                        "approval_required": [],
                        "approval_required_count": 0,
                        "capability_ids": [],
                    },
                    create=True,
                )
            )
            stack.enter_context(
                patch.object(
                    runs_core,
                    "_bind_obvious_connector_write_intent",
                    side_effect=lambda req, metadata: dict(metadata),
                )
            )
            stack.enter_context(patch.object(runs_core, "decide_execution_target", side_effect=lambda metadata, schedule_id=None: {"selected": "cloud"}))
            stack.enter_context(
                patch.object(
                    runs_core,
                    "apply_execution_route_metadata",
                    side_effect=lambda metadata, route: {
                        **dict(metadata),
                        "execution_target_requested": str(dict(metadata).get("execution_target") or "auto"),
                        "execution_target_selected": route["selected"],
                    },
                )
            )
            stack.enter_context(
                patch.object(
                    runs_core,
                    "build_doctor_run_gate_from_snapshot",
                    side_effect=lambda execution_target, metadata, provider, credential_id: {"blocking": False, "title": "ok"},
                )
            )
            stack.enter_context(
                patch.object(
                    runs_core,
                    "resolve_runtime_policy_mode",
                    side_effect=lambda metadata, selected_target=None: {"policy_mode": "default"},
                )
            )
            stack.enter_context(patch.object(runs_core, "agent_machine_full_trust_enabled", side_effect=lambda owner_user_id: False))
            stack.enter_context(
                patch.object(runs_core, "agent_machine_inherited_owner_user_id", side_effect=lambda owner_user_id: owner_user_id)
            )
            stack.enter_context(patch.object(runtime_runs_api.session_service, "get_session", side_effect=_get_session))
            stack.enter_context(patch.object(runtime_runs_api.session_service, "extend_session", side_effect=_extend_session))
            stack.enter_context(patch.object(runtime_runs_api.thread_service, "ensure_master_thread", side_effect=_ensure_master_thread))
            stack.enter_context(patch.object(runtime_runs_api.thread_service, "record_user_turn", side_effect=_record_user_turn))
            stack.enter_context(patch.object(runtime_runs_api.thread_service, "record_assistant_turn", side_effect=_record_assistant_turn))
            stack.enter_context(
                patch.object(
                    run_state_repository,
                    "sync_persist_outbox_event",
                    side_effect=_persist_outbox_event,
                )
            )
            stack.enter_context(patch.object(notification_service, "_ensure_runtime_state_db", side_effect=lambda db_path=None: "runtime-db"))
            stack.enter_context(
                patch.object(
                    notification_service.runtime_state_store,
                    "upsert_notification",
                    side_effect=lambda runtime_db, notification: notification_rows.append(dict(notification)),
                )
            )
            stack.enter_context(
                patch.object(
                    notification_service.runtime_state_store,
                    "list_notifications",
                    side_effect=lambda runtime_db, **kwargs: [dict(item) for item in notification_rows],
                )
            )
            stack.enter_context(
                patch.object(
                    notification_service.runtime_state_store,
                    "list_notifications_by_ids",
                    side_effect=lambda runtime_db, reader_key, notification_ids: [
                        dict(item)
                        for item in notification_rows
                        if str(item.get("id") or "").strip() in {
                            str(notification_id or "").strip()
                            for notification_id in (notification_ids or [])
                            if str(notification_id or "").strip()
                        }
                    ],
                )
            )
            stack.enter_context(
                patch.object(
                    notification_service,
                    "fanout_notification_push",
                    side_effect=lambda notification, **kwargs: {"device_count": 0, "delivered_count": 0},
                )
            )
            stack.enter_context(
                patch.object(
                    activity_ledger_service.control_plane_repository,
                    "append_activity_ledger_event",
                    side_effect=_append_activity_ledger_event,
                )
            )
            stack.enter_context(
                patch.object(
                    activity_ledger_service.control_plane_repository,
                    "list_activity_ledger_events",
                    side_effect=_list_activity_ledger_events,
                )
            )
            stack.enter_context(
                patch.object(
                    runs_delegation,
                    "_llm_auto_delegate_role",
                    side_effect=lambda **kwargs: None,
                )
            )

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)
            runtime_events_api.register_inbox_routes(app)

            turn_payload = _run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(turn_body),
                    turn_body,
                    current_user=_current_user(),
                )
            )
            parent_run_id = str(turn_payload.run_id or "").strip()
            self.assertEqual(turn_payload.status, "starting")
            self.assertTrue(parent_run_id)
            self.assertIn(parent_run_id, live_runs)

            auto_delegation = runtime_run_delegation_service.auto_delegate_run_children(
                parent_run_id,
                request_payload=_AutoDelegationPayload(max_children=1),
                current_user=_current_user(),
                lookup_run_snapshot=_lookup_run_snapshot,
                enforce_run_owner_access=_enforce_owner_access,
                normalize_agent_role=runs_delegation.normalize_agent_role,
                build_auto_delegation_plan=runs_delegation._build_auto_delegation_plan,
                emit_auto_delegation_routing_log=lambda parent_run_id, plan, strategy, reason: run_service.emit_auto_delegation_routing_log(
                    parent_run_id,
                    plan,
                    runs_by_id=live_runs,
                    emit_log_fn=_emit_log,
                    strategy=strategy,
                    reason=reason,
                ),
                build_delegated_run_request=lambda parent_snapshot, child, note=None: run_service.build_delegated_child_run_request(
                    parent_snapshot,
                    child,
                    normalize_run_id_token=runs_delegation._normalize_run_id_token,
                    normalize_agent_role=runs_delegation.normalize_agent_role,
                    normalize_requested_max_iterations=runs_delegation._normalize_requested_max_iterations,
                    valid_execution_targets=runs_delegation.VALID_EXECUTION_TARGETS,
                    note=note,
                ),
                execute_system_run_start_request_via_turn_runtime=execute_system_run_start_request_via_turn_runtime,
                stamp_request_owner_fn=runtime_run_access_service.stamp_request_owner,
                run_execution_services=lambda: run_execution_services,
                normalize_run_id_token=runs_delegation._normalize_run_id_token,
                refresh_parent_delegation_state=_refresh_parent_state,
            )

            self.assertEqual(auto_delegation["count"], 1)
            child_run_id = str(auto_delegation["items"][0]["run_id"] or "").strip()
            self.assertTrue(child_run_id)
            self.assertIn(child_run_id, live_runs)

            child_run = live_runs[child_run_id]
            child_run["result"] = "Research summary: Empyralis can route Sage work into scoped specialists."
            child_run["result_data"] = {
                "summary": "Research summary: Empyralis can route Sage work into scoped specialists.",
                "outputs": {
                    "artifacts": [
                        {
                            "kind": "text",
                            "path": "artifacts/research-summary.md",
                            "title": "Research summary",
                            "text": "Empyralis can route Sage work into scoped specialists.",
                        }
                    ]
                },
            }
            run_service.transition_live_run_status(
                child_run_id,
                "completed",
                run=child_run,
                now_mono=123.0,
                now_iso=_next_iso(),
                terminal_statuses={"completed", "failed", "timeout", "stopped", "cancelled"},
                local_queue_lock=threading.Lock(),
                local_pending_run_ids=[],
                local_claimed_runs={},
                archive_run_if_terminal_fn=_archive_run_if_terminal,
                remove_live_run_state_fn=_remove_live_run_state,
                sync_local_runtime_state_snapshot_fn=lambda: None,
                persist_live_run_state_fn=_persist_live_run_state,
                run_queue_index=run_queue_index,
                metrics_add_fn=lambda *args, **kwargs: None,
                metrics_inc_fn=lambda *args, **kwargs: None,
                parent_run_id=parent_run_id,
                refresh_parent_delegation_state_fn=_refresh_parent_state,
            )

            pending_confirmation = run_service.begin_run_pending_confirmation(
                parent_run_id,
                "Approve sending the summary by email.",
                runs_by_id=live_runs,
                default_approval_ttl_seconds=300,
                approval_correlation_id_fn=lambda approval_id, run_id=None: f"corr-{approval_id}",
                append_approval_audit_fn=lambda **kwargs: approval_audit.append(dict(kwargs)),
                json_safe_fn=lambda value: value,
                emit_log_fn=_emit_log,
                set_run_status_fn=_set_live_status,
                utc_now_fn=_next_dt,
                utc_now_iso_fn=_next_iso,
                source="golden_path_smoke",
                metadata={
                    "kind": "email_review",
                    "target": "email",
                    "approval_actions": ["send_email"],
                },
            )
            self.assertEqual(pending_confirmation["status"], "waiting")

            delivery = outbox_service.deliver_due_outbox_events_once(
                list_undelivered_outbox_events_fn=_list_undelivered_outbox_events,
                mark_outbox_event_delivered_fn=_mark_outbox_event_delivered,
                record_outbox_delivery_failure_fn=_record_outbox_delivery_failure,
                get_outbox_delivery_status_fn=_get_outbox_delivery_status,
                deliver_event_fn=lambda event: outbox_service.deliver_outbox_event(
                    event,
                    append_channel_event_item_fn=_append_channel_event_item,
                ),
            )
            self.assertGreaterEqual(delivery["attempted"], 3)
            self.assertEqual(delivery["status"]["undelivered_count"], 0)

            runs_payload = _run_async(
                app.routes[("GET", "/runs")](
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )
            approvals_payload = _run_async(
                app.routes[("GET", "/approvals")](
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )
            timeline_payload = _run_async(
                app.routes[("GET", "/activity/timeline")](
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )
            notifications_payload = _run_async(
                app.routes[("GET", "/notifications")](
                    tenant_id="default",
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )

            run_items = {
                str(item.get("run_id") or "").strip(): item
                for item in runs_payload["items"]
                if isinstance(item, dict) and str(item.get("run_id") or "").strip()
            }
            child_item = run_items[child_run_id]
            parent_item = run_items[parent_run_id]

            self.assertEqual(child_item["source"], "history")
            self.assertEqual(child_item["agent_role"], "research")
            self.assertIn("scoped specialists", str(child_item.get("result_summary") or ""))
            self.assertEqual(parent_item["source"], "live")
            self.assertEqual(parent_item["status"], "waiting_for_input")

            self.assertEqual(approvals_payload["count"], 1)
            self.assertEqual(approvals_payload["items"][0]["run_id"], parent_run_id)
            self.assertEqual(approvals_payload["items"][0]["action"], "email_review")
            self.assertEqual(approvals_payload["items"][0]["actions"], ["send_email"])
            self.assertEqual(notifications_payload["count"], 3)
            notification_actions = {str(item.get("action") or "").strip() for item in notifications_payload["items"]}
            self.assertIn("artifact_created", notification_actions)
            self.assertIn("approval_requested", notification_actions)

            timeline_items = list(timeline_payload["items"])
            timeline_classes = {str(item.get("event_class") or "").strip() for item in timeline_items}
            self.assertIn("artifact_created", timeline_classes)
            self.assertIn("approval", timeline_classes)
            artifact_item = next(item for item in timeline_items if str(item.get("event_class") or "").strip() == "artifact_created")
            self.assertEqual(artifact_item["run_id"], child_run_id)
            self.assertEqual(artifact_item["artifacts"][0]["path"], "artifacts/research-summary.md")
            self.assertEqual(artifact_item["artifacts"][0]["label"], "Research summary")

            child_snapshot = next(
                item
                for item in run_history
                if str(item.get("run_id") or "").strip() == child_run_id
            )
            self.assertEqual(child_snapshot["owner_user_id"], "user-1")
            self.assertEqual(child_snapshot["parent_run_id"], parent_run_id)
            self.assertEqual(child_snapshot["status"], "completed")

            parent_run_record = live_runs[parent_run_id]
            with patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_find_live_run_by_approval_id",
                return_value={"run_id": parent_run_id, **parent_run_record},
            ):
                approval_resolution = runtime_run_approval_service.resolve_standalone_approval(
                    approvals_payload["items"][0]["approval_id"],
                    payload={
                        "approval_id": approvals_payload["items"][0]["approval_id"],
                        "resolution": "approved",
                        "actor": "user",
                        "reason": "Ready to send.",
                    },
                    current_user=_current_user(),
                    runs=live_runs,
                    resolve_run_approval_fn=runtime_run_approval_service.resolve_run_approval,
                    resolve_run_approval_callbacks=runtime_run_approval_service.build_resolve_run_approval_callbacks(
                        serialize_run_snapshot=runs_output._serialize_run_snapshot,
                        enforce_run_owner_access=_enforce_owner_access,
                        get_pending_confirmation=run_service.get_pending_confirmation,
                        set_pending_confirmation=run_service.set_pending_confirmation,
                        clear_pending_confirmation=run_service.clear_pending_confirmation,
                        parse_utc_ts=runtime_common._parse_utc_ts,
                        utc_now=_next_dt,
                        utc_now_iso=_next_iso,
                        approval_correlation_id=lambda approval_id, run_id=None: f"corr-{approval_id}",
                        append_approval_audit=lambda **kwargs: approval_audit.append(dict(kwargs)),
                        resolve_local_execution_start_approval=lambda *args, **kwargs: {},
                        resolve_local_worker_recovery_approval=lambda *args, **kwargs: {},
                        run_thread_is_alive=lambda run: False,
                        emit_log=_emit_log,
                        schedule_restored_run_resume=lambda run_id, run: True,
                    ),
                    record_approval_resolution_fn=lambda *args, **kwargs: None,
                    emit_approval_resolved_event_fn=outbox_service.emit_approval_resolved_event,
                    resume_run_after_persist_fn=lambda run_id, run: True,
                )
            self.assertEqual(approval_resolution["resolution"], "approved")

            parent_run_record["result"] = "Summary approved and email delivery can continue."
            parent_run_record["result_data"] = {"summary": "Summary approved and email delivery can continue."}
            run_service.transition_live_run_status(
                parent_run_id,
                "completed",
                run=parent_run_record,
                now_mono=124.0,
                now_iso=_next_iso(),
                terminal_statuses={"completed", "failed", "timeout", "stopped", "cancelled"},
                local_queue_lock=threading.Lock(),
                local_pending_run_ids=[],
                local_claimed_runs={},
                archive_run_if_terminal_fn=_archive_run_if_terminal,
                remove_live_run_state_fn=_remove_live_run_state,
                sync_local_runtime_state_snapshot_fn=lambda: None,
                persist_live_run_state_fn=_persist_live_run_state,
                run_queue_index=run_queue_index,
                metrics_add_fn=lambda *args, **kwargs: None,
                metrics_inc_fn=lambda *args, **kwargs: None,
                parent_run_id=None,
                refresh_parent_delegation_state_fn=_refresh_parent_state,
            )

            second_delivery = outbox_service.deliver_due_outbox_events_once(
                list_undelivered_outbox_events_fn=_list_undelivered_outbox_events,
                mark_outbox_event_delivered_fn=_mark_outbox_event_delivered,
                record_outbox_delivery_failure_fn=_record_outbox_delivery_failure,
                get_outbox_delivery_status_fn=_get_outbox_delivery_status,
                deliver_event_fn=lambda event: outbox_service.deliver_outbox_event(
                    event,
                    append_channel_event_item_fn=_append_channel_event_item,
                ),
            )
            self.assertGreaterEqual(second_delivery["attempted"], 2)
            self.assertEqual(second_delivery["status"]["undelivered_count"], 0)

            approvals_after = _run_async(
                app.routes[("GET", "/approvals")](
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )
            runs_after = _run_async(
                app.routes[("GET", "/runs")](
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )
            timeline_after = _run_async(
                app.routes[("GET", "/activity/timeline")](
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )
            notifications_after = _run_async(
                app.routes[("GET", "/notifications")](
                    tenant_id="default",
                    workspace_id="default",
                    current_user=_current_user(),
                )
            )

            self.assertEqual(approvals_after["count"], 0)
            parent_after = next(item for item in runs_after["items"] if str(item.get("run_id") or "").strip() == parent_run_id)
            self.assertEqual(parent_after["status"], "completed")
            self.assertEqual(parent_after["source"], "history")
            self.assertIn("Summary approved", str(parent_after.get("result_summary") or ""))

            timeline_after_items = list(timeline_after["items"])
            approval_resolved_item = next(
                item
                for item in timeline_after_items
                if str(item.get("action") or "").strip() == "approval_approved"
            )
            run_completed_item = next(
                item
                for item in timeline_after_items
                if str(item.get("action") or "").strip() == "run_completed"
            )
            self.assertEqual(approval_resolved_item["status"], "approved")
            self.assertEqual(run_completed_item["status"], "completed")
            self.assertEqual(run_completed_item["run_id"], parent_run_id)

            notification_actions_after = {str(item.get("action") or "").strip() for item in notifications_after["items"]}
            self.assertIn("approval_approved", notification_actions_after)
            self.assertIn("run_completed", notification_actions_after)
        if previous_server is None:
            sys.modules.pop("server", None)
        else:
            sys.modules["server"] = previous_server


if __name__ == "__main__":
    unittest.main()
