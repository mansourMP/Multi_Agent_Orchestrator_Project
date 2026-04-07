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
from typing import Any, Dict, List, Optional

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
RBAC_ROLE_ORDER = {"viewer": 0, "member": 1, "owner": 2}
WORKSPACE_CAPABILITY_ALL = "*"


def normalize_rbac_role(value: Any, *, default: str = "member") -> str:
    token = str(value or "").strip().lower()
    if token in RBAC_ROLE_ORDER:
        return token
    fallback = str(default or "member").strip().lower()
    return fallback if fallback in RBAC_ROLE_ORDER else "member"


def _normalize_workspace_token(value: Any, *, default: str = "default") -> str:
    token = str(value or "").strip()
    return token or str(default or "default").strip() or "default"


def _normalize_distinct_tokens(value: Any) -> list[str]:
    items: list[str] = []
    if isinstance(value, str):
        raw = str(value).strip()
        if raw.startswith("[") and raw.endswith("]"):
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = None
            if isinstance(parsed, list):
                value = parsed
        if isinstance(value, str):
            items = [part.strip() for part in str(value).split(",") if part.strip()]
    elif isinstance(value, (list, tuple, set)):
        items = [str(part or "").strip() for part in value if str(part or "").strip()]
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        token = str(item or "").strip().lower()
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized


def _normalize_workspace_capability_policy(value: Any) -> dict[str, list[str]]:
    payload = value if isinstance(value, dict) else {}
    allow = _normalize_distinct_tokens(payload.get("allow"))
    deny = _normalize_distinct_tokens(payload.get("deny"))
    return {"allow": allow, "deny": deny}


def _normalize_workspace_dangerous_policy(value: Any) -> dict[str, list[str]]:
    payload = value if isinstance(value, dict) else {}
    allow = _normalize_distinct_tokens(payload.get("allow"))
    deny = _normalize_distinct_tokens(payload.get("deny"))
    return {"allow": allow, "deny": deny}


def _normalize_workspace_policy_claim_map(
    value: Any,
    *,
    normalizer,
) -> dict[str, dict[str, list[str]]]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, dict[str, list[str]]] = {}
    for raw_workspace_id, raw_policy in value.items():
        workspace_id = _normalize_workspace_token(raw_workspace_id, default="")
        if not workspace_id:
            continue
        out[workspace_id] = normalizer(raw_policy)
    return out


def _normalize_workspace_role_claim_map(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, str] = {}
    for raw_workspace_id, raw_role in value.items():
        workspace_id = _normalize_workspace_token(raw_workspace_id, default="")
        if not workspace_id:
            continue
        out[workspace_id] = normalize_rbac_role(raw_role, default="viewer")
    return out


def _normalize_workspace_trusted_machine_claim_map(value: Any) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, list[str]] = {}
    for raw_workspace_id, raw_items in value.items():
        workspace_id = _normalize_workspace_token(raw_workspace_id, default="")
        if not workspace_id:
            continue
        out[workspace_id] = _normalize_distinct_tokens(raw_items)
    return out


def current_user_role(current_user: Optional[Dict[str, Any]], *, default: str = "member") -> str:
    if not isinstance(current_user, dict):
        return normalize_rbac_role(default)
    if bool(current_user.get("is_admin")):
        return "owner"
    auth_type = str(current_user.get("auth_type") or "").strip().lower()
    if auth_type in {"api_key", "disabled"}:
        return "owner"
    return normalize_rbac_role(current_user.get("role"), default=default)


def current_user_is_owner(current_user: Optional[Dict[str, Any]]) -> bool:
    return current_user_role(current_user, default="viewer") == "owner"


