from __future__ import annotations

import unittest

from server_modules import hardware_access_policy_service as policy


class HardwareAccessPolicyServiceTests(unittest.TestCase):
    def test_default_guarded_allows_safe_read_actions(self) -> None:
        self.assertFalse(
            policy.hardware_action_requires_software_approval(
                runtime_access_mode="default_guarded",
                capability_id="filesystem.read",
                action_id="file.read",
                arguments={"path": "/tmp/example.txt"},
                require_approval=None,
            )
        )
        self.assertFalse(
            policy.hardware_action_requires_software_approval(
                runtime_access_mode="default_guarded",
                capability_id="screenshot.capture",
                action_id="screenshot.capture",
                arguments={},
                require_approval=None,
            )
        )

    def test_default_guarded_requires_approval_for_risky_actions(self) -> None:
        self.assertTrue(
            policy.hardware_action_requires_software_approval(
                runtime_access_mode="default_guarded",
                capability_id="shell.execute",
                action_id="shell.execute",
                arguments={"command": "rm -rf /tmp/demo"},
                require_approval=None,
            )
        )
        self.assertTrue(
            policy.hardware_action_requires_software_approval(
                runtime_access_mode="default_guarded",
                capability_id="filesystem.write",
                action_id="file.write",
                arguments={"path": "/tmp/example.txt"},
                require_approval=None,
            )
        )

    def test_full_access_skips_empyralis_action_approval(self) -> None:
        self.assertFalse(
            policy.hardware_action_requires_software_approval(
                runtime_access_mode="full_access",
                capability_id="shell.execute",
                action_id="shell.execute",
                arguments={"command": "rm -rf /tmp/demo"},
                require_approval=True,
            )
        )
        self.assertEqual(
            policy.runtime_access_metadata("full_access", None)["approval_mode"],
            "no_empyralis_action_approvals",
        )

    def test_custom_access_remains_approval_gated(self) -> None:
        self.assertTrue(
            policy.hardware_action_requires_software_approval(
                runtime_access_mode="custom",
                capability_id="shell.execute",
                action_id="shell.execute",
                arguments={"command": "rm -rf /tmp/demo"},
                require_approval=None,
            )
        )
        self.assertEqual(
            policy.runtime_access_metadata("custom", None)["approval_mode"],
            "custom_policy_guarded",
        )
        self.assertTrue(policy.runtime_access_metadata("custom", None)["empyralis_action_approvals_enabled"])


if __name__ == "__main__":
    unittest.main()
