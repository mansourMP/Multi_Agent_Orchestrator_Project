import queue
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from server_modules import outbox_service, run_state_repository, runs_core, runs_engine, runs_execution, runs_output, runtime_runs_api, shared
from server_modules.runtime_state_store import (
    init_runtime_state_db,
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
        self.live_run_store: dict[str, dict] = {}
        self.archive_store: dict[str, dict] = {}
        self.patchers.extend(
            [
                patch.object(
                    run_state_repository,
                    "sync_upsert_live_run",
                    side_effect=self._sync_upsert_live_run,
                ),
                patch.object(
                    run_state_repository,
                    "sync_delete_live_run",
                    side_effect=self._sync_delete_live_run,
                ),
                patch.object(
                    run_state_repository,
                    "sync_list_live_runs",
                    side_effect=self._sync_list_live_runs,
                ),
                patch.object(
                    run_state_repository,
                    "sync_archive_run",
                    side_effect=self._sync_archive_run,
                ),
                patch.object(
                    run_state_repository,
                    "sync_list_run_archive",
                    side_effect=self._sync_list_run_archive,
                ),
            ]
        )
        for patcher in self.patchers:
            patcher.start()
        shared.sync_acp_manager_paths(runtime_db_path=self.db_path)
        runs_core.ACP_MANAGER.reload_runtime_state()
        runs_core.runs.clear()
        runs_engine.runs.clear()
        runs_execution.runs.clear()
        runs_core.RUN_QUEUE_INDEX.clear()
        runs_engine.RUN_QUEUE_INDEX.clear()
        runs_execution.RUN_QUEUE_INDEX.clear()
        runs_core.LOCAL_PENDING_RUN_IDS.clear()
        runs_execution.LOCAL_PENDING_RUN_IDS.clear()
        runs_core.LOCAL_CLAIMED_RUNS.clear()
        runs_execution.LOCAL_CLAIMED_RUNS.clear()
        runs_core.LOCAL_WORKER_REGISTRY.clear()
        runs_execution.LOCAL_WORKER_REGISTRY.clear()

    def tearDown(self) -> None:
        runs_core.runs.clear()
        runs_engine.runs.clear()
        runs_execution.runs.clear()
        runs_core.RUN_QUEUE_INDEX.clear()
        runs_engine.RUN_QUEUE_INDEX.clear()
        runs_execution.RUN_QUEUE_INDEX.clear()
        runs_core.LOCAL_PENDING_RUN_IDS.clear()
        runs_execution.LOCAL_PENDING_RUN_IDS.clear()
        runs_core.LOCAL_CLAIMED_RUNS.clear()
        runs_execution.LOCAL_CLAIMED_RUNS.clear()
        runs_core.LOCAL_WORKER_REGISTRY.clear()
        runs_execution.LOCAL_WORKER_REGISTRY.clear()
        for patcher in reversed(self.patchers):
            patcher.stop()
        shared.sync_acp_manager_paths(runtime_db_path=runs_core.ORION_RUNTIME_STATE_DB)
        runs_core.ACP_MANAGER.reload_runtime_state()
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

        live_runs = run_state_repository.sync_list_live_runs()
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

    def test_load_live_runtime_state_prunes_orphaned_local_queue_cache(self):
        outbox_service.persist_local_runtime_state(
            db_path=self.db_path,
            pending_run_ids=["orphan-run"],
            claimed_runs={"ghost-run": {"worker_id": "worker-1", "claimed_at": "2026-04-10T00:00:00Z"}},
            runtime_registrations={"worker-1": {"status": "busy", "current_run_id": "ghost-run"}},
        )

        runs_core._load_live_runtime_state()

        self.assertEqual(runs_core.LOCAL_PENDING_RUN_IDS, [])
        self.assertEqual(runs_core.LOCAL_CLAIMED_RUNS, {})
        local_state = load_local_runtime_state(self.db_path)
        self.assertEqual(local_state["pending_run_ids"], [])
        self.assertEqual(local_state["claimed_runs"], {})

    @patch("server_modules.runs_engine._append_approval_audit")
    def test_wait_for_human_response_consumes_resolved_confirmation_after_restart(self, audit_mock):
        run_id = "run-resume-1"
        log_queue: queue.Queue = queue.Queue()
        run = {
            "run_id": run_id,
            "status": "waiting_for_input",
            "engine": "orion",
            "logs": log_queue,
            "input_queue": queue.Queue(),
            "thread_id": None,
            "context": {"workspace_id": "default", "metadata": {}},
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
            "pending_confirmation": {
                "approval_id": "approval-resume-1",
                "correlation_id": "run:resume:approval-1",
                "status": "resolved",
                "scope": "once",
                "reusable": False,
                "prompt": "Confirm send",
                "decision": "proceed",
                "note": "resume after restart",
            },
            "pending_approval": {
                "approval_id": "approval-resume-1",
                "correlation_id": "run:resume:approval-1",
                "status": "resolved",
                "scope": "once",
                "reusable": False,
                "prompt": "Confirm send",
                "decision": "proceed",
                "note": "resume after restart",
            },
            "_event_seq": 0,
            "_resume_after_confirmation_scheduled": True,
        }
        runs_core.runs[run_id] = run
        runs_engine.runs[run_id] = run
        runs_execution.runs[run_id] = run
        stored_run = runs_core.runs[run_id]
        runs_core.RUN_QUEUE_INDEX[id(log_queue)] = run_id
        runs_engine.RUN_QUEUE_INDEX[id(log_queue)] = run_id
        runs_execution.RUN_QUEUE_INDEX[id(log_queue)] = run_id

        response = runs_engine.wait_for_human_response(run_id, "Confirm send")

        self.assertTrue(response["approved"])
        self.assertEqual(stored_run["status"], "executing")
        self.assertIsNone(stored_run["pending_confirmation"])
        self.assertIsNone(stored_run["pending_approval"])
        self.assertFalse(stored_run.get("_resume_after_confirmation_scheduled"))
        self.assertGreaterEqual(audit_mock.call_count, 2)

    @patch("server_modules.runs_core._append_approval_audit")
    def test_wait_for_human_response_consumes_resume_confirmation_token(self, audit_mock):
        run_id = "run-resume-token-1"
        log_queue: queue.Queue = queue.Queue()
        run = {
            "run_id": run_id,
            "status": "waiting_for_input",
            "engine": "orion",
            "logs": log_queue,
            "input_queue": queue.Queue(),
            "thread_id": None,
            "context": {"workspace_id": "default", "metadata": {}},
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
            "pending_confirmation": {
                "approval_id": "approval-token-1",
                "correlation_id": "run:resume:approval-token-1",
                "status": "waiting",
                "scope": "once",
                "reusable": False,
                "prompt": "Confirm send",
            },
            "pending_approval": {
                "approval_id": "approval-token-1",
                "correlation_id": "run:resume:approval-token-1",
                "status": "waiting",
                "scope": "once",
                "reusable": False,
                "prompt": "Confirm send",
            },
            "_resume_confirmation_token": {
                "approval_id": "approval-token-1",
                "correlation_id": "run:resume:approval-token-1",
                "prompt": "Confirm send",
                "decision": "approve",
                "note": "restored standalone approval",
                "resolved_at": "2026-03-29T00:01:30Z",
                "scope": "once",
                "reusable": False,
            },
            "_event_seq": 0,
        }
        runs_core.runs[run_id] = run
        runs_engine.runs[run_id] = run
        runs_execution.runs[run_id] = run
        stored_run = runs_core.runs[run_id]
        runs_core.RUN_QUEUE_INDEX[id(log_queue)] = run_id
        runs_engine.RUN_QUEUE_INDEX[id(log_queue)] = run_id
        runs_execution.RUN_QUEUE_INDEX[id(log_queue)] = run_id

        response = runs_engine.wait_for_human_response(run_id, "Confirm send")

        self.assertTrue(response["approved"])
        self.assertEqual(stored_run["status"], "executing")
        self.assertIsNone(stored_run["pending_confirmation"])
        self.assertIsNone(stored_run["pending_approval"])
        self.assertNotIn("_resume_confirmation_token", stored_run)

    @patch("server_modules.runtime_runs_api.threading.Thread")
    @patch("server_modules.runtime_runs_api._late_server_export")
    def test_schedule_restored_run_resume_starts_once(self, late_export_mock, thread_cls_mock):
        persist_mock = Mock()
        mission_mock = Mock()

        def late_export(name: str):
            if name == "_persist_live_run_state":
                return persist_mock
            if name == "run_mission":
                return mission_mock
            raise AssertionError(name)

        late_export_mock.side_effect = late_export
        worker = Mock()
        thread_cls_mock.return_value = worker
        run = {
            "run_id": "run-resume-2",
            "status": "waiting_for_input",
            "thread_id": None,
        }

        first = runtime_runs_api._schedule_restored_run_resume("run-resume-2", run)
        second = runtime_runs_api._schedule_restored_run_resume("run-resume-2", run)

        self.assertTrue(first)
        self.assertTrue(second)
        self.assertTrue(run["_resume_after_confirmation_scheduled"])
        persist_mock.assert_called_once()
        worker.start.assert_called_once()

    def test_serialize_run_snapshot_preserves_pending_confirmation_alias(self):
        run = {
            "status": "waiting_for_input",
            "engine": "orion",
            "context": {
                "workspace_id": "default",
                "metadata": {},
            },
            "created_at": "2026-03-29T00:00:00Z",
            "updated_at": "2026-03-29T00:01:00Z",
            "completed_at": None,
            "duration_ms": None,
            "result": None,
            "result_data": {
                "outputs": {
                    "actions": [
                        {
                            "tool": "browser_automation",
                            "tabs": [
                                {"tabId": "main", "url": "https://example.com/login", "active": True},
                                {"tabId": "tab-2", "url": "https://example.com/help", "active": False},
                            ],
                            "console_entries": [{"tab": "main", "message": "warn"}],
                            "network_failures": [{"tab": "main", "url": "https://example.com/api", "error": "net::ERR_ABORTED"}],
                            "role_snapshot": [{"tag": "button", "role": "button", "name": "Sign in"}],
                            "accessibility_snapshot": {"nodes": [{"role": "RootWebArea", "name": "Example"}]},
                        }
                    ]
                }
            },
            "events": [],
            "tool_policy_audit": [],
            "usage_masked": {},
            "memory_trace": {
                "enabled": False,
                "reads": [],
                "writes": [],
                "last_error": None,
                "updated_at": "2026-03-29T00:01:00Z",
            },
            "pending_confirmation": {
                "approval_id": "approval-serialize-1",
                "prompt": "Confirm local execution",
                "status": "waiting",
            },
            "browser_checkpoint": {
                "current_url": "https://example.com/login",
                "next_action_index": 2,
                "session_profile": "qa-browser",
            },
        }

        snapshot = runs_output._serialize_run_snapshot("run-serialize-1", run)

        self.assertEqual(snapshot["pending_confirmation"]["approval_id"], "approval-serialize-1")
        self.assertEqual(snapshot["pending_approval"]["approval_id"], "approval-serialize-1")
        self.assertEqual(snapshot["browser_checkpoint"]["next_action_index"], 2)
        self.assertEqual(len(snapshot["browser_introspection"]["tabs"]), 2)
        self.assertEqual(snapshot["browser_introspection"]["console_entries"][0]["message"], "warn")

    @patch("server_modules.runtime_runs_api._late_server_export")
    def test_schedule_restored_run_resume_requeues_local_checkpoint_run(self, late_export_mock):
        persisted = []
        enqueued = []

        def late_export(name: str):
            if name == "_persist_live_run_state":
                return lambda run_id, run: persisted.append((run_id, run.get("status")))
            if name == "_enqueue_local_companion_run":
                return lambda run_id, message="Run queued for Local Companion execution.", event="local_queued": enqueued.append((run_id, message, event))
            if name == "run_mission":
                return Mock()
            raise AssertionError(name)

        late_export_mock.side_effect = late_export
        run = {
            "run_id": "run-local-resume-1",
            "status": "waiting_for_input",
            "thread_id": None,
            "context": {
                "metadata": {
                    "execution_target_selected": "local_companion",
                }
            },
            "browser_checkpoint": {
                "current_url": "https://example.com/private",
                "next_action_index": 3,
                "session_profile": "qa-browser",
            },
        }

        resumed = runtime_runs_api._schedule_restored_run_resume("run-local-resume-1", run)

        self.assertTrue(resumed)
        self.assertTrue(run["_resume_after_confirmation_scheduled"])
        self.assertEqual(enqueued[0][0], "run-local-resume-1")
        self.assertEqual(enqueued[0][2], "local_resumed_from_checkpoint")

    def _sync_upsert_live_run(
        self,
        run_id: str,
        workspace_id: str,
        tenant_id: str,
        state: str,
        payload: dict,
        trace_id: str,
    ) -> None:
        snapshot = dict(payload)
        snapshot["run_id"] = run_id
        snapshot["workspace_id"] = workspace_id
        snapshot["tenant_id"] = tenant_id
        snapshot["status"] = state
        snapshot["trace_id"] = trace_id
        self.live_run_store[run_id] = snapshot

    def _sync_delete_live_run(self, run_id: str) -> None:
        self.live_run_store.pop(run_id, None)

    def _sync_list_live_runs(self) -> list[dict]:
        return [dict(item) for item in self.live_run_store.values()]

    def _sync_archive_run(self, run_id: str, final_state: str, payload: dict, trace_id: str) -> None:
        snapshot = dict(payload)
        snapshot["run_id"] = run_id
        snapshot["status"] = final_state
        snapshot["trace_id"] = trace_id
        self.archive_store[run_id] = snapshot

    def _sync_list_run_archive(self, limit: int = 200) -> list[dict]:
        items = list(self.archive_store.values())
        return [dict(item) for item in items[: max(1, int(limit or 0))]]


if __name__ == "__main__":
    unittest.main()
