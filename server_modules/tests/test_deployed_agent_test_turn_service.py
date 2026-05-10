from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from server_modules.deployed_agent_test_turn_service import (
    ALLOWED_TEST_CHANNELS,
    ALLOWED_RUNTIME_MODES,
    TESTABLE_STATES,
    _build_policy_decisions,
    _evaluate_tool_policy,
    _load_memory_context_for_test,
    execute_test_turn,
)
from server_modules.schemas import DeployedAgentTestTurnRequest


class DummyConfig:
    def __init__(self, **kwargs):
        self.deployment_state = kwargs.get("deployment_state", "draft")
        self.runtime_placement = kwargs.get("runtime_placement", "managed_cloud")
        self.studio_agent_mode = kwargs.get("studio_agent_mode", "text_agent")
        self.runtime_target = kwargs.get("runtime_target", "cloud_default")
        self.channels = kwargs.get("channels", {})
        self.tool_policy = kwargs.get("tool_policy")
        self.safety_policy = kwargs.get("safety_policy")
        self.memory_policy = kwargs.get("memory_policy")


class DummyToolPolicy:
    def __init__(self, **kwargs):
        self.allowed_tool_ids = kwargs.get("allowed_tool_ids", [])
        self.blocked_tool_ids = kwargs.get("blocked_tool_ids", [])


class DummySafetyPolicy:
    def __init__(self, **kwargs):
        self.approval_mode = kwargs.get("approval_mode", "balanced")
        self.handoff_mode = kwargs.get("handoff_mode", "always")


class DummyMemoryPolicy:
    def __init__(self, **kwargs):
        self.memory_enabled = kwargs.get("memory_enabled", False)
        self.context_budget_preset = kwargs.get("context_budget_preset", "compact")
        self.retention_preset = kwargs.get("retention_preset", "standard")


def _make_request(**overrides) -> DeployedAgentTestTurnRequest:
    return DeployedAgentTestTurnRequest(
        workspace_id=overrides.get("workspace_id", "ws-1"),
        message=overrides.get("message", "hello"),
        channel=overrides.get("channel", "test"),
        runtime_mode=overrides.get("runtime_mode", "text_agent"),
        customer_profile=overrides.get("customer_profile"),
    )


class TestTurnValidationTests(unittest.TestCase):
    def test_allowed_channels(self):
        self.assertIn("test", ALLOWED_TEST_CHANNELS)
        self.assertIn("telegram_personal", ALLOWED_TEST_CHANNELS)
        self.assertIn("whatsapp_personal", ALLOWED_TEST_CHANNELS)
        self.assertIn("web_chat", ALLOWED_TEST_CHANNELS)

    def test_allowed_runtime_modes(self):
        for mode in ("text_agent", "cloud_computer_agent", "my_computer_agent", "self_hosted_agent"):
            self.assertIn(mode, ALLOWED_RUNTIME_MODES)

    def test_testable_states(self):
        self.assertIn("draft", TESTABLE_STATES)
        self.assertIn("private_test", TESTABLE_STATES)
        self.assertIn("ready_for_review", TESTABLE_STATES)
        self.assertNotIn("live", TESTABLE_STATES)
        self.assertNotIn("archived", TESTABLE_STATES)

    def test_rejects_live_state(self):
        req = _make_request()
        with patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_service.get_deployed_agent_detail",
            new=AsyncMock(return_value={"deployed_agent": {"deployment_state": "live", "id": "a1"}}),
        ), patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_config_schema.deployed_agent_config_from_record",
            return_value=DummyConfig(deployment_state="live"),
        ):
            with self.assertRaises(ValueError) as ctx:
                import asyncio
                asyncio.run(execute_test_turn(
                    deployed_agent_id="a1",
                    workspace_id="ws-1",
                    tenant_id="t-1",
                    request=req,
                    current_user={"user_id": "u-1"},
                ))
            self.assertIn("state", str(ctx.exception).lower())

    def test_rejects_empty_message(self):
        req = _make_request(message="")
        with self.assertRaises(ValueError) as ctx:
            import asyncio
            asyncio.run(execute_test_turn(
                deployed_agent_id="a1",
                workspace_id="ws-1",
                tenant_id="t-1",
                request=req,
                current_user={},
            ))
        self.assertIn("message", str(ctx.exception).lower())

    def test_rejects_invalid_channel(self):
        req = _make_request(channel="email")
        with self.assertRaises(ValueError) as ctx:
            import asyncio
            asyncio.run(execute_test_turn(
                deployed_agent_id="a1",
                workspace_id="ws-1",
                tenant_id="t-1",
                request=req,
                current_user={},
            ))
        self.assertIn("channel", str(ctx.exception).lower())

    def test_rejects_invalid_runtime_mode(self):
        req = _make_request(runtime_mode="unknown_mode")
        with self.assertRaises(ValueError) as ctx:
            import asyncio
            asyncio.run(execute_test_turn(
                deployed_agent_id="a1",
                workspace_id="ws-1",
                tenant_id="t-1",
                request=req,
                current_user={},
            ))
        self.assertIn("runtime_mode", str(ctx.exception).lower())


