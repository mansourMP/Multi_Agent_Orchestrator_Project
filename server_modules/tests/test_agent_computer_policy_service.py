import unittest

from server_modules import agent_computer_policy_service as policy


class AgentComputerPolicyServiceTests(unittest.TestCase):
    def test_policy_owns_autonomy_mode_and_profile_should_reference_policy(self) -> None:
        contract = policy.build_default_agent_computer_policy(
            autonomy_mode="safe_autopilot",
            policy_id="policy-safe",
        )

        payload = contract.as_dict()
        self.assertEqual(payload["autonomy_mode"], "safe_autopilot")
        self.assertIn("policy_id", payload)
        self.assertNotIn("profile_mode", payload)

    def test_read_only_allows_reads_and_blocks_writes(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="read_only")

        self.assertEqual(policy.decision_for_capability(contract, "browser.read"), "allow")
        self.assertEqual(policy.decision_for_capability(contract, "file.metadata"), "allow")
        self.assertEqual(policy.decision_for_capability(contract, "communication.send"), "block")
        self.assertEqual(policy.decision_for_capability(contract, "terminal.command"), "block")

    def test_ask_every_time_allows_safe_reads_and_requires_approval_for_mutation(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="ask_every_time")

        self.assertEqual(policy.decision_for_capability(contract, "screen.read"), "allow")
        self.assertEqual(policy.decision_for_capability(contract, "browser.click"), "approval_required")
        self.assertEqual(policy.decision_for_capability(contract, "file.write"), "approval_required")
        self.assertEqual(policy.decision_for_capability(contract, "credential.access"), "block")

    def test_safe_autopilot_requires_approval_for_external_send_and_cloud_storage(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")

        self.assertEqual(policy.decision_for_capability(contract, "communication.draft"), "allow")
        self.assertEqual(policy.decision_for_capability(contract, "communication.send"), "approval_required")
        self.assertEqual(policy.decision_for_capability(contract, "cloud_storage.access"), "approval_required")
        self.assertEqual(policy.decision_for_capability(contract, "install.software"), "block")

    def test_trusted_workstation_still_blocks_installs_and_asks_for_money(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="trusted_workstation")

        self.assertEqual(policy.decision_for_capability(contract, "file.write"), "allow")
        self.assertEqual(policy.decision_for_capability(contract, "terminal.approved_script"), "allow")
        self.assertEqual(policy.decision_for_capability(contract, "commerce.payment"), "approval_required")
        self.assertEqual(policy.decision_for_capability(contract, "install.extension"), "block")

    def test_emergency_stop_blocks_everything(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="emergency_stop")

        for capability in ("browser.read", "screen.read", "memory.read", "notification.send"):
            self.assertEqual(policy.decision_for_capability(contract, capability), "block")

    def test_normalize_rejects_unknown_capability(self) -> None:
        with self.assertRaises(policy.AgentComputerPolicyError):
            policy.normalize_agent_computer_policy({"allowed_capabilities": ["unknown.capability"]})

    def test_normalize_rejects_allowed_and_blocked_overlap(self) -> None:
        with self.assertRaises(policy.AgentComputerPolicyError):
            policy.normalize_agent_computer_policy(
                {
                    "allowed_capabilities": ["file.write"],
                    "blocked_capabilities": ["file.write"],
                }
            )

    def test_normalize_preserves_scopes_and_policy_version(self) -> None:
        contract = policy.normalize_agent_computer_policy(
            {
                "policy_id": "policy-1",
                "policy_version": 3,
                "autonomy_mode": "safe",
                "domain_allowlist": ["example.com", "example.com", "docs.example.com"],
                "filesystem_scope": ["/Users/mansur/Work", "/Users/mansur/Work"],
                "approval_ttl_seconds": 30,
            }
        )

        self.assertEqual(contract.policy_id, "policy-1")
        self.assertEqual(contract.policy_version, 3)
        self.assertEqual(contract.autonomy_mode, "safe_autopilot")
        self.assertEqual(contract.domain_allowlist, ("example.com", "docs.example.com"))
        self.assertEqual(contract.filesystem_scope, ("/Users/mansur/Work",))
        self.assertEqual(contract.approval_ttl_seconds, 60)

    def test_evaluate_blocks_domain_outside_allowlist(self) -> None:
        contract = policy.build_default_agent_computer_policy(
            autonomy_mode="safe_autopilot",
            domain_allowlist=["example.com"],
        )

        denied = policy.evaluate_agent_computer_request(
            contract,
            capability="browser.read",
            requested_domain="evil.test",
        )
        allowed = policy.evaluate_agent_computer_request(
            contract,
            capability="browser.read",
            requested_domain="docs.example.com",
        )

        self.assertEqual(denied.decision, "block")
        self.assertEqual(denied.reason, "domain_not_allowed")
        self.assertEqual(allowed.decision, "allow")

    def test_evaluate_returns_approval_scope_for_risky_action(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="ask_every_time")

        decision = policy.evaluate_agent_computer_request(contract, capability="browser.click")

        self.assertEqual(decision.decision, "approval_required")
        self.assertTrue(decision.approval_required)
        self.assertEqual(decision.approval_scope, "browser.click")

    def test_validate_text_agent_rejects_computer_policy(self) -> None:
        contract = policy.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")

        with self.assertRaises(policy.AgentComputerPolicyError):
            policy.validate_agent_computer_policy(contract, studio_agent_mode="text_agent")

    def test_validate_rejects_implicit_relative_filesystem_scope(self) -> None:
        with self.assertRaises(policy.AgentComputerPolicyError):
            policy.validate_agent_computer_policy(
                {
                    "filesystem_scope": ["Desktop"],
                }
            )

    def test_deployed_agent_record_uses_config_policy_over_metadata(self) -> None:
        contract = policy.agent_computer_policy_from_deployed_agent_record(
            {
                "id": "agent-1",
                "config": {
                    "agent_computer_policy": {
                        "policy_id": "config-policy",
                        "autonomy_mode": "read_only",
                    },
                },
                "metadata": {
                    "agent_computer_policy": {
                        "policy_id": "metadata-policy",
                        "autonomy_mode": "trusted_workstation",
                    },
                },
            }
        )

        self.assertEqual(contract.policy_id, "config-policy")
        self.assertEqual(contract.autonomy_mode, "read_only")

    def test_deployed_agent_record_falls_back_to_computer_automation_allowlist(self) -> None:
        contract = policy.agent_computer_policy_from_deployed_agent_record(
            {
                "deployed_agent_id": "agent-2",
                "config": {
                    "computer_automation": {
                        "autonomy_mode": "safe_autopilot",
                        "allowed_domains": ["example.com"],
                        "filesystem_scope": ["workspace_scoped"],
                    },
                },
            }
        )

        self.assertEqual(contract.policy_id, "deployed-agent:agent-2")
        self.assertEqual(contract.autonomy_mode, "safe_autopilot")
        self.assertEqual(contract.domain_allowlist, ("example.com",))
        self.assertEqual(contract.filesystem_scope, ("workspace_scoped",))


if __name__ == "__main__":
    unittest.main()
