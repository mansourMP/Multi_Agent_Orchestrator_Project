import queue
import unittest

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
        self.assertEqual(pending_updates[0]["status"], "resolved")

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


if __name__ == "__main__":
    unittest.main()
