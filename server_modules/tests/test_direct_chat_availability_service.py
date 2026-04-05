import unittest

from server_modules import direct_chat_availability_service


class DirectChatAvailabilityServiceTests(unittest.TestCase):
    def test_no_ai_chat_response_reports_capability_status(self) -> None:
        payload = direct_chat_availability_service.no_ai_chat_response(
            {
                "tools": [
                    {"label": "Google Workspace", "connected": True, "runtime_usable": True},
                    {"label": "Telegram", "connected": True, "runtime_usable": False},
                ]
            },
            normalize_tool_capabilities_fn=lambda availability: availability.get("tools") or [],
            connect_action_fn=direct_chat_availability_service.connect_action,
        )

        self.assertIn("Connected here right now: Google Workspace, Telegram.", payload["reply"])
        self.assertIn("Usable now: Google Workspace.", payload["reply"])
        self.assertIn("Unavailable now: Telegram.", payload["reply"])
        self.assertEqual(payload["actions"][0]["kind"], "connect")

    def test_tool_gate_response_requires_google_connection(self) -> None:
        payload = direct_chat_availability_service.tool_gate_response(
            "summarize my gmail inbox",
            {},
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, markers: any(marker in text for marker in markers),
            is_obvious_smtp_write_request_fn=lambda _text: False,
            tool_connected_fn=lambda _availability, _tool_id: False,
            tool_runtime_usable_fn=lambda _availability, _tool_id: None,
            connect_action_fn=direct_chat_availability_service.connect_action,
            google_repair_action_fn=lambda: {"kind": "repair"},
            google_workspace_keywords=("gmail", "emails"),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
        )

        self.assertIsNotNone(payload)
        self.assertIn("Google Workspace is not connected", payload["reply"])
        self.assertEqual(payload["actions"][0]["href"], "/credentials?connector=google_workspace")

    def test_suggest_actions_prefers_workflow_action(self) -> None:
        actions = direct_chat_availability_service.suggest_actions(
            "turn this into a workflow",
            {},
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            mentions_any_fn=lambda text, markers: any(marker in text for marker in markers),
            question_like_fn=lambda compact: compact.startswith(("what ", "how ")),
            is_explicit_workflow_request_fn=lambda message: "workflow" in str(message or "").lower(),
            is_obvious_smtp_write_request_fn=lambda _text: False,
            tool_runtime_usable_fn=lambda _availability, _tool_id: None,
            workflow_action_fn=direct_chat_availability_service.workflow_action,
            run_action_fn=direct_chat_availability_service.run_action,
            google_workspace_keywords=("gmail",),
            telegram_keywords=("telegram",),
            slack_keywords=("slack",),
            dropbox_keywords=("dropbox",),
            s3_keywords=("s3",),
            execution_markers=("run", "execute"),
        )

        self.assertEqual(len(actions), 1)
        self.assertEqual(actions[0]["kind"], "workflow")

    def test_connector_write_preview_allowed_for_verified_google_write(self) -> None:
        allowed = direct_chat_availability_service.connector_write_preview_allowed(
            "Draft an email to the team",
            {},
            compact_text_fn=lambda value: str(value or "").strip().lower(),
            is_obvious_telegram_write_request_fn=lambda _compact: False,
            is_obvious_google_write_request_fn=lambda compact: "draft an email" in compact,
            is_obvious_smtp_write_request_fn=lambda _compact: False,
            tool_runtime_usable_fn=lambda _availability, tool_id: True if tool_id == "google_workspace" else None,
        )

        self.assertTrue(allowed)


if __name__ == "__main__":
    unittest.main()
