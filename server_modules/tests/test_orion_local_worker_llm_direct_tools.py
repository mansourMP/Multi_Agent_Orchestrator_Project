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

    def test_generate_chat_stream_propagates_tool_calls_from_deepseek_branch_when_tools_present(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["deepseek"]):
            with patch.object(
                worker_llm,
                "iter_openai_compatible_chat_events",
                return_value=iter([
                    {
                        "type": "done",
                        "text": "",
                        "usage": None,
                        "model": "deepseek-chat",
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "name": "file__read",
                                "arguments": {"path": "~/Desktop"},
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
                                    "name": "file__read",
                                    "description": "Read a local file",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {"path": {"type": "string"}},
                                        "required": ["path"],
                                    },
                                }
                            ]
                        },
                        user_goal="List the files on my desktop.",
                        system_prompt="You are concise.",
                    )
                )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "result")
        self.assertEqual(events[0]["provider"], "deepseek")
        self.assertEqual(events[0]["tool_calls"][0]["name"], "file__read")
        events_mock.assert_called_once()

    def test_generate_chat_stream_retries_tool_mode_with_compact_prompt_after_transport_error(self):
        seen_prompts = []

        def _iter_events(prompt_variant, *_args, **_kwargs):
            seen_prompts.append(prompt_variant)
            if len(seen_prompts) == 1:
                return iter([
                    {
                        "type": "error",
                        "error": "IncompleteRead(0 bytes read)",
                        "model": "deepseek-chat",
                    }
                ])
            return iter([
                {
                    "type": "done",
                    "text": "",
                    "usage": None,
                    "model": "deepseek-chat",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "name": "file__read",
                            "arguments": {"path": "~/Desktop"},
                        }
                    ],
                }
            ])

        with patch.object(worker_llm, "provider_order_for_run", return_value=["deepseek"]):
            with patch.object(
                worker_llm,
                "iter_openai_compatible_chat_events",
                side_effect=_iter_events,
            ) as events_mock:
                events = list(
                    worker_llm.generate_chat_reply_stream_with_provider_fallback(
                        context={},
                        metadata={
                            "tools": [
                                {
                                    "name": "file__read",
                                    "description": "Read a local file",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {"path": {"type": "string"}},
                                        "required": ["path"],
                                    },
                                }
                            ]
                        },
                        user_goal="List the files on my desktop.",
                        system_prompt=(
                            "Base instructions\n\n"
                            "## Workspace Context\nVery large workspace context here.\n\n"
                            "## Runtime Identity\nprovider deepseek, model deepseek-chat."
                        ),
                    )
                )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "result")
        self.assertEqual(events[0]["tool_calls"][0]["name"], "file__read")
        self.assertEqual(events_mock.call_count, 2)
        self.assertIn("## Workspace Context", str(seen_prompts[0]))
        self.assertNotIn("## Workspace Context", str(seen_prompts[1]))
        self.assertIn("## Runtime Identity", str(seen_prompts[1]))

    def test_build_openai_compatible_messages_preserves_tool_turns(self):
        messages = worker_llm._build_openai_compatible_messages(
            "",
            prior_messages=[
                {"role": "user", "content": "List the files on my desktop."},
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "name": "file__read",
                            "arguments": {"path": "~/Desktop"},
                        }
                    ],
                },
                {
                    "role": "tool",
                    "tool_call_id": "call_1",
                    "name": "file__read",
                    "content": "Desktop contents here",
                },
            ],
        )

        self.assertEqual(messages[1]["role"], "assistant")
        self.assertEqual(messages[1]["tool_calls"][0]["function"]["name"], "file__read")
        self.assertEqual(messages[2]["role"], "tool")
        self.assertEqual(messages[2]["tool_call_id"], "call_1")


if __name__ == "__main__":
    unittest.main()
