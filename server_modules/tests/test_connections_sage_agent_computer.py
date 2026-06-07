import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from server_modules import connection_catalog_service, connectors_actions, gateway_state_repository, routes_connections


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
async def test_put_sage_agent_computer_selection_keeps_default_guarded_without_mode_metadata(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": {"runtime_access_mode": "default_guarded"},
        },
    )
    update_calls = []

    def _update_gateway_registration_state(**kwargs):
        update_calls.append(kwargs)
        return {
            "gateway_id": kwargs["gateway_id"],
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": kwargs["metadata"],
        }

    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "update_gateway_registration_state",
        _update_gateway_registration_state,
    )
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "set_selection",
        lambda **kwargs: {
            "workspace_id": kwargs["workspace_id"],
            "user_id": kwargs["user_id"],
            "selected_gateway_id": kwargs["selected_gateway_id"],
            "metadata": kwargs["metadata"],
        },
    )
    monkeypatch.setattr(
        routes_connections.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: {
            **registration,
            "runtime_access_mode": registration.get("metadata", {}).get("runtime_access_mode"),
        },
    )

    payload = await routes_connections.set_sage_agent_computer_selection(
        body=routes_connections.SageAgentComputerSelectionRequest(
            workspace_id="ws-1",
            selected_gateway_id="gateway-1",
        ),
        request=SimpleNamespace(),
        current_user={"user_id": "user-1", "role": "member"},
    )

    assert payload["selected_gateway_id"] == "gateway-1"
    assert update_calls[0]["metadata"]["runtime_access_mode"] == "default_guarded"
    assert update_calls[0]["metadata"]["autonomous_agent_setup_warning_acknowledged"] is False
    assert update_calls[0]["metadata"]["sage_agent_computer_selected"] is True
    assert "runtime_access_setup_warning" in update_calls[0]["metadata_keys_to_remove"]
    assert payload["gateway"]["runtime_access_mode"] == "default_guarded"


@pytest.mark.anyio
async def test_put_sage_agent_computer_selection_rejects_full_access_without_warning_ack(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": {"runtime_access_mode": "default_guarded"},
        },
    )

    with pytest.raises(HTTPException) as raised:
        await routes_connections.set_sage_agent_computer_selection(
            body=routes_connections.SageAgentComputerSelectionRequest(
                workspace_id="ws-1",
                selected_gateway_id="gateway-1",
                metadata={"runtime_access_mode": "full_access"},
            ),
            request=SimpleNamespace(),
            current_user={"user_id": "user-1", "role": "member"},
        )

    assert raised.value.status_code == 400
    assert "Full Access setup warning" in str(raised.value.detail)


@pytest.mark.anyio
async def test_put_sage_agent_computer_selection_applies_full_access_after_warning_ack(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": {"runtime_access_mode": "default_guarded"},
        },
    )
    update_calls = []

    def _update_gateway_registration_state(**kwargs):
        update_calls.append(kwargs)
        return {
            "gateway_id": kwargs["gateway_id"],
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": kwargs["metadata"],
        }

    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "update_gateway_registration_state",
        _update_gateway_registration_state,
    )
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "set_selection",
        lambda **kwargs: {
            "workspace_id": kwargs["workspace_id"],
            "user_id": kwargs["user_id"],
            "selected_gateway_id": kwargs["selected_gateway_id"],
            "metadata": kwargs["metadata"],
        },
    )
    monkeypatch.setattr(
        routes_connections.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: {
            **registration,
            "runtime_access_mode": registration.get("metadata", {}).get("runtime_access_mode"),
        },
    )

    payload = await routes_connections.set_sage_agent_computer_selection(
        body=routes_connections.SageAgentComputerSelectionRequest(
            workspace_id="ws-1",
            selected_gateway_id="gateway-1",
            metadata={
                "runtime_access_mode": "full_access",
                "autonomous_agent_setup_warning_acknowledged": True,
            },
        ),
        request=SimpleNamespace(),
        current_user={"user_id": "user-1", "role": "member"},
    )

    assert payload["selected_gateway_id"] == "gateway-1"
    assert update_calls[0]["metadata"]["runtime_access_mode"] == "full_access"
    assert update_calls[0]["metadata"]["autonomous_agent_setup_warning_acknowledged"] is True
    assert update_calls[0]["metadata"]["sage_agent_computer_selected"] is True
    assert payload["gateway"]["runtime_access_mode"] == "full_access"


