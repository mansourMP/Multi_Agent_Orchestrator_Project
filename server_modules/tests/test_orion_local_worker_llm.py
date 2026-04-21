import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules.agent_turn import build_inbound_agent_turn_request

ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import orion_local_worker_llm as worker_llm


class OrionLocalWorkerLlmTests(unittest.TestCase):
    def test_resolve_requested_provider_preserves_explicit_anthropic_in_local_cli_mode(self):
        with patch.dict(os.environ, {"ORION_AUTH_MODE": "local_cli"}, clear=False):
            with patch.object(worker_llm, "get_claude_code_session_token", return_value="session-token"):
                provider = worker_llm.resolve_requested_provider({"provider": "anthropic"}, {})

        self.assertEqual(provider, "anthropic")

    def test_generate_chat_for_turn_request_binds_agent_turn_metadata(self):
        turn_request = build_inbound_agent_turn_request(
            workspace_id="workspace-1",
            session_id="thread-1",
            channel="local_worker",
            actor_type="worker",
            actor_id="worker-1",
            message="Summarize this",
            response_mode="artifact",
        )

        with patch.object(
            worker_llm,
            "generate_chat_reply_with_provider_fallback",
            return_value=("ok", {"provider": "openai"}, "openai", ""),
        ) as generate_mock:
            text, usage, attempted, error = worker_llm.generate_chat_reply_for_turn_request(
                turn_request=turn_request,
                context={"workspace_id": "workspace-1"},
                metadata={},
                system_prompt="You are concise.",
            )

        self.assertEqual(text, "ok")
        self.assertEqual(usage["provider"], "openai")
        self.assertEqual(attempted, "openai")
        self.assertEqual(error, "")
        passed_metadata = generate_mock.call_args.kwargs["metadata"]
        self.assertEqual(passed_metadata["agent_turn_request"]["workspace_id"], "workspace-1")
        self.assertEqual(passed_metadata["agent_turn_request"]["channel"], "local_worker")

    def test_codex_account_id_from_token_extracts_chatgpt_account(self):
        token = (
            "header."
            "eyJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiYWNjXzEyMyJ9fQ."
            "sig"
        )

        account_id = worker_llm.codex_account_id_from_token(token)

        self.assertEqual(account_id, "acc_123")

    def test_build_responses_input_uses_output_text_for_assistant_history(self):
        items = worker_llm._build_responses_input(
            "whats up ?",
            prior_messages=[
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "Hello! How can I help?"},
            ],
        )

        self.assertEqual(items[0]["role"], "user")
        self.assertEqual(items[0]["content"][0]["type"], "input_text")
        self.assertEqual(items[1]["role"], "assistant")
        self.assertEqual(items[1]["content"][0]["type"], "output_text")
        self.assertEqual(items[2]["role"], "user")
        self.assertEqual(items[2]["content"][0]["type"], "input_text")

    def test_codex_instructions_returns_empty_string_when_prompt_is_empty(self):
        self.assertEqual(worker_llm.codex_instructions(None), "")
        self.assertEqual(worker_llm.codex_instructions(""), "")
        self.assertEqual(worker_llm.codex_instructions("You are concise."), "You are concise.")

    def test_provider_order_prefers_codex_cli_before_openai_in_codex_mode(self):
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
        self.assertEqual(order[0], "codex_cli")
        self.assertEqual(order[1], "openai")

    def test_generate_chat_uses_plain_chat_transport_for_codex_auth_mode(self):
        with patch.dict(os.environ, {"ORION_AUTH_MODE": "codex"}, clear=False):
            with patch.object(worker_llm, "provider_order_for_run", return_value=["openai", "codex_cli"]):
                with patch.object(
                    worker_llm,
                    "openai_responses_text",
                    side_effect=AssertionError("responses api should be skipped for codex auth"),
                ):
                    with patch.object(
                        worker_llm,
                        "openai_chat_text",
                        return_value=("Short reply", {"total_tokens": 5}, "gpt-4.1", ""),
                    ) as openai_chat_text_mock:
                        with patch.object(
                            worker_llm,
                            "openai_chat_json",
                            side_effect=AssertionError("json helper should not be used for direct chat"),
                        ):
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
        openai_chat_text_mock.assert_called_once()

    def test_generate_chat_rejects_explicit_oauth_token_mode_for_openai_direct(self):
        with patch.dict(os.environ, {"ORION_AUTH_MODE": "api_key"}, clear=False):
            with patch.object(worker_llm, "provider_order_for_run", return_value=["openai"]):
                with patch.object(
                    worker_llm,
                    "openai_responses_text",
                    side_effect=AssertionError("responses api should not be used for rejected oauth_token auth mode"),
                ):
                    with patch.object(
                        worker_llm,
                        "openai_chat_text",
                        side_effect=AssertionError("chat api should not be used for rejected oauth_token auth mode"),
                    ) as openai_chat_text_mock:
                        with patch.object(
                            worker_llm,
                            "openai_chat_json",
                            side_effect=AssertionError("json helper should not be used for direct chat"),
                        ):
                            text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                                context={"auth_mode": "oauth_token"},
                                metadata={},
                                user_goal="Answer briefly",
                                system_prompt="You are concise.",
                            )

        self.assertEqual(text, "")
        self.assertIsNone(usage)
        self.assertEqual(attempted, "openai")
        self.assertIn(worker_llm.OPENAI_CODEX_DIRECT_AUTH_ERROR, error)
        openai_chat_text_mock.assert_not_called()

    def test_codex_exec_prefers_direct_backend_before_cli(self):
        with patch.object(
            worker_llm,
            "openai_codex_backend_text",
            return_value=("Direct Codex answer", {"total_tokens": 12}, "gpt-5.4", ""),
        ) as direct_mock:
            with patch.object(worker_llm, "codex_cli_available", return_value=True):
                text, usage, model, error = worker_llm.codex_exec_text(
                    "You are concise.",
                    "Give me the top 3 priorities for shipping this platform in 2 days.",
                )

        self.assertEqual(text, "Direct Codex answer")
        self.assertEqual(model, "gpt-5.4")
        self.assertEqual(error, "")
        self.assertEqual(usage, {"total_tokens": 12})
        direct_mock.assert_called_once()

    def test_generate_chat_passes_requested_model_to_selected_provider(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["codex_cli"]):
            with patch.object(
                worker_llm,
                "openai_codex_backend_text",
                return_value=("Direct answer", None, "gpt-5.3-codex", ""),
            ) as codex_backend_mock:
                text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                    context={"model": "gpt-5.3-codex"},
                    metadata={"provider": "codex_cli", "disable_provider_fallback": True},
                    user_goal="hello",
                    system_prompt="You are concise.",
                )

        self.assertEqual(text, "Direct answer")
        self.assertEqual(attempted, "codex_cli")
        self.assertEqual(error, "")
        codex_backend_mock.assert_called_once_with(
            "You are concise.",
            "hello",
            model_override="gpt-5.3-codex",
            reasoning_effort_override=None,
            prior_messages=None,
            credential_override=None,
        )

    def test_resolve_requested_model_defaults_anthropic_to_current_default(self):
        with patch.object(worker_llm, "anthropic_default_model", return_value="claude-3-7-sonnet-20250219"):
            model = worker_llm.resolve_requested_model({"provider": "anthropic"}, {})

        self.assertEqual(model, "claude-3-7-sonnet-20250219")

    def test_generate_chat_remaps_retired_anthropic_model(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["anthropic"]):
            with patch.object(
                worker_llm,
                "anthropic_chat_text",
                return_value=("Anthropic reply", {"input_tokens": 5, "output_tokens": 7}, "claude-3-7-sonnet-20250219", ""),
            ) as anthropic_mock:
                text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                    context={"provider": "anthropic", "model": "claude-3-5-sonnet-20241022"},
                    metadata={"provider": "anthropic", "disable_provider_fallback": True},
                    user_goal="hello",
                    system_prompt="You are concise.",
                )

        self.assertEqual(text, "Anthropic reply")
        self.assertEqual(attempted, "anthropic")
        self.assertEqual(error, "")
        self.assertIsNotNone(usage)
        anthropic_mock.assert_called_once_with(
            "You are concise.",
            "hello",
            model_override="claude-3-7-sonnet-20250219",
            prior_messages=None,
            credential_override=None,
        )

    def test_generate_chat_coerces_unsupported_openai_model_for_codex_cli(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["codex_cli"]):
            with patch.object(
                worker_llm,
                "openai_codex_backend_text",
                return_value=("Direct answer", None, "gpt-5.4", ""),
            ) as codex_backend_mock:
                text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                    context={"provider": "openai", "model": "gpt-4o-mini"},
                    metadata={},
                    user_goal="hello",
                    system_prompt="You are concise.",
                )

        self.assertEqual(text, "Direct answer")
        self.assertIsNotNone(usage)
        self.assertEqual(attempted, "codex_cli")
        self.assertEqual(error, "")
        codex_backend_mock.assert_called_once_with(
            "You are concise.",
            "hello",
            model_override="gpt-5.4",
            reasoning_effort_override=None,
            prior_messages=None,
            credential_override=None,
        )

    def test_generate_chat_fails_closed_when_codex_cli_has_only_prompt_transport(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["codex_cli"]):
            with patch.object(
                worker_llm,
                "openai_codex_backend_text",
                return_value=("", None, "gpt-5.4", "backend_unavailable"),
            ):
                with patch.object(
                    worker_llm,
                    "codex_exec_text",
                    side_effect=AssertionError("cli prompt transport should not be used for direct chat"),
                ):
                    text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                        context={},
                        metadata={},
                        user_goal="hello",
                        system_prompt="You are concise.",
                    )

        self.assertEqual(text, "")
        self.assertIsNone(usage)
        self.assertEqual(attempted, "codex_cli")
        self.assertIn(worker_llm.DIRECT_CHAT_TRANSPORT_UNAVAILABLE, error)

    def test_generate_chat_routes_claude_code_cli_through_anthropic_transport(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["claude_code_cli"]):
            with patch.object(
                worker_llm,
                "claude_code_exec_text",
                side_effect=AssertionError("claude cli prompt transport should not be used for direct chat"),
            ):
                with patch.object(
                    worker_llm,
                    "anthropic_chat_text",
                    return_value=("Claude reply", {"input_tokens": 5}, "claude-3-5-sonnet-20241022", ""),
                ) as anthropic_chat_text_mock:
                    text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                        context={},
                        metadata={},
                        user_goal="hello",
                        system_prompt="You are concise.",
                    )

        self.assertEqual(text, "Claude reply")
        self.assertIsNotNone(usage)
        self.assertEqual(attempted, "claude_code_cli")
        self.assertEqual(error, "")
        anthropic_chat_text_mock.assert_called_once()

    def test_generate_pack_keeps_json_transport(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["openai"]):
            with patch.object(
                worker_llm,
                "openai_chat_json",
                return_value=({"summary": "Done", "content_plan": [], "next_steps": []}, {"total_tokens": 5}, "gpt-4.1", ""),
            ) as openai_chat_json_mock:
                result, usage, attempted, error = worker_llm.generate_pack_with_provider_fallback(
                    context={},
                    metadata={},
                    system_prompt="Structured output only.",
                    user_prompt="Build a plan.",
                )

        self.assertEqual(result["summary"], "Done")
        self.assertIsNotNone(usage)
        self.assertEqual(attempted, "openai")
        self.assertEqual(error, "")
        openai_chat_json_mock.assert_called_once()

    def test_disable_provider_fallback_locks_requested_provider(self):
        with patch.object(
            worker_llm,
            "provider_has_key",
            side_effect=lambda provider: provider in {"openai", "codex_cli"},
        ):
            order = worker_llm.provider_order_for_run(
                {"provider": "openai"},
                {"disable_provider_fallback": True},
            )

        self.assertEqual(order, ["openai"])

    def test_generate_chat_logs_when_requested_provider_is_overridden(self):
        with patch.object(worker_llm, "provider_order_for_run", return_value=["codex_cli"]):
            with patch.object(
                worker_llm,
                "openai_codex_backend_text",
                return_value=("Direct answer", None, "gpt-5.4", ""),
            ):
                with patch.object(worker_llm.LOGGER, "warning") as logger_warning:
                    text, usage, attempted, error = worker_llm.generate_chat_reply_with_provider_fallback(
                        context={"provider": "anthropic"},
                        metadata={},
                        user_goal="hello",
                        system_prompt="You are concise.",
                    )

        self.assertEqual(text, "Direct answer")
        self.assertIsNotNone(usage)
        self.assertEqual(attempted, "codex_cli")
        self.assertEqual(error, "")
        logger_warning.assert_called_once()

    def test_openai_path_does_not_use_codex_auth_vault_token(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            auth_file = Path(tmpdir) / "auth.json"
            auth_file.write_text('{"tokens":{"access_token":"codex-vault-token"}}', encoding="utf-8")
            with patch.dict(
                os.environ,
                {
                    "CODEX_AUTH_FILE": str(auth_file),
                    "ORION_LOCAL_WORKER_OPENAI_API_KEY": "",
                    "OPENAI_API_KEY": "",
                    "ORION_LOCAL_WORKER_OPENAI_TOKEN": "",
                    "CODEX_OAUTH_TOKEN": "",
                    "OPENAI_OAUTH_TOKEN": "",
                    "OPENAI_ACCESS_TOKEN": "",
                },
                clear=False,
            ):
                self.assertEqual(worker_llm.get_openai_api_key(), "")
                self.assertEqual(worker_llm.get_openai_bearer_token(), "")
                self.assertEqual(worker_llm.get_codex_oauth_token(), "codex-vault-token")
                self.assertFalse(worker_llm.provider_has_key("openai"))

    def test_openai_responses_text_requires_real_api_key(self):
        with patch.dict(
            os.environ,
            {
                "ORION_LOCAL_WORKER_OPENAI_API_KEY": "",
                "OPENAI_API_KEY": "",
                "ORION_LOCAL_WORKER_OPENAI_TOKEN": "",
                "CODEX_OAUTH_TOKEN": "codex-oauth-token",
                "OPENAI_OAUTH_TOKEN": "",
                "OPENAI_ACCESS_TOKEN": "",
            },
            clear=False,
        ):
            text, usage, model, error = worker_llm.openai_responses_text(
                "You are concise.",
                "Say hello.",
            )

        self.assertEqual(text, "")
        self.assertIsNone(usage)
        self.assertEqual(model, "")
        self.assertEqual(error, worker_llm.OPENAI_API_KEY_MISSING_ERROR)


if __name__ == "__main__":
    unittest.main()
