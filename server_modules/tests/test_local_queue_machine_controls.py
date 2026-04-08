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
