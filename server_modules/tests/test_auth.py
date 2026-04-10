from __future__ import annotations

import hashlib
import hmac
import importlib
import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi import HTTPException

import server_modules.auth as auth_module
import server_modules.jwt_secret as jwt_secret_module
import server_modules.routes_auth as routes_auth_module


def _reload_auth(monkeypatch: pytest.MonkeyPatch, tmp_path, extra_env: dict[str, str] | None = None):
    state_home = tmp_path / "state"
    monkeypatch.setenv("EMPYRALIS_STATE_HOME", str(state_home))
    monkeypatch.delenv("EMPYRALIS_JWT_SECRET_FILE", raising=False)
    for key in ("ORION_JWT_SECRET", "JWT_SECRET", "ORION_API_KEY", "RUNTIME_KEY"):
        monkeypatch.delenv(key, raising=False)
    for key, value in (extra_env or {}).items():
        monkeypatch.setenv(key, value)

    jwt_secret = importlib.reload(jwt_secret_module)
    auth = importlib.reload(auth_module)
    auth.USER_RATE_LIMIT_BUCKETS.clear()
    auth.LOGIN_RATE_LIMIT_BUCKETS.clear()
    return auth, jwt_secret, state_home


def _expired_token(auth) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": "user-expired",
        "email": "expired@example.com",
        "workspace_ids": ["default"],
        "iat": 1,
        "exp": 2,
    }
    header_segment = auth._b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = auth._b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(auth._jwt_secret().encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_segment}.{payload_segment}.{auth._b64url_encode(signature)}"


class _Request:
    headers = {}
    client = None


