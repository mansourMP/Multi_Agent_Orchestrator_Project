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


class _FakeEventSourceResponse:
    def __init__(self, iterator, ping):
        self.iterator = iterator
        self.ping = ping


class RuntimeRuntimeApiTests(unittest.TestCase):
    @staticmethod
    def _current_user(**overrides):
        current_user = {
            "auth_type": "api_key",
            "role": "owner",
            "is_admin": True,
            "user_id": "owner-1",
            "workspace_access": {
                "default": {
                    "workspace_id": "default",
                    "tenant_id": "default",
                    "role": "owner",
                    "tenant_role": "owner",
                }
            },
        }
        current_user.update(overrides)
        return current_user

    @patch("server_modules.outbox_service.get_outbox_delivery_status")
    @patch("server_modules.local_queue.handle_get_local_workers_status")
    def test_runtime_status_payload_maps_worker_summary(self, mock_status, mock_outbox_status):
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
                    "permission_probe": {"screen_recording": {"status": "granted", "source": "probe"}},
                    "control_state": "active",
                    "safe_mode_status": {"active": False},
                    "kill_switch_status": {"active": False},
                }
            ],
        }
        mock_outbox_status.return_value = {"undelivered_count": 2, "total_retry_count": 1}

        payload = runtime_runtime_api.runtime_status_payload()

        self.assertEqual(payload["scope"], "local_companion_bridge")
        self.assertEqual(payload["summary"]["online"], 1)
        self.assertEqual(payload["outbox"]["undelivered_count"], 2)
        self.assertEqual(payload["items"][0]["machine_id"], "empyralis-tauri-local")
        self.assertEqual(payload["items"][0]["runtime_id"], "empyralis-tauri-local")
        self.assertEqual(payload["items"][0]["status"], "idle")
        self.assertEqual(payload["items"][0]["policy_mode"], "trusted_full_access")
        self.assertIsNone(payload["items"][0]["current_lease_holder"])
        self.assertEqual(payload["items"][0]["permission_probe"]["screen_recording"]["status"], "granted")
        self.assertEqual(payload["items"][0]["control_state"], "active")

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

    @patch("server_modules.runtime_runtime_api.telemetry.get_reliability_snapshot")
    @patch("server_modules.runtime_runtime_api.outbox_service.get_outbox_delivery_status")
    @patch("server_modules.runtime_runtime_api._recent_failed_run_snapshots")
    def test_runtime_reliability_payload_combines_snapshot_and_outbox(self, mock_failed_runs, mock_outbox_status, mock_snapshot):
        mock_failed_runs.return_value = [{"run_id": "run-1", "status": "failed"}]
        mock_outbox_status.return_value = {"undelivered_count": 1}
        mock_snapshot.return_value = {"generated_at": "2026-04-08T00:00:00Z", "control_plane_api": {"request_count": 1}}

        payload = runtime_runtime_api.runtime_reliability_payload()

        self.assertEqual(payload["outbox"]["undelivered_count"], 1)
        self.assertEqual(payload["control_plane_api"]["request_count"], 1)
        mock_snapshot.assert_called_once()

    @patch("server_modules.local_queue.handle_enroll_local_runtime")
    @patch("server_modules.runtime_runtime_api.grant_workspace_owner_machine_trust")
    def test_register_runtime_routes_exposes_machine_enroll(self, mock_grant_trust, mock_enroll):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_enroll.return_value = {"ok": True, "machine_id": "machine-1"}
        handler = app.routes[("POST", "/machines/enroll")]

        result = self._run_async(
            handler(
                runtime_runtime_api.MachineEnrollPayload(display_name="Machine 1", workspace_id="default"),
                current_user=self._current_user(),
            )
        )

        self.assertEqual(result["machine_id"], "machine-1")
        self.assertEqual(mock_enroll.call_args.kwargs["tenant_id"], "default")
        self.assertEqual(mock_enroll.call_args.kwargs["workspace_id"], "default")
        self.assertEqual(mock_enroll.call_args.kwargs["machine_enrollment_scope"], "workspace")
        mock_grant_trust.assert_called_once_with("default", "machine-1")

    @patch("server_modules.runtime_runtime_api.runtime_reliability_payload")
    def test_register_runtime_routes_exposes_runtime_reliability(self, mock_reliability_payload):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_reliability_payload.return_value = {"generated_at": "2026-04-08T00:00:00Z", "control_plane_api": {"request_count": 2}}
        handler = app.routes[("GET", "/runtime/runtimes/reliability")]

        result = self._run_async(handler())

        self.assertEqual(result["control_plane_api"]["request_count"], 2)
        mock_reliability_payload.assert_called_once()

    @patch("server_modules.local_queue.create_machine_enrollment_intent")
    @patch("server_modules.runtime_runtime_api.grant_workspace_owner_machine_trust")
    def test_register_runtime_routes_exposes_machine_enrollment_intent(self, mock_grant_trust, mock_create_intent):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_create_intent.return_value = {"ok": True, "machine_id": "machine-1", "token": "tok"}
        handler = app.routes[("POST", "/machines/enrollment-intents")]

        result = self._run_async(
            handler(
                runtime_runtime_api.MachineEnrollPayload(display_name="Machine 1", workspace_id="default"),
                current_user=self._current_user(),
            )
        )

        self.assertEqual(result["machine_id"], "machine-1")
        self.assertEqual(mock_create_intent.call_args.kwargs["tenant_id"], "default")
        self.assertEqual(mock_create_intent.call_args.kwargs["workspace_id"], "default")
        self.assertEqual(mock_create_intent.call_args.kwargs["machine_enrollment_scope"], "workspace")
        mock_grant_trust.assert_called_once_with("default", "machine-1")

    @patch("server_modules.local_queue.complete_machine_bootstrap")
    def test_register_runtime_routes_exposes_machine_bootstrap_complete(self, mock_complete):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_complete.return_value = {"ok": True, "machine_id": "machine-1"}
        handler = app.routes[("POST", "/machines/{machine_id}/bootstrap-complete")]

        result = self._run_async(handler("machine-1", runtime_runtime_api.MachineBootstrapCompletePayload(enrollment_token="tok")))

        self.assertEqual(result["machine_id"], "machine-1")
        mock_complete.assert_called_once_with("machine-1", enrollment_token="tok")

    @patch("server_modules.local_queue.handle_heartbeat_local_run")
    @patch("server_modules.local_queue._assert_runtime_session")
    def test_runtime_task_heartbeat_forwards_structured_event(self, mock_assert_session, mock_heartbeat):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_heartbeat.return_value = {"last_heartbeat_at": "2026-04-07T00:00:00Z"}
        handler = app.routes[("POST", "/runtime/tasks/{task_id}/heartbeat")]

        result = self._run_async(
            handler(
                runtime_runtime_api.uuid.UUID("00000000-0000-0000-0000-000000000001"),
                runtime_runtime_api.RuntimeTaskHeartbeatPayload(
                    runtime_id="worker-1",
                    session_token="sess",
                    instance_id="inst",
                    note="Step 1",
                    event={"event": "computer_action", "message": "Step 1", "data": {"label": "Clicking search field"}},
                ),
            )
        )

        self.assertEqual(result["task_id"], "00000000-0000-0000-0000-000000000001")
        payload = mock_heartbeat.call_args.args[1]
        self.assertEqual(payload.event["event"], "computer_action")
        self.assertEqual(payload.event["data"]["label"], "Clicking search field")
        mock_assert_session.assert_called_once()

    @patch("server_modules.local_queue.handle_get_local_run_control_state")
    @patch("server_modules.local_queue._assert_runtime_session")
    def test_runtime_task_control_state_route_forwards_runtime_session(self, mock_assert_session, mock_control_state):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_control_state.return_value = {"status": "waiting_for_input", "pause_requested": True, "manual_takeover": True}
        handler = app.routes[("POST", "/runtime/tasks/{task_id}/control-state")]

        result = self._run_async(
            handler(
                runtime_runtime_api.uuid.UUID("00000000-0000-0000-0000-000000000001"),
                runtime_runtime_api.RuntimeTaskControlStatePayload(
                    runtime_id="worker-1",
                    session_token="sess",
                    instance_id="inst",
                ),
            )
        )

        self.assertTrue(result["pause_requested"])
        self.assertTrue(result["manual_takeover"])
        mock_assert_session.assert_called_once()
        payload = mock_control_state.call_args.args[1]
        self.assertEqual(payload.worker_id, "worker-1")

    @patch("server_modules.local_queue.handle_delete_local_runtime")
    @patch("server_modules.runtime_runtime_api.local_queue.handle_get_local_workers_status")
    @patch("server_modules.runtime_runtime_api.revoke_workspace_owner_machine_trust")
    def test_register_runtime_routes_exposes_machine_delete(self, mock_revoke_trust, mock_status, mock_delete):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_delete.return_value = {"ok": True, "machine_id": "machine-1", "revoked": True, "deleted": False}
        mock_status.return_value = {
            "items": [{"machine_id": "machine-1", "tenant_id": "default", "workspace_id": "default"}],
            "summary": {},
        }
        handler = app.routes[("DELETE", "/machines/{machine_id}")]

        result = self._run_async(handler("machine-1", current_user=self._current_user()))

        self.assertTrue(result["revoked"])
        mock_delete.assert_called_once_with("machine-1")
        mock_revoke_trust.assert_called_once_with("default", "machine-1")

    @patch("server_modules.local_queue.handle_set_local_runtime_control")
    @patch("server_modules.runtime_runtime_api.local_queue.handle_get_local_workers_status")
    def test_register_runtime_routes_exposes_machine_suspend(self, mock_status, mock_control):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_control.return_value = {"ok": True, "machine_id": "machine-1", "action": "suspend"}
        mock_status.return_value = {
            "items": [{"machine_id": "machine-1", "tenant_id": "default", "workspace_id": "default"}],
            "summary": {},
        }
        handler = app.routes[("POST", "/machines/{machine_id}/suspend")]

        result = self._run_async(
            handler(
                "machine-1",
                runtime_runtime_api.MachineControlPayload(reason="Maintenance"),
                current_user=self._current_user(),
            )
        )

        self.assertEqual(result["action"], "suspend")
        mock_control.assert_called_once_with("machine-1", action="suspend", reason="Maintenance")

    @patch("server_modules.local_queue.handle_set_local_runtime_control")
    @patch("server_modules.runtime_runtime_api.local_queue.handle_get_local_workers_status")
    def test_register_runtime_routes_exposes_machine_resume(self, mock_status, mock_control):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_control.return_value = {"ok": True, "machine_id": "machine-1", "action": "resume"}
        mock_status.return_value = {
            "items": [{"machine_id": "machine-1", "tenant_id": "default", "workspace_id": "default"}],
            "summary": {},
        }
        handler = app.routes[("POST", "/machines/{machine_id}/resume")]

        result = self._run_async(
            handler(
                "machine-1",
                runtime_runtime_api.MachineControlPayload(reason="Recovered"),
                current_user=self._current_user(),
            )
        )

        self.assertEqual(result["action"], "resume")
        mock_control.assert_called_once_with("machine-1", action="resume", reason="Recovered")

    @patch("server_modules.local_queue.handle_request_local_runtime_hard_kill")
    @patch("server_modules.runtime_runtime_api.local_queue.handle_get_local_workers_status")
    def test_register_runtime_routes_exposes_machine_hard_kill(self, mock_status, mock_hard_kill):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_hard_kill.return_value = {"ok": True, "machine_id": "machine-1", "event": {"event": "hard_kill"}}
        mock_status.return_value = {
            "items": [{"machine_id": "machine-1", "tenant_id": "default", "workspace_id": "default"}],
            "summary": {},
        }
        handler = app.routes[("POST", "/machines/{machine_id}/hard-kill")]

        result = self._run_async(
            handler(
                "machine-1",
                runtime_runtime_api.MachineControlPayload(reason="Operator stop"),
                current_user=self._current_user(),
            )
        )

        self.assertEqual(result["machine_id"], "machine-1")
        mock_hard_kill.assert_called_once_with("machine-1", reason="Operator stop", requested_by="owner-1")

    @patch("server_modules.local_queue.handle_request_local_run_hard_kill")
    def test_register_runtime_routes_exposes_run_hard_kill(self, mock_hard_kill):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        mock_hard_kill.return_value = {"ok": True, "run_id": "00000000-0000-0000-0000-000000000001"}
        original_server = getattr(runtime_runtime_api.local_queue, "_server", None)
        try:
            runtime_runtime_api.local_queue._server = type(
                "_FakeServer",
                (),
                {
                    "runs": {
                        "00000000-0000-0000-0000-000000000001": {
                            "context": {"workspace_id": "default", "tenant_id": "default", "metadata": {}}
                        }
                    }
                },
            )()
            with patch.object(runtime_runtime_api.local_queue, "_init", return_value=None):
                handler = app.routes[("POST", "/runs/{run_id}/hard-kill")]
                result = self._run_async(
                    handler(
                        runtime_runtime_api.uuid.UUID("00000000-0000-0000-0000-000000000001"),
                        runtime_runtime_api.MachineControlPayload(reason="Operator stop"),
                        current_user=self._current_user(),
                    )
                )
        finally:
            runtime_runtime_api.local_queue._server = original_server

        self.assertEqual(result["run_id"], "00000000-0000-0000-0000-000000000001")
        mock_hard_kill.assert_called_once_with(
            "00000000-0000-0000-0000-000000000001",
            reason="Operator stop",
            requested_by="owner-1",
        )

    @patch("server_modules.runtime_runtime_api.EventSourceResponse", side_effect=lambda iterator, ping: _FakeEventSourceResponse(iterator, ping))
    @patch("server_modules.local_queue.iter_runtime_control_stream")
    @patch("server_modules.local_queue._assert_runtime_session")
    def test_runtime_control_stream_route_forwards_runtime_session(self, mock_assert_session, mock_iter_stream, _mock_event_source):
        app = _FakeApp()
        runtime_runtime_api.register_runtime_routes(app)
        stream_marker = iter([{"event": "hard_kill"}])
        mock_iter_stream.return_value = stream_marker
        handler = app.routes[("GET", "/runtime/runtimes/{runtime_id}/control/stream")]

        result = self._run_async(
            handler(
                "worker-1",
                session_token="sess",
                instance_id="inst",
                since_sequence=4,
                include_backlog=True,
                heartbeat_seconds=4.0,
                timeout_seconds=12.0,
            )
        )

        self.assertIsInstance(result, _FakeEventSourceResponse)
        self.assertEqual(result.iterator, stream_marker)
        self.assertEqual(result.ping, 4)
        mock_assert_session.assert_called_once_with("worker-1", "sess", instance_id="inst")
        mock_iter_stream.assert_called_once()
        kwargs = mock_iter_stream.call_args.kwargs
        self.assertEqual(kwargs["since_sequence"], 4)
        self.assertTrue(kwargs["include_backlog"])

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
