from __future__ import annotations

import base64
import asyncio
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
from server_modules import control_plane_repository
from server_modules.direct_tool_config_service import run_async_tool_call
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
ORION_SERVICE_RATE_LIMIT_PER_MINUTE = int(os.getenv("ORION_SERVICE_RATE_LIMIT_PER_MINUTE", "600"))
RBAC_ROLE_ORDER = {"viewer": 0, "member": 1, "owner": 2}
WORKSPACE_CAPABILITY_ALL = "*"


def _control_plane_call(coro: Any) -> Any:
    try:
        return run_async_tool_call(coro)
    except Exception:
        return None


def public_registration_enabled() -> bool:
    raw = os.getenv("ORION_PUBLIC_REGISTRATION_ENABLED")
    if raw is None:
        return bool(ORION_PUBLIC_REGISTRATION_ENABLED)
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def normalize_rbac_role(value: Any, *, default: str = "member") -> str:
    token = str(value or "").strip().lower()
    if token in RBAC_ROLE_ORDER:
        return token
    fallback = str(default or "member").strip().lower()
    return fallback if fallback in RBAC_ROLE_ORDER else "member"


def _normalize_workspace_token(value: Any, *, default: str = "") -> str:
    token = str(value or "").strip()
    return token or str(default or "").strip()


def _normalize_tenant_token(value: Any, *, default: str = "") -> str:
    token = str(value or "").strip()
    return token or str(default or "").strip()


def _require_workspace_token(
    value: Any,
    *,
    detail: str = "workspace_id is required.",
    status_code: int = 403,
) -> str:
    token = _normalize_workspace_token(value, default="")
    if not token:
        raise HTTPException(status_code=status_code, detail=detail)
    return token


def _require_tenant_token(
    value: Any,
    *,
    detail: str = "tenant_id is required.",
    status_code: int = 403,
) -> str:
    token = _normalize_tenant_token(value, default="")
    if not token:
        raise HTTPException(status_code=status_code, detail=detail)
    return token


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


def _normalize_connector_permission_policy(value: Any) -> dict[str, list[str]]:
    payload = value if isinstance(value, dict) else {}
    allow = _normalize_distinct_tokens(payload.get("allow"))
    deny = _normalize_distinct_tokens(payload.get("deny"))
    return {"allow": allow, "deny": deny}


def _normalize_machine_enrollment_scope(value: Any, *, default: str = "workspace") -> str:
    token = str(value or "").strip().lower()
    if token in {"workspace", "tenant", "global"}:
        return token
    return str(default or "workspace").strip().lower() or "workspace"


def _normalize_sso_provider(value: Any, *, default: str = "oidc") -> str:
    token = str(value or "").strip().lower()
    if token in {"oidc", "saml", "google_workspace", "azure_ad", "okta", "generic"}:
        return token
    return str(default or "oidc").strip().lower() or "oidc"


def _normalize_mfa_methods(value: Any) -> list[str]:
    allowed = {"totp", "webauthn", "backup_codes", "sms"}
    methods = _normalize_distinct_tokens(value)
    return [method for method in methods if method in allowed]


def _normalize_scim_provisioning_mode(value: Any, *, default: str = "admin_api") -> str:
    token = str(value or "").strip().lower()
    if token in {"admin_api", "scim_bridge", "disabled"}:
        return token
    return str(default or "admin_api").strip().lower() or "admin_api"


