import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
