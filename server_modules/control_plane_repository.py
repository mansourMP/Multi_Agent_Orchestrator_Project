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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules import db as runtime_db


LOGGER = logging.getLogger(__name__)
NEW_ACCOUNT_HOSTED_SAGE_AI_POLICY = "enabled_with_cap"
NEW_ACCOUNT_HOSTED_SAGE_AI_MONTHLY_CAP_USD = 0.25

_SCHEMA_READY = False
_SCHEMA_LOCK: asyncio.Lock = asyncio.Lock()
EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
LOCAL_IDENTITY_DB_FILE = (EMPYRALIS_STATE_HOME / "auth" / "users.db").expanduser()
_LOCAL_IDENTITY_LOCK = threading.Lock()
_LOCAL_AGENT_THREAD_LOCK = threading.RLock()
_LOCAL_AGENT_THREADS: Dict[tuple[str, str, str], Dict[str, Any]] = {}
_LOCAL_AGENT_TURNS: Dict[tuple[str, str, str], List[Dict[str, Any]]] = {}

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

CREATE TABLE IF NOT EXISTS workspace_member_invites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    invited_by_user_id TEXT NULL,
    accepted_by_user_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ NULL,
    revoked_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS workspace_billing_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'stripe',
    billing_email TEXT NULL,
    provider_customer_id TEXT NULL,
    default_currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_billing_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'stripe',
    plan_id TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    provider_subscription_id TEXT NULL,
    provider_price_id TEXT NULL,
    provider_product_id TEXT NULL,
    provider_customer_id TEXT NULL,
    checkout_session_id TEXT NULL,
    checkout_url TEXT NULL,
    portal_url TEXT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    billing_interval TEXT NULL,
    current_period_start TIMESTAMPTZ NULL,
    current_period_end TIMESTAMPTZ NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ NULL,
    trial_ends_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS workspace_billing_subscriptions_workspace_idx
    ON workspace_billing_subscriptions (workspace_id, updated_at DESC);

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

CREATE TABLE IF NOT EXISTS governance_holds (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT '',
    scope_type TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    hold_key TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    blocked_operations JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ NULL,
    UNIQUE(scope_type, scope_key, hold_key)
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

CREATE TABLE IF NOT EXISTS deployed_agents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    owner_workspace_id TEXT NOT NULL,
    backing_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE,
    created_by_user_id TEXT NULL,
    name TEXT NOT NULL,
    avatar TEXT NULL,
    persona TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    deployment_state TEXT NOT NULL DEFAULT 'draft',
    channels JSONB NOT NULL DEFAULT '{}'::jsonb,
    knowledge_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    runtime_target TEXT NOT NULL DEFAULT 'cloud',
    billing_plan TEXT NOT NULL DEFAULT 'free',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    operational_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_deployed_at TIMESTAMPTZ NULL,
    last_paused_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(backing_install_id)
);

ALTER TABLE deployed_agents
ADD COLUMN IF NOT EXISTS operational_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE deployed_agents
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE deployed_agents
ADD COLUMN IF NOT EXISTS quality_stars INTEGER NULL;

ALTER TABLE deployed_agents
ADD COLUMN IF NOT EXISTS cost_tier TEXT NULL;

ALTER TABLE deployed_agents
ADD COLUMN IF NOT EXISTS category TEXT NULL;

CREATE TABLE IF NOT EXISTS deployed_agent_daily_message_usage (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    usage_day DATE NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    warning_sent BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id, usage_day)
);

ALTER TABLE deployed_agent_daily_message_usage
ADD COLUMN IF NOT EXISTS warning_sent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS deployed_agent_monthly_cost_ledger (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL,
    run_id TEXT NOT NULL,
    run_status TEXT NOT NULL DEFAULT '',
    provider TEXT NULL,
    model TEXT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, deployed_agent_id, run_id)
);

CREATE TABLE IF NOT EXISTS workspace_hosted_ai_monthly_cost_ledger (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    usage_month DATE NOT NULL,
    request_id TEXT NOT NULL,
    thread_id TEXT NOT NULL DEFAULT '',
    source_surface TEXT NOT NULL DEFAULT 'sage_direct_chat',
    provider TEXT NULL,
    model TEXT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, request_id)
);

CREATE TABLE IF NOT EXISTS channel_user_acquisition_touches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    endpoint_key TEXT NOT NULL DEFAULT '',
    external_user_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    campaign_token TEXT NOT NULL DEFAULT '',
    start_count INTEGER NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    converted_user_id TEXT NULL,
    converted_email TEXT NULL,
    converted_auth_flow TEXT NULL,
    converted_at TIMESTAMPTZ NULL,
    first_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id)
);

ALTER TABLE channel_user_acquisition_touches
ADD COLUMN IF NOT EXISTS limit_hit_click_at TIMESTAMPTZ NULL;

ALTER TABLE channel_user_acquisition_touches
ADD COLUMN IF NOT EXISTS limit_hit_click_source TEXT NULL;

CREATE TABLE IF NOT EXISTS deployed_agent_upgrade_click_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    acquisition_touch_id TEXT NULL REFERENCES channel_user_acquisition_touches(id) ON DELETE SET NULL,
    channel_key TEXT NOT NULL DEFAULT '',
    external_user_id TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    attribution_token_hash TEXT NOT NULL,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployed_agent_conversation_memory (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    session_key TEXT NULL,
    summary_text TEXT NOT NULL DEFAULT '',
    recent_message_count INTEGER NOT NULL DEFAULT 0,
    source_message_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id)
);

CREATE TABLE IF NOT EXISTS external_user_privacy_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    request_source TEXT NOT NULL DEFAULT '',
    requested_via TEXT NOT NULL DEFAULT '',
    session_key TEXT NULL,
    requested_event_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    note TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    completed_by_user_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id)
);

