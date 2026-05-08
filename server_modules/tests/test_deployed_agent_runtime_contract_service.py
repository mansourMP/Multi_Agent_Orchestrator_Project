import unittest

from server_modules import deployed_agent_runtime_contract_service as contract


class DeployedAgentRuntimeContractServiceTests(unittest.TestCase):
    def test_runtime_placement_normalizes_without_computer_automation(self):
        self.assertEqual(contract.normalize_runtime_placement("cloud"), "managed_cloud")
        self.assertEqual(contract.normalize_runtime_placement("local_computer"), "customer_local")
        self.assertEqual(contract.normalize_runtime_placement("self_hosted_business_node"), "customer_hosted")
        self.assertEqual(contract.runtime_target_for_placement("customer_hosted"), "self_hosted")

    def test_computer_automation_is_disabled_by_default(self):
        policy = contract.normalize_computer_automation_config({})

        self.assertFalse(policy["enabled"])
        self.assertIsNone(policy["runtime_class"])
        self.assertEqual(policy["allowed_domains"], [])
        self.assertEqual(policy["max_concurrent_sessions"], 0)

    def test_computer_automation_requires_explicit_enablement_and_allowed_domain(self):
        blocked = contract.computer_automation_guardrail_state(
            {"enabled": False},
            requested_domain="supplier.example.com",
        )
        self.assertFalse(blocked["allowed"])
        self.assertIn("computer_automation_disabled", blocked["reasons"])

        missing_domain = contract.computer_automation_guardrail_state(
            {"enabled": True, "runtime_class": "virtual_browser", "max_concurrent_sessions": 1},
            requested_domain="supplier.example.com",
        )
        self.assertFalse(missing_domain["allowed"])
        self.assertIn("allowed_domain_required", missing_domain["reasons"])

        allowed = contract.computer_automation_guardrail_state(
            {
                "enabled": True,
                "runtime_class": "virtual_browser",
                "allowed_domains": ["example.com"],
                "max_concurrent_sessions": 1,
            },
            requested_domain="supplier.example.com",
        )
        self.assertTrue(allowed["allowed"])

    def test_computer_automation_blocks_over_concurrency_and_budget(self):
        state = contract.computer_automation_guardrail_state(
            {
                "enabled": True,
                "runtime_class": "virtual_browser",
                "allowed_domains": ["example.com"],
                "max_concurrent_sessions": 1,
                "daily_budget_usd": 2,
            },
            requested_domain="example.com",
            active_sessions=1,
            estimated_cost_usd=3,
        )

        self.assertFalse(state["allowed"])
        self.assertIn("concurrency_limit_reached", state["reasons"])
        self.assertIn("daily_budget_exceeded", state["reasons"])

    def test_workspace_contract_scopes_agent_customer_and_session_without_raw_customer_id(self):
        payload = contract.build_deployed_agent_workspace_contract(
            tenant_id="tenant/1",
            workspace_id="workspace/1",
            deployed_agent_id="agent/1",
            external_user_id="customer@example.com",
            session_id="session-1",
            base_dir="~/.empyralis/agents",
        )

        self.assertIn("tenant_1/workspace_1/agent_1", payload["workspace_root"])
        self.assertNotIn("customer@example.com", str(payload))
        self.assertFalse(payload["isolation"]["cross_agent_read"])
        self.assertFalse(payload["isolation"]["cross_customer_read"])
        self.assertFalse(payload["isolation"]["sage_memory_access"])


if __name__ == "__main__":
    unittest.main()
