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

        self.assertEqual(evaluation.get("decision"), "approval_required")
        self.assertEqual(evaluation.get("reason"), "browser_authenticated_requires_approval")


if __name__ == "__main__":
    unittest.main()
