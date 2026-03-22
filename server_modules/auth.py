from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException, Request

from server_modules.runtime_config import EMPYRALIS_STATE_HOME, ORION_API_KEY, ORION_AUTH_REQUIRED


AUTH_USERS_FILE = (EMPYRALIS_STATE_HOME / "auth" / "users.json").expanduser()
AUTH_LOCK = threading.Lock()
LOGIN_RATE_LIMIT_LOCK = threading.Lock()
LOGIN_RATE_LIMIT_BUCKETS: Dict[str, list[float]] = {}
USER_RATE_LIMIT_LOCK = threading.Lock()
USER_RATE_LIMIT_BUCKETS: Dict[str, list[float]] = {}
JWT_EXP_SECONDS = int(os.getenv("ORION_JWT_EXP_SECONDS", "3600"))


def _jwt_secret() -> str:
    secret = str(os.getenv("ORION_JWT_SECRET") or ORION_API_KEY or "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="JWT secret is not configured.")
    return secret


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("utf-8")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))


def _load_users() -> Dict[str, Any]:
    if not AUTH_USERS_FILE.exists():
        return {"users": []}
    try:
        payload = json.loads(AUTH_USERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"users": []}
    if not isinstance(payload, dict) or not isinstance(payload.get("users"), list):
        return {"users": []}
    return payload


def _save_users(payload: Dict[str, Any]) -> None:
    AUTH_USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    AUTH_USERS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


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
        payload = _load_users()
        for user in payload.get("users", []):
            if isinstance(user, dict) and str(user.get("email") or "").strip().lower() == email_token:
                return dict(user)
    return None


def issue_token(user_id: str, *, email: Optional[str] = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": str(email or "").strip().lower() or None,
        "iat": now,
        "exp": now + JWT_EXP_SECONDS,
    }
    header_segment = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = hmac.new(_jwt_secret().encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"


def verify_token(token: str) -> str:
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
    user_id = str(payload.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Bearer token subject is missing.")
    exp = int(payload.get("exp") or 0)
    if exp and exp < int(time.time()):
        raise HTTPException(status_code=401, detail="Bearer token has expired.")
    return user_id


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
    with AUTH_LOCK:
        payload = _load_users()
        users = payload.get("users", [])
        for user in users:
            if isinstance(user, dict) and str(user.get("email") or "").strip().lower() == email_token:
                raise HTTPException(status_code=409, detail="User already exists.")
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": email_token,
            "name": str(name or "").strip() or None,
            "password_hash": _hash_password(password),
            "created_at": int(time.time()),
        }
        users.append(user)
        payload["users"] = users
        _save_users(payload)
    return {
        "ok": True,
        "user": {"id": user_id, "email": email_token, "name": user.get("name")},
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
    if not ORION_AUTH_REQUIRED:
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
        user_id = verify_token(auth_header[7:].strip())
        _enforce_window_limit(
            buckets=USER_RATE_LIMIT_BUCKETS,
            lock=USER_RATE_LIMIT_LOCK,
            key=f"user:{user_id}",
            limit=60,
        )
        return {"user_id": user_id, "auth_type": "bearer"}

    expected_api_key = str(ORION_API_KEY or "").strip()
    provided_api_key = str(x_api_key or "").strip()
    if expected_api_key and provided_api_key and secrets.compare_digest(provided_api_key, expected_api_key):
        _enforce_window_limit(
            buckets=USER_RATE_LIMIT_BUCKETS,
            lock=USER_RATE_LIMIT_LOCK,
            key="user:service",
            limit=60,
        )
        return {"user_id": "service", "auth_type": "api_key"}

    raise HTTPException(status_code=401, detail="Authentication required.")
