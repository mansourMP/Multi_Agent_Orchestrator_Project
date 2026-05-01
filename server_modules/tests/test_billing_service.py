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
        self.assertEqual(summary["hosted_sage_ai"]["monthly_cap_usd"], 5.0)
        self.assertEqual(summary["hosted_sage_ai"]["monthly_credit_cap"], 5000)
        self.assertFalse(summary["hosted_sage_ai"]["allowed"])
        self.assertEqual(summary["hosted_sage_ai"]["reason"], "policy_disabled")

    def test_billing_summary_exposes_hosted_ai_credit_state_for_paid_workspace(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ):
                asyncio.run(
                    control_plane_repository.update_workspace_profile(
                        workspace_id,
                        {
                            "metadata": {
                                "billing": {
                                    "hosted_sage_ai_policy": "enabled_with_cap",
                                    "hosted_sage_ai_monthly_cap_usd": 8.0,
                                }
                            },
                        },
                    )
                )
                asyncio.run(
                    control_plane_repository.upsert_workspace_billing_subscription(
                        workspace_id,
                        plan_id="pro",
                        status="active",
                    )
                )
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertTrue(summary["hosted_sage_ai"]["allowed"])
        self.assertEqual(summary["hosted_sage_ai"]["policy"], "enabled_with_cap")
        self.assertEqual(summary["hosted_sage_ai"]["monthly_cap_usd"], 8.0)
        self.assertEqual(summary["hosted_sage_ai"]["monthly_remaining_usd"], 8.0)
        self.assertEqual(summary["hosted_sage_ai"]["monthly_credit_cap"], 8000)
        self.assertEqual(summary["hosted_sage_ai"]["monthly_credits_remaining"], 8000)

    def test_billing_summary_honors_admin_defaults_billing_plan(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ):
                asyncio.run(
                    control_plane_repository.update_workspace_profile(
                        workspace_id,
                        {
                            "metadata": {
                                "admin_defaults": {
                                    "payload": {
                                        "billing_plan": "pro",
                                        "hosted_sage_ai_policy": "enabled_with_cap",
                                        "hosted_sage_ai_monthly_cap_usd": 12.0,
                                    }
                                }
                            },
                        },
                    )
                )
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertEqual(summary["subscription"]["plan_id"], "free")
        self.assertEqual(summary["subscription"]["effective_plan_id"], "pro")
        self.assertEqual(summary["limits"]["max_specialists"], 3)
        self.assertTrue(summary["hosted_sage_ai"]["allowed"])
        self.assertEqual(summary["hosted_sage_ai"]["policy"], "enabled_with_cap")
        self.assertEqual(summary["hosted_sage_ai"]["monthly_cap_usd"], 12.0)
        self.assertEqual(summary["hosted_sage_ai"]["monthly_credit_cap"], 12000)

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
