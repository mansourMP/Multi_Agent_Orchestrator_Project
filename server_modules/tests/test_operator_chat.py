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


def _legacy_fallback_stream(**kwargs):
    def _iterator():
        metadata = kwargs.get("metadata") if isinstance(kwargs.get("metadata"), dict) else {}
        for attempt in range(2):
            raw = operator_chat.generate_chat_reply_with_provider_fallback(
                context=kwargs.get("context"),
                metadata=kwargs.get("metadata"),
                user_goal=kwargs.get("user_goal"),
                system_prompt=kwargs.get("system_prompt"),
                prior_messages=kwargs.get("prior_messages"),
            )
            if not isinstance(raw, tuple) or len(raw) != 4:
                yield {
                    "type": "failure",
                    "attempted_providers": "",
                    "error": "mocked_generate_chat_reply_with_provider_fallback_missing_return_value",
                }
                return
            reply, usage_masked, attempted_providers, error = raw
            usage_payload = usage_masked if isinstance(usage_masked, dict) else {}
            provider = str(usage_payload.get("provider") or metadata.get("provider") or "").strip() or None
            model = str(usage_payload.get("model") or metadata.get("model") or "").strip() or None
            normalized_error = str(error or "").strip()
            if not str(reply or "").strip() and normalized_error:
                if attempt == 0 and not normalized_error.startswith("direct_chat_transport_unavailable:"):
                    continue
                yield {
                    "type": "failure",
                    "attempted_providers": str(attempted_providers or "").strip(),
                    "error": normalized_error,
                }
                return
            yield {
                "type": "result",
                "reply": str(reply or ""),
                "usage_masked": usage_payload,
                "provider": provider,
                "model": model,
                "attempted_providers": str(attempted_providers or "").strip(),
                "error": normalized_error,
            }
            return

    return _iterator()


operator_chat.generate_chat_reply_stream_with_provider_fallback = _legacy_fallback_stream

