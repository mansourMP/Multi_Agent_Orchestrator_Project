from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from starlette.responses import Response

from server_modules import auth
from server_modules import routes_auth


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(routes_auth.router)
    return app


def _browser_payload(channel: str = "web") -> dict[str, object]:
    return {
        "ok": True,
        "token": "header.payload.signature",
        "auth_session": {
            "session_id": "session-1",
            "channel": channel,
        },
        "session_recovery": {
            "refresh_token": "refresh-token-1",
            "refresh_expires_at": 9999999999,
        },
        "user": {
            "id": "user-1",
            "email": "owner@example.com",
        },
    }


def _fake_set_auth_cookies(
    response: Response,
    payload: dict[str, object],
    *,
    request,
    channel: str = "web",
) -> None:
    response.set_cookie("empyralis_access_token", "access-cookie", httponly=True, path="/")
    response.set_cookie("empyralis_refresh_token", "refresh-cookie", httponly=True, path="/")
    response.set_cookie("empyralis_csrf_token", "csrf-cookie", httponly=False, path="/")


@pytest.mark.anyio
async def test_browser_login_sets_cookies_and_redacts_tokens(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    monkeypatch.setattr(routes_auth, "login_user", lambda *args, **kwargs: _browser_payload())
    monkeypatch.setattr(routes_auth, "set_auth_cookies", _fake_set_auth_cookies)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/auth/login",
            json={"email": "owner@example.com", "password": "password-123", "channel": "web"},
        )

    assert response.status_code == 200
    assert "token" not in response.json()
    assert "session_recovery" not in response.json()
    set_cookie_headers = response.headers.get_list("set-cookie")
    assert any("empyralis_access_token=" in header for header in set_cookie_headers)
    assert any("empyralis_refresh_token=" in header for header in set_cookie_headers)
    assert any("empyralis_csrf_token=" in header for header in set_cookie_headers)


@pytest.mark.anyio
async def test_browser_refresh_requires_csrf_when_using_cookie_session():
    app = _build_app()
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/auth/refresh",
            json={"channel": "web"},
            cookies={
                "empyralis_access_token": "access-cookie",
                "empyralis_refresh_token": "refresh-cookie",
                "empyralis_csrf_token": "csrf-cookie",
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF validation failed."


@pytest.mark.anyio
async def test_browser_refresh_uses_cookie_refresh_token_and_sets_new_cookies(
    monkeypatch: pytest.MonkeyPatch,
):
    app = _build_app()
    observed: dict[str, object] = {}

    def fake_refresh_authenticated_session(refresh_token: str, **kwargs):
        observed["refresh_token"] = refresh_token
        return _browser_payload()

    monkeypatch.setattr(routes_auth, "refresh_authenticated_session", fake_refresh_authenticated_session)
    monkeypatch.setattr(routes_auth, "set_auth_cookies", _fake_set_auth_cookies)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/auth/refresh",
            json={"channel": "web"},
            headers={"x-csrf-token": "csrf-cookie"},
            cookies={
                "empyralis_access_token": "access-cookie",
                "empyralis_refresh_token": "refresh-cookie",
                "empyralis_csrf_token": "csrf-cookie",
            },
        )

    assert response.status_code == 200
    assert observed["refresh_token"] == "refresh-cookie"
    assert "token" not in response.json()
    assert any(
        "empyralis_access_token=" in header
        for header in response.headers.get_list("set-cookie")
    )


@pytest.mark.anyio
async def test_logout_clears_browser_cookies(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    app.dependency_overrides[routes_auth.get_current_user] = lambda: {
        "auth_type": "bearer",
        "user_id": "user-1",
        "session_id": "session-1",
    }
    monkeypatch.setattr(
        routes_auth,
        "logout_authenticated_session",
        lambda current_user: {"ok": True, "session_id": "session-1"},
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/auth/logout",
            headers={"x-csrf-token": "csrf-cookie"},
            cookies={
                "empyralis_access_token": "access-cookie",
                "empyralis_refresh_token": "refresh-cookie",
                "empyralis_csrf_token": "csrf-cookie",
            },
        )

    assert response.status_code == 200
    set_cookie_headers = response.headers.get_list("set-cookie")
    assert any("empyralis_access_token=" in header and "Max-Age=0" in header for header in set_cookie_headers)
    assert any("empyralis_refresh_token=" in header and "Max-Age=0" in header for header in set_cookie_headers)
    assert any("empyralis_csrf_token=" in header and "Max-Age=0" in header for header in set_cookie_headers)


@pytest.mark.anyio
async def test_auth_me_accepts_access_token_cookie(monkeypatch: pytest.MonkeyPatch):
    app = _build_app()
    monkeypatch.setattr(auth, "_orion_auth_required", lambda: True)
    monkeypatch.setattr(
        auth,
        "_decode_token_payload",
        lambda token: {
            "sub": "user-1",
            "email": "owner@example.com",
            "role": "member",
            "workspace_ids": ["ws-1"],
            "sid": "session-1",
            "channel": "web",
        },
    )
    monkeypatch.setattr(
        auth,
        "_validated_bearer_context",
        lambda payload, touch_session=False: {
            "user_id": "user-1",
            "email": "owner@example.com",
            "workspace_ids": ["ws-1"],
            "identity_versions": {"membership_version": 1},
            "auth_session": {"session_id": "session-1", "channel": "web"},
            "device_link": None,
        },
    )
    monkeypatch.setattr(auth, "_resolved_bearer_role", lambda user_id, email, claimed_role: "member")
    monkeypatch.setattr(
        auth,
        "_effective_workspace_access",
        lambda **kwargs: {
            "ws-1": {
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "role": "member",
            }
        },
    )
    monkeypatch.setattr(
        routes_auth,
        "get_authenticated_user_profile",
        lambda current_user: {"ok": True, "user": {"id": current_user["user_id"]}},
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/auth/me",
            cookies={"empyralis_access_token": "cookie-bearer-token"},
        )

    assert response.status_code == 200
    assert response.json()["user"]["id"] == "user-1"
