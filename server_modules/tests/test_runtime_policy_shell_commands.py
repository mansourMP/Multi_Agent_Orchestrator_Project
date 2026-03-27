import unittest

from server_modules.runtime_policy import evaluate_tool_policy_decision


class RuntimePolicyShellCommandTests(unittest.TestCase):
    def test_raw_shell_command_stays_blocked_by_default(self):
        evaluation = evaluate_tool_policy_decision(
            tool_id="execute_shell_command",
            trust_mode="guarded",
            target="local_companion",
            metadata={},
            capability_ids=[],
        )

        self.assertEqual(evaluation.get("decision"), "blocked")
        self.assertEqual(evaluation.get("reason"), "blocked_raw_shell_command")
        self.assertTrue(evaluation.get("uses_raw_command_path"))
        self.assertFalse(evaluation.get("uses_capability_path"))

    def test_capability_backed_shell_command_uses_reviewable_path(self):
        evaluation = evaluate_tool_policy_decision(
            tool_id="execute_shell_command",
            trust_mode="guarded",
            target="local_companion",
            metadata={},
            capability_ids=["stack.status"],
        )

        self.assertEqual(evaluation.get("decision"), "approval_required")
        self.assertEqual(evaluation.get("reason"), "guarded_requires_approval_critical")
        self.assertTrue(evaluation.get("uses_capability_path"))
        self.assertFalse(evaluation.get("uses_raw_command_path"))


if __name__ == "__main__":
    unittest.main()
