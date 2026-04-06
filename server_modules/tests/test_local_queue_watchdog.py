import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from server_modules import local_queue


class LocalQueueWatchdogTests(unittest.TestCase):
    def test_watchdog_status_snapshot_reflects_last_recorded_pass(self) -> None:
        local_queue._record_local_runtime_watchdog_status(
            checked_at="2026-04-06T12:00:00Z",
            status="ok",
            summary="Recovered 2 stale local claims.",
            cleaned_run_ids=["run-1", "run-2"],
            resumed_run_ids=["run-3"],
            interval_seconds=5,
        )

        snapshot = local_queue.local_runtime_watchdog_status_snapshot()

        self.assertTrue(snapshot["running"])
        self.assertEqual(snapshot["interval_seconds"], 5)
        self.assertEqual(snapshot["last_status"], "ok")
        self.assertEqual(snapshot["last_cleaned_count"], 2)
        self.assertEqual(snapshot["last_cleaned_run_ids"], ["run-1", "run-2"])
        self.assertEqual(snapshot["last_resumed_count"], 1)
        self.assertEqual(snapshot["last_resumed_run_ids"], ["run-3"])

    def test_resume_due_checkpoint_recoveries_schedules_run_after_backoff(self) -> None:
        emitted = []
        scheduled = []
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            runs={
                "run-1": {
                    "status": "waiting_for_input",
                    "logs": object(),
                    "browser_checkpoint": {"next_action_index": 4, "session_profile": "qa-browser"},
                    "context": {
                        "metadata": {
                            "execution_target_selected": "local_companion",
                            "local_worker_recovery_reason": "worker_lost",
                            "local_worker_recovery_attempt_count": 2,
                            "local_worker_recovery_next_retry_at": "2026-04-06T12:00:00Z",
                        }
                    },
                }
            },
            _utc_now=lambda: datetime.fromisoformat("2026-04-06T12:00:05"),
            _utc_now_iso=lambda: "2026-04-06T12:00:05Z",
            _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
            emit_log=lambda log_queue, level, message, **kwargs: emitted.append((level, message, kwargs)),
        )
        try:
            with patch("server_modules.runtime_runs_api._schedule_restored_run_resume", side_effect=lambda run_id, run: scheduled.append((run_id, run.get("status"))) or True):
                resumed = local_queue._resume_due_checkpoint_recoveries()
        finally:
            local_queue._server = original_server

        self.assertEqual(resumed, ["run-1"])
        self.assertEqual(scheduled, [("run-1", "waiting_for_input")])
        self.assertEqual(emitted[0][2]["event"], "local_resume_scheduled_after_backoff")


if __name__ == "__main__":
    unittest.main()
