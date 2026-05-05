import threading
import time
import unittest

from server_modules.runtime_lane_queue import RuntimeLaneQueue


def _wait_until(predicate, *, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError("Condition was not met before timeout.")


class RuntimeLaneQueueTests(unittest.TestCase):
    def test_three_tasks_queue_cleanly_and_surface_waiting_state(self) -> None:
        queue = RuntimeLaneQueue(max_total_concurrency=1)
        release_event = threading.Event()
        started = []
        completed = []

        def _make_work(label: str):
            def _work():
                started.append(label)
                if label == "task-1":
                    release_event.wait(timeout=2.0)
                completed.append(label)
                return {"status": "completed", "summary": label}

            return _work

        queue.enqueue(lane="cron", label="task-1", work=_make_work("task-1"))
        queue.enqueue(lane="cron", label="task-2", work=_make_work("task-2"))
        queue.enqueue(lane="cron", label="task-3", work=_make_work("task-3"))

        _wait_until(lambda: len(started) == 1)
        snapshot = queue.snapshot()
        self.assertEqual(snapshot["active_count"], 1)
        self.assertEqual(snapshot["pending_count"], 2)
        self.assertEqual(snapshot["lanes"]["cron"]["active_count"], 1)
        self.assertEqual(snapshot["lanes"]["cron"]["pending_count"], 2)

        release_event.set()
        _wait_until(lambda: len(completed) == 3)
        final_snapshot = queue.shutdown(wait=True, timeout=2.0)
        self.assertEqual(final_snapshot["pending_count"], 0)
        self.assertEqual(final_snapshot["active_count"], 0)

    def test_shutdown_drains_pending_work(self) -> None:
        queue = RuntimeLaneQueue(max_total_concurrency=1)
        release_event = threading.Event()
        finished = []

        def _slow_work():
            release_event.wait(timeout=2.0)
            finished.append("slow")
            return {"status": "completed", "summary": "slow"}

        def _fast_work():
            finished.append("fast")
            return {"status": "completed", "summary": "fast"}

        queue.enqueue(lane="system", label="slow", work=_slow_work)
        queue.enqueue(lane="system", label="fast", work=_fast_work)
        _wait_until(lambda: queue.snapshot()["active_count"] == 1)

        drain_thread = threading.Thread(
            target=lambda: queue.shutdown(wait=True, timeout=2.0),
            daemon=True,
        )
        drain_thread.start()
        time.sleep(0.05)
        self.assertTrue(queue.snapshot()["draining"])

        release_event.set()
        drain_thread.join(timeout=2.0)
        self.assertFalse(drain_thread.is_alive())
        self.assertEqual(finished, ["slow", "fast"])


if __name__ == "__main__":
    unittest.main()
