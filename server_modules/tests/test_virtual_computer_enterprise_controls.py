import asyncio
import unittest

from server_modules.virtual_computer_runtime import InMemoryVirtualComputerRuntime


class VirtualComputerEnterpriseControlsTests(unittest.TestCase):
    def test_workspace_admin_policy_required_for_session_create(self):
        runtime = InMemoryVirtualComputerRuntime()
        with self.assertRaises(RuntimeError):
            asyncio.run(
                runtime.create_session(
                    {
                        "runtime_choice": "virtual_browser",
                        "enterprise_controls": {
                            "workspace_admin_policy": {"require_workspace_admin_for_runtime": True},
                        },
                    }
                )
            )

        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "workspace_admin_approved": True,
                    "enterprise_controls": {
                        "workspace_admin_policy": {"require_workspace_admin_for_runtime": True},
                        "data_residency": "eu",
                        "sso_required": True,
                    },
                }
            )
        )
        enterprise = created.get("enterprise_controls") or {}
        self.assertEqual(enterprise.get("data_residency"), "eu")
        self.assertTrue(enterprise.get("sso_required"))

    def test_disable_public_internet_mode_enforces_domain_allowlist(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "enterprise_controls": {
                        "disable_public_internet_mode": True,
                        "domain_allowlist": ["supplier.example"],
                    },
                }
            )
        )
        session_id = created.get("session_id")

        allowed = asyncio.run(
            runtime.execute_action(
                {
                    "session_id": session_id,
                    "action": "open_url",
                    "action_args": {"url": "https://supplier.example/portal"},
                }
            )
        )
        self.assertEqual((allowed.get("action_result") or {}).get("action"), "open_url")

        with self.assertRaises(RuntimeError):
            asyncio.run(
                runtime.execute_action(
                    {
                        "session_id": session_id,
                        "action": "open_url",
                        "action_args": {"url": "https://random.example/portal"},
                    }
                )
            )

    def test_per_team_approval_roles_are_enforced(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "enterprise_controls": {
                        "per_team_approval_roles": ["security_reviewer"],
                    },
                }
            )
        )
        session_id = created.get("session_id")

        with self.assertRaises(RuntimeError):
            asyncio.run(
                runtime.execute_action(
                    {
                        "session_id": session_id,
                        "action": "type",
                        "approval_id": "appr_bad_role",
                        "approval_role": "analyst",
                        "action_args": {
                            "text": "hello",
                            "target_description": "login form submit field",
                        },
                    }
                )
            )

        approved = asyncio.run(
            runtime.execute_action(
                {
                    "session_id": session_id,
                    "action": "type",
                    "approval_id": "appr_good_role",
                    "approval_role": "security_reviewer",
                    "action_args": {
                        "text": "hello",
                        "target_description": "login form submit field",
                    },
                }
            )
        )
        self.assertEqual((approved.get("action_result") or {}).get("action"), "type")

    def test_audit_export_can_be_blocked_by_enterprise_policy(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "enterprise_controls": {
                        "allow_audit_export": False,
                    },
                }
            )
        )
        session_id = created.get("session_id")
        with self.assertRaises(RuntimeError):
            asyncio.run(runtime.export_audit_report({"session_id": session_id}))


if __name__ == "__main__":
    unittest.main()
