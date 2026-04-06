import queue
import threading
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from server_modules import local_queue, machine_lease_service, runtime_run_approval_service, runtime_run_control_service


class _ApprovalPayload:
    def __init__(self, decision: str, note: str = "") -> None:
        self.decision = decision
        self.note = note


class LocalRuntimeRecoveryScenarioTests(unittest.TestCase):
    def _resolve_local_worker_recovery_approval_with_callbacks(self, run: dict, *, schedule_result: bool):
        return lambda *args, **kwargs: runtime_run_control_service.resolve_local_worker_recovery_approval(
            *args,
            **kwargs,
            get_pending_confirmation=lambda live_run: live_run.get("pending_confirmation"),
            clear_pending_confirmation=lambda live_run: live_run.update({"pending_confirmation": None, "pending_approval": None}),
            approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
            utc_now_iso=lambda: "2026-04-06T00:05:05Z",
            emit_log=lambda *inner_args, **inner_kwargs: None,
            append_approval_audit=lambda **audit_kwargs: None,
            schedule_restored_run_resume=lambda run_id, live_run: schedule_result,
        )

    def _cleanup_run_after_worker_loss(
        self,
        *,
        run: dict,
        now_iso: str = "2026-04-06T00:01:00Z",
        schedule_restored_run_resume_fn=None,
    ) -> tuple[list[str], list[tuple[str, str]], list[tuple[str, str, dict]]]:
        claimed = {
            "run-1": {
                "worker_id": "worker-1",
                "machine_id": "machine-1",
                "lease_id": "lease-1",
                "claimed_at": "2026-04-06T00:00:00Z",
                "last_heartbeat_at": "2026-04-06T00:00:00Z",
                "lease_seconds": 30,
            }
        }
        worker_registry = {
            "worker-1": {
                "worker_id": "worker-1",
                "runtime_id": "worker-1",
                "machine_id": "machine-1",
                "lease_seconds": 30,
            }
        }
        statuses: list[tuple[str, str]] = []
        logs: list[tuple[str, str, dict]] = []
        stale = machine_lease_service.cleanup_stale_machine_leases(
            now=datetime.fromisoformat(now_iso.replace("Z", "")),
            local_queue_lock=threading.Lock(),
            claimed_runs=claimed,
            worker_registry=worker_registry,
            runs_by_id={"run-1": run},
            parse_utc_ts_fn=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
            utc_now_iso_fn=lambda: now_iso,
            persist_local_runtime_state_fn=lambda: None,
            emit_log_fn=lambda log_queue, level, message, **kwargs: logs.append((level, message, kwargs)),
            set_run_status_fn=lambda run_id, status: statuses.append((run_id, status)) or run.__setitem__("status", status),
            schedule_restored_run_resume_fn=schedule_restored_run_resume_fn or (lambda run_id, live_run: False),
            checkpoint_recovery_max_auto_retries=3,
            checkpoint_recovery_backoff_seconds=[0, 10, 30],
            local_worker_lost_timeout_seconds=30,
            default_lease_seconds=30,
        )
        return stale, statuses, logs

    def test_backoff_recovery_waits_until_due_then_watchdog_resumes(self) -> None:
        run = {
            "status": "running_local",
            "logs": object(),
            "browser_checkpoint": {"next_action_index": 4, "session_profile": "qa-browser"},
            "context": {
                "metadata": {
                    "execution_target_selected": "local_companion",
                    "local_worker_recovery_attempt_count": 1,
                }
            },
        }

        stale, statuses, logs = self._cleanup_run_after_worker_loss(run=run)

        self.assertEqual(stale, ["run-1"])
        self.assertEqual(statuses, [("run-1", "waiting_for_input")])
        self.assertEqual(run["result_data"]["retry_backoff_seconds"], 10)
        self.assertEqual(logs[1][2]["event"], "local_worker_recovery_backoff")

        scheduled = []
        original_server = local_queue._server
        try:
            local_queue._server = SimpleNamespace(
                runs={"run-1": run},
                _utc_now=lambda: datetime.fromisoformat("2026-04-06T00:01:05"),
                _utc_now_iso=lambda: "2026-04-06T00:01:05Z",
                _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
                emit_log=lambda *args, **kwargs: None,
            )
            with patch(
                "server_modules.runtime_runs_api._schedule_restored_run_resume",
                side_effect=lambda run_id, live_run: scheduled.append(run_id) or True,
            ):
                self.assertEqual(local_queue._resume_due_checkpoint_recoveries(), [])

            local_queue._server = SimpleNamespace(
                runs={"run-1": run},
                _utc_now=lambda: datetime.fromisoformat("2026-04-06T00:01:11"),
                _utc_now_iso=lambda: "2026-04-06T00:01:11Z",
                _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
                emit_log=lambda *args, **kwargs: None,
            )
            with patch(
                "server_modules.runtime_runs_api._schedule_restored_run_resume",
                side_effect=lambda run_id, live_run: scheduled.append(run_id) or True,
            ):
                resumed = local_queue._resume_due_checkpoint_recoveries()
        finally:
            local_queue._server = original_server

        self.assertEqual(resumed, ["run-1"])
        self.assertEqual(scheduled, ["run-1"])

    def test_manual_degradation_gate_blocks_watchdog_and_requires_approval_before_resume(self) -> None:
        run = {
            "status": "running_local",
            "logs": object(),
            "input_queue": queue.Queue(),
            "browser_checkpoint": {"next_action_index": 4, "session_profile": "qa-browser"},
            "context": {
                "metadata": {
                    "execution_target_selected": "local_companion",
                    "local_worker_recovery_attempt_count": 3,
                }
            },
        }

        stale, statuses, _ = self._cleanup_run_after_worker_loss(run=run)
        self.assertEqual(stale, ["run-1"])
        self.assertEqual(statuses, [("run-1", "waiting_for_input")])
        self.assertTrue(run["context"]["metadata"]["local_worker_recovery_manual_confirmation_required"])

        original_server = local_queue._server
        try:
            local_queue._server = SimpleNamespace(
                runs={"run-1": run},
                _utc_now=lambda: datetime.fromisoformat("2026-04-06T00:05:00"),
                _utc_now_iso=lambda: "2026-04-06T00:05:00Z",
                _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
                emit_log=lambda *args, **kwargs: None,
            )
            with patch(
                "server_modules.runtime_runs_api._schedule_restored_run_resume",
                side_effect=lambda run_id, live_run: self.fail("manual-gated run must not auto-resume"),
            ):
                self.assertEqual(local_queue._resume_due_checkpoint_recoveries(), [])
        finally:
            local_queue._server = original_server

        pending_updates = []

        def _begin_pending(run_id, prompt, **kwargs):
            pending = {
                "approval_id": "approval-1",
                "correlation_id": "corr-1",
                "metadata": dict(kwargs.get("metadata") or {}),
                "prompt": prompt,
            }
            run["pending_confirmation"] = pending
            run["pending_approval"] = pending
            pending_updates.append(pending)
            return pending

        resume_payload = runtime_run_control_service.resume_waiting_run(
            "run-1",
            run=run,
            current_user={"user_id": "user-1"},
            serialize_run_snapshot=lambda run_id, live_run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda live_run: live_run.get("pending_confirmation"),
            begin_run_pending_confirmation=_begin_pending,
            emit_log=lambda *args, **kwargs: self.fail("manual gate path should not directly emit resume request"),
            schedule_restored_run_resume=lambda run_id, live_run: self.fail("manual gate path should not directly schedule"),
        )

        self.assertEqual(resume_payload["status"], "confirmation_required")
        self.assertEqual(pending_updates[0]["metadata"]["kind"], "local_worker_recovery_resume")

        approval_payload = runtime_run_approval_service.resolve_run_approval(
            "run-1",
            "approval-1",
            run=run,
            payload=_ApprovalPayload("approve", "resume despite instability"),
            current_user={"user_id": "user-1"},
            serialize_run_snapshot=lambda run_id, live_run: {"run_id": run_id},
            enforce_run_owner_access=lambda current_user, snapshot: None,
            get_pending_confirmation=lambda live_run: live_run.get("pending_confirmation"),
            set_pending_confirmation=lambda live_run, pending: live_run.__setitem__("pending_confirmation", pending),
            clear_pending_confirmation=lambda live_run: live_run.update({"pending_confirmation": None, "pending_approval": None}),
            parse_utc_ts=lambda value: None,
            utc_now=lambda: None,
            utc_now_iso=lambda: "2026-04-06T00:05:05Z",
            approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
            append_approval_audit=lambda **kwargs: None,
            resolve_local_execution_start_approval=lambda *args, **kwargs: self.fail("wrong approval path"),
            resolve_local_worker_recovery_approval=self._resolve_local_worker_recovery_approval_with_callbacks(run, schedule_result=True),
            run_thread_is_alive=lambda live_run: False,
            emit_log=lambda *args, **kwargs: None,
            schedule_restored_run_resume=lambda run_id, live_run: True,
        )

        self.assertEqual(approval_payload["decision_kind"], "approved")
        self.assertFalse(run["context"]["metadata"]["local_worker_recovery_manual_confirmation_required"])
        self.assertIsNone(run["pending_confirmation"])

    def test_fault_injected_manual_resume_scheduler_failure_keeps_manual_gate(self) -> None:
        run = {
            "status": "waiting_for_input",
            "logs": object(),
            "browser_checkpoint": {"next_action_index": 9, "session_profile": "qa-browser"},
            "context": {
                "metadata": {
                    "local_worker_recovery_manual_confirmation_required": True,
                    "local_worker_recovery_attempt_count": 3,
                    "local_worker_recovery_max_auto_retries": 3,
                }
            },
            "pending_confirmation": {
                "approval_id": "approval-1",
                "correlation_id": "corr-1",
                "metadata": {"kind": "local_worker_recovery_resume"},
            },
            "pending_approval": {
                "approval_id": "approval-1",
                "correlation_id": "corr-1",
                "metadata": {"kind": "local_worker_recovery_resume"},
            },
        }

        with self.assertRaises(HTTPException):
            runtime_run_approval_service.resolve_run_approval(
                "run-1",
                "approval-1",
                run=run,
                payload=_ApprovalPayload("approve", "try again"),
                current_user={"user_id": "user-1"},
                serialize_run_snapshot=lambda run_id, live_run: {"run_id": run_id},
                enforce_run_owner_access=lambda current_user, snapshot: None,
                get_pending_confirmation=lambda live_run: live_run.get("pending_confirmation"),
                set_pending_confirmation=lambda live_run, pending: live_run.__setitem__("pending_confirmation", pending),
                clear_pending_confirmation=lambda live_run: live_run.update({"pending_confirmation": None, "pending_approval": None}),
                parse_utc_ts=lambda value: None,
                utc_now=lambda: None,
                utc_now_iso=lambda: "2026-04-06T00:05:05Z",
                approval_correlation_id=lambda approval_id, run_id=None: "corr-1",
                append_approval_audit=lambda **kwargs: None,
                resolve_local_execution_start_approval=lambda *args, **kwargs: self.fail("wrong approval path"),
                resolve_local_worker_recovery_approval=self._resolve_local_worker_recovery_approval_with_callbacks(run, schedule_result=False),
                run_thread_is_alive=lambda live_run: False,
                emit_log=lambda *args, **kwargs: None,
                schedule_restored_run_resume=lambda run_id, live_run: False,
            )

        self.assertTrue(run["context"]["metadata"]["local_worker_recovery_manual_confirmation_required"])
        self.assertIsNone(run["pending_confirmation"])
        self.assertIsNone(run["pending_approval"])

    def test_cold_boot_recovery_preserves_backoff_until_watchdog_retry_is_due(self) -> None:
        run = {
            "status": "running_local",
            "logs": object(),
            "browser_checkpoint": {"next_action_index": 4, "session_profile": "qa-browser"},
            "context": {
                "metadata": {
                    "execution_target_selected": "local_companion",
                    "local_worker_recovery_reason": "worker_lost",
                    "local_worker_recovery_attempt_count": 2,
                    "local_worker_recovery_max_auto_retries": 3,
                    "local_worker_recovery_backoff_seconds": 10,
                    "local_worker_recovery_next_retry_at": "2026-04-06T00:01:10Z",
                }
            },
        }

        original_server = local_queue._server
        original_done = local_queue._COLD_BOOT_RECOVERY_DONE
        try:
            local_queue._server = SimpleNamespace(
                runs={"run-1": run},
                LOCAL_QUEUE_LOCK=threading.Lock(),
                LOCAL_CLAIMED_RUNS={},
                LOCAL_PENDING_RUN_IDS=[],
                LOCAL_WORKER_REGISTRY={},
                ORION_LOCAL_LEASE_SECONDS=30,
                _utc_now=lambda: datetime.fromisoformat("2026-04-06T00:01:00"),
                _utc_now_iso=lambda: "2026-04-06T00:01:00Z",
                _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
                emit_log=lambda *args, **kwargs: None,
                _persist_live_run_state=lambda run_id, live_run: None,
            )
            local_queue._COLD_BOOT_RECOVERY_DONE = False

            recovered = local_queue.recover_orphaned_local_runs_on_startup()
            self.assertEqual(recovered, ["run-1"])
            self.assertEqual(run["status"], "waiting_for_input")
            self.assertEqual(run["result_data"]["error"], "local_worker_lost_recoverable")
            self.assertEqual(run["result_data"]["next_retry_at"], "2026-04-06T00:01:10Z")

            with patch(
                "server_modules.runtime_runs_api._schedule_restored_run_resume",
                side_effect=lambda run_id, live_run: self.fail("recovery must not resume before retry time"),
            ):
                self.assertEqual(local_queue._resume_due_checkpoint_recoveries(), [])

            local_queue._server = SimpleNamespace(
                runs={"run-1": run},
                LOCAL_QUEUE_LOCK=threading.Lock(),
                LOCAL_CLAIMED_RUNS={},
                LOCAL_PENDING_RUN_IDS=[],
                LOCAL_WORKER_REGISTRY={},
                ORION_LOCAL_LEASE_SECONDS=30,
                _utc_now=lambda: datetime.fromisoformat("2026-04-06T00:01:11"),
                _utc_now_iso=lambda: "2026-04-06T00:01:11Z",
                _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
                emit_log=lambda *args, **kwargs: None,
                _persist_live_run_state=lambda run_id, live_run: None,
            )
            scheduled = []
            with patch(
                "server_modules.runtime_runs_api._schedule_restored_run_resume",
                side_effect=lambda run_id, live_run: scheduled.append(run_id) or True,
            ):
                resumed = local_queue._resume_due_checkpoint_recoveries()
        finally:
            local_queue._server = original_server
            local_queue._COLD_BOOT_RECOVERY_DONE = original_done

        self.assertEqual(resumed, ["run-1"])
        self.assertEqual(scheduled, ["run-1"])


if __name__ == "__main__":
    unittest.main()
