import asyncio
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import billing_service
from server_modules import control_plane_repository


class BillingServiceTests(unittest.TestCase):
    def _create_workspace(self, root: Path) -> str:
        with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
            control_plane_repository,
            "ensure_control_plane_schema",
            new=AsyncMock(return_value=None),
        ):
            bundle = asyncio.run(
                control_plane_repository.create_local_password_account(
                    user_id="user-billing-1",
                    email="owner@example.com",
                    display_name="Owner Example",
                    password_hash="hash",
                )
            )
            memberships = list((bundle or {}).get("memberships") or [])
            self.assertTrue(memberships)
            return str(memberships[0].get("workspace_id") or "").strip()

    def test_new_workspace_defaults_to_free_billing_state(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ):
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertEqual(summary["subscription"]["plan_id"], "free")
        self.assertEqual(summary["subscription"]["effective_plan_id"], "free")
        self.assertEqual(summary["subscription"]["status"], "active")
        self.assertEqual([item["plan_id"] for item in summary["plans"]], ["free", "pro"])
        self.assertEqual(summary["limits"]["max_specialists"], 1)
        self.assertEqual(summary["usage"]["specialists_in_use"], 0)

    def test_checkout_session_uses_configured_plan_price_and_records_pending_state(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.dict(
                os.environ,
                {
                    "EMPYRALIS_STRIPE_SECRET_KEY": "sk_test_123",
                    "EMPYRALIS_STRIPE_PRICE_IDS": '{"pro":"price_pro_123"}',
                },
                clear=False,
            ), patch.object(
                control_plane_repository,
                "LOCAL_IDENTITY_DB_FILE",
                root / "users.db",
            ), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ), patch.object(
                billing_service,
                "_stripe_api_request",
                return_value={"id": "cs_test_123", "url": "https://checkout.stripe.test/session/cs_test_123"},
            ) as stripe_request:
                payload = billing_service.create_workspace_checkout_session(
                    workspace_id=workspace_id,
                    plan_id="pro",
                    billing_email="owner@example.com",
                )
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertEqual(payload["plan_id"], "pro")
        self.assertEqual(payload["checkout_session_id"], "cs_test_123")
        self.assertEqual(summary["subscription"]["plan_id"], "pro")
        self.assertEqual(summary["subscription"]["status"], "checkout_pending")
        self.assertEqual(summary["subscription"]["effective_plan_id"], "free")
        request_args = stripe_request.call_args[0]
        self.assertEqual(request_args[0], "/checkout/sessions")
        self.assertEqual(request_args[1]["line_items[0][price]"], "price_pro_123")


if __name__ == "__main__":
    unittest.main()
