import unittest
from unittest.mock import patch

from server_modules import runtime_runtime_api


class RuntimeRuntimeApiTests(unittest.TestCase):
    @patch("server_modules.local_queue.handle_get_local_workers_status")
    def test_runtime_status_payload_maps_worker_summary(self, mock_status):
        mock_status.return_value = {
            "summary": {"known": 1, "online": 1, "idle": 1, "busy": 0, "offline": 0},
            "capability_queue": {"read_write_files": ["empyralis-tauri-local"]},
            "items": [
                {
                    "runtime_id": "empyralis-tauri-local",
                    "worker_id": "empyralis-tauri-local",
                    "runtime_type": "local_companion",
                    "display_name": "Empyralis Local Worker",
                    "platform": "macos",
                    "capabilities": ["read_write_files"],
                    "execution_targets": ["local_companion"],
                    "status": "idle",
                    "online": True,
                    "current_run_id": None,
                    "last_seen_at": "2026-03-27T00:00:00Z",
                    "registered_at": "2026-03-27T00:00:00Z",
                    "session_issued_at": "2026-03-27T00:00:00Z",
                    "trust_state": "verified",
                }
            ],
        }

        payload = runtime_runtime_api.runtime_status_payload()

        self.assertEqual(payload["scope"], "local_companion_bridge")
        self.assertEqual(payload["summary"]["online"], 1)
        self.assertEqual(payload["items"][0]["runtime_id"], "empyralis-tauri-local")
        self.assertEqual(payload["items"][0]["status"], "idle")

    @patch("server_modules.runtime_runtime_api.runtime_status_payload")
    def test_legacy_local_workers_status_payload_preserves_counts(self, mock_status_payload):
        mock_status_payload.return_value = {
            "scope": "local_companion_bridge",
            "summary": {"known": 2, "online": 1, "idle": 1, "busy": 0, "offline": 1},
            "capability_queue": {},
            "items": [{"runtime_id": "empyralis-tauri-local"}],
        }

        payload = runtime_runtime_api.legacy_local_workers_status_payload()

        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["known"], 2)
        self.assertEqual(payload["online_workers"], 1)
        self.assertEqual(payload["offline"], 1)


if __name__ == "__main__":
    unittest.main()
