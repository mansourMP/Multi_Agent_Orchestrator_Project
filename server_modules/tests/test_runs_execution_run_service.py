import unittest
from unittest.mock import patch

from server_modules import runs_execution


class RunsExecutionRunServiceTests(unittest.TestCase):
    def test_create_run_delegates_live_lifecycle_bootstrap_to_run_service(self) -> None:
        with patch.object(runs_execution.shared, "sync_acp_manager_paths", return_value=None), patch.object(
            runs_execution,
            "selected_execution_target_from_context",
            return_value="cloud",
        ), patch.object(
            runs_execution.run_service,
            "build_live_run_record",
            return_value={"run_id": "run-1", "logs": object()},
        ) as build_mock, patch.object(
            runs_execution.run_service,
            "register_live_run",
            return_value=None,
        ) as register_mock, patch.object(
            runs_execution.run_service,
            "activate_live_run",
            return_value="run-1",
        ) as activate_mock, patch.object(
            runs_execution,
            "metrics_inc",
            return_value=None,
        ):
            run_id = runs_execution.create_run("orion", {"workspace_id": "default"})

        self.assertEqual(run_id, "run-1")
        build_mock.assert_called_once()
        register_mock.assert_called_once()
        activate_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
