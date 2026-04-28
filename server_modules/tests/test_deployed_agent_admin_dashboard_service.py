from __future__ import annotations

import importlib
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import deployed_agent_admin_dashboard_service


def _workspace_record() -> dict[str, object]:
    return {
        "id": "workspace-row-1",
        "tenant_id": "tenant-1",
        "workspace_id": "ws-1",
        "metadata": {},
    }


def _owner_user() -> dict[str, object]:
    return {
        "user_id": "user-owner",
        "auth_type": "bearer",
        "workspace_access": {
            "ws-1": {
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "role": "owner",
            }
        },
    }


class DeployedAgentAdminDashboardServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        global deployed_agent_admin_dashboard_service
        deployed_agent_admin_dashboard_service = importlib.import_module(
            "server_modules.deployed_agent_admin_dashboard_service"
        )

    async def test_get_dashboard_enriches_customer_entry_and_specialist_profile(self) -> None:
        dashboard_payload = {
            "deployed_agent_id": "dagent_1",
            "total_users": 12,
            "messages_today": 5,
            "messages_this_calendar_month": 48,
            "orders_today": 3,
            "revenue_today_usd": 84.5,
            "users_at_limit_today": 0,
            "upgrade_clicks_this_month": 0,
            "common_questions": [{"question": "Do you have oat milk?", "count": 2}],
            "user_rows": [],
            "limit": 50,
            "offset": 0,
            "has_more": False,
        }
        deployed_agent = {
            "id": "dagent_1",
            "tenant_id": "tenant-1",
            "owner_workspace_id": "ws-1",
            "backing_install_id": "ainstall_1",
            "name": "Bluebird Cafe",
            "persona": "Fast, friendly Telegram ordering specialist.",
            "system_prompt": "Answer menu questions and confirm orders.",
            "channels": {"telegram": {"enabled": True, "endpoint_key": "bluebird-cafe"}},
            "knowledge_sources": [{"id": "menu-pdf", "uri": "kb://menu-pdf", "title": "Menu"}],
            "runtime_target": "cloud",
            "billing_plan": "free",
            "metadata": {
                "provider": "gemini",
                "model": "gemini-2.5-flash",
                "memory_enabled": True,
                "selected_tool_ids": ["spreadsheet_read", "spreadsheet_append"],
                "platform_cta_url": "https://menu.example.com/bluebird",
                "platform_cta_label": "Open menu",
            },
        }
        readiness = {
            "configured_binding": {
                "bot_username": "bluebirdcafe_bot",
                "endpoint_key": "bluebird-cafe",
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_admin_dashboard_service.deployed_agent_service.require_deployed_agent_admin_access",
                return_value="ws-1",
            ),
            patch(
                "server_modules.deployed_agent_admin_dashboard_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_admin_dashboard_service.control_plane_repository.get_deployed_agent_admin_dashboard",
                new=AsyncMock(return_value=dashboard_payload),
            ),
            patch(
                "server_modules.deployed_agent_admin_dashboard_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=deployed_agent),
            ),
            patch(
                "server_modules.deployed_agent_admin_dashboard_service.deployed_agent_service.get_deployed_agent_telegram_readiness",
                new=AsyncMock(return_value=readiness),
            ),
        ):
            payload = await deployed_agent_admin_dashboard_service.get_deployed_agent_admin_dashboard_service().get_dashboard(
                agent_id="dagent_1",
                workspace_id="ws-1",
                current_user=_owner_user(),
            )

        self.assertEqual(payload.orders_today, 3)
        self.assertEqual(payload.revenue_today_usd, 84.5)
        self.assertEqual(payload.customer_entry.bot_username, "bluebirdcafe_bot")
        self.assertIn("t.me/bluebirdcafe_bot", payload.customer_entry.telegram_deep_link or "")
        self.assertEqual(payload.specialist_profile["actions"]["order_capture_mode"], "spreadsheet_append")


if __name__ == "__main__":
    unittest.main()
