from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules import db as runtime_db


LOGGER = logging.getLogger(__name__)

_SCHEMA_READY = False
_SCHEMA_LOCK: asyncio.Lock = asyncio.Lock()
EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
LOCAL_IDENTITY_DB_FILE = (EMPYRALIS_STATE_HOME / "auth" / "users.db").expanduser()
_LOCAL_IDENTITY_LOCK = threading.Lock()

_CONTROL_PLANE_SESSION_SCOPE_SQL = """
SELECT
    set_config('app.current_tenant_id', $1, true),
    set_config('app.current_workspace_id', $2, true),
    set_config('app.rls_bypass', $3, true)
"""

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
    compiled_workflow_version_id TEXT NULL REFERENCES workflow_versions(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS workspace_inventory_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    manufacturer TEXT NULL,
    make TEXT NULL,
    model TEXT NULL,
    category TEXT NULL,
    year_start INTEGER NULL,
    year_end INTEGER NULL,
    quantity_available INTEGER NOT NULL DEFAULT 0,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, sku)
);

CREATE TABLE IF NOT EXISTS agent_manifests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    manifest_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_install_id),
    UNIQUE(tenant_id, workspace_id, manifest_id)
);

CREATE TABLE IF NOT EXISTS agent_bible_versions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    bible_text TEXT NOT NULL DEFAULT '',
    bible_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_install_id, version_number)
);

CREATE TABLE IF NOT EXISTS agent_skill_bindings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_install_id, skill_id)
);

CREATE TABLE IF NOT EXISTS agent_connector_bindings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    connector_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    binding JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_install_id, connector_key)
);

CREATE TABLE IF NOT EXISTS agent_channel_bindings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    binding JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_install_id, channel_key)
);

CREATE TABLE IF NOT EXISTS agent_runtime_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    runtime_profile_id TEXT NULL REFERENCES runtime_profiles(id) ON DELETE SET NULL,
    runtime_mode TEXT NOT NULL DEFAULT 'hosted_secure',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_install_id)
);

CREATE TABLE IF NOT EXISTS personal_context_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    source_app TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority INTEGER NOT NULL DEFAULT 50,
    scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    seen_by_sage_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_scheduler_wake_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    master_agent_install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE SET NULL,
    trigger_kind TEXT NOT NULL,
    source TEXT NOT NULL,
    requested_by TEXT NOT NULL DEFAULT 'system',
    reason TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    approval_required BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'pending',
    denial_reason TEXT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ NULL,
    executed_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_channel_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    channel_key TEXT NOT NULL,
    endpoint_key TEXT NOT NULL,
    session_key TEXT NOT NULL,
    thread_id TEXT NULL REFERENCES agent_threads(id) ON DELETE SET NULL,
    responder_install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE SET NULL,
    direction TEXT NOT NULL,
    event_type TEXT NOT NULL,
    message_id TEXT NULL,
    parent_event_id TEXT NULL,
    run_id TEXT NULL,
    actor JSONB NOT NULL DEFAULT '{}'::jsonb,
    text TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'logged',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_secret_access_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    secret_kind TEXT NOT NULL,
    credential_id TEXT NULL,
    provider_id TEXT NULL,
    connector_id TEXT NULL,
    action_id TEXT NULL,
    tool_name TEXT NULL,
    run_id TEXT NULL,
    actor JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'allowed',
    denial_code TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_egress_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE SET NULL,
    run_id TEXT NULL,
    runtime_mode TEXT NULL,
    tool_name TEXT NULL,
    provider_id TEXT NULL,
    connector_scope TEXT NULL,
    action_class TEXT NOT NULL DEFAULT 'read',
    request_method TEXT NOT NULL DEFAULT 'GET',
    request_url TEXT NOT NULL,
    request_host TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'allowed',
    denial_code TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_channel_execution_leases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    responder_install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    channel_key TEXT NOT NULL,
    endpoint_key TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS security_control_states (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    control_kind TEXT NOT NULL DEFAULT 'kill_switch',
    scope_key TEXT NOT NULL,
    agent_install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    channel_key TEXT NULL,
    endpoint_key TEXT NULL,
    connector_id TEXT NULL,
    credential_id TEXT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active',
    reason TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, scope_type, control_kind, scope_key)
);

CREATE TABLE IF NOT EXISTS security_control_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    control_state_id TEXT NULL REFERENCES security_control_states(id) ON DELETE SET NULL,
    scope_type TEXT NOT NULL,
    control_kind TEXT NOT NULL DEFAULT 'kill_switch',
    action TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    agent_install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE SET NULL,
    channel_key TEXT NULL,
    endpoint_key TEXT NULL,
    connector_id TEXT NULL,
    credential_id TEXT NULL,
    reason TEXT NOT NULL DEFAULT '',
    actor_user_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_ledger_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    install_id TEXT NULL REFERENCES workspace_agent_installs(id) ON DELETE SET NULL,
    app_id TEXT NULL,
    run_id TEXT NULL,
    thread_id TEXT NULL REFERENCES agent_threads(id) ON DELETE SET NULL,
    session_key TEXT NULL,
    channel TEXT NULL,
    direction TEXT NULL,
    event_class TEXT NOT NULL,
    detail_level TEXT NOT NULL DEFAULT 'feed_summary',
    action TEXT NULL,
    trace_id TEXT NULL,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'logged',
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
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

