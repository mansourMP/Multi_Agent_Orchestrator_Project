import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import orion_local_worker_llm as worker_llm


class OrionLocalWorkerLlmTests(unittest.TestCase):
    def test_provider_order_prefers_direct_openai_before_codex_cli(self):
        with patch.dict(
            os.environ,
            {
                "ORION_AUTH_MODE": "codex",
                "ORION_LOCAL_WORKER_PREFER_DIRECT_OPENAI": "1",
                "ORION_LOCAL_WORKER_USE_CODEX_CLI": "1",
            },
            clear=False,
        ):
            with patch.object(
                worker_llm,
                "provider_has_key",
                side_effect=lambda provider: provider in {"openai", "codex_cli"},
            ):
                order = worker_llm.provider_order_for_run({}, {})
        self.assertGreaterEqual(len(order), 2)
        self.assertEqual(order[0], "openai")
        self.assertEqual(order[1], "codex_cli")

    def test_generate_chat_uses_chat_completions_for_codex_auth_mode(self):
        with patch.dict(os.environ, {"ORION_AUTH_MODE": "codex"}, clear=False):
            with patch.object(worker_llm, "provider_order_for_run", return_value=["openai", "codex_cli"]):
                with patch.object(
                    worker_llm,
                    "openai_responses_text",
                    side_effect=AssertionError("responses api should be skipped for codex auth"),
                ):
                    with patch.object(
                        worker_llm,
                        "openai_chat_json",
                        return_value=({"reply": "Short reply"}, {"total_tokens": 5}, "gpt-4.1", ""),
                    ) as openai_chat_json_mock:
                        with patch.object(worker_llm, "codex_exec_text") as codex_exec_text_mock:
                            text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                                context={},
                                metadata={},
                                user_goal="Write a short summary",
                                system_prompt="You are concise.",
                            )

        self.assertEqual(text, "Short reply")
        self.assertIsNotNone(usage)
        self.assertEqual(attempted, "openai")
        self.assertEqual(error, "")
        openai_chat_json_mock.assert_called_once()
        codex_exec_text_mock.assert_not_called()

    def test_generate_chat_uses_chat_completions_for_explicit_oauth_token_mode(self):
        with patch.dict(os.environ, {"ORION_AUTH_MODE": "api_key"}, clear=False):
            with patch.object(worker_llm, "provider_order_for_run", return_value=["openai"]):
                with patch.object(
                    worker_llm,
                    "openai_responses_text",
                    side_effect=AssertionError("responses api should be skipped for oauth_token auth mode"),
                ):
                    with patch.object(
                        worker_llm,
                        "openai_chat_json",
                        return_value=({"reply": "OAuth reply"}, {"total_tokens": 7}, "gpt-4.1", ""),
                    ) as openai_chat_json_mock:
                        text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                            context={"auth_mode": "oauth_token"},
                            metadata={},
                            user_goal="Answer briefly",
                            system_prompt="You are concise.",
                        )

        self.assertEqual(text, "OAuth reply")
        self.assertIsNotNone(usage)
        self.assertEqual(attempted, "openai")
        self.assertEqual(error, "")
        openai_chat_json_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
