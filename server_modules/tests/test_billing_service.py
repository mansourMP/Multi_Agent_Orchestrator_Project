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
        self.assertEqual(summary["subscription"]["effective_plan_id"], "pro")
        self.assertEqual(summary["subscription"]["status"], "active")
        self.assertEqual([item["plan_id"] for item in summary["plans"]], ["free", "pilot", "pro"])
        self.assertEqual(summary["limits"]["max_specialists"], 3)
        self.assertTrue(summary["limits"]["hosted_ai_enabled"])
        self.assertEqual(summary["usage"]["specialists_in_use"], 0)
        self.assertEqual(summary["hosted_sage_ai"]["policy"], "enabled_with_cap")
        self.assertEqual(summary["hosted_sage_ai"]["monthly_cap_usd"], 0.5)
        self.assertEqual(summary["hosted_sage_ai"]["monthly_credit_cap"], 500)
        self.assertTrue(summary["hosted_sage_ai"]["allowed"])
        self.assertEqual(summary["hosted_sage_ai"]["reason"], None)

    def test_new_google_workspace_defaults_to_capped_hosted_credits(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = "ws_google_default"
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ):
                asyncio.run(
                    control_plane_repository.ensure_workspace_membership(
                        user_id="google-user-1",
                        email="google-owner@example.com",
                        display_name="Google Owner",
                        tenant_id="tenant_google_default",
                        workspace_id=workspace_id,
                        role="owner",
                        provider="google",
                        subject="google-subject-1",
                    )
                )
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertEqual(summary["subscription"]["effective_plan_id"], "pro")
        self.assertTrue(summary["hosted_sage_ai"]["allowed"])
        self.assertEqual(summary["hosted_sage_ai"]["policy"], "enabled_with_cap")
        self.assertEqual(summary["hosted_sage_ai"]["monthly_credit_cap"], 500)

    def test_pilot_plan_is_recognized_as_hosted_ai_plan(self):
        self.assertEqual(billing_service.normalize_billing_plan_id("pilot"), "pilot")
        self.assertEqual(billing_service.normalize_billing_plan_id("beta"), "pilot")
        self.assertEqual(billing_service.billing_plan_label("pilot"), "Pilot")

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
        self.assertEqual(summary["subscription"]["effective_plan_id"], "pro")
        request_args = stripe_request.call_args[0]
        self.assertEqual(request_args[0], "/checkout/sessions")
        self.assertEqual(request_args[1]["line_items[0][price]"], "price_pro_123")

    def test_credit_purchase_checkout_uses_payment_mode_with_inline_price(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.dict(
                os.environ,
                {"EMPYRALIS_STRIPE_SECRET_KEY": "sk_test_123"},
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
                return_value={"id": "cs_credit_123", "url": "https://checkout.stripe.test/session/cs_credit_123"},
            ) as stripe_request:
                payload = billing_service.create_credit_purchase_checkout_session(
                    workspace_id=workspace_id,
                    amount_usd=10.0,
                    billing_email="owner@example.com",
                )
                request_args = stripe_request.call_args[0]

        self.assertEqual(payload["purchase_kind"], "credits")
        self.assertEqual(payload["amount_usd"], 10.0)
        self.assertEqual(payload["credits"], 10000)
        self.assertEqual(payload["checkout_session_id"], "cs_credit_123")
        self.assertEqual(request_args[0], "/checkout/sessions")
        self.assertEqual(request_args[1]["mode"], "payment")
        self.assertEqual(request_args[1]["line_items[0][price_data][unit_amount]"], 1000)
        self.assertEqual(request_args[1]["metadata[purchase_kind]"], "credits")

    def test_credit_purchase_rejects_amount_below_minimum(self):
        with self.assertRaises(Exception) as ctx:
            billing_service.create_credit_purchase_checkout_session(
                workspace_id="ws_any",
                amount_usd=0.5,
            )
        self.assertIn("at least", str(ctx.exception).lower())

    def test_credit_balance_is_zero_for_new_workspace(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ):
                balance = billing_service.credit_balance_for_workspace(workspace_id)

        self.assertEqual(balance["credit_balance_usd"], 0.0)
        self.assertEqual(balance["credit_balance_credits"], 0)
        self.assertEqual(balance["transactions"], [])

    def test_credit_balance_includes_purchased_credits_in_credit_state(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ):
                asyncio.run(
                    control_plane_repository.update_workspace_admin_defaults_metadata(
                        workspace_id,
                        metadata={
                            "credit_balance_usd": 5.0,
                            "credit_transactions": [
                                {"kind": "purchase", "amount_usd": 5.0, "credits": 5000}
                            ],
                        },
                    )
                )
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertEqual(summary["hosted_sage_ai"]["credit_balance_usd"], 5.0)
        self.assertEqual(summary["hosted_sage_ai"]["credit_balance_credits"], 5000)
        self.assertEqual(summary["hosted_sage_ai"]["total_available_usd"], 5.5)
        self.assertEqual(summary["hosted_sage_ai"]["total_available_credits"], 5500)

    def test_credit_balance_allows_usage_when_monthly_cap_reached(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ), patch.object(
                billing_service,
                "_workspace_runtime_usage_summary",
                return_value={"hosted_sage_cost_usd_monthly": 0.5},
            ):
                asyncio.run(
                    control_plane_repository.update_workspace_admin_defaults_metadata(
                        workspace_id,
                        metadata={
                            "credit_balance_usd": 3.0,
                            "hosted_sage_ai_monthly_cap_usd": 0.5,
                            "hosted_sage_ai_policy": "enabled_with_cap",
                        },
                    )
                )
                summary = billing_service.workspace_billing_summary_for_workspace_id(workspace_id)

        self.assertTrue(summary["hosted_sage_ai"]["allowed"])
        self.assertEqual(summary["hosted_sage_ai"]["monthly_remaining_usd"], 0.0)
        self.assertEqual(summary["hosted_sage_ai"]["credit_balance_usd"], 3.0)
        self.assertEqual(summary["hosted_sage_ai"]["total_available_usd"], 3.0)

    def test_credit_balance_debits_only_monthly_overage_once_per_request(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            workspace_id = self._create_workspace(root)
            with patch.object(control_plane_repository, "LOCAL_IDENTITY_DB_FILE", root / "users.db"), patch.object(
                control_plane_repository,
                "ensure_control_plane_schema",
                new=AsyncMock(return_value=None),
            ), patch.object(
                control_plane_repository,
                "summarize_workspace_billing_usage",
                new=AsyncMock(
                    return_value={
                        "usage_month": "2026-05-01",
                        "hosted_sage_cost_usd_monthly": 1.25,
                    }
                ),
            ):
                asyncio.run(
                    control_plane_repository.update_workspace_admin_defaults_metadata(
                        workspace_id,
                        metadata={
                            "credit_balance_usd": 3.0,
                            "hosted_sage_ai_monthly_cap_usd": 0.5,
                            "hosted_sage_ai_policy": "enabled_with_cap",
                            "credit_transactions": [
                                {"kind": "purchase", "amount_usd": 3.0, "credits": 3000}
                            ],
                        },
                    )
                )
                first = billing_service.debit_workspace_credit_balance_for_hosted_usage(
                    workspace_id=workspace_id,
                    tenant_id="tenant_user-billing-1",
                    request_id="req-usage-1",
                )
                second = billing_service.debit_workspace_credit_balance_for_hosted_usage(
                    workspace_id=workspace_id,
                    tenant_id="tenant_user-billing-1",
                    request_id="req-usage-1",
                )
                balance = billing_service.credit_balance_for_workspace(workspace_id)

        self.assertEqual(first["debited_usd"], 0.75)
        self.assertEqual(second["debited_usd"], 0.0)
        self.assertEqual(balance["credit_balance_usd"], 2.25)
        self.assertEqual(
            len([item for item in balance["transactions"] if item.get("kind") == "usage_debit"]),
            1,
        )

    def test_credit_usage_history_includes_real_chat_ledger_rows(self):
        workspace = {
            "workspace_id": "ws_usage_history",
            "tenant_id": "tenant_usage_history",
            "name": "Usage History",
            "metadata": {
                "billing": {
                    "credit_balance_usd": 1.0,
                    "credit_transactions": [
                        {"kind": "purchase", "amount_usd": 1.0, "credits": 1000, "created_at": 1779000000}
                    ],
                }
            },
        }
        with patch.object(
            control_plane_repository,
            "get_workspace_by_id",
            new=AsyncMock(return_value=workspace),
        ), patch.object(
            billing_service,
            "workspace_billing_summary_for_workspace_id",
            return_value={
                "subscription": {"label": "Free"},
                "hosted_sage_ai": {
                    "monthly_credit_cap": 500,
                    "monthly_credits_remaining": 420,
                    "total_available_credits": 1420,
                },
            },
        ), patch.object(
            control_plane_repository,
            "list_workspace_hosted_ai_monthly_cost_ledger_entries",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "ledger_1",
                        "request_id": "req_1",
                        "thread_id": "thread_alpha",
                        "provider": "openai",
                        "model": "gpt-test",
                        "total_tokens": 1234,
                        "estimated_cost_usd": 0.14,
                        "completed_at": "2026-05-19T08:00:00Z",
                        "metadata": {"thread_title": "Hello", "public_tier": "medium"},
                    }
                ]
            ),
        ):
            history = billing_service.credit_usage_history_for_workspace("ws_usage_history")

        self.assertTrue(history["per_chat_available"])
        self.assertEqual(history["hosted_sage_ai"]["total_available_credits"], 1420)
        self.assertEqual(history["items"][0]["label"], "Hello")
        self.assertEqual(history["items"][0]["thread_id"], "thread_alpha")
        self.assertEqual(history["items"][0]["credits"], -140)
        self.assertEqual(history["items"][1]["credits"], 1000)

    def test_unified_credit_usage_merges_ai_and_runtime_ledger_rows(self):
        workspace = {
            "workspace_id": "ws_unified_usage",
            "tenant_id": "tenant_unified_usage",
            "name": "Unified Usage",
            "metadata": {"billing": {}},
        }
        ai_event = {
            "surface": "studio",
            "source_surface": "studio",
            "payer": "platform_credits",
            "credit_type": "ai_tokens",
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "workspace_id": "ws_unified_usage",
            "run_id": "run-1",
            "agent_id": "agent-1",
            "provider_usage": {"total_tokens": 250},
            "platform_cost_usd": 0.02,
            "provider_reported_cost": 0.02,
            "provider_reported_currency": "USD",
            "credits_debited": 20,
            "estimation_mode": "provider_usage_exact",
            "created_at": "2026-05-19T08:00:00Z",
        }
        runtime_event = {
            "surface": "sage",
            "source_surface": "sage",
            "payer": "platform_credits",
            "credit_type": "computer_runtime",
            "runtime_target": "sage_cloud_computer",
            "workspace_id": "ws_unified_usage",
            "thread_id": "thread-1",
            "provider_usage": {"active_seconds": 60, "billable_seconds": 60},
            "platform_cost_usd": 0.04,
            "provider_reported_cost": 0.04,
            "provider_reported_currency": "USD",
            "credits_debited": 1,
            "estimation_mode": "runtime_metered",
            "created_at": "2026-05-19T08:05:00Z",
        }
        with patch.object(
            control_plane_repository,
            "get_workspace_by_id",
            new=AsyncMock(return_value=workspace),
        ), patch.object(
            control_plane_repository,
            "list_workspace_hosted_ai_monthly_cost_ledger_entries",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "ledger-ai-1",
                        "request_id": "req-ai-1",
                        "thread_id": "",
                        "provider": "deepseek",
                        "model": "deepseek-v4-flash",
                        "total_tokens": 250,
                        "estimated_cost_usd": 0.02,
                        "completed_at": "2026-05-19T08:00:00Z",
                        "metadata": {
                            "thread_title": "Agent run",
                            "unified_credit_ledger_event": ai_event,
                        },
                    }
                ]
            ),
        ), patch.object(
            control_plane_repository,
            "list_activity_ledger_events",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "activity-runtime-1",
                        "title": "Cloud Computer",
                        "created_at": "2026-05-19T08:05:00Z",
                        "metadata": {"unified_credit_ledger_event": runtime_event},
                    },
                    {
                        "id": "activity-ai-duplicate",
                        "title": "Agent run",
                        "created_at": "2026-05-19T08:00:00Z",
                        "metadata": {"unified_credit_ledger_event": ai_event},
                    },
                ]
            ),
        ):
            payload = billing_service.unified_credit_usage_for_workspace("ws_unified_usage")

        self.assertEqual(payload["summary"]["count"], 2)
        self.assertEqual(payload["summary"]["total_platform_cost_usd"], 0.06)
        self.assertEqual(payload["summary"]["total_credits_debited"], 21)
        self.assertEqual(payload["summary"]["by_surface"]["studio"]["count"], 1)
        self.assertEqual(payload["summary"]["by_credit_type"]["computer_runtime"]["count"], 1)
        self.assertEqual(payload["items"][0]["credit_type"], "computer_runtime")
        self.assertEqual(payload["items"][1]["credit_type"], "ai_tokens")
        self.assertTrue(payload["items"][1]["empyralis_credits_used"])


if __name__ == "__main__":
    unittest.main()
