import sys
import threading
import types
import unittest

from server_modules import runtime_runs_api
from server_modules.api_contract import ApiAgentTurnRequest


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self._register("POST", path, **kwargs)

    def delete(self, path, **kwargs):
        return self._register("DELETE", path, **kwargs)


class _FakeRequest:
    def __init__(self, payload=None, *, headers=None) -> None:
        self._payload = payload or {}
        self.headers = headers or {}

    async def json(self):
        return self._payload


class RuntimeRunsApiCanonicalRouteTests(unittest.TestCase):
    def test_register_run_routes_adds_turn_and_runs(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = {}
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = lambda run_id: {}

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        original_register = runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api
        original_refresh = runtime_runs_api._refresh_server_exports
        original_turn = runtime_runs_api.execute_canonical_agent_turn
        original_run_services = runtime_runs_api._run_execution_services
        original_direct_chat_services = runtime_runs_api._direct_chat_execution_services
        original_stream_response = runtime_runs_api.build_direct_chat_stream_response
        original_stream_services = runtime_runs_api._direct_chat_stream_response_services
        original_late_export = runtime_runs_api._late_server_export
        original_privileged = runtime_runs_api._current_user_is_privileged
        original_extract_owner = runtime_runs_api._extract_run_owner_user_id
        try:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = lambda *args, **kwargs: None
            runtime_runs_api._refresh_server_exports = lambda: fake_server
            runtime_runs_api.execute_canonical_agent_turn = self._fake_agent_turn
            runtime_runs_api._run_execution_services = lambda: "run-services"
            runtime_runs_api._direct_chat_execution_services = lambda: "chat-services"
            runtime_runs_api.build_direct_chat_stream_response = self._fake_stream_response
            runtime_runs_api._direct_chat_stream_response_services = lambda: "stream-services"
            runtime_runs_api._current_user_is_privileged = lambda current_user: False
            runtime_runs_api._extract_run_owner_user_id = lambda item: str(item.get("owner_user_id") or "")
            runtime_runs_api._late_server_export = lambda name: {
                "runs": {
                    "run-live": {
                        "run_id": "run-live",
                        "status": "running",
                        "owner_user_id": "user-1",
                        "workspace_id": "default",
                        "created_at": "2026-04-06T09:00:00Z",
                        "updated_at": "2026-04-06T10:00:00Z",
                    }
                },
                "RUN_HISTORY_LOCK": threading.Lock(),
                "RUN_HISTORY": [
                    {
                        "run_id": "run-archived",
                        "status": "completed",
                        "owner_user_id": "user-1",
                        "workspace_id": "default",
                        "created_at": "2026-04-06T08:00:00Z",
                        "updated_at": "2026-04-06T08:30:00Z",
                    }
                ],
                "_serialize_run_snapshot": lambda run_id, run: dict(run),
                "_history_item_matches": lambda item, workspace_id, status, pack_id: True,
                "_summarize_history_item": lambda item: {
                    "run_id": item.get("run_id"),
                    "status": item.get("status"),
                    "updated_at": item.get("updated_at"),
                    "created_at": item.get("created_at"),
                },
                "_parse_utc_ts": lambda value: __import__("datetime").datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None,
            }[name]

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)

            self.assertIn(("POST", "/turn"), app.routes)
            self.assertIn(("GET", "/runs"), app.routes)
            self.assertIn(("POST", "/sessions"), app.routes)
            self.assertIn(("GET", "/sessions/{session_id}"), app.routes)
            self.assertIn(("DELETE", "/sessions/{session_id}"), app.routes)

            turn_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "workspace_id": "default",
                            "session_id": "thread-1",
                            "channel": "web",
                            "actor": {"type": "user", "id": "user-1"},
                            "message": "hello",
                            "execution_mode": "durable",
                            "response_mode": "artifact",
                        }
                    ),
                    {
                        "workspace_id": "default",
                        "session_id": "thread-1",
                        "channel": "web",
                        "actor": {"type": "user", "id": "user-1"},
                        "message": "hello",
                        "execution_mode": "durable",
                        "response_mode": "artifact",
                    },
                    current_user={"user_id": "user-1"},
                )
            )
            self.assertEqual(turn_payload.status, "stream_ready")
            self.assertEqual(turn_payload.metadata["kind"], "direct_chat_stream")

            stream_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "workspace_id": "default",
                            "session_id": "thread-2",
                            "channel": "web",
                            "actor": {"type": "user", "id": "user-1"},
                            "message": "stream hello",
                        },
                        headers={"last-event-id": "evt-7"},
                    ),
                    {
                        "workspace_id": "default",
                        "session_id": "thread-2",
                        "channel": "web",
                        "actor": {"type": "user", "id": "user-1"},
                        "message": "stream hello",
                    },
                    current_user={"user_id": "user-1"},
                )
            )
            self.assertEqual(stream_payload["kind"], "stream")
            self.assertEqual(stream_payload["last_event_id"], "evt-7")
            self.assertEqual(stream_payload["services"], "stream-services")
            self.assertEqual(stream_payload["body"]["thread_id"], "thread-2")
            self.assertEqual(stream_payload["body"]["message"], "stream hello")

            legacy_stream_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "workspace_id": "default",
                            "thread_id": "legacy-thread",
                            "channel": "web",
                            "message": "legacy hello",
                            "provider": "anthropic",
                        },
                        headers={"last-event-id": "evt-8"},
                    ),
                    {
                        "workspace_id": "default",
                        "thread_id": "legacy-thread",
                        "channel": "web",
                        "message": "legacy hello",
                        "provider": "anthropic",
                    },
                    current_user={"user_id": "user-1"},
                )
            )
            self.assertEqual(legacy_stream_payload["kind"], "stream")
            self.assertEqual(legacy_stream_payload["last_event_id"], "evt-8")
            self.assertEqual(legacy_stream_payload["body"]["thread_id"], "legacy-thread")
            self.assertEqual(legacy_stream_payload["body"]["provider"], "anthropic")

            runs_payload = self._run_async(app.routes[("GET", "/runs")](current_user={"user_id": "user-1"}))
            self.assertEqual(runs_payload["count"], 2)
            self.assertEqual(runs_payload["items"][0]["source"], "live")
            self.assertEqual(runs_payload["items"][1]["source"], "history")

            original_create_session = runtime_runs_api.session_service.create_session
            original_get_session = runtime_runs_api.session_service.get_session
            original_terminate_session = runtime_runs_api.session_service.terminate_session
            try:
                runtime_runs_api.session_service.create_session = self._fake_create_session
                runtime_runs_api.session_service.get_session = self._fake_get_session
                runtime_runs_api.session_service.terminate_session = self._fake_terminate_session

                session_payload = self._run_async(
                    app.routes[("POST", "/sessions")](
                        runtime_runs_api.ApiSessionRequest(
                            workspace_id="default",
                            tenant_id="tenant-1",
                            channel="web",
                            actor={"type": "user", "id": "user-1"},
                            metadata={"source": "test"},
                        ),
                        current_user={"user_id": "user-1", "email": "user@example.com"},
                    )
                )
                self.assertEqual(session_payload.session_id, "session-created")

                fetched_session = self._run_async(
                    app.routes[("GET", "/sessions/{session_id}")](
                        "session-created",
                        current_user={"user_id": "user-1"},
                    )
                )
                self.assertEqual(fetched_session.session_id, "session-created")

                deleted_session = self._run_async(
                    app.routes[("DELETE", "/sessions/{session_id}")](
                        "session-created",
                        current_user={"user_id": "user-1"},
                    )
                )
                self.assertTrue(deleted_session["ok"])
            finally:
                runtime_runs_api.session_service.create_session = original_create_session
                runtime_runs_api.session_service.get_session = original_get_session
                runtime_runs_api.session_service.terminate_session = original_terminate_session
        finally:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = original_register
            runtime_runs_api._refresh_server_exports = original_refresh
            runtime_runs_api.execute_canonical_agent_turn = original_turn
            runtime_runs_api._run_execution_services = original_run_services
            runtime_runs_api._direct_chat_execution_services = original_direct_chat_services
            runtime_runs_api.build_direct_chat_stream_response = original_stream_response
            runtime_runs_api._direct_chat_stream_response_services = original_stream_services
            runtime_runs_api._late_server_export = original_late_export
            runtime_runs_api._current_user_is_privileged = original_privileged
            runtime_runs_api._extract_run_owner_user_id = original_extract_owner
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    async def _fake_agent_turn(self, **kwargs):
        return {
            "kind": "direct_chat_stream",
            "workspace_id": "default",
            "session_key": "session-1",
            "thread_id": "thread-1",
            "client_request_id": "req-1",
        }

    async def _fake_stream_response(self, **kwargs):
        return {
            "kind": "stream",
            "body": kwargs["body"],
            "last_event_id": kwargs["last_event_id"],
            "services": kwargs["services"],
        }

    async def _fake_create_session(self, *args, **kwargs):
        return "session-created"

    async def _fake_get_session(self, session_id):
        return {
            "session_id": session_id,
            "workspace_id": "default",
            "tenant_id": "tenant-1",
            "channel": "web",
            "actor": {"type": "user", "id": "user-1"},
            "created_at": "2026-04-06T00:00:00Z",
            "expires_at": "2026-04-07T00:00:00Z",
            "metadata": {"source": "test"},
            "status": "active",
        }

    async def _fake_terminate_session(self, session_id):
        return None

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
