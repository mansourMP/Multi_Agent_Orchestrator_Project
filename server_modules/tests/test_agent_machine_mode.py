from __future__ import annotations

import unittest
from unittest.mock import patch

from server_modules import runtime_config, runtime_runs_api, runs_engine
from server_modules import operator_chat


class AgentMachineModeTests(unittest.TestCase):
    def test_agent_machine_full_trust_enabled_requires_matching_owner(self):
        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                self.assertTrue(runtime_config.agent_machine_full_trust_enabled("user-123"))
                self.assertFalse(runtime_config.agent_machine_full_trust_enabled("user-456"))
                self.assertFalse(runtime_config.agent_machine_full_trust_enabled(""))

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "personal"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                self.assertFalse(runtime_config.agent_machine_full_trust_enabled("user-123"))

    def test_wait_for_human_decision_bypasses_prompt_for_matching_owner(self):
        run_id = "agent-machine-run"
        previous = runs_engine.runs.get(run_id)
        runs_engine.runs[run_id] = {
            "context": {"metadata": {"owner_user_id": "user-123"}},
            "logs": [],
        }
        try:
            with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
                with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                    with patch("server_modules.runs_core.emit_log") as emit_log_mock:
                        with patch("server_modules.runs_engine.wait_for_human_response") as wait_mock:
                            approved = runs_engine.wait_for_human_decision(run_id, "Confirm send")
        finally:
            if previous is None:
                runs_engine.runs.pop(run_id, None)
            else:
                runs_engine.runs[run_id] = previous

        self.assertTrue(approved)
        wait_mock.assert_not_called()
        emit_log_mock.assert_called_once()

    def test_direct_tool_approval_payload_skips_prompt_for_matching_owner(self):
        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                payload = operator_chat._build_direct_tool_approval_response(
                    tool_calls=[
                        {
                            "name": "shell__exec",
                            "arguments": {"command": "rm -rf /tmp/demo"},
                        }
                    ],
                    tool_capabilities=[],
                    session_ctx={"user_id": "user-123"},
                )

        self.assertIsNone(payload)

    def test_runtime_runs_api_threads_user_id_into_direct_chat_session_context(self):
        captured: dict[str, object] = {}

        def _fake_reply(**kwargs):
            captured.update(kwargs)
            return {"reply": "ok"}

        with patch("server_modules.runtime_runs_api._direct_chat_session_manager_enabled", return_value=False):
            with patch("server_modules.operator_chat.build_direct_operator_reply", side_effect=_fake_reply):
                payload = runtime_runs_api._build_direct_chat_event_producer(
                    current_user={"user_id": "user-123"},
                    body={},
                    message="hello",
                    workspace_id="default",
                    session_key="session-1",
                    thread_id="thread-1",
                    client_request_id="request-1",
                )

        self.assertEqual(payload["reply"], "ok")
        self.assertEqual((captured.get("session_ctx") or {}).get("user_id"), "user-123")


if __name__ == "__main__":
    unittest.main()
