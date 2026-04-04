import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from server_modules import memory_service, workspace_context


class MemoryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="memory-service-")
        self.addCleanup(self._tmpdir.cleanup)
        tmp_root = Path(self._tmpdir.name)
        self._workspace_root = tmp_root / "workspace"
        self._workspace_root.mkdir(parents=True, exist_ok=True)
        self._memory_root = tmp_root / "runtime-memory"
        self._workspace_patch = patch.object(workspace_context, "_WORKSPACE_DIR", self._workspace_root)
        self._memory_patch = patch.object(memory_service.agent_memory, "_MEMORY_DIR", self._memory_root)
        self._semantic_model_patch = patch.object(memory_service.agent_memory, "_SEMANTIC_MODEL", False)
        self._workspace_patch.start()
        self._memory_patch.start()
        self._semantic_model_patch.start()
        self.addCleanup(self._workspace_patch.stop)
        self.addCleanup(self._memory_patch.stop)
        self.addCleanup(self._semantic_model_patch.stop)

    def test_workspace_memory_snapshot_contains_entries_and_text(self) -> None:
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")
        memory_service.save_memory("default", "preferred_editor", "Neovim")

        snapshot = memory_service.workspace_memory_snapshot("default")

        self.assertEqual(snapshot.workspace_id, "default")
        self.assertEqual(snapshot.entries[0]["key"], "preferred_editor")
        self.assertIn("- preferred_editor: Neovim", snapshot.text)
        self.assertEqual(snapshot.as_payload()["workspace_id"], "default")

    def test_query_memory_returns_matching_items_and_context_blocks(self) -> None:
        memory_service.save_memory("default", "timezone", "Asia/Shanghai")
        memory_service.save_memory("default", "favorite_drink", "tea")
        memory_service.save_daily_log("default", "Reviewed the canonical runtime convergence work.")

        result = memory_service.query_memory(
            memory_service.MemoryQuery(
                workspace_id="default",
                session_id="thread-1",
                text="timezone",
            )
        )

        self.assertTrue(any(item.metadata.get("key") == "timezone" for item in result.items))
        self.assertTrue(any(block.startswith("Runtime Memory Facts") for block in result.context_blocks))
        self.assertTrue(any(block.startswith("Recent Daily Logs") for block in result.context_blocks))

    def test_runtime_memory_search_wraps_runtime_subsystem_results(self) -> None:
        with patch.object(memory_service.runtime_memory, "_memory_manager_or_503", return_value=object()) as manager_mock, patch.object(
            memory_service.runtime_memory,
            "_normalize_memory_bucket",
            return_value="session",
        ) as bucket_mock, patch.object(
            memory_service.runtime_memory,
            "_normalize_workspace_id",
            return_value="default",
        ) as workspace_mock, patch.object(
            memory_service.runtime_memory,
            "_memory_search_scoped",
            return_value=[{"id": "mem-1", "text": "remember this", "metadata": {"bucket": "session"}}],
        ) as scoped_mock:
            result = memory_service.runtime_memory_search(
                query="remember",
                bucket="session",
                workspace_id="default",
                profile_id="profile-1",
                project_id="project-1",
                session_key="session-1",
                k=4,
            )

        manager_mock.assert_called_once_with()
        bucket_mock.assert_called_once_with("session", required=False)
        workspace_mock.assert_called_once_with("default")
        scoped_mock.assert_called_once_with(
            query="remember",
            bucket="session",
            workspace_id="default",
            profile_id="profile-1",
            project_id="project-1",
            session_key="session-1",
            k=4,
        )
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["items"][0]["id"], "mem-1")

    def test_runtime_memory_upsert_wraps_runtime_subsystem_manager(self) -> None:
        manager = type("Manager", (), {"upsert_memory": lambda self, text, metadata: metadata.get("id") or "mem-2"})()
        with patch.object(memory_service.runtime_memory, "_memory_manager_or_503", return_value=manager) as manager_mock, patch.object(
            memory_service.runtime_memory,
            "_normalize_memory_bucket",
            return_value="session",
        ) as bucket_mock, patch.object(
            memory_service.runtime_memory,
            "_normalize_workspace_id",
            return_value="default",
        ) as workspace_mock, patch.object(
            memory_service.runtime_memory,
            "_utc_now",
            return_value=datetime(2026, 4, 4, tzinfo=timezone.utc),
        ), patch.object(
            memory_service.runtime_memory,
            "ORION_MEMORY_RETENTION_DAYS_DEFAULT",
            30,
        ):
            result = memory_service.runtime_memory_upsert(
                text="Remember the current customer migration plan.",
                bucket="session",
                workspace_id="default",
                profile_id="profile-1",
                project_id="project-1",
                session_key="session-1",
                source="api",
                retention_days=14,
                metadata={"source_kind": "test"},
                memory_id="mem-2",
            )

        manager_mock.assert_called_once_with()
        bucket_mock.assert_called_once_with("session", required=True)
        workspace_mock.assert_called_once_with("default")
        self.assertEqual(result["id"], "mem-2")
        self.assertEqual(result["bucket"], "session")
        self.assertEqual(result["workspace_id"], "default")
        self.assertEqual(result["retention_days"], 14)
        self.assertTrue(str(result["expires_at"]).endswith("Z"))


if __name__ == "__main__":
    unittest.main()
