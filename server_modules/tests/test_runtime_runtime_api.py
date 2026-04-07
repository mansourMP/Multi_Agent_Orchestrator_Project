import unittest
from unittest.mock import patch

from server_modules import runtime_runtime_api


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def post(self, path, **kwargs):
        return self._register("POST", path, **kwargs)

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)

    def delete(self, path, **kwargs):
        return self._register("DELETE", path, **kwargs)


class RuntimeRuntimeApiTests(unittest.TestCase):
    @patch("server_modules.local_queue.handle_get_local_workers_status")
    def test_runtime_status_payload_maps_worker_summary(self, mock_status):
        mock_status.return_value = {
            "summary": {"known": 1, "online": 1, "idle": 1, "busy": 0, "offline": 0},
            "capability_queue": {"read_write_files": ["empyralis-tauri-local"]},
            "items": [
                {
                    "machine_id": "empyralis-tauri-local",
                    "runtime_id": "empyralis-tauri-local",
                    "worker_id": "empyralis-tauri-local",
                    "runtime_type": "local_companion",
                    "display_name": "Empyralis Local Worker",
                    "platform": "macos",
                    "policy_mode": "trusted_full_access",
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
        self.assertEqual(payload["items"][0]["machine_id"], "empyralis-tauri-local")
        self.assertEqual(payload["items"][0]["runtime_id"], "empyralis-tauri-local")
        self.assertEqual(payload["items"][0]["status"], "idle")
        self.assertEqual(payload["items"][0]["policy_mode"], "trusted_full_access")
        self.assertIsNone(payload["items"][0]["current_lease_holder"])

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

    @patch("server_modules.local_queue.handle_enroll_local_runtime")
    def test_register_runtime_routes_exposes_machine_enroll(self, mock_enroll):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_enroll.return_value = {"ok": True, "machine_id": "machine-1"}
        handler = app.routes[("POST", "/machines/enroll")]

        result = self._run_async(handler(runtime_runtime_api.MachineEnrollPayload(display_name="Machine 1")))

        self.assertEqual(result["machine_id"], "machine-1")
        mock_enroll.assert_called_once()

    @patch("server_modules.local_queue.handle_delete_local_runtime")
    def test_register_runtime_routes_exposes_machine_delete(self, mock_delete):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_delete.return_value = {"ok": True, "machine_id": "machine-1", "deleted": True}
        handler = app.routes[("DELETE", "/machines/{machine_id}")]

        result = self._run_async(handler("machine-1"))

        self.assertTrue(result["deleted"])
        mock_delete.assert_called_once_with("machine-1")

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
