from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import sage_agent_runtime_service


class SageAgentRuntimeServiceTests(unittest.TestCase):
    def test_rejects_empty_message(self):
        with self.assertRaises(ValueError) as ctx:
            sage_agent_runtime_service.run_sage_chat_turn(
                workspace_id="ws-1",
                message="",
            )
        self.assertIn("message", str(ctx.exception).lower())

    def test_rejects_empty_workspace_id(self):
        with self.assertRaises(ValueError) as ctx:
            sage_agent_runtime_service.run_sage_chat_turn(
                workspace_id="",
                message="hello",
            )
        self.assertIn("workspace_id", str(ctx.exception).lower())

    def test_rejects_non_owner_sage_mode(self):
        with self.assertRaises(ValueError) as ctx:
            sage_agent_runtime_service.run_sage_chat_turn(
                workspace_id="ws-1",
                message="hello",
                mode="customer_live",
            )
        self.assertIn("mode", str(ctx.exception).lower())

    def test_builds_system_prompt_from_profile(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with (
                patch("server_modules.sage_agent_runtime_service.workspace_context.workspace_scope_dir", return_value=root),
                patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
                patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
                patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
                patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
            ):
                mock_profile.return_value = {
                    "profile": {
                        "user_name": "Mansur",
                        "identity_summary": "Lead developer",
                        "communication_style": "Be direct.",
                        "recurring_responsibility": "Inbox triage",
                        "standing_rules": ["Never send without approval."],
                    }
                }
                mock_files.return_value = {"SOUL.md": "You are Sage. Be helpful."}
                mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
                mock_generate.return_value = ("Reply text", {"model": "deepseek-chat"}, "deepseek", "")

                sage_agent_runtime_service.run_sage_chat_turn(
                    workspace_id="ws-1",
                    message="hello",
                )

                system_prompt = mock_generate.call_args[0][3]
                self.assertIn("Mansur", system_prompt)
                self.assertIn("Lead developer", system_prompt)
                self.assertIn("Be direct", system_prompt)
                self.assertIn("Inbox triage", system_prompt)
                self.assertIn("Never send without approval", system_prompt)

    def test_returns_structured_result(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
        ):
            mock_profile.return_value = {
                "profile": {
                    "user_name": "",
                    "identity_summary": "",
                    "communication_style": "",
                    "recurring_responsibility": "",
                    "standing_rules": [],
                }
            }
            mock_files.return_value = {}
            mock_provider.return_value = ("openai", {"api_key": "test-key"})
            mock_generate.return_value = ("Hello there", {"model": "gpt-4o"}, "openai", "")

            result = sage_agent_runtime_service.run_sage_chat_turn(
                workspace_id="ws-1",
                message="hi",
            )

            self.assertEqual(result["message"], "Hello there")
            self.assertIsInstance(result["used_context"], list)
            self.assertIsInstance(result["tool_calls"], list)
            self.assertIsInstance(result["memory_updates"], list)
            self.assertIsNotNone(result["trace_id"])
            self.assertEqual(result["provider"], "openai")
            self.assertEqual(result["model"], "gpt-4o")

    def test_raises_on_provider_error(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
        ):
            mock_profile.return_value = {
                "profile": {
                    "user_name": "",
                    "identity_summary": "",
                    "communication_style": "",
                    "recurring_responsibility": "",
                    "standing_rules": [],
                }
            }
            mock_files.return_value = {}
            mock_provider.return_value = ("openai", {"api_key": "test-key"})
            mock_generate.return_value = ("", {}, "", "All providers failed")

            with self.assertRaises(RuntimeError) as ctx:
                sage_agent_runtime_service.run_sage_chat_turn(
                    workspace_id="ws-1",
                    message="hi",
                )
            self.assertIn("All providers failed", str(ctx.exception))

    def test_system_prompt_falls_back_without_profile(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
        ):
            mock_profile.return_value = {
                "profile": {
                    "user_name": "",
                    "identity_summary": "",
                    "communication_style": "",
                    "recurring_responsibility": "",
                    "standing_rules": [],
                }
            }
            mock_files.return_value = {}
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Ok", {}, "deepseek", "")

            sage_agent_runtime_service.run_sage_chat_turn(
                workspace_id="ws-1",
                message="hello",
            )

            system_prompt = mock_generate.call_args[0][3]
            self.assertIn("Sage", system_prompt)
            self.assertIn("Empyralis", system_prompt)
            self.assertIn("personal assistant", system_prompt.lower())

    def test_uses_soul_md_when_present(self):
        with (
            patch("server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile") as mock_profile,
            patch("server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files") as mock_files,
            patch("server_modules.sage_agent_runtime_service._resolve_cloud_provider") as mock_provider,
            patch("server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback") as mock_generate,
        ):
            mock_profile.return_value = {
                "profile": {
                    "user_name": "",
                    "identity_summary": "",
                    "communication_style": "",
                    "recurring_responsibility": "",
                    "standing_rules": [],
                }
            }
            mock_files.return_value = {"SOUL.md": "Custom soul: Sage is a helpful AI."}
            mock_provider.return_value = ("deepseek", {"api_key": "test-key"})
            mock_generate.return_value = ("Ok", {}, "deepseek", "")

            sage_agent_runtime_service.run_sage_chat_turn(
                workspace_id="ws-1",
                message="hello",
            )

            system_prompt = mock_generate.call_args[0][3]
            self.assertIn("Custom soul: Sage is a helpful AI.", system_prompt)


if __name__ == "__main__":
    unittest.main()
