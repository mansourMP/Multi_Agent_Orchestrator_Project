import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from server_modules.connectors import discord_connector


ROOT_DIR = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT_DIR / "server_modules" / "direct_chat_runtime_exports.py"
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
        executed = []

        def fake_append_event(**kwargs):
            appended.append(kwargs)
            return kwargs

        def fake_execute_agent_turn_request(*, turn_request):
            executed.append(turn_request)
            return {"run_id": "run-discord-1"}

        result = discord_connector.dispatch_inbound_event(
            parsed,
            connector_entry={"id": "cred-discord", "workspace_id": "default", "metadata": {}},
            credentials={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"},
            append_event_fn=fake_append_event,
            execute_agent_turn_request=fake_execute_agent_turn_request,
        )

        self.assertTrue(result["triggered"])
        self.assertEqual(result["run_id"], "run-discord-1")
        self.assertEqual(executed[0].message, "please investigate this")
        self.assertEqual(appended[0]["channel"], "discord")
        self.assertEqual(appended[0]["direction"], "inbound")

    def test_inbound_message_prefers_canonical_run_start_request_when_available(self):
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

        captured = {}
        def fake_start_run(request):
            captured["request"] = request
            return {"run_id": "run-discord-2", "status": "starting"}

        result = discord_connector.dispatch_inbound_event(
            parsed,
            connector_entry={"id": "cred-discord", "workspace_id": "default", "metadata": {}},
            credentials={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"},
            append_event_fn=None,
            run_start_request_class=lambda **kwargs: SimpleNamespace(**kwargs),
            start_run_request=fake_start_run,
        )

        self.assertTrue(result["triggered"])
        self.assertEqual(result["run_id"], "run-discord-2")
        self.assertEqual(captured["request"].workspace_id, "default")
        self.assertEqual(captured["request"].user_goal, "please investigate this")
        self.assertEqual(captured["request"].metadata["channel"], "discord")
        self.assertEqual(captured["request"].metadata["agent_turn_request"]["channel"], "discord")
        self.assertEqual(captured["request"].metadata["agent_turn_request"]["message"], "please investigate this")

    def test_inbound_message_requires_canonical_ingress_callbacks(self):
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

        with self.assertRaises(RuntimeError):
            discord_connector.dispatch_inbound_event(
                parsed,
                connector_entry={"id": "cred-discord", "workspace_id": "default", "metadata": {}},
                credentials={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"},
                append_event_fn=None,
            )

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
