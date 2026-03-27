import queue
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from server_modules import runs_delegation


class RunsDelegationTests(unittest.TestCase):
    def setUp(self) -> None:
        runs_delegation.runs.clear()
        with runs_delegation.RUN_HISTORY_LOCK:
            runs_delegation.RUN_HISTORY.clear()

    def tearDown(self) -> None:
        runs_delegation.runs.clear()
        runs_delegation.RUN_QUEUE_INDEX.clear()
        with runs_delegation.RUN_HISTORY_LOCK:
            runs_delegation.RUN_HISTORY.clear()

    def test_lookup_run_snapshot_reads_live_run_without_name_error(self):
        runs_delegation.runs["parent-run"] = {
            "status": "completed",
            "context": {"metadata": {}},
            "result_data": {"summary": "done"},
        }

        snapshot = runs_delegation._lookup_run_snapshot("parent-run")

        self.assertEqual(snapshot["run_id"], "parent-run")
        self.assertEqual(snapshot["status"], "completed")

    def test_lookup_run_snapshot_reads_archived_run_without_name_error(self):
        with runs_delegation.RUN_HISTORY_LOCK:
            runs_delegation.RUN_HISTORY.append(
                {
                    "run_id": "archived-run",
                    "status": "completed",
                    "context": {"metadata": {}},
                    "result_data": {"summary": "archived"},
                }
            )

        snapshot = runs_delegation._lookup_run_snapshot("archived-run")

        self.assertEqual(snapshot["run_id"], "archived-run")
        self.assertEqual(snapshot["status"], "completed")

    def test_refresh_parent_delegation_state_updates_live_parent_and_emits_log(self):
        parent_run_id = "11111111-1111-4111-8111-111111111111"
        child_run_id = "22222222-2222-4222-8222-222222222222"
        parent_logs = queue.Queue()
        runs_delegation.runs[parent_run_id] = {
            "status": "running",
            "logs": parent_logs,
            "events": [],
            "_event_seq": 0,
            "context": {"metadata": {}},
            "result_data": {},
        }
        runs_delegation.RUN_QUEUE_INDEX[id(parent_logs)] = parent_run_id
        runs_delegation.runs[child_run_id] = {
            "status": "completed",
            "context": {
                "metadata": {
                    "parent_run_id": parent_run_id,
                    "agent_role": "research",
                    "delegated_by_role": "orchestrator",
                }
            },
            "result": "Three market insights ready.",
        }

        summary = runs_delegation._refresh_parent_delegation_state(parent_run_id)

        self.assertIsNotNone(summary)
        self.assertEqual(summary["next_action"], "merge_results")
        self.assertEqual(
            runs_delegation.runs[parent_run_id]["result_data"]["orchestration"]["summary"]["next_action"],
            "merge_results",
        )
        event = parent_logs.get_nowait()
        self.assertEqual(event["event"], "delegation_state")

    @patch("server_modules.runs_delegation.build_doctor_run_gate_from_snapshot")
    @patch("server_modules.runs_delegation.apply_execution_route_metadata", create=True)
    @patch("server_modules.runs_delegation.decide_execution_target", create=True)
    @patch("server_modules.runs_delegation._prepare_run_start_request")
    @patch("server_modules.runs_delegation._compute_tool_policy_precheck", create=True)
    @patch("server_modules.runs_delegation.create_run", create=True)
    def test_create_run_from_request_rejects_blocked_local_execution_precheck(
        self,
        create_run_mock,
        precheck_mock,
        prepare_mock,
        decide_route_mock,
        apply_route_mock,
        doctor_mock,
    ):
        prepare_mock.return_value = {
            "engine": "orion",
            "metadata": {
                "outcome_pack": "local-execution-v1",
                "execution_target": "local_companion",
                "trust_mode": "guarded",
                "agent_role": "research",
            },
            "workflow_snapshot": None,
        }
        decide_route_mock.return_value = {"selected": "local_companion"}
        apply_route_mock.side_effect = lambda metadata, route: metadata
        doctor_mock.return_value = {"blocking": False}
        precheck_mock.return_value = {
            "blocked_count": 1,
            "items": [
                {
                    "decision": "blocked",
                    "tool_id": "browser_automation",
                    "capabilities": [{"title": "Authenticated browser automation"}],
                }
            ],
        }

        request = runs_delegation.RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="Read a signed-in page",
            agent_role="research",
            metadata={
                "outcome_pack": "local-execution-v1",
                "execution_target": "local_companion",
                "trust_mode": "guarded",
            },
        )

        with self.assertRaises(HTTPException) as ctx:
            runs_delegation._create_run_from_request(request)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("Run blocked by local execution policy", str(ctx.exception.detail))
        create_run_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
