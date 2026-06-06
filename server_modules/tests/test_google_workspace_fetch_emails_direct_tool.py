import json
import unittest
from unittest.mock import patch

from server_modules import runs_execution, skills_service, tool_availability_truth


class GoogleWorkspaceFetchEmailsDirectToolTests(unittest.TestCase):
    def test_google_workspace_verification_exposes_fetch_emails_as_read_tool_action(self) -> None:
        verification = tool_availability_truth.capability_verification_from_test_result(
            "google_workspace",
            {"ok": True},
        )

        self.assertIn("gmail_threads.read", verification["read_actions"])
        self.assertIn("fetch_emails", verification["write_actions"])
        self.assertNotIn("fetch_emails", verification["approval_required_actions"])

        tools = skills_service.build_direct_chat_tools(
            [
                {
                    "id": "google_workspace",
                    "label": "Google Workspace",
                    "connected": True,
                    **verification,
                }
            ]
        )
        by_name = {item["name"]: item for item in tools}

        self.assertIn("google_workspace__fetch_emails", by_name)
        fetch_tool = by_name["google_workspace__fetch_emails"]
        self.assertEqual(fetch_tool["connector_id"], "google_workspace")
        self.assertEqual(fetch_tool["action_id"], "fetch_emails")
        self.assertEqual(fetch_tool["action_class"], "read")
        self.assertFalse(fetch_tool["requires_approval"])

    def test_google_workspace_fetch_emails_direct_tool_config_parses_limit(self) -> None:
        config = skills_service.build_direct_tool_config(
            "google_workspace",
            "fetch_emails",
            '{"limit": 5}',
            parse_json_object_loose=json.loads,
        )

        self.assertEqual(config["connector"], "google_workspace")
        self.assertEqual(config["action_id"], "fetch_emails")
        self.assertEqual(config["limit"], 5)

    def test_google_workspace_fetch_emails_executes_existing_recent_message_reader(self) -> None:
        with (
            patch(
                "server_modules.runs_execution._workflow_tool_connector_secret",
                return_value=("cred-google", "google_workspace", {"_provider": "google_workspace"}),
            ),
            patch(
                "server_modules.runs_execution.common.list_recent_connector_messages",
                return_value=[
                    {
                        "id": "msg-1",
                        "threadId": "thread-1",
                        "subject": "Launch",
                        "from": "sender@example.com",
                        "to": "owner@example.com",
                        "date": "2026-06-06T00:00:00Z",
                        "snippet": "Ready." + ("x" * 1400),
                        "body_text": "full private body must not pass through",
                    }
                ],
            ) as list_recent,
        ):
            result = runs_execution._workflow_execute_connector_action(
                "run-gmail-fetch",
                "node-gmail-fetch",
                {"workspace_id": "default", "metadata": {}},
                {
                    "connector": "google_workspace",
                    "action_id": "fetch_emails",
                    "limit": 4,
                },
                current_text="Summarize my latest Gmail messages.",
            )

        list_recent.assert_called_once()
        self.assertEqual(list_recent.call_args.kwargs["limit"], 4)
        connector_action = result["result_data"]["connector_action"]
        self.assertEqual(connector_action["connector"], "google_workspace")
        self.assertEqual(connector_action["credential_id"], "cred-google")
        self.assertEqual(connector_action["action_id"], "fetch_emails")
        self.assertEqual(connector_action["result"][0]["subject"], "Launch")
        self.assertEqual(connector_action["result"][0]["threadId"], "thread-1")
        self.assertNotIn("body_text", connector_action["result"][0])
        self.assertLessEqual(len(connector_action["result"][0]["snippet"]), 1200)


if __name__ == "__main__":
    unittest.main()