def test_jwt_stable_across_restart(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, jwt_secret, state_home = _reload_auth(monkeypatch, tmp_path)
    first_secret = auth._jwt_secret()

    auth, jwt_secret, _ = _reload_auth(monkeypatch, tmp_path)
    second_secret = auth._jwt_secret()

    assert first_secret == second_secret
    assert jwt_secret.JWT_SECRET_FILE == state_home / "auth" / "jwt_secret"
    assert jwt_secret.JWT_SECRET_FILE.exists()


def test_google_oauth_flow(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)

    # The browser OAuth callback lives outside server_modules; this verifies the
    # persisted downstream contract it depends on: a durable user record plus a
    # valid platform JWT for the signed-in identity.
    created = auth.register_user("google.user@example.com", "password-123", name="Google User")

    payload = auth._decode_token_payload(created["token"])
    assert payload["sub"] == created["user"]["id"]
    assert payload["email"] == "google.user@example.com"
    assert auth.verify_token(created["token"]) == created["user"]["id"]


def test_session_persistence(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("persist@example.com", "password-123", name="Persisted User")

    auth, _, _ = _reload_auth(monkeypatch, tmp_path)

    assert auth.verify_token(created["token"]) == created["user"]["id"]
    logged_in = auth.login_user("persist@example.com", "password-123")
    assert logged_in["user"]["id"] == created["user"]["id"]


def test_register_user_exposes_empyralis_identity_boundary(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("identity@example.com", "password-123", name="Identity User")

    boundary = created["identity_boundary"]
    auth_methods = boundary["auth_methods"]

    assert boundary["account_owner"] == "empyralis"
    assert boundary["account_id"] == created["user"]["id"]
    assert len(auth_methods) == 1
    assert auth_methods[0]["method_type"] == "password"
    assert auth_methods[0]["provider"] == "empyralis_password"
    assert auth_methods[0]["is_primary"] is True
    assert auth_methods[0]["can_recover"] is True
    assert boundary["provider_connections"] == []
    assert boundary["summary"]["linked_provider_count"] == 0
    assert boundary["summary"]["has_recovery_method"] is True


def test_expired_token_rejected(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)

    with pytest.raises(HTTPException) as exc:
        auth.verify_token(_expired_token(auth))

    assert exc.value.status_code == 401
    assert exc.value.detail == "Bearer token has expired."


def test_workspace_membership_scope_and_viewer_role(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("workspace.viewer@example.com", "password-123", name="Viewer")
    home_entry = next(
        item
        for item in created["workspace_access"]
        if isinstance(item, dict) and str(item.get("workspace_id") or "").startswith("ws_")
    )
    home_workspace_id = home_entry["workspace_id"]
    home_tenant_id = home_entry["tenant_id"]
    finance_workspace_id = f"finance-{tmp_path.name}"
    auth.ensure_workspace_tenant_binding(finance_workspace_id, home_tenant_id)
    auth.upsert_workspace_membership(created["user"]["id"], finance_workspace_id, "viewer")
    token = auth.login_user("workspace.viewer@example.com", "password-123")["token"]
    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {token}")

    assert auth.workspace_role(current_user, home_workspace_id) == "owner"
    assert auth.workspace_role(current_user, finance_workspace_id) == "viewer"
    assert auth.enforce_workspace_access(current_user, finance_workspace_id, minimum_role="viewer") == finance_workspace_id
    with pytest.raises(HTTPException):
        auth.enforce_workspace_access(current_user, finance_workspace_id, minimum_role="member")
    with pytest.raises(HTTPException):
        auth.enforce_workspace_access(current_user, "secret-lab", minimum_role="viewer")


def test_workspace_capability_policy_denies_local_capability(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("workspace.member@example.com", "password-123", name="Member")
    home_workspace_id = created["workspace_access"][0]["workspace_id"]
    auth.upsert_workspace_policy(home_workspace_id, capability_deny=["computer_control.type"])
    token = auth.login_user("workspace.member@example.com", "password-123")["token"]
    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {token}")

    with pytest.raises(HTTPException) as exc:
        auth.enforce_workspace_access(
            current_user,
            home_workspace_id,
            minimum_role="member",
            capability_id="computer_control.type",
        )

    assert exc.value.status_code == 403


def test_tenant_binding_and_policy_precedence(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("tenant.member@example.com", "password-123", name="Tenant Member")
    finance_workspace_id = f"finance-{tmp_path.name}"
    auth.ensure_workspace_tenant_binding(finance_workspace_id, "tenant-acme")
    auth.upsert_workspace_membership(created["user"]["id"], finance_workspace_id, "owner")
    auth.upsert_tenant_policy(
        "tenant-acme",
        capability_allow=["computer_control.type"],
        connector_allow=["gmail"],
        machine_enrollment_scope="tenant",
    )
    auth.upsert_workspace_policy(
        finance_workspace_id,
        capability_deny=["computer_control.type"],
        connector_deny=["gmail"],
        machine_enrollment_scope="workspace",
    )
    refreshed = auth.login_user("tenant.member@example.com", "password-123")
    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {refreshed['token']}")

    assert auth.workspace_tenant_id(current_user, finance_workspace_id) == "tenant-acme"
    assert auth.tenant_role(current_user, "tenant-acme") == "owner"
    assert auth.workspace_machine_enrollment_scope(current_user, finance_workspace_id) == "workspace"
    assert auth.workspace_connector_decision(current_user, finance_workspace_id, "gmail")["decision"] == "deny"
    assert auth.workspace_capability_decision(current_user, finance_workspace_id, "computer_control.type")["decision"] == "deny"

    with pytest.raises(HTTPException) as exc:
        auth.enforce_workspace_access(
            current_user,
            finance_workspace_id,
            tenant_id="tenant-other",
            minimum_role="viewer",
        )

    assert exc.value.status_code == 403


def test_enterprise_settings_and_admin_provisioning_hooks(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    finance_workspace_id = f"finance-{tmp_path.name}"
    ops_workspace_id = f"ops-{tmp_path.name}"
    auth.upsert_tenant_enterprise_settings(
        "tenant-acme",
        sso={
            "enabled": True,
            "provider": "oidc",
            "issuer_url": "https://id.example.com",
            "domains": ["example.com"],
            "scopes": ["openid", "profile", "email"],
        },
        mfa={
            "required": True,
            "methods": ["totp", "webauthn"],
            "grace_period_hours": 24,
        },
        scim={
            "enabled": True,
            "base_url": "https://control.example.com/api/v1/auth/admin/provision/users",
            "provisioning_mode": "admin_api",
        },
    )

    enterprise = auth.load_tenant_enterprise_settings("tenant-acme")
    assert enterprise["sso"]["enabled"] is True
    assert enterprise["mfa"]["required"] is True
    assert enterprise["scim"]["enabled"] is True

    provisioned = auth.provision_user_account(
        email="provisioned@example.com",
        name="Provisioned User",
        tenant_id="tenant-acme",
        workspace_roles={finance_workspace_id: "viewer", ops_workspace_id: "member"},
        provisioning_source="scim_bridge",
        external_id="scim-user-123",
        auth_provider="oidc",
        sso_subject="oidc|user-123",
    )

    security = auth.load_user_enterprise_security(provisioned["user"]["id"])
    workspace_ids = {item["workspace_id"] for item in provisioned["workspace_access"]}
    boundary = provisioned["identity_boundary"]
    auth_methods = boundary["auth_methods"]

    assert workspace_ids == {finance_workspace_id, ops_workspace_id}
    assert security["auth_provider"] == "oidc"
    assert security["provisioning_source"] == "scim_bridge"
    assert security["external_id"] == "scim-user-123"
    assert security["sso_subject"] == "oidc|user-123"
    assert len(auth_methods) == 1
    assert auth_methods[0]["method_type"] == "sso"
    assert auth_methods[0]["provider"] == "oidc"
    assert auth_methods[0]["can_recover"] is False
    assert boundary["provider_connections"] == []
    assert boundary["summary"]["linked_provider_count"] == 0


def test_provider_connections_are_capabilities_not_identity(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("providers@example.com", "password-123", name="Provider User")
    user_id = created["user"]["id"]

    active_connection = auth.upsert_user_provider_connection(
        user_id,
        provider="openai",
        status="active",
        external_account_id="acct-openai-1",
        metadata={"capability_role": "ai_provider"},
    )
    active_boundary = auth.user_identity_boundary(user_id)

    assert active_connection["provider"] == "openai"
    assert active_boundary["summary"]["linked_provider_count"] == 1
    assert active_boundary["summary"]["has_recovery_method"] is True

    disconnected_connection = auth.upsert_user_provider_connection(
        user_id,
        provider="openai",
        status="disconnected",
        external_account_id="acct-openai-1",
        metadata={"capability_role": "ai_provider"},
    )
    disconnected_boundary = auth.user_identity_boundary(user_id)
    logged_in = auth.login_user("providers@example.com", "password-123")

    assert disconnected_connection["status"] == "disconnected"
    assert disconnected_boundary["summary"]["linked_provider_count"] == 0
    assert disconnected_boundary["provider_connections"][0]["status"] == "disconnected"
    assert logged_in["user"]["id"] == user_id
    assert logged_in["identity_boundary"]["account_owner"] == "empyralis"


def test_provider_connections_remain_workspace_scoped(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("providers.scoped@example.com", "password-123", name="Scoped Provider User")
    user_id = created["user"]["id"]
    workspace_a = created["workspace_access"][0]["workspace_id"]
    workspace_b = f"lab-{tmp_path.name}"
    if workspace_b == workspace_a:
        workspace_b = f"{workspace_b}-secondary"
    auth.ensure_workspace_tenant_binding(workspace_b, created["workspace_access"][0]["tenant_id"])
    auth.upsert_workspace_membership(user_id, workspace_b, "member")

    first = auth.upsert_user_provider_connection(
        user_id,
        provider="openai",
        workspace_id=workspace_a,
        status="active",
        external_account_id="acct-shared",
    )
    second = auth.upsert_user_provider_connection(
        user_id,
        provider="openai",
        workspace_id=workspace_b,
        status="active",
        external_account_id="acct-shared",
    )
    boundary = auth.user_identity_boundary(user_id)

    assert first["workspace_id"] == workspace_a
    assert second["workspace_id"] == workspace_b
    assert len(boundary["provider_connections"]) == 2
    assert boundary["summary"]["linked_provider_count"] == 2


def test_membership_change_invalidates_existing_bearer_token(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("membership.invalidate@example.com", "password-123", name="Membership User")
    user_id = created["user"]["id"]
    auth.ensure_workspace_tenant_binding(f"ops-{tmp_path.name}", created["workspace_access"][0]["tenant_id"])

    auth.upsert_workspace_membership(user_id, f"ops-{tmp_path.name}", "viewer")

    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_Request(), authorization=f"Bearer {created['token']}")

    assert exc.value.status_code == 401
    assert exc.value.detail == "Bearer token is stale and must be refreshed."


def test_revoked_bearer_session_fails_closed(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("session.revoke@example.com", "password-123", name="Session User")
    session_id = created["auth_session"]["session_id"]

    revoked = auth.revoke_auth_session(session_id, reason="manual_revoke")

    assert revoked["status"] == "revoked"
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_Request(), authorization=f"Bearer {created['token']}")

    assert exc.value.status_code == 401
    assert exc.value.detail == "Bearer session is no longer active."


def test_revoked_device_link_blocks_bound_mobile_session(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("device.revoke@example.com", "password-123", name="Device User")
    user_id = created["user"]["id"]
    workspace_access = list(created["workspace_access"])
    workspace_id = workspace_access[0]["workspace_id"]
    device = auth.upsert_user_device_link(
        user_id,
        device_id="device-1",
        workspace_id=workspace_id,
        channel="mobile",
        platform="ios",
        trust_state="verified",
        metadata={"pairing_method": "qr"},
    )
    token = auth.issue_token(
        user_id,
        email=created["user"]["email"],
        role="owner",
        workspace_access=workspace_access,
        channel="mobile",
        device_id=device["device_id"],
        session_metadata={"auth_flow": "pairing"},
    )

    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {token}")
    assert current_user["device_id"] == "device-1"

    revoked = auth.revoke_user_device_link(user_id, "device-1", reason="device_unlinked")

    assert revoked["status"] == "revoked"
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(_Request(), authorization=f"Bearer {token}")

    assert exc.value.status_code == 401
    assert exc.value.detail in {
        "Bearer session is no longer active.",
        "Bearer session device is not active.",
    }


def test_authenticated_profile_includes_identity_boundary(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("profile.identity@example.com", "password-123", name="Profile User")
    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {created['token']}")

    profile = auth.get_authenticated_user_profile(current_user)

    assert profile["identity_boundary"]["account_owner"] == "empyralis"
    assert profile["identity_boundary"]["account_id"] == created["user"]["id"]
    assert profile["identity_boundary"]["auth_methods"][0]["provider"] == "empyralis_password"
    assert profile["auth_session"]["session_id"] == created["auth_session"]["session_id"]
    assert profile["identity_versions"]["membership_version"] >= 1



def _build_auth_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(routes_auth_module.router)
    app.include_router(routes_auth_module.router, prefix="/api/v1")
    return app


@pytest.mark.anyio
async def test_auth_status_returns_401_without_token():
    transport = httpx.ASGITransport(app=_build_auth_test_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/auth/status")

    assert response.status_code == 401


@pytest.mark.anyio
async def test_auth_status_returns_authenticated_payload(monkeypatch: pytest.MonkeyPatch):
    app = _build_auth_test_app()
    app.dependency_overrides[routes_auth_module.get_current_user] = lambda: {"auth_type": "bearer", "user_id": "user-1"}
    monkeypatch.setattr(
        routes_auth_module,
        "get_authenticated_user_profile",
        lambda current_user: {"ok": True, "user": {"id": "user-1", "email": "user@example.com"}},
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/auth/status")

    assert response.status_code == 200
    assert response.json() == {
        "authenticated": True,
        "user": {"id": "user-1", "email": "user@example.com"},
    }


@pytest.mark.anyio
async def test_auth_enterprise_status_returns_enterprise_summary(monkeypatch: pytest.MonkeyPatch):
    app = _build_auth_test_app()
    app.dependency_overrides[routes_auth_module.get_current_user] = lambda: {
        "auth_type": "bearer",
        "user_id": "user-1",
        "workspace_access": {"default": {"tenant_id": "tenant-acme"}},
    }
    monkeypatch.setattr(
        routes_auth_module,
        "enterprise_status_for_user",
        lambda current_user: {
            "ok": True,
            "summary": {"sso_enabled": True, "mfa_required": True, "mfa_enrolled": False, "scim_enabled": True},
            "user": {"user_id": "user-1", "mfa_enrolled": False},
            "tenants": [{"tenant_id": "tenant-acme"}],
        },
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/auth/enterprise/status")

    assert response.status_code == 200
    assert response.json()["summary"]["mfa_required"] is True


@pytest.mark.anyio
async def test_admin_enterprise_config_endpoints(monkeypatch: pytest.MonkeyPatch):
    app = _build_auth_test_app()
    app.dependency_overrides[routes_auth_module.require_admin_access] = lambda: {"auth_type": "api_key", "is_admin": True, "role": "owner"}
    monkeypatch.setattr(
        routes_auth_module,
        "load_tenant_enterprise_settings",
        lambda tenant_id: {"tenant_id": tenant_id, "sso": {"enabled": False}, "mfa": {"required": False}, "scim": {"enabled": False}},
    )
    monkeypatch.setattr(
        routes_auth_module,
        "upsert_tenant_enterprise_settings",
        lambda tenant_id, sso=None, mfa=None, scim=None: {
            "tenant_id": tenant_id,
            "sso": {"enabled": bool((sso or {}).get("enabled"))},
            "mfa": {"required": bool((mfa or {}).get("required"))},
            "scim": {"enabled": bool((scim or {}).get("enabled"))},
        },
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        get_response = await client.get("/api/v1/auth/admin/enterprise-config", params={"tenant_id": "tenant-acme"})
        patch_response = await client.patch(
            "/api/v1/auth/admin/enterprise-config",
            json={
                "tenant_id": "tenant-acme",
                "sso": {"enabled": True},
                "mfa": {"required": True},
                "scim": {"enabled": True},
            },
        )

    assert get_response.status_code == 200
    assert get_response.json()["config"]["tenant_id"] == "tenant-acme"
    assert patch_response.status_code == 200
    assert patch_response.json()["config"]["sso"]["enabled"] is True
    assert patch_response.json()["config"]["mfa"]["required"] is True
    assert patch_response.json()["config"]["scim"]["enabled"] is True


@pytest.mark.anyio
async def test_admin_provision_user_endpoint(monkeypatch: pytest.MonkeyPatch):
    app = _build_auth_test_app()
    app.dependency_overrides[routes_auth_module.require_admin_access] = lambda: {"auth_type": "api_key", "is_admin": True, "role": "owner"}
    monkeypatch.setattr(
        routes_auth_module,
        "provision_user_account",
        lambda **kwargs: {"ok": True, "user": {"email": kwargs["email"]}, "workspace_access": [{"workspace_id": "finance"}]},
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/auth/admin/provision/users",
            json={
                "email": "provisioned@example.com",
                "tenant_id": "tenant-acme",
                "workspace_roles": {"finance": "viewer"},
                "provisioning_source": "admin_api",
            },
        )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "provisioned@example.com"
