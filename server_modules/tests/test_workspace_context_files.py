import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server_modules import sage_profile_service, workspace_context


class WorkspaceContextFilesTests(unittest.TestCase):
    def test_extended_memory_markdown_files_round_trip_exact_content(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            with patch("server_modules.workspace_context._WORKSPACE_DIR", Path(tempdir)):
                content = "# Reflection\n\n- Saved exactly.\n"
                saved = workspace_context.write_workspace_context_file(
                    "REFLECTION.md",
                    content,
                    workspace_id="workspace-1",
                )

                self.assertEqual(saved["filename"], "REFLECTION.md")
                self.assertEqual(
                    workspace_context.read_workspace_context_file(
                        "REFLECTION.md",
                        workspace_id="workspace-1",
                    ),
                    content,
                )

    def test_profile_projection_sync_does_not_overwrite_manual_file_edits(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            with patch("server_modules.workspace_context._WORKSPACE_DIR", Path(tempdir)):
                manual_content = "# IDENTITY\n\n- Manually edited file text.\n"
                workspace_context.write_workspace_context_file(
                    "IDENTITY.md",
                    manual_content,
                    workspace_id="workspace-1",
                )

                sage_profile_service.sync_profile_context_files(
                    workspace_id="workspace-1",
                    profile={
                        "identity_summary": "Structured profile text.",
                    },
                )

                self.assertEqual(
                    workspace_context.read_workspace_context_file(
                        "IDENTITY.md",
                        workspace_id="workspace-1",
                    ),
                    manual_content,
                )


if __name__ == "__main__":
    unittest.main()
