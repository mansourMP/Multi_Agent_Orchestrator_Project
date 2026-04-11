import queue
import unittest
from unittest.mock import patch

from fastapi import HTTPException

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
            "status": "waiting_for_input",
            "context": {"workspace_id": "ws-1", "tenant_id": "tenant-1", "metadata": {"trace_id": "trace-1"}},
            "pending_confirmation": {"approval_id": "approval-1", "correlation_id": "corr-1"},
        }
        live_run = dict(run_record)
        live_run["logs"] = object()
        live_run["input_queue"] = queue.Queue()

        with patch.object(
            runtime_run_approval_service.run_state_repository,
            "sync_find_live_run_by_approval_id",
            return_value={"run_id": "run-1", **run_record},
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
            "sync_find_live_run_by_approval_id",
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

    def test_resolve_standalone_approval_falls_back_to_repository_live_runs_when_route_runs_missing(self):
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
                "sync_find_live_run_by_approval_id",
                return_value=None,
            ),
            patch.object(
                runtime_run_approval_service.run_state_repository,
                "sync_list_live_runs",
                return_value=[run_record],
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


if __name__ == "__main__":
    unittest.main()
