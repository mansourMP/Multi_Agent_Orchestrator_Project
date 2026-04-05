import unittest

from server_modules import skills_service


class SkillsServiceTests(unittest.TestCase):
    def test_capability_descriptor_from_payload_normalizes_fields(self) -> None:
        descriptor = skills_service.capability_descriptor_from_payload(
            {
                "id": " Slack ",
                "label": " Slack Live ",
                "connected": True,
                "authenticated": True,
                "runtime_usable": False,
                "read_actions": [" history.read ", ""],
                "write_actions": [" post_message "],
                "approval_required_actions": ["post_message", "post_message"],
            }
        )

        assert descriptor is not None
        self.assertEqual(descriptor.capability_id, "slack")
        self.assertEqual(descriptor.label, "Slack Live")
        self.assertTrue(descriptor.requires_approval)
        self.assertEqual(descriptor.metadata["read_actions"], ["history.read"])
        self.assertEqual(descriptor.metadata["write_actions"], ["post_message"])
        self.assertEqual(descriptor.metadata["approval_required_actions"], ["post_message"])

    def test_normalize_capability_payloads_filters_invalid_items(self) -> None:
        payload = skills_service.normalize_capability_payloads(
            [
                {"id": "browser", "connected": True},
                {"id": ""},
                "skip",
            ]
        )

        self.assertEqual(payload, [{"id": "browser", "label": "browser", "connected": True, "authenticated": None, "runtime_usable": None, "read_actions": [], "write_actions": [], "approval_required_actions": []}])

    def test_resolve_workspace_capability_payloads_normalizes_resolver_result(self) -> None:
        payload = skills_service.resolve_workspace_capability_payloads(
            "workspace-a",
            resolve_workspace_tool_capabilities_fn=lambda workspace_id: [
                {"id": " Gmail ", "workspace_id": workspace_id, "connected": True}
            ],
        )

        self.assertEqual(payload[0]["id"], "gmail")
        self.assertEqual(payload[0]["connected"], True)


if __name__ == "__main__":
    unittest.main()
