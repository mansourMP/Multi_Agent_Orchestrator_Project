import importlib
import queue
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import outbox_service
from server_modules import runtime_events


class OutboxServiceTests(unittest.TestCase):
    def test_emit_approval_resolved_event_persists_outbox_payload(self) -> None:
        persisted = []

        event = outbox_service.emit_approval_resolved_event(
            approval_id="approval-1",
            run_id="run-1",
            tenant_id="tenant-1",
            workspace_id="ws-1",
            resolution="approved",
            actor="user-1",
            reason="ok",
            trace_id="trace-1",
            persist_outbox_event_fn=lambda **kwargs: persisted.append(kwargs),
        )

        self.assertEqual(event.event_type, "approval_resolved")
        self.assertEqual(persisted[0]["event_id"], event.event_id)
        self.assertEqual(persisted[0]["payload"]["approval_id"], "approval-1")

    def test_emit_artifact_created_event_persists_outbox_payload(self) -> None:
        persisted = []

        event = outbox_service.emit_artifact_created_event(
            run_id="run-1",
            tenant_id="tenant-1",
            workspace_id="ws-1",
            artifact={"kind": "screenshot", "file_path": "/tmp/shot.png"},
            trace_id="trace-1",
            index=0,
            persist_outbox_event_fn=lambda **kwargs: persisted.append(kwargs),
        )

        self.assertEqual(event.event_type, "artifact_created")
        self.assertEqual(persisted[0]["payload"]["artifact_path"], "/tmp/shot.png")

    def test_persist_local_runtime_state_builds_normalized_snapshot(self) -> None:
        captured = {}

        def _replace(db_path, *, pending_run_ids, claimed_runs, runtime_registrations):
            captured["db_path"] = db_path
            captured["pending_run_ids"] = list(pending_run_ids)
            captured["claimed_runs"] = dict(claimed_runs)
            captured["runtime_registrations"] = dict(runtime_registrations)

        persisted = outbox_service.persist_local_runtime_state(
            db_path=Path("/tmp/runtime.sqlite3"),
            pending_run_ids=["run-1"],
            claimed_runs={"run-1": {"worker_id": "worker-1"}, "bad": "skip"},
            runtime_registrations={"worker-1": {"status": "idle"}, "bad": "skip"},
            replace_local_runtime_state_fn=_replace,
        )

        self.assertTrue(persisted)
        self.assertEqual(captured["pending_run_ids"], ["run-1"])
        self.assertEqual(captured["claimed_runs"], {"run-1": {"worker_id": "worker-1"}})
        self.assertEqual(captured["runtime_registrations"], {"worker-1": {"status": "idle"}})

    def test_enqueue_local_companion_run_updates_queue_persists_and_logs(self) -> None:
        events = []
        statuses = []
        persisted = {}
        run = {
            "logs": queue.Queue(),
            "context": {
                "metadata": {
                    "execution_target_waiting_for_runtime": True,
                    "execution_target_reason": "Waiting for an online machine.",
                    "execution_target_required_capabilities": ["browser_automation"],
                }
            },
        }

        def _replace(db_path, *, pending_run_ids, claimed_runs, runtime_registrations):
            persisted["pending_run_ids"] = list(pending_run_ids)
            persisted["claimed_runs"] = dict(claimed_runs)
            persisted["runtime_registrations"] = dict(runtime_registrations)

        queued = outbox_service.enqueue_local_companion_run(
            "run-1",
            runs_by_id={"run-1": run},
            set_run_status_fn=lambda run_id, status: statuses.append((run_id, status)),
            utc_now_iso_fn=lambda: "2026-04-06T00:00:00Z",
            local_queue_lock=__import__("threading").Lock(),
            pending_run_ids=[],
            claimed_runs={},
            runtime_registrations={"worker-1": {"status": "idle"}},
            db_path=Path("/tmp/runtime.sqlite3"),
            lease_seconds=30,
            emit_log_fn=lambda logs, level, message, **kwargs: events.append(
                {"level": level, "message": message, **kwargs}
            ),
            replace_local_runtime_state_fn=_replace,
        )

        self.assertTrue(queued)
        self.assertEqual(statuses, [("run-1", "queued_local")])
        self.assertEqual(persisted["pending_run_ids"], ["run-1"])
        self.assertEqual(events[0]["message"], "Waiting for an online machine.")
        self.assertEqual(events[0]["data"]["required_capabilities"], ["browser_automation"])

    def test_replay_undelivered_events_on_startup_delivers_and_marks(self) -> None:
        delivered = []
        marked = []

        replayed = outbox_service.replay_undelivered_events_on_startup(
            older_than_seconds=30,
            list_undelivered_outbox_events_fn=lambda **kwargs: [
                {
                    "event_id": "evt-1",
                    "event_type": "approval_resolved",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "run_id": "run-1",
                    "trace_id": "trace-1",
                    "idempotency_key": "approval_resolved:approval-1:approved",
                    "payload": {"approval_id": "approval-1"},
                }
            ],
            mark_outbox_event_delivered_fn=lambda event_id: marked.append(event_id),
            deliver_event_fn=lambda event: delivered.append(event.event_id) or True,
        )

        self.assertEqual(replayed, ["evt-1"])
        self.assertEqual(delivered, ["evt-1"])
        self.assertEqual(marked, ["evt-1"])

    def test_deliver_due_outbox_events_once_records_failure_and_poison_isolation(self) -> None:
        failures = []
        marked = []

        result = outbox_service.deliver_due_outbox_events_once(
            list_undelivered_outbox_events_fn=lambda **kwargs: [
                {
                    "event_id": "evt-bad",
                    "event_type": "approval_resolved",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "run_id": "run-1",
                    "trace_id": "trace-1",
                    "idempotency_key": "approval_resolved:approval-1:approved",
                    "payload": {"approval_id": "approval-1"},
                    "retry_count": 4,
                },
                {
                    "event_id": "evt-good",
                    "event_type": "artifact_created",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "run_id": "run-1",
                    "trace_id": "trace-1",
                    "idempotency_key": "artifact_created:run-1:/tmp/shot.png:0",
                    "payload": {"artifact_path": "/tmp/shot.png"},
                    "retry_count": 0,
                },
            ],
            mark_outbox_event_delivered_fn=lambda event_id: marked.append(event_id),
            record_outbox_delivery_failure_fn=lambda event_id, **kwargs: failures.append((event_id, kwargs)),
            deliver_event_fn=lambda event: event.event_id == "evt-good",
            get_outbox_delivery_status_fn=lambda: {
                "undelivered_count": 1,
                "poisoned_count": 1,
                "total_retry_count": 5,
                "max_retry_count": 5,
                "last_delivery_error": {"event_id": "evt-bad", "message": "delivery sink returned false"},
            },
        )

        self.assertEqual(marked, ["evt-good"])
        self.assertEqual(failures[0][0], "evt-bad")
        self.assertTrue(failures[0][1]["poison"])
        self.assertEqual(result["poisoned_ids"], ["evt-bad"])
        self.assertEqual(result["delivered_ids"], ["evt-good"])
        self.assertEqual(result["status"]["last_delivery_error"]["event_id"], "evt-bad")
        self.assertEqual(result["status"]["poisoned_count"], 1)

    def test_deliver_outbox_event_uses_stable_ids_for_duplicate_safety(self) -> None:
        channel_events = []
        try:
            runtime_events.configure_runtime_events(
                channel_events=channel_events,
                channel_events_lock=threading.Lock(),
                channel_events_limit=50,
                channel_sessions_limit=10,
                channel_events_file=Path("/tmp/runtime-events.json"),
                runtime_state_db="/tmp/runtime-state.sqlite3",
                list_channel_events_fn=lambda db_path, limit: [],
                replace_channel_events_fn=lambda db_path, items, limit: None,
                append_channel_event_fn=lambda db_path, item, limit: None,
                utc_now_iso=lambda: "2026-04-07T00:00:00Z",
                parse_utc_ts=lambda value: value,
                normalize_workspace_id=lambda value: str(value or "default"),
                normalize_tenant_id=lambda value: str(value or "default"),
                compact_event_text=lambda value, limit=800: str(value or "")[:limit],
                json_safe=lambda value: dict(value or {}) if isinstance(value, dict) else {},
                safe_read_json=lambda path, default: default,
            )
            event = outbox_service.OutboxEvent(
                event_id="evt-1",
                event_type="approval_resolved",
                tenant_id="tenant-1",
                workspace_id="ws-1",
                run_id="run-1",
                trace_id="trace-1",
                payload={"approval_id": "approval-1", "resolution": "approved"},
                created_at="2026-04-07T00:00:00Z",
            )

            with patch("server_modules.notification_service.deliver_notification_from_outbox_event", return_value=None):
                outbox_service.deliver_outbox_event(event, append_channel_event_item_fn=runtime_events.append_channel_event_item)
                outbox_service.deliver_outbox_event(event, append_channel_event_item_fn=runtime_events.append_channel_event_item)

            self.assertEqual(len(channel_events), 1)
            self.assertEqual(channel_events[0]["id"], "evt-1")
            self.assertEqual(channel_events[0]["tenant_id"], "tenant-1")
            self.assertEqual(channel_events[0]["action"], "approval_resolved")
        finally:
            importlib.reload(runtime_events)


if __name__ == "__main__":
    unittest.main()
