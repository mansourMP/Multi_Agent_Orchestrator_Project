import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from server_modules import agent_workspace_api
from server_modules import artifact_service
from server_modules.runtime_models import RunStartRequest


class AgentWorkspaceApiTests(unittest.TestCase):
    def test_execute_workspace_run_request_routes_through_turn_runtime(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="Write file demo.txt")

        with patch.object(
            agent_workspace_api,
            "_agent_workspace_run_execution_services",
            return_value=object(),
        ), patch.object(
            agent_workspace_api,
            "execute_system_run_start_request_via_turn_runtime",
            return_value={"run_id": "run-1", "status": "starting"},
        ) as execute_run:
            result = agent_workspace_api._execute_workspace_run_request(request)

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "starting")
        self.assertTrue(callable(execute_run.call_args.kwargs["stamp_request_owner_fn"]))

    def test_collect_workspace_materials_preserves_canonical_artifact_metadata(self):
        snapshot = {
            "run_id": "run-1",
            "updated_at": "2026-04-07T00:00:00Z",
            "result_data": {
                "outputs": {
                    "artifacts": [
                        {
                            "artifact_id": "artifact-1",
                            "uri": "artifact://artifact-1/capture.png",
                            "kind": "screenshot",
                            "label": "capture.png",
                            "content_type": "image/png",
                            "byte_size": 123,
                            "created_at": "2026-04-07T00:00:00Z",
                            "step_number": 1,
                            "machine_id": "machine-1",
                            "storage_backend": "filesystem_object_store",
                            "storage_bucket": "empyralis-artifacts",
                            "storage_region": "us-east-1",
                            "storage_endpoint": "https://storage.example.test",
                        }
                    ]
                }
            },
        }
        files = []
        artifacts = []

        agent_workspace_api._collect_workspace_materials_for_snapshot(
            snapshot,
            files=files,
            artifacts=artifacts,
            seen_files=set(),
            seen_artifacts=set(),
            file_limit=20,
            artifact_limit=20,
        )

        self.assertEqual(files, [])
        self.assertEqual(artifacts[0]["uri_or_path"], "artifact://artifact-1/capture.png")
        self.assertEqual(artifacts[0]["artifact_id"], "artifact-1")
        self.assertEqual(artifacts[0]["content_type"], "image/png")
        self.assertEqual(artifacts[0]["byte_size"], 123)
        self.assertEqual(artifacts[0]["machine_id"], "machine-1")
        self.assertEqual(artifacts[0]["storage_bucket"], "empyralis-artifacts")
        self.assertEqual(artifacts[0]["storage_region"], "us-east-1")
        self.assertEqual(artifacts[0]["storage_endpoint"], "https://storage.example.test")

    def test_resolve_workspace_material_target_supports_canonical_artifact_uri(self):
        with tempfile.TemporaryDirectory() as tempdir:
            source = Path(tempdir) / "proof.txt"
            source.write_text("artifact body", encoding="utf-8")
            store_root = Path(tempdir) / "object-store"
            with patch.dict(os.environ, {"EMPYRALIS_OBJECT_STORAGE_ROOT": str(store_root)}, clear=False):
                record = artifact_service.store_artifact_file(source, run_id="run-1", kind="report")
                target = agent_workspace_api._resolve_workspace_material_target(record.uri)

            self.assertIsNotNone(target)
            self.assertEqual(target.read_text(encoding="utf-8"), "artifact body")


if __name__ == "__main__":
    unittest.main()
