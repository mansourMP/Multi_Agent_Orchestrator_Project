import queue
import unittest
from unittest.mock import patch

from server_modules import runs_execution


class RunsExecutionOutboxServiceTests(unittest.TestCase):
    def test_enqueue_local_companion_run_delegates_to_outbox_service(self) -> None:
        previous_runs = dict(runs_execution.runs)
        try:
            runs_execution.runs.clear()
            runs_execution.runs["run-1"] = {
                "run_id": "run-1",
                "logs": queue.Queue(),
                "context": {"metadata": {}},
            }

            with patch.object(runs_execution.outbox_service, "enqueue_local_companion_run") as enqueue_mock:
                runs_execution._enqueue_local_companion_run(
                    "run-1",
                    message="queued",
                    event="local_queued",
                )

            enqueue_mock.assert_called_once()
            args, kwargs = enqueue_mock.call_args
            self.assertEqual(args[0], "run-1")
            self.assertIs(kwargs["runs_by_id"], runs_execution.runs)
            self.assertIs(kwargs["pending_run_ids"], runs_execution.LOCAL_PENDING_RUN_IDS)
            self.assertEqual(kwargs["db_path"], runs_execution.ORION_RUNTIME_STATE_DB)
        finally:
            runs_execution.runs.clear()
            runs_execution.runs.update(previous_runs)


if __name__ == "__main__":
    unittest.main()
