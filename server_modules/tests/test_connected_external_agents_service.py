from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import patch

import pytest

from server_modules import connected_external_agent_service as service


def _fake_scoped_connection(connection):
    @asynccontextmanager
    async def _scoped_connection(**_kwargs):
        yield connection

    return _scoped_connection


class _FakeResponse:
    def __init__(self, payload: dict[str, Any], *, content: bytes | None = None) -> None:
        self._payload = payload
        self.content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeHttpClient:
    def __init__(self) -> None:
        self.gets: list[dict[str, Any]] = []
        self.posts: list[dict[str, Any]] = []

    async def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
        self.gets.append({"url": url, "headers": headers})
        return _FakeResponse({
            "id": "external-openclaw",
            "name": "OpenClaw gateway",
            "auth_type": "bearer",
            "capabilities": ["chat", "knowledge_read", "logs"],
            "endpoints": {
                "chat": "https://example.com/external/chat",
                "logs": "https://example.com/external/logs",
            },
        })

    async def post(self, url: str, json: dict[str, Any], headers: dict[str, str] | None = None) -> _FakeResponse:
        self.posts.append({"url": url, "json": json, "headers": headers})
        return _FakeResponse({
            "reply": "external reply",
            "access_token": "must-not-leak",
        })


class _LargeManifestClient:
    async def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
        return _FakeResponse({}, content=b"x" * (service.MAX_MANIFEST_RESPONSE_BYTES + 1))


class _MalformedManifestClient:
    async def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
        return _FakeResponse({
            "id": "external-bad",
            "capabilities": ["chat"],
            "native_deploy": True,
        })


class _HealthHandshakeClient:
    def __init__(self, **_kwargs: Any) -> None:
        self.closed = False
        self.gets: list[dict[str, Any]] = []

    async def get(self, url: str, headers: dict[str, str] | None = None) -> _FakeResponse:
        if self.closed:
            raise RuntimeError("client already closed")
        self.gets.append({"url": url, "headers": headers})
        if url == "https://example.com/health":
            return _FakeResponse({"ok": True})
        return _FakeResponse({
            "id": "external-health",
            "name": "Health checked agent",
            "capabilities": ["chat"],
            "endpoints": {
                "chat": "https://example.com/external/chat",
                "health": "https://example.com/health",
            },
        })

    async def aclose(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
def _reset_local_store():
    service._reset_for_tests()
    yield
    service._reset_for_tests()


@pytest.mark.anyio
async def test_create_external_agent_starts_unverified_and_does_not_store_raw_secret() -> None:
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Hermes gateway",
            provider_kind="hermes",
            endpoints={
                "manifest_url": "https://example.com/.well-known/agent-manifest.json",
                "chat_url": "https://example.com/chat",
            },
            manifest={
                "auth_type": "bearer",
                "capabilities": ["chat"],
            },
            secret_ref="vault://workspace/ws-1/hermes",
            created_by_user_id="owner-1",
        )

    assert created["surface_kind"] == "connected_external_agent"
    assert created["provider_kind"] == "hermes"
    assert created["connection_state"] == "unverified"
    assert created["secret_ref"] == "vault://workspace/ws-1/hermes"
    assert created["capability_manifest"]["chat"] is True
    assert "access_token" not in str(created).lower()


@pytest.mark.anyio
async def test_external_agent_chat_requires_verified_chat_capability() -> None:
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Custom agent",
            provider_kind="custom",
            endpoints={"chat_url": "https://example.com/chat"},
            manifest={"capabilities": ["chat"]},
        )

        with pytest.raises(ValueError, match="verified"):
            await service.chat_with_connected_external_agent(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                message="hello",
            )


