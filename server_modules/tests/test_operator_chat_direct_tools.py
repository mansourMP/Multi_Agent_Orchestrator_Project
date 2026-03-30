import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT_DIR = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT_DIR / "server_modules" / "operator_chat.py"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
spec = importlib.util.spec_from_file_location("operator_chat_direct_tools_under_test", MODULE_PATH)
operator_chat = importlib.util.module_from_spec(spec)
sys.modules["operator_chat_direct_tools_under_test"] = operator_chat
assert spec and spec.loader
spec.loader.exec_module(operator_chat)


class OperatorChatDirectToolTests(unittest.TestCase):
    @patch(
        "operator_chat_direct_tools_under_test.resolve_workspace_tool_capabilities",
        return_value=[
            {
                "id": "telegram_bot",
                "label": "Telegram Bot LIVE",
                "connected": True,
                "authenticated": True,
                "runtime_usable": True,
                "read_actions": ["chats.read"],
                "write_actions": ["send_message"],
                "approval_required_actions": [],
            }
        ],
    )
    @patch("operator_chat_direct_tools_under_test._preferred_provider", return_value=("codex_cli", {}))
    @patch("operator_chat_direct_tools_under_test._supports_direct_message_native_chat", return_value=True)
    @patch("operator_chat_direct_tools_under_test.generate_chat_reply_stream_with_provider_fallback")
    @patch("server_modules.runs_execution._workflow_execute_connector_action")
    def test_direct_chat_executes_tool_call_result(
        self,
        execute_tool_mock,
        stream_mock,
        _supports_direct_message_native_chat,
        _preferred_provider,
        _resolve_workspace_tool_capabilities,
    ):
        stream_mock.return_value = iter(
            [
                {
                    "type": "result",
                    "reply": "",
                    "usage_masked": {"provider": "codex_cli", "model": "gpt-5.4"},
                    "provider": "codex_cli",
                    "model": "gpt-5.4",
                    "attempted_providers": "codex_cli",
                    "error": "",
                    "tool_calls": [
                        {
                            "name": "telegram_bot__send_message",
                            "arguments": "{\"input\":\"hello from direct chat\"}",
                        }
                    ],
                }
            ]
        )
        execute_tool_mock.return_value = {
            "summary": "Connector action completed: telegram_bot.send_message.",
            "result_data": {
                "connector_action": {
                    "connector": "telegram_bot",
                    "action_id": "send_message",
                    "chat_id": "default",
                }
            },
        }

        payload = operator_chat.collect_direct_operator_reply(
            message="Send a Telegram message saying hello from direct chat.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "answer")
        self.assertEqual(payload["actions"], [])
        self.assertIn("telegram_bot.send_message", payload["reply"])
        execute_tool_mock.assert_called_once()

    @patch(
        "operator_chat_direct_tools_under_test.resolve_workspace_tool_capabilities",
        return_value=[
            {
                "id": "telegram_bot",
                "label": "Telegram Bot LIVE",
                "connected": True,
                "authenticated": True,
                "runtime_usable": True,
                "read_actions": ["chats.read"],
                "write_actions": ["send_message"],
                "approval_required_actions": ["send_message"],
            }
        ],
    )
    @patch("operator_chat_direct_tools_under_test._preferred_provider", return_value=("codex_cli", {}))
    @patch("operator_chat_direct_tools_under_test._supports_direct_message_native_chat", return_value=True)
    @patch("operator_chat_direct_tools_under_test.generate_chat_reply_stream_with_provider_fallback")
    def test_direct_chat_passes_tool_schemas_to_worker(
        self,
        stream_mock,
        _supports_direct_message_native_chat,
        _preferred_provider,
        _resolve_workspace_tool_capabilities,
    ):
        captured = {}

        def _fake_stream(**kwargs):
            captured["tools"] = kwargs["metadata"].get("tools")
            return iter(
                [
                    {
                        "type": "result",
                        "reply": "Handled without tools.",
                        "usage_masked": {},
                        "provider": "codex_cli",
                        "model": "gpt-5.4",
                        "attempted_providers": "codex_cli",
                        "error": "",
                    }
                ]
            )

        stream_mock.side_effect = _fake_stream

        payload = operator_chat.collect_direct_operator_reply(
            message="Send a Telegram message saying hi.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "Handled without tools.")
        self.assertIsInstance(captured.get("tools"), list)
        self.assertEqual(captured["tools"][0]["name"], "telegram_bot__send_message")

    @patch(
        "operator_chat_direct_tools_under_test.resolve_workspace_tool_capabilities",
        return_value=[
            {
                "id": "telegram_bot",
                "label": "Telegram Bot LIVE",
                "connected": True,
                "authenticated": True,
                "runtime_usable": True,
                "read_actions": ["chats.read"],
                "write_actions": ["send_message"],
                "approval_required_actions": ["send_message"],
            }
        ],
    )
    @patch("operator_chat_direct_tools_under_test._preferred_provider", return_value=("codex_cli", {}))
    @patch("operator_chat_direct_tools_under_test._supports_direct_message_native_chat", return_value=True)
    @patch("operator_chat_direct_tools_under_test.generate_chat_reply_stream_with_provider_fallback")
    @patch("server_modules.runs_execution._workflow_execute_connector_action")
    def test_direct_chat_requires_approval_before_executing_tool_call(
        self,
        execute_tool_mock,
        stream_mock,
        _supports_direct_message_native_chat,
        _preferred_provider,
        _resolve_workspace_tool_capabilities,
    ):
        stream_mock.return_value = iter(
            [
                {
                    "type": "result",
                    "reply": "",
                    "usage_masked": {"provider": "codex_cli", "model": "gpt-5.4"},
                    "provider": "codex_cli",
                    "model": "gpt-5.4",
                    "attempted_providers": "codex_cli",
                    "error": "",
                    "tool_calls": [
                        {
                            "name": "telegram_bot__send_message",
                            "arguments": "{\"input\":\"hello from direct chat\"}",
                        }
                    ],
                }
            ]
        )

        payload = operator_chat.collect_direct_operator_reply(
            message="Send a Telegram message saying hello from direct chat.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertEqual(payload["reply"], "This action requires your approval before I send it. Confirm?")
        self.assertEqual(payload["actions"][0]["type"], "approval_required")
        self.assertEqual(payload["actions"][0]["kind"], "approval_required")
        self.assertEqual(payload["actions"][0]["connector"], "telegram_bot")
        self.assertEqual(payload["actions"][0]["action"], "send_message")
        self.assertEqual(payload["actions"][0]["input"], "hello from direct chat")
        execute_tool_mock.assert_not_called()

    @patch(
        "operator_chat_direct_tools_under_test.resolve_workspace_tool_capabilities",
        return_value=[
            {
                "id": "telegram_bot",
                "label": "Telegram Bot LIVE",
                "connected": True,
                "authenticated": True,
                "runtime_usable": True,
                "read_actions": ["chats.read"],
                "write_actions": ["send_message"],
                "approval_required_actions": ["send_message"],
            }
        ],
    )
    @patch("server_modules.runs_execution._workflow_execute_connector_action")
    def test_direct_chat_executes_approved_action_confirmation(
        self,
        execute_tool_mock,
        _resolve_workspace_tool_capabilities,
    ):
        execute_tool_mock.return_value = {
            "summary": "Connector action completed: telegram_bot.send_message.",
            "result_data": {
                "connector_action": {
                    "connector": "telegram_bot",
                    "action_id": "send_message",
                    "chat_id": "default",
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
                "connector": "telegram_bot",
                "action": "send_message",
                "input": "hello from direct chat",
            },
        )

        self.assertEqual(payload["mode"], "answer")
        self.assertIn("telegram_bot.send_message", payload["reply"])
        execute_tool_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
