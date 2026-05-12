from __future__ import annotations

import unittest

from server_modules import capability_risk_classifier_service as classifier
from server_modules import agent_computer_policy_service as policies
from server_modules import agent_computer_profile_service as profiles


class CapabilityRiskClassifierServiceTests(unittest.TestCase):
    def test_safe_read_is_allowed_with_complete_contract_shape(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="browser.read",
            action_class="read",
            target_url="https://example.com/docs",
        )
        payload = decision.as_dict()

        self.assertEqual(payload["decision"], "allow")
        self.assertEqual(payload["risk_class"], "low")
        self.assertEqual(payload["risk_level"], 1)
        self.assertEqual(payload["capability"], "browser.read")
        self.assertEqual(payload["policy_version"], policy.policy_version)
        self.assertFalse(payload["cacheable"])
        self.assertIn("decision_id", payload)

    def test_browser_fill_requires_approval(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")

        decision = classifier.classify_gateway_browser_action_risk(
            policy=policy,
            browser_action="fill",
            payload={"url": "https://example.com/form"},
        )

        self.assertEqual(decision.decision, "approval_required")
        self.assertEqual(decision.capability, "browser.form_submit")
        self.assertEqual(decision.risk_class, "high")
        self.assertEqual(decision.approval_scopes_required, ("browser.form_submit",))
        self.assertTrue(decision.recording_required)

    def test_terminal_command_requires_approval_in_ask_mode(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="ask_every_time")

        decision = classifier.classify_gateway_tool_risk(
            policy=policy,
            capability_id="shell.command",
            arguments={"command": "ls -la"},
        )

        self.assertEqual(decision.decision, "approval_required")
        self.assertEqual(decision.capability, "terminal.command")
        self.assertEqual(decision.risk_class, "high")
        self.assertEqual(decision.audit_visibility, "payload_redacted")

    def test_file_delete_is_high_risk_and_approval_required(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="ask_every_time")

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="file.delete",
            action_class="write",
            target_path="/Users/mansur/Agent/report.md",
        )

        self.assertEqual(decision.risk_class, "high")
        self.assertEqual(decision.decision, "approval_required")
        self.assertTrue(decision.recording_required)

    def test_install_software_is_critical_and_blocked(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="trusted_workstation")

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="install.software",
            action_class="execute",
            payload={"package": "unknown.pkg"},
        )

        self.assertEqual(decision.risk_class, "critical")
        self.assertEqual(decision.decision, "block")
        self.assertEqual(decision.retention_class, "security")
        self.assertEqual(decision.audit_visibility, "security_event")

    def test_domain_outside_policy_is_blocked(self) -> None:
        policy = policies.build_default_agent_computer_policy(
            autonomy_mode="safe_autopilot",
            domain_allowlist=["example.com"],
        )

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="browser.read",
            target_url="https://evil.test",
        )

        self.assertEqual(decision.decision, "block")
        self.assertEqual(decision.blocked_reason, "domain_not_allowed")

    def test_kill_state_blocks_even_safe_read(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="browser.read",
            target_url="https://example.com",
            current_kill_state="workspace_emergency_stop",
        )

        self.assertEqual(decision.decision, "block")
        self.assertEqual(decision.blocked_reason, "kill_state:workspace_emergency_stop")
        self.assertEqual(decision.audit_visibility, "security_event")

    def test_unhealthy_profile_blocks_action(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")
        profile = profiles.normalize_agent_computer_profile(
            {
                "workspace_id": "ws-1",
                "policy_id": "policy-1",
                "environment_kind": "personal_computer",
                "gateway_id": "gw-1",
                "health_state": "offline",
            }
        )

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="browser.read",
            computer_profile=profile,
        )

        self.assertEqual(decision.decision, "block")
        self.assertEqual(decision.blocked_reason, "profile_offline")

    def test_target_summary_redacts_secrets(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="ask_every_time")

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="communication.send",
            action_class="write",
            target_channel="telegram",
            payload={"recipient": "+15555551212", "message": "token=sk-secret123456789"},
        )

        self.assertEqual(decision.decision, "approval_required")
        self.assertIn("[redacted-phone]", decision.target_summary)
        self.assertNotIn("+15555551212", decision.target_summary)

    def test_credential_access_is_critical_and_blocked(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot")

        decision = classifier.classify_capability_risk(
            policy=policy,
            capability="credential.access",
            action_class="read",
        )

        self.assertEqual(decision.risk_class, "critical")
        self.assertEqual(decision.decision, "block")

    def test_unknown_capability_fails_closed(self) -> None:
        with self.assertRaises(classifier.CapabilityRiskClassifierError):
            classifier.classify_capability_risk(
                policy=policies.build_default_agent_computer_policy(),
                capability="unknown.capability",
            )


if __name__ == "__main__":
    unittest.main()
