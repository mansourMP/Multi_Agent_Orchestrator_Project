import queue
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import runs_core, runs_execution, runs_output
from server_modules.runtime_state_store import (
    init_runtime_state_db,
    list_live_run_states,
    load_local_runtime_state,
)


class RuntimeDurableStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "runtime-state.sqlite3"
        init_runtime_state_db(self.db_path)
        self.patchers = [
            patch.object(runs_core, "ORION_RUNTIME_STATE_DB", self.db_path),
            patch.object(runs_execution, "ORION_RUNTIME_STATE_DB", self.db_path),
            patch.object(runs_output, "ORION_RUNTIME_STATE_DB", self.db_path),
        ]
        for patcher in self.patchers:
            patcher.start()
        runs_core.runs.clear()
        runs_execution.runs.clear()
        runs_core.RUN_QUEUE_INDEX.clear()
        runs_execution.RUN_QUEUE_INDEX.clear()
        runs_core.LOCAL_PENDING_RUN_IDS.clear()
        runs_execution.LOCAL_PENDING_RUN_IDS.clear()
        runs_core.LOCAL_CLAIMED_RUNS.clear()
        runs_execution.LOCAL_CLAIMED_RUNS.clear()
        runs_core.LOCAL_WORKER_REGISTRY.clear()
        runs_execution.LOCAL_WORKER_REGISTRY.clear()

    def tearDown(self) -> None:
        runs_core.runs.clear()
        runs_execution.runs.clear()
        runs_core.RUN_QUEUE_INDEX.clear()
        runs_execution.RUN_QUEUE_INDEX.clear()
        runs_core.LOCAL_PENDING_RUN_IDS.clear()
        runs_execution.LOCAL_PENDING_RUN_IDS.clear()
        runs_core.LOCAL_CLAIMED_RUNS.clear()
        runs_execution.LOCAL_CLAIMED_RUNS.clear()
        runs_core.LOCAL_WORKER_REGISTRY.clear()
        runs_execution.LOCAL_WORKER_REGISTRY.clear()
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.tmpdir.cleanup()

    def test_create_run_persists_live_run_and_local_queue_state(self):
        run_id = runs_execution.create_run(
            "orion",
            {
                "workspace_id": "ws-local",
                "user_goal": "Summarize inbox",
                "metadata": {"execution_target_selected": "local_companion"},
            },
        )

        live_runs = list_live_run_states(self.db_path)
        self.assertEqual(len(live_runs), 1)
        self.assertEqual(live_runs[0]["run_id"], run_id)
        self.assertEqual(live_runs[0]["status"], "queued_local")

        local_state = load_local_runtime_state(self.db_path)
        self.assertEqual(local_state["pending_run_ids"], [run_id])
        self.assertEqual(local_state["claimed_runs"], {})

    def test_load_live_runtime_state_restores_waiting_confirmation(self):
        run_id = "run-waiting-1"
        run = {
            "run_id": run_id,
            "status": "waiting_for_input",
            "engine": "orion",
            "context": {
                "workspace_id": "ws-confirm",
                "user_goal": "Send this reply",
                "metadata": {},
            },
            "created_at": "2026-03-29T00:00:00Z",
            "updated_at": "2026-03-29T00:01:00Z",
            "result": None,
            "result_data": None,
            "events": [],
            "tool_policy_audit": [],
            "memory_trace": {
                "enabled": False,
                "reads": [],
                "writes": [],
                "last_error": None,
                "updated_at": "2026-03-29T00:01:00Z",
            },
            "pending_approval": {
                "approval_id": "approval-123",
                "status": "waiting",
                "scope": "once",
                "reusable": False,
                "prompt": "Confirm send",
            },
            "_event_seq": 0,
        }
        runs_output._persist_live_run_state(run_id, run)

        runs_core._load_live_runtime_state()

        restored = runs_core.runs[run_id]
        self.assertEqual(restored["status"], "waiting_for_input")
        self.assertEqual(restored["pending_approval"]["approval_id"], "approval-123")
        self.assertIsInstance(restored["logs"], queue.Queue)
        self.assertIsInstance(restored["input_queue"], queue.Queue)
        self.assertEqual(runs_core.LOCAL_PENDING_RUN_IDS, [])


if __name__ == "__main__":
    unittest.main()