def enforce_minimum_role(current_user: Optional[Dict[str, Any]], minimum_role: str) -> Dict[str, Any]:
    if not isinstance(current_user, dict):
        raise HTTPException(status_code=401, detail="Authentication required.")
    actual_role = current_user_role(current_user)
    required_role = normalize_rbac_role(minimum_role)
    if RBAC_ROLE_ORDER[actual_role] < RBAC_ROLE_ORDER[required_role]:
        raise HTTPException(
            status_code=403,
            detail=f"{required_role.capitalize()} role required.",
        )
    enriched = dict(current_user)
    enriched["role"] = actual_role
    enriched["is_admin"] = actual_role == "owner"
    return enriched


def _resolved_bearer_role(user_id: str, email: Optional[str], claimed_role: Any) -> str:
    role = normalize_rbac_role(claimed_role, default="member")
    if user_id and user_id in ORION_ADMIN_USER_IDS:
        return "owner"
    if email and email in ORION_ADMIN_EMAILS:
        return "owner"
    return role


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
            avatar_url TEXT,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_memberships (
            user_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, workspace_id)
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_policies (
            workspace_id TEXT PRIMARY KEY,
            capability_allow_json TEXT,
            capability_deny_json TEXT,
            dangerous_allow_json TEXT,
            dangerous_deny_json TEXT,
            trusted_owner_machine_ids_json TEXT,
            updated_at INTEGER NOT NULL
        )
        """
    )
    existing_columns = {
        str(row[1]).strip().lower()
        for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    if "avatar_url" not in existing_columns:
        connection.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
    connection.commit()
    return connection


def _write_workspace_membership(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    workspace_id: str,
    role: str,
    now_ts: Optional[int] = None,
) -> None:
    clean_user_id = str(user_id or "").strip()
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    clean_role = normalize_rbac_role(role, default="member")
    if not clean_user_id or not clean_workspace_id:
        return
    ts = int(now_ts or time.time())
    existing = connection.execute(
        "SELECT created_at FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?",
        (clean_user_id, clean_workspace_id),
    ).fetchone()
    created_at = int(existing["created_at"]) if existing is not None else ts
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_memberships (
            user_id, workspace_id, role, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (clean_user_id, clean_workspace_id, clean_role, created_at, ts),
    )


def _list_workspace_memberships(user_id: str) -> list[dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return []
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            rows = connection.execute(
                """
                SELECT user_id, workspace_id, role, created_at, updated_at
                FROM workspace_memberships
                WHERE user_id = ?
                ORDER BY workspace_id ASC
                """,
                (clean_user_id,),
            ).fetchall()
    return [dict(row) for row in rows]


def upsert_workspace_membership(user_id: str, workspace_id: str, role: str) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    clean_role = normalize_rbac_role(role, default="member")
    ts = int(time.time())
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            _write_workspace_membership(
                connection,
                user_id=clean_user_id,
                workspace_id=clean_workspace_id,
                role=clean_role,
                now_ts=ts,
            )
            connection.commit()
    return {"user_id": clean_user_id, "workspace_id": clean_workspace_id, "role": clean_role}


def _write_workspace_policy(
    connection: sqlite3.Connection,
    *,
    workspace_id: str,
    capability_allow: Optional[list[str]] = None,
    capability_deny: Optional[list[str]] = None,
    dangerous_allow: Optional[list[str]] = None,
    dangerous_deny: Optional[list[str]] = None,
    trusted_owner_machine_ids: Optional[list[str]] = None,
    updated_at: Optional[int] = None,
) -> None:
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    ts = int(updated_at or time.time())
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_policies (
            workspace_id,
            capability_allow_json,
            capability_deny_json,
            dangerous_allow_json,
            dangerous_deny_json,
            trusted_owner_machine_ids_json,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            clean_workspace_id,
            json.dumps(_normalize_distinct_tokens(capability_allow)),
            json.dumps(_normalize_distinct_tokens(capability_deny)),
            json.dumps(_normalize_distinct_tokens(dangerous_allow)),
            json.dumps(_normalize_distinct_tokens(dangerous_deny)),
            json.dumps(_normalize_distinct_tokens(trusted_owner_machine_ids)),
            ts,
        ),
    )


def _decode_json_token_list(raw: Any) -> list[str]:
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = raw
        return _normalize_distinct_tokens(parsed)
    return _normalize_distinct_tokens(raw)


def _workspace_policy_from_row(row: Any, workspace_id: str) -> dict[str, Any]:
    if row is None:
        return {
            "workspace_id": workspace_id,
            "capabilities": {"allow": [], "deny": []},
            "dangerous_action_classes": {"allow": [], "deny": []},
            "trusted_owner_machine_ids": [],
            "updated_at": None,
        }
    return {
        "workspace_id": workspace_id,
        "capabilities": {
            "allow": _decode_json_token_list(row["capability_allow_json"]),
            "deny": _decode_json_token_list(row["capability_deny_json"]),
        },
        "dangerous_action_classes": {
            "allow": _decode_json_token_list(row["dangerous_allow_json"]),
            "deny": _decode_json_token_list(row["dangerous_deny_json"]),
        },
        "trusted_owner_machine_ids": _decode_json_token_list(row["trusted_owner_machine_ids_json"]),
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def load_workspace_policy(workspace_id: str) -> dict[str, Any]:
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                """
                SELECT
                    workspace_id,
                    capability_allow_json,
                    capability_deny_json,
                    dangerous_allow_json,
                    dangerous_deny_json,
                    trusted_owner_machine_ids_json,
                    updated_at
                FROM workspace_policies
                WHERE workspace_id = ?
                """,
                (clean_workspace_id,),
            ).fetchone()
    return _workspace_policy_from_row(row, clean_workspace_id)


def upsert_workspace_policy(
    workspace_id: str,
    *,
    capability_allow: Optional[list[str]] = None,
    capability_deny: Optional[list[str]] = None,
    dangerous_allow: Optional[list[str]] = None,
    dangerous_deny: Optional[list[str]] = None,
    trusted_owner_machine_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            existing_row = connection.execute(
                """
                SELECT
                    workspace_id,
                    capability_allow_json,
                    capability_deny_json,
                    dangerous_allow_json,
                    dangerous_deny_json,
                    trusted_owner_machine_ids_json,
                    updated_at
                FROM workspace_policies
                WHERE workspace_id = ?
                """,
                (clean_workspace_id,),
            ).fetchone()
            existing = _workspace_policy_from_row(existing_row, clean_workspace_id)
            _write_workspace_policy(
                connection,
                workspace_id=clean_workspace_id,
                capability_allow=capability_allow if capability_allow is not None else list(existing["capabilities"]["allow"]),
                capability_deny=capability_deny if capability_deny is not None else list(existing["capabilities"]["deny"]),
                dangerous_allow=dangerous_allow if dangerous_allow is not None else list(existing["dangerous_action_classes"]["allow"]),
                dangerous_deny=dangerous_deny if dangerous_deny is not None else list(existing["dangerous_action_classes"]["deny"]),
                trusted_owner_machine_ids=trusted_owner_machine_ids if trusted_owner_machine_ids is not None else list(existing["trusted_owner_machine_ids"]),
            )
            connection.commit()
    return load_workspace_policy(clean_workspace_id)


def grant_workspace_owner_machine_trust(workspace_id: str, machine_id: str) -> dict[str, Any]:
    clean_machine_id = str(machine_id or "").strip().lower()
    if not clean_machine_id:
        raise HTTPException(status_code=400, detail="machine_id is required.")
    existing = load_workspace_policy(workspace_id)
    trusted = list(existing.get("trusted_owner_machine_ids") or [])
    if clean_machine_id not in trusted:
        trusted.append(clean_machine_id)
    return upsert_workspace_policy(
        workspace_id,
        capability_allow=list(existing["capabilities"]["allow"]),
        capability_deny=list(existing["capabilities"]["deny"]),
        dangerous_allow=list(existing["dangerous_action_classes"]["allow"]),
        dangerous_deny=list(existing["dangerous_action_classes"]["deny"]),
        trusted_owner_machine_ids=trusted,
    )


def revoke_workspace_owner_machine_trust(workspace_id: str, machine_id: str) -> dict[str, Any]:
    clean_machine_id = str(machine_id or "").strip().lower()
    existing = load_workspace_policy(workspace_id)
    trusted = [item for item in list(existing.get("trusted_owner_machine_ids") or []) if item != clean_machine_id]
    return upsert_workspace_policy(
        workspace_id,
        capability_allow=list(existing["capabilities"]["allow"]),
        capability_deny=list(existing["capabilities"]["deny"]),
        dangerous_allow=list(existing["dangerous_action_classes"]["allow"]),
        dangerous_deny=list(existing["dangerous_action_classes"]["deny"]),
        trusted_owner_machine_ids=trusted,
    )


def _effective_workspace_access(
    *,
    user_id: str,
    email: Optional[str],
    role: str,
    auth_type: str,
    is_admin: bool,
    workspace_ids: list[str],
    workspace_roles_claim: Any = None,
    workspace_capabilities_claim: Any = None,
    workspace_dangerous_claim: Any = None,
    workspace_trusted_machines_claim: Any = None,
) -> dict[str, dict[str, Any]]:
    if is_admin or auth_type in {"api_key", "disabled"}:
        return {}
    membership_roles = {
        _normalize_workspace_token(item.get("workspace_id")): normalize_rbac_role(item.get("role"), default="viewer")
        for item in _list_workspace_memberships(user_id)
        if isinstance(item, dict) and str(item.get("workspace_id") or "").strip()
    }
    claim_roles = _normalize_workspace_role_claim_map(workspace_roles_claim)
    claim_capabilities = _normalize_workspace_policy_claim_map(
        workspace_capabilities_claim,
        normalizer=_normalize_workspace_capability_policy,
    )
    claim_dangerous = _normalize_workspace_policy_claim_map(
        workspace_dangerous_claim,
        normalizer=_normalize_workspace_dangerous_policy,
    )
    claim_trusted = _normalize_workspace_trusted_machine_claim_map(workspace_trusted_machines_claim)

    effective_workspace_ids = {
        _normalize_workspace_token(item)
        for item in list(workspace_ids or [])
        if str(item or "").strip()
    }
    effective_workspace_ids.update(claim_roles.keys())
    effective_workspace_ids.update(membership_roles.keys())
    if not effective_workspace_ids:
        effective_workspace_ids.update(ORION_DEFAULT_WORKSPACE_IDS)

    access: dict[str, dict[str, Any]] = {}
    for workspace_id in sorted(effective_workspace_ids):
        policy_row = load_workspace_policy(workspace_id)
        role_value = membership_roles.get(workspace_id) or claim_roles.get(workspace_id)
        if not role_value and workspace_id in effective_workspace_ids:
            role_value = normalize_rbac_role(role, default="viewer")
        capability_policy = {
            "allow": list(claim_capabilities.get(workspace_id, {}).get("allow") or policy_row["capabilities"]["allow"]),
            "deny": list(claim_capabilities.get(workspace_id, {}).get("deny") or policy_row["capabilities"]["deny"]),
        }
        dangerous_policy = {
            "allow": list(claim_dangerous.get(workspace_id, {}).get("allow") or policy_row["dangerous_action_classes"]["allow"]),
            "deny": list(claim_dangerous.get(workspace_id, {}).get("deny") or policy_row["dangerous_action_classes"]["deny"]),
        }
        trusted_owner_machine_ids = list(
            claim_trusted.get(workspace_id) or policy_row.get("trusted_owner_machine_ids") or []
        )
        access[workspace_id] = {
            "workspace_id": workspace_id,
            "role": normalize_rbac_role(role_value, default="viewer"),
            "capabilities": _normalize_workspace_capability_policy(capability_policy),
            "dangerous_action_classes": _normalize_workspace_dangerous_policy(dangerous_policy),
            "trusted_owner_machine_ids": _normalize_distinct_tokens(trusted_owner_machine_ids),
            "owner_user_id": str(user_id or "").strip() or None,
            "owner_email": str(email or "").strip().lower() or None,
        }
    return access


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
                "SELECT id, email, name, avatar_url, password_hash, created_at FROM users WHERE lower(email) = lower(?)",
                (email_token,),
            ).fetchone()
        if row is not None:
            return dict(row)
    return None


def _find_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    user_token = str(user_id or "").strip()
    if not user_token:
        return None
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                "SELECT id, email, name, avatar_url, password_hash, created_at FROM users WHERE id = ?",
                (user_token,),
            ).fetchone()
        if row is not None:
            return dict(row)
    return None


def _public_user_payload(user: Dict[str, Any], *, role: Optional[str] = None) -> Dict[str, Any]:
    payload = {
        "id": str(user.get("id") or "").strip(),
        "email": str(user.get("email") or "").strip().lower(),
        "name": str(user.get("name") or "").strip() or None,
        "avatar_url": str(user.get("avatar_url") or "").strip() or None,
    }
    if role is not None:
        normalized_role = normalize_rbac_role(role)
        payload["role"] = normalized_role
        payload["is_admin"] = normalized_role == "owner"
    return payload


def issue_token(user_id: str, *, email: Optional[str] = None, role: str = "member") -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": str(email or "").strip().lower() or None,
        "role": normalize_rbac_role(role),
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
    access = workspace_access_map(user)
    if access:
        return set(access.keys())
    values = user.get("workspace_ids")
    normalized = _normalize_workspace_ids_claim(values)
    return set(normalized)


def workspace_access_map(current_user: Optional[Dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not isinstance(current_user, dict):
        return {}
    existing = current_user.get("workspace_access")
    if isinstance(existing, dict) and existing:
        out: dict[str, dict[str, Any]] = {}
        for raw_workspace_id, raw_entry in existing.items():
            workspace_id = _normalize_workspace_token(raw_workspace_id, default="")
            if not workspace_id or not isinstance(raw_entry, dict):
                continue
            out[workspace_id] = {
                "workspace_id": workspace_id,
                "role": normalize_rbac_role(raw_entry.get("role"), default="viewer"),
                "capabilities": _normalize_workspace_capability_policy(raw_entry.get("capabilities")),
                "dangerous_action_classes": _normalize_workspace_dangerous_policy(
                    raw_entry.get("dangerous_action_classes")
                ),
                "trusted_owner_machine_ids": _normalize_distinct_tokens(
                    raw_entry.get("trusted_owner_machine_ids")
                ),
                "owner_user_id": str(raw_entry.get("owner_user_id") or current_user.get("user_id") or "").strip() or None,
                "owner_email": str(raw_entry.get("owner_email") or current_user.get("email") or "").strip().lower() or None,
            }
        if out:
            return out
    workspace_ids = _normalize_workspace_ids_claim(current_user.get("workspace_ids"))
    return _effective_workspace_access(
        user_id=str(current_user.get("user_id") or "").strip(),
        email=str(current_user.get("email") or "").strip().lower() or None,
        role=current_user_role(current_user),
        auth_type=str(current_user.get("auth_type") or "").strip().lower(),
        is_admin=bool(current_user.get("is_admin")),
        workspace_ids=workspace_ids,
        workspace_roles_claim=current_user.get("workspace_roles"),
        workspace_capabilities_claim=current_user.get("workspace_capabilities"),
        workspace_dangerous_claim=current_user.get("workspace_dangerous_classes"),
        workspace_trusted_machines_claim=current_user.get("workspace_trusted_machines"),
    )


def workspace_role(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> Optional[str]:
    if not isinstance(current_user, dict):
        return None
    if bool(current_user.get("is_admin")):
        return "owner"
    auth_type = str(current_user.get("auth_type") or "").strip().lower()
    if auth_type in {"api_key", "disabled"}:
        return "owner"
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if isinstance(entry, dict):
        return normalize_rbac_role(entry.get("role"), default="viewer")
    return None


def workspace_capability_policy(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> dict[str, list[str]]:
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if not isinstance(entry, dict):
        return {"allow": [], "deny": []}
    return _normalize_workspace_capability_policy(entry.get("capabilities"))


def workspace_dangerous_action_policy(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> dict[str, list[str]]:
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if not isinstance(entry, dict):
        return {"allow": [], "deny": []}
    return _normalize_workspace_dangerous_policy(entry.get("dangerous_action_classes"))


def workspace_trusted_owner_machine_ids(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> list[str]:
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if not isinstance(entry, dict):
        return []
    return _normalize_distinct_tokens(entry.get("trusted_owner_machine_ids"))


def workspace_capability_decision(
    current_user: Optional[Dict[str, Any]],
    workspace_id: Optional[str],
    capability_id: Optional[str],
) -> dict[str, Any]:
    clean_capability_id = str(capability_id or "").strip().lower()
    if not clean_capability_id:
        return {"decision": "allow", "reason": "workspace_capability_not_applicable"}
    policy = workspace_capability_policy(current_user, workspace_id)
    denied = set(policy.get("deny") or [])
    allowed = set(policy.get("allow") or [])
    role = workspace_role(current_user, workspace_id)
    if clean_capability_id in denied or WORKSPACE_CAPABILITY_ALL in denied:
        return {"decision": "deny", "reason": "workspace_capability_denied"}
    if allowed and WORKSPACE_CAPABILITY_ALL not in allowed and clean_capability_id not in allowed and role != "owner":
        return {"decision": "deny", "reason": "workspace_capability_not_granted"}
    return {"decision": "allow", "reason": "workspace_capability_allowed"}


def build_workspace_authorization_metadata(
    current_user: Optional[Dict[str, Any]],
    workspace_id: Optional[str],
    *,
    capability_id: Optional[str] = None,
    machine_id: Optional[str] = None,
) -> dict[str, Any]:
    token = _normalize_workspace_token(workspace_id)
    trusted_owner_machine_ids = workspace_trusted_owner_machine_ids(current_user, token)
    clean_machine_id = str(machine_id or "").strip().lower() or None
    return {
        "workspace_id": token,
        "workspace_role": workspace_role(current_user, token) or current_user_role(current_user, default="viewer"),
        "workspace_capability_policy": workspace_capability_policy(current_user, token),
        "workspace_dangerous_action_policy": workspace_dangerous_action_policy(current_user, token),
        "computer_action_policy": {
            "allow_dangerous_classes": list(
                workspace_dangerous_action_policy(current_user, token).get("allow") or []
            ),
            "deny_dangerous_classes": list(
                workspace_dangerous_action_policy(current_user, token).get("deny") or []
            ),
            "trusted_owner_machine_ids": trusted_owner_machine_ids,
            "owner_machine_trusted": bool(clean_machine_id and clean_machine_id in set(trusted_owner_machine_ids)),
        },
        "workspace_capability_decision": workspace_capability_decision(
            current_user,
            token,
            capability_id,
        ),
    }


def enforce_workspace_access(
    current_user: Optional[Dict[str, Any]],
    workspace_id: Optional[str],
    *,
    minimum_role: str = "viewer",
    capability_id: Optional[str] = None,
) -> str:
    token = _normalize_workspace_token(workspace_id)
    allowed = allowed_workspace_ids(current_user)
    if allowed is None:
        capability_decision = workspace_capability_decision(current_user, token, capability_id)
        if capability_decision["decision"] != "allow":
            raise HTTPException(
                status_code=403,
                detail=f"Capability '{str(capability_id or '').strip()}' is not allowed in workspace '{token}'.",
            )
        return token
    if token not in allowed:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    actual_role = workspace_role(current_user, token) or current_user_role(current_user, default="viewer")
    required_role = normalize_rbac_role(minimum_role, default="viewer")
    if RBAC_ROLE_ORDER[actual_role] < RBAC_ROLE_ORDER[required_role]:
        raise HTTPException(
            status_code=403,
            detail=f"{required_role.capitalize()} role required for workspace '{token}'.",
        )
    capability_decision = workspace_capability_decision(current_user, token, capability_id)
    if capability_decision["decision"] != "allow":
        raise HTTPException(
            status_code=403,
            detail=f"Capability '{str(capability_id or '').strip()}' is not allowed in workspace '{token}'.",
        )
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
            for workspace_id in ORION_DEFAULT_WORKSPACE_IDS:
                _write_workspace_membership(
                    connection,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    role="member",
                    now_ts=created_at,
                )
            connection.commit()
    return {
        "ok": True,
        "user": {"id": user_id, "email": email_token, "name": user_name, "avatar_url": None, "role": "member", "is_admin": False},
        "token": issue_token(user_id, email=email_token, role="member"),
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
        "user": _public_user_payload(user, role="member"),
        "token": issue_token(user_id, email=str(user.get("email") or ""), role="member"),
    }


def _current_bearer_user_id(current_user: Optional[Dict[str, Any]]) -> str:
    if not isinstance(current_user, dict):
        raise HTTPException(status_code=401, detail="Authentication required.")
    if str(current_user.get("auth_type") or "").strip() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer token required.")
    user_id = str(current_user.get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Authenticated user is missing.")
    return user_id


def get_authenticated_user_profile(current_user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    user = _find_user_by_id(_current_bearer_user_id(current_user))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    role = current_user_role(current_user)
    return {
        "ok": True,
        "user": _public_user_payload(user, role=role),
        "workspace_access": list(workspace_access_map(current_user).values()),
    }


def update_authenticated_user_profile(
    current_user: Optional[Dict[str, Any]],
    *,
    name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Dict[str, Any]:
    user_id = _current_bearer_user_id(current_user)
    next_name = str(name or "").strip() or None
    next_avatar_url = str(avatar_url or "").strip() or None
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            existing = connection.execute(
                "SELECT id, email, name, avatar_url FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="User not found.")
            connection.execute(
                "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?",
                (next_name, next_avatar_url, user_id),
            )
            row = connection.execute(
                "SELECT id, email, name, avatar_url FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            connection.commit()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found.")
    role = current_user_role(current_user)
    return {"ok": True, "user": _public_user_payload(dict(row), role=role)}


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> Dict[str, Any]:
    if not _orion_auth_required():
        user = {"user_id": "anonymous", "auth_type": "disabled", "role": "owner", "is_admin": True}
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
        role = _resolved_bearer_role(user_id, email, payload.get("role"))
        workspace_access = _effective_workspace_access(
            user_id=user_id,
            email=email,
            role=role,
            auth_type="bearer",
            is_admin=role == "owner",
            workspace_ids=workspace_ids,
            workspace_roles_claim=payload.get("workspace_roles"),
            workspace_capabilities_claim=payload.get("workspace_capabilities"),
            workspace_dangerous_claim=payload.get("workspace_dangerous_classes"),
            workspace_trusted_machines_claim=payload.get("workspace_trusted_machines"),
        )
        _enforce_window_limit(
            buckets=USER_RATE_LIMIT_BUCKETS,
            lock=USER_RATE_LIMIT_LOCK,
            key=f"user:{user_id}",
            limit=60,
        )
        return {
            "user_id": user_id,
            "auth_type": "bearer",
            "email": email,
            "workspace_ids": workspace_ids,
            "workspace_roles": {
                workspace_id: entry.get("role")
                for workspace_id, entry in workspace_access.items()
                if isinstance(entry, dict)
            },
            "workspace_access": workspace_access,
            "role": role,
            "is_admin": role == "owner",
        }

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
        return {"user_id": "service", "auth_type": "api_key", "email": None, "role": "owner", "is_admin": True}

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
    user = enforce_minimum_role(user, "owner")
    user["is_admin"] = True
    return user


def require_member_access(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> Dict[str, Any]:
    user = get_current_user(
        request=request,
        authorization=authorization,
        x_api_key=x_api_key,
    )
    return enforce_minimum_role(user, "member")
