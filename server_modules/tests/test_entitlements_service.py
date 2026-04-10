import unittest

from server_modules import entitlements_service


class EntitlementsServiceTests(unittest.TestCase):
    def test_resolve_workspace_entitlement_state_preserves_non_gated_capabilities(self) -> None:
        state = entitlements_service.resolve_workspace_entitlement_state(
            workspace={"metadata": {"billing": {"plan": "power"}}},
        )

        self.assertEqual(state.plan_id, "power")
        self.assertTrue(state.non_gated_capabilities["core_sage_identity"])
        self.assertTrue(state.non_gated_capabilities["basic_specialist_architecture"])
        self.assertTrue(state.non_gated_capabilities["local_runtime_mode"])
        self.assertTrue(state.non_gated_capabilities["byo_provider_mode"])
        self.assertTrue(state.entitlements["premium_connectors_enabled"])

    def test_enforce_hosted_runtime_access_rejects_monthly_minutes_exhaustion(self) -> None:
        workspace = {
            "metadata": {
                "billing": {
                    "plan": "free",
                    "entitlement_usage": {"hosted_runtime_minutes_monthly": 60},
                }
            }
        }

        with self.assertRaises(entitlements_service.EntitlementQuotaExceededError) as ctx:
            entitlements_service.enforce_hosted_runtime_access(
                workspace=workspace,
                workspace_id="workspace-1",
                selected_attachment={"attachment_kind": "managed_cloud"},
            )

        self.assertEqual(ctx.exception.reason, "hosted_runtime_minutes_exhausted")

    def test_enforce_hosted_runtime_access_counts_managed_cloud_concurrency_only(self) -> None:
        workspace = {"metadata": {"billing": {"plan": "personal"}}}

        with self.assertRaises(entitlements_service.EntitlementQuotaExceededError) as ctx:
            entitlements_service.enforce_hosted_runtime_access(
                workspace=workspace,
                workspace_id="workspace-1",
                selected_attachment={"attachment_kind": "managed_cloud"},
                live_runs_fn=lambda: [
                    {
                        "run_id": "run-1",
                        "status": "running",
                        "context": {
                            "workspace_id": "workspace-1",
                            "metadata": {"execution_target_selected": "cloud"},
                        },
                    },
                    {
                        "run_id": "run-2",
                        "status": "queued",
                        "context": {
                            "workspace_id": "workspace-1",
                            "metadata": {"execution_target_selected": "cloud"},
                        },
                    },
                ],
            )

        self.assertEqual(ctx.exception.reason, "hosted_runtime_concurrency_exhausted")

    def test_enforce_hosted_runtime_access_bypasses_self_hosted_nodes(self) -> None:
        workspace = {
            "metadata": {
                "billing": {
                    "plan": "free",
                    "entitlement_usage": {"hosted_runtime_minutes_monthly": 600},
                }
            }
        }

        result = entitlements_service.enforce_hosted_runtime_access(
            workspace=workspace,
            workspace_id="workspace-1",
            selected_attachment={"attachment_kind": "self_hosted_business_node"},
        )

        self.assertEqual(result["enforcement_target"], "self_hosted")
        self.assertEqual(result["usage_snapshot"]["concurrent_hosted_executions"], 0)


if __name__ == "__main__":
    unittest.main()
