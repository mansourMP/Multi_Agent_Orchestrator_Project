import tempfile
import unittest
from pathlib import Path

from server_modules import notification_service
from server_modules import outbox_service
from server_modules import runtime_state_store


class NotificationServiceTests(unittest.TestCase):
    def test_deliver_notification_from_outbox_event_persists_and_fans_out(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = Path(tempdir) / "runtime-state.sqlite3"
            runtime_state_store.init_runtime_state_db(db_path)
            runtime_state_store.upsert_notification_device(
                db_path,
                {
                    "device_id": "device-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "workspace-1",
                    "reader_key": "api_key:owner",
                    "provider": "expo",
                    "push_token": "ExponentPushToken[test]",
                    "platform": "ios",
                    "status": "active",
                    "capabilities": ["push"],
                    "registered_at": "2026-04-08T00:00:00Z",
                },
            )
            event = outbox_service.OutboxEvent(
                event_id="approval-evt-1",
                event_type="approval_requested",
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                run_id="run-1",
                trace_id="trace-1",
                payload={
                    "prompt": "Approve deleting the selected file?",
                    "approval_id": "approval-1",
                    "metadata": {"path": "/approvals"},
                },
                created_at="2026-04-08T00:00:00Z",
            )

            notification = notification_service.deliver_notification_from_outbox_event(
                event,
                db_path=db_path,
                send_push_messages_fn=lambda messages: [{"status": "ok"} for _ in messages],
            )

            self.assertIsNotNone(notification)
            payload = notification_service.list_notification_payload(
                current_user={
                    "auth_type": "bearer",
                    "user_id": "user-1",
                    "role": "owner",
                    "workspace_access": {
                        "workspace-1": {"tenant_id": "tenant-1", "role": "owner"},
                    },
                },
                limit=10,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                db_path=db_path,
            )
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["items"][0]["action"], "approval_requested")
            self.assertEqual(payload["items"][0]["title"], "Approval required")
            deliveries = runtime_state_store.list_notification_delivery_statuses(
                db_path,
                notification_id="approval-evt-1",
            )
            self.assertEqual(deliveries["device-1"]["status"], "delivered")

    def test_mark_notifications_read_is_durable(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = Path(tempdir) / "runtime-state.sqlite3"
            runtime_state_store.init_runtime_state_db(db_path)
            runtime_state_store.upsert_notification(
                db_path,
                {
                    "id": "notif-1",
                    "ts": "2026-04-08T00:00:00Z",
                    "tenant_id": "tenant-1",
                    "workspace_id": "workspace-1",
                    "channel": "runtime",
                    "direction": "system",
                    "event_type": "notification",
                    "action": "run_completed",
                    "title": "Run completed",
                    "text": "Run run-1 completed.",
                    "run_id": "run-1",
                    "session_key": "run:run-1",
                    "session_id": "run:run-1",
                    "metadata": {"path": "/runs/run-1"},
                },
            )
            current_user = {
                "auth_type": "bearer",
                "user_id": "user-1",
                "role": "owner",
                "workspace_access": {
                    "workspace-1": {"tenant_id": "tenant-1", "role": "owner"},
                },
            }

            before = notification_service.list_notification_payload(
                current_user=current_user,
                limit=10,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                db_path=db_path,
            )
            self.assertIsNone(before["items"][0].get("read_at"))

            marked = notification_service.mark_notifications_read(
                current_user=current_user,
                notification_ids=["notif-1"],
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                db_path=db_path,
            )
            self.assertEqual(marked["marked_count"], 1)

            after = notification_service.list_notification_payload(
                current_user=current_user,
                limit=10,
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                db_path=db_path,
            )
            self.assertTrue(bool(after["items"][0].get("read_at")))

    def test_run_failed_and_machine_revoked_are_notification_worthy(self) -> None:
        failed_run_event = outbox_service.OutboxEvent(
            event_id="run-failed-1",
            event_type="run_transition",
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            run_id="run-9",
            payload={"to_state": "failed", "from_state": "executing"},
            created_at="2026-04-08T00:00:00Z",
        )
        revoked_machine_event = outbox_service.OutboxEvent(
            event_id="machine-revoked-1",
            event_type="machine_event",
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            machine_id="machine-9",
            payload={"action": "revoked", "display_name": "Kitchen Mac"},
            created_at="2026-04-08T00:00:00Z",
        )

        failed = notification_service.build_notification_from_outbox_event(failed_run_event)
        revoked = notification_service.build_notification_from_outbox_event(revoked_machine_event)

        self.assertEqual(failed["action"], "run_failed")
        self.assertEqual(revoked["action"], "machine_revoked")


if __name__ == "__main__":
    unittest.main()