CREATE TABLE IF NOT EXISTS external_user_privacy_delete_audits (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    deployed_agent_id TEXT NOT NULL REFERENCES deployed_agents(id) ON DELETE CASCADE,
    channel_key TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    request_id TEXT NULL REFERENCES external_user_privacy_requests(id) ON DELETE SET NULL,
    actor_user_id TEXT NULL,
    operation TEXT NOT NULL DEFAULT 'purge',
    status TEXT NOT NULL DEFAULT 'completed',
    deleted_channel_event_count INTEGER NOT NULL DEFAULT 0,
    deleted_memory_count INTEGER NOT NULL DEFAULT 0,
    deleted_daily_usage_count INTEGER NOT NULL DEFAULT 0,
    deleted_acquisition_touch_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_traces (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    thread_id TEXT NULL REFERENCES agent_threads(id) ON DELETE SET NULL,
    run_id TEXT NULL,
    root_agent_id TEXT NOT NULL,
    surface TEXT NOT NULL,
    runtime_target TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ NULL,
    outcome TEXT NULL,
    final_message_id TEXT NULL
);

CREATE TABLE IF NOT EXISTS agent_trace_events (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL REFERENCES agent_traces(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    parent_id TEXT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    persisted BOOLEAN NOT NULL DEFAULT TRUE,
    agent_id TEXT NOT NULL,
    item_id TEXT NULL,
    tool_call_id TEXT NULL,
    child_run_id TEXT NULL,
    approval_id TEXT NULL,
    artifact_id TEXT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
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
CREATE INDEX IF NOT EXISTS idx_workspace_member_invites_workspace_created ON workspace_member_invites(tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_member_invites_email_status ON workspace_member_invites(lower(email), status, updated_at DESC);
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
CREATE INDEX IF NOT EXISTS idx_deployed_agents_workspace_created ON deployed_agents(tenant_id, owner_workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agents_backing_install ON deployed_agents(tenant_id, backing_install_id);
CREATE INDEX IF NOT EXISTS idx_deployed_agents_workspace_state ON deployed_agents(tenant_id, owner_workspace_id, deployment_state);
CREATE INDEX IF NOT EXISTS idx_deployed_agents_public_live
    ON deployed_agents(tenant_id, deployment_state, is_public, category, cost_tier, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_daily_message_usage_scope_day
    ON deployed_agent_daily_message_usage(tenant_id, workspace_id, deployed_agent_id, usage_day DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_daily_message_usage_external_user
    ON deployed_agent_daily_message_usage(tenant_id, workspace_id, channel_key, external_user_id, usage_day DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_monthly_cost_ledger_scope_month
    ON deployed_agent_monthly_cost_ledger(tenant_id, workspace_id, deployed_agent_id, usage_month DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_monthly_cost_ledger_run
    ON deployed_agent_monthly_cost_ledger(tenant_id, workspace_id, run_id);
CREATE INDEX IF NOT EXISTS idx_channel_user_acquisition_touches_deployment
    ON channel_user_acquisition_touches(tenant_id, workspace_id, deployed_agent_id, last_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_user_acquisition_touches_conversion
    ON channel_user_acquisition_touches(tenant_id, workspace_id, converted_user_id, converted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_upgrade_click_events_scope_clicked
    ON deployed_agent_upgrade_click_events(tenant_id, workspace_id, deployed_agent_id, clicked_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deployed_agent_upgrade_click_events_token_hash
    ON deployed_agent_upgrade_click_events(attribution_token_hash);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_conversation_memory_scope
    ON deployed_agent_conversation_memory(tenant_id, workspace_id, deployed_agent_id, channel_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployed_agent_conversation_memory_external_user
    ON deployed_agent_conversation_memory(tenant_id, workspace_id, channel_key, external_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_user_privacy_requests_scope
    ON external_user_privacy_requests(tenant_id, workspace_id, deployed_agent_id, channel_key, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_user_privacy_requests_status
    ON external_user_privacy_requests(tenant_id, workspace_id, status, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_user_privacy_delete_audits_scope
    ON external_user_privacy_delete_audits(tenant_id, workspace_id, deployed_agent_id, channel_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_trace_seq ON agent_trace_events(trace_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_traces_workspace_started ON agent_traces(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_run ON agent_traces(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_trace_events_tool_call ON agent_trace_events(tool_call_id);
CREATE INDEX IF NOT EXISTS idx_agent_trace_events_type ON agent_trace_events(event_type);
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
CREATE INDEX IF NOT EXISTS idx_governance_holds_scope ON governance_holds(tenant_id, workspace_id, scope_type, status, updated_at DESC);
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


def _iso(value: Any) -> Optional[str]:
    timestamp = _coerce_timestamptz(value)
    if timestamp is None:
        return None
    return timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_timestamptz(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            return None
    token = str(value or "").strip()
    if not token:
        return None
    try:
        parsed = datetime.fromisoformat(token.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc) if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _coerce_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).date()
        return value.date()
    if isinstance(value, date):
        return value
    token = str(value or "").strip()
    if not token:
        return None
    try:
        return date.fromisoformat(token)
    except ValueError:
        return None


def _coerce_month_start_date(value: Any) -> Optional[date]:
    resolved = _coerce_date(value)
    if resolved is None:
        return None
    return resolved.replace(day=1)


def _current_utc_month_bounds(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    current = now.astimezone(timezone.utc) if isinstance(now, datetime) else _utc_now_ts()
    month_start = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)
    return month_start, month_end


def _current_utc_day_bounds(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    current = now.astimezone(timezone.utc) if isinstance(now, datetime) else _utc_now_ts()
    day_start = current.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


def _slugify(value: str, fallback: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return token or fallback


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _to_json(value: Any, *, default: Any) -> str:
    payload = value if value is not None else default
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


def _decode_json_object(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    token = str(raw or "").strip()
    if not token:
        return {}
    try:
        parsed = json.loads(token)
    except Exception:
        return {}
    return dict(parsed) if isinstance(parsed, dict) else {}


def _decode_json_array(raw: Any) -> List[Any]:
    if isinstance(raw, list):
        return list(raw)
    token = str(raw or "").strip()
    if not token:
        return []
    try:
        parsed = json.loads(token)
    except Exception:
        return []
    return list(parsed) if isinstance(parsed, list) else []


def _row_to_deployed_agent(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "owner_workspace_id": str(payload.get("owner_workspace_id") or "").strip() or None,
        "backing_install_id": str(payload.get("backing_install_id") or "").strip() or None,
        "created_by_user_id": str(payload.get("created_by_user_id") or "").strip() or None,
        "name": str(payload.get("name") or "").strip(),
        "avatar": str(payload.get("avatar") or "").strip() or None,
        "persona": str(payload.get("persona") or "").strip(),
        "system_prompt": str(payload.get("system_prompt") or "").strip(),
        "deployment_state": str(payload.get("deployment_state") or "").strip().lower() or "draft",
        "channels": _decode_json_object(payload.get("channels")),
        "knowledge_sources": _decode_json_array(payload.get("knowledge_sources")),
        "runtime_target": str(payload.get("runtime_target") or "").strip() or "cloud",
        "billing_plan": str(payload.get("billing_plan") or "").strip() or "free",
        "is_public": bool(payload.get("is_public")),
        "quality_stars": int(payload.get("quality_stars")) if payload.get("quality_stars") is not None else None,
        "cost_tier": str(payload.get("cost_tier") or "").strip().lower() or None,
        "category": str(payload.get("category") or "").strip() or None,
        "metadata": _decode_json_object(payload.get("metadata")),
        "operational_state": _decode_json_object(payload.get("operational_state")),
        "last_deployed_at": _iso(payload.get("last_deployed_at")),
        "last_paused_at": _iso(payload.get("last_paused_at")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_deployed_agent_daily_message_usage(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    usage_day = payload.get("usage_day")
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "channel_key": str(payload.get("channel_key") or "").strip().lower() or None,
        "external_user_id": str(payload.get("external_user_id") or "").strip() or None,
        "usage_day": usage_day.isoformat() if isinstance(usage_day, date) else str(usage_day or "").strip() or None,
        "message_count": int(payload.get("message_count") or 0),
        "warning_sent": bool(payload.get("warning_sent")),
        "metadata": _decode_json_object(payload.get("metadata")),
        "last_message_at": _iso(payload.get("last_message_at")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
        "quota_consumed": bool(payload.get("quota_consumed")),
    }


def _row_to_deployed_agent_monthly_cost_ledger_entry(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    usage_month = payload.get("usage_month")
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "usage_month": usage_month.isoformat() if isinstance(usage_month, date) else str(usage_month or "").strip() or None,
        "run_id": str(payload.get("run_id") or "").strip() or None,
        "run_status": str(payload.get("run_status") or "").strip().lower() or None,
        "provider": str(payload.get("provider") or "").strip().lower() or None,
        "model": str(payload.get("model") or "").strip() or None,
        "prompt_tokens": int(payload.get("prompt_tokens") or 0),
        "completion_tokens": int(payload.get("completion_tokens") or 0),
        "total_tokens": int(payload.get("total_tokens") or 0),
        "estimated_cost_usd": round(float(payload.get("estimated_cost_usd") or 0.0), 6),
        "completed_at": _iso(payload.get("completed_at")),
        "metadata": _decode_json_object(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_workspace_hosted_ai_monthly_cost_ledger_entry(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    usage_month = payload.get("usage_month")
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "usage_month": usage_month.isoformat() if isinstance(usage_month, date) else str(usage_month or "").strip() or None,
        "request_id": str(payload.get("request_id") or "").strip() or None,
        "thread_id": str(payload.get("thread_id") or "").strip() or None,
        "source_surface": str(payload.get("source_surface") or "").strip().lower() or None,
        "provider": str(payload.get("provider") or "").strip().lower() or None,
        "model": str(payload.get("model") or "").strip() or None,
        "prompt_tokens": int(payload.get("prompt_tokens") or 0),
        "completion_tokens": int(payload.get("completion_tokens") or 0),
        "total_tokens": int(payload.get("total_tokens") or 0),
        "estimated_cost_usd": round(float(payload.get("estimated_cost_usd") or 0.0), 6),
        "completed_at": _iso(payload.get("completed_at")),
        "metadata": _decode_json_object(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_deployed_agent_activity_rollup(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "active_users_30d": int(payload.get("active_users_30d") or 0),
        "session_count_30d": int(payload.get("session_count_30d") or 0),
        "message_count_day": int(payload.get("message_count_day") or 0),
        "message_count_week": int(payload.get("message_count_week") or 0),
        "message_count_month": int(payload.get("message_count_month") or 0),
        "latest_message_at": _iso(payload.get("latest_message_at")),
    }


def _row_to_deployed_agent_session_analytics(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "session_id": str(payload.get("session_id") or "").strip() or None,
        "latest_run_id": str(payload.get("latest_run_id") or "").strip() or None,
        "had_escalation": bool(payload.get("had_escalation")),
        "latest_outcome": str(payload.get("latest_outcome") or "").strip().lower() or None,
        "last_activity_at": _iso(payload.get("last_activity_at")),
    }


def _row_to_channel_user_acquisition_touch(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "channel_key": str(payload.get("channel_key") or "").strip().lower() or None,
        "endpoint_key": str(payload.get("endpoint_key") or "").strip().lower() or None,
        "external_user_id": str(payload.get("external_user_id") or "").strip() or None,
        "source": str(payload.get("source") or "").strip() or None,
        "campaign_token": str(payload.get("campaign_token") or "").strip() or None,
        "start_count": int(payload.get("start_count") or 0),
        "metadata": _decode_json_object(payload.get("metadata")),
        "converted_user_id": str(payload.get("converted_user_id") or "").strip() or None,
        "converted_email": str(payload.get("converted_email") or "").strip().lower() or None,
        "converted_auth_flow": str(payload.get("converted_auth_flow") or "").strip().lower() or None,
        "converted_at": _iso(payload.get("converted_at")),
        "limit_hit_click_at": _iso(payload.get("limit_hit_click_at")),
        "limit_hit_click_source": str(payload.get("limit_hit_click_source") or "").strip().lower() or None,
        "first_started_at": _iso(payload.get("first_started_at")),
        "last_started_at": _iso(payload.get("last_started_at")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_deployed_agent_conversation_memory(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "channel_key": str(payload.get("channel_key") or "").strip().lower() or None,
        "external_user_id": str(payload.get("external_user_id") or "").strip() or None,
        "session_key": str(payload.get("session_key") or "").strip() or None,
        "summary_text": str(payload.get("summary_text") or "").strip(),
        "recent_message_count": int(payload.get("recent_message_count") or 0),
        "source_message_count": int(payload.get("source_message_count") or 0),
        "metadata": _decode_json_object(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_external_user_privacy_request(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "channel_key": str(payload.get("channel_key") or "").strip().lower() or None,
        "external_user_id": str(payload.get("external_user_id") or "").strip() or None,
        "request_source": str(payload.get("request_source") or "").strip().lower() or None,
        "requested_via": str(payload.get("requested_via") or "").strip().lower() or None,
        "session_key": str(payload.get("session_key") or "").strip() or None,
        "requested_event_id": str(payload.get("requested_event_id") or "").strip() or None,
        "status": str(payload.get("status") or "").strip().lower() or None,
        "note": str(payload.get("note") or "").strip(),
        "metadata": _decode_json_object(payload.get("metadata")),
        "first_requested_at": _iso(payload.get("first_requested_at")),
        "last_requested_at": _iso(payload.get("last_requested_at")),
        "completed_at": _iso(payload.get("completed_at")),
        "completed_by_user_id": str(payload.get("completed_by_user_id") or "").strip() or None,
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_external_user_privacy_delete_audit(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "deployed_agent_id": str(payload.get("deployed_agent_id") or "").strip() or None,
        "channel_key": str(payload.get("channel_key") or "").strip().lower() or None,
        "external_user_id": str(payload.get("external_user_id") or "").strip() or None,
        "request_id": str(payload.get("request_id") or "").strip() or None,
        "actor_user_id": str(payload.get("actor_user_id") or "").strip() or None,
        "operation": str(payload.get("operation") or "").strip().lower() or None,
        "status": str(payload.get("status") or "").strip().lower() or None,
        "deleted_channel_event_count": int(payload.get("deleted_channel_event_count") or 0),
        "deleted_memory_count": int(payload.get("deleted_memory_count") or 0),
        "deleted_daily_usage_count": int(payload.get("deleted_daily_usage_count") or 0),
        "deleted_acquisition_touch_count": int(payload.get("deleted_acquisition_touch_count") or 0),
        "metadata": _decode_json_object(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
    }


def _row_to_agent_trace(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "thread_id": str(payload.get("thread_id") or "").strip() or None,
        "run_id": str(payload.get("run_id") or "").strip() or None,
        "root_agent_id": str(payload.get("root_agent_id") or "").strip() or None,
        "surface": str(payload.get("surface") or "").strip().lower() or None,
        "runtime_target": str(payload.get("runtime_target") or "").strip() or None,
        "provider": str(payload.get("provider") or "").strip() or None,
        "model": str(payload.get("model") or "").strip() or None,
        "started_at": _iso(payload.get("started_at")),
        "finished_at": _iso(payload.get("finished_at")),
        "outcome": str(payload.get("outcome") or "").strip().lower() or None,
        "final_message_id": str(payload.get("final_message_id") or "").strip() or None,
    }


def _row_to_agent_trace_event(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "trace_id": str(payload.get("trace_id") or "").strip() or None,
        "seq": int(payload.get("seq") or 0),
        "parent_id": str(payload.get("parent_id") or "").strip() or None,
        "ts": _iso(payload.get("ts")),
        "event_type": str(payload.get("event_type") or "").strip() or None,
        "persisted": bool(payload.get("persisted")),
        "agent_id": str(payload.get("agent_id") or "").strip() or None,
        "item_id": str(payload.get("item_id") or "").strip() or None,
        "tool_call_id": str(payload.get("tool_call_id") or "").strip() or None,
        "child_run_id": str(payload.get("child_run_id") or "").strip() or None,
        "approval_id": str(payload.get("approval_id") or "").strip() or None,
        "artifact_id": str(payload.get("artifact_id") or "").strip() or None,
        "payload": _decode_json_object(payload.get("payload")),
    }


def _row_to_agent_channel_event(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "channel_key": str(payload.get("channel_key") or "").strip().lower() or None,
        "endpoint_key": str(payload.get("endpoint_key") or "").strip().lower() or None,
        "session_key": str(payload.get("session_key") or "").strip() or None,
        "thread_id": str(payload.get("thread_id") or "").strip() or None,
        "responder_install_id": str(payload.get("responder_install_id") or "").strip() or None,
        "direction": str(payload.get("direction") or "").strip().lower() or None,
        "event_type": str(payload.get("event_type") or "").strip().lower() or None,
        "message_id": str(payload.get("message_id") or "").strip() or None,
        "parent_event_id": str(payload.get("parent_event_id") or "").strip() or None,
        "run_id": str(payload.get("run_id") or "").strip() or None,
        "actor": _decode_json_object(payload.get("actor")),
        "text": str(payload.get("text") or ""),
        "payload": _decode_json_object(payload.get("payload")),
        "metadata": _decode_json_object(payload.get("metadata")),
        "status": str(payload.get("status") or "").strip().lower() or None,
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_deployed_agent_conversation_summary(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "session_id": str(payload.get("session_id") or "").strip() or None,
        "channel": str(payload.get("channel") or "").strip().lower() or None,
        "endpoint_key": str(payload.get("endpoint_key") or "").strip().lower() or None,
        "thread_id": str(payload.get("thread_id") or "").strip() or None,
        "latest_run_id": str(payload.get("latest_run_id") or "").strip() or None,
        "last_message": str(payload.get("last_message") or "").strip() or None,
        "last_message_at": _iso(payload.get("last_message_at")),
        "customer_actor": _decode_json_object(payload.get("customer_actor")),
    }


def _normalize_workspace_type(value: Any, *, default: str = "personal") -> str:
    token = str(value or "").strip().lower()
    if token in {"personal", "professional", "team", "shared"}:
        return token
    fallback = str(default or "personal").strip().lower()
    return fallback if fallback in {"personal", "professional", "team", "shared"} else "personal"


def _workspace_shell_metadata(
    metadata: Optional[Dict[str, Any]],
    *,
    preferred_shell_profile: Optional[str] = None,
    default_route: Optional[str] = None,
    setup_completed: Optional[bool] = None,
) -> Dict[str, Any]:
    next_metadata = _coerce_dict(metadata)
    shell = _coerce_dict(next_metadata.get("shell"))
    if preferred_shell_profile is not None:
        token = str(preferred_shell_profile or "").strip()
        if token:
            shell["preferredProfile"] = token
        else:
            shell.pop("preferredProfile", None)
    if default_route is not None:
        token = str(default_route or "").strip()
        if token:
            shell["defaultRoute"] = token
        else:
            shell.pop("defaultRoute", None)
    if setup_completed is not None:
        shell["setupCompleted"] = bool(setup_completed)
    next_metadata["shell"] = shell
    return next_metadata


def _extract_workspace_id_from_route(route: Any) -> Optional[str]:
    token = str(route or "").strip()
    if not token.startswith("/w/"):
        return None
    suffix = token[3:]
    workspace_token = suffix.split("/", 1)[0].strip()
    return workspace_token or None


def _normalize_workspace_default_route(workspace_id: str, route: Any) -> str:
    clean_workspace_id = str(workspace_id or "").strip()
    clean_route = str(route or "").strip()
    fallback_route = f"/w/{clean_workspace_id}/chat" if clean_workspace_id else "/chat"
    if not clean_workspace_id:
        return fallback_route
    if not clean_route or not clean_route.startswith("/") or clean_route.startswith("//"):
        return fallback_route
    route_workspace_id = _extract_workspace_id_from_route(clean_route)
    if clean_route.startswith("/w/") and route_workspace_id is None:
        return fallback_route
    if route_workspace_id and route_workspace_id != clean_workspace_id:
        return fallback_route
    normalized_route = clean_route if route_workspace_id else f"/w/{clean_workspace_id}{clean_route}"
    if normalized_route == f"/w/{clean_workspace_id}/dashboard":
        return f"/w/{clean_workspace_id}/admin"
    if normalized_route.endswith("/dashboard") and _extract_workspace_id_from_route(normalized_route) == clean_workspace_id:
        return normalized_route[:-10] + "/admin"
    return normalized_route


def _local_workspace_record_from_row(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    workspace_id = str(row["workspace_id"] or "").strip()
    tenant_id = str(row["tenant_id"] or "").strip() or None
    metadata = _decode_json_object(row["metadata_json"])
    name = str(row["name"] or "").strip() or workspace_id
    return {
        "id": workspace_id,
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "slug": workspace_id,
        "name": name,
        "workspace_type": _normalize_workspace_type(row["workspace_type"], default="personal"),
        "status": "active",
        "created_by_user_id": None,
        "metadata": metadata,
        "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
    }


def _workspace_record_from_row(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    payload["metadata"] = _decode_json_object(payload.get("metadata"))
    return payload


def _ts_or_none(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return int(value.timestamp())
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _local_workspace_billing_account_from_row(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    raw_metadata = (
        row["metadata_json"] if "metadata_json" in keys
        else row["metadata"] if "metadata" in keys
        else row.get("metadata_json") if isinstance(row, dict)
        else row.get("metadata") if isinstance(row, dict)
        else {}
    )
    return {
        "workspace_id": str(row["workspace_id"] or "").strip(),
        "tenant_id": str(row["tenant_id"] or "").strip() or None,
        "provider": str(row["provider"] or "stripe").strip() or "stripe",
        "billing_email": str(row["billing_email"] or "").strip().lower() or None,
        "provider_customer_id": str(row["provider_customer_id"] or "").strip() or None,
        "default_currency": str(row["default_currency"] or "usd").strip().lower() or "usd",
        "status": str(row["status"] or "active").strip().lower() or "active",
        "metadata": _decode_json_object(raw_metadata),
        "created_at": _ts_or_none(row["created_at"]),
        "updated_at": _ts_or_none(row["updated_at"]),
    }


def _billing_row_metadata(row: Any) -> Dict[str, Any]:
    if row is None:
        return {}
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    raw = (
        row["metadata_json"] if "metadata_json" in keys
        else row["metadata"] if "metadata" in keys
        else row.get("metadata_json") if isinstance(row, dict)
        else row.get("metadata") if isinstance(row, dict)
        else {}
    )
    return _decode_json_object(raw)


def _workspace_billing_subscription_from_row(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return {
        "id": str(row["id"] or "").strip(),
        "workspace_id": str(row["workspace_id"] or "").strip(),
        "tenant_id": str(row["tenant_id"] or "").strip() or None,
        "provider": str(row["provider"] or "stripe").strip() or "stripe",
        "plan_id": str(row["plan_id"] or "free").strip().lower() or "free",
        "status": str(row["status"] or "active").strip().lower() or "active",
        "provider_subscription_id": str(row["provider_subscription_id"] or "").strip() or None,
        "provider_price_id": str(row["provider_price_id"] or "").strip() or None,
        "provider_product_id": str(row["provider_product_id"] or "").strip() or None,
        "provider_customer_id": str(row["provider_customer_id"] or "").strip() or None,
        "checkout_session_id": str(row["checkout_session_id"] or "").strip() or None,
        "checkout_url": str(row["checkout_url"] or "").strip() or None,
        "portal_url": str(row["portal_url"] or "").strip() or None,
        "currency": str(row["currency"] or "usd").strip().lower() or "usd",
        "billing_interval": str(row["billing_interval"] or "").strip().lower() or None,
        "current_period_start": _ts_or_none(row["current_period_start"]),
        "current_period_end": _ts_or_none(row["current_period_end"]),
        "cancel_at_period_end": bool(row["cancel_at_period_end"]),
        "canceled_at": _ts_or_none(row["canceled_at"]),
        "trial_ends_at": _ts_or_none(row["trial_ends_at"]),
        "metadata": _billing_row_metadata(row),
        "created_at": _ts_or_none(row["created_at"]),
        "updated_at": _ts_or_none(row["updated_at"]),
    }


def _upsert_local_workspace_registry(
    connection: sqlite3.Connection,
    *,
    workspace_id: str,
    tenant_id: str,
    name: Optional[str] = None,
    workspace_type: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    created_at_ts: Optional[int] = None,
) -> None:
    clean_workspace_id = str(workspace_id or "").strip()
    clean_tenant_id = str(tenant_id or "").strip()
    if not clean_workspace_id or not clean_tenant_id:
        return
    existing = connection.execute(
        """
        SELECT workspace_id, tenant_id, name, workspace_type, metadata_json, created_at, updated_at
        FROM workspace_registry
        WHERE workspace_id = ?
        LIMIT 1
        """,
        (clean_workspace_id,),
    ).fetchone()
    existing_record = _local_workspace_record_from_row(existing)
    effective_created_at_ts = (
        int(existing["created_at"])
        if existing is not None and existing["created_at"] is not None
        else int(created_at_ts or time.time())
    )
    effective_name = (
        str(name or "").strip()
        or str((existing_record or {}).get("name") or "").strip()
        or clean_workspace_id
    )
    effective_workspace_type = _normalize_workspace_type(
        workspace_type,
        default=str((existing_record or {}).get("workspace_type") or "personal"),
    )
    effective_metadata = _coerce_dict((existing_record or {}).get("metadata"))
    if metadata is not None:
        effective_metadata = _coerce_dict(metadata)
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_registry (
            workspace_id, tenant_id, name, workspace_type, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            clean_workspace_id,
            clean_tenant_id,
            effective_name,
            effective_workspace_type,
            _to_json(effective_metadata, default={}),
            effective_created_at_ts,
            int(time.time()),
        ),
    )


def _upsert_local_workspace_billing_account(
    connection: sqlite3.Connection,
    *,
    workspace_id: str,
    tenant_id: str,
    billing_email: Optional[str] = None,
    provider_customer_id: Optional[str] = None,
    default_currency: str = "usd",
    status: str = "active",
    metadata: Optional[Dict[str, Any]] = None,
    created_at_ts: Optional[int] = None,
) -> None:
    clean_workspace_id = str(workspace_id or "").strip()
    clean_tenant_id = str(tenant_id or "").strip()
    if not clean_workspace_id or not clean_tenant_id:
        return
    ts = int(time.time())
    existing = connection.execute(
        "SELECT created_at FROM workspace_billing_accounts WHERE workspace_id = ? LIMIT 1",
        (clean_workspace_id,),
    ).fetchone()
    created_at = int(existing["created_at"]) if existing is not None else int(created_at_ts or ts)
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_billing_accounts (
            workspace_id, tenant_id, provider, billing_email, provider_customer_id, default_currency, status, metadata_json, created_at, updated_at
        ) VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            clean_workspace_id,
            clean_tenant_id,
            str(billing_email or "").strip().lower() or None,
            str(provider_customer_id or "").strip() or None,
            str(default_currency or "usd").strip().lower() or "usd",
            str(status or "active").strip().lower() or "active",
            _to_json(metadata, default={}),
            created_at,
            ts,
        ),
    )


def _upsert_local_workspace_billing_subscription(
    connection: sqlite3.Connection,
    *,
    subscription_id: Optional[str] = None,
    workspace_id: str,
    tenant_id: str,
    plan_id: str,
    status: str,
    provider_subscription_id: Optional[str] = None,
    provider_price_id: Optional[str] = None,
    provider_product_id: Optional[str] = None,
    provider_customer_id: Optional[str] = None,
    checkout_session_id: Optional[str] = None,
    checkout_url: Optional[str] = None,
    portal_url: Optional[str] = None,
    currency: str = "usd",
    billing_interval: Optional[str] = None,
    current_period_start: Optional[int] = None,
    current_period_end: Optional[int] = None,
    cancel_at_period_end: bool = False,
    canceled_at: Optional[int] = None,
    trial_ends_at: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
    created_at_ts: Optional[int] = None,
) -> str:
    clean_workspace_id = str(workspace_id or "").strip()
    clean_tenant_id = str(tenant_id or "").strip()
    if not clean_workspace_id or not clean_tenant_id:
        return str(subscription_id or "").strip()
    ts = int(time.time())
    created_at = int(created_at_ts or ts)
    effective_id = str(subscription_id or "").strip()
    if provider_subscription_id:
        existing = connection.execute(
            """
            SELECT id, created_at
            FROM workspace_billing_subscriptions
            WHERE provider = 'stripe' AND provider_subscription_id = ?
            LIMIT 1
            """,
            (str(provider_subscription_id or "").strip(),),
        ).fetchone()
        if existing is not None:
            effective_id = str(existing["id"] or "").strip() or effective_id
            created_at = int(existing["created_at"] or created_at)
    if not effective_id:
        existing = connection.execute(
            """
            SELECT id, created_at
            FROM workspace_billing_subscriptions
            WHERE workspace_id = ?
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            (clean_workspace_id,),
        ).fetchone()
        if existing is not None:
            effective_id = str(existing["id"] or "").strip() or str(uuid.uuid4())
            created_at = int(existing["created_at"] or created_at)
        else:
            effective_id = str(uuid.uuid4())
    connection.execute(
        """
        INSERT OR REPLACE INTO workspace_billing_subscriptions (
            id, tenant_id, workspace_id, provider, plan_id, status, provider_subscription_id, provider_price_id, provider_product_id,
            provider_customer_id, checkout_session_id, checkout_url, portal_url, currency, billing_interval,
            current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_ends_at, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            effective_id,
            clean_tenant_id,
            clean_workspace_id,
            str(plan_id or "free").strip().lower() or "free",
            str(status or "active").strip().lower() or "active",
            str(provider_subscription_id or "").strip() or None,
            str(provider_price_id or "").strip() or None,
            str(provider_product_id or "").strip() or None,
            str(provider_customer_id or "").strip() or None,
            str(checkout_session_id or "").strip() or None,
            str(checkout_url or "").strip() or None,
            str(portal_url or "").strip() or None,
            str(currency or "usd").strip().lower() or "usd",
            str(billing_interval or "").strip().lower() or None,
            current_period_start,
            current_period_end,
            1 if cancel_at_period_end else 0,
            canceled_at,
            trial_ends_at,
            _to_json(metadata, default={}),
            created_at,
            ts,
        ),
    )
    return effective_id


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
            name TEXT,
            workspace_type TEXT NOT NULL DEFAULT 'personal',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_member_invites (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            invited_by_user_id TEXT,
            accepted_by_user_id TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            accepted_at INTEGER,
            revoked_at INTEGER
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_billing_accounts (
            workspace_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'stripe',
            billing_email TEXT,
            provider_customer_id TEXT,
            default_currency TEXT NOT NULL DEFAULT 'usd',
            status TEXT NOT NULL DEFAULT 'active',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_billing_subscriptions (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'stripe',
            plan_id TEXT NOT NULL DEFAULT 'free',
            status TEXT NOT NULL DEFAULT 'active',
            provider_subscription_id TEXT,
            provider_price_id TEXT,
            provider_product_id TEXT,
            provider_customer_id TEXT,
            checkout_session_id TEXT,
            checkout_url TEXT,
            portal_url TEXT,
            currency TEXT NOT NULL DEFAULT 'usd',
            billing_interval TEXT,
            current_period_start INTEGER,
            current_period_end INTEGER,
            cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
            canceled_at INTEGER,
            trial_ends_at INTEGER,
            metadata_json TEXT NOT NULL DEFAULT '{}',
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
    workspace_registry_columns = {
        str(row["name"] or "").strip().lower()
        for row in connection.execute("PRAGMA table_info(workspace_registry)").fetchall()
    }
    if "name" not in workspace_registry_columns:
        connection.execute("ALTER TABLE workspace_registry ADD COLUMN name TEXT")
    if "workspace_type" not in workspace_registry_columns:
        connection.execute(
            "ALTER TABLE workspace_registry ADD COLUMN workspace_type TEXT NOT NULL DEFAULT 'personal'"
        )
    if "metadata_json" not in workspace_registry_columns:
        connection.execute(
            "ALTER TABLE workspace_registry ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"
        )
    billing_account_columns = {
        str(row["name"] or "").strip().lower()
        for row in connection.execute("PRAGMA table_info(workspace_billing_accounts)").fetchall()
    }
    if "metadata_json" not in billing_account_columns:
        connection.execute(
            "ALTER TABLE workspace_billing_accounts ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"
        )
    billing_subscription_columns = {
        str(row["name"] or "").strip().lower()
        for row in connection.execute("PRAGMA table_info(workspace_billing_subscriptions)").fetchall()
    }
    if "metadata_json" not in billing_subscription_columns:
        connection.execute(
            "ALTER TABLE workspace_billing_subscriptions ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"
        )
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
            wr.tenant_id,
            wr.name AS workspace_name
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
            "workspace_name": str(row["workspace_name"] or "").strip() or None,
        }
        for row in rows
    ]


def _workspace_invite_record_from_row(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    keys = set(row.keys()) if hasattr(row, "keys") else set()
    raw_metadata = (
        row["metadata_json"] if "metadata_json" in keys
        else row["metadata"] if "metadata" in keys
        else row.get("metadata_json") if isinstance(row, dict)
        else row.get("metadata") if isinstance(row, dict)
        else {}
    )
    metadata = _decode_json_object(raw_metadata)
    return {
        "id": str(row["id"] or "").strip(),
        "tenant_id": str(row["tenant_id"] or "").strip() or None,
        "workspace_id": str(row["workspace_id"] or "").strip(),
        "email": str(row["email"] or "").strip().lower(),
        "role": str(row["role"] or "").strip() or "member",
        "status": str(row["status"] or "").strip() or "pending",
        "invited_by_user_id": str(row["invited_by_user_id"] or "").strip() or None,
        "accepted_by_user_id": str(row["accepted_by_user_id"] or "").strip() or None,
        "metadata": metadata,
        "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
        "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
        "accepted_at": int(row["accepted_at"]) if row["accepted_at"] is not None else None,
        "revoked_at": int(row["revoked_at"]) if row["revoked_at"] is not None else None,
    }


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
    workspace_metadata = _workspace_shell_metadata(
        {
            "billing": {
                "plan_id": "personal",
                "hosted_sage_ai_policy": NEW_ACCOUNT_HOSTED_SAGE_AI_POLICY,
                "hosted_sage_ai_monthly_cap_usd": NEW_ACCOUNT_HOSTED_SAGE_AI_MONTHLY_CAP_USD,
            }
        },
        setup_completed=False,
    )

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
                            workspace_id, tenant_id, name, workspace_type, metadata_json, created_at, updated_at
                        ) VALUES (?, ?, ?, 'personal', ?, COALESCE((SELECT created_at FROM workspace_registry WHERE workspace_id = ?), ?), ?)
                        """,
                        (
                            resolved_workspace_id,
                            resolved_tenant_id,
                            workspace_name,
                            _to_json(workspace_metadata, default={}),
                            resolved_workspace_id,
                            created_at_ts,
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
            await ensure_workspace_billing_defaults(
                resolved_workspace_id,
                tenant_id=resolved_tenant_id,
                billing_email=normalized_email,
            )
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
            ) VALUES ($1, $2, $3, $4, $5, 'personal', 'active', $6, $7::jsonb, $8::timestamptz, $8::timestamptz)
            """,
            resolved_workspace_id,
            resolved_tenant_id,
            resolved_workspace_id,
            workspace_slug,
            workspace_name,
            resolved_user_id,
            _to_json(workspace_metadata, default={}),
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
    await ensure_workspace_billing_defaults(
        resolved_workspace_id,
        tenant_id=resolved_tenant_id,
        billing_email=normalized_email,
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
                            workspace_id, tenant_id, name, workspace_type, metadata_json, created_at, updated_at
                        ) VALUES (
                            ?, ?, COALESCE((SELECT name FROM workspace_registry WHERE workspace_id = ?), ?),
                            COALESCE((SELECT workspace_type FROM workspace_registry WHERE workspace_id = ?), 'personal'),
                            COALESCE((SELECT metadata_json FROM workspace_registry WHERE workspace_id = ?), '{}'),
                            COALESCE((SELECT created_at FROM workspace_registry WHERE workspace_id = ?), ?),
                            ?
                        )
                        """,
                        (
                            resolved_workspace_id,
                            resolved_tenant_id,
                            resolved_workspace_id,
                            resolved_workspace_id,
                            resolved_workspace_id,
                            resolved_workspace_id,
                            resolved_workspace_id,
                            created_at_ts,
                            created_at_ts,
                        ),
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
    await ensure_workspace_billing_defaults(
        resolved_workspace_id,
        tenant_id=resolved_tenant_id,
        billing_email=normalized_email,
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
    records: List[Dict[str, Any]] = []
    for row in rows:
        record = _workspace_record_from_row(row)
        if isinstance(record, dict):
            records.append(record)
    return records


async def list_workspaces_for_user(user_id: str) -> List[Dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return []
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    rows = fallback.execute(
                        """
                        SELECT
                            wr.workspace_id,
                            wr.tenant_id,
                            wr.name,
                            wr.workspace_type,
                            wr.metadata_json,
                            wr.created_at,
                            wr.updated_at
                        FROM workspace_memberships wm
                        JOIN workspace_registry wr ON wr.workspace_id = wm.workspace_id
                        WHERE wm.user_id = ?
                        ORDER BY wm.created_at ASC, wr.workspace_id ASC
                        """,
                        (clean_user_id,),
                    ).fetchall()
            return [
                record
                for record in (_local_workspace_record_from_row(row) for row in rows)
                if isinstance(record, dict)
            ]
        rows = await connection.fetch(
            """
            SELECT
                w.id,
                w.tenant_id,
                w.workspace_id,
                w.slug,
                w.name,
                w.workspace_type,
                w.status,
                w.created_by_user_id,
                w.metadata,
                w.created_at,
                w.updated_at
            FROM workspace_memberships wm
            JOIN workspaces w ON w.workspace_id = wm.workspace_id
            WHERE wm.user_id = $1
            ORDER BY wm.created_at ASC, w.workspace_id ASC
            """,
            clean_user_id,
        )
    return [dict(row) for row in rows]


async def create_workspace_for_user(
    user_id: str,
    tenant_id: Optional[str],
    name: str,
    workspace_type: str,
    preferred_shell_profile: str,
    default_route: str,
) -> Optional[Dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    clean_name = str(name or "").strip()
    clean_workspace_type = _normalize_workspace_type(workspace_type, default="personal")
    clean_preferred_shell_profile = str(preferred_shell_profile or "").strip()
    clean_default_route = str(default_route or "").strip()
    if not clean_user_id or not clean_name:
        return None
    if not clean_preferred_shell_profile or not clean_default_route:
        return None

    created_at = _utc_now_ts()
    created_at_ts = int(time.time())
    resolved_workspace_id = f"ws_{uuid.uuid4().hex[:12]}"
    clean_tenant_id = f"tenant_{uuid.uuid4().hex[:12]}"
    tenant_slug = _slugify(f"{clean_name}-{clean_tenant_id[:8]}", f"tenant-{clean_tenant_id[:8]}")
    workspace_slug = _slugify(f"{clean_name}-{resolved_workspace_id[:8]}", f"workspace-{resolved_workspace_id[:8]}")
    metadata = _workspace_shell_metadata(
        {},
        preferred_shell_profile=clean_preferred_shell_profile,
        default_route=_normalize_workspace_default_route(resolved_workspace_id, clean_default_route),
        setup_completed=True,
    )

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    user_row = _local_user_row(fallback, user_id=clean_user_id)
                    if user_row is None:
                        return None
                    _upsert_local_workspace_registry(
                        fallback,
                        workspace_id=resolved_workspace_id,
                        tenant_id=clean_tenant_id,
                        name=clean_name,
                        workspace_type=clean_workspace_type,
                        metadata=metadata,
                        created_at_ts=created_at_ts,
                    )
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_memberships (
                            user_id, workspace_id, role, created_at, updated_at
                        ) VALUES (
                            ?, ?, 'owner', COALESCE((SELECT created_at FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?), ?), ?
                        )
                        """,
                        (
                            clean_user_id,
                            resolved_workspace_id,
                            clean_user_id,
                            resolved_workspace_id,
                            created_at_ts,
                            created_at_ts,
                        ),
                    )
                    fallback.commit()
            await ensure_workspace_billing_defaults(
                resolved_workspace_id,
                tenant_id=clean_tenant_id,
            )
            return await get_workspace_by_id(resolved_workspace_id)

        user_row = await connection.fetchrow(
            """
            SELECT id
            FROM users
            WHERE id = $1
            LIMIT 1
            """,
            clean_user_id,
        )
        if user_row is None:
            return None

        await connection.execute(
            """
            INSERT INTO tenants (
                id, tenant_id, workspace_id, slug, name, status, created_by_user_id, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'active', $6, '{}'::jsonb, $7::timestamptz, $7::timestamptz)
            """,
            clean_tenant_id,
            clean_tenant_id,
            resolved_workspace_id,
            tenant_slug,
            clean_name,
            clean_user_id,
            created_at,
        )
        await connection.execute(
            """
            INSERT INTO workspaces (
                id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8::jsonb, $9::timestamptz, $9::timestamptz)
            """,
            resolved_workspace_id,
            clean_tenant_id,
            resolved_workspace_id,
            workspace_slug,
            clean_name,
            clean_workspace_type,
            clean_user_id,
            _to_json(metadata, default={}),
            created_at,
        )
        await connection.execute(
            """
            INSERT INTO workspace_memberships (
                id, tenant_id, workspace_id, user_id, role, status, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'owner', 'active', '{}'::jsonb, $5::timestamptz, $5::timestamptz)
            """,
            str(uuid.uuid4()),
            clean_tenant_id,
            resolved_workspace_id,
            clean_user_id,
            created_at,
        )
    await ensure_workspace_billing_defaults(
        resolved_workspace_id,
        tenant_id=clean_tenant_id,
    )
    return await get_workspace_by_id(resolved_workspace_id)


async def update_workspace_profile(workspace_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    created_at_ts = int(time.time())

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    existing = fallback.execute(
                        """
                        SELECT workspace_id, tenant_id, name, workspace_type, metadata_json, created_at, updated_at
                        FROM workspace_registry
                        WHERE workspace_id = ?
                        LIMIT 1
                        """,
                        (clean_workspace_id,),
                    ).fetchone()
                    existing_record = _local_workspace_record_from_row(existing)
                    if existing_record is None:
                        return None
                    next_metadata = _coerce_dict(updates.get("metadata")) if "metadata" in updates else _workspace_shell_metadata(
                        _coerce_dict(existing_record.get("metadata")),
                        preferred_shell_profile=updates.get("preferred_shell_profile")
                        if "preferred_shell_profile" in updates
                        else None,
                        default_route=_normalize_workspace_default_route(
                            clean_workspace_id,
                            updates.get("default_route"),
                        )
                        if "default_route" in updates
                        else None,
                        setup_completed=updates.get("setup_completed")
                        if "setup_completed" in updates
                        else None,
                    )
                    _upsert_local_workspace_registry(
                        fallback,
                        workspace_id=clean_workspace_id,
                        tenant_id=str(existing_record.get("tenant_id") or "").strip(),
                        name=str(updates.get("name") or "").strip() or str(existing_record.get("name") or "").strip(),
                        workspace_type=updates.get("workspace_type") or existing_record.get("workspace_type"),
                        metadata=next_metadata,
                        created_at_ts=int(existing_record.get("created_at") or created_at_ts),
                    )
                    fallback.commit()
            return await get_workspace_by_id(clean_workspace_id)

        existing = await connection.fetchrow(
            """
            SELECT id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
            FROM workspaces
            WHERE workspace_id = $1
            LIMIT 1
            """,
            clean_workspace_id,
        )
        if existing is None:
            return None
        existing_record = dict(existing)
        next_name = str(updates.get("name") or "").strip() or str(existing_record.get("name") or "").strip()
        next_workspace_type = _normalize_workspace_type(
            updates.get("workspace_type"),
            default=str(existing_record.get("workspace_type") or "personal"),
        )
        next_metadata = _coerce_dict(updates.get("metadata")) if "metadata" in updates else _workspace_shell_metadata(
            _coerce_dict(existing_record.get("metadata")),
            preferred_shell_profile=updates.get("preferred_shell_profile")
            if "preferred_shell_profile" in updates
            else None,
            default_route=_normalize_workspace_default_route(
                clean_workspace_id,
                updates.get("default_route"),
            )
            if "default_route" in updates
            else None,
            setup_completed=updates.get("setup_completed") if "setup_completed" in updates else None,
        )
        updated_at = _utc_now_ts()
        await connection.execute(
            """
            UPDATE workspaces
            SET name = $2,
                workspace_type = $3,
                metadata = $4::jsonb,
                updated_at = $5::timestamptz
            WHERE workspace_id = $1
            """,
            clean_workspace_id,
            next_name,
            next_workspace_type,
            _to_json(next_metadata, default={}),
            updated_at,
        )
    return await get_workspace_by_id(clean_workspace_id)


async def list_workspace_members(workspace_id: str) -> List[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return []
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    rows = fallback.execute(
                        """
                        SELECT
                            wm.user_id,
                            wm.workspace_id,
                            wm.role,
                            wm.created_at,
                            wm.updated_at,
                            u.email,
                            u.name AS display_name,
                            u.avatar_url
                        FROM workspace_memberships wm
                        LEFT JOIN users u ON u.id = wm.user_id
                        WHERE wm.workspace_id = ?
                        ORDER BY wm.created_at ASC, wm.user_id ASC
                        """,
                        (clean_workspace_id,),
                    ).fetchall()
            return [
                {
                    "id": f"{row['user_id']}:{row['workspace_id']}",
                    "workspace_id": str(row["workspace_id"] or "").strip(),
                    "user_id": str(row["user_id"] or "").strip(),
                    "role": str(row["role"] or "").strip() or "member",
                    "status": "active",
                    "created_at": int(row["created_at"]) if row["created_at"] is not None else None,
                    "updated_at": int(row["updated_at"]) if row["updated_at"] is not None else None,
                    "email": str(row["email"] or "").strip().lower() or None,
                    "display_name": str(row["display_name"] or "").strip() or None,
                    "avatar_url": str(row["avatar_url"] or "").strip() or None,
                }
                for row in rows
            ]
        rows = await connection.fetch(
            """
            SELECT
                wm.id,
                wm.workspace_id,
                wm.user_id,
                wm.role,
                wm.status,
                wm.created_at,
                wm.updated_at,
                u.email,
                u.display_name,
                u.avatar_url
            FROM workspace_memberships wm
            LEFT JOIN users u ON u.id = wm.user_id
            WHERE wm.workspace_id = $1
            ORDER BY wm.created_at ASC, wm.user_id ASC
            """,
            clean_workspace_id,
        )
    return [dict(row) for row in rows]


async def list_workspace_invites(workspace_id: str) -> List[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return []
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    rows = fallback.execute(
                        """
                        SELECT
                            id,
                            tenant_id,
                            workspace_id,
                            email,
                            role,
                            status,
                            invited_by_user_id,
                            accepted_by_user_id,
                            metadata_json,
                            created_at,
                            updated_at,
                            accepted_at,
                            revoked_at
                        FROM workspace_member_invites
                        WHERE workspace_id = ?
                        ORDER BY created_at DESC, id DESC
                        """,
                        (clean_workspace_id,),
                    ).fetchall()
            return [item for item in (_workspace_invite_record_from_row(row) for row in rows) if item]
        rows = await connection.fetch(
            """
            SELECT
                id,
                tenant_id,
                workspace_id,
                email,
                role,
                status,
                invited_by_user_id,
                accepted_by_user_id,
                metadata,
                created_at,
                updated_at,
                accepted_at,
                revoked_at
            FROM workspace_member_invites
            WHERE workspace_id = $1
            ORDER BY created_at DESC, id DESC
            """,
            clean_workspace_id,
        )
    return [dict(row) for row in rows]


async def get_workspace_invite(workspace_id: str, invite_id: str) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    clean_invite_id = str(invite_id or "").strip()
    if not clean_workspace_id or not clean_invite_id:
        return None
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = fallback.execute(
                        """
                        SELECT
                            id,
                            tenant_id,
                            workspace_id,
                            email,
                            role,
                            status,
                            invited_by_user_id,
                            accepted_by_user_id,
                            metadata_json,
                            created_at,
                            updated_at,
                            accepted_at,
                            revoked_at
                        FROM workspace_member_invites
                        WHERE workspace_id = ?
                          AND id = ?
                        LIMIT 1
                        """,
                        (clean_workspace_id, clean_invite_id),
                    ).fetchone()
            return _workspace_invite_record_from_row(row)
        row = await connection.fetchrow(
            """
            SELECT
                id,
                tenant_id,
                workspace_id,
                email,
                role,
                status,
                invited_by_user_id,
                accepted_by_user_id,
                metadata,
                created_at,
                updated_at,
                accepted_at,
                revoked_at
            FROM workspace_member_invites
            WHERE workspace_id = $1
              AND id = $2
            LIMIT 1
            """,
            clean_workspace_id,
            clean_invite_id,
        )
    return dict(row) if row is not None else None


async def list_pending_workspace_invites_for_email(email: str) -> List[Dict[str, Any]]:
    email_token = str(email or "").strip().lower()
    if not email_token:
        return []
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    rows = fallback.execute(
                        """
                        SELECT
                            id,
                            tenant_id,
                            workspace_id,
                            email,
                            role,
                            status,
                            invited_by_user_id,
                            accepted_by_user_id,
                            metadata_json,
                            created_at,
                            updated_at,
                            accepted_at,
                            revoked_at
                        FROM workspace_member_invites
                        WHERE lower(email) = lower(?)
                          AND status = 'pending'
                        ORDER BY created_at ASC, id ASC
                        """,
                        (email_token,),
                    ).fetchall()
            return [item for item in (_workspace_invite_record_from_row(row) for row in rows) if item]
        rows = await connection.fetch(
            """
            SELECT
                id,
                tenant_id,
                workspace_id,
                email,
                role,
                status,
                invited_by_user_id,
                accepted_by_user_id,
                metadata,
                created_at,
                updated_at,
                accepted_at,
                revoked_at
            FROM workspace_member_invites
            WHERE lower(email) = lower($1)
              AND status = 'pending'
            ORDER BY created_at ASC, id ASC
            """,
            email_token,
        )
    return [dict(row) for row in rows]


async def create_workspace_invite(
    *,
    workspace_id: str,
    email: str,
    role: str,
    invited_by_user_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    email_token = str(email or "").strip().lower()
    clean_role = str(role or "").strip().lower() or "member"
    if not clean_workspace_id or not email_token:
        return None
    workspace = await get_workspace_by_id(clean_workspace_id)
    tenant_id = str((workspace or {}).get("tenant_id") or "").strip()
    if not tenant_id:
        return None
    invite_id = f"invite_{uuid.uuid4().hex}"
    metadata_payload = dict(metadata or {})
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            now_ts = int(time.time())
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    existing = fallback.execute(
                        """
                        SELECT id, created_at
                        FROM workspace_member_invites
                        WHERE workspace_id = ?
                          AND lower(email) = lower(?)
                          AND status = 'pending'
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        (clean_workspace_id, email_token),
                    ).fetchone()
                    effective_invite_id = str(existing["id"] or "").strip() if existing is not None else invite_id
                    created_at = int(existing["created_at"]) if existing is not None and existing["created_at"] is not None else now_ts
                    fallback.execute(
                        """
                        INSERT OR REPLACE INTO workspace_member_invites (
                            id, tenant_id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id,
                            metadata_json, created_at, updated_at, accepted_at, revoked_at
                        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?, NULL, NULL)
                        """,
                        (
                            effective_invite_id,
                            tenant_id,
                            clean_workspace_id,
                            email_token,
                            clean_role,
                            str(invited_by_user_id or "").strip() or None,
                            _to_json(metadata_payload, default={}),
                            created_at,
                            now_ts,
                        ),
                    )
                    row = fallback.execute(
                        "SELECT * FROM workspace_member_invites WHERE id = ? LIMIT 1",
                        (effective_invite_id,),
                    ).fetchone()
                    fallback.commit()
            return _workspace_invite_record_from_row(row)
        existing = await connection.fetchrow(
            """
            SELECT id, created_at
            FROM workspace_member_invites
            WHERE workspace_id = $1
              AND lower(email) = lower($2)
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            clean_workspace_id,
            email_token,
        )
        effective_invite_id = str(existing["id"] or "").strip() if existing is not None else invite_id
        created_at = existing["created_at"] if existing is not None else _utc_now_ts()
        updated_at = _utc_now_ts()
        await connection.execute(
            """
            INSERT INTO workspace_member_invites (
                id, tenant_id, workspace_id, email, role, status, invited_by_user_id, accepted_by_user_id,
                metadata, created_at, updated_at, accepted_at, revoked_at
            ) VALUES (
                $1, $2, $3, $4, $5, 'pending', $6, NULL, $7::jsonb, $8::timestamptz, $9::timestamptz, NULL, NULL
            )
            ON CONFLICT (id) DO UPDATE SET
                role = EXCLUDED.role,
                invited_by_user_id = EXCLUDED.invited_by_user_id,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at,
                status = 'pending',
                accepted_by_user_id = NULL,
                accepted_at = NULL,
                revoked_at = NULL
            """,
            effective_invite_id,
            tenant_id,
            clean_workspace_id,
            email_token,
            clean_role,
            str(invited_by_user_id or "").strip() or None,
            _to_json(metadata_payload, default={}),
            created_at,
            updated_at,
        )
        row = await connection.fetchrow(
            "SELECT * FROM workspace_member_invites WHERE id = $1 LIMIT 1",
            effective_invite_id,
        )
    return dict(row) if row is not None else None


async def accept_workspace_invite(
    *,
    invite_id: str,
    accepted_by_user_id: str,
) -> Optional[Dict[str, Any]]:
    clean_invite_id = str(invite_id or "").strip()
    clean_user_id = str(accepted_by_user_id or "").strip()
    if not clean_invite_id or not clean_user_id:
        return None
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            now_ts = int(time.time())
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    fallback.execute(
                        """
                        UPDATE workspace_member_invites
                        SET status = 'accepted',
                            accepted_by_user_id = ?,
                            accepted_at = ?,
                            updated_at = ?,
                            revoked_at = NULL
                        WHERE id = ?
                        """,
                        (clean_user_id, now_ts, now_ts, clean_invite_id),
                    )
                    row = fallback.execute(
                        "SELECT * FROM workspace_member_invites WHERE id = ? LIMIT 1",
                        (clean_invite_id,),
                    ).fetchone()
                    fallback.commit()
            return _workspace_invite_record_from_row(row)
        await connection.execute(
            """
            UPDATE workspace_member_invites
            SET status = 'accepted',
                accepted_by_user_id = $2,
                accepted_at = $3::timestamptz,
                updated_at = $3::timestamptz,
                revoked_at = NULL
            WHERE id = $1
            """,
            clean_invite_id,
            clean_user_id,
            _utc_now_ts(),
        )
        row = await connection.fetchrow(
            "SELECT * FROM workspace_member_invites WHERE id = $1 LIMIT 1",
            clean_invite_id,
        )
    return dict(row) if row is not None else None


async def revoke_workspace_invite(invite_id: str) -> Optional[Dict[str, Any]]:
    clean_invite_id = str(invite_id or "").strip()
    if not clean_invite_id:
        return None
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            now_ts = int(time.time())
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    fallback.execute(
                        """
                        UPDATE workspace_member_invites
                        SET status = 'revoked',
                            revoked_at = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (now_ts, now_ts, clean_invite_id),
                    )
                    row = fallback.execute(
                        "SELECT * FROM workspace_member_invites WHERE id = ? LIMIT 1",
                        (clean_invite_id,),
                    ).fetchone()
                    fallback.commit()
            return _workspace_invite_record_from_row(row)
        await connection.execute(
            """
            UPDATE workspace_member_invites
            SET status = 'revoked',
                revoked_at = $2::timestamptz,
                updated_at = $2::timestamptz
            WHERE id = $1
            """,
            clean_invite_id,
            _utc_now_ts(),
        )
        row = await connection.fetchrow(
            "SELECT * FROM workspace_member_invites WHERE id = $1 LIMIT 1",
            clean_invite_id,
        )
    return dict(row) if row is not None else None


async def update_workspace_policy_metadata(
    workspace_id: str,
    metadata: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    payload = dict(metadata or {})
    workspace = await get_workspace_by_id(clean_workspace_id)
    if not isinstance(workspace, dict):
        return None
    existing_metadata = _coerce_dict(workspace.get("metadata"))
    next_metadata = {
        **existing_metadata,
        "policies": payload,
    }
    return await update_workspace_profile(
        clean_workspace_id,
        {
            "name": str(workspace.get("name") or "").strip() or str(workspace.get("workspace_id") or "").strip(),
            "workspace_type": str(workspace.get("workspace_type") or workspace.get("kind") or "personal"),
            "preferred_shell_profile": _workspace_shell_metadata(existing_metadata).get("preferredProfile"),
            "default_route": _workspace_shell_metadata(existing_metadata).get("defaultRoute"),
            "setup_completed": _workspace_shell_metadata(existing_metadata).get("setupCompleted"),
            "metadata": next_metadata,
        },
    )


async def update_workspace_admin_defaults_metadata(
    workspace_id: str,
    metadata: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    payload = dict(metadata or {})
    workspace = await get_workspace_by_id(clean_workspace_id)
    if not isinstance(workspace, dict):
        return None
    existing_metadata = _coerce_dict(workspace.get("metadata"))
    next_metadata = {
        **existing_metadata,
        "admin_defaults": payload,
    }
    return await update_workspace_profile(
        clean_workspace_id,
        {
            "name": str(workspace.get("name") or "").strip() or str(workspace.get("workspace_id") or "").strip(),
            "workspace_type": str(workspace.get("workspace_type") or workspace.get("kind") or "personal"),
            "preferred_shell_profile": _workspace_shell_metadata(existing_metadata).get("preferredProfile"),
            "default_route": _workspace_shell_metadata(existing_metadata).get("defaultRoute"),
            "setup_completed": _workspace_shell_metadata(existing_metadata).get("setupCompleted"),
            "metadata": next_metadata,
        },
    )


async def ensure_workspace_billing_defaults(
    workspace_id: str,
    *,
    tenant_id: Optional[str] = None,
    billing_email: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    workspace = await get_workspace_by_id(clean_workspace_id)
    if not isinstance(workspace, dict):
        return None
    resolved_tenant_id = str(tenant_id or workspace.get("tenant_id") or "").strip()
    if not resolved_tenant_id:
        return None
    now_dt = _utc_now_ts()
    now_ts = int(time.time())

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    existing_account = fallback.execute(
                        "SELECT * FROM workspace_billing_accounts WHERE workspace_id = ? LIMIT 1",
                        (clean_workspace_id,),
                    ).fetchone()
                    if existing_account is None:
                        _upsert_local_workspace_billing_account(
                            fallback,
                            workspace_id=clean_workspace_id,
                            tenant_id=resolved_tenant_id,
                            billing_email=billing_email,
                            metadata={},
                            created_at_ts=now_ts,
                        )
                    existing_subscription = fallback.execute(
                        """
                        SELECT *
                        FROM workspace_billing_subscriptions
                        WHERE workspace_id = ?
                        ORDER BY updated_at DESC, created_at DESC
                        LIMIT 1
                        """,
                        (clean_workspace_id,),
                    ).fetchone()
                    if existing_subscription is None:
                        _upsert_local_workspace_billing_subscription(
                            fallback,
                            workspace_id=clean_workspace_id,
                            tenant_id=resolved_tenant_id,
                            plan_id="free",
                            status="active",
                            currency="usd",
                            metadata={"source": "workspace_default"},
                            created_at_ts=now_ts,
                        )
                    fallback.commit()
            return await get_workspace_billing_summary(clean_workspace_id)

        existing_account = await connection.fetchrow(
            """
            SELECT *
            FROM workspace_billing_accounts
            WHERE workspace_id = $1
            LIMIT 1
            """,
            clean_workspace_id,
        )
        if existing_account is None:
            await connection.execute(
                """
                INSERT INTO workspace_billing_accounts (
                    id, tenant_id, workspace_id, provider, billing_email, provider_customer_id, default_currency, status, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, 'stripe', $4, NULL, 'usd', 'active', '{}'::jsonb, $5::timestamptz, $5::timestamptz)
                """,
                str(uuid.uuid4()),
                resolved_tenant_id,
                clean_workspace_id,
                str(billing_email or "").strip().lower() or None,
                now_dt,
            )
        existing_subscription = await connection.fetchrow(
            """
            SELECT *
            FROM workspace_billing_subscriptions
            WHERE workspace_id = $1
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            clean_workspace_id,
        )
        if existing_subscription is None:
            await connection.execute(
                """
                INSERT INTO workspace_billing_subscriptions (
                    id, tenant_id, workspace_id, provider, plan_id, status, currency, metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, 'stripe', 'free', 'active', 'usd', $4::jsonb, $5::timestamptz, $5::timestamptz)
                """,
                str(uuid.uuid4()),
                resolved_tenant_id,
                clean_workspace_id,
                _to_json({"source": "workspace_default"}, default={}),
                now_dt,
            )
    return await get_workspace_billing_summary(clean_workspace_id)


async def get_workspace_billing_summary(workspace_id: str) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    workspace = await get_workspace_by_id(clean_workspace_id)
    if not isinstance(workspace, dict):
        return None
    resolved_tenant_id = str(workspace.get("tenant_id") or "").strip() or None

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    account_row = fallback.execute(
                        "SELECT * FROM workspace_billing_accounts WHERE workspace_id = ? LIMIT 1",
                        (clean_workspace_id,),
                    ).fetchone()
                    subscription_row = fallback.execute(
                        """
                        SELECT *
                        FROM workspace_billing_subscriptions
                        WHERE workspace_id = ?
                        ORDER BY updated_at DESC, created_at DESC
                        LIMIT 1
                        """,
                        (clean_workspace_id,),
                    ).fetchone()
            account = _local_workspace_billing_account_from_row(account_row)
            subscription = _workspace_billing_subscription_from_row(subscription_row)
        else:
            account_row = await connection.fetchrow(
                """
                SELECT *
                FROM workspace_billing_accounts
                WHERE workspace_id = $1
                LIMIT 1
                """,
                clean_workspace_id,
            )
            subscription_row = await connection.fetchrow(
                """
                SELECT *
                FROM workspace_billing_subscriptions
                WHERE workspace_id = $1
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """,
                clean_workspace_id,
            )
            account = _local_workspace_billing_account_from_row(account_row)
            subscription = _workspace_billing_subscription_from_row(subscription_row)

    return {
        "workspace_id": clean_workspace_id,
        "tenant_id": resolved_tenant_id,
        "workspace_name": str(workspace.get("name") or "").strip() or clean_workspace_id,
        "account": account,
        "subscription": subscription,
    }


async def upsert_workspace_billing_account(
    workspace_id: str,
    *,
    tenant_id: Optional[str] = None,
    billing_email: Optional[str] = None,
    provider_customer_id: Optional[str] = None,
    default_currency: str = "usd",
    status: str = "active",
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    workspace = await get_workspace_by_id(clean_workspace_id)
    if not isinstance(workspace, dict):
        return None
    resolved_tenant_id = str(tenant_id or workspace.get("tenant_id") or "").strip()
    if not resolved_tenant_id:
        return None
    now_dt = _utc_now_ts()
    now_ts = int(time.time())

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    _upsert_local_workspace_billing_account(
                        fallback,
                        workspace_id=clean_workspace_id,
                        tenant_id=resolved_tenant_id,
                        billing_email=billing_email,
                        provider_customer_id=provider_customer_id,
                        default_currency=default_currency,
                        status=status,
                        metadata=metadata,
                        created_at_ts=now_ts,
                    )
                    fallback.commit()
            return await get_workspace_billing_summary(clean_workspace_id)

        existing = await connection.fetchrow(
            "SELECT id, created_at FROM workspace_billing_accounts WHERE workspace_id = $1 LIMIT 1",
            clean_workspace_id,
        )
        existing_record = dict(existing) if existing is not None else {}
        account_id = str(existing_record.get("id") or uuid.uuid4()).strip()
        created_at = _coerce_timestamptz(existing_record.get("created_at")) or now_dt
        await connection.execute(
            """
            INSERT INTO workspace_billing_accounts (
                id, tenant_id, workspace_id, provider, billing_email, provider_customer_id, default_currency, status, metadata, created_at, updated_at
            ) VALUES ($1, $2, $3, 'stripe', $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10::timestamptz)
            ON CONFLICT (workspace_id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                billing_email = EXCLUDED.billing_email,
                provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, workspace_billing_accounts.provider_customer_id),
                default_currency = EXCLUDED.default_currency,
                status = EXCLUDED.status,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            """,
            account_id,
            resolved_tenant_id,
            clean_workspace_id,
            str(billing_email or "").strip().lower() or None,
            str(provider_customer_id or "").strip() or None,
            str(default_currency or "usd").strip().lower() or "usd",
            str(status or "active").strip().lower() or "active",
            _to_json(metadata, default={}),
            created_at,
            now_dt,
        )
    return await get_workspace_billing_summary(clean_workspace_id)


async def upsert_workspace_billing_subscription(
    workspace_id: str,
    *,
    tenant_id: Optional[str] = None,
    plan_id: str,
    status: str,
    provider_subscription_id: Optional[str] = None,
    provider_price_id: Optional[str] = None,
    provider_product_id: Optional[str] = None,
    provider_customer_id: Optional[str] = None,
    checkout_session_id: Optional[str] = None,
    checkout_url: Optional[str] = None,
    portal_url: Optional[str] = None,
    currency: str = "usd",
    billing_interval: Optional[str] = None,
    current_period_start: Optional[int] = None,
    current_period_end: Optional[int] = None,
    cancel_at_period_end: bool = False,
    canceled_at: Optional[int] = None,
    trial_ends_at: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    clean_workspace_id = str(workspace_id or "").strip()
    if not clean_workspace_id:
        return None
    workspace = await get_workspace_by_id(clean_workspace_id)
    if not isinstance(workspace, dict):
        return None
    resolved_tenant_id = str(tenant_id or workspace.get("tenant_id") or "").strip()
    if not resolved_tenant_id:
        return None
    now_dt = _utc_now_ts()
    now_ts = int(time.time())

    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    _upsert_local_workspace_billing_subscription(
                        fallback,
                        workspace_id=clean_workspace_id,
                        tenant_id=resolved_tenant_id,
                        plan_id=plan_id,
                        status=status,
                        provider_subscription_id=provider_subscription_id,
                        provider_price_id=provider_price_id,
                        provider_product_id=provider_product_id,
                        provider_customer_id=provider_customer_id,
                        checkout_session_id=checkout_session_id,
                        checkout_url=checkout_url,
                        portal_url=portal_url,
                        currency=currency,
                        billing_interval=billing_interval,
                        current_period_start=current_period_start,
                        current_period_end=current_period_end,
                        cancel_at_period_end=cancel_at_period_end,
                        canceled_at=canceled_at,
                        trial_ends_at=trial_ends_at,
                        metadata=metadata,
                        created_at_ts=now_ts,
                    )
                    fallback.commit()
            return await get_workspace_billing_summary(clean_workspace_id)

        existing = None
        if provider_subscription_id:
            existing = await connection.fetchrow(
                """
                SELECT id, created_at
                FROM workspace_billing_subscriptions
                WHERE provider = 'stripe' AND provider_subscription_id = $1
                LIMIT 1
                """,
                str(provider_subscription_id or "").strip(),
            )
        if existing is None:
            existing = await connection.fetchrow(
                """
                SELECT id, created_at
                FROM workspace_billing_subscriptions
                WHERE workspace_id = $1
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """,
                clean_workspace_id,
            )
        existing_record = dict(existing) if existing is not None else {}
        subscription_id = str(existing_record.get("id") or uuid.uuid4()).strip()
        created_at = _coerce_timestamptz(existing_record.get("created_at")) or now_dt
        await connection.execute(
            """
            INSERT INTO workspace_billing_subscriptions (
                id, tenant_id, workspace_id, provider, plan_id, status, provider_subscription_id, provider_price_id, provider_product_id,
                provider_customer_id, checkout_session_id, checkout_url, portal_url, currency, billing_interval,
                current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_ends_at, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'stripe', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15::timestamptz, $16::timestamptz, $17, $18::timestamptz, $19::timestamptz, $20::jsonb, $21::timestamptz, $22::timestamptz
            )
            ON CONFLICT (id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                workspace_id = EXCLUDED.workspace_id,
                plan_id = EXCLUDED.plan_id,
                status = EXCLUDED.status,
                provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, workspace_billing_subscriptions.provider_subscription_id),
                provider_price_id = COALESCE(EXCLUDED.provider_price_id, workspace_billing_subscriptions.provider_price_id),
                provider_product_id = COALESCE(EXCLUDED.provider_product_id, workspace_billing_subscriptions.provider_product_id),
                provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, workspace_billing_subscriptions.provider_customer_id),
                checkout_session_id = COALESCE(EXCLUDED.checkout_session_id, workspace_billing_subscriptions.checkout_session_id),
                checkout_url = COALESCE(EXCLUDED.checkout_url, workspace_billing_subscriptions.checkout_url),
                portal_url = COALESCE(EXCLUDED.portal_url, workspace_billing_subscriptions.portal_url),
                currency = EXCLUDED.currency,
                billing_interval = COALESCE(EXCLUDED.billing_interval, workspace_billing_subscriptions.billing_interval),
                current_period_start = COALESCE(EXCLUDED.current_period_start, workspace_billing_subscriptions.current_period_start),
                current_period_end = COALESCE(EXCLUDED.current_period_end, workspace_billing_subscriptions.current_period_end),
                cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                canceled_at = COALESCE(EXCLUDED.canceled_at, workspace_billing_subscriptions.canceled_at),
                trial_ends_at = COALESCE(EXCLUDED.trial_ends_at, workspace_billing_subscriptions.trial_ends_at),
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            """,
            subscription_id,
            resolved_tenant_id,
            clean_workspace_id,
            str(plan_id or "free").strip().lower() or "free",
            str(status or "active").strip().lower() or "active",
            str(provider_subscription_id or "").strip() or None,
            str(provider_price_id or "").strip() or None,
            str(provider_product_id or "").strip() or None,
            str(provider_customer_id or "").strip() or None,
            str(checkout_session_id or "").strip() or None,
            str(checkout_url or "").strip() or None,
            str(portal_url or "").strip() or None,
            str(currency or "usd").strip().lower() or "usd",
            str(billing_interval or "").strip().lower() or None,
            _coerce_timestamptz(current_period_start),
            _coerce_timestamptz(current_period_end),
            bool(cancel_at_period_end),
            _coerce_timestamptz(canceled_at),
            _coerce_timestamptz(trial_ends_at),
            _to_json(metadata, default={}),
            created_at,
            now_dt,
        )
    return await get_workspace_billing_summary(clean_workspace_id)


async def get_workspace_by_id(workspace_id: str) -> Optional[Dict[str, Any]]:
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            with _LOCAL_IDENTITY_LOCK:
                with _connect_local_identity_db() as fallback:
                    row = fallback.execute(
                        """
                        SELECT workspace_id, tenant_id, name, workspace_type, metadata_json, created_at, updated_at
                        FROM workspace_registry
                        WHERE workspace_id = ?
                        LIMIT 1
                        """,
                        (str(workspace_id or "").strip(),),
                    ).fetchone()
            return _local_workspace_record_from_row(row)
        row = await connection.fetchrow(
            """
            SELECT id, tenant_id, workspace_id, slug, name, workspace_type, status, created_by_user_id, metadata, created_at, updated_at
            FROM workspaces
            WHERE workspace_id = $1
            LIMIT 1
            """,
            str(workspace_id or "").strip(),
        )
    return _workspace_record_from_row(row)


async def create_deployed_agent(
    *,
    tenant_id: str,
    owner_workspace_id: str,
    backing_install_id: str,
    created_by_user_id: Optional[str],
    name: str,
    avatar: Optional[str] = None,
    persona: str = "",
    system_prompt: str = "",
    deployment_state: str = "draft",
    channels: Optional[Dict[str, Any]] = None,
    knowledge_sources: Optional[List[Dict[str, Any]]] = None,
    runtime_target: str = "cloud",
    billing_plan: str = "free",
    metadata: Optional[Dict[str, Any]] = None,
    operational_state: Optional[Dict[str, Any]] = None,
    deployed_agent_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = str(tenant_id or "").strip()
    resolved_workspace_id = str(owner_workspace_id or "").strip()
    resolved_install_id = str(backing_install_id or "").strip()
    resolved_name = str(name or "").strip()
    if not resolved_tenant_id or not resolved_workspace_id or not resolved_install_id or not resolved_name:
        return None
    record_id = str(deployed_agent_id or f"dagent_{uuid.uuid4().hex[:16]}").strip()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO deployed_agents (
                id, tenant_id, owner_workspace_id, backing_install_id, created_by_user_id,
                name, avatar, persona, system_prompt, deployment_state, channels, knowledge_sources,
                runtime_target, billing_plan, metadata, operational_state, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
                $13, $14, $15::jsonb, $16::jsonb, NOW(), NOW()
            )
            RETURNING *
            """,
            record_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_install_id,
            str(created_by_user_id or "").strip() or None,
            resolved_name,
            str(avatar or "").strip() or None,
            str(persona or "").strip(),
            str(system_prompt or "").strip(),
            str(deployment_state or "draft").strip().lower() or "draft",
            _to_json(channels, default={}),
            _to_json(knowledge_sources, default=[]),
            str(runtime_target or "cloud").strip() or "cloud",
            str(billing_plan or "free").strip() or "free",
            _to_json(metadata, default={}),
            _to_json(operational_state, default={}),
        )
    return _row_to_deployed_agent(row)


async def get_deployed_agent_daily_message_usage(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
    usage_day: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_usage_day = _coerce_date(usage_day)
    if usage_day is not None and resolved_usage_day is None:
        raise ValueError("usage_day must be an ISO date string or date value.")
    resolved_usage_day = resolved_usage_day or datetime.now(timezone.utc).date()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM deployed_agent_daily_message_usage
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
              AND channel_key = $4
              AND external_user_id = $5
              AND usage_day = $6::date
            LIMIT 1
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
            resolved_usage_day,
        )
    return _row_to_deployed_agent_daily_message_usage(row)


async def consume_deployed_agent_daily_message_quota(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
    limit: int,
    usage_day: Optional[Any] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_limit = max(0, int(limit or 0))
    if resolved_limit <= 0:
        raise ValueError("limit must be a positive integer.")
    resolved_usage_day = _coerce_date(usage_day)
    if usage_day is not None and resolved_usage_day is None:
        raise ValueError("usage_day must be an ISO date string or date value.")
    resolved_usage_day = resolved_usage_day or datetime.now(timezone.utc).date()
    now_ts = _utc_now_ts()
    record_id = f"dusage_{uuid.uuid4().hex[:16]}"
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            WITH consumed AS (
                INSERT INTO deployed_agent_daily_message_usage (
                    id, tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id,
                    usage_day, message_count, warning_sent, metadata, last_message_at, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7::date, 1, FALSE, $8::jsonb, $9::timestamptz, $9::timestamptz, $9::timestamptz
                )
                ON CONFLICT (tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id, usage_day)
                DO UPDATE SET
                    message_count = deployed_agent_daily_message_usage.message_count + 1,
                    metadata = deployed_agent_daily_message_usage.metadata || EXCLUDED.metadata,
                    last_message_at = EXCLUDED.last_message_at,
                    updated_at = EXCLUDED.updated_at
                WHERE deployed_agent_daily_message_usage.message_count < $10
                RETURNING deployed_agent_daily_message_usage.*, TRUE AS quota_consumed
            )
            SELECT *
            FROM consumed
            UNION ALL
            SELECT existing.*, FALSE AS quota_consumed
            FROM deployed_agent_daily_message_usage AS existing
            WHERE existing.tenant_id = $2
              AND existing.workspace_id = $3
              AND existing.deployed_agent_id = $4
              AND existing.channel_key = $5
              AND existing.external_user_id = $6
              AND existing.usage_day = $7::date
              AND NOT EXISTS (SELECT 1 FROM consumed)
            LIMIT 1
            """,
            record_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
            resolved_usage_day,
            _to_json(metadata, default={}),
            now_ts,
            resolved_limit,
        )
    return _row_to_deployed_agent_daily_message_usage(row)


async def mark_deployed_agent_daily_message_warning_sent(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
    usage_day: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_usage_day = _coerce_date(usage_day)
    if usage_day is not None and resolved_usage_day is None:
        raise ValueError("usage_day must be an ISO date string or date value.")
    resolved_usage_day = resolved_usage_day or datetime.now(timezone.utc).date()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            UPDATE deployed_agent_daily_message_usage
            SET warning_sent = TRUE,
                updated_at = NOW()
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
              AND channel_key = $4
              AND external_user_id = $5
              AND usage_day = $6::date
              AND warning_sent = FALSE
            RETURNING *
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
            resolved_usage_day,
        )
    return _row_to_deployed_agent_daily_message_usage(row)


async def get_deployed_agent_by_id(
    deployed_agent_id: str,
    *,
    tenant_id: Optional[str] = None,
    owner_workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_id = str(deployed_agent_id or "").strip()
    if not resolved_id:
        return None
    scoped_kwargs: Dict[str, Any] = {"bypass_rls": True}
    if tenant_id is not None and owner_workspace_id is not None:
        scoped_kwargs = {
            "tenant_id": str(tenant_id or "").strip(),
            "workspace_id": str(owner_workspace_id or "").strip(),
        }
    async with _scoped_connection(**scoped_kwargs) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM deployed_agents
            WHERE id = $1
              AND ($2 = '' OR tenant_id = $2)
              AND ($3 = '' OR owner_workspace_id = $3)
            LIMIT 1
            """,
            resolved_id,
            str(tenant_id or "").strip(),
            str(owner_workspace_id or "").strip(),
        )
    return _row_to_deployed_agent(row)


async def record_deployed_agent_monthly_cost_ledger_entry(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    usage_month: Optional[Any] = None,
    run_id: str,
    run_status: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    estimated_cost_usd: float = 0.0,
    completed_at: Optional[Any] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ledger_entry_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_run_id = _require_scope_token(run_id, "run_id")
    resolved_usage_month = _coerce_month_start_date(usage_month)
    if usage_month is not None and resolved_usage_month is None:
        raise ValueError("usage_month must be an ISO date string or date value.")
    resolved_usage_month = resolved_usage_month or datetime.now(timezone.utc).date().replace(day=1)
    record_id = str(ledger_entry_id or f"dcost_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO deployed_agent_monthly_cost_ledger (
                id, tenant_id, workspace_id, deployed_agent_id, usage_month, run_id,
                run_status, provider, model, prompt_tokens, completion_tokens, total_tokens,
                estimated_cost_usd, completed_at, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5::date, $6,
                $7, $8, $9, $10, $11, $12,
                $13, $14::timestamptz, $15::jsonb, $16::timestamptz, $16::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, deployed_agent_id, run_id)
            DO UPDATE SET
                usage_month = EXCLUDED.usage_month,
                run_status = EXCLUDED.run_status,
                provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                prompt_tokens = EXCLUDED.prompt_tokens,
                completion_tokens = EXCLUDED.completion_tokens,
                total_tokens = EXCLUDED.total_tokens,
                estimated_cost_usd = EXCLUDED.estimated_cost_usd,
                completed_at = COALESCE(EXCLUDED.completed_at, deployed_agent_monthly_cost_ledger.completed_at),
                metadata = deployed_agent_monthly_cost_ledger.metadata || EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            """,
            record_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_usage_month,
            resolved_run_id,
            str(run_status or "").strip().lower() or "completed",
            str(provider or "").strip().lower() or None,
            str(model or "").strip() or None,
            max(0, int(prompt_tokens or 0)),
            max(0, int(completion_tokens or 0)),
            max(0, int(total_tokens or 0)),
            round(float(estimated_cost_usd or 0.0), 6),
            _coerce_timestamptz(completed_at),
            _to_json(metadata, default={}),
            now_ts,
        )
    return _row_to_deployed_agent_monthly_cost_ledger_entry(row)


async def record_workspace_hosted_ai_monthly_cost_ledger_entry(
    *,
    tenant_id: str,
    workspace_id: str,
    request_id: str,
    thread_id: Optional[str] = None,
    source_surface: Optional[str] = None,
    usage_month: Optional[Any] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    estimated_cost_usd: float = 0.0,
    completed_at: Optional[Any] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ledger_entry_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_request_id = _require_scope_token(request_id, "request_id")
    resolved_usage_month = _coerce_month_start_date(usage_month)
    if usage_month is not None and resolved_usage_month is None:
        raise ValueError("usage_month must be an ISO date string or date value.")
    resolved_usage_month = resolved_usage_month or datetime.now(timezone.utc).date().replace(day=1)
    record_id = str(ledger_entry_id or f"shost_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO workspace_hosted_ai_monthly_cost_ledger (
                id, tenant_id, workspace_id, usage_month, request_id, thread_id,
                source_surface, provider, model, prompt_tokens, completion_tokens, total_tokens,
                estimated_cost_usd, completed_at, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4::date, $5, $6,
                $7, $8, $9, $10, $11, $12,
                $13, $14::timestamptz, $15::jsonb, $16::timestamptz, $16::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, request_id)
            DO UPDATE SET
                usage_month = EXCLUDED.usage_month,
                thread_id = EXCLUDED.thread_id,
                source_surface = EXCLUDED.source_surface,
                provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                prompt_tokens = EXCLUDED.prompt_tokens,
                completion_tokens = EXCLUDED.completion_tokens,
                total_tokens = EXCLUDED.total_tokens,
                estimated_cost_usd = EXCLUDED.estimated_cost_usd,
                completed_at = COALESCE(EXCLUDED.completed_at, workspace_hosted_ai_monthly_cost_ledger.completed_at),
                metadata = workspace_hosted_ai_monthly_cost_ledger.metadata || EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            """,
            record_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_usage_month,
            resolved_request_id,
            str(thread_id or "").strip(),
            str(source_surface or "").strip().lower() or "sage_direct_chat",
            str(provider or "").strip().lower() or None,
            str(model or "").strip() or None,
            max(0, int(prompt_tokens or 0)),
            max(0, int(completion_tokens or 0)),
            max(0, int(total_tokens or 0)),
            round(float(estimated_cost_usd or 0.0), 6),
            _coerce_timestamptz(completed_at),
            _to_json(metadata, default={}),
            now_ts,
        )
    return _row_to_workspace_hosted_ai_monthly_cost_ledger_entry(row)


async def upsert_channel_user_acquisition_touch(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    endpoint_key: Optional[str],
    external_user_id: str,
    source: Optional[str] = None,
    campaign_token: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    touch_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_touch_id = str(touch_id or f"acq_{uuid.uuid4().hex[:16]}").strip()
    resolved_endpoint_key = str(endpoint_key or "").strip().lower()
    resolved_source = str(source or "").strip().lower()
    resolved_campaign_token = str(campaign_token or "").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO channel_user_acquisition_touches (
                id, tenant_id, workspace_id, deployed_agent_id, channel_key, endpoint_key,
                external_user_id, source, campaign_token, start_count, metadata,
                first_started_at, last_started_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, 1, $10::jsonb,
                $11::timestamptz, $11::timestamptz, $11::timestamptz, $11::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id)
            DO UPDATE SET
                endpoint_key = CASE
                    WHEN EXCLUDED.endpoint_key <> '' THEN EXCLUDED.endpoint_key
                    ELSE channel_user_acquisition_touches.endpoint_key
                END,
                source = CASE
                    WHEN EXCLUDED.source <> '' THEN EXCLUDED.source
                    ELSE channel_user_acquisition_touches.source
                END,
                campaign_token = CASE
                    WHEN EXCLUDED.campaign_token <> '' THEN EXCLUDED.campaign_token
                    ELSE channel_user_acquisition_touches.campaign_token
                END,
                start_count = channel_user_acquisition_touches.start_count + 1,
                metadata = channel_user_acquisition_touches.metadata || EXCLUDED.metadata,
                last_started_at = EXCLUDED.last_started_at,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            """,
            resolved_touch_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_endpoint_key,
            resolved_external_user_id,
            resolved_source,
            resolved_campaign_token,
            _to_json(metadata, default={}),
            now_ts,
        )
    return _row_to_channel_user_acquisition_touch(row)


async def get_channel_user_acquisition_touch_by_id(
    touch_id: str,
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_touch_id = str(touch_id or "").strip()
    if not resolved_touch_id:
        return None
    scoped_kwargs: Dict[str, Any] = {"bypass_rls": True}
    if tenant_id is not None and workspace_id is not None:
        scoped_kwargs = {
            "tenant_id": str(tenant_id or "").strip(),
            "workspace_id": str(workspace_id or "").strip(),
        }
    async with _scoped_connection(**scoped_kwargs) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM channel_user_acquisition_touches
            WHERE id = $1
            LIMIT 1
            """,
            resolved_touch_id,
        )
    return _row_to_channel_user_acquisition_touch(row)


async def get_channel_user_acquisition_touch(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM channel_user_acquisition_touches
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
              AND channel_key = $4
              AND external_user_id = $5
            LIMIT 1
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
        )
    return _row_to_channel_user_acquisition_touch(row)


async def mark_channel_user_acquisition_touch_converted(
    *,
    touch_id: str,
    tenant_id: str,
    workspace_id: str,
    converted_user_id: str,
    converted_email: Optional[str] = None,
    auth_flow: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_touch_id = _require_scope_token(touch_id, "touch_id")
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_user_id = _require_scope_token(converted_user_id, "converted_user_id")
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            UPDATE channel_user_acquisition_touches
            SET
                converted_user_id = $4,
                converted_email = COALESCE(NULLIF($5, ''), converted_email),
                converted_auth_flow = COALESCE(NULLIF($6, ''), converted_auth_flow),
                converted_at = COALESCE(converted_at, $7::timestamptz),
                updated_at = $7::timestamptz
            WHERE id = $1
              AND tenant_id = $2
              AND workspace_id = $3
              AND (converted_user_id IS NULL OR converted_user_id = $4)
            RETURNING *
            """,
            resolved_touch_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_user_id,
            str(converted_email or "").strip().lower(),
            str(auth_flow or "").strip().lower(),
            now_ts,
        )
        if row is None:
            row = await connection.fetchrow(
                """
                SELECT *
                FROM channel_user_acquisition_touches
                WHERE id = $1
                  AND tenant_id = $2
                  AND workspace_id = $3
                LIMIT 1
                """,
                resolved_touch_id,
                resolved_tenant_id,
                resolved_workspace_id,
            )
    return _row_to_channel_user_acquisition_touch(row)


async def get_deployed_agent_conversation_memory(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM deployed_agent_conversation_memory
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
              AND channel_key = $4
              AND external_user_id = $5
            LIMIT 1
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
        )
    return _row_to_deployed_agent_conversation_memory(row)


async def list_deployed_agent_conversation_memory(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    safe_limit = max(1, min(int(limit or 50), 200))
    safe_offset = max(0, int(offset or 0))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            SELECT *
            FROM deployed_agent_conversation_memory
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
            ORDER BY updated_at DESC, created_at DESC, id DESC
            LIMIT $4 OFFSET $5
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            safe_limit,
            safe_offset,
        )
    return [
        payload
        for payload in (_row_to_deployed_agent_conversation_memory(row) for row in rows)
        if isinstance(payload, dict)
    ]


async def upsert_deployed_agent_conversation_memory(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
    session_key: Optional[str] = None,
    summary_text: str = "",
    recent_message_count: int = 0,
    source_message_count: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
    memory_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_memory_id = str(memory_id or f"dmem_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO deployed_agent_conversation_memory (
                id, tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id,
                session_key, summary_text, recent_message_count, source_message_count, metadata,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11::jsonb,
                $12::timestamptz, $12::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id)
            DO UPDATE SET
                session_key = COALESCE(NULLIF(EXCLUDED.session_key, ''), deployed_agent_conversation_memory.session_key),
                summary_text = EXCLUDED.summary_text,
                recent_message_count = EXCLUDED.recent_message_count,
                source_message_count = EXCLUDED.source_message_count,
                metadata = deployed_agent_conversation_memory.metadata || EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            """,
            resolved_memory_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
            str(session_key or "").strip() or None,
            str(summary_text or "").strip(),
            max(0, int(recent_message_count or 0)),
            max(0, int(source_message_count or 0)),
            _to_json(metadata, default={}),
            now_ts,
        )
    return _row_to_deployed_agent_conversation_memory(row)


async def upsert_external_user_privacy_request(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
    request_source: Optional[str] = None,
    requested_via: Optional[str] = None,
    session_key: Optional[str] = None,
    requested_event_id: Optional[str] = None,
    status: str = "requested",
    note: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    completed_by_user_id: Optional[str] = None,
    request_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_request_id = str(request_id or f"privreq_{uuid.uuid4().hex[:16]}").strip()
    resolved_status = str(status or "requested").strip().lower() or "requested"
    if resolved_status not in {"requested", "completed"}:
        resolved_status = "requested"
    now_ts = _utc_now_ts()
    completed_at = now_ts if resolved_status == "completed" else None
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO external_user_privacy_requests (
                id, tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id,
                request_source, requested_via, session_key, requested_event_id, status, note,
                metadata, first_requested_at, last_requested_at, completed_at, completed_by_user_id,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                $13::jsonb, $14::timestamptz, $14::timestamptz, $15::timestamptz, $16,
                $14::timestamptz, $14::timestamptz
            )
            ON CONFLICT (tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id)
            DO UPDATE SET
                request_source = CASE
                    WHEN EXCLUDED.request_source <> '' THEN EXCLUDED.request_source
                    ELSE external_user_privacy_requests.request_source
                END,
                requested_via = CASE
                    WHEN EXCLUDED.requested_via <> '' THEN EXCLUDED.requested_via
                    ELSE external_user_privacy_requests.requested_via
                END,
                session_key = COALESCE(NULLIF(EXCLUDED.session_key, ''), external_user_privacy_requests.session_key),
                requested_event_id = COALESCE(NULLIF(EXCLUDED.requested_event_id, ''), external_user_privacy_requests.requested_event_id),
                status = EXCLUDED.status,
                note = CASE
                    WHEN EXCLUDED.note <> '' THEN EXCLUDED.note
                    ELSE external_user_privacy_requests.note
                END,
                metadata = external_user_privacy_requests.metadata || EXCLUDED.metadata,
                last_requested_at = EXCLUDED.last_requested_at,
                completed_at = CASE
                    WHEN EXCLUDED.status = 'completed' THEN COALESCE(EXCLUDED.completed_at, external_user_privacy_requests.completed_at)
                    ELSE NULL
                END,
                completed_by_user_id = CASE
                    WHEN EXCLUDED.status = 'completed' AND EXCLUDED.completed_by_user_id <> '' THEN EXCLUDED.completed_by_user_id
                    WHEN EXCLUDED.status = 'completed' THEN external_user_privacy_requests.completed_by_user_id
                    ELSE NULL
                END,
                updated_at = EXCLUDED.updated_at
            RETURNING *
            """,
            resolved_request_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
            str(request_source or "").strip().lower(),
            str(requested_via or "").strip().lower(),
            str(session_key or "").strip() or None,
            str(requested_event_id or "").strip() or None,
            resolved_status,
            str(note or "").strip(),
            _to_json(metadata, default={}),
            now_ts,
            completed_at,
            str(completed_by_user_id or "").strip() or None,
        )
    return _row_to_external_user_privacy_request(row)


async def append_external_user_privacy_delete_audit(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
    request_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    operation: str = "purge",
    status: str = "completed",
    deleted_channel_event_count: int = 0,
    deleted_memory_count: int = 0,
    deleted_daily_usage_count: int = 0,
    deleted_acquisition_touch_count: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
    audit_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_audit_id = str(audit_id or f"privaudit_{uuid.uuid4().hex[:16]}").strip()
    now_ts = _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO external_user_privacy_delete_audits (
                id, tenant_id, workspace_id, deployed_agent_id, channel_key, external_user_id,
                request_id, actor_user_id, operation, status, deleted_channel_event_count, deleted_memory_count,
                deleted_daily_usage_count, deleted_acquisition_touch_count, metadata, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                $13, $14, $15::jsonb, $16::timestamptz
            )
            RETURNING *
            """,
            resolved_audit_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_channel_key,
            resolved_external_user_id,
            str(request_id or "").strip() or None,
            str(actor_user_id or "").strip() or None,
            str(operation or "purge").strip().lower() or "purge",
            str(status or "completed").strip().lower() or "completed",
            max(0, int(deleted_channel_event_count or 0)),
            max(0, int(deleted_memory_count or 0)),
            max(0, int(deleted_daily_usage_count or 0)),
            max(0, int(deleted_acquisition_touch_count or 0)),
            _to_json(metadata, default={}),
            now_ts,
        )
    return _row_to_external_user_privacy_delete_audit(row)


async def delete_deployed_agent_external_user_data(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    channel_key: str,
    external_user_id: str,
) -> Dict[str, int]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return {
                "deleted_channel_event_count": 0,
                "deleted_memory_count": 0,
                "deleted_daily_usage_count": 0,
                "deleted_acquisition_touch_count": 0,
            }
        row = await connection.fetchrow(
            """
            WITH matching_sessions AS (
                SELECT DISTINCT session_key
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND channel_key = $3
                  AND COALESCE(metadata->>'deployed_agent_id', '') = $4
                  AND direction = 'inbound'
                  AND COALESCE(actor->>'id', '') = $5
                  AND COALESCE(session_key, '') <> ''
            ),
            deleted_events AS (
                DELETE FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND channel_key = $3
                  AND COALESCE(metadata->>'deployed_agent_id', '') = $4
                  AND (
                    COALESCE(actor->>'id', '') = $5
                    OR session_key IN (SELECT session_key FROM matching_sessions)
                  )
                RETURNING 1
            ),
            deleted_memory AS (
                DELETE FROM deployed_agent_conversation_memory
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND deployed_agent_id = $4
                  AND channel_key = $3
                  AND external_user_id = $5
                RETURNING 1
            ),
            deleted_daily_usage AS (
                DELETE FROM deployed_agent_daily_message_usage
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND deployed_agent_id = $4
                  AND channel_key = $3
                  AND external_user_id = $5
                RETURNING 1
            ),
            deleted_acquisition AS (
                DELETE FROM channel_user_acquisition_touches
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND deployed_agent_id = $4
                  AND channel_key = $3
                  AND external_user_id = $5
                RETURNING 1
            )
            SELECT
                (SELECT COUNT(*)::int FROM deleted_events) AS deleted_channel_event_count,
                (SELECT COUNT(*)::int FROM deleted_memory) AS deleted_memory_count,
                (SELECT COUNT(*)::int FROM deleted_daily_usage) AS deleted_daily_usage_count,
                (SELECT COUNT(*)::int FROM deleted_acquisition) AS deleted_acquisition_touch_count
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_channel_key,
            resolved_deployed_agent_id,
            resolved_external_user_id,
        )
    payload = dict(row or {})
    return {
        "deleted_channel_event_count": int(payload.get("deleted_channel_event_count") or 0),
        "deleted_memory_count": int(payload.get("deleted_memory_count") or 0),
        "deleted_daily_usage_count": int(payload.get("deleted_daily_usage_count") or 0),
        "deleted_acquisition_touch_count": int(payload.get("deleted_acquisition_touch_count") or 0),
    }


async def summarize_deployed_agent_monthly_cost_ledger(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    usage_month: Optional[Any] = None,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_usage_month = _coerce_month_start_date(usage_month)
    if usage_month is not None and resolved_usage_month is None:
        raise ValueError("usage_month must be an ISO date string or date value.")
    resolved_usage_month = resolved_usage_month or datetime.now(timezone.utc).date().replace(day=1)
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return {
                "tenant_id": resolved_tenant_id,
                "workspace_id": resolved_workspace_id,
                "deployed_agent_id": resolved_deployed_agent_id,
                "usage_month": resolved_usage_month.isoformat(),
                "runs_count": 0,
                "total_cost_usd": 0.0,
                "last_run_id": None,
                "last_run_completed_at": None,
            }
        totals = await connection.fetchrow(
            """
            SELECT
                COUNT(*)::integer AS runs_count,
                COALESCE(SUM(estimated_cost_usd), 0)::double precision AS total_cost_usd,
                MAX(completed_at) AS last_run_completed_at
            FROM deployed_agent_monthly_cost_ledger
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
              AND usage_month = $4::date
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_usage_month,
        )
        latest = await connection.fetchrow(
            """
            SELECT run_id, completed_at
            FROM deployed_agent_monthly_cost_ledger
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND deployed_agent_id = $3
              AND usage_month = $4::date
            ORDER BY COALESCE(completed_at, updated_at, created_at) DESC, run_id DESC
            LIMIT 1
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_usage_month,
        )
    total_payload = dict(totals) if totals is not None else {}
    latest_payload = dict(latest) if latest is not None else {}
    return {
        "tenant_id": resolved_tenant_id,
        "workspace_id": resolved_workspace_id,
        "deployed_agent_id": resolved_deployed_agent_id,
        "usage_month": resolved_usage_month,
        "runs_count": int(total_payload.get("runs_count") or 0),
        "total_cost_usd": round(float(total_payload.get("total_cost_usd") or 0.0), 6),
        "last_run_id": str(latest_payload.get("run_id") or "").strip() or None,
        "last_run_completed_at": _iso(latest_payload.get("completed_at") or total_payload.get("last_run_completed_at")),
    }


async def summarize_workspace_billing_usage(
    *,
    tenant_id: str,
    workspace_id: str,
    usage_month: Optional[Any] = None,
    usage_day: Optional[Any] = None,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_usage_month = _coerce_month_start_date(usage_month)
    if usage_month is not None and resolved_usage_month is None:
        raise ValueError("usage_month must be an ISO date string or date value.")
    resolved_usage_month = resolved_usage_month or datetime.now(timezone.utc).date().replace(day=1)
    resolved_usage_day = _coerce_date(usage_day)
    if usage_day is not None and resolved_usage_day is None:
        raise ValueError("usage_day must be an ISO date string or date value.")
    resolved_usage_day = resolved_usage_day or datetime.now(timezone.utc).date()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return {
                "tenant_id": resolved_tenant_id,
                "workspace_id": resolved_workspace_id,
                "usage_month": resolved_usage_month.isoformat(),
                "usage_day": resolved_usage_day.isoformat(),
                "hosted_input_tokens_monthly": 0,
                "hosted_output_tokens_monthly": 0,
                "hosted_total_tokens_monthly": 0,
                "hosted_cost_usd_monthly": 0.0,
                "hosted_runs_monthly": 0,
                "hosted_sage_input_tokens_monthly": 0,
                "hosted_sage_output_tokens_monthly": 0,
                "hosted_sage_total_tokens_monthly": 0,
                "hosted_sage_cost_usd_monthly": 0.0,
                "hosted_sage_runs_monthly": 0,
                "specialist_external_messages_today": 0,
                "specialist_external_users_today": 0,
                "daily_quota_subjects_today": 0,
            }
        cost_row = await connection.fetchrow(
            """
            SELECT
                COALESCE(SUM(prompt_tokens), 0)::bigint AS hosted_input_tokens_monthly,
                COALESCE(SUM(completion_tokens), 0)::bigint AS hosted_output_tokens_monthly,
                COALESCE(SUM(total_tokens), 0)::bigint AS hosted_total_tokens_monthly,
                COALESCE(SUM(estimated_cost_usd), 0)::double precision AS hosted_cost_usd_monthly,
                COUNT(*)::int AS hosted_runs_monthly
            FROM deployed_agent_monthly_cost_ledger
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND usage_month = $3::date
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_usage_month,
        )
        daily_message_row = await connection.fetchrow(
            """
            SELECT
                COALESCE(SUM(message_count), 0)::bigint AS specialist_external_messages_today,
                COUNT(DISTINCT external_user_id)::int AS specialist_external_users_today,
                COUNT(*)::int AS daily_quota_subjects_today
            FROM deployed_agent_daily_message_usage
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND usage_day = $3::date
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_usage_day,
        )
        sage_cost_row = await connection.fetchrow(
            """
            SELECT
                COALESCE(SUM(prompt_tokens), 0)::bigint AS hosted_sage_input_tokens_monthly,
                COALESCE(SUM(completion_tokens), 0)::bigint AS hosted_sage_output_tokens_monthly,
                COALESCE(SUM(total_tokens), 0)::bigint AS hosted_sage_total_tokens_monthly,
                COALESCE(SUM(estimated_cost_usd), 0)::double precision AS hosted_sage_cost_usd_monthly,
                COUNT(*)::int AS hosted_sage_runs_monthly
            FROM workspace_hosted_ai_monthly_cost_ledger
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND usage_month = $3::date
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_usage_month,
        )
    cost_payload = dict(cost_row or {})
    sage_cost_payload = dict(sage_cost_row or {})
    daily_payload = dict(daily_message_row or {})
    hosted_input_tokens = int(cost_payload.get("hosted_input_tokens_monthly") or 0) + int(sage_cost_payload.get("hosted_sage_input_tokens_monthly") or 0)
    hosted_output_tokens = int(cost_payload.get("hosted_output_tokens_monthly") or 0) + int(sage_cost_payload.get("hosted_sage_output_tokens_monthly") or 0)
    hosted_total_tokens = int(cost_payload.get("hosted_total_tokens_monthly") or 0) + int(sage_cost_payload.get("hosted_sage_total_tokens_monthly") or 0)
    hosted_cost_usd = round(float(cost_payload.get("hosted_cost_usd_monthly") or 0.0) + float(sage_cost_payload.get("hosted_sage_cost_usd_monthly") or 0.0), 6)
    hosted_runs = int(cost_payload.get("hosted_runs_monthly") or 0) + int(sage_cost_payload.get("hosted_sage_runs_monthly") or 0)
    return {
        "tenant_id": resolved_tenant_id,
        "workspace_id": resolved_workspace_id,
        "usage_month": resolved_usage_month.isoformat(),
        "usage_day": resolved_usage_day.isoformat(),
        "hosted_input_tokens_monthly": hosted_input_tokens,
        "hosted_output_tokens_monthly": hosted_output_tokens,
        "hosted_total_tokens_monthly": hosted_total_tokens,
        "hosted_cost_usd_monthly": hosted_cost_usd,
        "hosted_runs_monthly": hosted_runs,
        "hosted_sage_input_tokens_monthly": int(sage_cost_payload.get("hosted_sage_input_tokens_monthly") or 0),
        "hosted_sage_output_tokens_monthly": int(sage_cost_payload.get("hosted_sage_output_tokens_monthly") or 0),
        "hosted_sage_total_tokens_monthly": int(sage_cost_payload.get("hosted_sage_total_tokens_monthly") or 0),
        "hosted_sage_cost_usd_monthly": round(float(sage_cost_payload.get("hosted_sage_cost_usd_monthly") or 0.0), 6),
        "hosted_sage_runs_monthly": int(sage_cost_payload.get("hosted_sage_runs_monthly") or 0),
        "specialist_external_messages_today": int(daily_payload.get("specialist_external_messages_today") or 0),
        "specialist_external_users_today": int(daily_payload.get("specialist_external_users_today") or 0),
        "daily_quota_subjects_today": int(daily_payload.get("daily_quota_subjects_today") or 0),
    }


async def summarize_deployed_agent_activity_rollup(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    backing_install_id: str,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = str(deployed_agent_id or "").strip()
    resolved_backing_install_id = str(backing_install_id or "").strip()
    if not resolved_deployed_agent_id or not resolved_backing_install_id:
        return {
            "deployed_agent_id": resolved_deployed_agent_id or None,
            "active_users_30d": 0,
            "session_count_30d": 0,
            "message_count_day": 0,
            "message_count_week": 0,
            "message_count_month": 0,
            "latest_message_at": None,
        }
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return {
                "deployed_agent_id": resolved_deployed_agent_id,
                "active_users_30d": 0,
                "session_count_30d": 0,
                "message_count_day": 0,
                "message_count_week": 0,
                "message_count_month": 0,
                "latest_message_at": None,
            }
        row = await connection.fetchrow(
            """
            WITH filtered_events AS (
                SELECT
                    *,
                    COALESCE(
                        NULLIF(BTRIM(actor->>'id'), ''),
                        NULLIF(BTRIM(payload->>'external_user_id'), ''),
                        NULLIF(BTRIM(metadata->>'external_user_id'), ''),
                        NULLIF(BTRIM(session_key), '')
                    ) AS external_user_key
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND (
                    COALESCE(metadata->>'deployed_agent_id', '') = $3
                    OR responder_install_id = $4
                  )
            )
            SELECT
                $3::text AS deployed_agent_id,
                COUNT(DISTINCT external_user_key) FILTER (
                    WHERE direction = 'inbound'
                      AND COALESCE(external_user_key, '') <> ''
                      AND created_at >= NOW() - INTERVAL '30 days'
                )::int AS active_users_30d,
                COUNT(DISTINCT session_key) FILTER (
                    WHERE COALESCE(session_key, '') <> ''
                      AND created_at >= NOW() - INTERVAL '30 days'
                )::int AS session_count_30d,
                COUNT(*) FILTER (
                    WHERE event_type = 'message'
                      AND created_at >= NOW() - INTERVAL '1 day'
                )::int AS message_count_day,
                COUNT(*) FILTER (
                    WHERE event_type = 'message'
                      AND created_at >= NOW() - INTERVAL '7 days'
                )::int AS message_count_week,
                COUNT(*) FILTER (
                    WHERE event_type = 'message'
                      AND created_at >= NOW() - INTERVAL '30 days'
                )::int AS message_count_month,
                MAX(created_at) AS latest_message_at
            FROM filtered_events
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_backing_install_id,
        )
    return _row_to_deployed_agent_activity_rollup(row) or {
        "deployed_agent_id": resolved_deployed_agent_id,
        "active_users_30d": 0,
        "session_count_30d": 0,
        "message_count_day": 0,
        "message_count_week": 0,
        "message_count_month": 0,
        "latest_message_at": None,
    }


async def get_deployed_agent_admin_dashboard(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor_last_message_at: Optional[str] = None,
    cursor_external_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    safe_limit = max(1, min(int(limit or 50), 100))
    resolved_cursor_last_message_at = _coerce_timestamptz(cursor_last_message_at)
    resolved_cursor_external_user_id = str(cursor_external_user_id or "").strip()
    month_start, month_end = _current_utc_month_bounds()
    day_start, day_end = _current_utc_day_bounds()
    today = _utc_now_ts().date()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        deployed_agent_row = await connection.fetchrow(
            """
            SELECT *
            FROM deployed_agents
            WHERE id = $1
              AND tenant_id = $2
              AND owner_workspace_id = $3
            LIMIT 1
            """,
            resolved_deployed_agent_id,
            resolved_tenant_id,
            resolved_workspace_id,
        )
        deployed_agent = _row_to_deployed_agent(deployed_agent_row)
        if not isinstance(deployed_agent, dict):
            return None
        backing_install_id = str(deployed_agent.get("backing_install_id") or "").strip()
        metadata = _decode_json_object(deployed_agent.get("metadata"))
        daily_message_limit = int(metadata.get("daily_message_limit") or 0) if metadata.get("daily_message_limit") is not None else 0
        stats_row = await connection.fetchrow(
            """
            WITH filtered_inbound_events AS (
                SELECT
                    created_at,
                    COALESCE(
                        NULLIF(BTRIM(actor->>'id'), ''),
                        NULLIF(BTRIM(payload->>'external_user_id'), ''),
                        NULLIF(BTRIM(metadata->>'external_user_id'), ''),
                        NULLIF(BTRIM(session_key), '')
                    ) AS external_user_key
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND direction = 'inbound'
                  AND event_type = 'message'
                  AND (
                    COALESCE(metadata->>'deployed_agent_id', '') = $3
                    OR responder_install_id = $4
                  )
            )
            SELECT
                COUNT(DISTINCT external_user_key) FILTER (
                    WHERE COALESCE(external_user_key, '') <> ''
                )::int AS total_users,
                COUNT(*) FILTER (
                    WHERE created_at >= $5::timestamptz
                      AND created_at < $6::timestamptz
                )::int AS messages_this_calendar_month,
                CASE
                    WHEN $7::int <= 0 THEN 0
                    ELSE COALESCE((
                        SELECT COUNT(DISTINCT external_user_id)::int
                        FROM deployed_agent_daily_message_usage
                        WHERE tenant_id = $1
                          AND workspace_id = $2
                          AND deployed_agent_id = $3
                          AND usage_day = $8::date
                          AND message_count >= $7::int
                    ), 0)
                END AS users_at_limit_today,
                COALESCE((
                    SELECT COUNT(*)::int
                    FROM deployed_agent_upgrade_click_events
                    WHERE tenant_id = $1
                      AND workspace_id = $2
                      AND deployed_agent_id = $3
                      AND clicked_at >= $5::timestamptz
                      AND clicked_at < $6::timestamptz
                ), 0) AS upgrade_clicks_this_month
            FROM filtered_inbound_events
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            backing_install_id,
            month_start,
            month_end,
            daily_message_limit,
            today,
        )
        specialist_stats_row = await connection.fetchrow(
            """
            WITH todays_messages AS (
                SELECT COUNT(*)::int AS messages_today
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND direction = 'inbound'
                  AND event_type = 'message'
                  AND created_at >= $4::timestamptz
                  AND created_at < $5::timestamptz
                  AND (
                    COALESCE(metadata->>'deployed_agent_id', '') = $6
                    OR responder_install_id = $3
                  )
            ),
            scoped_activity AS (
                SELECT *
                FROM activity_ledger_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND install_id = $3
            ),
            todays_activity AS (
                SELECT *
                FROM scoped_activity
                WHERE created_at >= $4::timestamptz
                  AND created_at < $5::timestamptz
            )
            SELECT
                COALESCE((SELECT messages_today FROM todays_messages), 0)::int AS messages_today,
                COUNT(*) FILTER (
                    WHERE
                        LOWER(COALESCE(action, '')) IN ('place_order', 'confirm_order')
                        OR LOWER(COALESCE(payload->>'restaurant_event', metadata->>'restaurant_event', '')) IN ('order_confirmed', 'order_placed')
                )::int AS orders_today,
                COALESCE(SUM(
                    CASE
                        WHEN
                            LOWER(COALESCE(action, '')) IN ('place_order', 'confirm_order')
                            OR LOWER(COALESCE(payload->>'restaurant_event', metadata->>'restaurant_event', '')) IN ('order_confirmed', 'order_placed')
                        THEN COALESCE(
                            CASE
                            WHEN COALESCE(payload->>'order_total_usd', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                                THEN (payload->>'order_total_usd')::numeric
                                ELSE NULL
                            END,
                            CASE
                                WHEN COALESCE(metadata->>'order_total_usd', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                                THEN (metadata->>'order_total_usd')::numeric
                                ELSE NULL
                            END,
                            0
                        )
                        ELSE 0
                    END
                ), 0)::numeric AS revenue_today_usd
            FROM todays_activity
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            backing_install_id,
            day_start,
            day_end,
            resolved_deployed_agent_id,
        )
        summary_rows = await connection.fetch(
            """
            WITH filtered_inbound_events AS (
                SELECT
                    created_at,
                    COALESCE(
                        NULLIF(BTRIM(actor->>'id'), ''),
                        NULLIF(BTRIM(payload->>'external_user_id'), ''),
                        NULLIF(BTRIM(metadata->>'external_user_id'), ''),
                        NULLIF(BTRIM(session_key), '')
                    ) AS external_user_key
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND direction = 'inbound'
                  AND event_type = 'message'
                  AND (
                    COALESCE(metadata->>'deployed_agent_id', '') = $3
                    OR responder_install_id = $4
                  )
            ),
            grouped_users AS (
                SELECT
                    external_user_key AS external_user_id,
                    MAX(created_at) AS last_message_at,
                    COUNT(*)::int AS total_message_count
                FROM filtered_inbound_events
                WHERE COALESCE(external_user_key, '') <> ''
                GROUP BY external_user_key
            )
            SELECT
                external_user_id,
                last_message_at,
                total_message_count
            FROM grouped_users
            WHERE (
                $5::timestamptz IS NULL
                OR last_message_at < $5::timestamptz
                OR (
                    last_message_at = $5::timestamptz
                    AND external_user_id < COALESCE(NULLIF($6, ''), external_user_id)
                )
            )
            ORDER BY last_message_at DESC NULLS LAST, external_user_id DESC
            LIMIT $7
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            backing_install_id,
            resolved_cursor_last_message_at,
            resolved_cursor_external_user_id,
            safe_limit + 1,
        )
        has_more = len(summary_rows) > safe_limit
        trimmed_summary_rows = summary_rows[:safe_limit]
        external_user_ids = []
        for row in trimmed_summary_rows:
            payload = dict(row)
            external_user_id = str(payload.get("external_user_id") or "").strip()
            if external_user_id:
                external_user_ids.append(external_user_id)
        memory_counts: Dict[str, int] = {}
        if external_user_ids:
            memory_rows = await connection.fetch(
                """
                SELECT external_user_id, COUNT(*)::int AS memory_entry_count
                FROM deployed_agent_conversation_memory
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND deployed_agent_id = $3
                  AND external_user_id = ANY($4::text[])
                GROUP BY external_user_id
                """,
                resolved_tenant_id,
                resolved_workspace_id,
                resolved_deployed_agent_id,
                external_user_ids,
            )
            for row in memory_rows:
                payload = dict(row)
                external_user_id = str(payload.get("external_user_id") or "").strip()
                if not external_user_id:
                    continue
                memory_counts[external_user_id] = int(payload.get("memory_entry_count") or 0)
        message_rows = []
        if external_user_ids:
            message_rows = await connection.fetch(
                """
                WITH ranked_messages AS (
                    SELECT
                        id,
                        channel_key,
                        created_at,
                        direction,
                        COALESCE(
                            NULLIF(BTRIM(actor->>'id'), ''),
                            NULLIF(BTRIM(payload->>'external_user_id'), ''),
                            NULLIF(BTRIM(metadata->>'external_user_id'), ''),
                            NULLIF(BTRIM(session_key), '')
                        ) AS external_user_key,
                        COALESCE(
                            NULLIF(BTRIM(text), ''),
                            NULLIF(BTRIM(payload->>'text'), ''),
                            NULLIF(BTRIM(payload->>'summary'), ''),
                            NULLIF(BTRIM(payload->>'message'), '')
                        ) AS content_text,
                        ROW_NUMBER() OVER (
                            PARTITION BY COALESCE(
                                NULLIF(BTRIM(actor->>'id'), ''),
                                NULLIF(BTRIM(payload->>'external_user_id'), ''),
                                NULLIF(BTRIM(metadata->>'external_user_id'), ''),
                                NULLIF(BTRIM(session_key), '')
                            )
                            ORDER BY created_at DESC, id DESC
                        ) AS row_number
                    FROM agent_channel_events
                    WHERE tenant_id = $1
                      AND workspace_id = $2
                      AND event_type = 'message'
                      AND (
                        COALESCE(metadata->>'deployed_agent_id', '') = $3
                        OR responder_install_id = $4
                      )
                      AND COALESCE(
                            NULLIF(BTRIM(actor->>'id'), ''),
                            NULLIF(BTRIM(payload->>'external_user_id'), ''),
                            NULLIF(BTRIM(metadata->>'external_user_id'), ''),
                            NULLIF(BTRIM(session_key), '')
                          ) = ANY($5::text[])
                )
                SELECT *
                FROM ranked_messages
                WHERE row_number <= 5
                ORDER BY external_user_key ASC, created_at DESC, id DESC
                """,
                resolved_tenant_id,
                resolved_workspace_id,
                resolved_deployed_agent_id,
                backing_install_id,
                external_user_ids,
            )
        messages_by_user: Dict[str, List[Dict[str, Any]]] = {}
        for row in message_rows:
            payload = dict(row)
            external_user_id = str(payload.get("external_user_key") or "").strip()
            if not external_user_id:
                continue
            messages_by_user.setdefault(external_user_id, []).append(
                {
                    "id": str(payload.get("id") or "").strip() or None,
                    "role": "user" if str(payload.get("direction") or "").strip().lower() == "inbound" else "agent",
                    "content": str(payload.get("content_text") or "").strip(),
                    "created_at": _iso(payload.get("created_at")),
                    "channel": str(payload.get("channel_key") or "").strip().lower() or None,
                }
            )
        user_rows = []
        for row in trimmed_summary_rows:
            payload = dict(row)
            external_user_id = str(payload.get("external_user_id") or "").strip()
            user_rows.append(
                {
                    "external_user_id": external_user_id or None,
                    "last_message_at": _iso(payload.get("last_message_at")),
                    "total_message_count": int(payload.get("total_message_count") or 0),
                    "memory_entry_count": memory_counts.get(external_user_id, 0),
                    "last_5_messages": messages_by_user.get(external_user_id, []),
                }
            )
        common_question_rows = await connection.fetch(
            """
            WITH inbound_questions AS (
                SELECT
                    LOWER(
                        BTRIM(
                            REGEXP_REPLACE(
                                COALESCE(
                                    NULLIF(BTRIM(text), ''),
                                    NULLIF(BTRIM(payload->>'text'), ''),
                                    NULLIF(BTRIM(payload->>'summary'), ''),
                                    NULLIF(BTRIM(payload->>'message'), '')
                                ),
                    '\\s+',
                                ' ',
                                'g'
                            )
                        )
                    ) AS normalized_question,
                    MIN(
                        BTRIM(
                            COALESCE(
                                NULLIF(text, ''),
                                NULLIF(payload->>'text', ''),
                                NULLIF(payload->>'summary', ''),
                                NULLIF(payload->>'message', '')
                            )
                        )
                    ) AS sample_question,
                    COUNT(*)::int AS question_count
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND direction = 'inbound'
                  AND event_type = 'message'
                  AND created_at >= $3::timestamptz
                  AND created_at < $4::timestamptz
                  AND (
                    COALESCE(metadata->>'deployed_agent_id', '') = $5
                    OR responder_install_id = $6
                  )
                GROUP BY normalized_question
            )
            SELECT sample_question, question_count
            FROM inbound_questions
            WHERE COALESCE(normalized_question, '') <> ''
            ORDER BY question_count DESC, sample_question ASC
            LIMIT 5
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            month_start,
            month_end,
            resolved_deployed_agent_id,
            backing_install_id,
        )
    next_cursor_last_message_at: Optional[str] = None
    next_cursor_external_user_id: Optional[str] = None
    if has_more and trimmed_summary_rows:
        final_row = dict(trimmed_summary_rows[-1])
        next_cursor_last_message_at = _iso(final_row.get("last_message_at"))
        token = str(final_row.get("external_user_id") or "").strip()
        next_cursor_external_user_id = token or None
    stats_payload = dict(stats_row) if stats_row is not None else {}
    specialist_stats_payload = dict(specialist_stats_row) if specialist_stats_row is not None else {}
    total_users = int(stats_payload.get("total_users") or 0)
    return {
        "deployed_agent_id": resolved_deployed_agent_id,
        "total_users": total_users,
        "messages_today": int(specialist_stats_payload.get("messages_today") or 0),
        "messages_this_calendar_month": int(stats_payload.get("messages_this_calendar_month") or 0),
        "orders_today": int(specialist_stats_payload.get("orders_today") or 0),
        "revenue_today_usd": float(specialist_stats_payload.get("revenue_today_usd") or 0.0),
        "users_at_limit_today": int(stats_payload.get("users_at_limit_today") or 0),
        "upgrade_clicks_this_month": int(stats_payload.get("upgrade_clicks_this_month") or 0),
        "common_questions": [
            {
                "question": str(dict(row).get("sample_question") or "").strip(),
                "count": int(dict(row).get("question_count") or 0),
            }
            for row in list(common_question_rows or [])
            if str(dict(row).get("sample_question") or "").strip()
        ],
        "user_rows": user_rows,
        "limit": safe_limit,
        "offset": max(0, int(offset or 0)),
        "has_more": has_more if total_users > 0 else False,
        "next_cursor_last_message_at": next_cursor_last_message_at,
        "next_cursor_external_user_id": next_cursor_external_user_id,
    }


async def list_public_deployed_agents(
    *,
    category: Optional[str] = None,
    cost_tier: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 100), 200))
    safe_offset = max(0, int(offset or 0))
    resolved_category = str(category or "").strip().lower()
    resolved_cost_tier = str(cost_tier or "").strip().lower()
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            SELECT *
            FROM deployed_agents
            WHERE is_public = TRUE
              AND deployment_state = 'live'
              AND ($1 = '' OR LOWER(COALESCE(category, '')) = $1)
              AND ($2 = '' OR cost_tier = $2)
            ORDER BY
              quality_stars DESC NULLS LAST,
              updated_at DESC,
              id DESC
            LIMIT $3 OFFSET $4
            """,
            resolved_category,
            resolved_cost_tier,
            safe_limit,
            safe_offset,
        )
    items: List[Dict[str, Any]] = []
    for row in rows:
        deployed_agent = _row_to_deployed_agent(row)
        if not isinstance(deployed_agent, dict):
            continue
        telegram_binding = _decode_json_object(_decode_json_object(deployed_agent.get("channels")).get("telegram"))
        metadata = _decode_json_object(deployed_agent.get("metadata"))
        bot_username = (
            str(telegram_binding.get("bot_username") or "").strip()
            or str(metadata.get("telegram_bot_username") or "").strip()
            or None
        )
        items.append(
            {
                "id": deployed_agent.get("id"),
                "name": deployed_agent.get("name"),
                "description": deployed_agent.get("persona"),
                "category": deployed_agent.get("category"),
                "quality_stars": deployed_agent.get("quality_stars"),
                "cost_tier": deployed_agent.get("cost_tier"),
                "telegram_bot_username": bot_username,
            }
        )
    return items


async def record_deployed_agent_upgrade_click(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    acquisition_touch_id: Optional[str],
    channel_key: str,
    external_user_id: str,
    source: Optional[str],
    attribution_token_hash: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = _require_scope_token(deployed_agent_id, "deployed_agent_id")
    resolved_channel_key = _require_scope_token(channel_key, "channel_key").lower()
    resolved_external_user_id = _require_scope_token(external_user_id, "external_user_id")
    resolved_token_hash = _require_scope_token(attribution_token_hash, "attribution_token_hash")
    resolved_touch_id = str(acquisition_touch_id or "").strip() or None
    resolved_source = str(source or "").strip().lower()
    event_id = f"dagent_click_{uuid.uuid4().hex[:16]}"
    now_ts = _utc_now_ts()
    duplicate = False
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return {
                "recorded": False,
                "duplicate": False,
            }
        inserted = await connection.fetchrow(
            """
            INSERT INTO deployed_agent_upgrade_click_events (
                id, tenant_id, workspace_id, deployed_agent_id, acquisition_touch_id,
                channel_key, external_user_id, source, attribution_token_hash, clicked_at,
                metadata, created_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10::timestamptz,
                $11::jsonb, $10::timestamptz
            )
            ON CONFLICT (attribution_token_hash)
            DO NOTHING
            RETURNING id
            """,
            event_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_touch_id,
            resolved_channel_key,
            resolved_external_user_id,
            resolved_source,
            resolved_token_hash,
            now_ts,
            _to_json(metadata, default={}),
        )
        duplicate = inserted is None
        if inserted is not None and resolved_touch_id:
            await connection.execute(
                """
                UPDATE channel_user_acquisition_touches
                SET
                    limit_hit_click_at = $4::timestamptz,
                    limit_hit_click_source = COALESCE(NULLIF($5, ''), limit_hit_click_source),
                    updated_at = $4::timestamptz
                WHERE id = $1
                  AND tenant_id = $2
                  AND workspace_id = $3
                """,
                resolved_touch_id,
                resolved_tenant_id,
                resolved_workspace_id,
                now_ts,
                resolved_source,
            )
    return {
        "recorded": True,
        "duplicate": duplicate,
        "clicked_at": now_ts.isoformat().replace("+00:00", "Z"),
        "deployed_agent_id": resolved_deployed_agent_id,
    }


async def list_deployed_agents_for_workspace(
    owner_workspace_id: str,
    *,
    tenant_id: Optional[str] = None,
    deployment_state: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    resolved_workspace_id = str(owner_workspace_id or "").strip()
    if not resolved_workspace_id:
        return []
    scoped_kwargs: Dict[str, Any] = {"bypass_rls": True}
    if tenant_id is not None:
        scoped_kwargs = {
            "tenant_id": str(tenant_id or "").strip(),
            "workspace_id": resolved_workspace_id,
        }
    async with _scoped_connection(**scoped_kwargs) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            SELECT *
            FROM deployed_agents
            WHERE owner_workspace_id = $1
              AND ($2 = '' OR tenant_id = $2)
              AND ($3 = '' OR deployment_state = $3)
            ORDER BY created_at DESC, id DESC
            LIMIT $4
            """,
            resolved_workspace_id,
            str(tenant_id or "").strip(),
            str(deployment_state or "").strip().lower(),
            max(1, int(limit)),
        )
    return [item for item in (_row_to_deployed_agent(row) for row in rows) if item]


async def list_platform_deployed_agents(
    *,
    deployment_state: Optional[str] = None,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            SELECT *
            FROM deployed_agents
            WHERE ($1 = '' OR deployment_state = $1)
            ORDER BY created_at DESC, id DESC
            LIMIT $2
            """,
            str(deployment_state or "").strip().lower(),
            max(1, int(limit)),
        )
    return [item for item in (_row_to_deployed_agent(row) for row in rows) if item]


async def list_platform_deployed_agent_monthly_cost_ledger_entries(
    *,
    usage_month: Optional[Any] = None,
    limit: int = 5000,
) -> List[Dict[str, Any]]:
    resolved_usage_month = _coerce_month_start_date(usage_month)
    if usage_month is not None and resolved_usage_month is None:
        raise ValueError("usage_month must be an ISO date string or date value.")
    resolved_usage_month = resolved_usage_month or datetime.now(timezone.utc).date().replace(day=1)
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            SELECT *
            FROM deployed_agent_monthly_cost_ledger
            WHERE ($1 = '' OR usage_month = $1::date)
            ORDER BY estimated_cost_usd DESC, updated_at DESC, id DESC
            LIMIT $2
            """,
            resolved_usage_month,
            max(1, int(limit)),
        )
    return [item for item in (_row_to_deployed_agent_monthly_cost_ledger_entry(row) for row in rows) if item]


async def update_deployed_agent(
    deployed_agent_id: str,
    *,
    tenant_id: str,
    owner_workspace_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    resolved_id = str(deployed_agent_id or "").strip()
    resolved_tenant_id = str(tenant_id or "").strip()
    resolved_workspace_id = str(owner_workspace_id or "").strip()
    if not resolved_id or not resolved_tenant_id or not resolved_workspace_id:
        return None
    allowed_columns = {
        "name": "name",
        "avatar": "avatar",
        "persona": "persona",
        "system_prompt": "system_prompt",
        "deployment_state": "deployment_state",
        "channels": "channels",
        "knowledge_sources": "knowledge_sources",
        "runtime_target": "runtime_target",
        "billing_plan": "billing_plan",
        "is_public": "is_public",
        "quality_stars": "quality_stars",
        "cost_tier": "cost_tier",
        "category": "category",
        "metadata": "metadata",
        "operational_state": "operational_state",
        "last_deployed_at": "last_deployed_at",
        "last_paused_at": "last_paused_at",
    }
    params: List[Any] = [resolved_id, resolved_tenant_id, resolved_workspace_id]
    set_clauses: List[str] = []
    parameter_index = 4
    for key, column in allowed_columns.items():
        if key not in updates:
            continue
        value = updates.get(key)
        if key in {"channels", "metadata", "operational_state"}:
            set_clauses.append(f"{column} = ${parameter_index}::jsonb")
            params.append(_to_json(value, default={}))
        elif key == "knowledge_sources":
            set_clauses.append(f"{column} = ${parameter_index}::jsonb")
            params.append(_to_json(value, default=[]))
        elif key in {"last_deployed_at", "last_paused_at"}:
            set_clauses.append(f"{column} = ${parameter_index}::timestamptz")
            params.append(_coerce_timestamptz(value))
        else:
            set_clauses.append(f"{column} = ${parameter_index}")
            params.append(value)
        parameter_index += 1
    if not set_clauses:
        return await get_deployed_agent_by_id(
            resolved_id,
            tenant_id=resolved_tenant_id,
            owner_workspace_id=resolved_workspace_id,
        )
    set_clauses.append("updated_at = NOW()")
    query = f"""
        UPDATE deployed_agents
        SET {", ".join(set_clauses)}
        WHERE id = $1 AND tenant_id = $2 AND owner_workspace_id = $3
        RETURNING *
    """
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(query, *params)
    return _row_to_deployed_agent(row)


async def set_deployed_agent_state(
    deployed_agent_id: str,
    *,
    tenant_id: str,
    owner_workspace_id: str,
    deployment_state: str,
    last_deployed_at: Optional[Any] = None,
    last_paused_at: Optional[Any] = None,
    operational_state: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return await update_deployed_agent(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=owner_workspace_id,
        updates={
            "deployment_state": str(deployment_state or "").strip().lower() or "draft",
            **({"last_deployed_at": last_deployed_at} if last_deployed_at is not None else {}),
            **({"last_paused_at": last_paused_at} if last_paused_at is not None else {}),
            **({"operational_state": operational_state} if operational_state is not None else {}),
        },
    )


async def get_deployed_agent_by_backing_install_id(
    backing_install_id: str,
    *,
    tenant_id: Optional[str] = None,
    owner_workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_install_id = str(backing_install_id or "").strip()
    if not resolved_install_id:
        return None
    scoped_kwargs: Dict[str, Any] = {"bypass_rls": True}
    if tenant_id is not None and owner_workspace_id is not None:
        scoped_kwargs = {
            "tenant_id": str(tenant_id or "").strip(),
            "workspace_id": str(owner_workspace_id or "").strip(),
        }
    async with _scoped_connection(**scoped_kwargs) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM deployed_agents
            WHERE backing_install_id = $1
              AND ($2 = '' OR tenant_id = $2)
              AND ($3 = '' OR owner_workspace_id = $3)
            LIMIT 1
            """,
            resolved_install_id,
            str(tenant_id or "").strip(),
            str(owner_workspace_id or "").strip(),
        )
    return _row_to_deployed_agent(row)


async def create_agent_trace(
    *,
    tenant_id: str,
    workspace_id: str,
    root_agent_id: str,
    surface: str,
    thread_id: Optional[str] = None,
    run_id: Optional[str] = None,
    runtime_target: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    started_at: Optional[Any] = None,
    trace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_root_agent_id = str(root_agent_id or "").strip()
    resolved_surface = str(surface or "").strip().lower()
    if not resolved_root_agent_id or not resolved_surface:
        return None
    resolved_trace_id = str(trace_id or f"trace_{uuid.uuid4().hex[:24]}").strip()
    resolved_started_at = _coerce_timestamptz(started_at) or _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO agent_traces (
                id, tenant_id, workspace_id, thread_id, run_id, root_agent_id, surface,
                runtime_target, provider, model, started_at, finished_at, outcome, final_message_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11::timestamptz, NULL, NULL, NULL
            )
            RETURNING *
            """,
            resolved_trace_id,
            resolved_tenant_id,
            resolved_workspace_id,
            str(thread_id or "").strip() or None,
            str(run_id or "").strip() or None,
            resolved_root_agent_id,
            resolved_surface,
            str(runtime_target or "").strip(),
            str(provider or "").strip(),
            str(model or "").strip(),
            resolved_started_at,
        )
    return _row_to_agent_trace(row)


async def append_agent_trace_event(
    *,
    trace_id: str,
    tenant_id: str,
    workspace_id: str,
    seq: int,
    event_type: str,
    persisted: bool,
    agent_id: str,
    payload: Optional[Dict[str, Any]] = None,
    parent_id: Optional[str] = None,
    item_id: Optional[str] = None,
    tool_call_id: Optional[str] = None,
    child_run_id: Optional[str] = None,
    approval_id: Optional[str] = None,
    artifact_id: Optional[str] = None,
    ts: Optional[Any] = None,
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_trace_id = str(trace_id or "").strip()
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_event_type = str(event_type or "").strip()
    resolved_agent_id = str(agent_id or "").strip()
    if not resolved_trace_id or seq <= 0 or not resolved_event_type or not resolved_agent_id:
        return None
    resolved_event_id = str(event_id or f"tevent_{uuid.uuid4().hex[:24]}").strip()
    resolved_ts = _coerce_timestamptz(ts) or _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO agent_trace_events (
                id, trace_id, seq, parent_id, ts, event_type, persisted, agent_id,
                item_id, tool_call_id, child_run_id, approval_id, artifact_id, payload
            ) VALUES (
                $1, $2, $3, $4, $5::timestamptz, $6, $7, $8,
                $9, $10, $11, $12, $13, $14::jsonb
            )
            RETURNING *
            """,
            resolved_event_id,
            resolved_trace_id,
            int(seq),
            str(parent_id or "").strip() or None,
            resolved_ts,
            resolved_event_type,
            bool(persisted),
            resolved_agent_id,
            str(item_id or "").strip() or None,
            str(tool_call_id or "").strip() or None,
            str(child_run_id or "").strip() or None,
            str(approval_id or "").strip() or None,
            str(artifact_id or "").strip() or None,
            _to_json(payload, default={}),
        )
    return _row_to_agent_trace_event(row)


async def get_agent_trace_by_id(
    trace_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_trace_id = str(trace_id or "").strip()
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    if not resolved_trace_id:
        return None
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM agent_traces
            WHERE id = $1
              AND tenant_id = $2
              AND workspace_id = $3
            LIMIT 1
            """,
            resolved_trace_id,
            resolved_tenant_id,
            resolved_workspace_id,
        )
    return _row_to_agent_trace(row)


async def get_agent_trace_events(
    trace_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    persisted_only: bool = False,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    resolved_trace_id = str(trace_id or "").strip()
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    if not resolved_trace_id:
        return []
    params: List[Any] = [resolved_trace_id, resolved_tenant_id, resolved_workspace_id]
    conditions = [
        "events.trace_id = $1",
        "traces.tenant_id = $2",
        "traces.workspace_id = $3",
    ]
    if persisted_only:
        conditions.append("events.persisted = TRUE")
    params.append(max(1, int(limit or 1000)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT events.*
            FROM agent_trace_events AS events
            JOIN agent_traces AS traces ON traces.id = events.trace_id
            WHERE {' AND '.join(conditions)}
            ORDER BY events.seq ASC, events.ts ASC, events.id ASC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [item for item in (_row_to_agent_trace_event(row) for row in rows) if item]


async def finish_agent_trace(
    trace_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    outcome: str,
    final_message_id: Optional[str] = None,
    finished_at: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    resolved_trace_id = str(trace_id or "").strip()
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_outcome = str(outcome or "").strip().lower()
    if not resolved_trace_id or not resolved_outcome:
        return None
    resolved_finished_at = _coerce_timestamptz(finished_at) or _utc_now_ts()
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            UPDATE agent_traces
            SET outcome = $4,
                final_message_id = $5,
                finished_at = $6::timestamptz
            WHERE id = $1
              AND tenant_id = $2
              AND workspace_id = $3
            RETURNING *
            """,
            resolved_trace_id,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_outcome,
            str(final_message_id or "").strip() or None,
            resolved_finished_at,
        )
    return _row_to_agent_trace(row)


async def list_agent_traces(
    *,
    tenant_id: str,
    workspace_id: str,
    thread_id: Optional[str] = None,
    run_id: Optional[str] = None,
    surface: Optional[str] = None,
    outcome: Optional[str] = None,
    root_agent_id: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    params: List[Any] = [resolved_tenant_id, resolved_workspace_id]
    conditions = ["tenant_id = $1", "workspace_id = $2"]
    if thread_id:
        params.append(str(thread_id or "").strip())
        conditions.append(f"thread_id = ${len(params)}")
    if run_id:
        params.append(str(run_id or "").strip())
        conditions.append(f"run_id = ${len(params)}")
    if surface:
        params.append(str(surface or "").strip().lower())
        conditions.append(f"surface = ${len(params)}")
    if outcome:
        params.append(str(outcome or "").strip().lower())
        conditions.append(f"outcome = ${len(params)}")
    if root_agent_id:
        params.append(str(root_agent_id or "").strip())
        conditions.append(f"root_agent_id = ${len(params)}")
    params.append(max(1, int(limit or 100)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM agent_traces
            WHERE {' AND '.join(conditions)}
            ORDER BY started_at DESC, id DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [item for item in (_row_to_agent_trace(row) for row in rows) if item]


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
                    _upsert_local_workspace_registry(
                        fallback,
                        workspace_id=resolved_workspace_id,
                        tenant_id=resolved_tenant_id,
                        workspace_type="shared",
                        created_at_ts=created_at_ts,
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


def _local_agent_thread_key(tenant_id: str, workspace_id: str, thread_id: str) -> tuple[str, str, str]:
    return (
        _require_scope_token(tenant_id, "tenant_id"),
        _require_scope_token(workspace_id, "workspace_id"),
        str(thread_id or "").strip(),
    )


def _clone_local_agent_thread(record: Dict[str, Any], *, include_turns: bool = False) -> Dict[str, Any]:
    payload = dict(record)
    key = _local_agent_thread_key(
        str(payload.get("tenant_id") or ""),
        str(payload.get("workspace_id") or ""),
        str(payload.get("id") or ""),
    )
    if include_turns:
        payload["turns"] = [dict(item) for item in _LOCAL_AGENT_TURNS.get(key, [])]
    return payload


def _local_ensure_agent_thread(
    *,
    thread_id: str,
    tenant_id: str,
    workspace_id: str,
    owner_user_id: Optional[str],
    master_agent_install_id: Optional[str],
    channel: str,
    title: Optional[str],
    metadata: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    token = str(thread_id or "").strip()
    if not token:
        return None
    key = _local_agent_thread_key(tenant_id, workspace_id, token)
    now = _utc_now_iso()
    with _LOCAL_AGENT_THREAD_LOCK:
        existing = _LOCAL_AGENT_THREADS.get(key)
        next_metadata = _decode_json_object(existing.get("metadata") if existing else None)
        next_metadata.update(_coerce_dict(metadata))
        if existing is None:
            record = {
                "id": token,
                "tenant_id": key[0],
                "workspace_id": key[1],
                "owner_user_id": str(owner_user_id or "").strip() or None,
                "master_agent_install_id": str(master_agent_install_id or "").strip() or None,
                "channel": str(channel or "web").strip() or "web",
                "title": str(title or "").strip() or "New chat",
                "status": "active",
                "metadata": next_metadata,
                "created_at": now,
                "updated_at": now,
                "last_turn_at": None,
            }
            _LOCAL_AGENT_THREADS[key] = record
        else:
            existing["tenant_id"] = key[0]
            existing["workspace_id"] = key[1]
            existing["owner_user_id"] = str(owner_user_id or "").strip() or existing.get("owner_user_id") or None
            existing["master_agent_install_id"] = (
                str(master_agent_install_id or "").strip() or existing.get("master_agent_install_id") or None
            )
            existing["channel"] = str(channel or "web").strip() or "web"
            if str(existing.get("title") or "").strip() == "New chat":
                existing["title"] = str(title or "").strip() or "New chat"
            existing["metadata"] = next_metadata
            existing["updated_at"] = now
        return _clone_local_agent_thread(_LOCAL_AGENT_THREADS[key], include_turns=False)


def _local_upsert_agent_turn(
    *,
    tenant_id: str,
    workspace_id: str,
    thread_id: str,
    session_id: Optional[str],
    role: str,
    content: str,
    actor: Optional[Dict[str, Any]],
    active_agent_install_id: Optional[str],
    runtime_profile_id: Optional[str],
    status: str,
    run_id: Optional[str],
    approvals: Optional[List[Dict[str, Any]]],
    interventions: Optional[List[Dict[str, Any]]],
    metadata: Optional[Dict[str, Any]],
    request_id: Optional[str],
    turn_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    key = _local_agent_thread_key(tenant_id, workspace_id, thread_id)
    now = _utc_now_iso()
    resolved_role = str(role or "assistant").strip().lower() or "assistant"
    resolved_request_id = str(request_id or "").strip() or None
    with _LOCAL_AGENT_THREAD_LOCK:
        if key not in _LOCAL_AGENT_THREADS:
            _local_ensure_agent_thread(
                thread_id=key[2],
                tenant_id=key[0],
                workspace_id=key[1],
                owner_user_id=None,
                master_agent_install_id=None,
                channel="web",
                title=build_default_thread_title(content),
                metadata={"source": "local_agent_thread_fallback"},
            )
        turns = _LOCAL_AGENT_TURNS.setdefault(key, [])
        existing_turn = None
        if resolved_request_id:
            existing_turn = next(
                (
                    item
                    for item in turns
                    if str(item.get("request_id") or "") == resolved_request_id
                    and str(item.get("role") or "").lower() == resolved_role
                ),
                None,
            )
        if existing_turn is None:
            turn_record = {
                "id": str(turn_id or uuid.uuid4()).strip() or str(uuid.uuid4()),
                "tenant_id": key[0],
                "workspace_id": key[1],
                "thread_id": key[2],
                "session_id": str(session_id or "").strip() or None,
                "request_id": resolved_request_id,
                "role": resolved_role,
                "status": str(status or "completed").strip().lower() or "completed",
                "content": str(content or ""),
                "run_id": str(run_id or "").strip() or None,
                "actor": _coerce_dict(actor),
                "active_agent_install_id": str(active_agent_install_id or "").strip() or None,
                "runtime_profile_id": str(runtime_profile_id or "").strip() or None,
                "approvals": list(approvals or []),
                "interventions": list(interventions or []),
                "metadata": _coerce_dict(metadata),
                "created_at": now,
                "updated_at": now,
            }
            turns.append(turn_record)
        else:
            existing_turn.update(
                {
                    "status": str(status or "completed").strip().lower() or "completed",
                    "content": str(content or ""),
                    "run_id": str(run_id or "").strip() or existing_turn.get("run_id") or None,
                    "actor": _coerce_dict(actor),
                    "active_agent_install_id": str(active_agent_install_id or "").strip()
                    or existing_turn.get("active_agent_install_id")
                    or None,
                    "runtime_profile_id": str(runtime_profile_id or "").strip()
                    or existing_turn.get("runtime_profile_id")
                    or None,
                    "approvals": list(approvals or []),
                    "interventions": list(interventions or []),
                    "metadata": {**_coerce_dict(existing_turn.get("metadata")), **_coerce_dict(metadata)},
                    "updated_at": now,
                }
            )
            turn_record = existing_turn
        thread_record = _LOCAL_AGENT_THREADS.get(key)
        if isinstance(thread_record, dict):
            thread_record["updated_at"] = now
            thread_record["last_turn_at"] = now
            if str(thread_record.get("title") or "") == "New chat" and resolved_role == "user":
                thread_record["title"] = build_default_thread_title(content)
        return {
            "thread": _clone_local_agent_thread(thread_record, include_turns=False) if thread_record else None,
            "turn": dict(turn_record),
        }


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
            return _local_ensure_agent_thread(
                thread_id=token,
                tenant_id=resolved_tenant_id,
                workspace_id=resolved_workspace_id,
                owner_user_id=owner_user_id,
                master_agent_install_id=master_agent_install_id,
                channel=channel,
                title=payload_title,
                metadata=metadata,
            )
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
            return _local_upsert_agent_turn(
                tenant_id=resolved_tenant_id,
                workspace_id=resolved_workspace_id,
                thread_id=resolved_thread_id,
                session_id=session_id,
                role=role,
                content=content,
                actor=actor,
                active_agent_install_id=active_agent_install_id,
                runtime_profile_id=runtime_profile_id,
                status=status,
                run_id=run_id,
                approvals=approvals,
                interventions=interventions,
                metadata=metadata,
                request_id=resolved_request_id,
                turn_id=resolved_turn_id,
            )
        turn_row = await connection.fetchrow(
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
            RETURNING *
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
        thread_row = await connection.fetchrow(
            """
            UPDATE agent_threads
            SET
                updated_at = $2::timestamptz,
                last_turn_at = $2::timestamptz,
                title = CASE
                    WHEN title = 'New chat' AND $3 <> '' AND $4 = 'user' THEN $3
                    ELSE title
                END
            WHERE id = $1 AND tenant_id = $5 AND workspace_id = $6
            RETURNING id, tenant_id, workspace_id, owner_user_id, master_agent_install_id, channel, title, status, metadata, created_at, updated_at, last_turn_at
            """,
            resolved_thread_id,
            now_ts,
            build_default_thread_title(content),
            str(role or "").strip().lower(),
            resolved_tenant_id,
            resolved_workspace_id,
        )
    return {
        "thread": dict(thread_row) if thread_row is not None else None,
        "turn": dict(turn_row) if turn_row is not None else None,
    }


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
            key = _local_agent_thread_key(tenant_id, workspace_id, thread_id)
            with _LOCAL_AGENT_THREAD_LOCK:
                rows = [dict(item) for item in _LOCAL_AGENT_TURNS.get(key, [])]
            if active_agent_install_id:
                resolved_install_id = str(active_agent_install_id or "").strip()
                rows = [
                    item
                    for item in rows
                    if str(item.get("active_agent_install_id") or "") in {"", resolved_install_id}
                ]
            return rows[: max(1, int(limit or 200))]
        resolved_install_id = str(active_agent_install_id or "").strip()
        if resolved_install_id:
            rows = await connection.fetch(
                """
                SELECT *
                FROM agent_turns
                WHERE thread_id = $1
                  AND tenant_id = $2
                  AND workspace_id = $3
                  AND (active_agent_install_id = $4 OR active_agent_install_id IS NULL OR active_agent_install_id = '')
                ORDER BY created_at ASC
                LIMIT $5
                """,
                str(thread_id or "").strip(),
                tenant_id,
                workspace_id,
                resolved_install_id,
                max(1, int(limit or 200)),
            )
        else:
            rows = await connection.fetch(
                """
                SELECT *
                FROM agent_turns
                WHERE thread_id = $1
                  AND tenant_id = $2
                  AND workspace_id = $3
                ORDER BY created_at ASC
                LIMIT $4
                """,
                str(thread_id or "").strip(),
                tenant_id,
                workspace_id,
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
            key = _local_agent_thread_key(tenant_id, workspace_id, thread_id)
            with _LOCAL_AGENT_THREAD_LOCK:
                record = _LOCAL_AGENT_THREADS.get(key)
                return _clone_local_agent_thread(record, include_turns=include_turns) if isinstance(record, dict) else None
        row = await connection.fetchrow(
            """
            SELECT id, tenant_id, workspace_id, owner_user_id, master_agent_install_id, channel, title, status, metadata, created_at, updated_at, last_turn_at
            FROM agent_threads
            WHERE id = $1
              AND tenant_id = $2
              AND workspace_id = $3
            LIMIT 1
            """,
            str(thread_id or "").strip(),
            tenant_id,
            workspace_id,
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
            with _LOCAL_AGENT_THREAD_LOCK:
                items = [
                    _clone_local_agent_thread(record, include_turns=include_turns)
                    for (tenant_key, workspace_key, _thread_key), record in _LOCAL_AGENT_THREADS.items()
                    if tenant_key == resolved_tenant_id
                    and workspace_key == resolved_workspace_id
                    and (not owner_user_id or str(record.get("owner_user_id") or "") == str(owner_user_id or "").strip())
                ]
            items.sort(
                key=lambda item: str(item.get("last_turn_at") or item.get("updated_at") or item.get("created_at") or ""),
                reverse=True,
            )
            return items[: max(1, int(limit or 50))]
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
    deployed_agent_id: Optional[str] = None,
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
    resolved_metadata = _decode_json_object(metadata)
    resolved_deployed_agent_id = str(deployed_agent_id or "").strip() or None
    if resolved_deployed_agent_id:
        resolved_metadata["deployed_agent_id"] = resolved_deployed_agent_id
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
            _to_json(resolved_metadata, default={}),
            str(status or "logged").strip().lower() or "logged",
            now_ts,
        )
    if row is None:
        return None
    item = _row_to_agent_channel_event(row) or {}
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
    since_created_at: Any = None,
    since_id: Optional[str] = None,
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
    resolved_since_created_at = _coerce_timestamptz(since_created_at)
    resolved_since_id = str(since_id or "").strip() or None
    if resolved_since_created_at is not None:
        params.append(resolved_since_created_at)
        since_index = len(params)
        if resolved_since_id:
            params.append(resolved_since_id)
            conditions.append(
                f"(created_at > ${since_index}::timestamptz OR "
                f"(created_at = ${since_index}::timestamptz AND id > ${len(params)}))"
            )
        else:
            conditions.append(f"created_at > ${since_index}::timestamptz")
    params.append(max(1, int(limit or 100)))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM activity_ledger_events
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC, id DESC
            LIMIT ${len(params)}
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def get_activity_ledger_event(
    *,
    tenant_id: str,
    workspace_id: str,
    event_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_event_id = str(event_id or "").strip()
    if not resolved_event_id:
        return None
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            SELECT *
            FROM activity_ledger_events
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND id = $3
            LIMIT 1
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_event_id,
        )
    return dict(row) if row is not None else None


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
    return [item for item in (_row_to_agent_channel_event(row) for row in rows) if item]


async def list_deployed_agent_conversation_sessions(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    backing_install_id: str,
    offset: int = 0,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = str(deployed_agent_id or "").strip()
    resolved_backing_install_id = str(backing_install_id or "").strip()
    if not resolved_deployed_agent_id or not resolved_backing_install_id:
        return []
    safe_offset = max(0, int(offset or 0))
    safe_limit = max(1, int(limit or 50))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            WITH filtered_events AS (
                SELECT *
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND COALESCE(session_key, '') <> ''
                  AND (
                    metadata->>'deployed_agent_id' = $3
                    OR responder_install_id = $4
                  )
            ),
            latest_event AS (
                SELECT DISTINCT ON (session_key)
                    session_key,
                    channel_key,
                    endpoint_key,
                    thread_id,
                    run_id,
                    text,
                    payload,
                    created_at,
                    id
                FROM filtered_events
                ORDER BY session_key, created_at DESC, id DESC
            ),
            latest_inbound AS (
                SELECT DISTINCT ON (session_key)
                    session_key,
                    actor
                FROM filtered_events
                WHERE direction = 'inbound'
                ORDER BY session_key, created_at DESC, id DESC
            )
            SELECT
                latest_event.session_key AS session_id,
                latest_event.channel_key AS channel,
                latest_event.endpoint_key AS endpoint_key,
                latest_event.thread_id AS thread_id,
                latest_event.run_id AS latest_run_id,
                COALESCE(
                    NULLIF(BTRIM(latest_event.text), ''),
                    NULLIF(BTRIM(latest_event.payload->>'text'), ''),
                    NULLIF(BTRIM(latest_event.payload->>'summary'), ''),
                    NULLIF(BTRIM(latest_event.payload->>'message'), '')
                ) AS last_message,
                latest_event.created_at AS last_message_at,
                COALESCE(latest_inbound.actor, '{}'::jsonb) AS customer_actor
            FROM latest_event
            LEFT JOIN latest_inbound USING (session_key)
            ORDER BY latest_event.created_at DESC, latest_event.session_key DESC
            LIMIT $5 OFFSET $6
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_backing_install_id,
            safe_limit,
            safe_offset,
        )
    return [item for item in (_row_to_deployed_agent_conversation_summary(row) for row in rows) if item]


async def list_deployed_agent_conversation_events(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    backing_install_id: str,
    session_id: str,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = str(deployed_agent_id or "").strip()
    resolved_backing_install_id = str(backing_install_id or "").strip()
    resolved_session_id = str(session_id or "").strip()
    if not resolved_deployed_agent_id or not resolved_backing_install_id or not resolved_session_id:
        return []
    safe_limit = max(1, int(limit or 500))
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            SELECT *
            FROM agent_channel_events
            WHERE tenant_id = $1
              AND workspace_id = $2
              AND session_key = $3
              AND (
                metadata->>'deployed_agent_id' = $4
                OR responder_install_id = $5
              )
            ORDER BY created_at ASC, id ASC
            LIMIT $6
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_session_id,
            resolved_deployed_agent_id,
            resolved_backing_install_id,
            safe_limit,
        )
    return [item for item in (_row_to_agent_channel_event(row) for row in rows) if item]


async def list_deployed_agent_session_analytics(
    *,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    backing_install_id: str,
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _require_scope_token(workspace_id, "workspace_id")
    resolved_deployed_agent_id = str(deployed_agent_id or "").strip()
    resolved_backing_install_id = str(backing_install_id or "").strip()
    if not resolved_deployed_agent_id or not resolved_backing_install_id:
        return []
    async with _scoped_connection(tenant_id=resolved_tenant_id, workspace_id=resolved_workspace_id) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            """
            WITH filtered_events AS (
                SELECT *
                FROM agent_channel_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND COALESCE(session_key, '') <> ''
                  AND (
                    COALESCE(metadata->>'deployed_agent_id', '') = $3
                    OR responder_install_id = $4
                  )
            ),
            latest_event AS (
                SELECT DISTINCT ON (session_key)
                    session_key,
                    run_id,
                    created_at
                FROM filtered_events
                ORDER BY session_key, created_at DESC, id DESC
            ),
            filtered_activity AS (
                SELECT *
                FROM activity_ledger_events
                WHERE tenant_id = $1
                  AND workspace_id = $2
                  AND install_id = $4
            ),
            session_activity AS (
                SELECT
                    latest_event.session_key,
                    latest_event.run_id,
                    latest_event.created_at AS latest_message_at,
                    activity.id,
                    activity.created_at,
                    activity.event_class,
                    activity.action,
                    activity.status,
                    activity.payload,
                    activity.metadata
                FROM latest_event
                LEFT JOIN filtered_activity AS activity
                  ON activity.session_key = latest_event.session_key
            ),
            rollups AS (
                SELECT
                    session_key,
                    run_id,
                    latest_message_at,
                    MAX(created_at) AS last_activity_at,
                    BOOL_OR(
                        COALESCE(event_class, '') = 'blocked_action'
                        OR COALESCE(event_class, '') = 'approval'
                        OR COALESCE(action, '') IN ('approval_requested', 'escalate', 'escalated')
                        OR COALESCE(
                            NULLIF(BTRIM(payload->>'resolution'), ''),
                            NULLIF(BTRIM(metadata->>'resolution'), '')
                        ) IN ('requested', 'escalated')
                        OR COALESCE(payload->>'escalated', 'false') = 'true'
                        OR COALESCE(metadata->>'escalated', 'false') = 'true'
                    ) AS had_escalation,
                    (ARRAY_REMOVE(
                        ARRAY_AGG(
                            CASE
                                WHEN COALESCE(event_class, '') = 'run_status'
                                  AND NULLIF(BTRIM(action), '') IS NOT NULL
                                THEN LOWER(action)
                                WHEN COALESCE(
                                    NULLIF(BTRIM(payload->>'resolution'), ''),
                                    NULLIF(BTRIM(metadata->>'resolution'), '')
                                ) IS NOT NULL
                                THEN LOWER(
                                    COALESCE(
                                        NULLIF(BTRIM(payload->>'resolution'), ''),
                                        NULLIF(BTRIM(metadata->>'resolution'), '')
                                    )
                                )
                                WHEN NULLIF(BTRIM(status), '') IS NOT NULL
                                THEN LOWER(status)
                                ELSE NULL
                            END
                            ORDER BY created_at DESC NULLS LAST, id DESC
                        ),
                        NULL
                    ))[1] AS latest_outcome
                FROM session_activity
                GROUP BY session_key, run_id, latest_message_at
            )
            SELECT
                session_key AS session_id,
                run_id AS latest_run_id,
                COALESCE(had_escalation, FALSE) AS had_escalation,
                NULLIF(BTRIM(COALESCE(latest_outcome, '')), '') AS latest_outcome,
                GREATEST(
                    COALESCE(last_activity_at, latest_message_at),
                    latest_message_at
                ) AS last_activity_at
            FROM rollups
            ORDER BY GREATEST(
                COALESCE(last_activity_at, latest_message_at),
                latest_message_at
            ) DESC NULLS LAST, session_key DESC
            """,
            resolved_tenant_id,
            resolved_workspace_id,
            resolved_deployed_agent_id,
            resolved_backing_install_id,
        )
    return [item for item in (_row_to_deployed_agent_session_analytics(row) for row in rows) if item]


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


def _normalize_governance_operation(value: Any) -> str:
    return str(value or "").strip().lower()


def _default_hold_blocked_operations() -> List[str]:
    return ["retention_delete", "workspace_delete", "tenant_delete"]


def _hold_blocks_operation(hold: Dict[str, Any], operation: str) -> bool:
    normalized_operation = _normalize_governance_operation(operation)
    if normalized_operation == "export":
        return False
    configured = [
        _normalize_governance_operation(item)
        for item in list(hold.get("blocked_operations") or [])
        if _normalize_governance_operation(item)
    ]
    blocked = configured or _default_hold_blocked_operations()
    if "*" in blocked:
        return True
    if normalized_operation in blocked:
        return True
    if normalized_operation.endswith("_delete") and "delete" in blocked:
        return True
    if normalized_operation == "retention_delete" and "retention" in blocked:
        return True
    return False


async def upsert_governance_hold(
    *,
    tenant_id: str,
    workspace_id: Optional[str] = None,
    scope_type: str,
    hold_key: str,
    reason: str,
    blocked_operations: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    hold_id: Optional[str] = None,
    status: str = "active",
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    normalized_scope_type = _normalize_governance_operation(scope_type)
    if normalized_scope_type not in {"tenant", "workspace"}:
        raise ValueError("scope_type must be 'tenant' or 'workspace'.")
    resolved_workspace_id = (
        _require_scope_token(workspace_id, "workspace_id") if normalized_scope_type == "workspace" else ""
    )
    scope_key = resolved_workspace_id if normalized_scope_type == "workspace" else resolved_tenant_id
    now_ts = _utc_now_ts()
    resolved_hold_id = str(hold_id or uuid.uuid4()).strip() or str(uuid.uuid4())
    normalized_hold_key = _require_scope_token(hold_key, "hold_key")
    normalized_status = _normalize_governance_operation(status) or "active"
    operations = [
        _normalize_governance_operation(item)
        for item in list(blocked_operations or [])
        if _normalize_governance_operation(item)
    ]
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            INSERT INTO governance_holds (
                id, tenant_id, workspace_id, scope_type, scope_key, hold_key, reason, blocked_operations, status, metadata, created_at, updated_at, released_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::timestamptz, $11::timestamptz, NULL
            )
            ON CONFLICT (scope_type, scope_key, hold_key)
            DO UPDATE SET
                reason = EXCLUDED.reason,
                blocked_operations = EXCLUDED.blocked_operations,
                status = EXCLUDED.status,
                metadata = governance_holds.metadata || EXCLUDED.metadata,
                workspace_id = EXCLUDED.workspace_id,
                updated_at = EXCLUDED.updated_at,
                released_at = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE governance_holds.released_at END
            RETURNING *
            """,
            resolved_hold_id,
            resolved_tenant_id,
            resolved_workspace_id,
            normalized_scope_type,
            scope_key,
            normalized_hold_key,
            str(reason or "").strip(),
            _to_json(operations, default=[]),
            normalized_status,
            _to_json(metadata, default={}),
            now_ts,
        )
    return dict(row) if row is not None else None


async def release_governance_hold(
    *,
    tenant_id: str,
    hold_key: str,
    scope_type: str,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    normalized_scope_type = _normalize_governance_operation(scope_type)
    resolved_workspace_id = (
        _require_scope_token(workspace_id, "workspace_id") if normalized_scope_type == "workspace" else ""
    )
    scope_key = resolved_workspace_id if normalized_scope_type == "workspace" else resolved_tenant_id
    now_ts = _utc_now_ts()
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return None
        row = await connection.fetchrow(
            """
            UPDATE governance_holds
            SET status = 'released', updated_at = $4::timestamptz, released_at = $4::timestamptz
            WHERE tenant_id = $1
              AND scope_type = $2
              AND scope_key = $3
              AND hold_key = $5
            RETURNING *
            """,
            resolved_tenant_id,
            normalized_scope_type,
            scope_key,
            now_ts,
            _require_scope_token(hold_key, "hold_key"),
        )
    return dict(row) if row is not None else None


async def list_governance_holds(
    *,
    tenant_id: str,
    workspace_id: Optional[str] = None,
    scope_type: Optional[str] = None,
    status: str = "active",
) -> List[Dict[str, Any]]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _normalize_scope_token(workspace_id)
    normalized_scope_type = _normalize_governance_operation(scope_type)
    normalized_status = _normalize_governance_operation(status)
    params: List[Any] = [resolved_tenant_id]
    conditions = ["tenant_id = $1"]
    if normalized_status:
        params.append(normalized_status)
        conditions.append(f"status = ${len(params)}")
    if resolved_workspace_id:
        params.append(resolved_workspace_id)
        conditions.append(
            f"((scope_type = 'tenant' AND scope_key = $1) OR (scope_type = 'workspace' AND workspace_id = ${len(params)}))"
        )
    elif normalized_scope_type:
        params.append(normalized_scope_type)
        conditions.append(f"scope_type = ${len(params)}")
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return []
        rows = await connection.fetch(
            f"""
            SELECT *
            FROM governance_holds
            WHERE {' AND '.join(conditions)}
            ORDER BY updated_at DESC, created_at DESC
            """,
            *params,
        )
    return [dict(row) for row in rows]


async def build_governance_scope_export(
    *,
    tenant_id: str,
    workspace_id: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _normalize_scope_token(workspace_id)
    async with _scoped_connection(bypass_rls=True) as connection:
        if connection is None:
            return {
                "tenant_id": resolved_tenant_id,
                "workspace_id": resolved_workspace_id or None,
                "counts": {},
            }
        row = await connection.fetchrow(
            """
            SELECT
                (SELECT COUNT(*) FROM workspaces WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS workspace_count,
                (SELECT COUNT(*) FROM workspace_memberships WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS membership_count,
                (SELECT COUNT(*) FROM agent_threads WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS thread_count,
                (SELECT COUNT(*) FROM agent_sessions WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS session_count,
                (SELECT COUNT(*) FROM agent_turns WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS turn_count,
                (SELECT COUNT(*) FROM workspace_agent_installs WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS install_count,
                (SELECT COUNT(*) FROM agent_channel_events WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS channel_event_count,
                (SELECT COUNT(*) FROM activity_ledger_events WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2)) AS activity_ledger_event_count,
                (SELECT COUNT(*) FROM governance_holds WHERE tenant_id = $1 AND ($2 = '' OR workspace_id = $2 OR scope_type = 'tenant')) AS governance_hold_count
            """,
            resolved_tenant_id,
            resolved_workspace_id,
        )
    counts = dict(row) if row is not None else {}
    return {
        "tenant_id": resolved_tenant_id,
        "workspace_id": resolved_workspace_id or None,
        "counts": counts,
    }


async def plan_governance_operation(
    *,
    tenant_id: str,
    workspace_id: Optional[str] = None,
    operation: str,
) -> Dict[str, Any]:
    resolved_tenant_id = _require_scope_token(tenant_id, "tenant_id")
    resolved_workspace_id = _normalize_scope_token(workspace_id)
    normalized_operation = _normalize_governance_operation(operation)
    if not normalized_operation:
        raise ValueError("operation is required.")
    export_scope = await build_governance_scope_export(
        tenant_id=resolved_tenant_id,
        workspace_id=resolved_workspace_id or None,
    )
    active_holds = await list_governance_holds(
        tenant_id=resolved_tenant_id,
        workspace_id=resolved_workspace_id or None,
    )
    blocking_holds = [hold for hold in active_holds if _hold_blocks_operation(hold, normalized_operation)]
    return {
        "tenant_id": resolved_tenant_id,
        "workspace_id": resolved_workspace_id or None,
        "operation": normalized_operation,
        "status": "blocked" if blocking_holds else "ready",
        "blocked": bool(blocking_holds),
        "blocking_hold_ids": [str(hold.get("id") or "").strip() for hold in blocking_holds if str(hold.get("id") or "").strip()],
        "blocking_hold_keys": [
            str(hold.get("hold_key") or "").strip()
            for hold in blocking_holds
            if str(hold.get("hold_key") or "").strip()
        ],
        "active_holds": active_holds,
        "export_scope": export_scope,
    }