@pytest.mark.anyio
async def test_put_sage_agent_computer_selection_applies_custom_mode(monkeypatch):
    _install_auth(monkeypatch)
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": {"runtime_access_mode": "default_guarded"},
        },
    )
    update_calls = []

    def _update_gateway_registration_state(**kwargs):
        update_calls.append(kwargs)
        return {
            "gateway_id": kwargs["gateway_id"],
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "connection_status": "online",
            "metadata": kwargs["metadata"],
        }

    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "update_gateway_registration_state",
        _update_gateway_registration_state,
    )
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "set_selection",
        lambda **kwargs: {
            "workspace_id": kwargs["workspace_id"],
            "user_id": kwargs["user_id"],
            "selected_gateway_id": kwargs["selected_gateway_id"],
            "metadata": kwargs["metadata"],
        },
    )
    monkeypatch.setattr(
        routes_connections.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: {
            **registration,
            "runtime_access_mode": registration.get("metadata", {}).get("runtime_access_mode"),
        },
    )

    payload = await routes_connections.set_sage_agent_computer_selection(
        body=routes_connections.SageAgentComputerSelectionRequest(
            workspace_id="ws-1",
            selected_gateway_id="gateway-1",
            metadata={"runtime_access_mode": "custom"},
        ),
        request=SimpleNamespace(),
        current_user={"user_id": "user-1", "role": "member"},
    )

    assert payload["selected_gateway_id"] == "gateway-1"
    assert update_calls[0]["metadata"]["runtime_access_mode"] == "custom"
    assert update_calls[0]["metadata"]["autonomous_agent_setup_warning_acknowledged"] is False
    assert update_calls[0]["metadata"]["sage_agent_computer_selected"] is True
    assert "runtime_access_setup_warning" in update_calls[0]["metadata_keys_to_remove"]
    assert payload["selection"]["metadata"]["runtime_access_mode"] == "custom"
    assert payload["gateway"]["runtime_access_mode"] == "custom"


