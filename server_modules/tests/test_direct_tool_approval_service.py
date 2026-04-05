import unittest

from server_modules import direct_tool_approval_service as service


class DirectToolApprovalServiceTests(unittest.TestCase):
    def test_shell_command_requires_approval_for_destructive_command(self) -> None:
        self.assertTrue(
            service.shell_command_requires_approval(
                "rm -rf /tmp/demo",
                compact_text=lambda value: str(value or "").strip().lower(),
            )
        )

    def test_file_write_requires_approval_for_protected_path(self) -> None:
        self.assertTrue(service.file_write_requires_approval({"path": "/etc/hosts"}))
        self.assertFalse(service.file_write_requires_approval({"path": "/tmp/demo.txt"}))

    def test_http_post_requires_approval(self) -> None:
        self.assertTrue(
            service.approval_required_for_direct_tool(
                "http",
                "request",
                {"method": "POST", "url": "https://api.example.com/items"},
                [],
                compact_text=lambda value: str(value or "").strip().lower(),
                http_request_requires_approval=lambda method, url: method == "POST",
            )
        )

    def test_connector_capability_actions_require_approval(self) -> None:
        self.assertTrue(
            service.approval_required_for_direct_tool(
                "slack",
                "post_message",
                {},
                [{"id": "slack", "approval_required_actions": ["post_message"]}],
                compact_text=lambda value: str(value or "").strip().lower(),
                http_request_requires_approval=lambda method, url: False,
            )
        )


if __name__ == "__main__":
    unittest.main()
