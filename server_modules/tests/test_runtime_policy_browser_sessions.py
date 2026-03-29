import unittest

from server_modules.runtime_policy import evaluate_tool_policy_decision


class RuntimePolicyBrowserSessionTests(unittest.TestCase):
    def test_authenticated_readonly_browser_requires_approval_in_guarded_mode(self):
        evaluation = evaluate_tool_policy_decision(
            tool_id="browser_automation",
            trust_mode="guarded",
            target="local_companion",
            metadata={
                "browser_automation_policy": {
                    "profile": "authenticated_readonly",
                    "requires_approval": True,
                    "session_profiles": ["default"],
                    "session_profile_count": 1,
                    "interactive_actions": [],
                    "privileged_actions": [],
                }
            },
        )

        self.assertEqual(evaluation.get("execution_decision"), "require_confirmation")
        self.assertEqual(evaluation.get("reason"), "browser_authenticated_requires_approval")

    def test_authenticated_interactive_browser_is_blocked_on_local_companion_v1(self):
        evaluation = evaluate_tool_policy_decision(
            tool_id="browser_automation",
            trust_mode="guarded",
            target="local_companion",
            metadata={
                "browser_automation_policy": {
                    "profile": "authenticated_interactive",
                    "requires_approval": True,
                    "session_profiles": ["default"],
                    "session_profile_count": 1,
                    "interactive_actions": ["click", "type"],
                    "privileged_actions": [],
                }
            },
        )

        self.assertEqual(evaluation.get("execution_decision"), "deny")
        self.assertEqual(evaluation.get("reason"), "blocked_browser_authenticated_interactive_local_v1")

    def test_authenticated_privileged_browser_is_blocked_on_local_companion_v1(self):
        evaluation = evaluate_tool_policy_decision(
            tool_id="browser_automation",
            trust_mode="guarded",
            target="local_companion",
            metadata={
                "browser_automation_policy": {
                    "profile": "authenticated_privileged",
                    "requires_approval": True,
                    "session_profiles": ["default"],
                    "session_profile_count": 1,
                    "interactive_actions": ["upload"],
                    "privileged_actions": ["upload"],
                }
            },
        )

        self.assertEqual(evaluation.get("execution_decision"), "deny")
        self.assertEqual(evaluation.get("reason"), "blocked_browser_authenticated_privileged_local_v1")


if __name__ == "__main__":
    unittest.main()
