import unittest

from server_modules import execution_mode_policy


class ExecutionModePolicyTests(unittest.TestCase):
    def test_full_access_is_available_for_dedicated_runtime_targets(self) -> None:
        cloud_modes = {
            item["id"]: item
            for item in execution_mode_policy.mode_contract_for_target("sage_cloud_computer")
        }
        local_modes = {
            item["id"]: item
            for item in execution_mode_policy.mode_contract_for_target("local_companion")
        }
        self_hosted_modes = {
            item["id"]: item
            for item in execution_mode_policy.mode_contract_for_target("self_host_runtime")
        }

        self.assertTrue(cloud_modes["full_access"]["available"])
        self.assertTrue(cloud_modes["autopilot"]["available"])
        self.assertFalse(cloud_modes["full_access"]["destructive_actions_require_approval"])
        self.assertTrue(local_modes["full_access"]["available"])
        self.assertTrue(local_modes["full_access"]["requires_owner_approval"])
        self.assertTrue(self_hosted_modes["full_access"]["available"])
        self.assertEqual(
            self_hosted_modes["full_access"]["runtime_access_mode"],
            execution_mode_policy.FULL_RUNTIME_ACCESS_MODE,
        )

    def test_summary_declares_safety_boundary(self) -> None:
        summary = execution_mode_policy.routing_contract_summary()

        self.assertEqual(summary["full_access_scope"], "dedicated_runtime_targets")
        self.assertEqual(summary["destructive_actions_require_approval"], "default_guarded_only")
        self.assertIn("autopilot", summary["supported_execution_modes"])
        self.assertIn("full_access", summary["supported_execution_modes"])
        self.assertIn("full_access", summary["supported_runtime_access_modes"])


if __name__ == "__main__":
    unittest.main()
