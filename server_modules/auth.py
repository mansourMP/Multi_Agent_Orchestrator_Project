from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, Request
from server_modules.jwt_secret import resolve_jwt_secret

EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
AUTH_DB_FILE = (EMPYRALIS_STATE_HOME / "auth" / "users.db").expanduser()
AUTH_LOCK = threading.Lock()
LOGIN_RATE_LIMIT_LOCK = threading.Lock()
LOGIN_RATE_LIMIT_BUCKETS: Dict[str, list[float]] = {}
USER_RATE_LIMIT_LOCK = threading.Lock()
USER_RATE_LIMIT_BUCKETS: Dict[str, list[float]] = {}
JWT_EXP_SECONDS = int(os.getenv("ORION_JWT_EXP_SECONDS", "3600"))
ORION_PUBLIC_REGISTRATION_ENABLED = str(os.getenv("ORION_PUBLIC_REGISTRATION_ENABLED", "0")).strip().lower() in {"1", "true", "yes", "on"}
ORION_ADMIN_USER_IDS = {item.strip() for item in str(os.getenv("ORION_ADMIN_USER_IDS", "")).split(",") if item.strip()}
ORION_ADMIN_EMAILS = {item.strip().lower() for item in str(os.getenv("ORION_ADMIN_EMAILS", "")).split(",") if item.strip()}
ORION_DEFAULT_WORKSPACE_IDS = tuple(
    item.strip() for item in str(os.getenv("ORION_DEFAULT_WORKSPACE_IDS", "default")).split(",") if item.strip()
) or ("default",)
ORION_SERVICE_RATE_LIMIT_PER_MINUTE = int(os.getenv("ORION_SERVICE_RATE_LIMIT_PER_MINUTE", "600"))


def _orion_api_key() -> str:
    return str(os.getenv("ORION_API_KEY") or "").strip()


def _orion_auth_required() -> bool:
    raw = os.getenv("ORION_AUTH_REQUIRED")
    return (str(raw).strip() != "0") if raw is not None else True


def _jwt_secret() -> str:
    secret = str(resolve_jwt_secret() or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="JWT secret is not configured.")
    return secret


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _connect_auth_db() -> sqlite3.Connection:
    AUTH_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(AUTH_DB_FILE)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    connection.commit()
    return connection


def _hash_password(password: str, *, salt: Optional[bytes] = None) -> str:
    salt_bytes = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 100_000)
    return f"{_b64url_encode(salt_bytes)}.{_b64url_encode(digest)}"


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_raw, digest_raw = str(password_hash or "").split(".", 1)
        candidate = _hash_password(password, salt=_b64url_decode(salt_raw))
    except Exception:
        return False
    return secrets.compare_digest(candidate, password_hash)


def _find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    email_token = str(email or "").strip().lower()
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                "SELECT id, email, name, password_hash, created_at FROM users WHERE lower(email) = lower(?)",
                (email_token,),
            ).fetchone()
        if row is not None:
            return dict(row)
    return None


