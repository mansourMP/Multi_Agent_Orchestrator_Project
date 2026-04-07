import queue
import unittest
from pathlib import Path

from server_modules import outbox_service


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


if __name__ == "__main__":
    unittest.main()
