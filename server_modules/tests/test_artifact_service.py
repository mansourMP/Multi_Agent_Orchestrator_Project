import os
from pathlib import Path
import tempfile
from unittest import TestCase
from unittest.mock import patch

from server_modules import artifact_service


class ArtifactServiceTests(TestCase):
    def test_store_artifact_file_persists_metadata_and_resolves_content(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            source = Path(tempdir) / "report.txt"
            source.write_text("hello from empyralis", encoding="utf-8")
            store_root = Path(tempdir) / "object-store"

            with patch.dict(os.environ, {"EMPYRALIS_OBJECT_STORAGE_ROOT": str(store_root)}, clear=False):
                record = artifact_service.store_artifact_file(
                    source,
                    run_id="run-1",
                    kind="report",
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    step_number=2,
                    machine_id="machine-1",
                )

                self.assertTrue(record.uri.startswith("artifact://"))
                metadata = artifact_service.load_artifact_metadata(record.uri)
                self.assertIsNotNone(metadata)
                self.assertEqual(metadata["artifact_id"], record.artifact_id)
                self.assertEqual(metadata["run_id"], "run-1")
                self.assertEqual(metadata["tenant_id"], "tenant-1")
                self.assertEqual(metadata["workspace_id"], "workspace-1")
                self.assertEqual(metadata["machine_id"], "machine-1")
                self.assertEqual(metadata["step_number"], 2)
                self.assertEqual(metadata["byte_size"], len("hello from empyralis".encode("utf-8")))

                target = artifact_service.resolve_artifact_content_path(record.uri)
                self.assertIsNotNone(target)
                self.assertEqual(target.read_text(encoding="utf-8"), "hello from empyralis")

    def test_store_artifact_bytes_records_retention_placeholder(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            store_root = Path(tempdir) / "object-store"
            with patch.dict(os.environ, {"EMPYRALIS_OBJECT_STORAGE_ROOT": str(store_root)}, clear=False):
                record = artifact_service.store_artifact_bytes(
                    b'{"deleted":true}',
                    run_id="run-2",
                    kind="file_delete",
                    file_name="deleted-record.json",
                    tenant_id="tenant-2",
                    workspace_id="workspace-2",
                    content_type="application/json",
                    retention_days=30,
                )

                metadata = artifact_service.load_artifact_metadata(record.uri)
                self.assertIsNotNone(metadata)
                self.assertEqual(metadata["tenant_id"], "tenant-2")
                self.assertEqual(metadata["workspace_id"], "workspace-2")
                self.assertEqual(metadata["content_type"], "application/json")
                self.assertEqual(metadata["retention"]["retention_days"], 30)
                self.assertEqual(metadata["retention"]["policy_status"], "placeholder")