@pytest.mark.anyio
async def test_refresh_manifest_enables_private_chat_through_backend_proxy() -> None:
    http_client = _FakeHttpClient()
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="OpenClaw gateway",
            provider_kind="openclaw",
            endpoints={"manifest_url": "https://example.com/manifest.json"},
            manifest={},
        )

        refreshed = await service.refresh_connected_external_agent_manifest(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=created["id"],
            http_client=http_client,
        )
        response = await service.chat_with_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=created["id"],
            message="hello",
            recent_messages=[{"role": "user", "content": "previous"}],
            http_client=http_client,
        )

    assert refreshed["connection_state"] == "verified"
    assert refreshed["capability_manifest"]["knowledge_read"] is True
    assert response["reply"] == "external reply"
    assert response["raw_response"]["access_token"] == "[redacted]"
    assert http_client.posts[0]["url"] == "https://example.com/external/chat"
    assert http_client.posts[0]["json"]["channel"] == "private_workspace"
    assert http_client.posts[0]["json"]["agent_id"] == created["id"]


@pytest.mark.anyio
async def test_refresh_manifest_runs_health_handshake_before_closing_owned_client(monkeypatch: pytest.MonkeyPatch) -> None:
    http_client = _HealthHandshakeClient()
    monkeypatch.setattr(service.httpx, "AsyncClient", lambda **kwargs: http_client)

    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Health checked agent",
            provider_kind="custom",
            endpoints={"manifest_url": "https://example.com/manifest.json"},
            manifest={},
        )
        refreshed = await service.refresh_connected_external_agent_manifest(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=created["id"],
        )

    assert refreshed["connection_state"] == "verified"
    assert [item["url"] for item in http_client.gets] == [
        "https://example.com/manifest.json",
        "https://example.com/health",
    ]
    assert http_client.closed is True


@pytest.mark.anyio
async def test_secret_ref_resolves_for_outbound_auth_and_never_returns_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    http_client = _FakeHttpClient()
    resolved: list[dict[str, Any]] = []

    def fake_resolve_vault_credential(credential_id: str, workspace_id: str, **scope: Any) -> dict[str, Any]:
        resolved.append({"credential_id": credential_id, "workspace_id": workspace_id, "scope": scope})
        return {"access_token": "resolved-secret-token"}

    monkeypatch.setattr(service.provider_profiles_service, "resolve_vault_credential", fake_resolve_vault_credential)

    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Secured external agent",
            provider_kind="custom",
            endpoints={"manifest_url": "https://example.com/manifest.json"},
            manifest={},
            secret_ref="vault://credential/cred-external",
        )
        refreshed = await service.refresh_connected_external_agent_manifest(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=created["id"],
            http_client=http_client,
        )
        response = await service.chat_with_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=refreshed["id"],
            message="hello",
            http_client=http_client,
        )

    assert resolved[0]["credential_id"] == "cred-external"
    assert resolved[0]["workspace_id"] == "ws-1"
    assert resolved[0]["scope"]["allowed_fields"] == service.SECRET_RESOLUTION_FIELDS
    assert http_client.gets[0]["headers"]["Authorization"] == "Bearer resolved-secret-token"
    assert http_client.posts[0]["headers"]["Authorization"] == "Bearer resolved-secret-token"
    assert "resolved-secret-token" not in str(refreshed)
    assert "resolved-secret-token" not in str(response)


@pytest.mark.anyio
async def test_missing_secret_ref_resolution_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_resolve_vault_credential(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        raise RuntimeError("missing")

    monkeypatch.setattr(service.provider_profiles_service, "resolve_vault_credential", fake_resolve_vault_credential)

    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Secured external agent",
            provider_kind="custom",
            endpoints={"manifest_url": "https://example.com/manifest.json"},
            manifest={},
            secret_ref="vault://credential/missing",
        )
        with pytest.raises(ValueError, match="credential could not be resolved"):
            await service.refresh_connected_external_agent_manifest(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                http_client=_FakeHttpClient(),
            )


