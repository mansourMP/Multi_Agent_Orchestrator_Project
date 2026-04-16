import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import sage_memory_service


class SageMemoryServiceTests(unittest.TestCase):
    def test_upsert_memory_entry_persists_category_and_trace(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with patch("server_modules.sage_memory_service.workspace_context.workspace_scope_dir", return_value=root):
                payload = sage_memory_service.upsert_memory_entry(
                    workspace_id="workspace-1",
                    category="profile_fact",
                    title="Preferred timezone",
                    content="Uses Asia/Shanghai for planning.",
                    pinned=True,
                    actor_user_id="user-1",
                )

            entry = payload["entry"]
            self.assertEqual(entry["category"], "profile_fact")
            self.assertTrue(entry["pinned"])
            self.assertEqual(entry["history"][0]["action"], "saved")
            self.assertTrue((root / "sage_memory.json").exists())

    def test_update_and_pin_memory_entry_append_trace_history(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with patch("server_modules.sage_memory_service.workspace_context.workspace_scope_dir", return_value=root):
                created = sage_memory_service.upsert_memory_entry(
                    workspace_id="workspace-1",
                    category="active_context",
                    title="Current project",
                    content="Preparing the private beta launch plan.",
                    actor_user_id="user-1",
                )
                entry_id = created["entry"]["id"]
                updated = sage_memory_service.upsert_memory_entry(
                    workspace_id="workspace-1",
                    entry_id=entry_id,
                    category="active_context",
                    title="Current project",
                    content="Preparing the Sage private beta launch plan.",
                    actor_user_id="user-2",
                )
                pinned = sage_memory_service.set_memory_entry_pinned(
                    workspace_id="workspace-1",
                    entry_id=entry_id,
                    pinned=True,
                    actor_user_id="user-3",
                )

            self.assertEqual(updated["entry"]["history"][0]["action"], "corrected")
            self.assertEqual(pinned["entry"]["history"][0]["action"], "pinned")
            self.assertTrue(pinned["entry"]["pinned"])

    def test_build_sage_memory_context_block_groups_categories(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with patch("server_modules.sage_memory_service.workspace_context.workspace_scope_dir", return_value=root):
                sage_memory_service.upsert_memory_entry(
                    workspace_id="workspace-1",
                    category="profile_fact",
                    title="Timezone",
                    content="Uses Asia/Shanghai.",
                    actor_user_id="user-1",
                )
                sage_memory_service.upsert_memory_entry(
                    workspace_id="workspace-1",
                    category="long_term_preference",
                    title="Status updates",
                    content="Prefers concise next-step updates.",
                    pinned=True,
                    actor_user_id="user-1",
                )
                block = sage_memory_service.build_sage_memory_context_block(workspace_id="workspace-1")

            self.assertIn("Sage memory", block)
            self.assertIn("Profile facts", block)
            self.assertIn("Saved preferences", block)
            self.assertIn("[pinned]", block)


if __name__ == "__main__":
    unittest.main()
