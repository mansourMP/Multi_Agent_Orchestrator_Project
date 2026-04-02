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


if __name__ == "__main__":
    unittest.main()
