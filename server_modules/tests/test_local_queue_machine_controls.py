import threading
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from server_modules import local_queue, safe_mode_service


class LocalQueueMachineControlTests(unittest.TestCase):
    def setUp(self) -> None:
        safe_mode_service.reset_state_for_tests()
        local_queue.reset_runtime_control_stream_state_for_tests()

    def test_handle_get_local_workers_status_exposes_permission_and_policy_state(self) -> None:
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={
                "machine-1": {
                    "machine_id": "machine-1",
                    "runtime_id": "machine-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "runtime_type": "local_companion",
                    "display_name": "Desk Mac",
                    "platform": "darwin",
                    "policy_mode": "trusted_full_access",
                    "capabilities": ["screenshot.capture", "browser_automation.interactive", "shell.execute"],
                    "execution_targets": ["local_companion"],
                    "status": "idle",
                    "last_seen_at": "2026-04-08T10:00:00Z",
                    "registered_at": "2026-04-08T09:00:00Z",
                    "trust_state": "verified",
                    "permission_probe": {"screen_recording": {"status": "granted", "source": "probe"}},
                    "permission_probe_updated_at": "2026-04-08T10:00:00Z",
                }
            },
            LOCAL_PENDING_RUN_IDS=[],
            LOCAL_CLAIMED_RUNS={},
            ORION_LOCAL_COMPANION_ENABLED=True,
            ORION_LOCAL_LEASE_SECONDS=30,
            ORION_RUNTIME_POLICY_MODE_DEFAULT="local_default",
            _utc_now=lambda: datetime.fromisoformat("2026-04-08T10:00:10"),
            _utc_now_iso=lambda: "2026-04-08T10:00:10Z",
            _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
        )
        safe_mode_service.set_safe_mode(enabled=True, workspace_id="ws-1", reason="Maintenance window")
        safe_mode_service.set_kill_switch(scope="machine", enabled=True, machine_id="machine-1", reason="Operator stop")
        try:
            with (
                patch.object(local_queue, "_cleanup_stale_local_claims", return_value=[]),
                patch.object(local_queue, "_mark_ghost_enrollments_failed", return_value=[]),
                patch.object(local_queue.run_state_repository, "sync_list_fleet_workers", return_value=[]),
                patch.object(local_queue.run_state_repository, "sync_get_local_queue_dead_letter_status", return_value={"dead_letter_count": 0, "workspace_hotspots": [], "specialist_hotspots": [], "total_failure_count": 0, "last_recorded_at": None}),
            ):
                payload = local_queue.handle_get_local_workers_status()
        finally:
            local_queue._server = original_server
            safe_mode_service.reset_state_for_tests()

        item = payload["items"][0]
        self.assertEqual(item["permission_probe"]["screen_recording"]["status"], "granted")
        self.assertEqual(item["permission_probe"]["accessibility"]["status"], "unknown")
        self.assertTrue(item["safe_mode_status"]["active"])
        self.assertTrue(item["kill_switch_status"]["active"])
        self.assertEqual(payload["summary"]["revoked"], 0)
        self.assertEqual(payload["pressure"]["state"], "healthy")

    def test_handle_delete_local_runtime_marks_machine_revoked(self) -> None:
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={
                "machine-1": {
                    "machine_id": "machine-1",
                    "runtime_id": "machine-1",
                    "workspace_id": "default",
                    "tenant_id": "default",
                    "status": "idle",
                    "capabilities": [],
                    "execution_targets": ["local_companion"],
                }
            },
            _utc_now_iso=lambda: "2026-04-08T11:00:00Z",
        )
        try:
            with (
                patch.object(local_queue, "_persist_local_runtime_state", return_value=None),
                patch.object(local_queue, "_emit_machine_outbox_event", return_value=None),
                patch.object(
                    local_queue,
                    "handle_get_local_workers_status",
                    return_value={"items": [{"machine_id": "machine-1", "control_state": "revoked"}]},
                ),
            ):
                payload = local_queue.handle_delete_local_runtime("machine-1")
        finally:
            local_queue._server = original_server

        self.assertTrue(payload["revoked"])
        self.assertFalse(payload["deleted"])
        self.assertEqual(local_queue._server, original_server)

    def test_handle_get_local_run_control_state_pauses_revoked_machine(self) -> None:
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={"machine-1": {"machine_id": "machine-1", "control_state": "revoked"}},
            runs={
                "00000000-0000-0000-0000-000000000001": {
                    "status": "running_local",
                    "context": {"metadata": {"machine_id": "machine-1"}},
                }
            },
        )
        try:
            payload = local_queue.handle_get_local_run_control_state(
                local_queue.uuid.UUID("00000000-0000-0000-0000-000000000001"),
                local_queue.LocalRunControlStatePayload(worker_id="machine-1"),
            )
        finally:
            local_queue._server = original_server

        self.assertTrue(payload["pause_requested"])
        self.assertEqual(payload["wait_reason"], "machine_revoked")
        self.assertEqual(payload["machine_control_state"], "revoked")

    def test_handle_request_local_runtime_hard_kill_marks_interrupting_and_streams_event(self) -> None:
        original_server = local_queue._server
        log_events = []
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={
                "machine-1": {
                    "machine_id": "machine-1",
                    "runtime_id": "machine-1",
                    "workspace_id": "default",
                    "tenant_id": "default",
                    "status": "busy",
                    "capabilities": [],
                    "execution_targets": ["local_companion"],
                }
            },
            LOCAL_CLAIMED_RUNS={
                "run-1": {"worker_id": "machine-1", "machine_id": "machine-1"},
            },
            runs={
                "run-1": {
                    "status": "running_local",
                    "context": {"metadata": {"machine_id": "machine-1"}},
                    "logs": object(),
                }
            },
            _utc_now_iso=lambda: "2026-04-08T11:05:00Z",
            emit_log=lambda *args, **kwargs: log_events.append((args, kwargs)),
            set_run_status=lambda *_args, **_kwargs: None,
            ORION_LOCAL_COMPANION_ENABLED=True,
            ORION_LOCAL_LEASE_SECONDS=30,
            ORION_RUNTIME_POLICY_MODE_DEFAULT="local_default",
            _utc_now=lambda: datetime.fromisoformat("2026-04-08T11:05:00"),
            _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
        )
        try:
            with (
                patch.object(local_queue, "_persist_local_runtime_state", return_value=None),
                patch.object(local_queue, "_emit_machine_outbox_event", return_value=None),
                patch.object(local_queue, "handle_get_local_workers_status", return_value={"items": [{"machine_id": "machine-1", "control_state": "interrupting"}]}),
            ):
                payload = local_queue.handle_request_local_runtime_hard_kill(
                    "machine-1",
                    reason="Operator stop",
                    requested_by="owner-1",
                )
        finally:
            local_queue._server = original_server

        self.assertEqual(payload["machine_id"], "machine-1")
        self.assertEqual(payload["machine"]["control_state"], "interrupting")
        self.assertEqual(payload["requested_run_ids"], ["run-1"])
        events = local_queue._list_runtime_control_events("machine-1", since_sequence=0)
        self.assertEqual([item["event"] for item in events], ["run_interrupt", "hard_kill"])

    def test_handle_get_local_workers_status_merges_durable_fleet_workers_and_prewarm_capacity(self) -> None:
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={},
            LOCAL_PENDING_RUN_IDS=[],
            LOCAL_CLAIMED_RUNS={},
            ORION_LOCAL_COMPANION_ENABLED=True,
            ORION_LOCAL_LEASE_SECONDS=30,
            ORION_RUNTIME_POLICY_MODE_DEFAULT="local_default",
            _utc_now=lambda: datetime.fromisoformat("2026-04-08T10:00:10"),
            _utc_now_iso=lambda: "2026-04-08T10:00:10Z",
            _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
        )
        try:
            with (
                patch.object(local_queue, "_cleanup_stale_local_claims", return_value=[]),
                patch.object(local_queue, "_mark_ghost_enrollments_failed", return_value=[]),
                patch.object(
                    local_queue.run_state_repository,
                    "sync_list_fleet_workers",
                    return_value=[
                        {
                            "worker_id": "hosted-1",
                            "runtime_id": "hosted-1",
                            "machine_id": "hosted-1",
                            "tenant_id": "tenant-1",
                            "workspace_id": "ws-1",
                            "runtime_type": "hosted_secure",
                            "status": "idle",
                            "display_name": "Hosted Warm Pool",
                            "execution_targets": ["hosted_secure"],
                            "prewarm_state": "warm",
                            "last_seen_at": "2026-04-08T10:00:05Z",
                            "registered_at": "2026-04-08T10:00:00Z",
                        }
                    ],
                ),
                patch.object(local_queue.run_state_repository, "sync_get_local_queue_dead_letter_status", return_value={"dead_letter_count": 0, "workspace_hotspots": [], "specialist_hotspots": [], "total_failure_count": 0, "last_recorded_at": None}),
            ):
                payload = local_queue.handle_get_local_workers_status()
        finally:
            local_queue._server = original_server

        self.assertEqual(payload["summary"]["prewarmed_ready"], 1)
        self.assertEqual(payload["summary"]["hosted_ready"], 1)
        self.assertEqual(payload["items"][0]["prewarm_state"], "warm")
        self.assertEqual(payload["items"][0]["runtime_type"], "hosted_secure")

    def test_handle_start_local_runtime_sets_captain_identity_and_surface_hooks(self) -> None:
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={
                "machine-1": {
                    "machine_id": "machine-1",
                    "runtime_id": "machine-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "runtime_type": "local_companion",
                    "display_name": "Desk Mac",
                    "platform": "darwin",
                    "policy_mode": "trusted_full_access",
                    "capabilities": ["shell.execute"],
                    "execution_targets": ["local_companion"],
                    "status": "idle",
                    "registered_at": "2026-04-08T09:00:00Z",
                    "last_seen_at": "2026-04-08T09:59:50Z",
                    "control_state": "active",
                    "lifecycle_state": "registered",
                }
            },
            LOCAL_PENDING_RUN_IDS=[],
            LOCAL_CLAIMED_RUNS={},
            ORION_LOCAL_COMPANION_ENABLED=True,
            ORION_LOCAL_LEASE_SECONDS=30,
            ORION_RUNTIME_POLICY_MODE_DEFAULT="local_default",
            _utc_now=lambda: datetime.fromisoformat("2026-04-08T10:00:10"),
            _utc_now_iso=lambda: "2026-04-08T10:00:10Z",
            _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
            runs={},
        )
        try:
            with (
                patch.object(local_queue, "_hydrate_worker_from_durable_registry", return_value=None),
                patch.object(local_queue, "_persist_local_runtime_state", return_value=None),
                patch.object(local_queue, "_sync_durable_fleet_worker", return_value=None),
                patch.object(local_queue, "_emit_machine_outbox_event", return_value=None),
                patch.object(local_queue, "_cleanup_stale_local_claims", return_value=[]),
                patch.object(local_queue, "_mark_ghost_enrollments_failed", return_value=[]),
                patch.object(local_queue.run_state_repository, "sync_list_fleet_workers", return_value=[]),
                patch.object(local_queue.run_state_repository, "sync_get_local_queue_dead_letter_status", return_value={"dead_letter_count": 0, "workspace_hotspots": [], "specialist_hotspots": [], "total_failure_count": 0, "last_recorded_at": None}),
            ):
                payload = local_queue.handle_start_local_runtime(
                    "machine-1",
                    local_queue.LocalWorkerHeartbeatPayload(
                        note="Captain booted",
                        runtime_role="captain",
                        summary_channel="captain-feed",
                        artifact_channel="captain-artifacts",
                        summary_text="Captain started and ready.",
                        artifacts=[{"name": "report.md", "path": "/tmp/report.md", "review_required": True}],
                        health_state="healthy",
                    ),
                )
        finally:
            local_queue._server = original_server

        runtime = payload["runtime"]
        self.assertEqual(runtime["runtime_role"], "captain")
        self.assertEqual(runtime["lifecycle_state"], "running")
        self.assertEqual(runtime["summary_channel"], "captain-feed")
        self.assertTrue(runtime["local_private_memory_only"])
        self.assertEqual(runtime["last_summary"], "Captain started and ready.")
        self.assertEqual(runtime["last_artifacts"][0]["path"], "/tmp/report.md")

    def test_handle_stop_and_recover_local_runtime_tracks_recovery_ids(self) -> None:
        original_server = local_queue._server
        local_queue._server = SimpleNamespace(
            LOCAL_QUEUE_LOCK=threading.Lock(),
            LOCAL_WORKER_REGISTRY={
                "machine-2": {
                    "machine_id": "machine-2",
                    "runtime_id": "machine-2",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "runtime_type": "local_companion",
                    "runtime_role": "specialist",
                    "install_id": "install-1",
                    "specialist_key": "support-bot",
                    "display_name": "Support Specialist",
                    "platform": "darwin",
                    "policy_mode": "trusted_full_access",
                    "capabilities": ["shell.execute"],
                    "execution_targets": ["local_companion"],
                    "status": "busy",
                    "registered_at": "2026-04-08T09:00:00Z",
                    "last_seen_at": "2026-04-08T09:59:50Z",
                    "control_state": "active",
                    "lifecycle_state": "running",
                }
            },
            LOCAL_PENDING_RUN_IDS=[],
            LOCAL_CLAIMED_RUNS={},
            ORION_LOCAL_COMPANION_ENABLED=True,
            ORION_LOCAL_LEASE_SECONDS=30,
            ORION_RUNTIME_POLICY_MODE_DEFAULT="local_default",
            _utc_now=lambda: datetime.fromisoformat("2026-04-08T10:00:10"),
            _utc_now_iso=lambda: "2026-04-08T10:00:10Z",
            _parse_utc_ts=lambda value: datetime.fromisoformat(str(value).replace("Z", "")) if value else None,
            runs={
                "run-1": {"local_worker_id": "machine-2"},
                "run-2": {"context": {"metadata": {"machine_id": "machine-2"}}},
            },
        )
        try:
            with (
                patch.object(local_queue, "_hydrate_worker_from_durable_registry", return_value=None),
                patch.object(local_queue, "_persist_local_runtime_state", return_value=None),
                patch.object(local_queue, "_sync_durable_fleet_worker", return_value=None),
                patch.object(local_queue, "_emit_machine_outbox_event", return_value=None),
                patch.object(local_queue, "_cleanup_stale_local_claims", return_value=[]),
                patch.object(local_queue, "_mark_ghost_enrollments_failed", return_value=[]),
                patch.object(local_queue.run_state_repository, "sync_list_fleet_workers", return_value=[]),
                patch.object(local_queue.run_state_repository, "sync_get_local_queue_dead_letter_status", return_value={"dead_letter_count": 0, "workspace_hotspots": [], "specialist_hotspots": [], "total_failure_count": 0, "last_recorded_at": None}),
                patch.object(local_queue, "recover_expired_worker_leases_on_startup", return_value=["run-1"]),
                patch.object(local_queue, "recover_orphaned_local_runs_on_startup", return_value=[]),
                patch.object(local_queue, "_resume_due_checkpoint_recoveries", return_value=["run-2"]),
            ):
                stopped = local_queue.handle_stop_local_runtime("machine-2", reason="Operator stop")
                recovered = local_queue.handle_recover_local_runtime(
                    "machine-2",
                    local_queue.LocalWorkerHeartbeatPayload(
                        note="Recovered after restart",
                        runtime_role="specialist",
                        install_id="install-1",
                        specialist_key="support-bot",
                    ),
                )
        finally:
            local_queue._server = original_server

        self.assertEqual(stopped["runtime"]["lifecycle_state"], "stopped")
        self.assertFalse(stopped["runtime"]["online"])
        self.assertEqual(recovered["runtime"]["lifecycle_state"], "running")
        self.assertEqual(recovered["runtime"]["last_recovered_run_ids"], ["run-1"])
        self.assertEqual(recovered["runtime"]["last_resumed_run_ids"], ["run-2"])
        self.assertEqual(recovered["runtime"]["runtime_role"], "specialist")

    def test_iter_runtime_control_stream_yields_backlog_event(self) -> None:
        local_queue._append_runtime_control_event(
            "machine-1",
            "hard_kill",
            {
                "machine_id": "machine-1",
                "reason": "Operator stop",
                "scope": "machine",
            },
        )

        iterator = local_queue.iter_runtime_control_stream(
            "machine-1",
            since_sequence=0,
            include_backlog=True,
            heartbeat_seconds=5.0,
            timeout_seconds=1.0,
        )
        payload = next(iterator)

        self.assertEqual(payload["event"], "hard_kill")
        self.assertEqual(payload["data"]["machine_id"], "machine-1")
        self.assertEqual(payload["data"]["reason"], "Operator stop")


if __name__ == "__main__":
    unittest.main()
