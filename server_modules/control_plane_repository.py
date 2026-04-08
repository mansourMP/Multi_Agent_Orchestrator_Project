from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from server_modules import db as runtime_db


LOGGER = logging.getLogger(__name__)

_SCHEMA_READY = False
_SCHEMA_LOCK: asyncio.Lock = asyncio.Lock()

CONTROL_PLANE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_by_user_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NULL,
    avatar_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_identities (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    password_hash TEXT NULL,
    identity_role TEXT NOT NULL DEFAULT 'account_access',
    label TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, subject)
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    workspace_type TEXT NOT NULL DEFAULT 'personal',
    status TEXT NOT NULL DEFAULT 'active',
    created_by_user_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS agent_threads (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    owner_user_id TEXT NULL,
    channel TEXT NOT NULL DEFAULT 'web',
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_turn_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'web',
    actor JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS agent_turns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    session_id TEXT NULL,
    request_id TEXT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    content TEXT NOT NULL DEFAULT '',
    run_id TEXT NULL,
    actor JSONB NOT NULL DEFAULT '{}'::jsonb,
    approvals JSONB NOT NULL DEFAULT '[]'::jsonb,
    interventions JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    current_version_id TEXT NULL,
    published_version_id TEXT NULL,
    created_by_user_id TEXT NULL,
    last_run_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workflow_id, version_number)
);

CREATE TABLE IF NOT EXISTS runtime_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    runtime_class TEXT NOT NULL DEFAULT 'cloud_worker',
    placement_mode TEXT NOT NULL DEFAULT 'auto',
    runtime_id TEXT NULL,
    machine_id TEXT NULL,
    default_execution_target TEXT NOT NULL DEFAULT 'auto',
    supported_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    root_folder_uri TEXT NULL,
    allowed_connector_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    last_seen_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS agent_definitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    agent_kind TEXT NOT NULL DEFAULT 'specialist',
    visibility TEXT NOT NULL DEFAULT 'workspace',
    status TEXT NOT NULL DEFAULT 'draft',
    category TEXT NULL,
    icon TEXT NULL,
    created_by_user_id TEXT NULL,
    current_version_id TEXT NULL,
    published_version_id TEXT NULL,
    source_workflow_definition_id TEXT NULL REFERENCES workflow_definitions(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, slug)
);

CREATE TABLE IF NOT EXISTS agent_definition_versions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_definition_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    compiled_workflow_version_id TEXT NULL REFERENCES workflow_versions(id) ON DELETE SET NULL,
    capability_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    memory_scope_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    policy_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    placement_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    template_inputs_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_definition_id, version_number)
);

CREATE TABLE IF NOT EXISTS workspace_agent_installs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_definition_id TEXT NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
    agent_definition_version_id TEXT NOT NULL REFERENCES agent_definition_versions(id) ON DELETE RESTRICT,
    installed_by_user_id TEXT NULL,
    install_scope TEXT NOT NULL DEFAULT 'workspace',
    owner_user_id TEXT NULL,
    thread_id TEXT NULL REFERENCES agent_threads(id) ON DELETE SET NULL,
    label TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    runtime_profile_id TEXT NULL REFERENCES runtime_profiles(id) ON DELETE SET NULL,
    root_folder_uri TEXT NULL,
    tool_toggles JSONB NOT NULL DEFAULT '{}'::jsonb,
    folder_grants JSONB NOT NULL DEFAULT '[]'::jsonb,
    connector_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
    memory_scope_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    policy_context_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_threads
    ADD COLUMN IF NOT EXISTS master_agent_install_id TEXT NULL;

ALTER TABLE agent_sessions
    ADD COLUMN IF NOT EXISTS master_agent_install_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS runtime_profile_id TEXT NULL;