def _resolve_inherited_allow_deny(
    *policies: Optional[dict[str, Any]],
) -> dict[str, list[str]]:
    allow: list[str] = []
    deny: list[str] = []
    for policy in policies:
        if not isinstance(policy, dict):
            continue
        next_allow = _normalize_distinct_tokens(policy.get("allow"))
        next_deny = _normalize_distinct_tokens(policy.get("deny"))
        if next_allow:
            allow = next_allow
        if next_deny:
            deny = next_deny
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
        CREATE TABLE IF NOT EXISTS workspace_registry (
            workspace_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
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
            connector_allow_json TEXT,
            connector_deny_json TEXT,
            machine_enrollment_scope TEXT,
            trusted_owner_machine_ids_json TEXT,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS tenant_policies (
            tenant_id TEXT PRIMARY KEY,
            capability_allow_json TEXT,
            capability_deny_json TEXT,
            dangerous_allow_json TEXT,
            dangerous_deny_json TEXT,
            connector_allow_json TEXT,
            connector_deny_json TEXT,
            machine_enrollment_scope TEXT,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS tenant_enterprise_settings (
            tenant_id TEXT PRIMARY KEY,
            sso_enabled INTEGER NOT NULL DEFAULT 0,
            sso_provider TEXT,
            sso_issuer_url TEXT,
            sso_metadata_url TEXT,
            sso_client_id TEXT,
            sso_audience TEXT,
            sso_domains_json TEXT,
            sso_scopes_json TEXT,
            mfa_required INTEGER NOT NULL DEFAULT 0,
            mfa_methods_json TEXT,
            mfa_grace_period_hours INTEGER,
            scim_enabled INTEGER NOT NULL DEFAULT 0,
            scim_base_url TEXT,
            scim_provisioning_mode TEXT,
            scim_last_token_rotation_at INTEGER,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS user_enterprise_security (
            user_id TEXT PRIMARY KEY,
            mfa_enrolled INTEGER NOT NULL DEFAULT 0,
            mfa_method TEXT,
            mfa_enrolled_at INTEGER,
            mfa_last_verified_at INTEGER,
            auth_provider TEXT,
            sso_subject TEXT,
            provisioning_source TEXT,
            external_id TEXT,
            last_provisioned_at INTEGER,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS user_auth_methods (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            method_type TEXT NOT NULL,
            provider TEXT NOT NULL,
            subject TEXT,
            label TEXT,
            status TEXT NOT NULL,
            is_primary INTEGER NOT NULL DEFAULT 0,
            can_recover INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS user_provider_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            workspace_id TEXT,
            status TEXT NOT NULL,
            label TEXT,
            external_account_id TEXT,
            metadata_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
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
    workspace_policy_columns = {
        str(row[1]).strip().lower()
        for row in connection.execute("PRAGMA table_info(workspace_policies)").fetchall()
    }
    if "connector_allow_json" not in workspace_policy_columns:
        connection.execute("ALTER TABLE workspace_policies ADD COLUMN connector_allow_json TEXT")
    if "connector_deny_json" not in workspace_policy_columns:
        connection.execute("ALTER TABLE workspace_policies ADD COLUMN connector_deny_json TEXT")
    if "machine_enrollment_scope" not in workspace_policy_columns:
        connection.execute("ALTER TABLE workspace_policies ADD COLUMN machine_enrollment_scope TEXT")
    tenant_policy_columns = {
        str(row[1]).strip().lower()
        for row in connection.execute("PRAGMA table_info(tenant_policies)").fetchall()
    }
    if "connector_allow_json" not in tenant_policy_columns:
        connection.execute("ALTER TABLE tenant_policies ADD COLUMN connector_allow_json TEXT")
    if "connector_deny_json" not in tenant_policy_columns:
        connection.execute("ALTER TABLE tenant_policies ADD COLUMN connector_deny_json TEXT")
    if "machine_enrollment_scope" not in tenant_policy_columns:
        connection.execute("ALTER TABLE tenant_policies ADD COLUMN machine_enrollment_scope TEXT")
    tenant_enterprise_columns = {
        str(row[1]).strip().lower()
        for row in connection.execute("PRAGMA table_info(tenant_enterprise_settings)").fetchall()
    }
    if "sso_provider" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_provider TEXT")
    if "sso_issuer_url" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_issuer_url TEXT")
    if "sso_metadata_url" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_metadata_url TEXT")
    if "sso_client_id" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_client_id TEXT")
    if "sso_audience" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_audience TEXT")
    if "sso_domains_json" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_domains_json TEXT")
    if "sso_scopes_json" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN sso_scopes_json TEXT")
    if "mfa_required" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN mfa_required INTEGER NOT NULL DEFAULT 0")
    if "mfa_methods_json" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN mfa_methods_json TEXT")
    if "mfa_grace_period_hours" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN mfa_grace_period_hours INTEGER")
    if "scim_enabled" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN scim_enabled INTEGER NOT NULL DEFAULT 0")
    if "scim_base_url" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN scim_base_url TEXT")
    if "scim_provisioning_mode" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN scim_provisioning_mode TEXT")
    if "scim_last_token_rotation_at" not in tenant_enterprise_columns:
        connection.execute("ALTER TABLE tenant_enterprise_settings ADD COLUMN scim_last_token_rotation_at INTEGER")
    user_enterprise_columns = {
        str(row[1]).strip().lower()
        for row in connection.execute("PRAGMA table_info(user_enterprise_security)").fetchall()
    }
    if "mfa_method" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN mfa_method TEXT")
    if "mfa_enrolled_at" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN mfa_enrolled_at INTEGER")
    if "mfa_last_verified_at" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN mfa_last_verified_at INTEGER")
    if "auth_provider" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN auth_provider TEXT")
    if "sso_subject" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN sso_subject TEXT")
    if "provisioning_source" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN provisioning_source TEXT")
    if "external_id" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN external_id TEXT")
    if "last_provisioned_at" not in user_enterprise_columns:
        connection.execute("ALTER TABLE user_enterprise_security ADD COLUMN last_provisioned_at INTEGER")
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_auth_methods_user ON user_auth_methods(user_id, is_primary DESC, created_at ASC)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_provider_connections_user ON user_provider_connections(user_id, provider, workspace_id)"
    )
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
    pg_rows = _control_plane_call(control_plane_repository.list_workspace_memberships_for_user(clean_user_id))
    if isinstance(pg_rows, list) and pg_rows:
        return [dict(row) for row in pg_rows if isinstance(row, dict)]
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


def _write_workspace_registry(
    connection: sqlite3.Connection,
    *,
    workspace_id: str,
    tenant_id: str,
    now_ts: Optional[int] = None,
) -> None:
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    clean_tenant_id = _normalize_tenant_token(tenant_id)
    ts = int(now_ts or time.time())
    existing = connection.execute(
        "SELECT created_at FROM workspace_registry WHERE workspace_id = ?",
        (clean_workspace_id,),
    ).fetchone()
    created_at = int(existing["created_at"]) if existing is not None else ts
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_registry (
            workspace_id, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?)
        """,
        (clean_workspace_id, clean_tenant_id, created_at, ts),
    )


def ensure_workspace_tenant_binding(workspace_id: str, tenant_id: Optional[str] = None) -> dict[str, Any]:
    clean_workspace_id = _require_workspace_token(workspace_id, detail="workspace_id is required for tenant binding.", status_code=400)
    clean_tenant_id = _require_tenant_token(tenant_id, detail="tenant_id is required for tenant binding.", status_code=400)
    ts = int(time.time())
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            _write_workspace_registry(
                connection,
                workspace_id=clean_workspace_id,
                tenant_id=clean_tenant_id,
                now_ts=ts,
            )
            connection.commit()
    return {"workspace_id": clean_workspace_id, "tenant_id": clean_tenant_id}


def tenant_id_for_workspace(workspace_id: str) -> str:
    clean_workspace_id = _require_workspace_token(
        workspace_id,
        detail="workspace_id is required to resolve tenant scope.",
    )
    pg_tenant_id = _control_plane_call(control_plane_repository.tenant_id_for_workspace(clean_workspace_id))
    if isinstance(pg_tenant_id, str) and pg_tenant_id.strip():
        return _require_tenant_token(pg_tenant_id, detail="Workspace is not bound to a valid tenant.")
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                """
                SELECT tenant_id
                FROM workspace_registry
                WHERE workspace_id = ?
                LIMIT 1
                """,
                (clean_workspace_id,),
            ).fetchone()
            if row is None:
                raise HTTPException(status_code=403, detail=f"Workspace '{clean_workspace_id}' is not bound to a tenant.")
            tenant_id = _normalize_tenant_token(row["tenant_id"], default="")
            if not tenant_id:
                raise HTTPException(status_code=403, detail=f"Workspace '{clean_workspace_id}' is not bound to a valid tenant.")
            return tenant_id


def upsert_workspace_membership(user_id: str, workspace_id: str, role: str) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    clean_workspace_id = _require_workspace_token(workspace_id, detail="workspace_id is required.", status_code=400)
    clean_role = normalize_rbac_role(role, default="member")
    ts = int(time.time())
    user_email = ""
    user_name = None
    resolved_tenant_id = tenant_id_for_workspace(clean_workspace_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            user_row = connection.execute(
                "SELECT email, name FROM users WHERE id = ? LIMIT 1",
                (clean_user_id,),
            ).fetchone()
            registry_row = connection.execute(
                """
                SELECT tenant_id
                FROM workspace_registry
                WHERE workspace_id = ?
                LIMIT 1
                """,
                (clean_workspace_id,),
            ).fetchone()
            if registry_row is not None:
                resolved_tenant_id = _require_tenant_token(
                    registry_row["tenant_id"],
                    detail=f"Workspace '{clean_workspace_id}' is not bound to a valid tenant.",
                )
            _write_workspace_registry(
                connection,
                workspace_id=clean_workspace_id,
                tenant_id=resolved_tenant_id,
                now_ts=ts,
            )
            _write_workspace_membership(
                connection,
                user_id=clean_user_id,
                workspace_id=clean_workspace_id,
                role=clean_role,
                now_ts=ts,
            )
            connection.commit()
            if user_row is not None:
                user_email = str(user_row["email"] or "").strip().lower()
                user_name = str(user_row["name"] or "").strip() or None
    if user_email:
        _control_plane_call(
            control_plane_repository.ensure_workspace_membership(
                user_id=clean_user_id,
                email=user_email,
                display_name=user_name,
                tenant_id=resolved_tenant_id,
                workspace_id=clean_workspace_id,
                role=clean_role,
            )
        )
    return {"user_id": clean_user_id, "workspace_id": clean_workspace_id, "role": clean_role}


def _write_workspace_policy(
    connection: sqlite3.Connection,
    *,
    workspace_id: str,
    capability_allow: Optional[list[str]] = None,
    capability_deny: Optional[list[str]] = None,
    dangerous_allow: Optional[list[str]] = None,
    dangerous_deny: Optional[list[str]] = None,
    connector_allow: Optional[list[str]] = None,
    connector_deny: Optional[list[str]] = None,
    machine_enrollment_scope: Optional[str] = None,
    trusted_owner_machine_ids: Optional[list[str]] = None,
    updated_at: Optional[int] = None,
) -> None:
    clean_workspace_id = _require_workspace_token(workspace_id, detail="workspace_id is required.", status_code=400)
    ts = int(updated_at or time.time())
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_policies (
            workspace_id,
            capability_allow_json,
            capability_deny_json,
            dangerous_allow_json,
            dangerous_deny_json,
            connector_allow_json,
            connector_deny_json,
            machine_enrollment_scope,
            trusted_owner_machine_ids_json,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            clean_workspace_id,
            json.dumps(_normalize_distinct_tokens(capability_allow)),
            json.dumps(_normalize_distinct_tokens(capability_deny)),
            json.dumps(_normalize_distinct_tokens(dangerous_allow)),
            json.dumps(_normalize_distinct_tokens(dangerous_deny)),
            json.dumps(_normalize_distinct_tokens(connector_allow)),
            json.dumps(_normalize_distinct_tokens(connector_deny)),
            _normalize_machine_enrollment_scope(machine_enrollment_scope, default="workspace"),
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


def _workspace_policy_from_row(row: Any, workspace_id: str, *, tenant_id: Optional[str] = None) -> dict[str, Any]:
    resolved_tenant_id = _require_tenant_token(
        tenant_id,
        detail=f"Workspace '{workspace_id}' is not bound to a valid tenant.",
    )
    if row is None:
        return {
            "workspace_id": workspace_id,
            "tenant_id": resolved_tenant_id,
            "capabilities": {"allow": [], "deny": []},
            "dangerous_action_classes": {"allow": [], "deny": []},
            "connectors": {"allow": [], "deny": []},
            "machine_enrollment_scope": "workspace",
            "trusted_owner_machine_ids": [],
            "updated_at": None,
        }
    return {
        "workspace_id": workspace_id,
        "tenant_id": resolved_tenant_id,
        "capabilities": {
            "allow": _decode_json_token_list(row["capability_allow_json"]),
            "deny": _decode_json_token_list(row["capability_deny_json"]),
        },
        "dangerous_action_classes": {
            "allow": _decode_json_token_list(row["dangerous_allow_json"]),
            "deny": _decode_json_token_list(row["dangerous_deny_json"]),
        },
        "connectors": {
            "allow": _decode_json_token_list(row["connector_allow_json"]),
            "deny": _decode_json_token_list(row["connector_deny_json"]),
        },
        "machine_enrollment_scope": _normalize_machine_enrollment_scope(row["machine_enrollment_scope"]),
        "trusted_owner_machine_ids": _decode_json_token_list(row["trusted_owner_machine_ids_json"]),
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def load_workspace_policy(workspace_id: str) -> dict[str, Any]:
    clean_workspace_id = _require_workspace_token(workspace_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            registry_row = connection.execute(
                """
                SELECT tenant_id
                FROM workspace_registry
                WHERE workspace_id = ?
                LIMIT 1
                """,
                (clean_workspace_id,),
            ).fetchone()
            if registry_row is None:
                raise HTTPException(status_code=403, detail=f"Workspace '{clean_workspace_id}' is not bound to a tenant.")
            resolved_tenant_id = _require_tenant_token(
                registry_row["tenant_id"],
                detail=f"Workspace '{clean_workspace_id}' is not bound to a valid tenant.",
            )
            row = connection.execute(
                """
                SELECT
                    workspace_id,
                    capability_allow_json,
                    capability_deny_json,
                    dangerous_allow_json,
                    dangerous_deny_json,
                    connector_allow_json,
                    connector_deny_json,
                    machine_enrollment_scope,
                    trusted_owner_machine_ids_json,
                    updated_at
                FROM workspace_policies
                WHERE workspace_id = ?
                """,
                (clean_workspace_id,),
            ).fetchone()
            connection.commit()
    return _workspace_policy_from_row(row, clean_workspace_id, tenant_id=resolved_tenant_id)


def _tenant_policy_from_row(row: Any, tenant_id: str) -> dict[str, Any]:
    if row is None:
        return {
            "tenant_id": tenant_id,
            "capabilities": {"allow": [], "deny": []},
            "dangerous_action_classes": {"allow": [], "deny": []},
            "connectors": {"allow": [], "deny": []},
            "machine_enrollment_scope": "workspace",
            "updated_at": None,
        }
    return {
        "tenant_id": tenant_id,
        "capabilities": {
            "allow": _decode_json_token_list(row["capability_allow_json"]),
            "deny": _decode_json_token_list(row["capability_deny_json"]),
        },
        "dangerous_action_classes": {
            "allow": _decode_json_token_list(row["dangerous_allow_json"]),
            "deny": _decode_json_token_list(row["dangerous_deny_json"]),
        },
        "connectors": {
            "allow": _decode_json_token_list(row["connector_allow_json"]),
            "deny": _decode_json_token_list(row["connector_deny_json"]),
        },
        "machine_enrollment_scope": _normalize_machine_enrollment_scope(row["machine_enrollment_scope"]),
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def load_tenant_policy(tenant_id: str) -> dict[str, Any]:
    clean_tenant_id = _normalize_tenant_token(tenant_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                """
                SELECT
                    tenant_id,
                    capability_allow_json,
                    capability_deny_json,
                    dangerous_allow_json,
                    dangerous_deny_json,
                    connector_allow_json,
                    connector_deny_json,
                    machine_enrollment_scope,
                    updated_at
                FROM tenant_policies
                WHERE tenant_id = ?
                """,
                (clean_tenant_id,),
            ).fetchone()
    return _tenant_policy_from_row(row, clean_tenant_id)


def upsert_tenant_policy(
    tenant_id: str,
    *,
    capability_allow: Optional[list[str]] = None,
    capability_deny: Optional[list[str]] = None,
    dangerous_allow: Optional[list[str]] = None,
    dangerous_deny: Optional[list[str]] = None,
    connector_allow: Optional[list[str]] = None,
    connector_deny: Optional[list[str]] = None,
    machine_enrollment_scope: Optional[str] = None,
) -> dict[str, Any]:
    clean_tenant_id = _normalize_tenant_token(tenant_id)
    ts = int(time.time())
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            existing_row = connection.execute(
                """
                SELECT
                    tenant_id,
                    capability_allow_json,
                    capability_deny_json,
                    dangerous_allow_json,
                    dangerous_deny_json,
                    connector_allow_json,
                    connector_deny_json,
                    machine_enrollment_scope,
                    updated_at
                FROM tenant_policies
                WHERE tenant_id = ?
                """,
                (clean_tenant_id,),
            ).fetchone()
            existing = _tenant_policy_from_row(existing_row, clean_tenant_id)
            connection.execute(
                """
                INSERT OR REPLACE INTO tenant_policies (
                    tenant_id,
                    capability_allow_json,
                    capability_deny_json,
                    dangerous_allow_json,
                    dangerous_deny_json,
                    connector_allow_json,
                    connector_deny_json,
                    machine_enrollment_scope,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_tenant_id,
                    json.dumps(_normalize_distinct_tokens(capability_allow if capability_allow is not None else existing["capabilities"]["allow"])),
                    json.dumps(_normalize_distinct_tokens(capability_deny if capability_deny is not None else existing["capabilities"]["deny"])),
                    json.dumps(_normalize_distinct_tokens(dangerous_allow if dangerous_allow is not None else existing["dangerous_action_classes"]["allow"])),
                    json.dumps(_normalize_distinct_tokens(dangerous_deny if dangerous_deny is not None else existing["dangerous_action_classes"]["deny"])),
                    json.dumps(_normalize_distinct_tokens(connector_allow if connector_allow is not None else existing["connectors"]["allow"])),
                    json.dumps(_normalize_distinct_tokens(connector_deny if connector_deny is not None else existing["connectors"]["deny"])),
                    _normalize_machine_enrollment_scope(
                        machine_enrollment_scope if machine_enrollment_scope is not None else existing.get("machine_enrollment_scope"),
                        default="workspace",
                    ),
                    ts,
                ),
            )
            connection.commit()
    return load_tenant_policy(clean_tenant_id)


def upsert_workspace_policy(
    workspace_id: str,
    *,
    capability_allow: Optional[list[str]] = None,
    capability_deny: Optional[list[str]] = None,
    dangerous_allow: Optional[list[str]] = None,
    dangerous_deny: Optional[list[str]] = None,
    connector_allow: Optional[list[str]] = None,
    connector_deny: Optional[list[str]] = None,
    machine_enrollment_scope: Optional[str] = None,
    trusted_owner_machine_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    clean_workspace_id = _normalize_workspace_token(workspace_id)
    resolved_tenant_id = tenant_id_for_workspace(clean_workspace_id)
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
                    connector_allow_json,
                    connector_deny_json,
                    machine_enrollment_scope,
                    trusted_owner_machine_ids_json,
                    updated_at
                FROM workspace_policies
                WHERE workspace_id = ?
                """,
                (clean_workspace_id,),
            ).fetchone()
            existing = _workspace_policy_from_row(existing_row, clean_workspace_id, tenant_id=resolved_tenant_id)
            _write_workspace_policy(
                connection,
                workspace_id=clean_workspace_id,
                capability_allow=capability_allow if capability_allow is not None else list(existing["capabilities"]["allow"]),
                capability_deny=capability_deny if capability_deny is not None else list(existing["capabilities"]["deny"]),
                dangerous_allow=dangerous_allow if dangerous_allow is not None else list(existing["dangerous_action_classes"]["allow"]),
                dangerous_deny=dangerous_deny if dangerous_deny is not None else list(existing["dangerous_action_classes"]["deny"]),
                connector_allow=connector_allow if connector_allow is not None else list(existing["connectors"]["allow"]),
                connector_deny=connector_deny if connector_deny is not None else list(existing["connectors"]["deny"]),
                machine_enrollment_scope=(
                    machine_enrollment_scope
                    if machine_enrollment_scope is not None
                    else str(existing.get("machine_enrollment_scope") or "workspace")
                ),
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
        connector_allow=list(existing["connectors"]["allow"]),
        connector_deny=list(existing["connectors"]["deny"]),
        machine_enrollment_scope=str(existing.get("machine_enrollment_scope") or "workspace"),
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
        connector_allow=list(existing["connectors"]["allow"]),
        connector_deny=list(existing["connectors"]["deny"]),
        machine_enrollment_scope=str(existing.get("machine_enrollment_scope") or "workspace"),
        trusted_owner_machine_ids=trusted,
    )


def _tenant_enterprise_settings_from_row(row: Any, tenant_id: str) -> dict[str, Any]:
    if row is None:
        return {
            "tenant_id": tenant_id,
            "sso": {
                "enabled": False,
                "provider": "oidc",
                "issuer_url": None,
                "metadata_url": None,
                "client_id": None,
                "audience": None,
                "domains": [],
                "scopes": [],
            },
            "mfa": {
                "required": False,
                "methods": [],
                "grace_period_hours": None,
            },
            "scim": {
                "enabled": False,
                "base_url": None,
                "provisioning_mode": "admin_api",
                "last_token_rotation_at": None,
            },
            "updated_at": None,
        }
    return {
        "tenant_id": tenant_id,
        "sso": {
            "enabled": bool(row["sso_enabled"]),
            "provider": _normalize_sso_provider(row["sso_provider"]),
            "issuer_url": str(row["sso_issuer_url"] or "").strip() or None,
            "metadata_url": str(row["sso_metadata_url"] or "").strip() or None,
            "client_id": str(row["sso_client_id"] or "").strip() or None,
            "audience": str(row["sso_audience"] or "").strip() or None,
            "domains": _decode_json_token_list(row["sso_domains_json"]),
            "scopes": _decode_json_token_list(row["sso_scopes_json"]),
        },
        "mfa": {
            "required": bool(row["mfa_required"]),
            "methods": _normalize_mfa_methods(row["mfa_methods_json"]),
            "grace_period_hours": int(row["mfa_grace_period_hours"]) if row["mfa_grace_period_hours"] is not None else None,
        },
        "scim": {
            "enabled": bool(row["scim_enabled"]),
            "base_url": str(row["scim_base_url"] or "").strip() or None,
            "provisioning_mode": _normalize_scim_provisioning_mode(row["scim_provisioning_mode"]),
            "last_token_rotation_at": int(row["scim_last_token_rotation_at"]) if row["scim_last_token_rotation_at"] is not None else None,
        },
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def load_tenant_enterprise_settings(tenant_id: str) -> dict[str, Any]:
    clean_tenant_id = _normalize_tenant_token(tenant_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                """
                SELECT
                    tenant_id,
                    sso_enabled,
                    sso_provider,
                    sso_issuer_url,
                    sso_metadata_url,
                    sso_client_id,
                    sso_audience,
                    sso_domains_json,
                    sso_scopes_json,
                    mfa_required,
                    mfa_methods_json,
                    mfa_grace_period_hours,
                    scim_enabled,
                    scim_base_url,
                    scim_provisioning_mode,
                    scim_last_token_rotation_at,
                    updated_at
                FROM tenant_enterprise_settings
                WHERE tenant_id = ?
                """,
                (clean_tenant_id,),
            ).fetchone()
    return _tenant_enterprise_settings_from_row(row, clean_tenant_id)


def upsert_tenant_enterprise_settings(
    tenant_id: str,
    *,
    sso: Optional[dict[str, Any]] = None,
    mfa: Optional[dict[str, Any]] = None,
    scim: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    clean_tenant_id = _normalize_tenant_token(tenant_id)
    existing = load_tenant_enterprise_settings(clean_tenant_id)
    next_sso = dict(existing.get("sso") or {})
    next_sso.update(dict(sso or {}))
    next_mfa = dict(existing.get("mfa") or {})
    next_mfa.update(dict(mfa or {}))
    next_scim = dict(existing.get("scim") or {})
    next_scim.update(dict(scim or {}))
    ts = int(time.time())
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO tenant_enterprise_settings (
                    tenant_id,
                    sso_enabled,
                    sso_provider,
                    sso_issuer_url,
                    sso_metadata_url,
                    sso_client_id,
                    sso_audience,
                    sso_domains_json,
                    sso_scopes_json,
                    mfa_required,
                    mfa_methods_json,
                    mfa_grace_period_hours,
                    scim_enabled,
                    scim_base_url,
                    scim_provisioning_mode,
                    scim_last_token_rotation_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_tenant_id,
                    1 if bool(next_sso.get("enabled")) else 0,
                    _normalize_sso_provider(next_sso.get("provider"), default=str(existing.get("sso", {}).get("provider") or "oidc")),
                    str(next_sso.get("issuer_url") or "").strip() or None,
                    str(next_sso.get("metadata_url") or "").strip() or None,
                    str(next_sso.get("client_id") or "").strip() or None,
                    str(next_sso.get("audience") or "").strip() or None,
                    json.dumps(_normalize_distinct_tokens(next_sso.get("domains"))),
                    json.dumps(_normalize_distinct_tokens(next_sso.get("scopes"))),
                    1 if bool(next_mfa.get("required")) else 0,
                    json.dumps(_normalize_mfa_methods(next_mfa.get("methods"))),
                    int(next_mfa.get("grace_period_hours")) if next_mfa.get("grace_period_hours") not in {None, ""} else None,
                    1 if bool(next_scim.get("enabled")) else 0,
                    str(next_scim.get("base_url") or "").strip() or None,
                    _normalize_scim_provisioning_mode(next_scim.get("provisioning_mode"), default=str(existing.get("scim", {}).get("provisioning_mode") or "admin_api")),
                    int(next_scim.get("last_token_rotation_at")) if next_scim.get("last_token_rotation_at") not in {None, ""} else None,
                    ts,
                ),
            )
            connection.commit()
    return load_tenant_enterprise_settings(clean_tenant_id)


def _user_enterprise_security_from_row(row: Any, user_id: str) -> dict[str, Any]:
    if row is None:
        return {
            "user_id": user_id,
            "mfa_enrolled": False,
            "mfa_method": None,
            "mfa_enrolled_at": None,
            "mfa_last_verified_at": None,
            "auth_provider": None,
            "sso_subject": None,
            "provisioning_source": None,
            "external_id": None,
            "last_provisioned_at": None,
            "updated_at": None,
        }
    return {
        "user_id": user_id,
        "mfa_enrolled": bool(row["mfa_enrolled"]),
        "mfa_method": str(row["mfa_method"] or "").strip() or None,
        "mfa_enrolled_at": int(row["mfa_enrolled_at"]) if row["mfa_enrolled_at"] is not None else None,
        "mfa_last_verified_at": int(row["mfa_last_verified_at"]) if row["mfa_last_verified_at"] is not None else None,
        "auth_provider": str(row["auth_provider"] or "").strip() or None,
        "sso_subject": str(row["sso_subject"] or "").strip() or None,
        "provisioning_source": str(row["provisioning_source"] or "").strip() or None,
        "external_id": str(row["external_id"] or "").strip() or None,
        "last_provisioned_at": int(row["last_provisioned_at"]) if row["last_provisioned_at"] is not None else None,
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def load_user_enterprise_security(user_id: str) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return _user_enterprise_security_from_row(None, "")
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            row = connection.execute(
                """
                SELECT
                    user_id,
                    mfa_enrolled,
                    mfa_method,
                    mfa_enrolled_at,
                    mfa_last_verified_at,
                    auth_provider,
                    sso_subject,
                    provisioning_source,
                    external_id,
                    last_provisioned_at,
                    updated_at
                FROM user_enterprise_security
                WHERE user_id = ?
                """,
                (clean_user_id,),
            ).fetchone()
    return _user_enterprise_security_from_row(row, clean_user_id)


def upsert_user_enterprise_security(
    user_id: str,
    *,
    mfa_enrolled: Optional[bool] = None,
    mfa_method: Optional[str] = None,
    mfa_enrolled_at: Optional[int] = None,
    mfa_last_verified_at: Optional[int] = None,
    auth_provider: Optional[str] = None,
    sso_subject: Optional[str] = None,
    provisioning_source: Optional[str] = None,
    external_id: Optional[str] = None,
    last_provisioned_at: Optional[int] = None,
) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    existing = load_user_enterprise_security(clean_user_id)
    resolved_mfa_enrolled = existing["mfa_enrolled"] if mfa_enrolled is None else bool(mfa_enrolled)
    resolved_mfa_method = existing["mfa_method"] if mfa_method is None else (str(mfa_method or "").strip() or None)
    resolved_enrolled_at = existing["mfa_enrolled_at"] if mfa_enrolled_at is None else int(mfa_enrolled_at)
    resolved_verified_at = existing["mfa_last_verified_at"] if mfa_last_verified_at is None else int(mfa_last_verified_at)
    ts = int(time.time())
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO user_enterprise_security (
                    user_id,
                    mfa_enrolled,
                    mfa_method,
                    mfa_enrolled_at,
                    mfa_last_verified_at,
                    auth_provider,
                    sso_subject,
                    provisioning_source,
                    external_id,
                    last_provisioned_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_user_id,
                    1 if resolved_mfa_enrolled else 0,
                    resolved_mfa_method,
                    resolved_enrolled_at,
                    resolved_verified_at,
                    existing["auth_provider"] if auth_provider is None else (str(auth_provider or "").strip() or None),
                    existing["sso_subject"] if sso_subject is None else (str(sso_subject or "").strip() or None),
                    existing["provisioning_source"] if provisioning_source is None else (str(provisioning_source or "").strip() or None),
                    existing["external_id"] if external_id is None else (str(external_id or "").strip() or None),
                    existing["last_provisioned_at"] if last_provisioned_at is None else int(last_provisioned_at),
                    ts,
                ),
            )
            connection.commit()
    return load_user_enterprise_security(clean_user_id)


def _normalize_auth_method_type(value: Any, *, default: str = "password") -> str:
    token = str(value or "").strip().lower()
    if token in {"password", "oauth", "sso", "magic_link", "api_key"}:
        return token
    fallback = str(default or "password").strip().lower()
    return fallback if fallback in {"password", "oauth", "sso", "magic_link", "api_key"} else "password"


def _normalize_auth_method_status(value: Any, *, default: str = "active") -> str:
    token = str(value or "").strip().lower()
    if token in {"active", "disabled", "pending", "revoked"}:
        return token
    fallback = str(default or "active").strip().lower()
    return fallback if fallback in {"active", "disabled", "pending", "revoked"} else "active"


def _normalize_provider_connection_status(value: Any, *, default: str = "active") -> str:
    token = str(value or "").strip().lower()
    if token in {"active", "pending", "disconnected", "revoked", "error"}:
        return token
    fallback = str(default or "active").strip().lower()
    return fallback if fallback in {"active", "pending", "disconnected", "revoked", "error"} else "active"


def _stable_identity_row_id(*parts: Any) -> str:
    normalized = "::".join(str(part or "").strip().lower() for part in parts if str(part or "").strip())
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return digest


def _auth_method_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    metadata: dict[str, Any] = {}
    raw_metadata = row["metadata_json"] if "metadata_json" in row.keys() else "{}"
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
        except Exception:
            parsed = {}
        if isinstance(parsed, dict):
            metadata = parsed
    return {
        "id": str(row["id"] or "").strip(),
        "user_id": str(row["user_id"] or "").strip(),
        "method_type": _normalize_auth_method_type(row["method_type"]),
        "provider": str(row["provider"] or "").strip().lower(),
        "subject": str(row["subject"] or "").strip() or None,
        "label": str(row["label"] or "").strip() or None,
        "status": _normalize_auth_method_status(row["status"]),
        "is_primary": bool(row["is_primary"]),
        "can_recover": bool(row["can_recover"]),
        "metadata": metadata,
        "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def _provider_connection_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    metadata: dict[str, Any] = {}
    raw_metadata = row["metadata_json"] if "metadata_json" in row.keys() else "{}"
    if isinstance(raw_metadata, str) and raw_metadata.strip():
        try:
            parsed = json.loads(raw_metadata)
        except Exception:
            parsed = {}
        if isinstance(parsed, dict):
            metadata = parsed
    return {
        "id": str(row["id"] or "").strip(),
        "user_id": str(row["user_id"] or "").strip(),
        "provider": str(row["provider"] or "").strip().lower(),
        "workspace_id": _normalize_workspace_token(row["workspace_id"], default="") if str(row["workspace_id"] or "").strip() else None,
        "status": _normalize_provider_connection_status(row["status"]),
        "label": str(row["label"] or "").strip() or None,
        "external_account_id": str(row["external_account_id"] or "").strip() or None,
        "metadata": metadata,
        "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def _upsert_user_auth_method_locked(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    method_type: str,
    provider: str,
    subject: Optional[str] = None,
    label: Optional[str] = None,
    status: str = "active",
    is_primary: bool = False,
    can_recover: bool = True,
    metadata: Optional[dict[str, Any]] = None,
    now_ts: Optional[int] = None,
) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    clean_provider = str(provider or "").strip().lower() or "unknown"
    clean_subject = str(subject or "").strip() or None
    clean_label = str(label or "").strip() or None
    method_id = _stable_identity_row_id("auth_method", clean_user_id, method_type, clean_provider, clean_subject or clean_label or "")
    ts = int(now_ts or time.time())
    existing = connection.execute(
        """
        SELECT created_at
        FROM user_auth_methods
        WHERE id = ?
        LIMIT 1
        """,
        (method_id,),
    ).fetchone()
    created_at = int(existing["created_at"]) if existing is not None and existing["created_at"] is not None else ts
    if is_primary:
        connection.execute(
            "UPDATE user_auth_methods SET is_primary = 0, updated_at = ? WHERE user_id = ?",
            (ts, clean_user_id),
        )
    connection.execute(
        """
        INSERT OR REPLACE INTO user_auth_methods (
            id,
            user_id,
            method_type,
            provider,
            subject,
            label,
            status,
            is_primary,
            can_recover,
            metadata_json,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            method_id,
            clean_user_id,
            _normalize_auth_method_type(method_type),
            clean_provider,
            clean_subject,
            clean_label,
            _normalize_auth_method_status(status),
            1 if is_primary else 0,
            1 if can_recover else 0,
            json.dumps(metadata or {}),
            created_at,
            ts,
        ),
    )
    row = connection.execute(
        "SELECT * FROM user_auth_methods WHERE id = ? LIMIT 1",
        (method_id,),
    ).fetchone()
    return _auth_method_from_row(row)


def _upsert_user_provider_connection_locked(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    provider: str,
    workspace_id: Optional[str] = None,
    status: str = "active",
    label: Optional[str] = None,
    external_account_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    now_ts: Optional[int] = None,
) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    clean_provider = str(provider or "").strip().lower() or "unknown"
    clean_workspace_id = _normalize_workspace_token(workspace_id, default="") if str(workspace_id or "").strip() else None
    clean_external_account_id = str(external_account_id or "").strip() or None
    connection_id = _stable_identity_row_id(
        "provider_connection",
        clean_user_id,
        clean_provider,
        clean_workspace_id or "global",
        clean_external_account_id or "",
    )
    ts = int(now_ts or time.time())
    existing = connection.execute(
        """
        SELECT created_at
        FROM user_provider_connections
        WHERE id = ?
        LIMIT 1
        """,
        (connection_id,),
    ).fetchone()
    created_at = int(existing["created_at"]) if existing is not None and existing["created_at"] is not None else ts
    connection.execute(
        """
        INSERT OR REPLACE INTO user_provider_connections (
            id,
            user_id,
            provider,
            workspace_id,
            status,
            label,
            external_account_id,
            metadata_json,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            connection_id,
            clean_user_id,
            clean_provider,
            clean_workspace_id,
            _normalize_provider_connection_status(status),
            str(label or "").strip() or None,
            clean_external_account_id,
            json.dumps(metadata or {}),
            created_at,
            ts,
        ),
    )
    row = connection.execute(
        "SELECT * FROM user_provider_connections WHERE id = ? LIMIT 1",
        (connection_id,),
    ).fetchone()
    return _provider_connection_from_row(row)


def _ensure_user_identity_boundary_records(user_id: str) -> None:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return
    ts = int(time.time())
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            user_row = connection.execute(
                """
                SELECT id, email, password_hash
                FROM users
                WHERE id = ?
                LIMIT 1
                """,
                (clean_user_id,),
            ).fetchone()
            if user_row is None:
                return
            any_method = connection.execute(
                "SELECT COUNT(1) AS count FROM user_auth_methods WHERE user_id = ?",
                (clean_user_id,),
            ).fetchone()
            has_auth_methods = int(any_method["count"]) > 0 if any_method is not None else False
            password_hash = str(user_row["password_hash"] or "").strip()
            email = str(user_row["email"] or "").strip().lower() or None
            security_row = connection.execute(
                """
                SELECT auth_provider, sso_subject, external_id, provisioning_source
                FROM user_enterprise_security
                WHERE user_id = ?
                LIMIT 1
                """,
                (clean_user_id,),
            ).fetchone()
            if security_row is not None:
                auth_provider = str(security_row["auth_provider"] or "").strip().lower()
                sso_subject = str(security_row["sso_subject"] or "").strip() or None
                external_id = str(security_row["external_id"] or "").strip() or None
                provisioning_source = str(security_row["provisioning_source"] or "").strip() or None
                has_external_identity = bool(auth_provider or sso_subject or external_id)
                password_sources = {"", "local_password", "password", "email_password"}
                existing_password_method = connection.execute(
                    """
                    SELECT id
                    FROM user_auth_methods
                    WHERE user_id = ? AND method_type = 'password' AND provider = 'empyralis_password'
                    LIMIT 1
                    """,
                    (clean_user_id,),
                ).fetchone()
                if password_hash and (
                    not has_external_identity or str(provisioning_source or "").strip().lower() in password_sources
                ) and existing_password_method is None:
                    _upsert_user_auth_method_locked(
                        connection,
                        user_id=clean_user_id,
                        method_type="password",
                        provider="empyralis_password",
                        subject=email,
                        label="Email and password",
                        is_primary=not has_auth_methods,
                        can_recover=True,
                        metadata={"email": email, "identity_role": "account_access"},
                        now_ts=ts,
                    )
                    has_auth_methods = True
                if auth_provider or sso_subject or external_id:
                    existing_sso_method = connection.execute(
                        """
                        SELECT id
                        FROM user_auth_methods
                        WHERE user_id = ? AND method_type = 'sso' AND provider = ? AND subject = ?
                        LIMIT 1
                        """,
                        (clean_user_id, auth_provider or "external_identity", sso_subject or external_id or email),
                    ).fetchone()
                    if existing_sso_method is None:
                        _upsert_user_auth_method_locked(
                            connection,
                            user_id=clean_user_id,
                            method_type="sso",
                            provider=auth_provider or "external_identity",
                            subject=sso_subject or external_id or email,
                            label=f"{(auth_provider or 'External').replace('_', ' ').title()} sign-in",
                            is_primary=not has_auth_methods,
                            can_recover=False,
                            metadata={
                                "email": email,
                                "external_id": external_id,
                                "provisioning_source": provisioning_source,
                                "identity_role": "account_access",
                            },
                            now_ts=ts,
                        )
            elif password_hash:
                _upsert_user_auth_method_locked(
                    connection,
                    user_id=clean_user_id,
                    method_type="password",
                    provider="empyralis_password",
                    subject=email,
                    label="Email and password",
                    is_primary=not has_auth_methods,
                    can_recover=True,
                    metadata={"email": email, "identity_role": "account_access"},
                    now_ts=ts,
                )
            connection.commit()


def _auth_payload_for_user(
    user: dict[str, Any],
    *,
    role: str,
    token: Optional[str] = None,
    workspace_access: Optional[list[dict[str, Any]]] = None,
    tenant_access: Optional[list[dict[str, Any]]] = None,
    enterprise_security: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    user_id = str(user.get("id") or "").strip()
    payload: dict[str, Any] = {
        "ok": True,
        "user": _public_user_payload(user, role=role),
        "identity_boundary": user_identity_boundary(user_id),
    }
    if token is not None:
        payload["token"] = token
    if workspace_access is not None:
        payload["workspace_access"] = workspace_access
    if tenant_access is not None:
        payload["tenant_access"] = tenant_access
    if enterprise_security is not None:
        payload["enterprise_security"] = enterprise_security
    return payload


def list_user_auth_methods(user_id: str) -> list[dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return []
    _ensure_user_identity_boundary_records(clean_user_id)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM user_auth_methods
                WHERE user_id = ?
                ORDER BY is_primary DESC, created_at ASC, provider ASC
                """,
                (clean_user_id,),
            ).fetchall()
    return [_auth_method_from_row(row) for row in rows]


def upsert_user_auth_method(
    user_id: str,
    *,
    method_type: str,
    provider: str,
    subject: Optional[str] = None,
    label: Optional[str] = None,
    status: str = "active",
    is_primary: bool = False,
    can_recover: bool = True,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            record = _upsert_user_auth_method_locked(
                connection,
                user_id=clean_user_id,
                method_type=method_type,
                provider=provider,
                subject=subject,
                label=label,
                status=status,
                is_primary=is_primary,
                can_recover=can_recover,
                metadata=metadata,
            )
            connection.commit()
            return record


def list_user_provider_connections(user_id: str) -> list[dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return []
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM user_provider_connections
                WHERE user_id = ?
                ORDER BY provider ASC, workspace_id ASC, created_at ASC
                """,
                (clean_user_id,),
            ).fetchall()
    return [_provider_connection_from_row(row) for row in rows]


def upsert_user_provider_connection(
    user_id: str,
    *,
    provider: str,
    workspace_id: Optional[str] = None,
    status: str = "active",
    label: Optional[str] = None,
    external_account_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        raise HTTPException(status_code=400, detail="user_id is required.")
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            record = _upsert_user_provider_connection_locked(
                connection,
                user_id=clean_user_id,
                provider=provider,
                workspace_id=workspace_id,
                status=status,
                label=label,
                external_account_id=external_account_id,
                metadata=metadata,
            )
            connection.commit()
            return record


def user_identity_boundary(user_id: str) -> dict[str, Any]:
    clean_user_id = str(user_id or "").strip()
    auth_methods = list_user_auth_methods(clean_user_id)
    provider_connections = list_user_provider_connections(clean_user_id)
    primary_auth_method = next((item for item in auth_methods if item.get("is_primary")), auth_methods[0] if auth_methods else None)
    active_provider_connections = [
        item for item in provider_connections if _normalize_provider_connection_status(item.get("status")) == "active"
    ]
    return {
        "account_owner": "empyralis",
        "account_id": clean_user_id,
        "auth_methods": auth_methods,
        "provider_connections": provider_connections,
        "machine_enrollment": {
            "separate_from_account_identity": True,
            "managed_via": "machines_and_runtime_enrollment",
        },
        "summary": {
            "primary_auth_method": primary_auth_method,
            "auth_method_count": len(auth_methods),
            "linked_provider_count": len(active_provider_connections),
            "has_recovery_method": any(
                bool(item.get("can_recover"))
                and _normalize_auth_method_status(item.get("status")) == "active"
                for item in auth_methods
            ),
        },
        "boundaries": {
            "identity": "Empyralis owns the user account, workspaces, runs, artifacts, notifications, and billing.",
            "auth_methods": "Account access methods are separate from AI provider capabilities.",
            "provider_connections": "Linked providers add capability only and can be revoked without deleting the Empyralis account.",
            "machine_enrollment": "Machine enrollment is a separate execution boundary and does not define account ownership.",
        },
    }


def enterprise_status_for_user(current_user: Optional[Dict[str, Any]]) -> dict[str, Any]:
    user_id = _current_bearer_user_id(current_user)
    user_security = load_user_enterprise_security(user_id)
    tenant_ids = sorted(allowed_tenant_ids(current_user) or [])
    tenant_settings = [load_tenant_enterprise_settings(tenant_id) for tenant_id in tenant_ids]
    mfa_required = any(bool(item.get("mfa", {}).get("required")) for item in tenant_settings)
    return {
        "ok": True,
        "user": user_security,
        "tenants": tenant_settings,
        "summary": {
            "sso_enabled": any(bool(item.get("sso", {}).get("enabled")) for item in tenant_settings),
            "mfa_required": mfa_required,
            "mfa_enrolled": bool(user_security.get("mfa_enrolled")),
            "scim_enabled": any(bool(item.get("scim", {}).get("enabled")) for item in tenant_settings),
        },
    }


def provision_user_account(
    *,
    email: str,
    name: Optional[str] = None,
    tenant_id: Optional[str] = None,
    workspace_roles: Optional[dict[str, Any]] = None,
    provisioning_source: str = "admin_api",
    external_id: Optional[str] = None,
    auth_provider: Optional[str] = None,
    sso_subject: Optional[str] = None,
) -> dict[str, Any]:
    email_token = str(email or "").strip().lower()
    if not email_token or "@" not in email_token:
        raise HTTPException(status_code=400, detail="Valid email is required.")
    resolved_tenant_id = _require_tenant_token(tenant_id, detail="tenant_id is required for admin provisioning.", status_code=400)
    normalized_workspace_roles: dict[str, str] = {}
    for raw_workspace_id, raw_role in dict(workspace_roles or {}).items():
        workspace_id = _normalize_workspace_token(raw_workspace_id, default="")
        if not workspace_id:
            continue
        normalized_workspace_roles[workspace_id] = normalize_rbac_role(raw_role, default="member")
    if not normalized_workspace_roles:
        raise HTTPException(status_code=400, detail="At least one workspace role is required for admin provisioning.")
    created_at = int(time.time())
    _control_plane_workspace_roles = dict(normalized_workspace_roles)
    with AUTH_LOCK:
        with _connect_auth_db() as connection:
            existing = connection.execute(
                "SELECT id, email, name, avatar_url, password_hash, created_at FROM users WHERE lower(email) = lower(?)",
                (email_token,),
            ).fetchone()
            if existing is None:
                user_id = str(uuid.uuid4())
                password_hash = _hash_password(secrets.token_urlsafe(32))
                connection.execute(
                    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                    (user_id, email_token, str(name or "").strip() or None, password_hash, created_at),
                )
            else:
                user_id = str(existing["id"] or "").strip()
                next_name = str(name or "").strip() or str(existing["name"] or "").strip() or None
                connection.execute(
                    "UPDATE users SET name = ? WHERE id = ?",
                    (next_name, user_id),
                )
            for workspace_id, role in normalized_workspace_roles.items():
                _write_workspace_registry(
                    connection,
                    workspace_id=workspace_id,
                    tenant_id=resolved_tenant_id,
                    now_ts=created_at,
                )
                _write_workspace_membership(
                    connection,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    role=role,
                    now_ts=created_at,
                )
            current_security_row = connection.execute(
                """
                SELECT
                    user_id,
                    mfa_enrolled,
                    mfa_method,
                    mfa_enrolled_at,
                    mfa_last_verified_at,
                    auth_provider,
                    sso_subject,
                    provisioning_source,
                    external_id,
                    last_provisioned_at,
                    updated_at
                FROM user_enterprise_security
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
            current_security = _user_enterprise_security_from_row(current_security_row, user_id)
            connection.execute(
                """
                INSERT OR REPLACE INTO user_enterprise_security (
                    user_id,
                    mfa_enrolled,
                    mfa_method,
                    mfa_enrolled_at,
                    mfa_last_verified_at,
                    auth_provider,
                    sso_subject,
                    provisioning_source,
                    external_id,
                    last_provisioned_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    1 if bool(current_security.get("mfa_enrolled")) else 0,
                    current_security.get("mfa_method"),
                    current_security.get("mfa_enrolled_at"),
                    current_security.get("mfa_last_verified_at"),
                    str(auth_provider or current_security.get("auth_provider") or "").strip() or None,
                    str(sso_subject or current_security.get("sso_subject") or "").strip() or None,
                    str(provisioning_source or current_security.get("provisioning_source") or "admin_api").strip() or "admin_api",
                    str(external_id or current_security.get("external_id") or "").strip() or None,
                    created_at,
                    created_at,
                ),
            )
            if auth_provider or sso_subject or external_id:
                existing_auth_methods_row = connection.execute(
                    "SELECT COUNT(1) AS count FROM user_auth_methods WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
                has_auth_methods = (
                    int(existing_auth_methods_row["count"]) > 0
                    if existing_auth_methods_row is not None
                    else False
                )
                _upsert_user_auth_method_locked(
                    connection,
                    user_id=user_id,
                    method_type="sso",
                    provider=str(auth_provider or "external_identity").strip().lower(),
                    subject=str(sso_subject or external_id or email_token).strip() or email_token,
                    label=f"{str(auth_provider or 'External').replace('_', ' ').title()} sign-in",
                    is_primary=not has_auth_methods,
                    can_recover=False,
                    metadata={
                        "email": email_token,
                        "external_id": str(external_id or "").strip() or None,
                        "provisioning_source": str(provisioning_source or "admin_api").strip() or "admin_api",
                        "identity_role": "account_access",
                    },
                    now_ts=created_at,
                )
            connection.commit()
    for workspace_id, role in _control_plane_workspace_roles.items():
        _control_plane_call(
            control_plane_repository.ensure_workspace_membership(
                user_id=user_id,
                email=email_token,
                display_name=str(name or "").strip() or None,
                tenant_id=resolved_tenant_id,
                workspace_id=workspace_id,
                role=role,
                provider=str(auth_provider or "external_identity").strip().lower() or "external_identity",
                subject=str(sso_subject or external_id or email_token).strip() or email_token,
            )
        )
    user = _find_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=500, detail="Provisioned user was not persisted.")
    workspace_access = _effective_workspace_access(
        user_id=user_id,
        email=email_token,
        role="member",
        auth_type="bearer",
        is_admin=False,
        workspace_ids=list(normalized_workspace_roles.keys()),
    )
    return _auth_payload_for_user(
        user,
        role="member",
        workspace_access=list(workspace_access.values()),
        tenant_access=list(tenant_access_map({"workspace_access": workspace_access}).values()),
        enterprise_security=load_user_enterprise_security(user_id),
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
    if auth_type in {"api_key", "disabled"}:
        return {}
    if is_admin and auth_type not in {"bearer"}:
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

    access: dict[str, dict[str, Any]] = {}
    for workspace_id in sorted(effective_workspace_ids):
        tenant_id = tenant_id_for_workspace(workspace_id)
        tenant_policy = load_tenant_policy(tenant_id)
        policy_row = load_workspace_policy(workspace_id)
        role_value = membership_roles.get(workspace_id) or claim_roles.get(workspace_id)
        if not role_value and workspace_id in effective_workspace_ids:
            role_value = normalize_rbac_role(role, default="viewer")
        workspace_capability_policy = {
            "allow": list(claim_capabilities.get(workspace_id, {}).get("allow") or policy_row["capabilities"]["allow"]),
            "deny": list(claim_capabilities.get(workspace_id, {}).get("deny") or policy_row["capabilities"]["deny"]),
        }
        capability_policy = _resolve_inherited_allow_deny(
            tenant_policy.get("capabilities"),
            workspace_capability_policy,
        )
        workspace_dangerous_policy = {
            "allow": list(claim_dangerous.get(workspace_id, {}).get("allow") or policy_row["dangerous_action_classes"]["allow"]),
            "deny": list(claim_dangerous.get(workspace_id, {}).get("deny") or policy_row["dangerous_action_classes"]["deny"]),
        }
        dangerous_policy = _resolve_inherited_allow_deny(
            tenant_policy.get("dangerous_action_classes"),
            workspace_dangerous_policy,
        )
        connector_policy = _resolve_inherited_allow_deny(
            tenant_policy.get("connectors"),
            policy_row.get("connectors"),
        )
        trusted_owner_machine_ids = list(
            claim_trusted.get(workspace_id) or policy_row.get("trusted_owner_machine_ids") or []
        )
        access[workspace_id] = {
            "workspace_id": workspace_id,
            "tenant_id": tenant_id,
            "tenant_role": normalize_rbac_role(role_value, default="viewer"),
            "role": normalize_rbac_role(role_value, default="viewer"),
            "capabilities": _normalize_workspace_capability_policy(capability_policy),
            "tenant_capabilities": _normalize_workspace_capability_policy(tenant_policy.get("capabilities")),
            "workspace_capabilities": _normalize_workspace_capability_policy(workspace_capability_policy),
            "dangerous_action_classes": _normalize_workspace_dangerous_policy(dangerous_policy),
            "tenant_dangerous_action_classes": _normalize_workspace_dangerous_policy(tenant_policy.get("dangerous_action_classes")),
            "workspace_dangerous_action_classes": _normalize_workspace_dangerous_policy(workspace_dangerous_policy),
            "connectors": _normalize_connector_permission_policy(connector_policy),
            "tenant_connectors": _normalize_connector_permission_policy(tenant_policy.get("connectors")),
            "workspace_connectors": _normalize_connector_permission_policy(policy_row.get("connectors")),
            "machine_enrollment_scope": _normalize_machine_enrollment_scope(
                policy_row.get("machine_enrollment_scope") or tenant_policy.get("machine_enrollment_scope"),
                default="workspace",
            ),
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
    pg_user = _control_plane_call(control_plane_repository.get_user_by_email(email_token))
    if isinstance(pg_user, dict):
        return pg_user
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
    pg_user = _control_plane_call(control_plane_repository.get_user_by_id(user_token))
    if isinstance(pg_user, dict):
        return pg_user
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


def issue_token(
    user_id: str,
    *,
    email: Optional[str] = None,
    role: str = "member",
    workspace_access: Optional[list[dict[str, Any]]] = None,
) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    normalized_workspace_access = [dict(item) for item in list(workspace_access or []) if isinstance(item, dict)]
    workspace_ids = [
        _normalize_workspace_token(item.get("workspace_id"))
        for item in normalized_workspace_access
        if str(item.get("workspace_id") or "").strip()
    ]
    tenant_ids = [
        _normalize_tenant_token(item.get("tenant_id"))
        for item in normalized_workspace_access
        if str(item.get("tenant_id") or "").strip()
    ]
    workspace_roles = {
        _normalize_workspace_token(item.get("workspace_id")): normalize_rbac_role(item.get("role"), default=role)
        for item in normalized_workspace_access
        if str(item.get("workspace_id") or "").strip()
    }
    payload = {
        "sub": str(user_id),
        "email": str(email or "").strip().lower() or None,
        "role": normalize_rbac_role(role),
        "tenant_ids": sorted({token for token in tenant_ids if token}),
        "workspace_ids": sorted({token for token in workspace_ids if token}),
        "workspace_roles": workspace_roles,
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
    return normalized


def allowed_workspace_ids(user: Optional[Dict[str, Any]]) -> Optional[set[str]]:
    if not isinstance(user, dict):
        return None
    auth_type = str(user.get("auth_type") or "").strip().lower()
    if auth_type == "api_key":
        return None
    if bool(user.get("is_admin")) and auth_type != "bearer":
        return None
    access = workspace_access_map(user)
    if access:
        return set(access.keys())
    values = user.get("workspace_ids")
    normalized = _normalize_workspace_ids_claim(values)
    return set(normalized)


def allowed_tenant_ids(user: Optional[Dict[str, Any]]) -> Optional[set[str]]:
    if not isinstance(user, dict):
        return None
    auth_type = str(user.get("auth_type") or "").strip().lower()
    if auth_type == "api_key":
        return None
    if bool(user.get("is_admin")) and auth_type != "bearer":
        return None
    access = tenant_access_map(user)
    if access:
        return set(access.keys())
    return {
        tenant_id_for_workspace(workspace_id)
        for workspace_id in _normalize_workspace_ids_claim(user.get("workspace_ids"))
    }


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
                "tenant_id": _normalize_tenant_token(raw_entry.get("tenant_id")),
                "tenant_role": normalize_rbac_role(raw_entry.get("tenant_role"), default="viewer"),
                "role": normalize_rbac_role(raw_entry.get("role"), default="viewer"),
                "capabilities": _normalize_workspace_capability_policy(raw_entry.get("capabilities")),
                "tenant_capabilities": _normalize_workspace_capability_policy(raw_entry.get("tenant_capabilities")),
                "workspace_capabilities": _normalize_workspace_capability_policy(raw_entry.get("workspace_capabilities")),
                "dangerous_action_classes": _normalize_workspace_dangerous_policy(
                    raw_entry.get("dangerous_action_classes")
                ),
                "tenant_dangerous_action_classes": _normalize_workspace_dangerous_policy(
                    raw_entry.get("tenant_dangerous_action_classes")
                ),
                "workspace_dangerous_action_classes": _normalize_workspace_dangerous_policy(
                    raw_entry.get("workspace_dangerous_action_classes")
                ),
                "connectors": _normalize_connector_permission_policy(raw_entry.get("connectors")),
                "tenant_connectors": _normalize_connector_permission_policy(raw_entry.get("tenant_connectors")),
                "workspace_connectors": _normalize_connector_permission_policy(raw_entry.get("workspace_connectors")),
                "machine_enrollment_scope": _normalize_machine_enrollment_scope(
                    raw_entry.get("machine_enrollment_scope"),
                    default="workspace",
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


def tenant_access_map(current_user: Optional[Dict[str, Any]]) -> dict[str, dict[str, Any]]:
    workspace_access = workspace_access_map(current_user)
    out: dict[str, dict[str, Any]] = {}
    for workspace_id, entry in workspace_access.items():
        if not isinstance(entry, dict):
            continue
        tenant_id = _normalize_tenant_token(entry.get("tenant_id"), default="")
        if not tenant_id:
            continue
        existing = out.get(tenant_id)
        role = normalize_rbac_role(entry.get("role"), default="viewer")
        if existing is None:
            tenant_policy = load_tenant_policy(tenant_id)
            out[tenant_id] = {
                "tenant_id": tenant_id,
                "role": role,
                "workspace_ids": [workspace_id],
                "capabilities": _normalize_workspace_capability_policy(tenant_policy.get("capabilities")),
                "dangerous_action_classes": _normalize_workspace_dangerous_policy(
                    tenant_policy.get("dangerous_action_classes")
                ),
                "connectors": _normalize_connector_permission_policy(tenant_policy.get("connectors")),
                "machine_enrollment_scope": _normalize_machine_enrollment_scope(
                    tenant_policy.get("machine_enrollment_scope"),
                    default="workspace",
                ),
            }
            continue
        existing["workspace_ids"] = sorted(
            {str(item) for item in list(existing.get("workspace_ids") or []) + [workspace_id] if str(item).strip()}
        )
        if RBAC_ROLE_ORDER[role] > RBAC_ROLE_ORDER[normalize_rbac_role(existing.get("role"), default="viewer")]:
            existing["role"] = role
    return out


def workspace_role(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> Optional[str]:
    if not isinstance(current_user, dict):
        return None
    auth_type = str(current_user.get("auth_type") or "").strip().lower()
    if auth_type in {"api_key", "disabled"}:
        return "owner"
    if auth_type != "bearer" and bool(current_user.get("is_admin")):
        return "owner"
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if isinstance(entry, dict):
        return normalize_rbac_role(entry.get("role"), default="viewer")
    return None


def workspace_tenant_id(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> str:
    token = _require_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if isinstance(entry, dict):
        return _require_tenant_token(entry.get("tenant_id"), detail=f"Workspace '{token}' is not bound to a valid tenant.")
    return tenant_id_for_workspace(token)


def tenant_role(current_user: Optional[Dict[str, Any]], tenant_id: Optional[str]) -> Optional[str]:
    if not isinstance(current_user, dict):
        return None
    auth_type = str(current_user.get("auth_type") or "").strip().lower()
    if auth_type in {"api_key", "disabled"}:
        return "owner"
    if auth_type != "bearer" and bool(current_user.get("is_admin")):
        return "owner"
    token = _normalize_tenant_token(tenant_id)
    entry = tenant_access_map(current_user).get(token)
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


def workspace_connector_policy(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> dict[str, list[str]]:
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if not isinstance(entry, dict):
        return {"allow": [], "deny": []}
    return _normalize_connector_permission_policy(entry.get("connectors"))


def workspace_machine_enrollment_scope(current_user: Optional[Dict[str, Any]], workspace_id: Optional[str]) -> str:
    token = _normalize_workspace_token(workspace_id)
    entry = workspace_access_map(current_user).get(token)
    if not isinstance(entry, dict):
        return "workspace"
    return _normalize_machine_enrollment_scope(entry.get("machine_enrollment_scope"), default="workspace")


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


def workspace_connector_decision(
    current_user: Optional[Dict[str, Any]],
    workspace_id: Optional[str],
    connector_id: Optional[str],
) -> dict[str, Any]:
    clean_connector_id = str(connector_id or "").strip().lower()
    if not clean_connector_id:
        return {"decision": "allow", "reason": "workspace_connector_not_applicable"}
    policy = workspace_connector_policy(current_user, workspace_id)
    denied = set(policy.get("deny") or [])
    allowed = set(policy.get("allow") or [])
    role = workspace_role(current_user, workspace_id)
    if clean_connector_id in denied or WORKSPACE_CAPABILITY_ALL in denied:
        return {"decision": "deny", "reason": "workspace_connector_denied"}
    if allowed and WORKSPACE_CAPABILITY_ALL not in allowed and clean_connector_id not in allowed and role != "owner":
        return {"decision": "deny", "reason": "workspace_connector_not_granted"}
    return {"decision": "allow", "reason": "workspace_connector_allowed"}


def build_workspace_authorization_metadata(
    current_user: Optional[Dict[str, Any]],
    workspace_id: Optional[str],
    *,
    capability_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    connector_id: Optional[str] = None,
) -> dict[str, Any]:
    token = _normalize_workspace_token(workspace_id)
    resolved_tenant_id = workspace_tenant_id(current_user, token)
    trusted_owner_machine_ids = workspace_trusted_owner_machine_ids(current_user, token)
    clean_machine_id = str(machine_id or "").strip().lower() or None
    connector_policy = workspace_connector_policy(current_user, token)
    return {
        "tenant_id": resolved_tenant_id,
        "workspace_id": token,
        "policy_scope_precedence": ["global", "tenant", "workspace", "machine", "capability"],
        "tenant_role": tenant_role(current_user, resolved_tenant_id) or workspace_role(current_user, token) or current_user_role(current_user, default="viewer"),
        "workspace_role": workspace_role(current_user, token) or current_user_role(current_user, default="viewer"),
        "tenant_access": tenant_access_map(current_user).get(resolved_tenant_id) or None,
        "workspace_capability_policy": workspace_capability_policy(current_user, token),
        "workspace_dangerous_action_policy": workspace_dangerous_action_policy(current_user, token),
        "workspace_connector_policy": connector_policy,
        "machine_enrollment_scope": workspace_machine_enrollment_scope(current_user, token),
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
        "workspace_connector_decision": workspace_connector_decision(
            current_user,
            token,
            connector_id,
        ),
    }


def enforce_workspace_access(
    current_user: Optional[Dict[str, Any]],
    workspace_id: Optional[str],
    *,
    tenant_id: Optional[str] = None,
    minimum_role: str = "viewer",
    capability_id: Optional[str] = None,
    connector_id: Optional[str] = None,
) -> str:
    token = _normalize_workspace_token(workspace_id)
    resolved_tenant_id = workspace_tenant_id(current_user, token)
    requested_tenant_id = _normalize_tenant_token(tenant_id) if tenant_id is not None else resolved_tenant_id
    if requested_tenant_id != resolved_tenant_id:
        raise HTTPException(
            status_code=403,
            detail=f"Workspace '{token}' is not available inside tenant '{requested_tenant_id}'.",
        )
    allowed_tenants = allowed_tenant_ids(current_user)
    if allowed_tenants is not None and resolved_tenant_id not in allowed_tenants:
        raise HTTPException(status_code=403, detail="Tenant is not accessible for this user.")
    allowed = allowed_workspace_ids(current_user)
    if allowed is None:
        capability_decision = workspace_capability_decision(current_user, token, capability_id)
        if capability_decision["decision"] != "allow":
            raise HTTPException(
                status_code=403,
                detail=f"Capability '{str(capability_id or '').strip()}' is not allowed in workspace '{token}'.",
            )
        connector_decision = workspace_connector_decision(current_user, token, connector_id)
        if connector_decision["decision"] != "allow":
            raise HTTPException(
                status_code=403,
                detail=f"Connector '{str(connector_id or '').strip()}' is not allowed in workspace '{token}'.",
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
    connector_decision = workspace_connector_decision(current_user, token, connector_id)
    if connector_decision["decision"] != "allow":
        raise HTTPException(
            status_code=403,
            detail=f"Connector '{str(connector_id or '').strip()}' is not allowed in workspace '{token}'.",
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
    control_plane_user = _control_plane_call(
        control_plane_repository.create_local_password_account(
            user_id=user_id,
            email=email_token,
            display_name=user_name,
            password_hash=password_hash,
            role="owner",
        )
    )
    control_plane_user_payload = control_plane_user.get("user") if isinstance(control_plane_user, dict) else {}
    control_plane_memberships = control_plane_user.get("memberships") if isinstance(control_plane_user, dict) else []
    if isinstance(control_plane_user_payload, dict) and str(control_plane_user_payload.get("id") or "").strip():
        user_id = str(control_plane_user_payload.get("id") or "").strip()
    workspace_roles = {
        _normalize_workspace_token(item.get("workspace_id")): normalize_rbac_role(item.get("role"), default="owner")
        for item in list(control_plane_memberships or [])
        if isinstance(item, dict) and str(item.get("workspace_id") or "").strip()
    }
    tenant_ids = {
        _normalize_tenant_token(item.get("tenant_id"))
        for item in list(control_plane_memberships or [])
        if isinstance(item, dict) and str(item.get("tenant_id") or "").strip()
    }
    if not workspace_roles:
        bootstrap_workspace_id = f"ws_{user_id[:12]}"
        bootstrap_tenant_id = f"tenant_{user_id[:12]}"
        workspace_roles = {bootstrap_workspace_id: "owner"}
        tenant_ids = {bootstrap_tenant_id}
    workspace_ids = list(workspace_roles.keys())
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
            connection.execute(
                """
                INSERT OR REPLACE INTO user_enterprise_security (
                    user_id,
                    mfa_enrolled,
                    mfa_method,
                    mfa_enrolled_at,
                    mfa_last_verified_at,
                    auth_provider,
                    sso_subject,
                    provisioning_source,
                    external_id,
                    last_provisioned_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, 0, None, None, None, None, None, "local_password", None, None, created_at),
            )
            _upsert_user_auth_method_locked(
                connection,
                user_id=user_id,
                method_type="password",
                provider="empyralis_password",
                subject=email_token,
                label="Email and password",
                is_primary=True,
                can_recover=True,
                metadata={
                    "email": email_token,
                    "identity_role": "account_access",
                },
                now_ts=created_at,
            )
            for workspace_id, role in workspace_roles.items():
                resolved_tenant_id = next(iter(tenant_ids), "") or tenant_id_for_workspace(workspace_id)
                _write_workspace_registry(
                    connection,
                    workspace_id=workspace_id,
                    tenant_id=resolved_tenant_id,
                    now_ts=created_at,
                )
                _write_workspace_membership(
                    connection,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    role=role,
                    now_ts=created_at,
                )
            connection.commit()
    workspace_access = _effective_workspace_access(
        user_id=user_id,
        email=email_token,
        role="owner",
        auth_type="bearer",
        is_admin=False,
        workspace_ids=workspace_ids,
    )
    tenant_access = tenant_access_map({"workspace_access": workspace_access})
    return _auth_payload_for_user(
        {
            "id": user_id,
            "email": email_token,
            "name": user_name,
            "avatar_url": None,
        },
        role="owner",
        token=issue_token(
            user_id,
            email=email_token,
            role="owner",
            workspace_access=list(workspace_access.values()),
        ),
        workspace_access=list(workspace_access.values()),
        tenant_access=list(tenant_access.values()),
    )


def login_user(email: str, password: str) -> Dict[str, Any]:
    user = _find_user_by_email(email)
    identity = _control_plane_call(control_plane_repository.get_local_auth_identity_by_email(email))
    password_hash = str((user or {}).get("password_hash") or (identity or {}).get("password_hash") or "")
    if not user and isinstance(identity, dict):
        user = {
            "id": str(identity.get("user_id") or "").strip(),
            "email": str(identity.get("email") or "").strip().lower(),
            "name": str(identity.get("display_name") or "").strip() or None,
            "avatar_url": str(identity.get("avatar_url") or "").strip() or None,
            "tenant_id": str(identity.get("tenant_id") or "").strip() or None,
            "workspace_id": str(identity.get("workspace_id") or "").strip() or None,
            "password_hash": password_hash,
        }
    if not user or not _verify_password(password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user record.")
    membership_rows = _list_workspace_memberships(user_id)
    workspace_ids = [
        _normalize_workspace_token(item.get("workspace_id"))
        for item in membership_rows
        if isinstance(item, dict) and str(item.get("workspace_id") or "").strip()
    ]
    if not workspace_ids:
        raise HTTPException(status_code=403, detail="Authenticated user does not have workspace access.")
    effective_role = "viewer"
    for item in membership_rows:
        candidate_role = normalize_rbac_role((item or {}).get("role"), default="viewer")
        if RBAC_ROLE_ORDER[candidate_role] > RBAC_ROLE_ORDER[effective_role]:
            effective_role = candidate_role
    workspace_access = _effective_workspace_access(
        user_id=user_id,
        email=str(user.get("email") or "").strip().lower() or None,
        role=effective_role,
        auth_type="bearer",
        is_admin=effective_role == "owner",
        workspace_ids=workspace_ids,
    )
    tenant_access = tenant_access_map({"workspace_access": workspace_access})
    return _auth_payload_for_user(
        user,
        role=effective_role,
        token=issue_token(
            user_id,
            email=str(user.get("email") or ""),
            role=effective_role,
            workspace_access=list(workspace_access.values()),
        ),
        workspace_access=list(workspace_access.values()),
        tenant_access=list(tenant_access.values()),
    )


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
    return _auth_payload_for_user(
        user,
        role=role,
        workspace_access=list(workspace_access_map(current_user).values()),
        tenant_access=list(tenant_access_map(current_user).values()),
        enterprise_security=enterprise_status_for_user(current_user),
    )


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
            "tenant_ids": [entry.get("tenant_id") for entry in workspace_access.values() if isinstance(entry, dict)],
            "workspace_ids": workspace_ids,
            "workspace_roles": {
                workspace_id: entry.get("role")
                for workspace_id, entry in workspace_access.items()
                if isinstance(entry, dict)
            },
            "workspace_access": workspace_access,
            "tenant_access": tenant_access_map({"workspace_access": workspace_access}),
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
    if not public_registration_enabled():
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
