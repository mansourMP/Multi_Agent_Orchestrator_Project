import asyncio
import queue
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from server_modules.agent_trace_service import TraceContext
from server_modules import runtime_run_approval_service


class _Payload:
    def __init__(self, decision: str, note: str = "") -> None:
        self.decision = decision
        self.note = note


class RuntimeRunApprovalServiceTests(unittest.TestCase):
    def test_build_resolve_run_approval_callbacks_includes_resume_fields(self):
        callbacks = runtime_run_approval_service.build_resolve_run_approval_callbacks(
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda run: None,
            set_pending_confirmation=lambda run, pending: None,
            clear_pending_confirmation=lambda run: None,
            parse_utc_ts=lambda value: None,
            utc_now=lambda: None,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
            append_approval_audit=lambda **kwargs: None,
            resolve_local_execution_start_approval=lambda *args, **kwargs: {},
            resolve_local_worker_recovery_approval=lambda *args, **kwargs: {},
            run_thread_is_alive=lambda run: False,
            emit_log=lambda *args, **kwargs: None,
            schedule_restored_run_resume=lambda run_id, run: True,
        )

        self.assertIn("serialize_run_snapshot", callbacks)
        self.assertIn("set_pending_confirmation", callbacks)
        self.assertIn("schedule_restored_run_resume", callbacks)

    def test_submit_run_decision_queues_plain_decision_without_pending_approval(self):
        run = {"input_queue": queue.Queue()}

        payload = runtime_run_approval_service.submit_run_decision(
            "run-1",
            run=run,
            payload=_Payload("proceed"),
            current_user={"user_id": "user-1"},
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda run: None,
            approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
            append_approval_audit=lambda **kwargs: None,
            resolve_local_execution_start_approval=lambda *args, **kwargs: {},
        )

        self.assertEqual(payload, {"status": "ok", "approval_id": None})
        self.assertEqual(run["input_queue"].get_nowait(), "proceed")

    def test_resolve_run_approval_rejects_mismatched_pending_approval(self):
        with self.assertRaises(HTTPException):
            runtime_run_approval_service.resolve_run_approval(
                "run-1",
                "approval-2",
                run={"input_queue": queue.Queue()},
                payload=_Payload("approve"),
                current_user={"user_id": "user-1"},
                serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                get_pending_confirmation=lambda run: {"approval_id": "approval-1"},
                set_pending_confirmation=lambda run, pending: None,
                clear_pending_confirmation=lambda run: None,
                parse_utc_ts=lambda value: None,
                utc_now=lambda: None,
                utc_now_iso=lambda: "2026-04-05T00:00:00Z",
                approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
                append_approval_audit=lambda **kwargs: None,
                resolve_local_execution_start_approval=lambda *args, **kwargs: {},
                resolve_local_worker_recovery_approval=lambda *args, **kwargs: {},
                run_thread_is_alive=lambda run: False,
                emit_log=lambda *args, **kwargs: None,
                schedule_restored_run_resume=lambda run_id, run: True,
            )

    def test_resolve_run_approval_marks_pending_and_schedules_resume_for_restored_run(self):
        run = {
            "status": "waiting_for_input",
            "logs": object(),
            "input_queue": queue.Queue(),
            "context": {"metadata": {}},
        }
        pending_updates = []
        scheduled = []

        payload = runtime_run_approval_service.resolve_run_approval(
            "run-1",
            "approval-1",
            run=run,
            payload=_Payload("approve", "ok"),
            current_user={"user_id": "user-1"},
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda run: {"approval_id": "approval-1", "correlation_id": "corr-1"},
            set_pending_confirmation=lambda run, pending: pending_updates.append(dict(pending)),
            clear_pending_confirmation=lambda run: None,
            parse_utc_ts=lambda value: None,
            utc_now=lambda: None,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
            append_approval_audit=lambda **kwargs: None,
            resolve_local_execution_start_approval=lambda *args, **kwargs: {},
            resolve_local_worker_recovery_approval=lambda *args, **kwargs: {},
            run_thread_is_alive=lambda run: False,
            emit_log=lambda *args, **kwargs: None,
            schedule_restored_run_resume=lambda run_id, run: scheduled.append(run_id) or True,
        )

        self.assertEqual(payload["decision_kind"], "approved")
        self.assertEqual(scheduled, ["run-1"])
        self.assertEqual(pending_updates[0]["status"], "decision_submitted")
        self.assertEqual(pending_updates[-1]["status"], "resolved")

    def test_resolve_run_approval_emits_trace_resolution_event(self):
        run = {
            "run_id": "run-1",
            "status": "waiting_for_input",
            "logs": object(),
            "input_queue": queue.Queue(),
            "context": {"workspace_id": "ws-1", "tenant_id": "tenant-1", "metadata": {"trace_id": "trace-1"}},
        }
        trace_context = TraceContext(
            trace_id="trace-1",
            workspace_id="ws-1",
            tenant_id="tenant-1",
            thread_id="thread-1",
            run_id="run-1",
            root_agent_id="sage",
        )

        with patch("server_modules.runtime_run_approval_service.run_async_tool_call", side_effect=lambda coro: asyncio.run(coro)), patch(
            "server_modules.runtime_run_approval_service.agent_trace_service.resume_trace",
            new=AsyncMock(return_value=trace_context),
        ), patch(
            "server_modules.runtime_run_approval_service.agent_trace_service.emit_approval_resolved",
            new=AsyncMock(return_value="evt-approval-resolved"),
        ) as emit_resolved_mock:
            payload = runtime_run_approval_service.resolve_run_approval(
                "run-1",
                "approval-1",
                run=run,
                payload=_Payload("approve", "ok"),
                current_user={"user_id": "user-1"},
                serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                get_pending_confirmation=lambda run: {"approval_id": "approval-1", "correlation_id": "corr-1"},
                set_pending_confirmation=lambda run, pending: None,
                clear_pending_confirmation=lambda run: None,
                parse_utc_ts=lambda value: None,
                utc_now=lambda: None,
                utc_now_iso=lambda: "2026-04-05T00:00:00Z",
                approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
                append_approval_audit=lambda **kwargs: None,
                resolve_local_execution_start_approval=lambda *args, **kwargs: {},
                resolve_local_worker_recovery_approval=lambda *args, **kwargs: {},
                run_thread_is_alive=lambda run: False,
                emit_log=lambda *args, **kwargs: None,
                schedule_restored_run_resume=lambda run_id, run: True,
            )

        self.assertEqual(payload["decision_kind"], "approved")
        emit_resolved_mock.assert_awaited_once()

    def test_resolve_run_approval_uses_local_worker_recovery_resolver_for_degraded_resume(self):
        calls = []
        run = {
            "status": "waiting_for_input",
            "logs": object(),
            "input_queue": queue.Queue(),
            "context": {"metadata": {}},
        }

        payload = runtime_run_approval_service.resolve_run_approval(
            "run-1",
            "approval-1",
            run=run,
            payload=_Payload("approve", "ok"),
            current_user={"user_id": "user-1"},
            serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda run: {
                "approval_id": "approval-1",
                "correlation_id": "corr-1",
                "metadata": {"kind": "local_worker_recovery_resume"},
            },
            set_pending_confirmation=lambda run, pending: self.fail("special recovery resolver should own state"),
            clear_pending_confirmation=lambda run: None,
            parse_utc_ts=lambda value: None,
            utc_now=lambda: None,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
            append_approval_audit=lambda **kwargs: None,
            resolve_local_execution_start_approval=lambda *args, **kwargs: self.fail("should not call local execution approval"),
            resolve_local_worker_recovery_approval=lambda *args, **kwargs: calls.append((args, kwargs)) or {"status": "ok", "decision_kind": "approved"},
            run_thread_is_alive=lambda run: False,
            emit_log=lambda *args, **kwargs: None,
            schedule_restored_run_resume=lambda run_id, run: True,
        )

        self.assertEqual(payload["decision_kind"], "approved")
        self.assertEqual(calls[0][0][0], "run-1")
        self.assertEqual(calls[0][0][2], "approval-1")

    def test_resolve_standalone_approval_records_postgres_resolution_and_outbox_event(self):
        recorded = []
        emitted = []
        run_record = {
            "run_id": "run-1",
            "status": "waiting_for_input",
            "context": {
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "metadata": {
                    "trace_id": "trace-1",
                    "browser_session_profile": "qa-browser",
                    "browser_immutable_plan_hash": "hash-1",
                    "browser_reviewed_approval_required": True,
                },
            },
            "pending_confirmation": {"approval_id": "approval-1", "correlation_id": "corr-1"},
        }
        live_run = dict(run_record)
        live_run["logs"] = object()
        live_run["input_queue"] = queue.Queue()

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value={"approval_id": "approval-1", "run_id": "run-1"},
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_live_run",
            return_value=run_record,
        ):
            payload = runtime_run_approval_service.resolve_standalone_approval(
                "approval-1",
                payload={"approval_id": "approval-1", "resolution": "approved", "actor": "user-1", "reason": "ok"},
                current_user={"user_id": "user-1"},
                runs={"run-1": live_run},
                resolve_run_approval_fn=lambda run_id, approval_id, **kwargs: {"status": "ok", "run_id": run_id, "approval_id": approval_id},
                resolve_run_approval_callbacks={},
                record_approval_resolution_fn=lambda *args: recorded.append(args),
                emit_approval_resolved_event_fn=lambda **kwargs: emitted.append(kwargs)
                or type(
                    "Event",
                    (),
                    {
                        "event_id": "evt-1",
                        "event_type": "approval_resolved",
                        "trace_id": "trace-1",
                        "payload": kwargs,
                    },
                )(),
            )

        self.assertEqual(payload["run_id"], "run-1")
        self.assertEqual(payload["resolution"], "approved")
        self.assertEqual(recorded[0][:3], ("run-1", "approval-1", "approved"))
        self.assertEqual(emitted[0]["approval_id"], "approval-1")
        self.assertEqual(emitted[0]["metadata"]["browser_session_profile"], "qa-browser")

    def test_resolve_standalone_approval_does_not_leak_resolution_guards(self):
        runtime_run_approval_service._APPROVAL_RESOLUTION_GUARDS.clear()
        runtime_run_approval_service._APPROVAL_RESOLUTION_GUARD_REFS.clear()
        resolved = {
            "approval_id": "approval-1",
            "status": "approved",
        }

        def approval_record(approval_id: str):
            return {
                "approval_id": approval_id,
                "run_id": f"run-{approval_id}",
                "trace_id": f"trace-{approval_id}",
                "metadata": {"source_type": "deployed_agent", "tenant_id": "tenant-1", "workspace_id": "ws-1"},
            }

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            side_effect=approval_record,
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_resolve_approval_if_pending",
            return_value=resolved,
        ):
            for approval_id in ("approval-1", "approval-2", "approval-3"):
                runtime_run_approval_service.resolve_standalone_approval(
                    approval_id,
                    payload={"approval_id": approval_id, "resolution": "approved", "actor": "user-1", "reason": "ok"},
                    current_user={"user_id": "user-1"},
                    runs={},
                    resolve_run_approval_fn=lambda *args, **kwargs: self.fail("standalone deployed-agent path should not need live run"),
                    resolve_run_approval_callbacks={},
                    record_approval_resolution_fn=lambda *args: None,
                    emit_approval_resolved_event_fn=lambda **kwargs: {"event_id": "evt-1", "payload": kwargs},
                )

        self.assertEqual(runtime_run_approval_service._APPROVAL_RESOLUTION_GUARDS, {})
        self.assertEqual(runtime_run_approval_service._APPROVAL_RESOLUTION_GUARD_REFS, {})

    def test_resolve_standalone_approval_falls_back_to_live_memory_when_repository_misses(self):
        recorded = []
        live_run = {
            "run_id": "run-memory",
            "status": "waiting_for_input",
            "context": {"workspace_id": "ws-1", "tenant_id": "tenant-1", "metadata": {"trace_id": "trace-1"}},
            "pending_confirmation": {"approval_id": "approval-memory", "correlation_id": "corr-memory"},
            "logs": object(),
            "input_queue": queue.Queue(),
        }

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value=None,
        ):
            payload = runtime_run_approval_service.resolve_standalone_approval(
                "approval-memory",
                payload={"approval_id": "approval-memory", "resolution": "approved", "actor": "user-1", "reason": "ok"},
                current_user={"user_id": "user-1"},
                runs={"run-memory": live_run},
                resolve_run_approval_fn=lambda run_id, approval_id, **kwargs: {"status": "ok", "run_id": run_id, "approval_id": approval_id},
                resolve_run_approval_callbacks={},
                record_approval_resolution_fn=lambda *args: recorded.append(args),
                emit_approval_resolved_event_fn=lambda **kwargs: type(
                    "Event",
                    (),
                    {
                        "event_id": "evt-memory",
                        "event_type": "approval_resolved",
                        "trace_id": "trace-1",
                        "payload": kwargs,
                    },
                )(),
            )

        self.assertEqual(payload["run_id"], "run-memory")
        self.assertEqual(recorded[0][:3], ("run-memory", "approval-memory", "approved"))

    def test_resolve_standalone_approval_falls_back_to_repository_live_run_record_when_route_runs_missing(self):
        recorded = []
        run_record = {
            "run_id": "run-repo",
            "status": "waiting_for_input",
            "context": {"workspace_id": "ws-1", "tenant_id": "tenant-1", "metadata": {"trace_id": "trace-1"}},
            "pending_confirmation": {"approval_id": "approval-repo", "correlation_id": "corr-repo"},
        }
        restored_runs = {}

        with (
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_get_approval_record",
                return_value={"approval_id": "approval-repo", "run_id": "run-repo"},
            ),
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_get_live_run",
                return_value=run_record,
            ),
        ):
            payload = runtime_run_approval_service.resolve_standalone_approval(
                "approval-repo",
                payload={"approval_id": "approval-repo", "resolution": "approved", "actor": "user-1", "reason": "ok"},
                current_user={"user_id": "user-1"},
                runs={},
                resolve_run_approval_fn=lambda run_id, approval_id, **kwargs: restored_runs.setdefault("run", kwargs.get("run")) or {"status": "ok", "run_id": run_id, "approval_id": approval_id},
                resolve_run_approval_callbacks={
                    "ensure_live_run_handle": lambda run_id, run_record: {
                        **run_record,
                        "logs": object(),
                        "input_queue": queue.Queue(),
                    }
                },
                record_approval_resolution_fn=lambda *args: recorded.append(args),
                emit_approval_resolved_event_fn=lambda **kwargs: type(
                    "Event",
                    (),
                    {
                        "event_id": "evt-repo",
                        "event_type": "approval_resolved",
                        "trace_id": "trace-1",
                        "payload": kwargs,
                    },
                )(),
            )

        self.assertEqual(payload["run_id"], "run-repo")
        self.assertIsInstance(restored_runs.get("run"), dict)
        self.assertEqual(recorded[0][:3], ("run-repo", "approval-repo", "approved"))

    def test_resolve_standalone_approval_rejects_duplicate_submission_before_consumer_reads_queue(self):
        run = {
            "run_id": "run-1",
            "status": "waiting_for_input",
            "context": {"workspace_id": "default", "tenant_id": "default", "metadata": {}},
            "pending_confirmation": {"approval_id": "approval-1", "correlation_id": "corr-1"},
            "logs": object(),
            "input_queue": queue.Queue(),
        }
        callbacks = {
            "serialize_run_snapshot": lambda run_id, payload: dict(payload),
            "enforce_run_owner_access": lambda current_user, snapshot: None,
            "get_pending_confirmation": lambda payload: payload.get("pending_confirmation"),
            "set_pending_confirmation": lambda payload, pending: payload.__setitem__("pending_confirmation", dict(pending)),
            "clear_pending_confirmation": lambda payload: payload.__setitem__("pending_confirmation", None),
            "parse_utc_ts": lambda value: None,
            "utc_now": lambda: None,
            "utc_now_iso": lambda: "2026-04-11T00:00:00Z",
            "approval_correlation_id": lambda approval_id, run_id=None: "corr-1",
            "append_approval_audit": lambda **kwargs: None,
            "resolve_local_execution_start_approval": lambda *args, **kwargs: {},
            "resolve_local_worker_recovery_approval": lambda *args, **kwargs: {},
            "run_thread_is_alive": lambda payload: True,
            "emit_log": lambda *args, **kwargs: None,
            "schedule_restored_run_resume": lambda run_id, payload: True,
            "ensure_live_run_handle": lambda run_id, run_record: run,
        }

        with (
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_get_approval_record",
                return_value={"approval_id": "approval-1", "run_id": "run-1"},
            ),
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_resolve_approval_if_pending",
                side_effect=[
                    {"approval_id": "approval-1", "run_id": "run-1", "resolved_at": "2026-04-11T00:00:00Z"},
                    None,
                ],
            ),
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_create_or_update_approval_request",
                return_value={"approval_id": "approval-1", "run_id": "run-1", "status": "requested"},
            ),
        ):
            first = runtime_run_approval_service.resolve_standalone_approval(
                "approval-1",
                payload={"approval_id": "approval-1", "resolution": "approved", "actor": "user-a"},
                current_user={"user_id": "user-1"},
                runs={"run-1": run},
                resolve_run_approval_fn=runtime_run_approval_service.resolve_run_approval,
                resolve_run_approval_callbacks=callbacks,
                record_approval_resolution_fn=lambda *args: None,
                emit_approval_resolved_event_fn=lambda **kwargs: type(
                    "Event",
                    (),
                    {
                        "event_id": "evt-1",
                        "event_type": "approval_resolved",
                        "trace_id": "trace-1",
                        "payload": kwargs,
                    },
                )(),
            )

            self.assertEqual(first["resolution"], "approved")
            self.assertEqual(run["pending_confirmation"]["status"], "decision_submitted")
            self.assertEqual(run["input_queue"].qsize(), 1)

            with self.assertRaises(HTTPException) as exc:
                runtime_run_approval_service.resolve_standalone_approval(
                    "approval-1",
                    payload={"approval_id": "approval-1", "resolution": "approved", "actor": "user-b"},
                    current_user={"user_id": "user-1"},
                    runs={"run-1": run},
                    resolve_run_approval_fn=runtime_run_approval_service.resolve_run_approval,
                    resolve_run_approval_callbacks=callbacks,
                    record_approval_resolution_fn=lambda *args: None,
                    emit_approval_resolved_event_fn=lambda **kwargs: type(
                        "Event",
                        (),
                        {
                            "event_id": "evt-2",
                            "event_type": "approval_resolved",
                            "trace_id": "trace-2",
                            "payload": kwargs,
                        },
                    )(),
                )

            self.assertEqual(exc.exception.status_code, 409)
            self.assertEqual(run["input_queue"].qsize(), 1)

    def test_list_pending_approvals_payload_filters_by_workspace_owner_and_status(self):
        approvals = [
            {
                "approval_id": "approval-1",
                "run_id": "run-1",
                "workspace_id": "ws-1",
                "owner_user_id": "user-1",
                "owner_email": "user-1@example.com",
                "status": "requested",
                "prompt": "Approve email",
                "requested_at": "2026-04-12T10:00:00Z",
                "metadata": {
                    "approval_labels": ["email"],
                    "browser_session_profile": "qa-browser",
                    "browser_immutable_plan_hash": "hash-1",
                    "browser_reviewed_approval_required": True,
                    "browser_interactive_actions": ["click"],
                },
                "labels": ["email"],
            },
            {
                "approval_id": "approval-2",
                "run_id": "run-2",
                "workspace_id": "ws-2",
                "owner_user_id": "user-1",
                "status": "requested",
                "prompt": "Approve deploy",
            },
            {
                "approval_id": "approval-3",
                "run_id": "run-3",
                "workspace_id": "ws-1",
                "owner_user_id": "other-user",
                "status": "requested",
                "prompt": "Should not be visible",
            },
            {
                "approval_id": "approval-4",
                "run_id": "run-4",
                "workspace_id": "ws-1",
                "owner_user_id": "user-1",
                "status": "resolved",
                "prompt": "Already resolved",
            },
        ]

        payload = runtime_run_approval_service.list_pending_approvals_payload(
            workspace_id="ws-1",
            limit=10,
            current_user={"user_id": "user-1"},
            enforce_workspace_access_fn=lambda current_user, workspace_id, minimum_role="viewer": workspace_id,
            workspace_entitlement_payload_fn=lambda cache, workspace_id: {"capabilities": {"approvals_enabled": True}},
            current_user_is_privileged_fn=lambda current_user: False,
            extract_run_owner_user_id_fn=lambda run: str(run.get("context", {}).get("metadata", {}).get("owner_user_id") or ""),
            list_pending_approvals_fn=lambda limit: approvals,
        )

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["items"][0]["approval_id"], "approval-1")
        self.assertEqual(payload["items"][0]["workspace_id"], "ws-1")
        self.assertEqual(payload["items"][0]["labels"], ["email"])
        self.assertEqual(payload["items"][0]["browser"]["session_profile"], "qa-browser")
        self.assertEqual(payload["items"][0]["browser"]["immutable_plan_hash"], "hash-1")
        self.assertTrue(payload["items"][0]["browser"]["reviewed_approval_required"])

    def test_build_approval_detail_response_projects_browser_contract(self):
        with (
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_get_approval_record",
                return_value={
                    "approval_id": "approval-1",
                    "run_id": "run-1",
                    "workspace_id": "ws-1",
                    "owner_user_id": "user-1",
                    "status": "requested",
                    "metadata": {
                        "browser_session_profile": "qa-browser",
                        "browser_immutable_plan_hash": "hash-1",
                        "browser_reviewed_approval_required": True,
                        "browser_execution_binding": {"cwd": "/tmp/project"},
                    },
                },
            ),
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_find_run_snapshot_for_approval_id",
                return_value=None,
            ),
        ):
            payload = runtime_run_approval_service.build_approval_detail_response(
                "approval-1",
                current_user={"user_id": "user-1"},
            )

        self.assertEqual(payload["browser"]["session_profile"], "qa-browser")
        self.assertEqual(payload["browser"]["immutable_plan_hash"], "hash-1")
        self.assertTrue(payload["browser"]["reviewed_approval_required"])
        self.assertEqual(payload["browser"]["execution_binding"]["cwd"], "/tmp/project")

    def test_submit_run_decision_durably_resolves_pending_approval_before_queueing(self):
        run = {
            "status": "waiting_for_input",
            "input_queue": queue.Queue(),
            "context": {"metadata": {}},
            "pending_confirmation": {"approval_id": "approval-1", "correlation_id": "corr-1", "prompt": "Approve deploy"},
            "pending_approval": {"approval_id": "approval-1", "correlation_id": "corr-1", "prompt": "Approve deploy"},
        }
        resolved_calls = []

        with (
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_create_or_update_approval_request",
                return_value={"approval_id": "approval-1", "run_id": "run-1", "status": "requested"},
            ),
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_resolve_approval_if_pending",
                side_effect=lambda *args, **kwargs: resolved_calls.append((args, kwargs)) or {"resolved_at": "2026-04-12T10:01:00Z"},
            ),
        ):
            payload = runtime_run_approval_service.submit_run_decision(
                "run-1",
                run=run,
                payload=_Payload("approve", "ship it"),
                current_user={"user_id": "user-1"},
                serialize_run_snapshot=lambda run_id, run: {"run_id": run_id},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                get_pending_confirmation=lambda run: run.get("pending_confirmation"),
                approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
                append_approval_audit=lambda **kwargs: None,
                resolve_local_execution_start_approval=lambda *args, **kwargs: {},
            )

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(resolved_calls[0][0][:3], ("run-1", "approval-1", "approved"))
        self.assertEqual(run["input_queue"].get_nowait()["approval_id"], "approval-1")
        self.assertEqual(run["pending_confirmation"]["status"], "decision_submitted")

    def test_resolve_standalone_approval_with_runtime_defaults_uses_service_actor_by_default(self):
        run = {
            "run_id": "run-1",
            "pending_confirmation": {"approval_id": "approval-1"},
        }
        captured = {}

        payload = runtime_run_approval_service.resolve_standalone_approval_with_runtime_defaults(
            "approval-1",
            payload={"approval_id": "approval-1", "resolution": "approved", "actor": "connector", "reason": "ok"},
            current_user=None,
            runs={"run-1": run},
            server_module=SimpleNamespace(),
            runtime_runs_api_module=SimpleNamespace(),
            resolve_run_approval_fn=lambda run_id, approval_id, **kwargs: (
                captured.setdefault("current_user", kwargs.get("current_user")),
                {
                    "status": "ok",
                    "run_id": run_id,
                    "approval_id": approval_id,
                },
            )[1],
            resolve_run_approval_callbacks={},
            record_approval_resolution_fn=lambda *args: None,
            emit_approval_resolved_event_fn=lambda **kwargs: type(
                "Event",
                (),
                {
                    "event_id": "evt-1",
                    "event_type": "approval_resolved",
                    "trace_id": "trace-1",
                    "payload": kwargs,
                },
            )(),
        )

        self.assertEqual(payload["approval_id"], "approval-1")
        self.assertEqual(captured["current_user"]["auth_type"], "api_key")
        self.assertTrue(captured["current_user"]["is_admin"])


    def test_resolve_standalone_approval_for_deployed_agent_without_live_run(self):
        recorded = []
        emitted = []
        approval_record = {
            "run_id": "dagent_1",
            "approval_id": "approval-da-1",
            "trace_id": "trace-da-1",
            "metadata": {
                "source_type": "deployed_agent",
                "gate": "discount",
                "risk_class": "ORANGE",
                "tenant_id": "tenant-1",
                "workspace_id": "ws-1",
                "deployed_agent_id": "dagent_1",
            },
            "request_payload": {
                "approval_id": "approval-da-1",
                "prompt": "Shop Assistant approval required: discount",
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
            },
        }

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value=approval_record,
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_run_snapshot_for_approval_id",
            return_value={"source": "missing"},
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_live_run_by_approval_id",
            return_value=None,
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_resolve_approval_if_pending",
            return_value={
                "approval_id": "approval-da-1",
                "run_id": "dagent_1",
                "status": "approved",
                "resolved_at": "2026-01-01T00:00:00Z",
            },
        ):
            payload = runtime_run_approval_service.resolve_standalone_approval(
                "approval-da-1",
                payload={"approval_id": "approval-da-1", "resolution": "approved", "actor": "user-1", "reason": "ok"},
                current_user={"user_id": "user-1"},
                runs={},
                resolve_run_approval_fn=lambda *args, **kwargs: {"status": "ok"},
                resolve_run_approval_callbacks={},
                record_approval_resolution_fn=lambda *args: recorded.append(args),
                emit_approval_resolved_event_fn=lambda **kwargs: emitted.append(kwargs)
                or type(
                    "Event",
                    (),
                    {
                        "event_id": "evt-da-1",
                        "event_type": "approval_resolved",
                        "trace_id": kwargs.get("trace_id", ""),
                        "payload": kwargs,
                    },
                )(),
            )

        self.assertEqual(payload["run_id"], "dagent_1")
        self.assertEqual(payload["resolution"], "approved")
        self.assertEqual(recorded[0][:3], ("dagent_1", "approval-da-1", "approved"))
        self.assertEqual(emitted[0]["approval_id"], "approval-da-1")
        self.assertEqual(emitted[0]["tenant_id"], "tenant-1")
        self.assertEqual(emitted[0]["workspace_id"], "ws-1")

    def test_resolve_standalone_approval_still_404_for_missing_run_without_deployed_agent_source(self):
        """Legacy approvals without a live run still flow through the normal path and fail with 409
        because resolve_run_approval requires an active run."""
        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_get_approval_record",
            return_value={
                "run_id": "run-1",
                "approval_id": "approval-legacy-1",
                "metadata": {"source_type": "workflow"},
                "request_payload": {"approval_id": "approval-legacy-1"},
            },
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_run_snapshot_for_approval_id",
            return_value={"source": "missing"},
        ), patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_live_run_by_approval_id",
            return_value=None,
        ):
            with self.assertRaises(HTTPException) as context:
                runtime_run_approval_service.resolve_standalone_approval(
                    "approval-legacy-1",
                    payload={"approval_id": "approval-legacy-1", "resolution": "approved", "actor": "user-1"},
                    current_user={"user_id": "user-1"},
                    runs={},
                    resolve_run_approval_fn=lambda *args, **kwargs: (_ for _ in ()).throw(
                        HTTPException(status_code=409, detail="Run is not active in this process.")
                    ),
                    resolve_run_approval_callbacks={},
                    record_approval_resolution_fn=lambda *args: None,
                    emit_approval_resolved_event_fn=lambda **kwargs: None,
                )
            self.assertEqual(context.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
