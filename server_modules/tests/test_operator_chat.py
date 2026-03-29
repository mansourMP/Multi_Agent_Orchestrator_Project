import unittest
import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

ROOT_DIR = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT_DIR / "server_modules" / "operator_chat.py"
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
spec = importlib.util.spec_from_file_location("operator_chat_under_test", MODULE_PATH)
operator_chat = importlib.util.module_from_spec(spec)
sys.modules["operator_chat_under_test"] = operator_chat
assert spec and spec.loader
spec.loader.exec_module(operator_chat)

build_direct_operator_reply = operator_chat.build_direct_operator_reply


class OperatorChatTests(unittest.TestCase):
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_missing_google_workspace_returns_connect_action(self, _capabilities):
        payload = build_direct_operator_reply(
            message="Could you summarize my emails?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertIn("Google Workspace is not connected", payload["reply"])
        self.assertEqual(payload["actions"][0]["kind"], "connect")
        self.assertEqual(payload["actions"][0]["label"], "Connect")

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback")
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "google_workspace",
            "label": "Google Workspace",
            "connected": True,
            "authenticated": True,
            "runtime_usable": True,
            "read_actions": ["gmail_threads.read"],
            "write_actions": ["draft_email"],
            "approval_required_actions": ["draft_email"],
        }],
    )
    def test_connected_google_workspace_returns_generic_run_preview(self, _capabilities, _provider_has_key, generate_reply):
        payload = build_direct_operator_reply(
            message="Summarize my Gmail inbox.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertEqual(payload["reply"], "I can run that here.")
        self.assertTrue(any(action["kind"] == "run" for action in payload["actions"]))
        generate_reply.assert_not_called()

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("Hello again.", {"provider": "openai", "model": "gpt-5.4"}, "openai", ""),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_context_used_marks_prior_messages_when_history_is_passed(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="Reply with context.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            prior_messages=[
                {"role": "user", "content": "First question"},
                {"role": "assistant", "content": "First answer"},
            ],
            availability={"ai_ready": True},
        )

        self.assertTrue(payload["context_used"]["prior_messages_used"])
        self.assertEqual(payload["context_used"]["history_mode"], "raw_messages")

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("Hello.", {"provider": "openai", "model": "gpt-5.4"}, "openai", ""),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_context_used_uses_none_history_mode_without_prior_messages(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertFalse(payload["context_used"]["prior_messages_used"])
        self.assertEqual(payload["context_used"]["history_mode"], "none")

    @patch.dict("operator_chat_under_test.os.environ", {"ORION_AUTH_MODE": "codex"}, clear=False)
    @patch("operator_chat_under_test.provider_has_key", return_value=False)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_codex_chat_unavailable_fails_closed(self, _capabilities, _provider_has_key):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "connect")
        self.assertIn("AI account", payload["reply"])
        self.assertTrue(payload["context_used"]["provider_overridden"])
        self.assertFalse(payload["context_used"]["fallback_used"])
        self.assertEqual(payload["context_used"]["fallback_reason"], "codex_mode_forced_provider")

    @patch("operator_chat_under_test.provider_has_key", side_effect=lambda provider: provider == "gemini")
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_selected_provider_unavailable_does_not_fallback(self, _capabilities, _provider_has_key):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "connect")
        self.assertIn("OpenAI is selected for chat", payload["reply"])

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback")
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_explicit_workflow_request_returns_workflow_action(self, _capabilities, _provider_has_key, generate_reply):
        payload = build_direct_operator_reply(
            message="Turn this into a workflow for me.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertTrue(any(action["kind"] == "workflow" for action in payload["actions"]))
        self.assertEqual(payload["reply"], "I can help turn that into a workflow.")
        generate_reply.assert_not_called()

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("Workflows help structure repeated tasks.", {"provider": "openai", "model": "gpt-5.4"}, "openai", ""),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_casual_workflow_question_does_not_emit_workflow_action(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="What are workflows in this product?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "answer")
        self.assertEqual(payload["actions"], [])

    @patch.dict("operator_chat_under_test.os.environ", {"ORION_AUTH_MODE": "codex"}, clear=False)
    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("Hello.", {"provider": "codex_cli", "model": "gpt-5.4"}, "codex_cli", ""),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_context_used_exposes_requested_vs_effective_provider(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["context_used"]["requested_provider"], "openai")
        self.assertEqual(payload["context_used"]["effective_provider"], "codex_cli")
        self.assertTrue(payload["context_used"]["provider_overridden"])
        self.assertFalse(payload["context_used"]["fallback_used"])

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback", return_value=("placeholder", {"provider": "codex_cli", "model": "gpt-5.4"}, "codex_cli", ""))
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_model_identity_question_uses_actual_usage(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="What model are you using right now?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "Codex/OpenAI, gpt-5.4.")

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback")
    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "google_workspace",
            "label": "Google Workspace",
            "connected": True,
            "authenticated": None,
            "runtime_usable": None,
            "read_actions": [],
            "write_actions": [],
            "approval_required_actions": [],
        }],
    )
    def test_capability_question_is_answered_from_workspace_state(self, _capabilities, generate_reply):
        payload = build_direct_operator_reply(
            message="What can you do in this environment?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertIn("Connected here right now: Google Workspace.", payload["reply"])
        self.assertIn("Not verified: Google Workspace.", payload["reply"])
        self.assertEqual(payload["mode"], "answer")
        generate_reply.assert_not_called()

    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "google_workspace",
            "label": "Google Workspace",
            "connected": True,
            "authenticated": None,
            "runtime_usable": None,
            "read_actions": [],
            "write_actions": [],
            "approval_required_actions": [],
        }],
    )
    def test_connected_but_unverified_google_workspace_does_not_claim_usability(self, _capabilities):
        payload = build_direct_operator_reply(
            message="Check my Gmail inbox.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertIn("not verified", payload["reply"].lower())
        self.assertEqual(payload["mode"], "connect")
        self.assertEqual(payload["actions"], [])

    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "google_workspace",
            "label": "Google Workspace",
            "connected": True,
            "authenticated": True,
            "runtime_usable": False,
            "read_actions": [],
            "write_actions": [],
            "approval_required_actions": [],
        }],
    )
    def test_connected_but_not_usable_google_workspace_blocks_execution_claims(self, _capabilities):
        payload = build_direct_operator_reply(
            message="Check my Gmail inbox.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertIn("not usable", payload["reply"].lower())
        self.assertEqual(payload["mode"], "connect")
        self.assertEqual(payload["actions"], [])

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        side_effect=[
            ("", {}, "codex_cli", "temporary backend error"),
            ("Hello.", {"provider": "codex_cli", "model": "gpt-5.4"}, "codex_cli", ""),
        ],
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_direct_chat_retries_same_provider_once(self, _capabilities, _provider_has_key, generate_reply):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "Hello.")
        self.assertEqual(generate_reply.call_count, 2)

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("", {}, "codex_cli", "temporary backend error"),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_simple_greeting_uses_polished_fallback(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "Hi. How can I help?")


if __name__ == "__main__":
    unittest.main()
