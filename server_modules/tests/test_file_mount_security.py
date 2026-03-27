import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.orion_local_worker_execution import build_local_execution_pack_result
from server_modules.builder_runtime_mapping import default_file_mount_grants
from server_modules.file_mount_security import assert_file_mount_access


class FileMountSecurityTests(unittest.TestCase):
    def test_assert_file_mount_access_allows_project_reads_by_default(self):
        access = assert_file_mount_access(
            "README.md",
            "read",
            default_file_mount_grants(),
            "local_companion",
        )

        self.assertEqual(access["mount"], "project")
        self.assertEqual(access["mode"], "read")

    def test_assert_file_mount_access_blocks_absolute_local_root_without_grant(self):
        with self.assertRaises(RuntimeError):
            assert_file_mount_access(
                str(Path.cwd() / "README.md"),
                "read",
                default_file_mount_grants(),
                "local_companion",
            )

    def test_local_worker_blocks_absolute_file_path_without_local_root_grant(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "secret.txt"
            target.write_text("classified", encoding="utf-8")
            metadata = {
                "execution_target": "local_companion",
                "file_mount_grants": default_file_mount_grants(),
            }
            pack_inputs = {
                "operations": [
                    {
                        "tool": "read_write_files",
                        "mode": "read",
                        "path": str(target),
                    }
                ]
            }
            with patch.dict(os.environ, {"ORION_LOCAL_COMPANION_ROOT": str(root)}, clear=False):
                with self.assertRaises(RuntimeError):
                    build_local_execution_pack_result({"run_id": "run-abs-blocked"}, metadata, pack_inputs)

    def test_local_worker_allows_project_relative_file_reads(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "notes.txt"
            target.write_text("hello", encoding="utf-8")
            metadata = {
                "execution_target": "local_companion",
                "file_mount_grants": default_file_mount_grants(),
            }
            pack_inputs = {
                "operations": [
                    {
                        "tool": "read_write_files",
                        "mode": "read",
                        "path": "notes.txt",
                    }
                ]
            }
            with patch.dict(os.environ, {"ORION_LOCAL_COMPANION_ROOT": str(root)}, clear=False):
                summary, data = build_local_execution_pack_result({"run_id": "run-rel-ok"}, metadata, pack_inputs)

            self.assertIn("Executed 1 of 1 local operations.", summary)
            self.assertEqual(data["outputs"]["operations_executed"], 1)


if __name__ == "__main__":
    unittest.main()
