import unittest
from unittest.mock import Mock

from server_modules import runtime_run_resume_service


class _ThreadWorker:
    def __init__(self, ident: int, alive: bool = True) -> None:
        self.ident = ident
        self._alive = alive

    def is_alive(self) -> bool:
        return self._alive


class RuntimeRunResumeServiceTests(unittest.TestCase):
    def test_run_thread_is_alive_matches_active_worker(self):
        run = {"thread_id": 42}

        self.assertTrue(
            runtime_run_resume_service.run_thread_is_alive(
                run,
                enumerate_threads=lambda: [_ThreadWorker(42, True)],
            )
        )

    def test_schedule_restored_run_resume_starts_thread_for_non_local_run(self):
        persisted = []
        worker = Mock()

        result = runtime_run_resume_service.schedule_restored_run_resume(
            "run-1",
            {"status": "waiting_for_input", "thread_id": None},
            run_thread_is_alive_fn=lambda run: False,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            late_server_export=lambda name: (
                (lambda run_id, run: persisted.append((run_id, run.get("updated_at"))))
                if name == "_persist_live_run_state"
                else Mock()
            ),
            thread_class=lambda **kwargs: worker,
        )

        self.assertTrue(result)
        self.assertEqual(persisted[0][0], "run-1")
        worker.start.assert_called_once()

    def test_schedule_restored_run_resume_requeues_local_checkpoint_run(self):
        enqueued = []
        run = {
            "status": "waiting_for_input",
            "thread_id": None,
            "context": {"metadata": {"execution_target_selected": "local_companion"}},
            "browser_checkpoint": {"next_action_index": 1},
        }

        result = runtime_run_resume_service.schedule_restored_run_resume(
            "run-2",
            run,
            run_thread_is_alive_fn=lambda run: False,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            late_server_export=lambda name: (
                (lambda run_id, **kwargs: enqueued.append((run_id, kwargs)))
                if name == "_enqueue_local_companion_run"
                else Mock()
            ),
            thread_class=lambda **kwargs: Mock(),
        )

        self.assertTrue(result)
        self.assertTrue(run["context"]["metadata"]["browser_resume_supported"])
        self.assertEqual(enqueued[0][0], "run-2")


if __name__ == "__main__":
    unittest.main()
