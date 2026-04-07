import sys
import threading
import types
import unittest

from server_modules import runtime_events_api


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


class _FakeEventSourceResponse:
    def __init__(self, iterator, ping):
        self.iterator = iterator
        self.ping = ping


class RuntimeEventsApiTests(unittest.TestCase):
    def test_register_inbox_routes_adds_notifications_alias(self):
        fake_server = types.ModuleType("server")
        fake_server.Depends = lambda dependency: dependency
        fake_server.require_api_key = object()
        fake_server.EventSourceResponse = _FakeEventSourceResponse
        fake_server.Optional = __import__("typing").Optional
        fake_server.HTTPException = RuntimeError
        fake_server.CHANNEL_EVENTS = [
            {
                "id": "evt-1",
                "tenant_id": "default",
                "workspace_id": "default",
                "channel": "telegram",
                "session_key": "chat-1",
                "direction": "inbound",
                "action": "run",
                "run_id": "run-1",
                "trace_id": "trace-1",
            }
        ]
        fake_server.CHANNEL_EVENTS_LOCK = threading.Lock()
        fake_server.ORION_CHANNEL_SESSIONS_LIMIT = 50
        fake_server.ORION_CHANNEL_DEAD_LETTER_FILE = "dead_letters.json"
        fake_server.ORION_CHANNEL_DEAD_LETTER_LIMIT = 10
        fake_server._safe_read_json = lambda path, fallback: fallback
        fake_server._normalize_workspace_id = lambda value: str(value or "default").strip() or "default"
        fake_server._channel_event_matches = lambda item, **kwargs: (
            not kwargs.get("workspace_id") or str(item.get("workspace_id") or "") == str(kwargs["workspace_id"])
        )
        fake_server._summarize_channel_sessions = lambda items, limit=None: [{"session_key": "chat-1"}]
        fake_server._iter_channel_events_stream = lambda **kwargs: iter([{"id": "evt-1"}])
        current_user = {"auth_type": "api_key", "is_admin": False}

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            runtime_events_api.register_inbox_routes(app)

            self.assertIn(("GET", "/notifications"), app.routes)
            self.assertIn(("POST", "/notifications"), app.routes)
            payload = self._run_async(
                app.routes[("GET", "/notifications")](
                    tenant_id="default",
                    workspace_id="default",
                    current_user=current_user,
                )
            )
            self.assertEqual(payload["count"], 1)
            self.assertEqual(payload["session_count"], 1)
            self.assertIsNone(payload["items"][0].get("read_at"))

            marked = self._run_async(
                app.routes[("POST", "/notifications")](
                    {
                        "notification_ids": ["evt-1"],
                        "tenant_id": "default",
                        "workspace_id": "default",
                    },
                    current_user=current_user,
                )
            )
            self.assertEqual(marked["marked_count"], 1)

            next_payload = self._run_async(
                app.routes[("GET", "/notifications")](
                    tenant_id="default",
                    workspace_id="default",
                    current_user=current_user,
                )
            )
            self.assertTrue(bool(next_payload["items"][0].get("read_at")))

            stream_payload = self._run_async(
                app.routes[("GET", "/notifications")](
                    tenant_id="default",
                    workspace_id="default",
                    stream=True,
                    current_user=current_user,
                )
            )
            self.assertIsInstance(stream_payload, _FakeEventSourceResponse)
            self.assertEqual(stream_payload.ping, 5)
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
