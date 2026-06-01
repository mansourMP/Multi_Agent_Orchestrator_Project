from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import agent_approval_memory_service as approval_memory
from server_modules import agent_computer_approval_decision_service as decisions
from server_modules import agent_computer_policy_service as policies
from server_modules import agent_computer_profile_service as profiles


class AgentComputerApprovalDecisionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._rust_patch = patch.object(
            decisions.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            side_effect=self._fake_rust_kernel,
        )
        self._rust_patch.start()

    def tearDown(self) -> None:
        self._rust_patch.stop()

    def _state_patch(self, root: Path):
        return patch("server_modules.agent_approval_memory_service.workspace_context.workspace_scope_dir", return_value=root)

    def _fake_rust_kernel(self, command: str, payload: dict, **kwargs):
        if command == "validate-policy":
            policy = dict(payload.get("policy") or {})
            capability = str(payload.get("capability") or "").strip()
            if capability in set(policy.get("blocked_capabilities") or []):
                self._raise_rust_block("capability_blocked_by_policy", command=command)
            if capability in set(policy.get("approval_required_capabilities") or []):
                return {
                    "ok": True,
                    "decision": "require_approval",
                    "reason": "capability_requires_approval",
                    "next_action": "request_agent_computer_approval",
                    "approval_required": True,
                }
            return {
                "ok": True,
                "decision": "allow",
                "reason": "capability_allowed_by_policy",
                "next_action": "allow_agent_computer_request",
                "approval_required": False,
            }
        if command == "classify-risk":
            capability = str(payload.get("capability") or "").strip()
            action_class = str(payload.get("action_class") or "read").strip() or "read"
            current_kill_state = str(payload.get("current_kill_state") or "").strip().lower()
            if current_kill_state:
                self._raise_rust_block("kill_state_active", command=command, extra={
                    "risk_level": "critical",
                    "risk_class": "critical",
                    "capability": capability,
                    "action_class": action_class,
                    "blocked_reason": "kill_state_active",
                })
            if capability == "credential.access":
                return self._risk_response("require_approval", "critical", capability, action_class)
            if capability in {"file.write", "communication.send", "browser.click"}:
                policy = dict(payload.get("policy") or {})
                if capability == "file.write" and policy.get("autonomy_mode") == "trusted_workstation":
                    return self._risk_response("allow", "low", capability, action_class)
                return self._risk_response("require_approval", "high", capability, action_class)
            return self._risk_response("allow", "low", capability, action_class)
        if command == "approval-requirement":
            capability = str(payload.get("capability") or "").strip()
            action_class = str(payload.get("action_class") or "read").strip() or "read"
            risk_level = str(payload.get("risk_level") or "medium").strip() or "medium"
            target_summary = str(payload.get("target_summary") or "target").strip() or "target"
            return {
                "ok": True,
                "decision": "require_approval",
                "reason": "approval_required",
                "approval_required": True,
                "next_action": "request_owner_approval",
                "approval": {
                    "scope": f"{capability}:{action_class}:{risk_level}:{target_summary}",
                    "ttl_seconds": 60 if risk_level == "critical" else 300,
                    "single_use": risk_level in {"high", "critical"} or action_class in {"write", "execute"},
                    "owner_visible": True,
                },
            }
        raise AssertionError(f"unexpected Rust command {command}")

    def _risk_response(self, decision: str, risk_class: str, capability: str, action_class: str) -> dict:
        return {
            "ok": decision != "block",
            "decision": decision,
            "reason": "risk_allowed" if decision == "allow" else "risk_requires_approval",
            "approval_required": decision == "require_approval",
            "decision_id": "crd_test",
            "risk_level": risk_class,
            "risk_class": risk_class,
            "action_class": action_class,
            "capability": capability,
            "target_summary": "target",
            "approval_scopes_required": [capability] if decision == "require_approval" else [],
            "audit_visibility": "security" if risk_class in {"high", "critical"} else "standard",
            "recording_required": risk_class in {"high", "critical"},
            "retention_class": "extended" if risk_class == "critical" else "standard" if risk_class == "high" else "short",
            "cacheable": False,
        }

    def _raise_rust_block(self, reason: str, *, command: str, extra: dict | None = None) -> None:
        decision = {
            "ok": False,
            "decision": "block",
            "reason": reason,
            "approval_required": False,
        }
        if extra:
            decision.update(extra)
        raise decisions.rust_runtime_kernel_client.RustKernelDecisionError(decision, command=command)

    def _profile(self, *, profile_id: str = "profile-1", gateway_id: str = "gw-1", dedicated: bool = False):
        return profiles.normalize_agent_computer_profile(
            {
                "profile_id": profile_id,
                "workspace_id": "ws-1",
                "owner_user_id": "user-1",
                "policy_id": "policy-1",
                "machine_label": "Mansur Mac mini" if dedicated else "Mansur MacBook",
                "environment_kind": "dedicated_workstation" if dedicated else "personal_computer",
                "gateway_id": gateway_id,
                "dedicated_to_agent": dedicated,
                "health_state": "online",
            }
        )

    def test_safe_read_returns_allow(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot", policy_id="policy-1")

        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(),
            capability="browser.read",
            action_class="read",
            target_url="https://example.com/docs",
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason, "risk_policy_allowed")
        self.assertEqual(decision.as_dict()["risk_decision"]["risk_class"], "low")

    def test_personal_connected_computer_asks_before_mutation(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="ask_every_time", policy_id="policy-1")

        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(),
            capability="file.write",
            action_class="write",
            target_path="/Users/mansur/Agent/outbox.md",
        )

        payload = decision.as_dict()
        self.assertTrue(decision.approval_required)
        self.assertEqual(payload["approval_card"]["action"], "file.write")
        self.assertTrue(payload["approval_card"]["rememberable"])

    def test_dedicated_computer_allows_scoped_low_risk_work(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="trusted_workstation", policy_id="policy-1")

        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(dedicated=True),
            capability="file.write",
            action_class="write",
            target_path="/Users/mansur/Agent/draft.md",
        )

        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason, "risk_policy_allowed")

    def test_dedicated_computer_asks_before_external_send(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="trusted_workstation", policy_id="policy-1")

        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(dedicated=True),
            capability="communication.send",
            action_class="write",
            target_channel="telegram",
            target_recipient="+15555551212",
            payload={"message": "Invoice is ready"},
        )

        payload = decision.as_dict()
        self.assertTrue(decision.approval_required)
        self.assertEqual(payload["approval_card"]["action"], "communication.send")
        self.assertNotIn("+15555551212", str(payload))

    def test_wrong_approval_next_action_blocks_approval_card_construction(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="ask_every_time", policy_id="policy-1")

        def wrong_action_kernel(command: str, payload: dict, **kwargs):
            response = self._fake_rust_kernel(command, payload, **kwargs)
            if command == "approval-requirement":
                response = dict(response)
                response["next_action"] = "persist_approval_decision"
            return response

        with patch.object(
            decisions.rust_runtime_kernel_client,
            "run_runtime_kernel_enforced",
            side_effect=wrong_action_kernel,
        ):
            with self.assertRaisesRegex(RuntimeError, "unexpected_next_action:persist_approval_decision"):
                decisions.decide_agent_computer_action(
                    workspace_id="ws-1",
                    actor_user_id="user-1",
                    agent_id="sage",
                    policy=policy,
                    computer_profile=self._profile(),
                    capability="file.write",
                    action_class="write",
                    target_path="/Users/mansur/Agent/outbox.md",
                )

    def test_remembered_approval_applies_only_to_same_scope_and_agent(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot", policy_id="policy-1")
        profile = self._profile(profile_id="profile-1", gateway_id="gw-1")
        with tempfile.TemporaryDirectory() as temp_dir:
            with self._state_patch(Path(temp_dir)):
                approval_memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="user-1",
                    capability="browser.click",
                    policy_id="policy-1",
                    profile_id="profile-1",
                    gateway_id="gw-1",
                    target_domain="example.com",
                    metadata={"agent_id": "sage"},
                )

                wrong_agent = decisions.decide_agent_computer_action(
                    workspace_id="ws-1",
                    actor_user_id="user-1",
                    agent_id="other-agent",
                    policy=policy,
                    computer_profile=profile,
                    capability="browser.click",
                    action_class="write",
                    target_url="https://example.com/approve",
                )
                allowed = decisions.decide_agent_computer_action(
                    workspace_id="ws-1",
                    actor_user_id="user-1",
                    agent_id="sage",
                    policy=policy,
                    computer_profile=profile,
                    capability="browser.click",
                    action_class="write",
                    target_url="https://example.com/approve",
                )

        self.assertTrue(wrong_agent.approval_required)
        self.assertTrue(allowed.allowed)
        self.assertEqual(allowed.reason, "approval_memory_matched")
        self.assertIsNotNone(allowed.remembered_approval_rule)

    def test_remembered_approval_does_not_match_different_domain(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot", policy_id="policy-1")
        with tempfile.TemporaryDirectory() as temp_dir:
            with self._state_patch(Path(temp_dir)):
                approval_memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="user-1",
                    capability="browser.click",
                    policy_id="policy-1",
                    profile_id="profile-1",
                    gateway_id="gw-1",
                    target_domain="example.com",
                    metadata={"agent_id": "sage"},
                )

                decision = decisions.decide_agent_computer_action(
                    workspace_id="ws-1",
                    actor_user_id="user-1",
                    agent_id="sage",
                    policy=policy,
                    computer_profile=self._profile(profile_id="profile-1", gateway_id="gw-1"),
                    capability="browser.click",
                    action_class="write",
                    target_url="https://evil.test/approve",
                )

        self.assertTrue(decision.approval_required)

    def test_critical_action_cannot_be_remembered(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with self._state_patch(Path(temp_dir)):
                with self.assertRaises(approval_memory.AgentApprovalMemoryError):
                    approval_memory.create_approval_memory_rule(
                        workspace_id="ws-1",
                        owner_user_id="user-1",
                        capability="credential.access",
                        target_domain="example.com",
                        metadata={"agent_id": "sage"},
                    )

        policy = policies.build_default_agent_computer_policy(autonomy_mode="trusted_workstation", policy_id="policy-1")
        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(dedicated=True),
            capability="credential.access",
        )
        payload = decision.as_dict()
        self.assertTrue(decision.approval_required)
        self.assertFalse(payload["approval_card"]["rememberable"])

    def test_kill_switch_blocks_even_with_remembered_approval(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="safe_autopilot", policy_id="policy-1")
        with tempfile.TemporaryDirectory() as temp_dir:
            with self._state_patch(Path(temp_dir)):
                approval_memory.create_approval_memory_rule(
                    workspace_id="ws-1",
                    owner_user_id="user-1",
                    capability="browser.click",
                    policy_id="policy-1",
                    profile_id="profile-1",
                    gateway_id="gw-1",
                    target_domain="example.com",
                    metadata={"agent_id": "sage"},
                )

                decision = decisions.decide_agent_computer_action(
                    workspace_id="ws-1",
                    actor_user_id="user-1",
                    agent_id="sage",
                    policy=policy,
                    computer_profile=self._profile(profile_id="profile-1", gateway_id="gw-1"),
                    capability="browser.click",
                    action_class="write",
                    target_url="https://example.com/approve",
                    current_kill_state="workspace_emergency_stop",
                )

        self.assertTrue(decision.blocked)
        self.assertEqual(decision.reason, "kill_state:workspace_emergency_stop")

    def test_decision_payloads_are_secret_free(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="trusted_workstation", policy_id="policy-1")

        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(dedicated=True),
            capability="communication.send",
            action_class="write",
            target_channel="telegram",
            target_recipient="+15555551212",
            payload={"api_key": "sk-secret123456789", "message": "call +15555551212"},
        )

        rendered = str(decision.as_dict())
        self.assertNotIn("sk-secret123456789", rendered)
        self.assertNotIn("+15555551212", rendered)
        self.assertIn("[redacted", rendered)

    def test_raw_payload_cannot_override_identity(self) -> None:
        policy = policies.build_default_agent_computer_policy(autonomy_mode="trusted_workstation", policy_id="policy-1")

        decision = decisions.decide_agent_computer_action(
            workspace_id="ws-1",
            actor_user_id="user-1",
            agent_id="sage",
            policy=policy,
            computer_profile=self._profile(dedicated=True),
            capability="file.write",
            action_class="write",
            target_path="/Users/mansur/Agent/draft.md",
            payload={
                "workspace_id": "evil-workspace",
                "actor_user_id": "evil-user",
                "agent_id": "evil-agent",
                "policy_id": "evil-policy",
            },
        )

        payload = decision.as_dict()
        self.assertEqual(payload["workspace_id"], "ws-1")
        self.assertEqual(payload["actor_user_id"], "user-1")
        self.assertEqual(payload["agent_id"], "sage")
        self.assertTrue(decision.allowed)


if __name__ == "__main__":
    unittest.main()
