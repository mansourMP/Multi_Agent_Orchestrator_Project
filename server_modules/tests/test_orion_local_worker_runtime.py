import importlib.util
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch


def _load_module():
    module_path = Path(__file__).resolve().parents[2] / "scripts" / "orion_local_worker_runtime.py"
    spec = importlib.util.spec_from_file_location("test_orion_local_worker_runtime_module", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


worker_runtime = _load_module()


class LocalWorkerRuntimeClientTests(TestCase):
    def _client(self):
        client = worker_runtime.RuntimeClient(base_url="http://runtime", api_key="key")
        client.runtime_session_token = "stale-session"
        client.runtime_instance_id = "old-instance"
        client._registration = {
            "runtime_id": "worker-1",
            "runtime_type": "local",
            "display_name": "Worker",
            "platform": "darwin",
            "capabilities": [],
            "execution_targets": ["local"],
            "instance_id": "old-instance",
        }
        return client

    def test_heartbeat_worker_retry_uses_new_session_token(self):
        client = self._client()
        captured = []

        def fake_request(method, primary_path, fallback_path, payload=None):
            captured.append(payload)
            if len(captured) == 1:
                raise worker_runtime.ApiRequestError("stale", status_code=401)
            return {"ok": True}

        def fake_register(*args, **kwargs):
            client.runtime_session_token = "fresh-session"
            client.runtime_instance_id = "fresh-instance"
            return {"ok": True}

        with (
            patch.object(client, "_request_with_fallback", side_effect=fake_request),
            patch.object(client, "register_runtime", side_effect=fake_register),
        ):
            client.heartbeat_worker("worker-1", "run-1", "busy")

        self.assertEqual(captured[0]["session_token"], "stale-session")
        self.assertEqual(captured[1]["session_token"], "fresh-session")
        self.assertEqual(captured[1]["instance_id"], "fresh-instance")

    def test_complete_run_retry_uses_new_session_token(self):
        client = self._client()
        captured = []

        def fake_request(method, primary_path, fallback_path, payload=None):
            captured.append(payload)
            if len(captured) == 1:
                raise worker_runtime.ApiRequestError("stale", status_code=401)
            return {"ok": True}

        def fake_register(*args, **kwargs):
            client.runtime_session_token = "fresh-session"
            client.runtime_instance_id = "fresh-instance"
            return {"ok": True}

        with (
            patch.object(client, "_request_with_fallback", side_effect=fake_request),
            patch.object(client, "register_runtime", side_effect=fake_register),
        ):
            client.complete_run("run-1", "worker-1", "done", result_data={"ok": True})

        self.assertEqual(captured[0]["session_token"], "stale-session")
        self.assertEqual(captured[1]["session_token"], "fresh-session")
        self.assertEqual(captured[1]["instance_id"], "fresh-instance")

    def test_pause_run_retry_uses_new_session_token(self):
        client = self._client()
        captured = []

        def fake_request(method, path, payload=None):
            captured.append(payload)
            if len(captured) == 1:
                raise worker_runtime.ApiRequestError("stale", status_code=401)
            return {"ok": True}

        def fake_register(*args, **kwargs):
            client.runtime_session_token = "fresh-session"
            client.runtime_instance_id = "fresh-instance"
            return {"ok": True}

        with (
            patch.object(client, "_request", side_effect=fake_request),
            patch.object(client, "register_runtime", side_effect=fake_register),
        ):
            client.pause_run("run-1", "worker-1", "paused", browser_checkpoint={"next_action_index": 2})

        self.assertEqual(captured[0]["session_token"], "stale-session")
        self.assertEqual(captured[1]["session_token"], "fresh-session")
        self.assertEqual(captured[1]["instance_id"], "fresh-instance")

    def test_register_runtime_sends_policy_mode(self):
        client = self._client()
        captured = {}

        def fake_request(method, path, payload=None):
            captured["payload"] = payload
            return {"ok": True, "session_token": "fresh", "instance_id": "instance"}

        with patch.object(client, "_request", side_effect=fake_request):
            client.register_runtime(
                "worker-1",
                display_name="Worker",
                platform="darwin",
                policy_mode="trusted_full_access",
                execution_targets=["local"],
            )

        self.assertEqual(captured["payload"]["policy_mode"], "trusted_full_access")
