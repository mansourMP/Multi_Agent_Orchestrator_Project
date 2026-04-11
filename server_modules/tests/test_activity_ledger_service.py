import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from server_modules import activity_ledger_service


class ActivityLedgerServiceTests(unittest.TestCase):
    def test_list_notification_feed_items_projects_bounded_notification_shape(self) -> None:
        created_at = datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc)
        with patch(
            "server_modules.activity_ledger_service.control_plane_repository.list_activity_ledger_events",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "aevt-1",
                        "workspace_id": "workspace-1",
                        "actor_type": "system",
                        "actor_id": "runtime",
                        "event_class": "approval",
                        "detail_level": "feed_summary",
                        "channel": "runtime",
                        "direction": "system",
                        "session_key": "run:run-1",
                        "run_id": "run-1",
                        "action": "approval_requested",
                        "title": "Approval required",
                        "summary": "Approve deleting the selected file?",
                        "metadata": {"path": "/approvals"},
                        "created_at": created_at,
                    }
                ]
            ),
        ):
            items = asyncio.run(
                activity_ledger_service.list_notification_feed_items(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        self.assertEqual(items[0]["action"], "approval_requested")
        self.assertEqual(items[0]["metadata"]["detail_level"], "feed_summary")
        self.assertEqual(items[0]["session_key"], "run:run-1")

    def test_list_activity_timeline_payload_includes_artifacts_and_review_summary(self) -> None:
        created_at = datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc)
        with patch(
            "server_modules.activity_ledger_service.control_plane_repository.list_activity_ledger_events",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "aevt-1",
                        "workspace_id": "workspace-1",
                        "actor_type": "specialist",
                        "actor_id": "install-1",
                        "install_id": "install-1",
                        "event_class": "artifact_created",
                        "detail_level": "timeline_detail",
                        "action": "artifact_created",
                        "summary": "Created 1 artifact.",
                        "review_required": True,
                        "artifacts": [{"path": "knowledge/out.md", "review_required": True}],
                        "metadata": {},
                        "payload": {},
                        "created_at": created_at,
                    }
                ]
            ),
        ):
            payload = asyncio.run(
                activity_ledger_service.list_activity_timeline_payload(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["summary"]["review_required_count"], 1)
        self.assertEqual(payload["items"][0]["artifacts"][0]["path"], "knowledge/out.md")

    def test_list_activity_timeline_payload_projects_surface_shape_aliases(self) -> None:
        created_at = datetime(2026, 4, 10, 9, 5, tzinfo=timezone.utc)
        with patch(
            "server_modules.activity_ledger_service.control_plane_repository.list_activity_ledger_events",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "aevt-2",
                        "workspace_id": "workspace-1",
                        "actor_type": "specialist",
                        "actor_id": "install-1",
                        "install_id": "install-1",
                        "app_id": "notes",
                        "event_class": "artifact_created",
                        "detail_level": "timeline_detail",
                        "action": "artifact_created",
                        "status": "completed",
                        "summary": "Created 1 artifact.",
                        "review_required": True,
                        "artifacts": [
                            {
                                "path": "knowledge/out.md",
                                "name": "Knowledge summary",
                                "preview_path": "/preview/out",
                                "review_required": True,
                            }
                        ],
                        "metadata": {},
                        "payload": {},
                        "created_at": created_at,
                    }
                ]
            ),
        ):
            payload = asyncio.run(
                activity_ledger_service.list_activity_timeline_payload(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        item = payload["items"][0]
        self.assertEqual(item["created_at"], "2026-04-10T09:05:00Z")
        self.assertEqual(item["ts"], "2026-04-10T09:05:00Z")
        self.assertEqual(item["actor_type"], "specialist")
        self.assertEqual(item["actor_id"], "install-1")
        self.assertEqual(item["actor"]["install_id"], "install-1")
        self.assertEqual(item["app_id"], "notes")
        self.assertEqual(item["artifacts"][0]["label"], "Knowledge summary")
        self.assertEqual(item["artifacts"][0]["preview_url"], "/preview/out")

    def test_list_sage_recent_activity_payload_groups_by_class(self) -> None:
        created_at = datetime(2026, 4, 10, 9, 0, tzinfo=timezone.utc)
        with patch(
            "server_modules.activity_ledger_service.control_plane_repository.list_activity_ledger_events",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "aevt-1",
                        "workspace_id": "workspace-1",
                        "actor_type": "sage",
                        "actor_id": "install-sage",
                        "event_class": "delegation",
                        "action": "event_trigger",
                        "summary": "Delegated wake request scheduled.",
                        "artifacts": [],
                        "created_at": created_at,
                    },
                    {
                        "id": "aevt-2",
                        "workspace_id": "workspace-1",
                        "actor_type": "application",
                        "actor_id": "notes",
                        "event_class": "memory_update",
                        "action": "note_changed",
                        "summary": "Project note updated.",
                        "artifacts": [],
                        "created_at": created_at,
                    },
                ]
            ),
        ):
            payload = asyncio.run(
                activity_ledger_service.list_sage_recent_activity_payload(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        self.assertEqual(payload["summary"]["count"], 2)
        self.assertEqual(payload["summary"]["by_class"]["delegation"], 1)
        self.assertEqual(payload["summary"]["by_class"]["memory_update"], 1)

    def test_list_sage_recent_activity_payload_includes_created_at_alias_and_review_count(self) -> None:
        created_at = datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc)
        with patch(
            "server_modules.activity_ledger_service.control_plane_repository.list_activity_ledger_events",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "aevt-3",
                        "workspace_id": "workspace-1",
                        "actor_type": "sage",
                        "actor_id": "install-sage",
                        "event_class": "artifact_created",
                        "action": "artifact_created",
                        "summary": "Created 1 artifact.",
                        "review_required": True,
                        "artifacts": [{"path": "artifacts/out.md", "name": "Out"}],
                        "created_at": created_at,
                    }
                ]
            ),
        ):
            payload = asyncio.run(
                activity_ledger_service.list_sage_recent_activity_payload(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        self.assertEqual(payload["summary"]["review_required_count"], 1)
        self.assertEqual(payload["items"][0]["created_at"], "2026-04-10T10:00:00Z")
        self.assertEqual(payload["items"][0]["artifacts"][0]["label"], "Out")


if __name__ == "__main__":
    unittest.main()
