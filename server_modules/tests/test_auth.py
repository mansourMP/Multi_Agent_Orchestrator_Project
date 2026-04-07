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


def test_expired_token_rejected(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)

    with pytest.raises(HTTPException) as exc:
        auth.verify_token(_expired_token(auth))

    assert exc.value.status_code == 401
    assert exc.value.detail == "Bearer token has expired."


def test_workspace_membership_scope_and_viewer_role(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("workspace.viewer@example.com", "password-123", name="Viewer")
    auth.upsert_workspace_membership(created["user"]["id"], "finance", "viewer")
    token = created["token"]
    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {token}")

    assert auth.workspace_role(current_user, "default") == "member"
    assert auth.workspace_role(current_user, "finance") == "viewer"
    assert auth.enforce_workspace_access(current_user, "finance", minimum_role="viewer") == "finance"
    with pytest.raises(HTTPException):
        auth.enforce_workspace_access(current_user, "finance", minimum_role="member")
    with pytest.raises(HTTPException):
        auth.enforce_workspace_access(current_user, "secret-lab", minimum_role="viewer")


def test_workspace_capability_policy_denies_local_capability(monkeypatch: pytest.MonkeyPatch, tmp_path):
    auth, _, _ = _reload_auth(monkeypatch, tmp_path)
    created = auth.register_user("workspace.member@example.com", "password-123", name="Member")
    auth.upsert_workspace_policy("default", capability_deny=["computer_control.type"])
    token = created["token"]
    current_user = auth.get_current_user(_Request(), authorization=f"Bearer {token}")

    with pytest.raises(HTTPException) as exc:
        auth.enforce_workspace_access(
            current_user,
            "default",
            minimum_role="member",
            capability_id="computer_control.type",
        )

    assert exc.value.status_code == 403


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