@pytest.mark.anyio
async def test_refresh_manifest_rejects_oversized_and_malformed_manifests() -> None:
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="External agent",
            provider_kind="custom",
            endpoints={"manifest_url": "https://example.com/manifest.json"},
            manifest={},
        )

        with pytest.raises(ValueError, match="exceeded"):
            await service.refresh_connected_external_agent_manifest(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                http_client=_LargeManifestClient(),
            )

        with pytest.raises(ValueError, match="unsupported fields"):
            await service.refresh_connected_external_agent_manifest(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                http_client=_MalformedManifestClient(),
            )


@pytest.mark.anyio
async def test_external_agent_chat_enforces_recent_message_limits() -> None:
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Chat agent",
            provider_kind="custom",
            endpoints={"chat_url": "https://example.com/chat"},
            manifest={"capabilities": ["chat"]},
        )
        service.LOCAL_STORE[("tenant-1", "ws-1", created["id"])] = {
            **created,
            "connection_state": "verified",
            "trust_state": "verified",
        }

        with pytest.raises(ValueError, match="more than"):
            await service.chat_with_connected_external_agent(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                message="hello",
                recent_messages=[{"role": "user", "content": "x"} for _ in range(service.MAX_RECENT_MESSAGES + 1)],
                http_client=_FakeHttpClient(),
            )
        with pytest.raises(ValueError, match="role"):
            await service.chat_with_connected_external_agent(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                message="hello",
                recent_messages=[{"role": "admin", "content": "x"}],
                http_client=_FakeHttpClient(),
            )


@pytest.mark.anyio
async def test_external_agent_rejects_private_network_endpoint() -> None:
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        with pytest.raises(ValueError, match="private-network"):
            await service.create_connected_external_agent(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                name="Local raw URL",
                provider_kind="custom",
                endpoints={"chat_url": "https://127.0.0.1:9999/chat"},
                manifest={"capabilities": ["chat"]},
            )


@pytest.mark.anyio
async def test_external_agent_rejects_private_dns_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "_resolve_host_is_private", lambda _hostname: True)
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        with pytest.raises(ValueError, match="private-network"):
            await service.create_connected_external_agent(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                name="Private DNS",
                provider_kind="custom",
                endpoints={"chat_url": "https://internal.example.com/chat"},
                manifest={"capabilities": ["chat"]},
            )


@pytest.mark.anyio
async def test_production_control_plane_unavailable_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMPYRALIS_DEPLOY_ENV", "production")
    monkeypatch.delenv("EMPYRALIS_EXTERNAL_AGENT_LOCAL_STORE", raising=False)
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        with pytest.raises(RuntimeError, match="control-plane storage"):
            await service.list_connected_external_agents(tenant_id="tenant-1", workspace_id="ws-1")


@pytest.mark.anyio
async def test_disconnect_revokes_external_agent_and_blocks_chat() -> None:
    with patch("server_modules.control_plane_repository._scoped_connection", new=_fake_scoped_connection(None)):
        created = await service.create_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            name="Revocable agent",
            provider_kind="custom",
            endpoints={"chat_url": "https://example.com/chat"},
            manifest={"capabilities": ["chat"]},
        )
        updated = await service.update_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=created["id"],
            manifest={"capabilities": ["chat"], "endpoints": {"chat": "https://example.com/chat"}},
        )
        service.LOCAL_STORE[("tenant-1", "ws-1", created["id"])] = {
            **updated,
            "connection_state": "verified",
            "trust_state": "verified",
        }

        disconnected = await service.disconnect_connected_external_agent(
            tenant_id="tenant-1",
            workspace_id="ws-1",
            external_agent_id=created["id"],
        )

        assert disconnected["connection_state"] == "revoked"
        assert disconnected["enabled"] is False
        with pytest.raises(ValueError, match="verified|disconnected"):
            await service.chat_with_connected_external_agent(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                external_agent_id=created["id"],
                message="hello",
                http_client=_FakeHttpClient(),
            )