def issue_token(user_id: str, *, email: Optional[str] = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": str(email or "").strip().lower() or None,
        "workspace_ids": list(ORION_DEFAULT_WORKSPACE_IDS),
        "iat": now,
        "exp": now + JWT_EXP_SECONDS,
    }
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(_jwt_secret().encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"


def _decode_token_payload(token: str) -> Dict[str, Any]:
    try:
        header_segment, payload_segment, signature_segment = str(token or "").split(".", 2)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token.") from exc
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    expected_signature = hmac.new(_jwt_secret().encode("utf-8"), signing_input, hashlib.sha256).digest()
    provided_signature = _b64url_decode(signature_segment)
    if not secrets.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=401, detail="Invalid bearer token.")
    try:
        payload = json.loads(_b64url_decode(payload_segment).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token payload.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid bearer token payload.")
    return payload


def verify_token(token: str) -> str:
    payload = _decode_token_payload(token)
    user_id = str(payload.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Bearer token subject is missing.")
    exp = int(payload.get("exp") or 0)
    if exp and exp < int(time.time()):
        raise HTTPException(status_code=401, detail="Bearer token has expired.")
    return user_id


def _normalize_workspace_ids_claim(value: Any) -> list[str]:
    items: list[str] = []
    if isinstance(value, str):
        items = [part.strip() for part in value.split(",") if part.strip()]
    elif isinstance(value, (list, tuple, set)):
        items = [str(part or "").strip() for part in value if str(part or "").strip()]
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        token = item.strip()
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized or list(ORION_DEFAULT_WORKSPACE_IDS)


def allowed_workspace_ids(user: Optional[Dict[str, Any]]) -> Optional[set[str]]:
    if not isinstance(user, dict):
        return None
    if bool(user.get("is_admin")):
        return None
    if str(user.get("auth_type") or "").strip() == "api_key":
        return None
    values = user.get("workspace_ids")
    normalized = _normalize_workspace_ids_claim(values)
    return set(normalized)


def enforce_workspace_access(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> str:
    token = str(workspace_id or "").strip() or "default"
    allowed = allowed_workspace_ids(current_user)
    if allowed is None:
        return token
    if token not in allowed:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    return token


def _enforce_window_limit(*, buckets: Dict[str, list[float]], lock: threading.Lock, key: str, limit: int) -> None:
    now = time.time()
    with lock:
        bucket = buckets.get(key, [])
        cutoff = now - 60.0
        bucket = [item for item in bucket if item >= cutoff]
        if len(bucket) >= limit:
            retry_after = max(1, int(round(bucket[0] + 60.0 - now)))
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        buckets[key] = bucket


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if isinstance(forwarded, str) and forwarded.strip():
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def limit_login_requests(request: Request) -> None:
    _enforce_window_limit(
        buckets=LOGIN_RATE_LIMIT_BUCKETS,
        lock=LOGIN_RATE_LIMIT_LOCK,
        key=_client_ip(request),
        limit=5,
    )


def limit_public_requests(request: Request) -> None:
    _enforce_window_limit(
        buckets=USER_RATE_LIMIT_BUCKETS,
        lock=USER_RATE_LIMIT_LOCK,
        key=f"public:{_client_ip(request)}",
        limit=60,
    )


def register_user(email: str, password: str, *, name: Optional[str] = None) -> Dict[str, Any]:
    email_token = str(email or "").strip().lower()
    if not email_token or "@" not in email_token:
        raise HTTPException(status_code=400, detail="Valid email is required.")
    if not isinstance(password, str) or len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    user_id = str(uuid.uuid4())
    created_at = int(time.time())
    user_name = str(name or "").strip() or None
    password_hash = _hash_password(password)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            existing = connection.execute(
                "SELECT id FROM users WHERE lower(email) = lower(?)",
                (email_token,),
            ).fetchone()
            if existing is not None:
                raise HTTPException(status_code=409, detail="User already exists.")
            connection.execute(
                "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, email_token, user_name, password_hash, created_at),
            )
            connection.commit()
    return {
        "ok": True,
        "user": {"id": user_id, "email": email_token, "name": user_name},
        "token": issue_token(user_id, email=email_token),
    }


def login_user(email: str, password: str) -> Dict[str, Any]:
    user = _find_user_by_email(email)
    if not user or not _verify_password(password, str(user.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user record.")
    return {
        "ok": True,
        "user": {"id": user_id, "email": str(user.get("email") or ""), "name": user.get("name")},
        "token": issue_token(user_id, email=str(user.get("email") or "")),
    }


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> Dict[str, Any]:
    if not _orion_auth_required():
        user = {"user_id": "anonymous", "auth_type": "disabled"}
        _enforce_window_limit(
            buckets=USER_RATE_LIMIT_BUCKETS,
            lock=USER_RATE_LIMIT_LOCK,
            key="user:anonymous",
            limit=60,
        )
        return user

    auth_header = str(authorization or "").strip()
    if auth_header.lower().startswith("bearer "):
        payload = _decode_token_payload(auth_header[7:].strip())
        user_id = str(payload.get("sub") or "").strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="Bearer token subject is missing.")
        exp = int(payload.get("exp") or 0)
        if exp and exp < int(time.time()):
            raise HTTPException(status_code=401, detail="Bearer token has expired.")
        email = str(payload.get("email") or "").strip().lower() or None
        workspace_ids = _normalize_workspace_ids_claim(payload.get("workspace_ids"))
        _enforce_window_limit(
            buckets=USER_RATE_LIMIT_BUCKETS,
            lock=USER_RATE_LIMIT_LOCK,
            key=f"user:{user_id}",
            limit=60,
        )
        return {"user_id": user_id, "auth_type": "bearer", "email": email, "workspace_ids": workspace_ids}

    expected_api_key = _orion_api_key()
    provided_api_key = str(x_api_key or "").strip()
    if expected_api_key and provided_api_key and secrets.compare_digest(provided_api_key, expected_api_key):
        if ORION_SERVICE_RATE_LIMIT_PER_MINUTE > 0:
            _enforce_window_limit(
                buckets=USER_RATE_LIMIT_BUCKETS,
                lock=USER_RATE_LIMIT_LOCK,
                key="user:service",
                limit=ORION_SERVICE_RATE_LIMIT_PER_MINUTE,
            )
        return {"user_id": "service", "auth_type": "api_key", "email": None}

    raise HTTPException(status_code=401, detail="Authentication required.")


def ensure_public_registration_enabled() -> bool:
    if not ORION_PUBLIC_REGISTRATION_ENABLED:
        raise HTTPException(status_code=404, detail="Public registration is disabled.")
    return True


def require_admin_access(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> Dict[str, Any]:
    user = get_current_user(
        request=request,
        authorization=authorization,
        x_api_key=x_api_key,
    )
    if not _orion_auth_required():
        user["is_admin"] = True
        return user
    if str(user.get("auth_type") or "").strip() == "api_key":
        user["is_admin"] = True
        return user
    user_id = str(user.get("user_id") or "").strip()
    email = str(user.get("email") or "").strip().lower()
    if user_id and user_id in ORION_ADMIN_USER_IDS:
        user["is_admin"] = True
        return user
    if email and email in ORION_ADMIN_EMAILS:
        user["is_admin"] = True
        return user
    raise HTTPException(status_code=403, detail="Admin access required.")
