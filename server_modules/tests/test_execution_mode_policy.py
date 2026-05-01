import unittest

from server_modules import execution_mode_policy


class ExecutionModePolicyTests(unittest.TestCase):
    def test_full_access_is_only_available_for_local_companion(self) -> None:
        cloud_modes = {
            item["id"]: item
            for item in execution_mode_policy.mode_contract_for_target("sage_cloud_computer")
        }
        local_modes = {
            item["id"]: item
            for item in execution_mode_policy.mode_contract_for_target("local_companion")
        }

        self.assertFalse(cloud_modes["full_access"]["available"])
        self.assertTrue(cloud_modes["autopilot"]["available"])
        self.assertTrue(local_modes["full_access"]["available"])
        self.assertTrue(local_modes["full_access"]["requires_owner_approval"])

    def test_summary_declares_safety_boundary(self) -> None:
        summary = execution_mode_policy.routing_contract_summary()

        self.assertEqual(summary["full_access_scope"], "local_companion_only")
        self.assertTrue(summary["destructive_actions_require_approval"])
        self.assertIn("autopilot", summary["supported_execution_modes"])


if __name__ == "__main__":
    unittest.main()
