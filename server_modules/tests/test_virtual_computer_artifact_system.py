import asyncio
import unittest

from server_modules.virtual_computer_runtime import InMemoryVirtualComputerRuntime


class VirtualComputerArtifactSystemTests(unittest.TestCase):
    def test_artifact_type_allowlist_is_enforced(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "artifact_policy": {"allowed_types": ["pdf"]},
                }
            )
        )
        session_id = created.get("session_id")
        with self.assertRaises(RuntimeError):
            asyncio.run(runtime.stream_screenshot({"session_id": session_id}))

    def test_artifact_size_limit_is_enforced(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "artifact_policy": {"max_artifact_size_bytes": 1024},
                }
            )
        )
        session_id = created.get("session_id")
        with self.assertRaises(RuntimeError):
            asyncio.run(runtime.stream_screenshot({"session_id": session_id, "size_bytes": 2048}))

    def test_malware_scan_hook_can_block_artifact(self):
        runtime = InMemoryVirtualComputerRuntime(malware_scan_hook=lambda _: {"status": "infected", "engine": "test"})
        created = asyncio.run(runtime.create_session({"runtime_choice": "virtual_browser"}))
        session_id = created.get("session_id")
        with self.assertRaises(RuntimeError):
            asyncio.run(runtime.stream_screenshot({"session_id": session_id}))

    def test_export_to_local_requires_approval(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(
            runtime.create_session(
                {
                    "runtime_choice": "virtual_browser",
                    "artifact_policy": {
                        "allow_export_to_local": True,
                        "require_export_approval": True,
                    },
                }
            )
        )
        session_id = created.get("session_id")
        streamed = asyncio.run(runtime.stream_screenshot({"session_id": session_id}))
        artifact_id = (streamed.get("artifact") or {}).get("artifact_id")

        with self.assertRaises(RuntimeError):
            asyncio.run(
                runtime.collect_artifact(
                    {
                        "session_id": session_id,
                        "artifact_id": artifact_id,
                        "export_destination": "local_computer",
                    }
                )
            )

        exported = asyncio.run(
            runtime.collect_artifact(
                    {
                        "session_id": session_id,
                        "artifact_id": artifact_id,
                        "export_destination": "local_computer",
                        "approval_id": "appr_export_1",
                        "local_gateway_approval_id": "gw_export_1",
                    }
                )
            )
        export_meta = exported.get("export") or {}
        self.assertTrue(export_meta.get("exported"))
        self.assertEqual(export_meta.get("destination"), "local_computer")

    def test_supported_artifact_types_can_be_collected(self):
        runtime = InMemoryVirtualComputerRuntime()
        created = asyncio.run(runtime.create_session({"runtime_choice": "virtual_browser"}))
        session_id = created.get("session_id")
        session = runtime._sessions[session_id]
        session["artifacts"] = [
            {"artifact_id": "a_pdf", "type": "pdf", "size_bytes": 256},
            {"artifact_id": "a_csv", "type": "csv", "size_bytes": 128},
            {"artifact_id": "a_download", "type": "downloaded_file", "size_bytes": 128},
            {"artifact_id": "a_doc", "type": "generated_document", "size_bytes": 256},
            {"artifact_id": "a_trace", "type": "browser_trace", "size_bytes": 64},
            {"artifact_id": "a_log", "type": "terminal_log", "size_bytes": 64},
        ]
        for artifact_id in ["a_pdf", "a_csv", "a_download", "a_doc", "a_trace", "a_log"]:
            result = asyncio.run(runtime.collect_artifact({"session_id": session_id, "artifact_id": artifact_id}))
            self.assertEqual((result.get("artifact") or {}).get("artifact_id"), artifact_id)


if __name__ == "__main__":
    unittest.main()
