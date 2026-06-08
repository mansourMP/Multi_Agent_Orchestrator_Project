from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict
from urllib import parse as urlparse
from urllib import request as urlrequest

from fastapi import HTTPException, Request

from server_modules import connectors_actions
from server_modules.connectors import slack_connector
from server_modules.schemas import ConnectorCreate


_STATE_TTL_SECONDS = 600
_GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.file",
]
_GITHUB_SCOPES = ["repo", "read:user", "user:email"]
_LINEAR_SCOPES = ["read", "write"]
_DROPBOX_SCOPES = ["files.metadata.read", "files.content.read", "files.content.write", "sharing.read", "sharing.write"]
_MICROSOFT_SCOPES = [
    "offline_access",
    "User.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendars.ReadWrite",
    "Files.ReadWrite.All",
]


def _env_first(*names: str) -> str:
    for name in names:
        value = str(os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _state_secret() -> str:
    return _env_first(
        "CONNECTION_OAUTH_STATE_SECRET",
        "EMPYRALIS_CONNECTION_OAUTH_STATE_SECRET",
        "CREDENTIAL_VAULT_KEY",
        "ORION_AUTH_SECRET",
        "AUTH_SECRET",
    ) or "local-dev-connection-oauth-state"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = str(value or "").strip()
    padded += "=" * ((4 - len(padded) % 4) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _sign(payload_segment: str) -> str:
    return _b64url_encode(
        hmac.new(
            _state_secret().encode("utf-8"),
            payload_segment.encode("ascii"),
            hashlib.sha256,
        ).digest()
    )


def _encode_state(payload: Dict[str, Any]) -> str:
    body = {
        **payload,
        "iat": int(time.time()),
    }
    payload_segment = _b64url_encode(json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{payload_segment}.{_sign(payload_segment)}"


def decode_state(state: str) -> Dict[str, Any]:
    raw = str(state or "").strip()
    if "." not in raw:
        raise HTTPException(status_code=400, detail="OAuth state is invalid.")
    payload_segment, signature = raw.rsplit(".", 1)
    if not hmac.compare_digest(_sign(payload_segment), signature):
        raise HTTPException(status_code=400, detail="OAuth state is invalid.")
    try:
        payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="OAuth state is invalid.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="OAuth state is invalid.")
    issued_at = int(payload.get("iat") or 0)
    if issued_at <= 0 or int(time.time()) - issued_at > _STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="OAuth state expired. Start setup again.")
    return payload


def request_origin(request: Request) -> str:
    forwarded_proto = str(request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    forwarded_host = str(request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if forwarded_host:
        return f"{forwarded_proto or 'http'}://{forwarded_host}".rstrip("/")
    return str(request.base_url).rstrip("/")


def callback_url(request: Request, provider: str) -> str:
    return f"{request_origin(request)}/api/connections/oauth/{urlparse.quote(provider)}/callback"


def _connector_label(provider: str) -> str:
    return {
        "google_workspace": "Google Workspace",
        "github": "GitHub",
        "microsoft_365": "Microsoft 365",
        "slack": "Slack",
        "notion": "Notion",
        "linear": "Linear",
        "dropbox": "Dropbox",
    }.get(provider, provider.replace("_", " ").title())


def _provider_env(provider: str) -> tuple[str, str, tuple[str, ...], tuple[str, ...]]:
    if provider == "google_workspace":
        return (
            _env_first("GOOGLE_WORKSPACE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"),
            _env_first("GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"),
            ("GOOGLE_WORKSPACE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"),
            ("GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"),
        )
    if provider == "github":
        return (
            _env_first("GITHUB_OAUTH_CLIENT_ID", "GITHUB_CLIENT_ID"),
            _env_first("GITHUB_OAUTH_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"),
            ("GITHUB_OAUTH_CLIENT_ID", "GITHUB_CLIENT_ID"),
            ("GITHUB_OAUTH_CLIENT_SECRET", "GITHUB_CLIENT_SECRET"),
        )
    if provider == "microsoft_365":
        return (
            _env_first("MICROSOFT_365_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_CLIENT_ID"),
            _env_first("MICROSOFT_365_OAUTH_CLIENT_SECRET", "MICROSOFT_OAUTH_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"),
            ("MICROSOFT_365_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_CLIENT_ID"),
            ("MICROSOFT_365_OAUTH_CLIENT_SECRET", "MICROSOFT_OAUTH_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"),
        )
    if provider == "slack":
        return (
            _env_first("SLACK_CLIENT_ID"),
            _env_first("SLACK_CLIENT_SECRET"),
            ("SLACK_CLIENT_ID",),
            ("SLACK_CLIENT_SECRET",),
        )
    if provider == "notion":
        return (
            _env_first("NOTION_OAUTH_CLIENT_ID", "NOTION_CLIENT_ID"),
            _env_first("NOTION_OAUTH_CLIENT_SECRET", "NOTION_CLIENT_SECRET"),
            ("NOTION_OAUTH_CLIENT_ID", "NOTION_CLIENT_ID"),
            ("NOTION_OAUTH_CLIENT_SECRET", "NOTION_CLIENT_SECRET"),
        )
    if provider == "linear":
        return (
            _env_first("LINEAR_OAUTH_CLIENT_ID", "LINEAR_CLIENT_ID"),
            _env_first("LINEAR_OAUTH_CLIENT_SECRET", "LINEAR_CLIENT_SECRET"),
            ("LINEAR_OAUTH_CLIENT_ID", "LINEAR_CLIENT_ID"),
            ("LINEAR_OAUTH_CLIENT_SECRET", "LINEAR_CLIENT_SECRET"),
        )
    if provider == "dropbox":
        return (
            _env_first("DROPBOX_OAUTH_CLIENT_ID", "DROPBOX_CLIENT_ID", "DROPBOX_APP_KEY"),
            _env_first("DROPBOX_OAUTH_CLIENT_SECRET", "DROPBOX_CLIENT_SECRET", "DROPBOX_APP_SECRET"),
            ("DROPBOX_OAUTH_CLIENT_ID", "DROPBOX_CLIENT_ID", "DROPBOX_APP_KEY"),
            ("DROPBOX_OAUTH_CLIENT_SECRET", "DROPBOX_CLIENT_SECRET", "DROPBOX_APP_SECRET"),
        )
    raise HTTPException(status_code=409, detail=f"{_connector_label(provider)} OAuth is not wired yet.")


def ensure_oauth_configured(provider: str) -> tuple[str, str]:
    client_id, client_secret, client_names, secret_names = _provider_env(provider)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{_connector_label(provider)} OAuth is not configured. "
                f"Set {' or '.join(client_names)} and {' or '.join(secret_names)}."
            ),
        )
    return client_id, client_secret


def oauth_provider_configured(provider: str) -> bool:
    client_id, client_secret, _client_names, _secret_names = _provider_env(provider)
    return bool(client_id and client_secret)


def provider_from_connection_id(connection_id: str) -> str:
    normalized = str(connection_id or "").strip().lower()
    if normalized in {"google_workspace", "gmail", "google_calendar", "google_drive", "drive"}:
        return "google_workspace"
    if normalized == "github":
        return "github"
    if normalized in {"microsoft_365", "outlook", "outlook_calendar"}:
        return "microsoft_365"
    if normalized == "slack":
        return "slack"
    if normalized == "notion":
        return "notion"
    if normalized == "linear":
        return "linear"
    if normalized == "dropbox":
        return "dropbox"
    raise HTTPException(status_code=409, detail="This connection does not have a one-click OAuth setup yet.")


def oauth_connection_configured(connection_id: str) -> bool:
    return oauth_provider_configured(provider_from_connection_id(connection_id))


def _microsoft_tenant() -> str:
    return _env_first(
        "MICROSOFT_365_OAUTH_TENANT_ID",
        "MICROSOFT_OAUTH_TENANT_ID",
        "MICROSOFT_TENANT_ID",
    ) or "common"


def start_oauth(
    *,
    provider: str,
    workspace_id: str,
    surface: str | None,
    request: Request,
) -> Dict[str, Any]:
    client_id, _client_secret = ensure_oauth_configured(provider)
    redirect_uri = callback_url(request, provider)
    state = _encode_state({
        "provider": provider,
        "workspace_id": workspace_id,
        "surface": str(surface or "sage").strip() or "sage",
    })
    if provider == "google_workspace":
        authorization_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlparse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(_GOOGLE_SCOPES),
            "access_type": "offline",
            "prompt": "consent select_account",
            "state": state,
        })
    elif provider == "github":
        authorization_url = "https://github.com/login/oauth/authorize?" + urlparse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(_GITHUB_SCOPES),
            "state": state,
        })
    elif provider == "microsoft_365":
        tenant = urlparse.quote(_microsoft_tenant().strip() or "common")
        authorization_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?" + urlparse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(_MICROSOFT_SCOPES),
            "prompt": "select_account",
            "state": state,
        })
    elif provider == "slack":
        authorization_url = slack_connector.oauth_authorize_url(
            redirect_uri,
            state=state,
            client_id=client_id,
        )
    elif provider == "notion":
        authorization_url = "https://api.notion.com/v1/oauth/authorize?" + urlparse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "owner": "user",
            "state": state,
        })
    elif provider == "linear":
        authorization_url = "https://linear.app/oauth/authorize?" + urlparse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": ",".join(_LINEAR_SCOPES),
            "state": state,
        })
    elif provider == "dropbox":
        authorization_url = "https://www.dropbox.com/oauth2/authorize?" + urlparse.urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "token_access_type": "offline",
            "scope": " ".join(_DROPBOX_SCOPES),
            "state": state,
        })
    else:
        raise HTTPException(status_code=409, detail="This connection does not have a one-click OAuth setup yet.")
    return {
        "ok": True,
        "next_action": "oauth_redirect",
        "provider": provider,
        "authorization_url": authorization_url,
        "redirect_uri": redirect_uri,
        "expires_in_seconds": _STATE_TTL_SECONDS,
    }


