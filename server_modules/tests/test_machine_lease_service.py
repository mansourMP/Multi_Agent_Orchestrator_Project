import threading
import unittest
from datetime import datetime
import queue

from server_modules import machine_lease_service


class MachineLeaseServiceTests(unittest.TestCase):
    def test_build_runtime_registration_record_sets_machine_identity(self) -> None:
        record = machine_lease_service.build_runtime_registration_record(
            "runtime-1",
            previous_record={},
            runtime_type="local",
            display_name="My Runtime",
            platform="darwin",
            policy_mode="local_default",
            capabilities=["browser_automation"],
            execution_targets=["local"],
            instance_id="instance-1",
            capability_digest=None,
            lease_seconds=30,
            now_iso="2026-04-06T00:00:00Z",
            normalize_policy_mode_fn=lambda value: str(value or "local_default"),
            capability_digest_fn=lambda capabilities: "digest-1",
        )

        self.assertEqual(record["runtime_id"], "runtime-1")
        self.assertEqual(record["machine_id"], "runtime-1")
        self.assertEqual(record["lease_seconds"], 30)
        self.assertEqual(record["trust_state"], "unverified")

    def test_assert_machine_session_verifies_token_and_instance(self) -> None:
        registry = {
            "runtime-1": {
                "runtime_id": "runtime-1",
                "machine_id": "runtime-1",
                "instance_id": "instance-1",
                "session_token_hash": "hash:good",
            }
        }

        verified = machine_lease_service.assert_machine_session(
            "runtime-1",
            "good",
            machine_registry=registry,
            machine_registry_lock=threading.Lock(),
            instance_id="instance-1",
            hash_token_fn=lambda token: f"hash:{token}",
            touch_machine_session_fn=lambda record: record.update(
                {
                    "session_last_authenticated_at": "2026-04-06T00:00:00Z",
                    "trust_state": "verified",
                }
            ),
        )

        self.assertEqual(verified["runtime_id"], "runtime-1")
        self.assertEqual(verified["machine_id"], "runtime-1")
        self.assertEqual(registry["runtime-1"]["trust_state"], "verified")

    def test_claim_local_machine_lease_records_machine_and_lease_identity(self) -> None:
        pending = ["run-1"]
        claimed = {}
        persisted = []
        seen = []
        runs = {
            "run-1": {
                "status": "queued_local",
                "context": {
                    "workspace_id": "default",
                    "metadata": {"owner_user_id": "user-1"},
                },
            }
        }
        worker_registry = {
            "worker-1": {
                "runtime_id": "worker-1",
                "machine_id": "machine-1",
                "capabilities": ["browser_automation"],
            }
        }

        claimed_run = machine_lease_service.claim_local_machine_lease(
            "worker-1",
            required_capabilities=["browser_automation"],
            local_queue_lock=threading.Lock(),
            pending_run_ids=pending,
            claimed_runs=claimed,
            worker_registry=worker_registry,
            runs_by_id=runs,
            lease_seconds=45,
            cleanup_stale_local_claims_fn=lambda: None,
            ordered_runtime_preferences_for_run_fn=lambda run: [],
            best_online_preferred_runtime_fn=lambda ids: None,
            required_capabilities_for_run_fn=lambda run: ["browser_automation"],
            normalize_capability_ids_fn=lambda items: [str(item).strip().lower() for item in (items or [])],
            persist_local_runtime_state_fn=lambda: persisted.append(True),
            mark_local_worker_seen_fn=lambda worker_id, run_id, status, note=None: seen.append(
                (worker_id, run_id, status, note)
            ),
            now_iso_fn=lambda: "2026-04-06T00:00:00Z",
            lease_id_factory=lambda: "lease-1",
        )

        self.assertEqual(claimed_run, "run-1")
        self.assertEqual(claimed["run-1"]["machine_id"], "machine-1")
        self.assertEqual(claimed["run-1"]["lease_id"], "lease-1")
        self.assertEqual(claimed["run-1"]["workspace_id"], "default")
        self.assertEqual(claimed["run-1"]["actor_id"], "user-1")
        self.assertEqual(persisted, [True])
        self.assertEqual(seen, [("worker-1", "run-1", "busy", "claimed_local_run")])

    def test_release_machine_lease_claim_releases_and_marks_worker_idle(self) -> None:
        claimed = {
            "run-1": {
                "worker_id": "worker-1",
                "machine_id": "machine-1",
                "lease_id": "lease-1",
            }
        }
        persisted = []
        seen = []

        result = machine_lease_service.release_machine_lease_claim(
            "run-1",
            worker_id="worker-1",
            local_queue_lock=threading.Lock(),
            claimed_runs=claimed,
            persist_local_runtime_state_fn=lambda: persisted.append(True),
            mark_local_worker_seen_fn=lambda worker_id, run_id, status, note=None: seen.append(
                (worker_id, run_id, status, note)
            ),
            status_hint="idle",
            note="paused_waiting_for_input",
        )

        self.assertTrue(result["released"])
        self.assertEqual(result["resolved_worker"], "worker-1")
        self.assertEqual(claimed, {})
        self.assertEqual(persisted, [True])
        self.assertEqual(seen, [("worker-1", None, "idle", "paused_waiting_for_input")])

    def test_cleanup_stale_machine_leases_moves_worker_offline_and_fails_run(self) -> None:
        claimed = {
            "run-1": {
                "worker_id": "worker-1",
                "machine_id": "machine-1",
                "lease_id": "lease-1",
                "claimed_at": "2026-04-06T00:00:00Z",
                "last_heartbeat_at": "2026-04-06T00:00:00Z",
                "lease_seconds": 30,
            }
        }
        worker_registry = {
            "worker-1": {
                "worker_id": "worker-1",
                "runtime_id": "worker-1",
                "machine_id": "machine-1",
                "lease_seconds": 30,
            }
        }
        logs = []
        statuses = []
        persisted = []
        run = {"status": "running_local", "logs": queue.Queue()}

        stale = machine_lease_service.cleanup_stale_machine_leases(
            now=datetime.fromisoformat("2026-04-06T00:01:00"),
            local_queue_lock=threading.Lock(),
            claimed_runs=claimed,
            worker_registry=worker_registry,
            runs_by_id={"run-1": run},
            parse_utc_ts_fn=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
            utc_now_iso_fn=lambda: "2026-04-06T00:01:00Z",
            persist_local_runtime_state_fn=lambda: persisted.append(True),
            emit_log_fn=lambda log_queue, level, message, **kwargs: logs.append((level, message, kwargs)),
            set_run_status_fn=lambda run_id, status: statuses.append((run_id, status)),
            schedule_restored_run_resume_fn=lambda run_id, run: False,
            local_worker_lost_timeout_seconds=30,
            default_lease_seconds=30,
        )

        self.assertEqual(stale, ["run-1"])
        self.assertEqual(claimed, {})
        self.assertEqual(worker_registry["worker-1"]["status"], "offline")
        self.assertIsNone(run["local_worker_id"])
        self.assertIsNone(run["machine_lease_id"])
        self.assertEqual(run["result_data"]["machine_id"], "machine-1")
        self.assertEqual(statuses, [("run-1", "failed")])
        self.assertEqual(persisted, [True])
        self.assertEqual(logs[0][2]["event"], "local_worker_lost")

    def test_cleanup_stale_machine_leases_recovers_checkpoint_run_and_schedules_resume(self) -> None:
        claimed = {
            "run-1": {
                "worker_id": "worker-1",
                "machine_id": "machine-1",
                "lease_id": "lease-1",
                "claimed_at": "2026-04-06T00:00:00Z",
                "last_heartbeat_at": "2026-04-06T00:00:00Z",
                "lease_seconds": 30,
            }
        }
        worker_registry = {
            "worker-1": {
                "worker_id": "worker-1",
                "runtime_id": "worker-1",
                "machine_id": "machine-1",
                "lease_seconds": 30,
            }
        }
        logs = []
        statuses = []
        persisted = []
        scheduled = []
        run = {
            "status": "running_local",
            "logs": queue.Queue(),
            "browser_checkpoint": {"next_action_index": 4, "session_profile": "qa-browser"},
            "context": {"metadata": {"execution_target_selected": "local_companion"}},
        }

        stale = machine_lease_service.cleanup_stale_machine_leases(
            now=datetime.fromisoformat("2026-04-06T00:01:00"),
            local_queue_lock=threading.Lock(),
            claimed_runs=claimed,
            worker_registry=worker_registry,
            runs_by_id={"run-1": run},
            parse_utc_ts_fn=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
            utc_now_iso_fn=lambda: "2026-04-06T00:01:00Z",
            persist_local_runtime_state_fn=lambda: persisted.append(True),
            emit_log_fn=lambda log_queue, level, message, **kwargs: logs.append((level, message, kwargs)),
            set_run_status_fn=lambda run_id, status: statuses.append((run_id, status)) or run.__setitem__("status", status),
            schedule_restored_run_resume_fn=lambda run_id, live_run: scheduled.append((run_id, live_run.get("status"))) or True,
            local_worker_lost_timeout_seconds=30,
            default_lease_seconds=30,
        )

        self.assertEqual(stale, ["run-1"])
        self.assertEqual(claimed, {})
        self.assertEqual(worker_registry["worker-1"]["status"], "offline")
        self.assertEqual(statuses, [("run-1", "waiting_for_input")])
        self.assertEqual(scheduled, [("run-1", "waiting_for_input")])
        self.assertTrue(run["context"]["metadata"]["browser_resume_supported"])
        self.assertEqual(run["result_data"]["error"], "local_worker_lost_recoverable")
        self.assertEqual(logs[0][2]["event"], "local_worker_lost_recoverable")
        self.assertEqual(logs[1][2]["event"], "local_resume_scheduled_after_worker_loss")


if __name__ == "__main__":
    unittest.main()
