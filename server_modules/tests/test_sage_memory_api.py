import asyncio
import sys
import types
import unittest
from unittest.mock import patch

from server_modules import sage_memory_api


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

    def patch(self, path, **kwargs):
        return self._register("PATCH", path, **kwargs)

    def delete(self, path, **kwargs):
        return self._register("DELETE", path, **kwargs)


class SageMemoryApiTests(unittest.TestCase):
    def test_list_route_enforces_workspace_and_returns_payload(self):
        fake_server = types.ModuleType("server")
        fake_server.Depends = lambda dependency: dependency
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            sage_memory_api.register_sage_memory_routes(app)
            route = app.routes[("GET", "/api/sage-memory")]
            with (
                patch("server_modules.sage_memory_api.enforce_workspace_access", return_value="workspace-1"),
                patch("server_modules.sage_memory_api.workspace_tenant_id", return_value="tenant-1"),
                patch(
                    "server_modules.sage_memory_api.list_sage_memory",
                    return_value={"items": [{"id": "memory-1"}], "categories": [], "summary": {}, "updated_at": "2026-04-15T00:00:00Z"},
                ),
            ):
                payload = asyncio.run(route(workspace_id="workspace-1", current_user={"user_id": "user-1"}))
            self.assertEqual(payload["workspace_id"], "workspace-1")
            self.assertEqual(payload["tenant_id"], "tenant-1")
            self.assertEqual(payload["items"][0]["id"], "memory-1")
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    def test_create_route_passes_category_and_actor(self):
        fake_server = types.ModuleType("server")
        fake_server.Depends = lambda dependency: dependency
        fake_server.require_api_key = object()

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        try:
            app = _FakeApp()
            sage_memory_api.register_sage_memory_routes(app)
            route = app.routes[("POST", "/api/sage-memory/entries")]
            with (
                patch("server_modules.sage_memory_api.enforce_workspace_access", return_value="workspace-1"),
                patch("server_modules.sage_memory_api.workspace_tenant_id", return_value="tenant-1"),
                patch(
                    "server_modules.sage_memory_api.upsert_memory_entry",
                    return_value={"entry": {"id": "memory-1"}, "items": [], "categories": [], "summary": {}},
                ) as upsert_mock,
            ):
                payload = asyncio.run(
                    route(
                        sage_memory_api.SageMemoryEntryCreateRequest(
                            workspace_id="workspace-1",
                            category="personal_context",
                            title="Timezone",
                            content="Uses Asia/Shanghai.",
                            pinned=True,
                        ),
                        current_user={"user_id": "user-1"},
                    )
                )
            self.assertEqual(payload["workspace_id"], "workspace-1")
            self.assertEqual(upsert_mock.call_args.kwargs["category"], "personal_context")
            self.assertEqual(upsert_mock.call_args.kwargs["actor_user_id"], "user-1")
        finally:
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server


if __name__ == "__main__":
    unittest.main()