class TestTurnPolicyTests(unittest.TestCase):
    def test_build_policy_decisions_includes_runtime_mode(self):
        config = DummyConfig(
            channels={"test": MagicMock(enabled=True)},
        )
        decisions = _build_policy_decisions(
            config=config,
            requested_mode="text_agent",
            requested_channel="test",
        )
        runtime_decisions = [d for d in decisions if d["policy"] == "runtime_mode"]
        self.assertEqual(len(runtime_decisions), 1)
        self.assertEqual(runtime_decisions[0]["requested"], "text_agent")

    def test_build_policy_decisions_includes_channel(self):
        config = DummyConfig(
            channels={"test": MagicMock(enabled=True)},
        )
        decisions = _build_policy_decisions(
            config=config,
            requested_mode="text_agent",
            requested_channel="test",
        )
        channel_decisions = [d for d in decisions if d["policy"] == "channel"]
        self.assertEqual(len(channel_decisions), 1)
        self.assertTrue(channel_decisions[0]["simulated"])

    def test_evaluate_tool_policy_blocks_write_skills(self):
        from server_modules.skill_registry import SkillDefinition

        config = DummyConfig(
            tool_policy=DummyToolPolicy(allowed_tool_ids=["email-access"]),
        )
        with patch(
            "server_modules.skill_registry.list_skill_definitions",
            return_value=[
                SkillDefinition(
                    id="email-access", label="Email", description="Send",
                    permission_label="email", execution_mode="manual",
                    action_class="write", connector_scopes=("email",),
                    trigger_terms=("send email",), requires_approval=True,
                ),
            ],
        ):
            considered, used, approval = _evaluate_tool_policy(
                config=config,
                message="send email to boss",
            )

        self.assertTrue(approval)
        self.assertEqual(len(used), 0)
        self.assertTrue(any(c["reason"] == "requires_approval" for c in considered))

    def test_evaluate_tool_policy_allows_read_skills(self):
        from server_modules.skill_registry import SkillDefinition

        config = DummyConfig(
            tool_policy=DummyToolPolicy(allowed_tool_ids=["web-search"]),
        )
        with patch(
            "server_modules.skill_registry.list_skill_definitions",
            return_value=[
                SkillDefinition(
                    id="web-search", label="Web Search", description="Search",
                    permission_label="web", execution_mode="live",
                    action_class="read", connector_scopes=(),
                    trigger_terms=("search",), requires_approval=False,
                ),
            ],
        ):
            considered, used, approval = _evaluate_tool_policy(
                config=config,
                message="search for latest news",
            )

        self.assertFalse(approval)
        self.assertIn("web-search", used)

    def test_evaluate_tool_policy_blocks_by_policy(self):
        from server_modules.skill_registry import SkillDefinition

        config = DummyConfig(
            tool_policy=DummyToolPolicy(blocked_tool_ids=["browser"]),
        )
        with patch(
            "server_modules.skill_registry.list_skill_definitions",
            return_value=[
                SkillDefinition(
                    id="browser", label="Browser", description="Browse",
                    permission_label="browser", execution_mode="live",
                    action_class="read", connector_scopes=(),
                    trigger_terms=("browse",), requires_approval=False,
                ),
            ],
        ):
            considered, used, approval = _evaluate_tool_policy(
                config=config,
                message="browse the web",
            )

        self.assertFalse(approval)
        self.assertTrue(any(c["reason"] == "blocked_by_policy" for c in considered))

    def test_memory_context_disabled_when_policy_off(self):
        config = DummyConfig(memory_policy=DummyMemoryPolicy(memory_enabled=False))
        ctx = _load_memory_context_for_test(
            workspace_id="ws-1", tenant_id="t-1", config=config,
        )
        self.assertFalse(ctx["enabled"])
        self.assertFalse(ctx["applied"])

    def test_memory_context_enabled_when_policy_on(self):
        config = DummyConfig(memory_policy=DummyMemoryPolicy(memory_enabled=True))
        ctx = _load_memory_context_for_test(
            workspace_id="ws-1", tenant_id="t-1", config=config,
        )
        self.assertTrue(ctx["enabled"])
        self.assertTrue(ctx["applied"])

    def test_test_turn_returns_full_contract(self):
        req = _make_request(message="hello test")
        with patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_service.get_deployed_agent_detail",
            new=AsyncMock(return_value={"deployed_agent": {"deployment_state": "draft", "id": "a1"}}),
        ), patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_config_schema.deployed_agent_config_from_record",
            return_value=DummyConfig(
                deployment_state="draft",
                channels={"test": MagicMock(enabled=True)},
            ),
        ), patch(
            "server_modules.skill_registry.list_skill_definitions",
            return_value=[],
        ), patch(
            "server_modules.deployed_agent_test_turn_service.security_audit_service.emit_security_audit_event",
        ):
            import asyncio
            result = asyncio.run(execute_test_turn(
                deployed_agent_id="a1",
                workspace_id="ws-1",
                tenant_id="t-1",
                request=req,
                current_user={"user_id": "u-1", "email": "test@test.com"},
            ))

            self.assertTrue(len(result.reply) > 0)
            self.assertIsInstance(result.policy_decisions, list)
            self.assertIsInstance(result.tools_considered, list)
            self.assertIsInstance(result.tools_used, list)
            self.assertIsInstance(result.memory_context, dict)
            self.assertFalse(result.approval_required)
            self.assertIsInstance(result.audit_events, list)
            self.assertTrue(len(result.trace_id) > 0)

    def test_test_turn_approval_required_for_risky_tool(self):
        from server_modules.skill_registry import SkillDefinition

        req = _make_request(message="send email now")
        with patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_service.get_deployed_agent_detail",
            new=AsyncMock(return_value={"deployed_agent": {"deployment_state": "draft", "id": "a1"}}),
        ), patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_config_schema.deployed_agent_config_from_record",
            return_value=DummyConfig(
                deployment_state="draft",
                channels={"test": MagicMock(enabled=True)},
                tool_policy=DummyToolPolicy(),
            ),
        ), patch(
            "server_modules.skill_registry.list_skill_definitions",
            return_value=[
                SkillDefinition(
                    id="email-access", label="Email", description="Send",
                    permission_label="email", execution_mode="manual",
                    action_class="write", connector_scopes=("email",),
                    trigger_terms=("send email",), requires_approval=True,
                ),
            ],
        ), patch(
            "server_modules.deployed_agent_test_turn_service.security_audit_service.emit_security_audit_event",
        ):
            import asyncio
            result = asyncio.run(execute_test_turn(
                deployed_agent_id="a1",
                workspace_id="ws-1",
                tenant_id="t-1",
                request=req,
                current_user={"user_id": "u-1"},
            ))

            self.assertTrue(result.approval_required)
            self.assertIn("TEST MODE", result.reply)

    def test_audit_event_emitted(self):
        req = _make_request()
        with patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_service.get_deployed_agent_detail",
            new=AsyncMock(return_value={"deployed_agent": {"deployment_state": "draft", "id": "a1"}}),
        ), patch(
            "server_modules.deployed_agent_test_turn_service.deployed_agent_config_schema.deployed_agent_config_from_record",
            return_value=DummyConfig(
                deployment_state="draft",
                channels={"test": MagicMock(enabled=True)},
            ),
        ), patch(
            "server_modules.skill_registry.list_skill_definitions",
            return_value=[],
        ), patch(
            "server_modules.deployed_agent_test_turn_service.security_audit_service.emit_security_audit_event",
        ) as mock_audit:
            import asyncio
            result = asyncio.run(execute_test_turn(
                deployed_agent_id="a1",
                workspace_id="ws-1",
                tenant_id="t-1",
                request=req,
                current_user={"user_id": "u-1"},
            ))

            mock_audit.assert_called()
            self.assertEqual(result.audit_events[0]["action"], "deployed_agent.test_turn")


if __name__ == "__main__":
    unittest.main()
