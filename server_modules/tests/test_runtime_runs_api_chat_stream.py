import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import runtime_runs_api
from server_modules.runtime_state_store import init_runtime_state_db


class RuntimeRunsApiChatStreamTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="chat-stream-tests-")
        self.db_path = Path(self._tmpdir.name) / "runtime.db"
        init_runtime_state_db(self.db_path)
        self._db_patcher = patch.object(runtime_runs_api, "_chat_stream_state_db_path", return_value=self.db_path)
        self._db_patcher.start()
        with runtime_runs_api._CHAT_STREAM_LOCK:
            runtime_runs_api._CHAT_STREAM_SESSIONS.clear()

    def tearDown(self) -> None:
        with runtime_runs_api._CHAT_STREAM_LOCK:
            runtime_runs_api._CHAT_STREAM_SESSIONS.clear()
        self._db_patcher.stop()
        self._tmpdir.cleanup()

    def test_iter_chat_stream_events_replays_only_events_after_cursor(self):
        session = runtime_runs_api._get_or_create_chat_stream_session(
            "user:thread:req",
            thread_id="thread",
            request_id="req",
            workspace_id="default",
        )
        runtime_runs_api._append_chat_stream_event(session, "chunk", {"delta": "Hello"})
        runtime_runs_api._append_chat_stream_event(session, "step", {"label": "Thinking", "status": "active"})
        runtime_runs_api._append_chat_stream_event(session, "final", {"reply": "Done"})

        payload = b"".join(runtime_runs_api._iter_chat_stream_events(session, "1")).decode("utf-8")

        self.assertNotIn("id: 1\n", payload)
        self.assertIn("id: 2\n", payload)
        self.assertIn("event: step\n", payload)
        self.assertIn("id: 3\n", payload)
        self.assertIn("event: final\n", payload)

    def test_final_stream_event_persists_assistant_turn_content(self):
        captured = {}

        async def _record_assistant_turn(**kwargs):
            captured.update(kwargs)
            return {"ok": True}

        session = runtime_runs_api._get_or_create_chat_stream_session(
            "user:thread:req",
            thread_id="thread",
            request_id="req",
            workspace_id="default",
        )
        session["metadata"] = {
            "assistant_turn": {
                "tenant_id": "tenant-1",
                "workspace_id": "default",
                "thread_id": "thread",
                "session_id": "thread",
                "request_id": "req",
                "active_agent_install_id": "agent-1",
                "runtime_profile_id": "runtime-1",
            }
        }

        with patch.object(runtime_runs_api.thread_service, "record_assistant_turn", _record_assistant_turn):
            runtime_runs_api._append_chat_stream_event(
                session,
                "final",
                {
                    "reply": "Done",
                    "actions": [],
                    "mode": "answer",
                    "metadata": {"agent_role": "sage", "trace_id": "trace-1"},
                },
            )

        self.assertEqual(captured["thread_id"], "thread")
        self.assertEqual(captured["tenant_id"], "tenant-1")
        self.assertEqual(captured["workspace_id"], "default")
        self.assertEqual(captured["reply"], "Done")
        self.assertEqual(captured["status"], "completed")
        self.assertEqual(captured["active_agent_install_id"], "agent-1")
        self.assertEqual(captured["runtime_profile_id"], "runtime-1")
        self.assertEqual(captured["metadata"]["request_id"], "req")
        self.assertEqual(captured["metadata"]["trace_id"], "trace-1")
        self.assertEqual(captured["metadata"]["result_metadata"]["agent_role"], "sage")

    def test_final_stream_event_does_not_persist_notice_as_assistant_content(self):
        calls = []

        async def _record_assistant_turn(**kwargs):
            calls.append(kwargs)
            return {"ok": True}

        session = runtime_runs_api._get_or_create_chat_stream_session(
            "user:thread:req",
            thread_id="thread",
            request_id="req",
            workspace_id="default",
        )
        session["metadata"] = {
            "assistant_turn": {
                "tenant_id": "tenant-1",
                "workspace_id": "default",
                "thread_id": "thread",
                "session_id": "thread",
                "request_id": "req",
            }
        }

        with patch.object(runtime_runs_api.thread_service, "record_assistant_turn", _record_assistant_turn):
            runtime_runs_api._append_chat_stream_event(
                session,
                "final",
                {
                    "reply": "",
                    "mode": "connect",
                    "interventions": [
                        {
                            "kind": "connect_required",
                            "code": "local_setup_required",
                            "detail": "Connect My Computer in Integrations before Sage uses local computer actions.",
                        }
                    ],
                },
            )

        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
