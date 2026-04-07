import threading
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from server_modules import local_queue, safe_mode_service


class LocalQueueMachineControlTests(unittest.TestCase):
    def setUp(self) -> None:
        safe_mode_service.reset_state_for_tests()

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


if __name__ == "__main__":
    unittest.main()
