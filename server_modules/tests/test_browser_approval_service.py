import unittest

from server_modules import browser_approval_service


class BrowserApprovalServiceTests(unittest.TestCase):
    def test_prepare_browser_local_tool_context_requires_explicit_browser_permission(self):
        with self.assertRaises(RuntimeError):
            browser_approval_service.prepare_browser_local_tool_context(
                {
                    "url": "https://example.com/private",
                    "mode": "capture_page",
                    "session_profile": "default",
                },
                {"browser_permissions": {"allow": False}},
                normalize_action_id_fn=lambda value: str(value or "").strip().lower(),
                browser_auth_actions={"click", "type"},
                browser_automation_policy_from_operations_fn=lambda operations: {},
            )

    def test_prepare_browser_local_tool_context_builds_reviewed_metadata(self):
        payload = browser_approval_service.prepare_browser_local_tool_context(
            {
                "url": "https://example.com/private",
                "mode": "capture_page",
                "session_profile": "default",
                "browser_actions": [{"action": "click", "selector": "#login"}],
            },
            {"browser_permissions": {"allow": True}},
            normalize_action_id_fn=lambda value: str(value or "").strip().lower(),
            browser_auth_actions={"click", "type"},
            browser_automation_policy_from_operations_fn=lambda operations: {
                "immutable_plan_hash": "hash-1",
                "reviewed_approval_required": True,
            },
        )

        self.assertEqual(payload["session_profile"], "default")
        self.assertEqual(payload["interactive_actions"], ["click"])
        self.assertEqual(payload["metadata_overrides"]["browser_session_profile"], "default")
        self.assertEqual(payload["metadata_overrides"]["browser_immutable_plan_hash"], "hash-1")
        self.assertTrue(payload["metadata_overrides"]["browser_reviewed_approval_required"])

    def test_apply_browser_policy_metadata_sets_and_clears_reviewed_flag(self):
        metadata = {"browser_reviewed_approval_required": True}

        browser_approval_service.apply_browser_policy_metadata(
            metadata,
            {
                "session_profiles": ["qa-browser"],
                "immutable_plan_hash": "hash-2",
                "reviewed_approval_required": False,
            },
        )

        self.assertEqual(metadata["browser_session_profile"], "qa-browser")
        self.assertEqual(metadata["browser_immutable_plan_hash"], "hash-2")
        self.assertNotIn("browser_reviewed_approval_required", metadata)

    def test_browser_approval_summary_projects_browser_fields(self):
        payload = browser_approval_service.browser_approval_summary(
            {
                "browser_session_profile": "qa-browser",
                "browser_immutable_plan_hash": "hash-1",
                "browser_reviewed_approval_required": True,
                "browser_interactive_actions": ["click", "type"],
            }
        )

        self.assertEqual(payload["session_profile"], "qa-browser")
        self.assertEqual(payload["immutable_plan_hash"], "hash-1")
        self.assertEqual(payload["interactive_actions"], ["click", "type"])
        self.assertTrue(payload["reviewed_approval_required"])

    def test_browser_approval_summary_omits_binding_unless_sensitive(self):
        metadata = {
            "browser_execution_binding": {"cwd": "/tmp/project"},
            "browser_session_profile": "default",
        }

        public_payload = browser_approval_service.browser_approval_summary(metadata)
        sensitive_payload = browser_approval_service.browser_approval_summary(metadata, include_sensitive=True)

        self.assertNotIn("execution_binding", public_payload)
        self.assertEqual(sensitive_payload["execution_binding"]["cwd"], "/tmp/project")


if __name__ == "__main__":
    unittest.main()
