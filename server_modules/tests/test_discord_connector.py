import importlib.util
import json
import sys
import unittest
from pathlib import Path

from server_modules.connectors import discord_connector


ROOT_DIR = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT_DIR / "server_modules" / "operator_chat.py"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
spec = importlib.util.spec_from_file_location("operator_chat_discord_under_test", MODULE_PATH)
operator_chat = importlib.util.module_from_spec(spec)
sys.modules["operator_chat_discord_under_test"] = operator_chat
assert spec and spec.loader
spec.loader.exec_module(operator_chat)


class DiscordConnectorTests(unittest.TestCase):
    def test_send_message_requires_approval(self):
        payload = operator_chat._build_direct_tool_approval_response(
            tool_calls=[
                {
                    "name": "discord_bot__send_message",
                    "arguments": json.dumps({"input": "{\"channel_id\":\"123\",\"message\":\"hello from discord\"}"}),
                }
            ],
            tool_capabilities=[
                {
                    "id": "discord_bot",
                    "label": "Discord Bot",
                    "connected": True,
                    "authenticated": True,
                    "runtime_usable": True,
                    "read_actions": ["guilds.read", "guild_channels.read"],
                    "write_actions": [
                        "send_message",
                        "send_dm",
                        "edit_message",
                        "delete_message",
                        "list_guilds",
                        "list_channels",
                        "list_members",
                        "get_message_history",
                        "create_thread",
                        "add_reaction",
                    ],
                    "approval_required_actions": ["send_message", "send_dm", "delete_message"],
                }
            ],
        )

        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertEqual(payload["actions"][0]["connector"], "discord_bot")
        self.assertEqual(payload["actions"][0]["action"], "send_message")

    def test_inbound_message_triggers_handler(self):
        parsed = discord_connector.parse_inbound_event(
            {
                "t": "MESSAGE_CREATE",
                "d": {
                    "id": "msg-1",
                    "channel_id": "123",
                    "guild_id": "456",
                    "content": "<@999> please investigate this",
                    "author": {"id": "321", "username": "alice"},
                    "mentions": [{"id": "999"}],
                },
            }
        )

        appended = []
        created = []

        def fake_append_event(**kwargs):
            appended.append(kwargs)
            return kwargs

        def fake_create_run(*, context):
            created.append(context)
            return "run-discord-1"

        result = discord_connector.dispatch_inbound_event(
            parsed,
            connector_entry={"id": "cred-discord", "workspace_id": "default", "metadata": {}},
            credentials={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"},
            append_event_fn=fake_append_event,
            create_run_fn=fake_create_run,
        )

        self.assertTrue(result["triggered"])
        self.assertEqual(result["run_id"], "run-discord-1")
        self.assertEqual(created[0]["user_goal"], "please investigate this")
        self.assertEqual(appended[0]["channel"], "discord")
        self.assertEqual(appended[0]["direction"], "inbound")

    def test_guild_list_parsed(self):
        calls = []

        def fake_request(url, **kwargs):
            calls.append((url, kwargs))
            return {
                "status": 200,
                "json": [
                    {
                        "id": "1",
                        "name": "Acme Guild",
                        "owner": True,
                    }
                ],
            }

        result = discord_connector.list_guilds(
            {"bot_token": "discord-token"},
            limit=20,
            http_json_request=fake_request,
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "Acme Guild")
        self.assertIn("/users/@me/guilds?limit=20", calls[0][0])


if __name__ == "__main__":
    unittest.main()
