from __future__ import annotations

import unittest
from unittest.mock import patch

from pydantic import ValidationError

from server_modules.schemas import SageChatRequest


class SageChatApiContractTests(unittest.TestCase):
    def test_request_model_defaults(self):
        req = SageChatRequest(workspace_id="ws-1", message="hello")
        self.assertEqual(req.workspace_id, "ws-1")
        self.assertEqual(req.message, "hello")
        self.assertEqual(req.surface, "chat")
        self.assertEqual(req.mode, "owner_sage")

    def test_request_model_rejects_missing_workspace_id(self):
        with self.assertRaises(ValidationError):
            SageChatRequest(message="hello")

    def test_request_model_rejects_missing_message(self):
        with self.assertRaises(ValidationError):
            SageChatRequest(workspace_id="ws-1")

    def test_request_model_accepts_explicit_mode(self):
        req = SageChatRequest(workspace_id="ws-1", message="hello", mode="owner_sage")
        self.assertEqual(req.mode, "owner_sage")

    def test_request_model_accepts_explicit_surface(self):
        req = SageChatRequest(workspace_id="ws-1", message="hello", surface="mobile")
        self.assertEqual(req.surface, "mobile")

    def test_mode_gate_rejects_non_owner_sage(self):
        from server_modules.sage_agent_runtime_service import ALLOWED_MODES

        self.assertNotIn("customer_live", ALLOWED_MODES)
        self.assertNotIn("studio_agent", ALLOWED_MODES)
        self.assertNotIn("deployed", ALLOWED_MODES)
        self.assertIn("owner_sage", ALLOWED_MODES)

    def test_response_contract_keys(self):
        from server_modules.sage_agent_runtime_service import run_sage_chat_turn

        with (
            patch(
                "server_modules.sage_agent_runtime_service.sage_profile_service.list_sage_profile"
            ) as mock_profile,
            patch(
                "server_modules.sage_agent_runtime_service.workspace_context.read_workspace_context_files"
            ) as mock_files,
            patch(
                "server_modules.sage_agent_runtime_service._resolve_cloud_provider"
            ) as mock_provider,
            patch(
                "server_modules.sage_agent_runtime_service.generate_chat_reply_with_provider_fallback"
            ) as mock_generate,
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
            mock_provider.return_value = ("openai", {"api_key": "test"})
            mock_generate.return_value = ("Reply", {"model": "gpt-4o"}, "openai", "")

            result = run_sage_chat_turn(workspace_id="ws-1", message="hello")

        required_keys = {"message", "used_context", "tool_calls", "memory_updates", "trace_id"}
        self.assertTrue(required_keys.issubset(set(result.keys())))


if __name__ == "__main__":
    unittest.main()
