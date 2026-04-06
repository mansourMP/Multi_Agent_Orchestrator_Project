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

    def test_workflow_human_node_delegates_to_run_service(self) -> None:
        definition = {
            "version": "empyralist.workflow.v2",
            "nodes": [
                {"id": "trigger_1", "type": "trigger", "variant": "manual", "config": {}},
                {
                    "id": "review_1",
                    "type": "human",
                    "variant": "review",
                    "config": {"title": "Review draft"},
                },
            ],
            "edges": [{"id": "e1", "source": "trigger_1", "target": "review_1"}],
        }

        with patch.object(
            runs_execution.run_service,
            "execute_workflow_human_node",
            side_effect=lambda **kwargs: kwargs["state"].__setitem__("last_text", "Reviewed reply") or kwargs["state"].__setitem__(
                "last_data",
                {"node_id": "review_1", "variant": "review"},
            ) or "Reviewed reply",
        ) as helper_mock:
            result = runs_execution._execute_workflow_graph(
                "run-review-delegate",
                {"workflow_id": "wf-review", "user_goal": "Review flow", "metadata": {}},
                __import__("queue").Queue(),
                definition,
                _track_node_states=False,
            )

        self.assertEqual(result["result_text"], "Reviewed reply")
        helper_mock.assert_called_once()
        _, kwargs = helper_mock.call_args
        self.assertEqual(kwargs["run_id"], "run-review-delegate")
        self.assertEqual(kwargs["node_id"], "review_1")
        self.assertEqual(kwargs["variant"], "review")


if __name__ == "__main__":
    unittest.main()
