import unittest

from server_modules import policy_service
from server_modules import runtime_policy


class PolicyServiceTests(unittest.TestCase):
    def test_resolve_runtime_policy_mode_prefers_registered_runtime_policy(self) -> None:
        registry = runtime_policy.LOCAL_WORKER_REGISTRY
        previous = dict(registry)
        try:
            registry.clear()
            registry["runtime-1"] = {"policy_mode": "trusted_full_access"}
            resolved = policy_service.resolve_runtime_policy_mode(
                {
                    "execution_target_matching_runtime_ids": ["runtime-1"],
                },
                selected_target="local_companion",
            )
        finally:
            registry.clear()
            registry.update(previous)

        self.assertEqual(resolved["policy_mode"], "trusted_full_access")
        self.assertEqual(resolved["runtime_id"], "runtime-1")
        self.assertEqual(resolved["source"], "runtime_registration")

    def test_evaluate_tool_policy_decision_allows_safe_raw_shell_command(self) -> None:
        evaluation = policy_service.evaluate_tool_policy_decision(
            tool_id="execute_shell_command",
            trust_mode="guarded",
            target="local_companion",
            metadata={
                "pack_inputs": {
                    "operations": [
                        {
                            "tool": "execute_shell_command",
                            "command": "echo hello world",
                        }
                    ]
                }
            },
            capability_ids=[],
        )

        self.assertEqual(evaluation["execution_decision"], "allow")
        self.assertEqual(evaluation["reason"], "local_default_allow_local_reversible")
        self.assertTrue(evaluation["safe_raw_shell_command"])

    def test_compute_tool_policy_precheck_aggregates_items_and_counts(self) -> None:
        precheck = policy_service.compute_tool_policy_precheck(
            {"metadata": {"execution_target_selected": "local_companion"}},
            derive_browser_automation_policy_fn=lambda context: {
                "profile": "authenticated_interactive",
                "requires_approval": True,
                "session_profiles": ["default"],
                "session_profile_count": 1,
                "interactive_actions": ["click"],
                "privileged_actions": [],
            },
            predict_tool_ids_for_context_fn=lambda context: ["browser_automation", "read_write_files"],
            build_skill_contract_from_metadata_fn=lambda metadata, tool_ids, policy_mode, target: {
                "policy_mode": "observe",
                "undeclared_tools": [],
                "declared_runtime_tools": ["browser_automation", "read_write_files"],
            },
            predict_capability_ids_for_context_fn=lambda context: [],
            apply_agent_machine_bypass_to_tool_policy_evaluation_fn=lambda evaluation: evaluation,
        )

        self.assertEqual(precheck["blocked_count"], 0)
        self.assertEqual(precheck["approval_required_count"], 1)
        self.assertEqual(precheck["allow_count"], 1)
        self.assertIn("browser_automation", precheck["approval_required"])
        self.assertIn("read_write_files", precheck["allowed"])

    def test_approval_required_for_direct_tool_uses_capability_policy(self) -> None:
        requires_approval = policy_service.approval_required_for_direct_tool(
            "slack",
            "post_message",
            {},
            [{"id": "slack", "approval_required_actions": ["post_message"]}],
            compact_text=lambda value: str(value or "").strip().lower(),
            http_request_requires_approval=lambda method, url: False,
        )

        self.assertTrue(requires_approval)


if __name__ == "__main__":
    unittest.main()
