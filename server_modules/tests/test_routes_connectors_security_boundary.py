from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.routing import APIRoute
from starlette.requests import Request

from server_modules import routes_connectors


def _api_routes() -> list[APIRoute]:
    return [route for route in routes_connectors.router.routes if isinstance(route, APIRoute)]


def _route_dependencies(path: str) -> list[str]:
    for route in _api_routes():
        if route.path == path:
            return [getattr(dep.call, "__name__", str(dep.call)) for dep in route.dependant.dependencies]
    raise AssertionError(f"Route {path} not found.")


class ConnectorRouteSecurityBoundaryTests(unittest.TestCase):
    def test_only_verified_connector_webhook_routes_are_public(self) -> None:
        public_paths = {
            route.path
            for route in _api_routes()
            if route.path.startswith(("/channels", "/connectors")) and not route.dependant.dependencies
        }
        self.assertEqual(
            public_paths,
            {
                "/channels/telegram/webhook/{connector_id}",
                "/channels/whatsapp/twilio/webhook",
                "/channels/slack/events",
                "/channels/github/webhook",
                "/connectors/discord/webhook",
            },
        )

    def test_operational_autopilot_routes_remain_backend_authenticated(self) -> None:
        self.assertIn("require_api_key", _route_dependencies("/channels/telegram/autopilot/status"))
        self.assertIn("require_api_key", _route_dependencies("/channels/whatsapp/autopilot/status"))
        self.assertIn("require_api_key", _route_dependencies("/channels/autopilot/profiles"))

    def test_provider_catalog_route_enforces_workspace_access(self) -> None:
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/providers",
                "query_string": b"workspace_id=finance",
                "headers": [],
            }
        )
        current_user = {"workspace_ids": {"finance"}, "workspace_roles": {"finance": "owner"}}
        with patch.object(routes_connectors, "enforce_workspace_access", return_value="finance") as enforce_mock, patch.object(
            routes_connectors.core,
            "list_providers",
            new=AsyncMock(return_value={"providers": []}),
        ) as list_mock:
            result = asyncio.run(routes_connectors.providers_catalog(request, current_user=current_user))

        enforce_mock.assert_called_once_with(
            current_user,
            "finance",
            minimum_role="member",
        )
        list_mock.assert_awaited_once_with(workspace_id="finance")
        self.assertEqual(result, {"providers": []})

    def test_provider_model_catalog_route_enforces_member_workspace_access(self) -> None:
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/providers/catalog",
                "query_string": b"workspace_id=finance",
                "headers": [],
            }
        )
        current_user = {"workspace_ids": {"finance"}, "workspace_roles": {"finance": "member"}}
        with patch.object(routes_connectors, "enforce_workspace_access", return_value="finance") as enforce_mock, patch.object(
            routes_connectors.provider_catalog_service,
            "list_workspace_provider_catalog",
            new=AsyncMock(return_value={"providers": []}),
        ) as list_mock:
            result = asyncio.run(routes_connectors.providers_model_catalog(request, current_user=current_user))

        enforce_mock.assert_called_once_with(
            current_user,
            "finance",
            minimum_role="member",
        )
        list_mock.assert_awaited_once_with(workspace_id="finance")
        self.assertEqual(result, {"providers": []})


if __name__ == "__main__":
    unittest.main()