def _post_form_json(url: str, payload: Dict[str, Any], *, headers: Dict[str, str] | None = None) -> Dict[str, Any]:
    request_headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        **(headers or {}),
    }
    req = urlrequest.Request(
        url,
        data=urlparse.urlencode(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
    parsed = json.loads(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise RuntimeError("OAuth token response was invalid.")
    return parsed


def _post_json(url: str, payload: Dict[str, Any], *, headers: Dict[str, str] | None = None) -> Dict[str, Any]:
    request_headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        **(headers or {}),
    }
    req = urlrequest.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=30) as response:
        raw = response.read().decode("utf-8")
    parsed = json.loads(raw) if raw else {}
    if not isinstance(parsed, dict):
        raise RuntimeError("OAuth token response was invalid.")
    return parsed


def _exchange_google(code: str, redirect_uri: str) -> Dict[str, Any]:
    client_id, client_secret = ensure_oauth_configured("google_workspace")
    payload = _post_form_json(
        "https://oauth2.googleapis.com/token",
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError(str(payload.get("error_description") or payload.get("error") or "Google token exchange failed."))
    expires_in = int(payload.get("expires_in") or 0)
    credentials: Dict[str, Any] = {
        "auth_mode": "oauth",
        "access_token": access_token,
        "token_type": str(payload.get("token_type") or "Bearer").strip() or "Bearer",
        "scope": str(payload.get("scope") or "").strip(),
    }
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if refresh_token:
        credentials["refresh_token"] = refresh_token
    if expires_in > 0:
        credentials["access_token_expires_at"] = int(time.time()) + expires_in
    return credentials


def _exchange_github(code: str, redirect_uri: str) -> Dict[str, Any]:
    client_id, client_secret = ensure_oauth_configured("github")
    payload = _post_form_json(
        "https://github.com/login/oauth/access_token",
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        },
    )
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError(str(payload.get("error_description") or payload.get("error") or "GitHub token exchange failed."))
    return {
        "auth_mode": "oauth",
        "access_token": access_token,
        "scope": str(payload.get("scope") or "").strip(),
        "token_type": str(payload.get("token_type") or "bearer").strip() or "bearer",
    }


def _exchange_microsoft(code: str, redirect_uri: str) -> Dict[str, Any]:
    client_id, client_secret = ensure_oauth_configured("microsoft_365")
    tenant = urlparse.quote(_microsoft_tenant().strip() or "common")
    payload = _post_form_json(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": " ".join(_MICROSOFT_SCOPES),
        },
    )
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError(str(payload.get("error_description") or payload.get("error") or "Microsoft 365 token exchange failed."))
    expires_in = int(payload.get("expires_in") or 0)
    credentials: Dict[str, Any] = {
        "auth_mode": "oauth",
        "access_token": access_token,
        "token_type": str(payload.get("token_type") or "Bearer").strip() or "Bearer",
        "scope": str(payload.get("scope") or "").strip(),
    }
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if refresh_token:
        credentials["refresh_token"] = refresh_token
    if expires_in > 0:
        credentials["access_token_expires_at"] = int(time.time()) + expires_in
    return credentials


