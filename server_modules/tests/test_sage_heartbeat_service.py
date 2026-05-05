import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import sage_heartbeat_service


class SageHeartbeatServiceTests(unittest.TestCase):
    def test_build_snapshot_surfaces_quiet_hours_and_next_action(self) -> None:
        with (
            patch(
                "server_modules.sage_heartbeat_service.list_sage_profile",
                return_value={
                    "profile": {
                        "recurring_responsibility": "Keep my inbox triaged.",
                        "communication_style": "Be direct.",
                    },
                    "bootstrap": {"complete": True, "progress_label": "5/5"},
                },
            ),
            patch(
                "server_modules.sage_heartbeat_service.bounded_scheduler_service.scheduler_status_snapshot",
                new=AsyncMock(
                    return_value={
                        "policy": {
                            "quiet_hours_start": 22,
                            "quiet_hours_end": 7,
                            "plan_tier": "pro",
                        },
                        "exact_jobs": {
                            "items": [
                                {
                                    "id": "sched-2",
                                    "name": "Later task",
                                    "enabled": True,
                                    "next_run_at": "2026-05-06T12:00:00Z",
                                    "wake_mode": "now",
                                    "delivery": "announce",
                                },
                                {
                                    "id": "sched-1",
                                    "name": "Morning follow-up",
                                    "enabled": True,
                                    "next_run_at": "2026-05-06T09:00:00Z",
                                    "wake_mode": "next-heartbeat",
                                    "delivery": "announce",
                                },
                            ],
                        },
                        "wake_queue": {"pending_count": 1, "claimed_count": 0, "pending": [], "claimed": []},
                        "ambient_monitor": {"status": "running"},
                    }
                ),
            ),
            patch(
                "server_modules.sage_heartbeat_service.runtime_lane_queue_snapshot",
                return_value={
                    "running": True,
                    "pending_count": 2,
                    "active_count": 1,
                    "lanes": {
                        "cron": {"pending_count": 2, "active_count": 1, "pending": [], "active": []},
                    },
                },
            ),
        ):
            payload = asyncio.run(
                sage_heartbeat_service.build_sage_heartbeat_snapshot(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        self.assertEqual(payload["quiet_hours"]["label"], "22:00–07:00")
        self.assertEqual(payload["profile"]["recurring_responsibility"], "Keep my inbox triaged.")
        self.assertEqual(payload["next_scheduled_action"]["id"], "sched-1")
        self.assertEqual(payload["reminders"]["count"], 2)
        self.assertEqual(payload["lane_queue"]["pending_count"], 2)
        self.assertEqual(payload["lane_queue"]["active_count"], 1)


if __name__ == "__main__":
    unittest.main()
