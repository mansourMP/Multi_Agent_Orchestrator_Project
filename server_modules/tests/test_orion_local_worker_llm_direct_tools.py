import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import orion_local_worker_llm as worker_llm


class OrionLocalWorkerLlmDirectToolTests(unittest.TestCase):
    def test_resolve_requested_tools_prefers_metadata(self):
        tools = worker_llm.resolve_requested_tools(
            {"tools": [{"name": "context_only", "parameters": {"type": "object"}}]},
            {
                "tools": [
                    {
                        "name": "telegram_bot__send_message",
                        "description": "Execute send_message on Telegram Bot LIVE",
                        "parameters": {
                            "type": "object",
                            "properties": {"input": {"type": "string"}},
                            "required": ["input"],
                        },
                    }
                ]
            },
        )

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]["name"], "telegram_bot__send_message")

    def test_generate_chat_stream_propagates_tool_calls_from_codex_backend(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["codex_cli"]):
            with patch.object(
                worker_llm,
                "iter_openai_codex_backend_events",
                return_value=iter([
                    {
                        "type": "done",
                        "text": "",
                        "usage": None,
                        "model": "gpt-5.4",
                        "tool_calls": [
                            {
                                "name": "telegram_bot__send_message",
                                "arguments": "{\"input\":\"hello world\"}",
                            }
                        ],
                    }
                ]),
            ) as events_mock:
                events = list(
                    worker_llm.generate_chat_reply_stream_with_provider_fallback(
                        context={},
                        metadata={
                            "tools": [
                                {
                                    "name": "telegram_bot__send_message",
                                    "description": "Execute send_message on Telegram Bot LIVE",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {"input": {"type": "string"}},
                                        "required": ["input"],
                                    },
                                }
                            ]
                        },
                        user_goal="send a telegram message",
                        system_prompt="You are concise.",
                    )
                )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "result")
        self.assertEqual(events[0]["tool_calls"][0]["name"], "telegram_bot__send_message")
        events_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