def _exchange_slack(code: str, redirect_uri: str) -> Dict[str, Any]:
    exchange = slack_connector.exchange_oauth_code(code, redirect_uri)
    credentials = exchange.get("credentials") if isinstance(exchange.get("credentials"), dict) else {}
    if not credentials.get("bot_token"):
        raise RuntimeError("Slack OAuth did not return a bot token.")
    return credentials


def _exchange_notion(code: str, redirect_uri: str) -> Dict[str, Any]:
    client_id, client_secret = ensure_oauth_configured("notion")
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    payload = _post_json(
        "https://api.notion.com/v1/oauth/token",
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        headers={"Authorization": f"Basic {auth}"},
    )
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError(str(payload.get("error_description") or payload.get("error") or "Notion token exchange failed."))
    return {
        "auth_mode": "oauth",
        "access_token": access_token,
        "workspace_id": str(payload.get("workspace_id") or "").strip(),
        "workspace_name": str(payload.get("workspace_name") or "").strip(),
        "bot_id": str(payload.get("bot_id") or "").strip(),
        "token_type": str(payload.get("token_type") or "Bearer").strip() or "Bearer",
    }


def _exchange_linear(code: str, redirect_uri: str) -> Dict[str, Any]:
    client_id, client_secret = ensure_oauth_configured("linear")
    payload = _post_form_json(
        "https://api.linear.app/oauth/token",
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError(str(payload.get("error_description") or payload.get("error") or "Linear token exchange failed."))
    return {
        "auth_mode": "oauth",
        "access_token": access_token,
        "scope": str(payload.get("scope") or "").strip(),
        "token_type": str(payload.get("token_type") or "Bearer").strip() or "Bearer",
    }


def _exchange_dropbox(code: str, redirect_uri: str) -> Dict[str, Any]:
    client_id, client_secret = ensure_oauth_configured("dropbox")
    payload = _post_form_json(
        "https://api.dropboxapi.com/oauth2/token",
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise RuntimeError(str(payload.get("error_description") or payload.get("error") or "Dropbox token exchange failed."))
    expires_in = int(payload.get("expires_in") or 0)
    credentials: Dict[str, Any] = {
        "auth_mode": "oauth",
        "access_token": access_token,
        "account_id": str(payload.get("account_id") or "").strip(),
        "scope": str(payload.get("scope") or "").strip(),
        "token_type": str(payload.get("token_type") or "Bearer").strip() or "Bearer",
    }
    refresh_token = str(payload.get("refresh_token") or "").strip()
    if refresh_token:
        credentials["refresh_token"] = refresh_token
    if expires_in > 0:
        credentials["access_token_expires_at"] = int(time.time()) + expires_in
    return credentials


async def complete_oauth_callback(
    *,
    provider: str,
    code: str,
    state: str,
    request: Request,
) -> Dict[str, Any]:
    normalized_provider = provider_from_connection_id(provider)
    payload = decode_state(state)
    if str(payload.get("provider") or "").strip().lower() != normalized_provider:
        raise HTTPException(status_code=400, detail="OAuth state does not match this provider.")
    workspace_id = str(payload.get("workspace_id") or "").strip()
    if not workspace_id:
        raise HTTPException(status_code=400, detail="OAuth workspace is missing.")
    normalized_code = str(code or "").strip()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="OAuth code is missing.")
    redirect_uri = callback_url(request, normalized_provider)
    try:
        if normalized_provider == "google_workspace":
            credentials = _exchange_google(normalized_code, redirect_uri)
        elif normalized_provider == "github":
            credentials = _exchange_github(normalized_code, redirect_uri)
        elif normalized_provider == "microsoft_365":
            credentials = _exchange_microsoft(normalized_code, redirect_uri)
        elif normalized_provider == "slack":
            credentials = _exchange_slack(normalized_code, redirect_uri)
        elif normalized_provider == "notion":
            credentials = _exchange_notion(normalized_code, redirect_uri)
        elif normalized_provider == "linear":
            credentials = _exchange_linear(normalized_code, redirect_uri)
        elif normalized_provider == "dropbox":
            credentials = _exchange_dropbox(normalized_code, redirect_uri)
        else:
            raise HTTPException(status_code=409, detail="This connection does not have a one-click OAuth setup yet.")
        result = await connectors_actions.create_connector_vault(
            ConnectorCreate(
                label=_connector_label(normalized_provider),
                connector=normalized_provider,
                workspace_id=workspace_id,
                credentials=credentials,
                metadata={
                    "source": "connection_oauth",
                    "oauth_provider": normalized_provider,
                    "surface": str(payload.get("surface") or "sage").strip() or "sage",
                },
            )
        )
        return {
            "ok": True,
            "provider": normalized_provider,
            "workspace_id": workspace_id,
            "connector": result,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
