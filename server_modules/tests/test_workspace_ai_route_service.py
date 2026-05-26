from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from server_modules import workspace_ai_route_service as service


def _catalog(*, hosted: bool = True, providers: list[dict] | None = None) -> dict:
    return {
        "workspace_id": "ws-1",
        "hosted_ai_enabled": hosted,
        "hosted_sage_ai": {
            "allowed": hosted,
            "monthly_cap_usd": 20.0,
            "monthly_cost_usd": 3.5,
            "monthly_remaining_usd": 16.5,
            "remaining_credits": 16500,
        },
        "providers": providers or [],
    }


def _profile(
    provider: str,
    *,
    profile_id: str | None = None,
    explicit: bool = False,
    credential_id: str = "cred_123456",
    auth_mode: str = "api_key",
    model: str | None = "default-model",
) -> dict:
    return {
        "id": profile_id or f"profile-{provider}",
        "provider": provider,
        "label": provider.title(),
        "credential_id": credential_id,
        "auth_mode": auth_mode,
        "priority": 10 if explicit else 100,
        "enabled": True,
        "model": model,
        "metadata": {
            "chat_model_selection": "explicit" if explicit else "default",
        },
    }


class WorkspaceAiRouteServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_model_defaults_to_hosted_workspace_ai(self) -> None:
        with patch.object(
            service.provider_catalog_service,
            "list_workspace_provider_catalog",
            AsyncMock(return_value=_catalog(hosted=True)),
        ), patch.object(
            service.connectors_core,
            "list_provider_profiles",
            AsyncMock(return_value={"items": []}),
        ):
            payload = await service.build_workspace_ai_route_payload("ws-1")

        self.assertEqual(payload["workspaceDefault"]["kind"], "empyralis_managed")
        self.assertEqual(payload["workspaceDefault"]["modelPreset"], "light")
        self.assertEqual(payload["usedBy"][0]["detail"], "Workspace default")
        self.assertEqual(payload["budgets"]["remainingCredits"], 16500)

    async def test_read_model_selects_user_api_key_profile(self) -> None:
        provider = {
            "id": "openai",
            "label": "OpenAI",
            "usable": True,
            "configured": True,
            "state": "active",
            "credential_plane": "workspace_connection",
            "default_model": "gpt-4.1",
            "provider_scopes": ["sage_personal"],
        }
        with patch.object(
            service.provider_catalog_service,
            "list_workspace_provider_catalog",
            AsyncMock(return_value=_catalog(providers=[provider])),
        ), patch.object(
            service.connectors_core,
            "list_provider_profiles",
            AsyncMock(return_value={"items": [_profile("openai", explicit=True, model="gpt-4.1")]}),
        ):
            payload = await service.build_workspace_ai_route_payload("ws-1")

        self.assertEqual(payload["workspaceDefault"]["kind"], "user_api_key")
        self.assertEqual(payload["workspaceDefault"]["providerId"], "openai")
        self.assertEqual(payload["workspaceDefault"]["modelId"], "gpt-4.1")

    async def test_read_model_selects_local_model_profile(self) -> None:
        provider = {
            "id": "ollama",
            "label": "Ollama",
            "usable": True,
            "configured": True,
            "state": "active",
            "credential_plane": "local_runtime",
            "default_model": "llama3.2",
            "provider_scopes": ["local_only", "sage_personal"],
            "local_only": True,
        }
        with patch.object(
            service.provider_catalog_service,
            "list_workspace_provider_catalog",
            AsyncMock(return_value=_catalog(providers=[provider])),
        ), patch.object(
            service.connectors_core,
            "list_provider_profiles",
            AsyncMock(return_value={
                "items": [
                    _profile(
                        "ollama",
                        explicit=True,
                        credential_id="",
                        auth_mode="none",
                        model="llama3.2",
                    )
                ],
            }),
        ):
            payload = await service.build_workspace_ai_route_payload("ws-1")

        self.assertEqual(payload["workspaceDefault"]["kind"], "local_model")
        self.assertEqual(payload["workspaceDefault"]["runtimeTarget"], "This Device")

    async def test_read_model_reports_setup_required_when_no_route_exists(self) -> None:
        with patch.object(
            service.provider_catalog_service,
            "list_workspace_provider_catalog",
            AsyncMock(return_value=_catalog(hosted=False, providers=[])),
        ), patch.object(
            service.connectors_core,
            "list_provider_profiles",
            AsyncMock(return_value={"items": []}),
        ):
            payload = await service.build_workspace_ai_route_payload("ws-1")

        self.assertEqual(payload["workspaceDefault"]["status"], "setup_required")
        self.assertFalse(payload["workspaceDefault"]["enabled"])

    async def test_update_marks_one_provider_explicit_and_others_default(self) -> None:
        profiles = [
            _profile("openai", profile_id="profile-openai", explicit=False, model="gpt-4.1"),
            _profile("gemini", profile_id="profile-gemini", explicit=True, model="gemini-2.5-flash"),
        ]
        upserts = []

        async def fake_upsert(body):
            upserts.append(body)
            return {"item": {"id": body.id, "provider": body.provider, "metadata": body.metadata}}

        with patch.object(
            service.connectors_core,
            "list_provider_profiles",
            AsyncMock(return_value={"items": profiles}),
        ), patch.object(
            service.connectors_core,
            "upsert_provider_profile",
            side_effect=fake_upsert,
        ), patch.object(
            service,
            "build_workspace_ai_route_payload",
            AsyncMock(return_value={"workspaceId": "ws-1"}),
        ):
            await service.update_workspace_default_ai_route(
                workspace_id="ws-1",
                provider="openai",
                kind="user_api_key",
                model="gpt-4.1",
            )

        by_provider = {body.provider: body for body in upserts}
        self.assertEqual(by_provider["openai"].metadata["chat_model_selection"], "explicit")
        self.assertEqual(by_provider["gemini"].metadata["chat_model_selection"], "default")
        self.assertEqual(
            sum(1 for body in upserts if body.metadata["chat_model_selection"] == "explicit"),
            1,
        )

    async def test_personal_subscription_route_is_not_supported(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await service.update_workspace_default_ai_route(
                workspace_id="ws-1",
                route_id="subscription_passthrough:chatgpt",
            )

        self.assertEqual(raised.exception.status_code, 400)

    async def test_personal_subscription_providers_are_not_normal_available_routes(self) -> None:
        providers = [
            {
                "id": "anthropic",
                "label": "Anthropic",
                "usable": True,
                "configured": True,
                "state": "active",
                "credential_plane": "local_runtime",
                "default_auth_mode": "local_cli",
                "runtime_active_source": "claude_code_cli",
                "default_model": "claude-sonnet-4-6",
                "provider_scopes": ["sage_personal"],
            },
            {
                "id": "ollama",
                "label": "Ollama",
                "usable": True,
                "configured": True,
                "state": "active",
                "credential_plane": "local_runtime",
                "default_auth_mode": "none",
                "default_model": "llama3.2",
                "provider_scopes": ["local_only", "sage_personal"],
                "local_only": True,
            },
        ]
        with patch.object(
            service.provider_catalog_service,
            "list_workspace_provider_catalog",
            AsyncMock(return_value=_catalog(providers=providers)),
        ), patch.object(
            service.connectors_core,
            "list_provider_profiles",
            AsyncMock(return_value={"items": []}),
        ):
            payload = await service.build_workspace_ai_route_payload("ws-1")

        route_ids = {route["id"] for route in payload["availableRoutes"]}
        self.assertNotIn("provider:anthropic", route_ids)
        self.assertIn("provider:ollama", route_ids)


if __name__ == "__main__":
    unittest.main()
