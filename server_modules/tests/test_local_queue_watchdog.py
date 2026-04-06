import unittest

from server_modules import local_queue


class LocalQueueWatchdogTests(unittest.TestCase):
    def test_watchdog_status_snapshot_reflects_last_recorded_pass(self) -> None:
        local_queue._record_local_runtime_watchdog_status(
            checked_at="2026-04-06T12:00:00Z",
            status="ok",
            summary="Recovered 2 stale local claims.",
            cleaned_run_ids=["run-1", "run-2"],
            interval_seconds=5,
        )

        snapshot = local_queue.local_runtime_watchdog_status_snapshot()

        self.assertTrue(snapshot["running"])
        self.assertEqual(snapshot["interval_seconds"], 5)
        self.assertEqual(snapshot["last_status"], "ok")
        self.assertEqual(snapshot["last_cleaned_count"], 2)
        self.assertEqual(snapshot["last_cleaned_run_ids"], ["run-1", "run-2"])


if __name__ == "__main__":
    unittest.main()
