import unittest

from server_modules import deployed_agent_runtime_contract_service as contract


class DeployedAgentRuntimeContractServiceTests(unittest.TestCase):
    def test_runtime_placement_normalizes_without_computer_automation(self):
        self.assertEqual(contract.normalize_runtime_placement("cloud"), "managed_cloud")
        self.assertEqual(contract.normalize_runtime_placement("empyralis_hosted_device"), "hosted_hardware_pool")
        self.assertEqual(contract.normalize_runtime_placement("local_computer"), "customer_local")
        self.assertEqual(contract.normalize_runtime_placement("self_hosted_business_node"), "customer_hosted")
        self.assertEqual(contract.runtime_target_for_placement("hosted_hardware_pool"), "cloud")
        self.assertEqual(contract.runtime_target_for_placement("customer_hosted"), "self_hosted")

    def test_runtime_supplier_defaults_follow_placement(self):
        self.assertEqual(contract.normalize_runtime_supplier(None, runtime_placement="managed_cloud"), "empyralis")
        self.assertEqual(contract.normalize_runtime_supplier(None, runtime_placement="hosted_hardware_pool"), "empyralis")
        self.assertEqual(contract.normalize_runtime_supplier(None, runtime_placement="customer_local"), "customer")
        self.assertEqual(contract.normalize_runtime_supplier("marketplace_runtime_provider"), "third_party_certified")

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

    def test_runtime_supply_contract_keeps_supplier_placement_and_automation_separate(self):
        payload = contract.normalize_runtime_supply_contract(
            {
                "supplier": {"kind": "empyralis", "id": "pool-east"},
                "placement": {"kind": "hosted_hardware_pool"},
                "marketplace_policy": {"visibility": "private"},
            },
            computer_automation={"enabled": False},
            public_tier="pro",
            provider="deepseek",
            model="deepseek-v4-pro",
        )

        self.assertEqual(payload["supplier"]["kind"], "empyralis")
        self.assertEqual(payload["placement"]["kind"], "hosted_hardware_pool")
        self.assertEqual(payload["placement"]["runtime_target"], "cloud")
        self.assertFalse(payload["computer_automation"]["enabled"])
        self.assertFalse(payload["provider_binding"]["expose_provider_model_to_ordinary_ui"])

    def test_marketplace_package_cannot_force_customer_runtime_without_installer_opt_in(self):
        payload = contract.normalize_runtime_supply_contract(
            {
                "supplier": {"kind": "customer"},
                "placement": {"kind": "customer_local"},
                "marketplace_policy": {"visibility": "marketplace"},
            }
        )

        self.assertFalse(payload["marketplace_policy"]["install_eligible"])
        self.assertIn("customer_runtime_requires_installer_opt_in", payload["marketplace_policy"]["install_blockers"])

    def test_cost_aware_scheduler_selects_cheap_available_provider_or_queues(self):
        selected = contract.choose_runtime_provider_for_job(
            [
                {
                    "provider_id": "expensive",
                    "supplier_kind": "empyralis",
                    "placement": "hosted_hardware_pool",
                    "capabilities": ["browser"],
                    "available_slots": 3,
                    "estimated_unit_cost": 4.0,
                },
                {
                    "provider_id": "cheap",
                    "supplier_kind": "empyralis",
                    "placement": "hosted_hardware_pool",
                    "capabilities": ["browser"],
                    "available_slots": 1,
                    "estimated_unit_cost": 1.5,
                },
            ],
            required_placement="hosted_hardware_pool",
            required_capabilities=["browser"],
        )
        self.assertEqual(selected["status"], "selected")
        self.assertEqual(selected["provider"]["provider_id"], "cheap")

        queued = contract.choose_runtime_provider_for_job(
            [
                {
                    "provider_id": "busy",
                    "supplier_kind": "empyralis",
                    "placement": "hosted_hardware_pool",
                    "capabilities": ["browser"],
                    "available_slots": 0,
                    "estimated_unit_cost": 1.0,
                }
            ],
            required_placement="hosted_hardware_pool",
            required_capabilities=["browser"],
        )
        self.assertEqual(queued["status"], "queued")
        self.assertEqual(queued["reason"], "waiting_for_capacity")

    def test_hardware_pool_job_contract_carries_checkpoint_and_preemption_metadata(self):
        payload = contract.build_hardware_pool_job_contract(
            job_id="job-1",
            supplier_id="empyralis",
            hardware_pool_id="home-linux-pool",
            checkpoint_uri="s3://checkpoints/job-1",
            checkpoint_generation=7,
            preemptible=True,
            preemption_deadline_at="2026-05-09T12:00:00Z",
            resume_target="hosted_hardware_pool",
        )

        self.assertTrue(payload["checkpoint"]["enabled"])
        self.assertEqual(payload["checkpoint"]["generation"], 7)
        self.assertTrue(payload["preemption"]["preemptible"])
        self.assertEqual(payload["preemption"]["resume_target"], "hosted_hardware_pool")

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