ALTER TABLE workspace_agent_installs
    ADD COLUMN IF NOT EXISTS compiled_workflow_version_id TEXT NULL;

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
CREATE INDEX IF NOT EXISTS idx_workspace_agent_installs_compiled_workflow ON workspace_agent_installs(tenant_id, workspace_id, compiled_workflow_version_id);
CREATE INDEX IF NOT EXISTS idx_workspace_inventory_items_scope ON workspace_inventory_items(tenant_id, workspace_id, category);
CREATE INDEX IF NOT EXISTS idx_workspace_inventory_items_vehicle ON workspace_inventory_items(tenant_id, workspace_id, make, model, year_start, year_end);
CREATE INDEX IF NOT EXISTS idx_workspace_inventory_items_product_name ON workspace_inventory_items(tenant_id, workspace_id, product_name);
CREATE INDEX IF NOT EXISTS idx_agent_manifests_scope ON agent_manifests(tenant_id, workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_bible_versions_install_number ON agent_bible_versions(tenant_id, workspace_id, agent_install_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_agent_skill_bindings_install ON agent_skill_bindings(tenant_id, workspace_id, agent_install_id, enabled);
CREATE INDEX IF NOT EXISTS idx_agent_connector_bindings_install ON agent_connector_bindings(tenant_id, workspace_id, agent_install_id, enabled);
CREATE INDEX IF NOT EXISTS idx_agent_channel_bindings_install ON agent_channel_bindings(tenant_id, workspace_id, agent_install_id, enabled);
CREATE INDEX IF NOT EXISTS idx_agent_runtime_profiles_install ON agent_runtime_profiles(tenant_id, workspace_id, agent_install_id);
CREATE INDEX IF NOT EXISTS idx_personal_context_events_scope_created ON personal_context_events(tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_context_events_unseen ON personal_context_events(tenant_id, workspace_id, seen_by_sage_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_context_events_type_source ON personal_context_events(tenant_id, workspace_id, event_type, source_app, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_context_events_entity ON personal_context_events(tenant_id, workspace_id, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_scheduler_wake_requests_scope_due ON agent_scheduler_wake_requests(tenant_id, workspace_id, status, due_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_scheduler_wake_requests_master ON agent_scheduler_wake_requests(tenant_id, workspace_id, master_agent_install_id, due_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_scheduler_wake_requests_trigger ON agent_scheduler_wake_requests(tenant_id, workspace_id, trigger_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_channel_events_scope_created ON agent_channel_events(tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_channel_events_session ON agent_channel_events(tenant_id, workspace_id, channel_key, endpoint_key, session_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_channel_events_responder ON agent_channel_events(tenant_id, workspace_id, responder_install_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_channel_events_inbound_message
    ON agent_channel_events(tenant_id, workspace_id, channel_key, endpoint_key, direction, session_key, message_id)
    WHERE direction = 'inbound' AND message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_secret_access_events_scope_created ON agent_secret_access_events(tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_secret_access_events_run ON agent_secret_access_events(tenant_id, workspace_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_secret_access_events_credential ON agent_secret_access_events(tenant_id, workspace_id, credential_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_egress_events_scope_created ON agent_egress_events(tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_egress_events_run ON agent_egress_events(tenant_id, workspace_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_egress_events_install ON agent_egress_events(tenant_id, workspace_id, agent_install_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_egress_events_host ON agent_egress_events(tenant_id, workspace_id, request_host, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_channel_execution_leases_workspace ON agent_channel_execution_leases(tenant_id, workspace_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_channel_execution_leases_responder ON agent_channel_execution_leases(tenant_id, workspace_id, responder_install_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_security_control_states_scope ON security_control_states(tenant_id, workspace_id, scope_type, control_kind, enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_control_states_agent ON security_control_states(tenant_id, workspace_id, agent_install_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_control_states_channel ON security_control_states(tenant_id, workspace_id, channel_key, endpoint_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_control_states_connector ON security_control_states(tenant_id, workspace_id, connector_id, credential_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_control_events_scope ON security_control_events(tenant_id, workspace_id, scope_type, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_control_events_state ON security_control_events(tenant_id, workspace_id, control_state_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_control_events_actor ON security_control_events(tenant_id, workspace_id, actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_scope_created ON activity_ledger_events(tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_event_class ON activity_ledger_events(tenant_id, workspace_id, event_class, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_actor ON activity_ledger_events(tenant_id, workspace_id, actor_type, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_run ON activity_ledger_events(tenant_id, workspace_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_install ON activity_ledger_events(tenant_id, workspace_id, install_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_app ON activity_ledger_events(tenant_id, workspace_id, app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_feed_query ON activity_ledger_events(tenant_id, workspace_id, detail_level, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_ledger_events_session ON activity_ledger_events(tenant_id, workspace_id, channel, session_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_channel_execution_leases_active_thread
    ON agent_channel_execution_leases(tenant_id, workspace_id, thread_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_channel_bindings_active_inbound_owner
    ON agent_channel_bindings(tenant_id, workspace_id, channel_key, lower((binding->>'endpoint_key')))
    WHERE enabled = TRUE
      AND channel_key IN ('telegram', 'whatsapp', 'email', 'phone', 'web_chat')
      AND lower(COALESCE(binding->>'is_inbound_owner', 'false')) = 'true'
      AND NULLIF(lower(COALESCE(binding->>'endpoint_key', '')), '') IS NOT NULL;
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_workspace_agent_installs_compiled_workflow_version'
    ) THEN
        ALTER TABLE workspace_agent_installs
            ADD CONSTRAINT fk_workspace_agent_installs_compiled_workflow_version
            FOREIGN KEY (compiled_workflow_version_id) REFERENCES workflow_versions(id) ON DELETE SET NULL;
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


def _utc_now_ts() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_timestamptz(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    token = str(value or "").strip()
    if not token:
        return None
    try:
        parsed = datetime.fromisoformat(token.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc) if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _slugify(value: str, fallback: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return token or fallback


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _to_json(value: Any, *, default: Any) -> str:
    payload = value if value is not None else default
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


def _connect_local_identity_db() -> sqlite3.Connection:
    LOCAL_IDENTITY_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(LOCAL_IDENTITY_DB_FILE)
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
    user_columns = {
        str(row["name"] or "").strip()
        for row in connection.execute("PRAGMA table_info(users)").fetchall()
    }
    if "avatar_url" not in user_columns:
        connection.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
    return connection


def _local_user_row(connection: sqlite3.Connection, *, user_id: Optional[str] = None, email: Optional[str] = None) -> Optional[sqlite3.Row]:
    if user_id is not None:
        return connection.execute(
            """
            SELECT
                u.id,
                u.email,
                u.name,
                u.avatar_url,
                u.password_hash,
                u.created_at,
                wm.workspace_id,
                wr.tenant_id
            FROM users u
            LEFT JOIN workspace_memberships wm ON wm.user_id = u.id
            LEFT JOIN workspace_registry wr ON wr.workspace_id = wm.workspace_id
            WHERE u.id = ?
            ORDER BY wm.created_at ASC, wm.workspace_id ASC
            LIMIT 1
            """,
            (str(user_id or "").strip(),),
        ).fetchone()
    return connection.execute(
        """
        SELECT
            u.id,
            u.email,
            u.name,
            u.avatar_url,
            u.password_hash,
            u.created_at,
            wm.workspace_id,
            wr.tenant_id
        FROM users u
        LEFT JOIN workspace_memberships wm ON wm.user_id = u.id
        LEFT JOIN workspace_registry wr ON wr.workspace_id = wm.workspace_id
        WHERE lower(u.email) = lower(?)
        ORDER BY wm.created_at ASC, wm.workspace_id ASC
        LIMIT 1
        """,
        (str(email or "").strip().lower(),),
    ).fetchone()


def _local_workspace_membership_rows(connection: sqlite3.Connection, user_id: str) -> List[Dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT
            wm.user_id,
            wm.workspace_id,
            wm.role,
            wm.created_at,
            wm.updated_at,
            wr.tenant_id
        FROM workspace_memberships wm
        LEFT JOIN workspace_registry wr ON wr.workspace_id = wm.workspace_id
        WHERE wm.user_id = ?
        ORDER BY wm.created_at ASC, wm.workspace_id ASC
        """,
        (str(user_id or "").strip(),),
    ).fetchall()
    return [
        {
            "id": f"{row['user_id']}:{row['workspace_id']}",
            "tenant_id": str(row["tenant_id"] or "").strip() or None,
            "workspace_id": str(row["workspace_id"] or "").strip(),
            "user_id": str(row["user_id"] or "").strip(),
            "role": str(row["role"] or "").strip() or "member",
            "status": "active",
            "metadata": {},
            "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
            "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
            "workspace_name": None,
        }
        for row in rows
    ]


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


def _normalize_scope_token(value: Any) -> str:
    return str(value or "").strip()


def _require_scope_token(value: Any, label: str) -> str:
    token = _normalize_scope_token(value)
    if not token:
        raise ValueError(f"{label} is required for scoped control-plane access.")
    return token


async def _apply_connection_scope(
    connection: Any,
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    bypass_rls: bool = False,
) -> None:
    resolved_tenant_id = "" if bypass_rls else _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = "" if bypass_rls else _require_scope_token(workspace_id, "workspace_id")
    await connection.execute(
        _CONTROL_PLANE_SESSION_SCOPE_SQL,
        resolved_tenant_id,
        resolved_workspace_id,
        "on" if bypass_rls else "off",
    )


@asynccontextmanager
async def _scoped_connection(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    bypass_rls: bool = False,
):
    pool = await ensure_control_plane_schema()
    if pool is None:
        yield None
        return
    async with pool.acquire() as connection:
        async with connection.transaction():
            await _apply_connection_scope(
                connection,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                bypass_rls=bypass_rls,
            )
            yield connection


def _user_row_to_dict(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    payload["email"] = str(payload.get("email") or "").strip().lower()
    payload["name"] = str(payload.get("display_name") or payload.get("name") or "").strip() or None
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
    normalized_email = str(email or "").strip().lower()
    if not normalized_email:
        return None

    created_at = _utc_now_ts()
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

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            created_at_ts = int(time.time())
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    existing_user = _local_user_row(fallback, email=normalized_email)
                    if existing_user is not None:
                        return await get_user_bundle_by_id(str(existing_user["id"]))
                    fallback.execute(
                        """
                        INSERT INTO users (id, email, name, avatar_url, password_hash, created_at)
                        VALUES (?, ?, ?, NULL, ?, ?)
                        """,
                        (resolved_user_id, normalized_email, display_label or None, password_hash, created_at_ts),
                    )
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_registry (
                            workspace_id, tenant_id, created_at, updated_at
                        ) VALUES (?, ?, COALESCE((SELECT created_at FROM workspace_registry WHERE workspace_id = ?), ?), ?)
                        """,
                        (resolved_workspace_id, resolved_tenant_id, resolved_workspace_id, created_at_ts, created_at_ts),
                    )
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_memberships (
                            user_id, workspace_id, role, created_at, updated_at
                        ) VALUES (
                            ?, ?, ?, COALESCE((SELECT created_at FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?), ?), ?
                        )
                        """,
                        (
                            resolved_user_id,
                            resolved_workspace_id,
                            str(role or "owner").strip().lower() or "owner",
                            resolved_user_id,
                            resolved_workspace_id,
                            created_at_ts,
                            created_at_ts,
                        ),
                    )
                    fallback.commit()
            return await get_user_bundle_by_id(resolved_user_id)
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
    created_at = _utc_now_ts()
    created_at_ts = int(time.time())
    resolved_user_id = str(user_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    normalized_email = str(email or "").strip().lower()
    resolved_tenant_id = str(tenant_id or "").strip()
    resolved_workspace_id = str(workspace_id or "").strip()
    if not normalized_email or not resolved_tenant_id or not resolved_workspace_id:
        return None
    display_label = str(display_name or "").strip()

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    existing_user = _local_user_row(fallback, user_id=resolved_user_id) or _local_user_row(
                        fallback,
                        email=normalized_email,
                    )
                    effective_user_id = (
                        str(existing_user["id"] or "").strip()
                        if existing_user is not None
                        else resolved_user_id
                    )
                    existing_password_hash = (
                        str(existing_user["password_hash"] or "").strip()
                        if existing_user is not None
                        else ""
                    )
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_registry (
                            workspace_id, tenant_id, created_at, updated_at
                        ) VALUES (?, ?, COALESCE((SELECT created_at FROM workspace_registry WHERE workspace_id = ?), ?), ?)
                        """,
                        (resolved_workspace_id, resolved_tenant_id, resolved_workspace_id, created_at_ts, created_at_ts),
                    )
                    fallback.execute(
                        """
                        INSERT INTO users (id, email, name, avatar_url, password_hash, created_at)
                        VALUES (?, ?, ?, NULL, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            email = excluded.email,
                            name = COALESCE(excluded.name, users.name),
                            avatar_url = COALESCE(users.avatar_url, excluded.avatar_url),
                            password_hash = CASE
                                WHEN excluded.password_hash <> '' THEN excluded.password_hash
                                ELSE users.password_hash
                            END
                        """,
                        (
                            effective_user_id,
                            normalized_email,
                            display_label or None,
                            str(password_hash or existing_password_hash or "").strip(),
                            created_at_ts,
                        ),
                    )
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_memberships (
                            user_id, workspace_id, role, created_at, updated_at
                        ) VALUES (
                            ?, ?, ?, COALESCE((SELECT created_at FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?), ?), ?
                        )
                        """,
                        (
                            effective_user_id,
                            resolved_workspace_id,
                            str(role or "member").strip().lower() or "member",
                            effective_user_id,
                            resolved_workspace_id,
                            created_at_ts,
                            created_at_ts,
                        ),
                    )
                    fallback.commit()
            return await get_user_bundle_by_id(effective_user_id)
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
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = _local_user_row(fallback, email=str(email or "").strip().lower())
            return _user_row_to_dict(row)
        row = await connection.fetchrow(
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
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = _local_user_row(fallback, user_id=str(user_id or "").strip())
            return _user_row_to_dict(row)
        row = await connection.fetchrow(
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
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = _local_user_row(fallback, email=str(email or "").strip().lower())
                    if row is None:
                        return None
                    membership_row = fallback.execute(
                        """
                        SELECT wm.workspace_id, wr.tenant_id
                        FROM workspace_memberships wm
                        LEFT JOIN workspace_registry wr ON wr.workspace_id = wm.workspace_id
                        WHERE wm.user_id = ?
                        ORDER BY wm.created_at ASC, wm.workspace_id ASC
                        LIMIT 1
                        """,
                        (str(row["id"] or "").strip(),),
                    ).fetchone()
            membership_workspace_id = (
                str(membership_row["workspace_id"] or "").strip()
                if membership_row is not None
                else None
            )
            membership_tenant_id = (
                str(membership_row["tenant_id"] or "").strip()
                if membership_row is not None
                else None
            )
            return {
                "id": f"local-password:{row['id']}",
                "tenant_id": membership_tenant_id or None,
                "workspace_id": membership_workspace_id or None,
                "user_id": str(row["id"] or "").strip(),
                "provider": "empyralis_password",
                "subject": str(row["email"] or "").strip().lower(),
                "password_hash": str(row["password_hash"] or "").strip(),
                "identity_role": "account_access",
                "label": "Email and password",
                "status": "active",
                "is_primary": True,
                "metadata": {},
                "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
                "updated_at": int(row["created_at"]) if row["created_at"] is not None else None,
                "email": str(row["email"] or "").strip().lower(),
                "display_name": str(row["name"] or "").strip() or None,
                "avatar_url": str(row["avatar_url"] or "").strip() or None,
            }
        row = await connection.fetchrow(
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
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    return _local_workspace_membership_rows(fallback, str(user_id or "").strip())
        rows = await connection.fetch(
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
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = fallback.execute(
                        """
                        SELECT workspace_id, tenant_id, created_at, updated_at
                        FROM workspace_registry
                        WHERE workspace_id = ?
                        LIMIT 1
                        """,
                        (str(workspace_id or "").strip(),),
                    ).fetchone()
            if row is None:
                return None
            return {
                "id": str(row["workspace_id"] or "").strip(),
                "tenant_id": str(row["tenant_id"] or "").strip() or None,
                "workspace_id": str(row["workspace_id"] or "").strip(),
                "slug": str(row["workspace_id"] or "").strip(),
                "name": str(row["workspace_id"] or "").strip(),
                "workspace_type": "shared",
                "status": "active",
                "created_by_user_id": None,
                "metadata": {},
                "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
                "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
            }
        row = await connection.fetchrow(
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
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = fallback.execute(
                        """
                        SELECT tenant_id
                        FROM workspace_registry
                        WHERE workspace_id = ?
                        LIMIT 1
                        """,
                        (str(workspace_id or "").strip(),),
                    ).fetchone()
            if row is None:
                return None
            return str(row["tenant_id"] or "").strip() or None
        row = await connection.fetchrow(
            """
            SELECT tenant_id
            FROM workspaces
            WHERE workspace_id = $1
            LIMIT 1
            """,
            str(workspace_id or "").strip(),
        )
    if row is None:
        return None
    return str(row["tenant_id"] or "").strip() or None


async def ensure_workspace_tenant_binding(
    *,
    workspace_id: str,
    tenant_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = str(workspace_id or "").strip()
    resolved_tenant_id = str(tenant_id or "").strip()
    if not resolved_workspace_id or not resolved_tenant_id:
        return None
    created_at = _utc_now_ts()
    created_at_ts = int(time.time())
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_registry (
                            workspace_id, tenant_id, created_at, updated_at
                        ) VALUES (?, ?, COALESCE((SELECT created_at FROM workspace_registry WHERE workspace_id = ?), ?), ?)
                        """,
                        (resolved_workspace_id, resolved_tenant_id, resolved_workspace_id, created_at_ts, created_at_ts),
                    )
                    fallback.commit()
            return {"workspace_id": resolved_workspace_id, "tenant_id": resolved_tenant_id}
        await connection.execute(
            """
            INSERT INTO tenants (
                id, tenant_id, workspace_id, slug, name, status, created_by_user_id, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'active', NULL, '{}'::jsonb, $6::timestamptz, $6::timestamptz)
            ON CONFLICT (id) DO UPDATE SET
                workspace_id = EXCLUDED.workspace_id,
                updated_at = EXCLUDED.updated_at
            """,
            resolved_tenant_id,
            resolved_tenant_id,
            resolved_workspace_id,
            _slugify(resolved_tenant_id, resolved_tenant_id),
            resolved_tenant_id,
            created_at,
        )
        await connection.execute(
            """
            INSERT INTO workspaces (
                id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'shared', 'active', NULL, '{}'::jsonb, $6::timestamptz, $6::timestamptz)
            ON CONFLICT (workspace_id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                updated_at = EXCLUDED.updated_at
            """,
            resolved_workspace_id,
            resolved_tenant_id,
            resolved_workspace_id,
            _slugify(resolved_workspace_id, resolved_workspace_id),
            resolved_workspace_id,
            created_at,
        )
    return {"workspace_id": resolved_workspace_id, "tenant_id": resolved_tenant_id}


async def remove_workspace_membership(
    *,
    user_id: str,
    workspace_id: str,
) -> bool:
    resolved_user_id = str(user_id or "").strip()
    resolved_workspace_id = str(workspace_id or "").strip()
    if not resolved_user_id or not resolved_workspace_id:
        return False
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    cursor = fallback.execute(
                        "DELETE FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?",
                        (resolved_user_id, resolved_workspace_id),
                    )
                    fallback.commit()
            return int(cursor.rowcount or 0) > 0
        status = await connection.execute(
            """
            DELETE FROM workspace_memberships
            WHERE user_id = $1 AND workspace_id = $2
            """,
            resolved_user_id,
            resolved_workspace_id,
        )
    return status.endswith("DELETE 1")


async def update_user_profile(
    *,
    user_id: str,
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_user_id = str(user_id or "").strip()
    if not resolved_user_id:
        return None
    next_name = str(display_name or "").strip() or None
    next_avatar_url = str(avatar_url or "").strip() or None
    updated_at = _utc_now_ts()
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    existing = _local_user_row(fallback, user_id=resolved_user_id)
                    if existing is None:
                        return None
                    fallback.execute(
                        "UPDATE users SET name = ?, avatar_url = ? WHERE id = ?",
                        (next_name, next_avatar_url, resolved_user_id),
                    )
                    fallback.commit()
            return await get_user_by_id(resolved_user_id)
        row = await connection.fetchrow(
            """
            UPDATE users
            SET display_name = $2,
                avatar_url = $3,
                updated_at = $4::timestamptz
            WHERE id = $1
            RETURNING id, tenant_id, workspace_id, email, display_name, avatar_url, status, metadata, created_at, updated_at
            """,
            resolved_user_id,
            next_name,
            next_avatar_url,
            updated_at,
        )
    return _user_row_to_dict(row)


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
    token = str(thread_id or "").strip()
    if not token:
        return None
    now_ts = _utc_now_ts()
    payload_title = str(title or "").strip() or "New chat"
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
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
            resolved_tenant_id,
            resolved_workspace_id,
            str(owner_user_id or "").strip() or None,
            str(master_agent_install_id or "").strip() or None,
            str(channel or "web").strip() or "web",
            payload_title,
            _to_json(metadata, default={}),
            now_ts,
        )
    return await get_agent_thread(
        token,
        tenant_id=resolved_tenant_id,
        workspace_id=resolved_workspace_id,
        include_turns=False,
    )


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
    now_ts = _utc_now_ts()
    expires_ts = _coerce_timestamptz(expires_at)
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_session_id = str(session_id or "").strip()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
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
            resolved_session_id,
            resolved_tenant_id,
            resolved_workspace_id,
            str(thread_id or "").strip() or resolved_session_id,
            str(channel or "web").strip() or "web",
            _to_json(actor, default={}),
            str(master_agent_install_id or "").strip() or None,
            str(runtime_profile_id or "").strip() or None,
            str(status or "active").strip() or "active",
            _to_json(metadata, default={}),
            now_ts,
            expires_ts,
        )
    return await get_agent_session(
        resolved_session_id,
        tenant_id=resolved_tenant_id,
        workspace_id=resolved_workspace_id,
    )


async def get_agent_session(
    session_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
) -> Optional[Dict[str, Any]]:
    async with _scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow("SELECT * FROM agent_sessions WHERE id = $1 LIMIT 1", str(session_id or "").strip())
    return dict(row) if row is not None else None


async def terminate_agent_session(
    session_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
) -> None:
    async with _scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        if connection is None:
            return
        await connection.execute(
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
    now_ts = _utc_now_ts()
    resolved_turn_id = str(turn_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    resolved_request_id = str(request_id or "").strip() or None
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_thread_id = str(thread_id or "").strip()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
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
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_thread_id,
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
            now_ts,
        )
        await connection.execute(
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
            resolved_thread_id,
            now_ts,
            build_default_thread_title(content),
            str(role or "").strip().lower(),
        )
    return await get_agent_thread(
        resolved_thread_id,
        tenant_id=resolved_tenant_id,
        workspace_id=resolved_workspace_id,
        include_turns=True,
    )


async def list_agent_turns(
    thread_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    active_agent_install_id: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    async with _scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        if connection is None:
            return []
        resolved_install_id = str(active_agent_install_id or "").strip()
        if resolved_install_id:
            rows = await connection.fetch(
                """
                SELECT *
                FROM agent_turns
                WHERE thread_id = $1
                  AND (active_agent_install_id = $2 OR active_agent_install_id IS NULL OR active_agent_install_id = '')
                ORDER BY created_at ASC
                LIMIT $3
                """,
                str(thread_id or "").strip(),
                resolved_install_id,
                max(1, int(limit or 200)),
            )
        else:
            rows = await connection.fetch(
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


async def get_agent_thread(
    thread_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    active_agent_install_id: Optional[str] = None,
    include_turns: bool = True,
) -> Optional[Dict[str, Any]]:
    async with _scoped_connection(tenant_id=tenant_id, workspace_id=workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
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
        payload["turns"] = await list_agent_turns(
            str(thread_id or "").strip(),
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            active_agent_install_id=active_agent_install_id,
        )
    return payload


async def list_agent_threads(
    *,
    workspace_id: str,
    tenant_id: str,
    owner_user_id: Optional[str] = None,
    active_agent_install_id: Optional[str] = None,
    include_turns: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    conditions = ["workspace_id = $1"]
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    params: List[Any] = [resolved_workspace_id]
    next_index = 2
    conditions.append(f"tenant_id = ${next_index}")
    params.append(resolved_tenant_id)
    next_index += 1
    if owner_user_id:
        conditions.append(f"owner_user_id = ${next_index}")
        params.append(str(owner_user_id or "").strip())
        next_index += 1
    params.append(max(1, int(limit or 50)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
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
            item["turns"] = await list_agent_turns(
                str(item.get("id") or "").strip(),
                tenant_id=resolved_tenant_id,
                workspace_id=resolved_workspace_id,
                active_agent_install_id=active_agent_install_id,
            )
    return items


async def append_agent_channel_event(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: str,
    endpoint_key: str,
    session_key: str,
    direction: str,
    event_type: str,
    thread_id: Optional[str] = None,
    responder_install_id: Optional[str] = None,
    message_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    run_id: Optional[str] = None,
    actor: Optional[Dict[str, Any]] = None,
    text: str = "",
    payload: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    status: str = "logged",
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_channel_key = str(channel_key or "").strip().lower()
    resolved_endpoint_key = str(endpoint_key or "").strip().lower()
    resolved_session_key = str(session_key or "").strip()
    if not resolved_channel_key or not resolved_endpoint_key or not resolved_session_key:
        return None
    resolved_event_id = str(event_id or f"cevt_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    resolved_direction = str(direction or "").strip().lower() or "system"
    resolved_message_id = str(message_id or "").strip() or None
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO agent_channel_events (
                id, tenant_id, workspace_id, channel_key, endpoint_key, session_key,
                thread_id, responder_install_id, direction, event_type, message_id, parent_event_id,
                run_id, actor, text, payload, metadata, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                $13, $14::jsonb, $15, $16::jsonb, $17::jsonb, $18, $19::timestamptz, $19::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, channel_key, endpoint_key, direction, session_key, message_id)
                WHERE direction = 'inbound' AND message_id IS NOT NULL
            DO UPDATE SET updated_at = agent_channel_events.updated_at
            RETURNING *
            """,
            resolved_event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_channel_key,
            resolved_endpoint_key,
            resolved_session_key,
            str(thread_id or "").strip() or None,
            str(responder_install_id or "").strip() or None,
            resolved_direction,
            str(event_type or "").strip().lower() or "message",
            resolved_message_id,
            str(parent_event_id or "").strip() or None,
            str(run_id or "").strip() or None,
            _to_json(actor, default={}),
            str(text or ""),
            _to_json(payload, default={}),
            _to_json(metadata, default={}),
            str(status or "logged").strip().lower() or "logged",
            now_ts,
        )
    if row is None:
        return None
    item = dict(row)
    if resolved_direction == "inbound" and resolved_message_id:
        item["_duplicate_hit"] = str(item.get("id") or "").strip() != resolved_event_id
    return item


async def append_personal_context_event(
    *,
    tenant_id: str,
    workspace_id: str,
    source_app: str,
    event_type: str,
    entity_id: str,
    summary: str,
    payload: Optional[Dict[str, Any]] = None,
    priority: int = 50,
    scope: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    seen_by_sage_at: Optional[str] = None,
    status: str = "active",
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_source_app = str(source_app or "").strip().lower()
    resolved_event_type = str(event_type or "").strip().lower()
    resolved_entity_id = str(entity_id or "").strip()
    if not resolved_source_app or not resolved_event_type or not resolved_entity_id:
        return None
    resolved_event_id = str(event_id or f"pctx_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    resolved_seen_at = _coerce_timestamptz(seen_by_sage_at)
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
            """
            INSERT INTO personal_context_events (
                id, tenant_id, workspace_id, source_app, event_type, entity_id, summary,
                payload, priority, scope, seen_by_sage_at, metadata, status, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8::jsonb, $9, $10::jsonb, $11::timestamptz, $12::jsonb, $13, $14::timestamptz, $14::timestamptz
            )
            """,
            resolved_event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_source_app,
            resolved_event_type,
            resolved_entity_id,
            str(summary or "").strip(),
            _to_json(payload, default={}),
            max(0, min(100, int(priority or 0))),
            _to_json(scope, default={}),
            resolved_seen_at,
            _to_json(metadata, default={}),
            str(status or "active").strip().lower() or "active",
            now_ts,
        )
        row = await connection.fetchrow(
            "SELECT * FROM personal_context_events WHERE id = $1 LIMIT 1",
            resolved_event_id,
        )
    return dict(row) if row is not None else None


async def append_agent_scheduler_wake_request(
    *,
    tenant_id: str,
    workspace_id: str,
    master_agent_install_id: Optional[str] = None,
    trigger_kind: str,
    source: str,
    requested_by: str = "system",
    reason: str = "",
    summary: str = "",
    payload: Optional[Dict[str, Any]] = None,
    policy: Optional[Dict[str, Any]] = None,
    approval_required: bool = False,
    status: str = "pending",
    denial_reason: Optional[str] = None,
    due_at: Any,
    claimed_at: Any = None,
    executed_at: Any = None,
    metadata: Optional[Dict[str, Any]] = None,
    wake_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_trigger_kind = str(trigger_kind or "").strip().lower()
    resolved_source = str(source or "").strip().lower()
    if not resolved_trigger_kind or not resolved_source:
        return None
    resolved_due_at = _coerce_timestamptz(due_at)
    if resolved_due_at is None:
        return None
    resolved_wake_id = str(wake_id or f"wake_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
            """
            INSERT INTO agent_scheduler_wake_requests (
                id, tenant_id, workspace_id, master_agent_install_id, trigger_kind, source,
                requested_by, reason, summary, payload, policy, approval_required, status, denial_reason,
                due_at, claimed_at, executed_at, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14,
                $15::timestamptz, $16::timestamptz, $17::timestamptz, $18::jsonb, $19::timestamptz, $19::timestamptz
            )
            """,
            resolved_wake_id,
            resolved_tenant_id,
            resolved_workspace_id,
            str(master_agent_install_id or "").strip() or None,
            resolved_trigger_kind,
            resolved_source,
            str(requested_by or "system").strip().lower() or "system",
            str(reason or ""),
            str(summary or ""),
            _to_json(payload, default={}),
            _to_json(policy, default={}),
            bool(approval_required),
            str(status or "pending").strip().lower() or "pending",
            str(denial_reason or "").strip() or None,
            resolved_due_at,
            _coerce_timestamptz(claimed_at),
            _coerce_timestamptz(executed_at),
            _to_json(metadata, default={}),
            now_ts,
        )
        row = await connection.fetchrow(
            "SELECT * FROM agent_scheduler_wake_requests WHERE id = $1 LIMIT 1",
            resolved_wake_id,
        )
    return dict(row) if row is not None else None


async def append_agent_secret_access_event(
    *,
    tenant_id: str,
    workspace_id: str,
    secret_kind: str,
    credential_id: Optional[str] = None,
    provider_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    action_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    run_id: Optional[str] = None,
    actor: Optional[Dict[str, Any]] = None,
    allowed_fields: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    status: str = "allowed",
    denial_code: Optional[str] = None,
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_secret_kind = str(secret_kind or "").strip().lower()
    if not resolved_secret_kind:
        return None
    resolved_event_id = str(event_id or f"sevt_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    normalized_allowed_fields = [
        str(item or "").strip()
        for item in list(allowed_fields or [])
        if str(item or "").strip()
    ]
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
            """
            INSERT INTO agent_secret_access_events (
                id, tenant_id, workspace_id, secret_kind, credential_id, provider_id, connector_id,
                action_id, tool_name, run_id, actor, allowed_fields, metadata, status, denial_code,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15,
                $16::timestamptz, $16::timestamptz
            )
            """,
            resolved_event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_secret_kind,
            str(credential_id or "").strip() or None,
            str(provider_id or "").strip().lower() or None,
            str(connector_id or "").strip().lower() or None,
            str(action_id or "").strip().lower() or None,
            str(tool_name or "").strip().lower() or None,
            str(run_id or "").strip() or None,
            _to_json(actor, default={}),
            _to_json(normalized_allowed_fields, default=[]),
            _to_json(metadata, default={}),
            str(status or "allowed").strip().lower() or "allowed",
            str(denial_code or "").strip().lower() or None,
            now_ts,
        )
        row = await connection.fetchrow(
            "SELECT * FROM agent_secret_access_events WHERE id = $1 LIMIT 1",
            resolved_event_id,
        )
    return dict(row) if row is not None else None


async def append_agent_egress_event(
    *,
    tenant_id: str,
    workspace_id: str,
    agent_install_id: Optional[str] = None,
    run_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    tool_name: Optional[str] = None,
    provider_id: Optional[str] = None,
    connector_scope: Optional[str] = None,
    action_class: str = "read",
    request_method: str = "GET",
    request_url: str,
    request_host: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    status: str = "allowed",
    denial_code: Optional[str] = None,
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_request_url = str(request_url or "").strip()
    if not resolved_request_url:
        return None
    resolved_event_id = str(event_id or f"eevt_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
            """
            INSERT INTO agent_egress_events (
                id, tenant_id, workspace_id, agent_install_id, run_id, runtime_mode, tool_name,
                provider_id, connector_scope, action_class, request_method, request_url, request_host,
                metadata, status, denial_code, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13,
                $14::jsonb, $15, $16, $17::timestamptz, $17::timestamptz
            )
            """,
            resolved_event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            str(agent_install_id or "").strip() or None,
            str(run_id or "").strip() or None,
            str(runtime_mode or "").strip().lower() or None,
            str(tool_name or "").strip().lower() or None,
            str(provider_id or "").strip().lower() or None,
            str(connector_scope or "").strip().lower() or None,
            str(action_class or "read").strip().lower() or "read",
            str(request_method or "GET").strip().upper() or "GET",
            resolved_request_url,
            str(request_host or "").strip().lower() or None,
            _to_json(metadata, default={}),
            str(status or "allowed").strip().lower() or "allowed",
            str(denial_code or "").strip().lower() or None,
            now_ts,
        )
        row = await connection.fetchrow(
            "SELECT * FROM agent_egress_events WHERE id = $1 LIMIT 1",
            resolved_event_id,
        )
    return dict(row) if row is not None else None


async def append_activity_ledger_event(
    *,
    tenant_id: str,
    workspace_id: str,
    actor_type: str,
    actor_id: str,
    event_class: str,
    detail_level: str = "feed_summary",
    install_id: Optional[str] = None,
    app_id: Optional[str] = None,
    run_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    session_key: Optional[str] = None,
    channel: Optional[str] = None,
    direction: Optional[str] = None,
    action: Optional[str] = None,
    trace_id: Optional[str] = None,
    title: str = "",
    summary: str = "",
    status: str = "logged",
    review_required: bool = False,
    artifacts: Optional[List[Dict[str, Any]]] = None,
    payload: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_actor_type = str(actor_type or "").strip().lower() or "system"
    resolved_actor_id = str(actor_id or "").strip() or resolved_actor_type
    resolved_event_class = str(event_class or "").strip().lower()
    if not resolved_event_class:
        return None
    resolved_event_id = str(event_id or f"aevt_{uuid.uuid4().hex[:16]}").strip()
    normalized_artifacts = [
        dict(item)
        for item in list(artifacts or [])
        if isinstance(item, dict)
    ]
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
            """
            INSERT INTO activity_ledger_events (
                id, tenant_id, workspace_id, actor_type, actor_id, install_id, app_id,
                run_id, thread_id, session_key, channel, direction, event_class, detail_level,
                action, trace_id, title, summary, status, review_required, artifacts, payload, metadata,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20, $21::jsonb, $22::jsonb, $23::jsonb,
                $24::timestamptz, $24::timestamptz
            )
            ON CONFLICT (id) DO UPDATE SET
                summary = EXCLUDED.summary,
                status = EXCLUDED.status,
                review_required = EXCLUDED.review_required,
                artifacts = EXCLUDED.artifacts,
                payload = EXCLUDED.payload,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            """,
            resolved_event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_actor_type,
            resolved_actor_id,
            str(install_id or "").strip() or None,
            str(app_id or "").strip() or None,
            str(run_id or "").strip() or None,
            str(thread_id or "").strip() or None,
            str(session_key or "").strip() or None,
            str(channel or "").strip().lower() or None,
            str(direction or "").strip().lower() or None,
            resolved_event_class,
            str(detail_level or "feed_summary").strip().lower() or "feed_summary",
            str(action or "").strip().lower() or None,
            str(trace_id or "").strip() or None,
            str(title or ""),
            str(summary or ""),
            str(status or "logged").strip().lower() or "logged",
            bool(review_required),
            _to_json(normalized_artifacts, default=[]),
            _to_json(payload, default={}),
            _to_json(metadata, default={}),
            now_ts,
        )
        row = await connection.fetchrow(
            "SELECT * FROM activity_ledger_events WHERE id = $1 LIMIT 1",
            resolved_event_id,
        )
    return dict(row) if row is not None else None


async def list_agent_scheduler_wake_requests(
    *,
    tenant_id: str,
    workspace_id: str,
    status: Optional[str] = None,
    trigger_kind: Optional[str] = None,
    due_before: Any = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    if status:
        params.append(str(status or "").strip().lower())
        conditions.append(f"status = ${len(params)}")
    if trigger_kind:
        params.append(str(trigger_kind or "").strip().lower())
        conditions.append(f"trigger_kind = ${len(params)}")
    resolved_due_before = _coerce_timestamptz(due_before)
    if resolved_due_before is not None:
        params.append(resolved_due_before)
        conditions.append(f"due_at <= ${len(params)}::timestamptz")
    params.append(max(1, int(limit or 100)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM agent_scheduler_wake_requests
            WHERE {' AND '.join(conditions)}
            ORDER BY due_at ASC, created_at ASC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def list_activity_ledger_events(
    *,
    tenant_id: str,
    workspace_id: str,
    event_classes: Optional[List[str]] = None,
    detail_levels: Optional[List[str]] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    install_id: Optional[str] = None,
    app_id: Optional[str] = None,
    run_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    channel: Optional[str] = None,
    direction: Optional[str] = None,
    session_key: Optional[str] = None,
    action: Optional[str] = None,
    trace_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    normalized_event_classes = [
        str(item or "").strip().lower()
        for item in list(event_classes or [])
        if str(item or "").strip()
    ]
    if normalized_event_classes:
        params.append(normalized_event_classes)
        conditions.append(f"event_class = ANY(${len(params)}::text[])")
    normalized_detail_levels = [
        str(item or "").strip().lower()
        for item in list(detail_levels or [])
        if str(item or "").strip()
    ]
    if normalized_detail_levels:
        params.append(normalized_detail_levels)
        conditions.append(f"detail_level = ANY(${len(params)}::text[])")
    if actor_type:
        params.append(str(actor_type or "").strip().lower())
        conditions.append(f"actor_type = ${len(params)}")
    if actor_id:
        params.append(str(actor_id or "").strip())
        conditions.append(f"actor_id = ${len(params)}")
    if install_id:
        params.append(str(install_id or "").strip())
        conditions.append(f"install_id = ${len(params)}")
    if app_id:
        params.append(str(app_id or "").strip())
        conditions.append(f"app_id = ${len(params)}")
    if run_id:
        params.append(str(run_id or "").strip())
        conditions.append(f"run_id = ${len(params)}")
    if thread_id:
        params.append(str(thread_id or "").strip())
        conditions.append(f"thread_id = ${len(params)}")
    if channel:
        params.append(str(channel or "").strip().lower())
        conditions.append(f"channel = ${len(params)}")
    if direction:
        params.append(str(direction or "").strip().lower())
        conditions.append(f"direction = ${len(params)}")
    if session_key:
        params.append(str(session_key or "").strip())
        conditions.append(f"session_key = ${len(params)}")
    if action:
        params.append(str(action or "").strip().lower())
        conditions.append(f"action = ${len(params)}")
    if trace_id:
        params.append(str(trace_id or "").strip())
        conditions.append(f"trace_id = ${len(params)}")
    if status:
        params.append(str(status or "").strip().lower())
        conditions.append(f"status = ${len(params)}")
    params.append(max(1, int(limit or 100)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM activity_ledger_events
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def count_agent_scheduler_wake_requests_since(
    *,
    tenant_id: str,
    workspace_id: str,
    since: Any,
    trigger_kind: Optional[str] = None,
) -> int:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_since = _coerce_timestamptz(since)
    if resolved_since is None:
        return 0
    conditions = [
        "tenant_id = $1",
        "workspace_id = $2",
        "created_at >= $3::timestamptz",
        "status <> 'denied'",
    ]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id, resolved_since]
    if trigger_kind:
        params.append(str(trigger_kind or "").strip().lower())
        conditions.append(f"trigger_kind = ${len(params)}")
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return 0
        value = await connection.fetchval(
            f"""
            SELECT COUNT(*)
            FROM agent_scheduler_wake_requests
            WHERE {' AND '.join(conditions)}
            """,
            *params,
        )
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


async def claim_due_agent_scheduler_wake_requests(
    *,
    tenant_id: str,
    workspace_id: str,
    due_before: Any,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_due_before = _coerce_timestamptz(due_before)
    if resolved_due_before is None:
        return []
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            WITH candidates AS (
                SELECT id
                FROM agent_scheduler_wake_requests
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND status = 'pending'
                  AND due_at <= $3::timestamptz
                ORDER BY due_at ASC, created_at ASC
                LIMIT $4
                FOR UPDATE SKIP LOCKED
            )
            UPDATE agent_scheduler_wake_requests wake
               SET status = 'claimed',
                   claimed_at = $5::timestamptz,
                   updated_at = $5::timestamptz
              FROM candidates
             WHERE wake.id = candidates.id
            RETURNING wake.*
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_due_before,
            max(1, int(limit or 10)),
            now_ts,
        )
    return [dict(row) for row in rows]


async def update_agent_scheduler_wake_request_status(
    *,
    tenant_id: str,
    workspace_id: str,
    wake_id: str,
    status: str,
    denial_reason: Optional[str] = None,
    metadata_patch: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_wake_id = str(wake_id or "").strip()
    if not resolved_wake_id:
        return None
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        existing = await connection.fetchrow(
            "SELECT * FROM agent_scheduler_wake_requests WHERE id = $1 LIMIT 1",
            resolved_wake_id,
        )
        if existing is None:
            return None
        current_metadata = _coerce_dict(existing.get("metadata"))
        next_metadata = {**current_metadata, **_coerce_dict(metadata_patch)}
        executed_at = now_ts if str(status or "").strip().lower() in {"executed", "completed", "failed", "skipped", "denied"} else existing.get("executed_at")
        await connection.execute(
            """
            UPDATE agent_scheduler_wake_requests
               SET status = $4,
                   denial_reason = $5,
                   executed_at = $6::timestamptz,
                   metadata = $7::jsonb,
                   updated_at = $8::timestamptz
             WHERE id = $1
               AND tenant_id = $2
               AND workspace_id = $3
            """,
            resolved_wake_id,
            resolved_tenant_id,
            resolved_workspace_id,
            str(status or "").strip().lower() or "pending",
            str(denial_reason or "").strip() or None,
            executed_at,
            _to_json(next_metadata, default={}),
            now_ts,
        )
        row = await connection.fetchrow(
            "SELECT * FROM agent_scheduler_wake_requests WHERE id = $1 LIMIT 1",
            resolved_wake_id,
        )
    return dict(row) if row is not None else None


async def list_personal_context_events(
    *,
    tenant_id: str,
    workspace_id: str,
    source_app: Optional[str] = None,
    event_type: Optional[str] = None,
    unseen_only: bool = False,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    if source_app:
        params.append(str(source_app or "").strip().lower())
        conditions.append(f"source_app = ${len(params)}")
    if event_type:
        params.append(str(event_type or "").strip().lower())
        conditions.append(f"event_type = ${len(params)}")
    if unseen_only:
        conditions.append("seen_by_sage_at IS NULL")
    params.append(max(1, int(limit or 100)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM personal_context_events
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def mark_personal_context_events_seen_by_sage(
    *,
    tenant_id: str,
    workspace_id: str,
    event_ids: Optional[List[str]] = None,
    mark_all: bool = False,
    seen_at: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    normalized_ids = [
        str(item or "").strip()
        for item in list(event_ids or [])
        if str(item or "").strip()
    ]
    if not mark_all and not normalized_ids:
        return {"status": "ok", "marked_count": 0, "marked_ids": [], "seen_by_sage_at": None}
    resolved_seen_at = _coerce_timestamptz(seen_at) or _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return {"status": "ok", "marked_count": 0, "marked_ids": [], "seen_by_sage_at": None}
        if mark_all:
            rows = await connection.fetch(
                """
                UPDATE personal_context_events
                   SET seen_by_sage_at = $3::timestamptz,
                       updated_at = $3::timestamptz
                 WHERE tenant_id = $1
                   AND workspace_id = $2
                   AND seen_by_sage_at IS NULL
                RETURNING id
                """,
                resolved_tenant_id,
                resolved_workspace_id,
                resolved_seen_at,
            )
        else:
            rows = await connection.fetch(
                """
                UPDATE personal_context_events
                   SET seen_by_sage_at = $4::timestamptz,
                       updated_at = $4::timestamptz
                 WHERE tenant_id = $1
                   AND workspace_id = $2
                   AND id = ANY($3::text[])
                RETURNING id
                """,
                resolved_tenant_id,
                resolved_workspace_id,
                normalized_ids,
                resolved_seen_at,
            )
    marked_ids = [str(row.get("id") or "").strip() for row in rows if str(row.get("id") or "").strip()]
    return {
        "status": "ok",
        "marked_count": len(marked_ids),
        "marked_ids": marked_ids,
        "seen_by_sage_at": resolved_seen_at.isoformat().replace("+00:00", "Z"),
    }


async def list_agent_channel_events(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: Optional[str] = None,
    endpoint_key: Optional[str] = None,
    session_key: Optional[str] = None,
    responder_install_id: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    if channel_key:
        params.append(str(channel_key or "").strip().lower())
        conditions.append(f"channel_key = ${len(params)}")
    if endpoint_key:
        params.append(str(endpoint_key or "").strip().lower())
        conditions.append(f"endpoint_key = ${len(params)}")
    if session_key:
        params.append(str(session_key or "").strip())
        conditions.append(f"session_key = ${len(params)}")
    if responder_install_id:
        params.append(str(responder_install_id or "").strip())
        conditions.append(f"responder_install_id = ${len(params)}")
    params.append(max(1, int(limit or 100)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM agent_channel_events
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def upsert_security_control_state(
    *,
    tenant_id: str,
    workspace_id: str,
    scope_type: str,
    control_kind: str = "kill_switch",
    scope_key: str,
    enabled: bool,
    status: str = "active",
    reason: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    agent_install_id: Optional[str] = None,
    channel_key: Optional[str] = None,
    endpoint_key: Optional[str] = None,
    connector_id: Optional[str] = None,
    credential_id: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
    action: Optional[str] = None,
    state_id: Optional[str] = None,
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_scope_type = str(scope_type or "").strip().lower()
    resolved_control_kind = str(control_kind or "kill_switch").strip().lower() or "kill_switch"
    resolved_scope_key = str(scope_key or "").strip().lower()
    if not resolved_scope_type or not resolved_scope_key:
        return None
    resolved_state_id = str(state_id or f"sctl_{uuid.uuid4().hex[:16]}").strip()
    resolved_event_id = str(event_id or f"scev_{uuid.uuid4().hex[:16]}").strip()
    resolved_status = str(status or "active").strip().lower() or "active"
    resolved_action = str(action or "").strip().lower() or ("enabled" if enabled else "disabled")
    now_ts = _utc_now_ts()

    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        await connection.execute(
            """
            INSERT INTO security_control_states (
                id, tenant_id, workspace_id, scope_type, control_kind, scope_key,
                agent_install_id, channel_key, endpoint_key, connector_id, credential_id,
                enabled, status, reason, metadata, created_by_user_id, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15::jsonb, $16, $17::timestamptz, $17::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, scope_type, control_kind, scope_key)
            DO UPDATE SET
                agent_install_id = EXCLUDED.agent_install_id,
                channel_key = EXCLUDED.channel_key,
                endpoint_key = EXCLUDED.endpoint_key,
                connector_id = EXCLUDED.connector_id,
                credential_id = EXCLUDED.credential_id,
                enabled = EXCLUDED.enabled,
                status = EXCLUDED.status,
                reason = EXCLUDED.reason,
                metadata = EXCLUDED.metadata,
                created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, security_control_states.created_by_user_id),
                updated_at = EXCLUDED.updated_at
            """,
            resolved_state_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_scope_type,
            resolved_control_kind,
            resolved_scope_key,
            str(agent_install_id or "").strip() or None,
            str(channel_key or "").strip().lower() or None,
            str(endpoint_key or "").strip().lower() or None,
            str(connector_id or "").strip().lower() or None,
            str(credential_id or "").strip() or None,
            bool(enabled),
            resolved_status,
            str(reason or "").strip(),
            _to_json(metadata, default={}),
            str(created_by_user_id or "").strip() or None,
            now_ts,
        )
        row = await connection.fetchrow(
            """
            SELECT *
            FROM security_control_states
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND scope_type = $3
              AND control_kind = $4
              AND scope_key = $5
            LIMIT 1
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_scope_type,
            resolved_control_kind,
            resolved_scope_key,
        )
        if row is None:
            return None
        resolved_row = dict(row)
        await connection.execute(
            """
            INSERT INTO security_control_events (
                id, tenant_id, workspace_id, control_state_id, scope_type, control_kind, action, scope_key,
                agent_install_id, channel_key, endpoint_key, connector_id, credential_id,
                reason, actor_user_id, metadata, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13,
                $14, $15, $16::jsonb, $17::timestamptz
            )
            """,
            resolved_event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            str(resolved_row.get("id") or "").strip() or None,
            resolved_scope_type,
            resolved_control_kind,
            resolved_action,
            resolved_scope_key,
            str(agent_install_id or "").strip() or None,
            str(channel_key or "").strip().lower() or None,
            str(endpoint_key or "").strip().lower() or None,
            str(connector_id or "").strip().lower() or None,
            str(credential_id or "").strip() or None,
            str(reason or "").strip(),
            str(created_by_user_id or "").strip() or None,
            _to_json(metadata, default={}),
            now_ts,
        )
    return resolved_row


async def list_security_control_states(
    *,
    tenant_id: str,
    workspace_id: str,
    scope_types: Optional[List[str]] = None,
    control_kind: Optional[str] = None,
    active_only: bool = False,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    normalized_scope_types = [
        str(item or "").strip().lower()
        for item in list(scope_types or [])
        if str(item or "").strip()
    ]
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    if normalized_scope_types:
        params.append(normalized_scope_types)
        conditions.append(f"scope_type = ANY(${len(params)}::text[])")
    if control_kind:
        params.append(str(control_kind or "").strip().lower())
        conditions.append(f"control_kind = ${len(params)}")
    if active_only:
        conditions.append("enabled = TRUE")
    params.append(max(1, int(limit or 500)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM security_control_states
            WHERE {' AND '.join(conditions)}
            ORDER BY updated_at DESC, created_at DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def list_security_control_events(
    *,
    tenant_id: str,
    workspace_id: str,
    scope_types: Optional[List[str]] = None,
    actions: Optional[List[str]] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    normalized_scope_types = [
        str(item or "").strip().lower()
        for item in list(scope_types or [])
        if str(item or "").strip()
    ]
    normalized_actions = [
        str(item or "").strip().lower()
        for item in list(actions or [])
        if str(item or "").strip()
    ]
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    if normalized_scope_types:
        params.append(normalized_scope_types)
        conditions.append(f"scope_type = ANY(${len(params)}::text[])")
    if normalized_actions:
        params.append(normalized_actions)
        conditions.append(f"action = ANY(${len(params)}::text[])")
    params.append(max(1, int(limit or 200)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM security_control_events
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def clear_security_control_state_for_tests() -> None:
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return
        await connection.execute("DELETE FROM security_control_events")
        await connection.execute("DELETE FROM security_control_states")