ALTER TABLE agent_turns
    ADD COLUMN IF NOT EXISTS active_agent_install_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS runtime_profile_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id, tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant ON workspaces(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_threads_workspace_updated ON agent_threads(tenant_id, workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_threads_master_install ON agent_threads(tenant_id, workspace_id, master_agent_install_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_thread ON agent_sessions(tenant_id, workspace_id, thread_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_master_install ON agent_sessions(tenant_id, workspace_id, master_agent_install_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_runtime_profile ON agent_sessions(tenant_id, workspace_id, runtime_profile_id);
CREATE INDEX IF NOT EXISTS idx_agent_turns_thread_created ON agent_turns(tenant_id, workspace_id, thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_turns_active_install ON agent_turns(tenant_id, workspace_id, active_agent_install_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_turns_runtime_profile ON agent_turns(tenant_id, workspace_id, runtime_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_workspace_updated ON workflow_definitions(tenant_id, workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_published ON workflow_definitions(tenant_id, workspace_id, published_version_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_number ON workflow_versions(tenant_id, workspace_id, workflow_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_profiles_workspace_status ON runtime_profiles(tenant_id, workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_profiles_runtime_machine ON runtime_profiles(tenant_id, workspace_id, runtime_id, machine_id);
CREATE INDEX IF NOT EXISTS idx_agent_definitions_workspace_updated ON agent_definitions(tenant_id, workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_definitions_kind_status ON agent_definitions(tenant_id, workspace_id, agent_kind, status);
CREATE INDEX IF NOT EXISTS idx_agent_definition_versions_agent_number ON agent_definition_versions(tenant_id, workspace_id, agent_definition_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_agent_definition_versions_workflow_version ON agent_definition_versions(tenant_id, workspace_id, compiled_workflow_version_id);
CREATE INDEX IF NOT EXISTS idx_workspace_agent_installs_status_enabled ON workspace_agent_installs(tenant_id, workspace_id, status, enabled);
CREATE INDEX IF NOT EXISTS idx_workspace_agent_installs_thread ON workspace_agent_installs(tenant_id, workspace_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_workspace_agent_installs_runtime_profile ON workspace_agent_installs(tenant_id, workspace_id, runtime_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_request_role
    ON agent_turns(tenant_id, workspace_id, thread_id, role, request_id)
    WHERE request_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_agent_threads_master_agent_install'
    ) THEN
        ALTER TABLE agent_threads
            ADD CONSTRAINT fk_agent_threads_master_agent_install
            FOREIGN KEY (master_agent_install_id) REFERENCES workspace_agent_installs(id) ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_agent_sessions_master_agent_install'
    ) THEN
        ALTER TABLE agent_sessions
            ADD CONSTRAINT fk_agent_sessions_master_agent_install
            FOREIGN KEY (master_agent_install_id) REFERENCES workspace_agent_installs(id) ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_agent_sessions_runtime_profile'
    ) THEN
        ALTER TABLE agent_sessions
            ADD CONSTRAINT fk_agent_sessions_runtime_profile
            FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_agent_turns_active_agent_install'
    ) THEN
        ALTER TABLE agent_turns
            ADD CONSTRAINT fk_agent_turns_active_agent_install
            FOREIGN KEY (active_agent_install_id) REFERENCES workspace_agent_installs(id) ON DELETE SET NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_agent_turns_runtime_profile'
    ) THEN
        ALTER TABLE agent_turns
            ADD CONSTRAINT fk_agent_turns_runtime_profile
            FOREIGN KEY (runtime_profile_id) REFERENCES runtime_profiles(id) ON DELETE SET NULL;
    END IF;
END
$$;
"""


@dataclass(slots=True)
class TenantRecord:
    id: str
    tenant_id: str
    workspace_id: str
    slug: str
    name: str
    status: str = "active"
    created_by_user_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class UserRecord:
    id: str
    tenant_id: str
    workspace_id: str
    email: str
    display_name: str = ""
    avatar_url: str = ""
    status: str = "active"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class AuthIdentityRecord:
    id: str
    tenant_id: str
    workspace_id: str
    user_id: str
    provider: str
    subject: str
    password_hash: Optional[str] = None
    identity_role: str = "account_access"
    label: str = ""
    status: str = "active"
    is_primary: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class WorkspaceRecord:
    id: str
    tenant_id: str
    workspace_id: str
    slug: str
    name: str
    workspace_type: str = "personal"
    status: str = "active"
    created_by_user_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class WorkspaceMembershipRecord:
    id: str
    tenant_id: str
    workspace_id: str
    user_id: str
    role: str
    status: str = "active"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class AgentThreadRecord:
    id: str
    tenant_id: str
    workspace_id: str
    owner_user_id: Optional[str]
    master_agent_install_id: Optional[str]
    channel: str
    title: str
    status: str = "active"
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    last_turn_at: Optional[str] = None
    turns: List[Dict[str, Any]] = field(default_factory=list)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _slugify(value: str, fallback: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return token or fallback


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _to_json(value: Any, *, default: Any) -> str:
    payload = value if value is not None else default
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


async def ensure_control_plane_schema() -> Any:
    global _SCHEMA_READY
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    if _SCHEMA_READY:
        return pool
    async with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return pool
        await pool.execute(CONTROL_PLANE_SCHEMA_SQL)
        _SCHEMA_READY = True
    return pool


def _user_row_to_dict(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    payload["name"] = str(payload.get("display_name") or "").strip() or None
    return payload


async def create_local_password_account(
    *,
    user_id: str,
    email: str,
    display_name: Optional[str],
    password_hash: str,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    role: str = "owner",
) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None

    normalized_email = str(email or "").strip().lower()
    if not normalized_email:
        return None

    created_at = _utc_now_iso()
    resolved_user_id = str(user_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    display_label = str(display_name or "").strip()
    email_prefix = normalized_email.split("@", 1)[0]
    resolved_tenant_id = str(tenant_id or f"tenant_{uuid.uuid4().hex[:12]}").strip()
    resolved_workspace_id = str(workspace_id or f"ws_{uuid.uuid4().hex[:12]}").strip()
    tenant_slug = _slugify(f"{email_prefix}-{resolved_tenant_id[:8]}", f"tenant-{resolved_tenant_id[:8]}")
    workspace_slug = _slugify(f"{email_prefix}-home-{resolved_workspace_id[:8]}", f"workspace-{resolved_workspace_id[:8]}")
    tenant_name = display_label or normalized_email
    workspace_name = f"{display_label or email_prefix}'s Workspace".strip()
    auth_identity_id = str(uuid.uuid4())
    membership_id = str(uuid.uuid4())

    async with pool.acquire() as connection:
        async with connection.transaction():
            existing_user = await connection.fetchrow(
                """
                SELECT id, tenant_id, workspace_id, email, display_name, avatar_url, status, metadata, created_at, updated_at
                FROM users
                WHERE lower(email) = lower($1)
                LIMIT 1
                """,
                normalized_email,
            )
            if existing_user is not None:
                return await get_user_bundle_by_id(str(existing_user["id"]))

            await connection.execute(
                """
                INSERT INTO tenants (
                    id, tenant_id, workspace_id, slug, name, status, created_by_user_id, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, 'active', $6, '{}'::jsonb, $7::timestamptz, $7::timestamptz)
                """,
                resolved_tenant_id,
                resolved_tenant_id,
                resolved_workspace_id,
                tenant_slug,
                tenant_name,
                resolved_user_id,
                created_at,
            )
            await connection.execute(
                """
                INSERT INTO workspaces (
                    id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, 'personal', 'active', $6, '{}'::jsonb, $7::timestamptz, $7::timestamptz)
                """,
                resolved_workspace_id,
                resolved_tenant_id,
                resolved_workspace_id,
                workspace_slug,
                workspace_name,
                resolved_user_id,
                created_at,
            )
            await connection.execute(
                """
                INSERT INTO users (
                    id, tenant_id, workspace_id, email, display_name, avatar_url, status, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, NULL, 'active', '{}'::jsonb, $6::timestamptz, $6::timestamptz)
                """,
                resolved_user_id,
                resolved_tenant_id,
                resolved_workspace_id,
                normalized_email,
                display_label or None,
                created_at,
            )
            await connection.execute(
                """
                INSERT INTO auth_identities (
                    id, tenant_id, workspace_id, user_id, provider, subject, password_hash, identity_role, label, status, is_primary, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, 'empyralis_password', $5, $6, 'account_access', 'Email and password', 'active', TRUE, '{}'::jsonb, $7::timestamptz, $7::timestamptz)
                """,
                auth_identity_id,
                resolved_tenant_id,
                resolved_workspace_id,
                resolved_user_id,
                normalized_email,
                password_hash,
                created_at,
            )
            await connection.execute(
                """
                INSERT INTO workspace_memberships (
                    id, tenant_id, workspace_id, user_id, role, status, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, 'active', '{}'::jsonb, $6::timestamptz, $6::timestamptz)
                """,
                membership_id,
                resolved_tenant_id,
                resolved_workspace_id,
                resolved_user_id,
                str(role or "owner").strip().lower() or "owner",
                created_at,
            )
    return await get_user_bundle_by_id(resolved_user_id)


async def ensure_workspace_membership(
    *,
    user_id: str,
    email: str,
    display_name: Optional[str],
    tenant_id: str,
    workspace_id: str,
    role: str,
    password_hash: Optional[str] = None,
    provider: Optional[str] = None,
    subject: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None

    created_at = _utc_now_iso()
    resolved_user_id = str(user_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    normalized_email = str(email or "").strip().lower()
    resolved_tenant_id = str(tenant_id or "").strip()
    resolved_workspace_id = str(workspace_id or "").strip()
    if not normalized_email or not resolved_tenant_id or not resolved_workspace_id:
        return None
    display_label = str(display_name or "").strip()

    async with pool.acquire() as connection:
        async with connection.transaction():
            workspace_row = await connection.fetchrow(
                "SELECT id, tenant_id, workspace_id, slug, name FROM workspaces WHERE workspace_id = $1 LIMIT 1",
                resolved_workspace_id,
            )
            if workspace_row is None:
                await connection.execute(
                    """
                    INSERT INTO tenants (
                        id, tenant_id, workspace_id, slug, name, status, created_by_user_id, metadata, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, 'active', $6, '{}'::jsonb, $7::timestamptz, $7::timestamptz)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    resolved_tenant_id,
                    resolved_tenant_id,
                    resolved_workspace_id,
                    _slugify(resolved_tenant_id, resolved_tenant_id),
                    resolved_tenant_id,
                    resolved_user_id,
                    created_at,
                )
                await connection.execute(
                    """
                    INSERT INTO workspaces (
                        id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, 'shared', 'active', $6, '{}'::jsonb, $7::timestamptz, $7::timestamptz)
                    ON CONFLICT (workspace_id) DO NOTHING
                    """,
                    resolved_workspace_id,
                    resolved_tenant_id,
                    resolved_workspace_id,
                    _slugify(resolved_workspace_id, resolved_workspace_id),
                    resolved_workspace_id,
                    resolved_user_id,
                    created_at,
                )

            await connection.execute(
                """
                INSERT INTO users (
                    id, tenant_id, workspace_id, email, display_name, avatar_url, status, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, NULL, 'active', '{}'::jsonb, $6::timestamptz, $6::timestamptz)
                ON CONFLICT (id) DO UPDATE SET
                    tenant_id = EXCLUDED.tenant_id,
                    workspace_id = EXCLUDED.workspace_id,
                    email = EXCLUDED.email,
                    display_name = COALESCE(EXCLUDED.display_name, users.display_name),
                    updated_at = EXCLUDED.updated_at
                """,
                resolved_user_id,
                resolved_tenant_id,
                resolved_workspace_id,
                normalized_email,
                display_label or None,
                created_at,
            )

            if password_hash is not None or provider or subject:
                await connection.execute(
                    """
                    INSERT INTO auth_identities (
                        id, tenant_id, workspace_id, user_id, provider, subject, password_hash, identity_role, label, status, is_primary, metadata, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'account_access', $8, 'active', FALSE, '{}'::jsonb, $9::timestamptz, $9::timestamptz)
                    ON CONFLICT (provider, subject) DO UPDATE SET
                        tenant_id = EXCLUDED.tenant_id,
                        workspace_id = EXCLUDED.workspace_id,
                        password_hash = COALESCE(EXCLUDED.password_hash, auth_identities.password_hash),
                        updated_at = EXCLUDED.updated_at
                    """,
                    str(uuid.uuid4()),
                    resolved_tenant_id,
                    resolved_workspace_id,
                    resolved_user_id,
                    str(provider or "empyralis_password").strip() or "empyralis_password",
                    str(subject or normalized_email).strip() or normalized_email,
                    password_hash,
                    "Email and password" if (provider or "empyralis_password") == "empyralis_password" else str(provider or "Identity").replace("_", " ").title(),
                    created_at,
                )

            await connection.execute(
                """
                INSERT INTO workspace_memberships (
                    id, tenant_id, workspace_id, user_id, role, status, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, 'active', '{}'::jsonb, $6::timestamptz, $6::timestamptz)
                ON CONFLICT (tenant_id, workspace_id, user_id) DO UPDATE SET
                    role = EXCLUDED.role,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
                """,
                str(uuid.uuid4()),
                resolved_tenant_id,
                resolved_workspace_id,
                resolved_user_id,
                str(role or "member").strip().lower() or "member",
                created_at,
            )
    return await get_user_bundle_by_id(resolved_user_id)


async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT id, tenant_id, workspace_id, email, display_name, avatar_url, status, metadata, created_at, updated_at
        FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1
        """,
        str(email or "").strip().lower(),
    )
    return _user_row_to_dict(row)


async def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT id, tenant_id, workspace_id, email, display_name, avatar_url, status, metadata, created_at, updated_at
        FROM users
        WHERE id = $1
        LIMIT 1
        """,
        str(user_id or "").strip(),
    )
    return _user_row_to_dict(row)


async def get_local_auth_identity_by_email(email: str) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT
            ai.id,
            ai.tenant_id,
            ai.workspace_id,
            ai.user_id,
            ai.provider,
            ai.subject,
            ai.password_hash,
            ai.identity_role,
            ai.label,
            ai.status,
            ai.is_primary,
            ai.metadata,
            ai.created_at,
            ai.updated_at,
            u.email,
            u.display_name,
            u.avatar_url
        FROM auth_identities ai
        JOIN users u ON u.id = ai.user_id
        WHERE ai.provider = 'empyralis_password'
          AND lower(ai.subject) = lower($1)
        LIMIT 1
        """,
        str(email or "").strip().lower(),
    )
    return dict(row) if row is not None else None


async def list_workspace_memberships_for_user(user_id: str) -> List[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return []
    rows = await pool.fetch(
        """
        SELECT
            wm.id,
            wm.tenant_id,
            wm.workspace_id,
            wm.user_id,
            wm.role,
            wm.status,
            wm.metadata,
            wm.created_at,
            wm.updated_at,
            w.name AS workspace_name
        FROM workspace_memberships wm
        LEFT JOIN workspaces w ON w.workspace_id = wm.workspace_id
        WHERE wm.user_id = $1
        ORDER BY wm.created_at ASC
        """,
        str(user_id or "").strip(),
    )
    return [dict(row) for row in rows]


async def get_workspace_by_id(workspace_id: str) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
        FROM workspaces
        WHERE workspace_id = $1
        LIMIT 1
        """,
        str(workspace_id or "").strip(),
    )
    return dict(row) if row is not None else None


async def tenant_id_for_workspace(workspace_id: str) -> Optional[str]:
    workspace = await get_workspace_by_id(workspace_id)
    if not isinstance(workspace, dict):
        return None
    return str(workspace.get("tenant_id") or "").strip() or None


async def get_user_bundle_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    user = await get_user_by_id(user_id)
    if not isinstance(user, dict):
        return None
    memberships = await list_workspace_memberships_for_user(user_id)
    return {
        "user": user,
        "memberships": memberships,
    }


def build_default_thread_title(message: str, *, fallback: str = "New chat") -> str:
    text = re.sub(r"\s+", " ", str(message or "").strip())
    return (text[:80].strip() or fallback)[:80]


async def ensure_agent_thread(
    *,
    thread_id: str,
    tenant_id: str,
    workspace_id: str,
    owner_user_id: Optional[str],
    master_agent_install_id: Optional[str] = None,
    channel: str,
    title: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    token = str(thread_id or "").strip()
    if not token:
        return None
    now_iso = _utc_now_iso()
    payload_title = str(title or "").strip() or "New chat"
    await pool.execute(
        """
        INSERT INTO agent_threads (
            id, tenant_id, workspace_id, owner_user_id, master_agent_install_id, channel, title, status, metadata, created_at, updated_at, last_turn_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb, $9::timestamptz, $9::timestamptz, NULL)
        ON CONFLICT (id) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            workspace_id = EXCLUDED.workspace_id,
            owner_user_id = COALESCE(EXCLUDED.owner_user_id, agent_threads.owner_user_id),
            master_agent_install_id = COALESCE(EXCLUDED.master_agent_install_id, agent_threads.master_agent_install_id),
            channel = EXCLUDED.channel,
            title = CASE WHEN agent_threads.title = 'New chat' THEN EXCLUDED.title ELSE agent_threads.title END,
            metadata = agent_threads.metadata || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        """,
        token,
        str(tenant_id or "").strip() or "default",
        str(workspace_id or "").strip() or "default",
        str(owner_user_id or "").strip() or None,
        str(master_agent_install_id or "").strip() or None,
        str(channel or "web").strip() or "web",
        payload_title,
        _to_json(metadata, default={}),
        now_iso,
    )
    return await get_agent_thread(token, include_turns=False)


async def upsert_agent_session(
    *,
    session_id: str,
    tenant_id: str,
    workspace_id: str,
    thread_id: str,
    channel: str,
    actor: Dict[str, Any],
    master_agent_install_id: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    expires_at: Optional[str] = None,
    status: str = "active",
) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    now_iso = _utc_now_iso()
    await pool.execute(
        """
        INSERT INTO agent_sessions (
            id, tenant_id, workspace_id, thread_id, channel, actor, master_agent_install_id, runtime_profile_id, status, metadata, created_at, updated_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11::timestamptz, $11::timestamptz, $12::timestamptz)
        ON CONFLICT (id) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            workspace_id = EXCLUDED.workspace_id,
            thread_id = EXCLUDED.thread_id,
            channel = EXCLUDED.channel,
            actor = EXCLUDED.actor,
            master_agent_install_id = COALESCE(EXCLUDED.master_agent_install_id, agent_sessions.master_agent_install_id),
            runtime_profile_id = COALESCE(EXCLUDED.runtime_profile_id, agent_sessions.runtime_profile_id),
            status = EXCLUDED.status,
            metadata = EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at,
            expires_at = EXCLUDED.expires_at
        """,
        str(session_id or "").strip(),
        str(tenant_id or "").strip() or "default",
        str(workspace_id or "").strip() or "default",
        str(thread_id or "").strip() or "direct-chat",
        str(channel or "web").strip() or "web",
        _to_json(actor, default={}),
        str(master_agent_install_id or "").strip() or None,
        str(runtime_profile_id or "").strip() or None,
        str(status or "active").strip() or "active",
        _to_json(metadata, default={}),
        now_iso,
        expires_at,
    )
    return await get_agent_session(str(session_id or "").strip())


async def get_agent_session(session_id: str) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow("SELECT * FROM agent_sessions WHERE id = $1 LIMIT 1", str(session_id or "").strip())
    return dict(row) if row is not None else None


async def terminate_agent_session(session_id: str) -> None:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return
    await pool.execute(
        "UPDATE agent_sessions SET status = 'terminated', updated_at = NOW() WHERE id = $1",
        str(session_id or "").strip(),
    )


async def upsert_agent_turn(
    *,
    tenant_id: str,
    workspace_id: str,
    thread_id: str,
    session_id: Optional[str],
    role: str,
    content: str,
    actor: Optional[Dict[str, Any]] = None,
    active_agent_install_id: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    status: str = "completed",
    run_id: Optional[str] = None,
    approvals: Optional[List[Dict[str, Any]]] = None,
    interventions: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
    turn_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    now_iso = _utc_now_iso()
    resolved_turn_id = str(turn_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    resolved_request_id = str(request_id or "").strip() or None
    await pool.execute(
        """
        INSERT INTO agent_turns (
            id, tenant_id, workspace_id, thread_id, session_id, request_id, role, status, content, run_id, actor, active_agent_install_id, runtime_profile_id, approvals, interventions, metadata, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, $17::timestamptz, $17::timestamptz
        )
        ON CONFLICT (tenant_id, workspace_id, thread_id, role, request_id)
        WHERE request_id IS NOT NULL
        DO UPDATE SET
            status = EXCLUDED.status,
            content = EXCLUDED.content,
            run_id = COALESCE(EXCLUDED.run_id, agent_turns.run_id),
            actor = EXCLUDED.actor,
            active_agent_install_id = COALESCE(EXCLUDED.active_agent_install_id, agent_turns.active_agent_install_id),
            runtime_profile_id = COALESCE(EXCLUDED.runtime_profile_id, agent_turns.runtime_profile_id),
            approvals = EXCLUDED.approvals,
            interventions = EXCLUDED.interventions,
            metadata = agent_turns.metadata || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        """,
        resolved_turn_id,
        str(tenant_id or "").strip() or "default",
        str(workspace_id or "").strip() or "default",
        str(thread_id or "").strip() or "direct-chat",
        str(session_id or "").strip() or None,
        resolved_request_id,
        str(role or "assistant").strip().lower() or "assistant",
        str(status or "completed").strip().lower() or "completed",
        str(content or ""),
        str(run_id or "").strip() or None,
        _to_json(actor, default={}),
        str(active_agent_install_id or "").strip() or None,
        str(runtime_profile_id or "").strip() or None,
        _to_json(approvals, default=[]),
        _to_json(interventions, default=[]),
        _to_json(metadata, default={}),
        now_iso,
    )
    await pool.execute(
        """
        UPDATE agent_threads
        SET
            updated_at = $2::timestamptz,
            last_turn_at = $2::timestamptz,
            title = CASE
                WHEN title = 'New chat' AND $3 <> '' AND $4 = 'user' THEN $3
                ELSE title
            END
        WHERE id = $1
        """,
        str(thread_id or "").strip() or "direct-chat",
        now_iso,
        build_default_thread_title(content),
        str(role or "").strip().lower(),
    )
    return await get_agent_thread(str(thread_id or "").strip(), include_turns=True)


async def list_agent_turns(
    thread_id: str,
    *,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return []
    rows = await pool.fetch(
        """
        SELECT *
        FROM agent_turns
        WHERE thread_id = $1
        ORDER BY created_at ASC
        LIMIT $2
        """,
        str(thread_id or "").strip(),
        max(1, int(limit or 200)),
    )
    return [dict(row) for row in rows]


async def get_agent_thread(thread_id: str, *, include_turns: bool = True) -> Optional[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT id, tenant_id, workspace_id, owner_user_id, master_agent_install_id, channel, title, status, metadata, created_at, updated_at, last_turn_at
        FROM agent_threads
        WHERE id = $1
        LIMIT 1
        """,
        str(thread_id or "").strip(),
    )
    if row is None:
        return None
    payload = dict(row)
    if include_turns:
        payload["turns"] = await list_agent_turns(str(thread_id or "").strip())
    return payload


async def list_agent_threads(
    *,
    workspace_id: str,
    tenant_id: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    include_turns: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    pool = await ensure_control_plane_schema()
    if pool is None:
        return []
    conditions = ["workspace_id = $1"]
    params: List[Any] = [str(workspace_id or "").strip() or "default"]
    next_index = 2
    if tenant_id:
        conditions.append(f"tenant_id = ${next_index}")
        params.append(str(tenant_id or "").strip())
        next_index += 1
    if owner_user_id:
        conditions.append(f"owner_user_id = ${next_index}")
        params.append(str(owner_user_id or "").strip())
        next_index += 1
    params.append(max(1, int(limit or 50)))
    rows = await pool.fetch(
        f"""
        SELECT id, tenant_id, workspace_id, owner_user_id, master_agent_install_id, channel, title, status, metadata, created_at, updated_at, last_turn_at
        FROM agent_threads
        WHERE {' AND '.join(conditions)}
        ORDER BY COALESCE(last_turn_at, updated_at, created_at) DESC
        LIMIT ${next_index}
        """,
        *params,
    )
    items = [dict(row) for row in rows]
    if include_turns:
        for item in items:
            item["turns"] = await list_agent_turns(str(item.get("id") or "").strip())
    return items
