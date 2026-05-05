import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import workspace_context_memory_adapter


class WorkspaceContextMemoryAdapterTests(unittest.TestCase):
    def test_load_workspace_context_payload_includes_identity_workspace_files(self):
        with (
            patch(
                "server_modules.workspace_context_memory_adapter.read_workspace_context_files",
                return_value={
                    "SOUL.md": "# Empyralis\n\n## Personal communication style\n\n- Be concise.\n",
                    "USER.md": "# User Profile\n\n- Preferred name: Mansur\n",
                    "IDENTITY.md": "# Identity\n\n- Role and focus: Agent platform founder.\n",
                    "HEARTBEAT.md": "# Heartbeat\n\n- [ ] Keep the inbox triaged.\n",
                    "MEMORY.md": "# Curated Memory\n\n- timezone: Asia/Shanghai\n",
                },
            ),
            patch(
                "server_modules.memory_service.get_recent_logs",
                return_value="",
            ),
            patch(
                "server_modules.memory_service.get_memory",
                return_value="",
            ),
            patch(
                "server_modules.sage_memory_service.build_sage_memory_context_block",
                return_value="",
            ),
            patch(
                "server_modules.sage_services_service.build_sage_services_memory_block",
                return_value="",
            ),
        ):
            payload = workspace_context_memory_adapter.load_workspace_context_payload(
                workspace_id="workspace-1",
                policy_profile=type("Profile", (), {"max_recent_log_days": 7, "semantic_retrieval_k": 5})(),
            )

        rendered = "\n\n".join(payload["contextual_blocks"])
        self.assertIn("SOUL.md", rendered)
        self.assertIn("IDENTITY.md", rendered)
        self.assertIn("HEARTBEAT.md", rendered)
        self.assertEqual(payload["diagnostics"]["context_file_count"], 5)

    def test_load_workspace_context_payload_includes_sage_memory_block(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with (
                patch("server_modules.workspace_context_memory_adapter.read_workspace_context_files", return_value={}),
                patch(
                    "server_modules.memory_service.get_recent_logs",
                    return_value="",
                ),
                patch(
                    "server_modules.memory_service.get_memory",
                    return_value="",
                ),
                patch(
                    "server_modules.sage_memory_service.build_sage_memory_context_block",
                    return_value="Sage memory\nProfile facts\n- Timezone: Uses Asia/Shanghai.",
                ),
                patch(
                    "server_modules.sage_services_service.build_sage_services_memory_block",
                    return_value="",
                ),
            ):
                payload = workspace_context_memory_adapter.load_workspace_context_payload(
                    workspace_id=str(root),
                    policy_profile=type("Profile", (), {"max_recent_log_days": 7, "semantic_retrieval_k": 5})(),
                )

        self.assertTrue(any("Sage memory" in block for block in payload["contextual_blocks"]))

    def test_load_workspace_context_payload_includes_sage_services_memory_block(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir) / "workspace-1"
            with (
                patch("server_modules.workspace_context_memory_adapter.read_workspace_context_files", return_value={}),
                patch(
                    "server_modules.memory_service.get_recent_logs",
                    return_value="",
                ),
                patch(
                    "server_modules.memory_service.get_memory",
                    return_value="",
                ),
                patch(
                    "server_modules.sage_memory_service.build_sage_memory_context_block",
                    return_value="",
                ),
                patch(
                    "server_modules.sage_services_service.build_sage_services_memory_block",
                    return_value="Sage services\nFlashcards\n- HSK1 review due.",
                ),
            ):
                payload = workspace_context_memory_adapter.load_workspace_context_payload(
                    workspace_id=str(root),
                    policy_profile=type("Profile", (), {"max_recent_log_days": 7, "semantic_retrieval_k": 5})(),
                )

        self.assertTrue(any("Sage services" in block for block in payload["contextual_blocks"]))


if __name__ == "__main__":
    unittest.main()
