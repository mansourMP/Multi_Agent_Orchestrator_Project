import unittest
from unittest.mock import patch

from server_modules import agent_workspace_api
from server_modules.runtime_models import RunStartRequest


class AgentWorkspaceApiTests(unittest.TestCase):
    def test_execute_workspace_run_request_routes_through_turn_runtime(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="Write file demo.txt")

        with patch.object(
            agent_workspace_api,
            "_agent_workspace_run_execution_services",
            return_value=object(),
        ), patch.object(
            agent_workspace_api,
            "execute_system_run_start_request_via_turn_runtime",
            return_value={"run_id": "run-1", "status": "starting"},
        ) as execute_run:
            result = agent_workspace_api._execute_workspace_run_request(request)

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "starting")
        self.assertTrue(callable(execute_run.call_args.kwargs["stamp_request_owner_fn"]))


if __name__ == "__main__":
    unittest.main()