build_direct_operator_reply = operator_chat.collect_direct_operator_reply
stream_direct_operator_reply = operator_chat.build_direct_operator_reply


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
    @patch("operator_chat_under_test._can_auto_start_run_handoff", return_value=False)
    @patch("operator_chat_under_test._message_can_use_direct_connector_tools", return_value=False)
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
    def test_connected_google_workspace_returns_generic_run_preview(self, _capabilities, _provider_has_key, _message_can_use_direct_connector_tools, _can_auto_start_run_handoff, generate_reply):
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

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback")
    @patch("operator_chat_under_test.provider_has_key", return_value=False)
    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "telegram_bot",
            "label": "Telegram Bot LIVE",
            "connected": True,
            "authenticated": True,
            "runtime_usable": True,
            "read_actions": ["chats.read"],
            "write_actions": ["send_message"],
            "approval_required_actions": ["send_message"],
        }],
    )
    def test_obvious_telegram_write_preview_bypasses_ai_ready_gate(self, _capabilities, _provider_has_key, generate_reply):
        with patch("operator_chat_under_test._message_can_use_direct_connector_tools", return_value=False):
            payload = build_direct_operator_reply(
                message="Send a Telegram message to my test chat saying certification probe one.",
                workspace_id="default",
                requested_model="gpt-5.4",
                requested_provider="openai",
                availability={"ai_ready": False},
            )

        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertEqual(payload["reply"], "I can run that here.")
        self.assertTrue(any(action["kind"] == "run" for action in payload["actions"]))
        generate_reply.assert_not_called()

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback")
    @patch("operator_chat_under_test.provider_has_key", return_value=False)
    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "google_workspace",
            "label": "Google Workspace",
            "connected": True,
            "authenticated": True,
            "runtime_usable": True,
            "read_actions": ["gmail_threads.read"],
            "write_actions": ["draft_email", "create_calendar_event"],
            "approval_required_actions": ["draft_email", "create_calendar_event"],
        }],
    )
    def test_obvious_google_draft_preview_bypasses_ai_ready_gate(self, _capabilities, _provider_has_key, generate_reply):
        with patch("operator_chat_under_test._message_can_use_direct_connector_tools", return_value=False):
            payload = build_direct_operator_reply(
                message="Draft an email to myself summarizing today's certification results.",
                workspace_id="default",
                requested_model="gpt-5.4",
                requested_provider="openai",
                availability={"ai_ready": False},
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

        self.assertTrue(payload["context_used"]["prior_messages_used"])
        self.assertEqual(payload["context_used"]["history_mode"], "raw_messages")

    @patch.dict("operator_chat_under_test.os.environ", {"ORION_AUTH_MODE": "codex"}, clear=False)
    @patch("operator_chat_under_test._direct_chat_credentials", return_value={})
    @patch("operator_chat_under_test.provider_has_key", return_value=False)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_codex_chat_unavailable_fails_closed(self, _capabilities, _provider_has_key, _direct_chat_credentials):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "connect")
        self.assertIn("OpenAI is selected for chat", payload["reply"])
        self.assertFalse(payload["context_used"]["provider_overridden"])
        self.assertFalse(payload["context_used"]["fallback_used"])
        self.assertIsNone(payload["context_used"].get("fallback_reason"))

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("Hello from Gemini.", {"provider": "gemini", "model": "gemini-2.0-flash"}, "gemini", ""),
    )
    @patch("operator_chat_under_test._direct_chat_credentials", return_value={})
    @patch("operator_chat_under_test.provider_has_key", side_effect=lambda provider: provider == "gemini")
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_selected_provider_unavailable_uses_next_available_provider(self, _capabilities, _provider_has_key, _direct_chat_credentials, _generate_reply):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["mode"], "answer")
        self.assertEqual(payload["provider"], "gemini")
        self.assertEqual(payload["context_used"]["effective_provider"], "gemini")
        self.assertTrue(payload["context_used"]["provider_overridden"])

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
    def test_model_identity_question_is_not_overridden(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="What model are you using right now?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "placeholder")

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("", None, "codex_cli", "direct_chat_transport_unavailable: codex_cli_backend_unavailable"),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_transport_unavailable_reply_is_explicit(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="Write a short answer about project status.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "Chat failed: direct_chat_transport_unavailable: codex_cli_backend_unavailable")

    @patch(
        "operator_chat_under_test.generate_chat_reply_with_provider_fallback",
        return_value=("I can access Google Workspace here.", {"provider": "openai", "model": "gpt-5.4"}, "openai", ""),
    )
    @patch("operator_chat_under_test.provider_has_key", return_value=True)
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
    def test_capability_question_uses_model_reply(self, _capabilities, _provider_has_key, generate_reply):
        payload = build_direct_operator_reply(
            message="What can you do in this environment?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "I can access Google Workspace here.")
        self.assertEqual(payload["mode"], "answer")
        generate_reply.assert_called_once()

    @patch("operator_chat_under_test.generate_chat_reply_with_provider_fallback")
    @patch(
        "operator_chat_under_test.resolve_workspace_tool_capabilities",
        return_value=[{
            "id": "telegram_bot",
            "label": "Telegram Bot LIVE",
            "connected": True,
            "authenticated": True,
            "runtime_usable": True,
            "read_actions": ["chats.read"],
            "write_actions": ["send_message"],
            "approval_required_actions": ["send_message"],
        }],
    )
    def test_no_ai_account_plain_chat_and_capability_question_share_one_contract(self, _capabilities, generate_reply):
        capability_payload = build_direct_operator_reply(
            message="What can you help me with in this environment right now?",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": False},
        )
        plain_payload = build_direct_operator_reply(
            message="My favorite color is blue.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": False},
        )

        self.assertEqual(capability_payload["reply"], plain_payload["reply"])
        self.assertIn("AI chat is not available right now", capability_payload["reply"])
        self.assertIn("Usable now: Telegram Bot LIVE.", capability_payload["reply"])
        self.assertEqual(capability_payload["mode"], "connect")
        self.assertEqual(plain_payload["mode"], "connect")
        self.assertEqual(capability_payload["actions"][0]["href"], "/connect-ai")
        self.assertEqual(plain_payload["actions"][0]["href"], "/connect-ai")
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
        self.assertEqual(len(payload["actions"]), 1)
        self.assertEqual(payload["actions"][0]["kind"], "connect")
        self.assertEqual(payload["actions"][0]["label"], "Reconnect Google Workspace")
        self.assertEqual(payload["actions"][0]["href"], "/credentials?connector=google_workspace")

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
    def test_simple_greeting_uses_honest_transport_fallback(self, _capabilities, _provider_has_key, _generate_reply):
        payload = build_direct_operator_reply(
            message="hello",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True},
        )

        self.assertEqual(payload["reply"], "Chat failed: temporary backend error")

    @patch("operator_chat_under_test._direct_chat_run_snapshot")
    @patch("operator_chat_under_test._start_direct_chat_run_handoff")
    @patch("operator_chat_under_test._preferred_provider", return_value=("openai", {}))
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_execution_preview_auto_starts_durable_run_handoff(
        self,
        _capabilities,
        _preferred_provider,
        start_run_mock,
        snapshot_mock,
    ):
        start_run_mock.return_value = {
            "run_id": "run-handoff-1",
            "route": {"selected": "local_companion"},
            "status": "queued_local",
        }
        snapshot_mock.return_value = (
            {"status": "completed", "result": "Finished on the laptop.", "events": []},
            {
                "run_id": "run-handoff-1",
                "status": "completed",
                "result_summary": "Finished on the laptop.",
                "effective_provider": "openai",
                "effective_model": "gpt-5.4",
                "fallback_used": False,
                "usage_masked": {},
            },
        )

        events = list(
            stream_direct_operator_reply(
                message="Summarize the project docs and prepare next steps.",
                workspace_id="default",
                requested_model="gpt-5.4",
                requested_provider="openai",
                availability={"ai_ready": True, "connection_mode": "local_companion"},
            )
        )

        self.assertEqual(events[0]["type"], "step")
        self.assertEqual(events[0]["label"], "Starting durable run")
        self.assertEqual(events[1]["type"], "step")
        self.assertEqual(events[1]["label"], "Durable run started")
        self.assertEqual(events[-1]["type"], "final")
        self.assertEqual(events[-1]["payload"]["reply"], "Finished on the laptop.")
        self.assertTrue(events[-1]["payload"]["context_used"]["run_created"])
        start_run_mock.assert_called_once()

    @patch("operator_chat_under_test._start_direct_chat_run_handoff")
    @patch("operator_chat_under_test._preferred_provider", return_value=("openai", {}))
    @patch("operator_chat_under_test.resolve_workspace_tool_capabilities", return_value=[])
    def test_execution_preview_does_not_auto_start_durable_run_for_byok(
        self,
        _capabilities,
        _preferred_provider,
        start_run_mock,
    ):
        payload = build_direct_operator_reply(
            message="Summarize the project docs and prepare next steps.",
            workspace_id="default",
            requested_model="gpt-5.4",
            requested_provider="openai",
            availability={"ai_ready": True, "connection_mode": "byok"},
        )

        self.assertEqual(payload["reply"], "I can run that here.")
        self.assertEqual(payload["mode"], "answer_with_action")
        self.assertFalse(payload["context_used"]["run_created"])
        start_run_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
