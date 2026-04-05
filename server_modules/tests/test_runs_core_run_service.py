import queue
import unittest
from unittest.mock import patch

from server_modules import runs_core


class RunsCoreRunServiceTests(unittest.TestCase):
    def test_set_run_status_delegates_live_transition_to_run_service(self) -> None:
        run = {
            "status": "running",
            "logs": queue.Queue(),
            "context": {"metadata": {}},
        }
        previous_runs = dict(runs_core.runs)
        try:
            runs_core.runs.clear()
            runs_core.runs["run-1"] = run

            with patch.object(runs_core.run_service, "transition_live_run_status", return_value=None) as transition_mock:
                runs_core.set_run_status("run-1", "completed")

            transition_mock.assert_called_once()
            args, kwargs = transition_mock.call_args
            self.assertEqual(args[0], "run-1")
            self.assertEqual(args[1], "completed")
            self.assertEqual(kwargs["run"], run)
            self.assertIs(kwargs["local_pending_run_ids"], runs_core.LOCAL_PENDING_RUN_IDS)
            self.assertIs(kwargs["local_claimed_runs"], runs_core.LOCAL_CLAIMED_RUNS)
        finally:
            runs_core.runs.clear()
            runs_core.runs.update(previous_runs)


if __name__ == "__main__":
    unittest.main()
