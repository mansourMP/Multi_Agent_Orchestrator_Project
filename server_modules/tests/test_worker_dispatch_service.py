import queue
import threading
import unittest

from server_modules import worker_dispatch_service


class WorkerDispatchServiceTests(unittest.TestCase):
    def test_claim_local_run_assigns_matching_worker_and_persists_state(self) -> None:
        persisted = []
        seen = []
        pending = ["run-1"]
        claimed = {}
        runs_by_id = {"run-1": {"status": "queued_local"}}
        worker_registry = {"worker-1": {"capabilities": ["browser_automation"]}}

        claimed_run_id = worker_dispatch_service.claim_local_run(
            "worker-1",
            required_capabilities=["browser_automation"],
            local_queue_lock=threading.Lock(),
            pending_run_ids=pending,
            claimed_runs=claimed,
            worker_registry=worker_registry,
            runs_by_id=runs_by_id,
            lease_seconds=45,
            cleanup_stale_local_claims_fn=lambda: None,
            ordered_runtime_preferences_for_run_fn=lambda run: [],
            best_online_preferred_runtime_fn=lambda runtime_ids: None,
            required_capabilities_for_run_fn=lambda run: ["browser_automation"],
            normalize_capability_ids_fn=lambda items: [str(item).strip().lower() for item in (items or [])],
            persist_local_runtime_state_fn=lambda: persisted.append(True),
            mark_local_worker_seen_fn=lambda worker_id, run_id, status, note=None: seen.append(
                (worker_id, run_id, status, note)
            ),
            now_iso_fn=lambda: "2026-04-06T00:00:00Z",
        )

        self.assertEqual(claimed_run_id, "run-1")
        self.assertEqual(claimed["run-1"]["worker_id"], "worker-1")
        self.assertEqual(claimed["run-1"]["machine_id"], "worker-1")
        self.assertTrue(str(claimed["run-1"]["lease_id"]))
        self.assertEqual(claimed["run-1"]["lease_seconds"], 45)
        self.assertEqual(persisted, [True])
        self.assertEqual(seen, [("worker-1", "run-1", "busy", "claimed_local_run")])

    def test_pause_local_run_releases_claim_and_sets_waiting_for_input(self) -> None:
        events = []
        statuses = []
        seen = []
        persisted = []
        run = {
            "status": "running_local",
            "logs": queue.Queue(),
            "context": {"metadata": {}},
            "machine_lease_id": "lease-1",
            "local_worker_id": "worker-1",
        }
        claimed = {"run-1": {"worker_id": "worker-1", "machine_id": "machine-1", "lease_id": "lease-1"}}

        result = worker_dispatch_service.pause_local_run(
            "run-1",
            worker_id="worker-1",
            result_text="Need approval",
            result_data={"summary": "Need approval"},
            browser_checkpoint={"session_profile": "default", "next_action_index": 2},
            wait_reason="human_required",
            runs_by_id={"run-1": run},
            local_queue_lock=threading.Lock(),
            claimed_runs=claimed,
            emit_log_fn=lambda logs, level, message, **kwargs: events.append((level, message, kwargs)),
            mark_local_worker_seen_fn=lambda worker_id, run_id, status, note=None: seen.append(
                (worker_id, run_id, status, note)
            ),
            set_run_status_fn=lambda run_id, status: statuses.append((run_id, status)),
            persist_local_runtime_state_fn=lambda: persisted.append(True),
        )

        self.assertEqual(result["waiting_for_input"], True)
        self.assertEqual(claimed, {})
        self.assertEqual(statuses, [("run-1", "waiting_for_input")])
        self.assertEqual(run["context"]["metadata"]["browser_resume_supported"], True)
        self.assertIsNone(run["machine_lease_id"])
        self.assertIsNone(run["local_worker_id"])
        self.assertEqual(persisted, [True])
        self.assertEqual(seen, [("worker-1", None, "idle", "paused_waiting_for_input")])
        self.assertEqual(events[0][2]["event"], "local_pause_required")

    def test_complete_local_run_finishes_and_persists_memory(self) -> None:
        events = []
        statuses = []
        persisted = []
        seen = []
        run = {
            "status": "running_local",
            "logs": queue.Queue(),
            "context": {"metadata": {}},
        }

        result = worker_dispatch_service.complete_local_run(
            "run-1",
            worker_id="worker-1",
            result_text="Completed locally",
            result_data={"summary": "Completed locally"},
            usage_masked={"tokens": 10},
            runs_by_id={"run-1": run},
            local_queue_lock=threading.Lock(),
            claimed_runs={"run-1": {"worker_id": "worker-1"}},
            emit_log_fn=lambda logs, level, message, **kwargs: events.append((level, message, kwargs)),
            mark_local_worker_seen_fn=lambda worker_id, run_id, status, note=None: seen.append(
                (worker_id, run_id, status, note)
            ),
            set_run_status_fn=lambda run_id, status: statuses.append((run_id, status)),
            persist_run_memory_fn=lambda run_id, payload: persisted.append((run_id, payload["result"])),
        )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(run["usage_masked"], {"tokens": 10})
        self.assertEqual(statuses, [("run-1", "completed")])
        self.assertEqual(persisted, [("run-1", "Completed locally")])
        self.assertEqual(seen, [("worker-1", None, "idle", "completed_run")])
        self.assertEqual(events[1][2]["event"], "run_complete")


if __name__ == "__main__":
    unittest.main()
