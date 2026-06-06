from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from server_modules import connection_catalog_service, routes_connections


def _install_auth(monkeypatch):
    monkeypatch.setattr(
        routes_connections.auth_module,
        "enforce_workspace_access",
        lambda current_user, workspace_id, minimum_role="viewer": workspace_id,
    )
    monkeypatch.setattr(
        routes_connections.auth_module,
        "workspace_tenant_id",
        lambda current_user, workspace_id: "tenant-1",
    )
    monkeypatch.setattr(routes_connections.auth_module, "validate_csrf", lambda request: None)


@pytest.mark.anyio
async def test_get_sage_agent_computer_selection_returns_current_user_selection(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "get_selection",
        lambda workspace_id, user_id: {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "selected_gateway_id": "gateway-1",
            "selected_at": "2026-06-06T00:00:00Z",
            "selected_by": user_id,
            "metadata": {},
        },
    )
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
        },
    )
    monkeypatch.setattr(
        routes_connections.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: dict(registration),
    )

    payload = await routes_connections.get_sage_agent_computer_selection(
        workspace_id="ws-1",
        current_user={"user_id": "user-1", "role": "member"},
    )

    assert payload["selected_gateway_id"] == "gateway-1"
    assert payload["gateway"]["gateway_id"] == "gateway-1"


@pytest.mark.anyio
async def test_put_sage_agent_computer_selection_rejects_another_users_gateway(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-2",
            "device_trust_state": "verified",
            "connection_status": "online",
        },
    )

    with pytest.raises(HTTPException) as raised:
        await routes_connections.set_sage_agent_computer_selection(
            body=routes_connections.SageAgentComputerSelectionRequest(
                workspace_id="ws-1",
                selected_gateway_id="gateway-1",
            ),
            request=SimpleNamespace(),
            current_user={"user_id": "user-1", "role": "member"},
        )

    assert raised.value.status_code == 403


@pytest.mark.anyio
async def test_put_sage_agent_computer_selection_rejects_revoked_gateway(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "revoked",
            "connection_status": "offline",
        },
    )

    with pytest.raises(HTTPException) as raised:
        await routes_connections.set_sage_agent_computer_selection(
            body=routes_connections.SageAgentComputerSelectionRequest(
                workspace_id="ws-1",
                selected_gateway_id="gateway-1",
            ),
            request=SimpleNamespace(),
            current_user={"user_id": "user-1", "role": "member"},
        )

    assert raised.value.status_code == 409


def test_connection_status_does_not_auto_select_gateway(monkeypatch):
    registrations = [
        {"gateway_id": "gateway-1", "workspace_id": "ws-1", "connection_status": "online"},
        {"gateway_id": "gateway-2", "workspace_id": "ws-1", "connection_status": "online"},
    ]
    monkeypatch.setattr(
        connection_catalog_service.gateway_state_repository,
        "list_workspace_gateway_registrations",
        lambda workspace_id, tenant_id=None, user_id=None, include_revoked=False: registrations,
    )
    monkeypatch.setattr(
        connection_catalog_service.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: dict(registration),
    )
    monkeypatch.setattr(
        connection_catalog_service.sage_agent_computer_selection_service,
        "get_selection",
        lambda workspace_id, user_id: None,
    )
    monkeypatch.setattr(
        connection_catalog_service.runtime_common,
        "list_vault_connectors",
        lambda workspace_id: [],
    )

    payload = connection_catalog_service.list_status_payload(
        workspace_id="ws-1",
        tenant_id="tenant-1",
        user_id="user-1",
        surface="agent_computer",
    )

    item = payload["items"][0]
    assert item["id"] == "agent_computer"
    assert item["gateway_count"] == 2
    assert item["selected_gateway_id"] is None
    assert item["connected"] is False


def test_connection_status_uses_persisted_selected_gateway(monkeypatch):
    registrations = [
        {"gateway_id": "gateway-1", "workspace_id": "ws-1", "connection_status": "online"},
        {"gateway_id": "gateway-2", "workspace_id": "ws-1", "connection_status": "online"},
    ]
    monkeypatch.setattr(
        connection_catalog_service.gateway_state_repository,
        "list_workspace_gateway_registrations",
        lambda workspace_id, tenant_id=None, user_id=None, include_revoked=False: registrations,
    )
    monkeypatch.setattr(
        connection_catalog_service.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: dict(registration),
    )
    monkeypatch.setattr(
        connection_catalog_service.sage_agent_computer_selection_service,
        "get_selection",
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-2"},
    )
    monkeypatch.setattr(
        connection_catalog_service.runtime_common,
        "list_vault_connectors",
        lambda workspace_id: [],
    )

    payload = connection_catalog_service.list_status_payload(
        workspace_id="ws-1",
        tenant_id="tenant-1",
        user_id="user-1",
        surface="agent_computer",
    )

    item = payload["items"][0]
    assert item["id"] == "agent_computer"
    assert item["selected_gateway_id"] == "gateway-2"
    assert item["connected"] is True