def test_gateway_registration_state_removes_stale_full_access_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(
        gateway_state_repository,
        "_enforce_gateway_state_decision",
        lambda *_args, **_kwargs: {"next_action": "update_gateway_registration_state"},
    )
    db_path = tmp_path / "gateway-state.sqlite3"
    now = "2026-06-06T00:00:00Z"
    full_access_metadata = {
        "runtime_access_mode": "full_access",
        "runtime_access_label": "Full Access",
        "runtime_access_setup_warning": "old warning",
        "autonomous_agent_setup_warning_acknowledged": True,
        "autonomous_agent_setup_warning_acknowledged_at": now,
    }
    conn = gateway_state_repository._connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO gateway_registrations (
                gateway_id, device_id, tenant_id, workspace_id, user_id, status,
                device_trust_state, display_name, platform, gateway_token_hash,
                metadata, capabilities, journal_cursor, checkpoint_cursor,
                created_at, updated_at, last_seen_at, last_heartbeat_at,
                token_rotated_at, revoked_at, revoked_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "gateway-1",
                "device-1",
                "tenant-1",
                "ws-1",
                "user-1",
                "active",
                "verified",
                "Agent Computer",
                "darwin",
                "token-hash",
                json.dumps(full_access_metadata, sort_keys=True),
                "[]",
                0,
                0,
                now,
                now,
                now,
                now,
                now,
                None,
                None,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    updated = gateway_state_repository.update_gateway_registration_state(
        gateway_id="gateway-1",
        db_path=db_path,
        metadata={
            "runtime_access_mode": "custom",
            "runtime_access_label": "Custom",
            "autonomous_agent_setup_warning_acknowledged": False,
        },
        metadata_keys_to_remove=[
            "runtime_access_setup_warning",
            "autonomous_agent_setup_warning_acknowledged_at",
        ],
    )

    metadata = (updated or {}).get("metadata") or {}
    assert metadata["runtime_access_mode"] == "custom"
    assert metadata["runtime_access_label"] == "Custom"
    assert metadata["autonomous_agent_setup_warning_acknowledged"] is False
    assert "runtime_access_setup_warning" not in metadata
    assert "autonomous_agent_setup_warning_acknowledged_at" not in metadata


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
    assert item["online_gateway_count"] == 2
    assert item["online_gateway_candidate"] is None


def test_connection_status_exposes_single_online_candidate_without_auto_selecting(monkeypatch):
    registrations = [
        {"gateway_id": "gateway-1", "workspace_id": "ws-1", "connection_status": "online", "display_name": "Mac"},
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
    assert item["selected_gateway_id"] is None
    assert item["selected_gateway_missing"] is False
    assert item["connected"] is False
    assert item["online_gateway_count"] == 1
    assert item["online_gateway_candidate"]["gateway_id"] == "gateway-1"


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


def test_connection_status_treats_fresh_active_gateway_as_online(monkeypatch):
    registrations = [
        {
            "gateway_id": "gateway-live",
            "workspace_id": "ws-1",
            "status": "active",
            "connection_status": None,
            "heartbeat_fresh": True,
            "display_name": "Mac",
        },
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
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-live"},
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
    assert item["selected_gateway_id"] == "gateway-live"
    assert item["connected"] is True
    assert item["health_status"] == "healthy"
    assert item["online_gateway_count"] == 1
    assert item["online_gateway_candidate"]["gateway_id"] == "gateway-live"


def test_connection_status_preserves_stale_selected_gateway_id(monkeypatch):
    registrations = [
        {"gateway_id": "gateway-live", "workspace_id": "ws-1", "connection_status": "online", "display_name": "Mac"},
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
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-stale"},
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
    assert item["selected_gateway_id"] == "gateway-stale"
    assert item["selected_gateway_missing"] is True
    assert item["health_status"] == "gateway_missing"
    assert item["connected"] is False
    assert item["online_gateway_candidate"]["gateway_id"] == "gateway-live"


def test_personal_channel_status_does_not_advertise_dead_generic_test(monkeypatch):
    registrations = [
        {"gateway_id": "gateway-1", "workspace_id": "ws-1", "connection_status": "online"},
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
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-1"},
    )
    monkeypatch.setattr(
        connection_catalog_service.runtime_common,
        "list_vault_connectors",
        lambda workspace_id: [],
    )
    monkeypatch.setattr(
        connection_catalog_service.personal_channels_repository,
        "get_telegram_state",
        lambda gateway_id, channel_key="telegram_personal": {"status": "disconnected"},
    )
    monkeypatch.setattr(
        connection_catalog_service.personal_channels_repository,
        "get_whatsapp_state",
        lambda gateway_id, channel_key="whatsapp_personal": {"status": "disconnected"},
    )

    payload = connection_catalog_service.list_status_payload(
        workspace_id="ws-1",
        tenant_id="tenant-1",
        user_id="user-1",
        surface="sage",
    )

    by_id = {item["id"]: item for item in payload["items"]}
    assert by_id["telegram_personal"]["configured"] is True
    assert by_id["telegram_personal"]["connected"] is False
    assert by_id["telegram_personal"]["next_action"] == "connect"
    assert by_id["whatsapp_personal"]["next_action"] == "connect"


def test_sage_channel_catalog_exposes_cloud_telegram_bot_without_agent_computer():
    payload = connection_catalog_service.list_catalog_payload(surface="sage")
    by_id = {item["id"]: item for item in payload["items"]}

    assert "telegram_bot" in by_id
    assert by_id["telegram_bot"]["requires_gateway"] is False
    assert by_id["telegram_bot"]["setup_available"] is True
    assert by_id["telegram_bot"]["runtime_usable"] is True
    assert by_id["telegram_bot"]["launch_status"] == connection_catalog_service.LAUNCH_LIVE_WHEN_CONFIGURED
    assert by_id["telegram_bot"]["auth_required_fields"] == ["bot_token", "chat_id"]
    assert "telegram_personal" in by_id
    assert by_id["telegram_personal"]["requires_gateway"] is True


def test_connection_catalog_exposes_launch_contract_without_ui_side_lock_lists():
    by_id = {item["id"]: item for item in connection_catalog_service.catalog_items()}

    google = by_id["google_workspace"]
    assert google["launch_status"] == connection_catalog_service.LAUNCH_LIVE_WHEN_CONFIGURED
    assert google["setup_available"] is True
    assert google["runtime_usable"] is True
    assert google["launchable"] is True
    assert google["auth_required_fields"] == ["access_token"]
    assert google["test_runner"] == "not_implemented"
    assert "generic_connection_test_not_implemented" in google["proof_blockers"]

    signal = by_id["signal_personal"]
    assert signal["launch_status"] == connection_catalog_service.LAUNCH_PLANNED
    assert signal["setup_available"] is False
    assert signal["runtime_usable"] is False
    assert signal["launchable"] is False
    assert "launch_status:planned" in signal["launch_blockers"]

    apple = by_id["apple_messages_business"]
    assert apple["launch_status"] == connection_catalog_service.LAUNCH_PLANNED
    assert apple["setup_available"] is False
    assert apple["runtime_usable"] is False
    assert apple["launchable"] is False
    assert apple["requires_gateway"] is False
    assert apple["connector_id"] == "apple_messages_business"

    discord = by_id["discord_bot"]
    assert discord["launch_status"] == connection_catalog_service.LAUNCH_LIVE_WHEN_CONFIGURED
    assert discord["setup_available"] is True
    assert discord["runtime_usable"] is True
    assert discord["launchable"] is True
    assert discord["auth_required_fields"] == [
        "bot_token",
        "channel_id",
        "guild_id",
        "application_id",
        "public_key",
        "application_public_key",
    ]
    assert connectors_actions.connector_contract("discord_bot")["allowed_secret_fields"] == [
        "bot_token",
        "channel_id",
        "guild_id",
        "application_id",
        "public_key",
        "application_public_key",
    ]

    github = by_id["github"]
    assert github["launch_status"] == connection_catalog_service.LAUNCH_LIVE_WHEN_CONFIGURED
    assert github["setup_available"] is True
    assert github["runtime_usable"] is True
    assert github["launchable"] is True
    assert github["supports_inbound"] is True

    notion = by_id["notion"]
    assert notion["launch_status"] == connection_catalog_service.LAUNCH_LIVE_WHEN_CONFIGURED
    assert notion["setup_available"] is True
    assert notion["runtime_usable"] is True
    assert notion["launchable"] is True
    assert notion["supports_inbound"] is False
    assert notion["supports_outbound"] is True

    linear = by_id["linear"]
    assert linear["launch_status"] == connection_catalog_service.LAUNCH_LIVE_WHEN_CONFIGURED
    assert linear["setup_available"] is True
    assert linear["runtime_usable"] is True
    assert linear["launchable"] is True
    assert linear["supports_inbound"] is False
    assert linear["supports_outbound"] is True


@pytest.mark.anyio
async def test_work_app_connection_setup_points_to_connector_vault_not_fake_session(monkeypatch):
    _install_auth(monkeypatch)

    async def fail_create_setup_session(*_args, **_kwargs):
        raise AssertionError("generic setup session should not be used for launchable app connectors")

    monkeypatch.setattr(routes_connections.setup_sessions, "handle_create_setup_session", fail_create_setup_session)

    payload = await routes_connections.start_connection_setup(
        "google_workspace",
        body=routes_connections.ConnectionActionRequest(
            workspace_id="ws-1",
            surface="sage",
        ),
        request=SimpleNamespace(),
        current_user={"user_id": "user-1", "role": "member"},
    )

    assert payload["next_action"] == "connector_vault_setup"
    assert payload["setup_endpoint"] == "/api/connectors/vault"
    assert payload["provider"] == "google_workspace"
    assert payload["auth_required_fields"] == ["access_token"]


@pytest.mark.anyio
async def test_launchable_notion_and_linear_setup_points_to_connector_vault(monkeypatch):
    _install_auth(monkeypatch)

    async def fail_create_setup_session(*_args, **_kwargs):
        raise AssertionError("generic setup session should not be used for launchable app connectors")

    monkeypatch.setattr(routes_connections.setup_sessions, "handle_create_setup_session", fail_create_setup_session)

    for connection_id in ("notion", "linear"):
        payload = await routes_connections.start_connection_setup(
            connection_id,
            body=routes_connections.ConnectionActionRequest(
                workspace_id="ws-1",
                surface="sage",
            ),
            request=SimpleNamespace(),
            current_user={"user_id": "user-1", "role": "member"},
        )

        assert payload["next_action"] == "connector_vault_setup"
        assert payload["setup_endpoint"] == "/api/connectors/vault"
        assert payload["provider"] == connection_id
        assert payload["auth_required_fields"]


@pytest.mark.anyio
async def test_personal_channel_setup_accepts_fresh_active_gateway(monkeypatch):
    _install_auth(monkeypatch)

    async def fail_create_setup_session(*_args, **_kwargs):
        raise AssertionError("personal channel setup should return gateway setup endpoint")

    monkeypatch.setattr(routes_connections.setup_sessions, "handle_create_setup_session", fail_create_setup_session)
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "get_selection",
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-1"},
    )
    monkeypatch.setattr(
        routes_connections.gateway_state_repository,
        "get_gateway_registration",
        lambda gateway_id: {
            "gateway_id": gateway_id,
            "workspace_id": "ws-1",
            "user_id": "user-1",
            "device_trust_state": "verified",
            "status": "active",
        },
    )
    monkeypatch.setattr(
        routes_connections.gateway_registry_service,
        "gateway_registration_public_payload",
        lambda registration: {
            **dict(registration),
            "connection_status": None,
            "heartbeat_fresh": True,
        },
    )

    payload = await routes_connections.start_connection_setup(
        "telegram_personal",
        body=routes_connections.ConnectionActionRequest(
            workspace_id="ws-1",
            surface="sage",
            selected_gateway_id="gateway-1",
        ),
        request=SimpleNamespace(),
        current_user={"user_id": "user-1", "role": "member"},
    )

    assert payload["next_action"] == "personal_channel_setup"
    assert payload["gateway_id"] == "gateway-1"
    assert payload["setup_endpoint"] == "/api/personal-channels/telegram/gateways/gateway-1/setup"


@pytest.mark.anyio
async def test_local_bridge_connection_setup_is_blocked_until_certified(monkeypatch):
    _install_auth(monkeypatch)

    async def fail_create_setup_session(*_args, **_kwargs):
        raise AssertionError("generic setup session should not be used for local bridge personal channels")

    monkeypatch.setattr(routes_connections.setup_sessions, "handle_create_setup_session", fail_create_setup_session)
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "get_selection",
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-1"},
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

    with pytest.raises(HTTPException) as exc_info:
        await routes_connections.start_connection_setup(
            "signal_personal",
            body=routes_connections.ConnectionActionRequest(
                workspace_id="ws-1",
                surface="sage",
                selected_gateway_id="gateway-1",
            ),
            request=SimpleNamespace(),
            current_user={"user_id": "user-1", "role": "member"},
        )

    assert exc_info.value.status_code == 409
    assert "launch" in exc_info.value.detail


@pytest.mark.anyio
async def test_wechat_connection_setup_is_blocked_until_certified(monkeypatch):
    _install_auth(monkeypatch)

    async def fail_create_setup_session(*_args, **_kwargs):
        raise AssertionError("generic setup session should not be used for WeChat local bridge personal channels")

    monkeypatch.setattr(routes_connections.setup_sessions, "handle_create_setup_session", fail_create_setup_session)
    monkeypatch.setattr(
        routes_connections.sage_agent_computer_selection_service,
        "get_selection",
        lambda workspace_id, user_id: {"selected_gateway_id": "gateway-1"},
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

    with pytest.raises(HTTPException) as exc_info:
        await routes_connections.start_connection_setup(
            "wechat_personal",
            body=routes_connections.ConnectionActionRequest(
                workspace_id="ws-1",
                surface="sage",
                selected_gateway_id="gateway-1",
            ),
            request=SimpleNamespace(),
            current_user={"user_id": "user-1", "role": "member"},
        )

    assert exc_info.value.status_code == 409
    assert "launch" in exc_info.value.detail
