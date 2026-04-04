import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import memory_service, session_transcript_store, workspace_context


class SessionTranscriptStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="session-transcript-store-")
        self.addCleanup(self._tmpdir.cleanup)
        tmp_root = Path(self._tmpdir.name)
        self._transcripts_root = tmp_root / "transcripts"
        self._workspace_root = tmp_root / "workspace"
        self._workspace_root.mkdir(parents=True, exist_ok=True)
        self._memory_root = tmp_root / "runtime-memory"

        self._transcript_patch = patch.object(session_transcript_store, "_TRANSCRIPTS_ROOT", self._transcripts_root)
        self._workspace_patch = patch.object(workspace_context, "_WORKSPACE_DIR", self._workspace_root)
        self._memory_patch = patch.object(memory_service.agent_memory, "_MEMORY_DIR", self._memory_root)

        self._transcript_patch.start()
        self._workspace_patch.start()
        self._memory_patch.start()

        self.addCleanup(self._transcript_patch.stop)
        self.addCleanup(self._workspace_patch.stop)
        self.addCleanup(self._memory_patch.stop)

    def test_save_session_transcript_writes_jsonl_and_daily_log(self) -> None:
        result = session_transcript_store.save_session_transcript(
            workspace_id="default",
            thread_id="thread-1",
            provider="openai",
            model="gpt-test",
            messages=[
                {"role": "user", "content": "Earlier request about docs."},
                {"role": "assistant", "content": "Earlier response."},
            ],
            user_message="Continue the runtime refactor.",
            assistant_reply="Moved transcript logging behind the memory service.",
        )

        transcript_path = Path(result["path"])
        self.assertTrue(transcript_path.exists())

        rows = transcript_path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(rows), 1)
        payload = json.loads(rows[0])
        self.assertEqual(payload["thread_id"], "thread-1")
        self.assertEqual(payload["provider"], "openai")
        self.assertEqual(payload["model"], "gpt-test")

        recent_logs = memory_service.get_recent_logs("default", days=7)
        self.assertIn("Transcript summary:", recent_logs)
        self.assertIn("Continue the runtime refactor.", recent_logs)
        self.assertIn("Moved transcript logging behind the memory service.", recent_logs)


if __name__ == "__main__":
    unittest.main()
