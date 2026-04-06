import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import connectors_actions
from server_modules.connectors import slack_connector


ROOT_DIR = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT_DIR / "server_modules" / "direct_chat_runtime_exports.py"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
spec = importlib.util.spec_from_file_location("operator_chat_slack_under_test", MODULE_PATH)
operator_chat = importlib.util.module_from_spec(spec)
sys.modules["operator_chat_slack_under_test"] = operator_chat
assert spec and spec.loader
spec.loader.exec_module(operator_chat)


class SlackConnectorTests(unittest.TestCase):
    def test_send_message_requires_approval(self):
        payload = operator_chat._build_direct_tool_approval_response(
            tool_calls=[
                {
                    "name": "slack__send_message",
                    "arguments": json.dumps({"input": "{\"channel\":\"C123\",\"message\":\"hello from slack\"}"}),
                }
            ],
            tool_capabilities=[
                {
                    "id": "slack",
                    "label": "Slack LIVE",
                    "connected": True,
                    "authenticated": True,
                    "runtime_usable": True,
                    "read_actions": ["channels.read"],
                    "write_actions": ["send_message"],
                    "approval_required_actions": ["send_message"],
                }
            ],
        )

        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertEqual(payload["actions"][0]["connector"], "slack")
        self.assertEqual(payload["actions"][0]["action"], "send_message")

    @patch("server_modules.runs_execution._workflow_execute_connector_action")
    @patch("operator_chat_slack_under_test._direct_chat_workspace_context_text", return_value="")
    @patch(
        "operator_chat_slack_under_test.resolve_workspace_tool_capabilities",
        return_value=[
            {
                "id": "slack",
                "label": "Slack LIVE",
                "connected": True,
                "authenticated": True,
                "runtime_usable": True,
                "read_actions": ["channels.read"],
                "write_actions": ["send_message"],
                "approval_required_actions": ["send_message"],
            }
        ],
    )
    def test_send_message_with_approval_granted(
        self,
        _resolve_workspace_tool_capabilities,
        _workspace_context_text,
        execute_tool_mock,
    ):
        execute_tool_mock.return_value = {
            "summary": "Connector action completed: slack.send_message.",
            "result_data": {
                "connector_action": {
                    "connector": "slack",
                    "action_id": "send_message",
                    "channel_id": "C123",
                }
            },
        }

        payload = operator_chat.collect_direct_operator_reply(
            message="__approval_confirmed__",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
            approved_action={
                "connector": "slack",
                "action": "send_message",
                "input": "{\"channel\":\"C123\",\"message\":\"hello from slack\"}",
            },
        )

        self.assertEqual(payload["mode"], "answer")
        self.assertIn("slack.send_message", payload["reply"])
        execute_tool_mock.assert_called_once()

    def test_inbound_event_parsed_correctly(self):
        parsed = slack_connector.parse_inbound_event(
            {
                "type": "event_callback",
                "team_id": "T123",
                "event_id": "Ev123",
                "api_app_id": "A123",
                "event": {
                    "type": "app_mention",
                    "channel": "C123",
                    "user": "U123",
                    "text": "hello bot",
                    "ts": "1712000000.000100",
                    "thread_ts": "1712000000.000001",
                },
            }
        )

        self.assertEqual(parsed["kind"], "event")
        self.assertEqual(parsed["message_type"], "mention")
        self.assertEqual(parsed["channel"], "C123")
        self.assertEqual(parsed["user_id"], "U123")
        self.assertEqual(parsed["thread_ts"], "1712000000.000001")

    @patch("server_modules.connectors_actions.save_vault")
    @patch("server_modules.connectors_actions.load_vault", return_value={"credentials": []})
    @patch("server_modules.connectors_actions._openssl_encrypt", side_effect=lambda raw: raw)
    def test_oauth_token_stored_and_retrieved(
        self,
        _encrypt_mock,
        _load_vault_mock,
        save_vault_mock,
    ):
        result = connectors_actions._upsert_slack_oauth_connector_entry(
            workspace_id="default",
            label="Slack",
            credentials={
                "bot_token": "xoxb-test",
                "user_token": "xoxp-test",
                "team_id": "T123",
                "team_name": "Acme",
            },
            metadata={},
            test_result={
                "team": {"id": "T123", "name": "Acme"},
                "bot": {"user_id": "UBOT", "bot_status": "active"},
                "authed_user": {"id": "U123"},
                "ok": True,
            },
        )

        saved_vault = save_vault_mock.call_args.args[0]
        stored = saved_vault["credentials"][0]
        recovered = json.loads(stored["encrypted_secret"])

        self.assertEqual(result["connector"], "slack")
        self.assertEqual(result["metadata"]["team_name"], "Acme")
        self.assertEqual(recovered["bot_token"], "xoxb-test")
        self.assertEqual(recovered["user_token"], "xoxp-test")


if __name__ == "__main__":
    unittest.main()
