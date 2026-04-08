from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from server_modules import control_plane_repository


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_token(value: Any) -> Optional[str]:
    token = str(value or "").strip()
    return token or None


def _to_json(value: Any, *, default: Any) -> str:
    payload = value if value is not None else default
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


def _dict_json(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list_json(value: Any) -> List[Any]:
    return list(value) if isinstance(value, list) else []


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value).strip() or None


def _slugify(value: Any, *, fallback: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return normalized or fallback


def _row_to_runtime_profile(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "slug": str(payload.get("slug") or "").strip() or None,
        "label": str(payload.get("label") or "").strip() or None,
        "runtime_class": str(payload.get("runtime_class") or "").strip() or "cloud_worker",
        "placement_mode": str(payload.get("placement_mode") or "").strip() or "auto",
        "runtime_id": _normalize_token(payload.get("runtime_id")),
        "machine_id": _normalize_token(payload.get("machine_id")),
        "default_execution_target": str(payload.get("default_execution_target") or "").strip() or "auto",
        "supported_capabilities": _list_json(payload.get("supported_capabilities")),
        "root_folder_uri": _normalize_token(payload.get("root_folder_uri")),
        "allowed_connector_scopes": _list_json(payload.get("allowed_connector_scopes")),
        "status": str(payload.get("status") or "").strip() or "active",
        "last_seen_at": _iso(payload.get("last_seen_at")),
        "metadata": _dict_json(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
    }


def _row_to_workflow_snapshot(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    definition = _dict_json(payload.get("definition"))
    validation = _dict_json(payload.get("validation"))
    metadata = _dict_json(payload.get("metadata"))
    return {
        "id": str(payload.get("workflow_id") or payload.get("id") or "").strip(),
        "tenantId": str(payload.get("tenant_id") or "").strip() or None,
        "workspaceId": str(payload.get("workspace_id") or "").strip() or None,
        "name": str(payload.get("name") or "").strip() or "Compiled Agent Artifact",
        "description": str(payload.get("description") or "").strip(),
        "status": str(payload.get("workflow_status") or payload.get("status") or "").strip() or "compiled",
        "definition": definition,
        "validation": validation,
        "workflowVersionId": _normalize_token(payload.get("workflow_version_id")),
        "versionNumber": payload.get("version_number"),
        "metadata": metadata,
        "createdAt": _iso(payload.get("created_at")),
        "updatedAt": _iso(payload.get("updated_at")),
    }


def _row_to_agent_definition(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "slug": str(payload.get("slug") or "").strip() or None,
        "name": str(payload.get("name") or "").strip() or "Agent Template",
        "description": str(payload.get("description") or "").strip(),
        "agent_kind": str(payload.get("agent_kind") or "").strip() or "specialist",
        "visibility": str(payload.get("visibility") or "").strip() or "workspace",
        "status": str(payload.get("status") or "").strip() or "draft",
        "category": _normalize_token(payload.get("category")),
        "icon": _normalize_token(payload.get("icon")),
        "created_by_user_id": _normalize_token(payload.get("created_by_user_id")),
        "current_version_id": _normalize_token(payload.get("current_version_id")),
        "published_version_id": _normalize_token(payload.get("published_version_id")),
        "source_workflow_definition_id": _normalize_token(payload.get("source_workflow_definition_id")),
        "metadata": _dict_json(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
        "current_version": {
            "id": _normalize_token(payload.get("version_id")),
            "version_number": int(payload.get("version_number") or 1),
            "status": str(payload.get("version_status") or "").strip() or "draft",
            "manifest": _dict_json(payload.get("manifest")),
            "capability_manifest": _dict_json(payload.get("capability_manifest")),
            "memory_scope_manifest": _dict_json(payload.get("memory_scope_manifest")),
            "policy_manifest": _dict_json(payload.get("policy_manifest")),
            "placement_manifest": _dict_json(payload.get("placement_manifest")),
            "template_inputs_schema": _dict_json(payload.get("template_inputs_schema")),
            "metadata": _dict_json(payload.get("version_metadata")),
            "compiled_workflow_version_id": _normalize_token(payload.get("version_compiled_workflow_version_id")),
        },
    }


def _row_to_install_summary(row: Any) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    payload = dict(row)
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "agent_definition_id": str(payload.get("agent_definition_id") or "").strip() or None,
        "agent_definition_version_id": str(payload.get("agent_definition_version_id") or "").strip() or None,
        "installed_by_user_id": _normalize_token(payload.get("installed_by_user_id")),
        "install_scope": str(payload.get("install_scope") or "").strip() or "workspace",
        "owner_user_id": _normalize_token(payload.get("owner_user_id")),
        "thread_id": _normalize_token(payload.get("thread_id")),
        "label": _normalize_token(payload.get("label")),
        "status": str(payload.get("status") or "").strip() or "active",
        "enabled": bool(payload.get("enabled")),
        "runtime_profile_id": _normalize_token(payload.get("runtime_profile_id")),
        "compiled_workflow_version_id": _normalize_token(payload.get("compiled_workflow_version_id")),
        "compiled_workflow_id": _normalize_token(payload.get("compiled_workflow_id")),
        "root_folder_uri": _normalize_token(payload.get("root_folder_uri")),
        "tool_toggles": _dict_json(payload.get("tool_toggles")),
        "folder_grants": _list_json(payload.get("folder_grants")),
        "connector_bindings": _dict_json(payload.get("connector_bindings")),
        "memory_scope_overrides": _dict_json(payload.get("memory_scope_overrides")),
        "policy_context_overrides": _dict_json(payload.get("policy_context_overrides")),
        "metadata": _dict_json(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
        "agent_definition": {
            "id": str(payload.get("agent_definition_id") or "").strip(),
            "slug": _normalize_token(payload.get("agent_definition_slug")),
            "name": str(payload.get("agent_definition_name") or "").strip() or "Installed Agent",
            "description": str(payload.get("agent_definition_description") or "").strip(),
            "category": _normalize_token(payload.get("agent_definition_category")),
            "icon": _normalize_token(payload.get("agent_definition_icon")),
            "agent_kind": str(payload.get("agent_kind") or "").strip() or "specialist",
        },
        "agent_definition_version": {
            "id": _normalize_token(payload.get("agent_definition_version_id")),
            "version_number": int(payload.get("definition_version_number") or 1),
            "manifest": _dict_json(payload.get("manifest")),
            "capability_manifest": _dict_json(payload.get("capability_manifest")),
            "policy_manifest": _dict_json(payload.get("policy_manifest")),
            "placement_manifest": _dict_json(payload.get("placement_manifest")),
        },
        "runtime_profile": {
            "id": _normalize_token(payload.get("runtime_profile_id")),
            "slug": _normalize_token(payload.get("runtime_profile_slug")),
            "label": _normalize_token(payload.get("runtime_profile_label")),
            "runtime_class": str(payload.get("runtime_class") or "").strip() or "cloud_worker",
            "placement_mode": str(payload.get("placement_mode") or "").strip() or "auto",
            "runtime_id": _normalize_token(payload.get("runtime_id")),
            "machine_id": _normalize_token(payload.get("machine_id")),
            "default_execution_target": str(payload.get("default_execution_target") or "").strip() or "auto",
            "status": str(payload.get("runtime_profile_status") or "").strip() or "active",
        } if payload.get("runtime_profile_id") else None,
    }


DEFAULT_AGENT_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "slug": "primal",
        "name": "Primal",
        "description": "The execution specialist for code, shell orchestration, and governed desktop control.",
        "category": "Execution",
        "icon": "terminal-square",
        "agent_kind": "specialist",
        "visibility": "workspace",
        "manifest": {
            "template_kind": "generic_operator",
            "outcome_pack": "generic_operator",
            "default_prompt": "You are Primal, the execution specialist. Carry out code, shell, and desktop tasks precisely within the granted policy envelope.",
        },
        "capability_manifest": {
            "summary": ["code_execution", "shell.execute", "computer_control", "file_access"],
            "toggles": [
                {"id": "code_execution", "label": "Code Execution", "description": "Run generated code or structured automation logic.", "default_enabled": True},
                {"id": "shell.execute", "label": "Shell Commands", "description": "Run governed local shell commands when approved.", "default_enabled": True},
                {"id": "computer_control", "label": "Rust Desktop Control", "description": "Operate the local desktop through the supervisor harness.", "default_enabled": True},
                {"id": "file_access", "label": "File Access", "description": "Read and modify files inside granted folders.", "default_enabled": True},
            ],
        },
        "policy_manifest": {"trust_mode": "guarded", "interactive_approvals": True},
        "placement_manifest": {"preferred_runtime_slug": "my-local-mac", "allowed_runtime_classes": ["cloud_worker", "desktop_companion"]},
    },
    {
        "slug": "orbit",
        "name": "Orbit",
        "description": "The connector specialist for email, live research, external systems, and network-facing tasks.",
        "category": "Connectors",
        "icon": "globe",
        "agent_kind": "specialist",
        "visibility": "workspace",
        "manifest": {
            "template_kind": "generic_operator",
            "outcome_pack": "generic_operator",
            "default_prompt": "You are Orbit, the connector specialist. Handle communications, research, and network-facing coordination with clear evidence.",
        },
        "capability_manifest": {
            "summary": ["email", "web_search", "external_api", "networking"],
            "toggles": [
                {"id": "email", "label": "Email", "description": "Draft and route communications through approved mail connectors.", "default_enabled": True},
                {"id": "web_search", "label": "Web Research", "description": "Search and synthesize live information.", "default_enabled": True},
                {"id": "external_api", "label": "External API", "description": "Use approved connectors and external services.", "default_enabled": True},
                {"id": "networking", "label": "Networking", "description": "Reach out, coordinate, and manage external follow-through.", "default_enabled": True},
            ],
        },
        "policy_manifest": {"trust_mode": "guarded", "interactive_approvals": True},
        "placement_manifest": {"preferred_runtime_slug": "empyralis-cloud", "allowed_runtime_classes": ["cloud_worker", "desktop_companion"]},
    },
    {
        "slug": "atlas",
        "name": "Atlas",
        "description": "The librarian specialist for ingestion, vector memory, parsing, and structured knowledge synthesis.",
        "category": "Memory",
        "icon": "library",
        "agent_kind": "specialist",
        "visibility": "workspace",
        "manifest": {
            "template_kind": "generic_operator",
            "outcome_pack": "generic_operator",
            "default_prompt": "You are Atlas, the librarian specialist. Ingest, organize, parse, and retrieve knowledge with high precision.",
        },
        "capability_manifest": {
            "summary": ["file_ingestion", "vector_memory", "data_parsing", "health_data"],
            "toggles": [
                {"id": "file_ingestion", "label": "File Ingestion", "description": "Read and normalize documents from granted folders.", "default_enabled": True},
                {"id": "vector_memory", "label": "Vector Memory", "description": "Embed and retrieve semantic knowledge.", "default_enabled": True},
                {"id": "data_parsing", "label": "Data Parsing", "description": "Parse structured and semi-structured datasets.", "default_enabled": True},
                {"id": "health_data", "label": "Health/Data Parsing", "description": "Interpret health and operational data cautiously.", "default_enabled": True},
            ],
        },
        "policy_manifest": {"trust_mode": "guarded", "interactive_approvals": True},
        "placement_manifest": {"preferred_runtime_slug": "empyralis-cloud", "allowed_runtime_classes": ["cloud_worker", "desktop_companion"]},
    },
    {
        "slug": "axis",
        "name": "Axis",
        "description": "The manager specialist for scheduling, durable runs, triggers, and background orchestration.",
        "category": "Automation",
        "icon": "calendar-clock",
        "agent_kind": "specialist",
        "visibility": "workspace",
        "manifest": {
            "template_kind": "generic_operator",
            "outcome_pack": "generic_operator",
            "default_prompt": "You are Axis, the manager specialist. Schedule work, supervise durable jobs, and keep background execution reliable.",
        },
        "capability_manifest": {
            "summary": ["scheduling", "durable_jobs", "background_runs", "workflow_triggers"],
            "toggles": [
                {"id": "scheduling", "label": "Scheduling", "description": "Define and manage recurring execution schedules.", "default_enabled": True},
                {"id": "durable_jobs", "label": "Durable Jobs", "description": "Run resilient background tasks and resumable work.", "default_enabled": True},
                {"id": "background_runs", "label": "Background Runs", "description": "Dispatch long-lived orchestrations without an open browser.", "default_enabled": True},
                {"id": "workflow_triggers", "label": "Workflow Triggers", "description": "Respond to time- and event-based triggers.", "default_enabled": True},
            ],
        },
        "policy_manifest": {"trust_mode": "guarded", "interactive_approvals": True},
        "placement_manifest": {"preferred_runtime_slug": "empyralis-cloud", "allowed_runtime_classes": ["cloud_worker"]},
    },
]

DEFAULT_MASTER_AGENT_DEFINITION: Dict[str, Any] = {
    "slug": "sage",
    "name": "Sage",
    "description": "The central Life OS orchestrator for this workspace. Sage owns the primary relationship, planning loop, delegation graph, and universal memory.",
    "category": "System",
    "icon": "sparkles",
    "agent_kind": "master",
    "visibility": "private",
    "manifest": {
        "template_kind": "master_orchestrator",
        "default_prompt": "You are Sage, the master agent for this workspace. Own the user relationship, maintain universal context, plan carefully, delegate to installed specialists, and stay inside policy.",
    },
    "capability_manifest": {
        "summary": ["planning", "delegation", "universal_memory"],
        "toggles": [
            {"id": "planning", "label": "Planning", "description": "Break goals into execution plans and choose the right specialist.", "default_enabled": True},
            {"id": "delegation", "label": "Delegation", "description": "Spawn and supervise specialist child runs.", "default_enabled": True},
            {"id": "universal_memory", "label": "Universal Memory", "description": "Maintain cross-agent context for the workspace.", "default_enabled": True},
        ],
    },
    "policy_manifest": {"trust_mode": "guarded", "interactive_approvals": True, "session_mode": "copilot"},
    "placement_manifest": {"preferred_runtime_slug": "empyralis-cloud", "allowed_runtime_classes": ["cloud_worker", "desktop_companion"]},
}


DEFAULT_RUNTIME_PROFILES: List[Dict[str, Any]] = [
    {
        "slug": "empyralis-cloud",
        "label": "Empyralis Cloud",
        "runtime_class": "cloud_worker",
        "placement_mode": "preferred",
        "default_execution_target": "cloud",
        "supported_capabilities": ["web_search", "external_api", "file_access"],
        "status": "active",
    },
    {
        "slug": "my-local-mac",
        "label": "My Local Mac",
        "runtime_class": "desktop_companion",
        "placement_mode": "preferred",
        "default_execution_target": "local_companion",
        "supported_capabilities": ["computer_control", "shell.execute", "file_access", "web_search"],
        "status": "active",
    },
]


def _default_tool_toggles_from_capabilities(capability_manifest: Dict[str, Any]) -> Dict[str, bool]:
    toggles = _list_json(capability_manifest.get("toggles"))
    out: Dict[str, bool] = {}
    for item in toggles:
        if not isinstance(item, dict):
            continue
        toggle_id = str(item.get("id") or "").strip()
        if not toggle_id:
            continue
        out[toggle_id] = bool(item.get("default_enabled"))
    return out


def build_master_thread_id(*, workspace_id: str, owner_user_id: Optional[str] = None) -> str:
    workspace_slug = _slugify(workspace_id, fallback="workspace")
    owner_slug = _slugify(owner_user_id, fallback="workspace-owner")
    return f"thread_sage_{workspace_slug}_{owner_slug}"


async def ensure_workspace_agent_registry_seeded(
    *,
    tenant_id: str,
    workspace_id: str,
    created_by_user_id: Optional[str] = None,
) -> None:
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return
    tenant_token = str(tenant_id or "").strip() or "default"
    workspace_token = str(workspace_id or "").strip() or "default"
    workspace_slug = _slugify(workspace_token, fallback="workspace")

    async with pool.acquire() as connection:
        async with connection.transaction():
            for profile in DEFAULT_RUNTIME_PROFILES:
                existing = await connection.fetchrow(
                    """
                    SELECT id
                    FROM runtime_profiles
                    WHERE tenant_id = $1 AND workspace_id = $2 AND slug = $3
                    LIMIT 1
                    """,
                    tenant_token,
                    workspace_token,
                    profile["slug"],
                )
                if existing is not None:
                    continue
                profile_id = f"rprof_{workspace_slug}_{_slugify(profile['slug'], fallback='profile')}"
                await connection.execute(
                    """
                    INSERT INTO runtime_profiles (
                        id, tenant_id, workspace_id, slug, label, runtime_class, placement_mode, runtime_id, machine_id,
                        default_execution_target, supported_capabilities, root_folder_uri, allowed_connector_scopes, status,
                        last_seen_at, metadata, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9::jsonb, NULL, '[]'::jsonb, $10, NULL, '{}'::jsonb, NOW(), NOW()
                    )
                    """,
                    profile_id,
                    tenant_token,
                    workspace_token,
                    profile["slug"],
                    profile["label"],
                    profile["runtime_class"],
                    profile["placement_mode"],
                    profile["default_execution_target"],
                    _to_json(profile.get("supported_capabilities"), default=[]),
                    profile["status"],
                )

            for definition in DEFAULT_AGENT_DEFINITIONS:
                existing = await connection.fetchrow(
                    """
                    SELECT id, current_version_id, published_version_id
                    FROM agent_definitions
                    WHERE tenant_id = $1 AND workspace_id = $2 AND slug = $3
                    LIMIT 1
                    """,
                    tenant_token,
                    workspace_token,
                    definition["slug"],
                )
                if existing is not None:
                    agent_definition_id = str(existing.get("id") or "").strip()
                else:
                    agent_definition_id = f"agentdef_{workspace_slug}_{_slugify(definition['slug'], fallback='agent')}"
                    await connection.execute(
                        """
                        INSERT INTO agent_definitions (
                            id, tenant_id, workspace_id, slug, name, description, agent_kind, visibility, status,
                            category, icon, created_by_user_id, current_version_id, published_version_id,
                            source_workflow_definition_id, metadata, created_at, updated_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, 'published', $9, $10, $11, NULL, NULL, NULL, '{}'::jsonb, NOW(), NOW()
                        )
                        """,
                        agent_definition_id,
                        tenant_token,
                        workspace_token,
                        definition["slug"],
                        definition["name"],
                        definition["description"],
                        definition["agent_kind"],
                        definition["visibility"],
                        definition["category"],
                        definition["icon"],
                        _normalize_token(created_by_user_id),
                    )
                version_existing = await connection.fetchrow(
                    """
                    SELECT id
                    FROM agent_definition_versions
                    WHERE tenant_id = $1 AND workspace_id = $2 AND agent_definition_id = $3 AND version_number = 1
                    LIMIT 1
                    """,
                    tenant_token,
                    workspace_token,
                    agent_definition_id,
                )
                version_id = str(version_existing.get("id") or "").strip() if version_existing is not None else f"{agent_definition_id}_v1"
                if version_existing is None:
                    await connection.execute(
                        """
                        INSERT INTO agent_definition_versions (
                            id, tenant_id, workspace_id, agent_definition_id, version_number, status, manifest,
                            compiled_workflow_version_id, capability_manifest, memory_scope_manifest, policy_manifest,
                            placement_manifest, template_inputs_schema, metadata, created_by_user_id, created_at
                        ) VALUES (
                            $1, $2, $3, $4, 1, 'published', $5::jsonb, NULL, $6::jsonb, '{}'::jsonb, $7::jsonb,
                            $8::jsonb, '{}'::jsonb, '{}'::jsonb, $9, NOW()
                        )
                        """,
                        version_id,
                        tenant_token,
                        workspace_token,
                        agent_definition_id,
                        _to_json(definition.get("manifest"), default={}),
                        _to_json(definition.get("capability_manifest"), default={}),
                        _to_json(definition.get("policy_manifest"), default={}),
                        _to_json(definition.get("placement_manifest"), default={}),
                        _normalize_token(created_by_user_id),
                    )
                await connection.execute(
                    """
                    UPDATE agent_definitions
                    SET
                        current_version_id = COALESCE(current_version_id, $4),
                        published_version_id = COALESCE(published_version_id, $4),
                        updated_at = NOW()
                    WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3
                    """,
                    agent_definition_id,
                    tenant_token,
                    workspace_token,
                    version_id,
                )

            master_definition = DEFAULT_MASTER_AGENT_DEFINITION
            master_existing = await connection.fetchrow(
                """
                SELECT id, current_version_id, published_version_id
                FROM agent_definitions
                WHERE tenant_id = $1 AND workspace_id = $2 AND slug = $3
                LIMIT 1
                """,
                tenant_token,
                workspace_token,
                master_definition["slug"],
            )
            if master_existing is not None:
                master_definition_id = str(master_existing.get("id") or "").strip()
            else:
                master_definition_id = f"agentdef_{workspace_slug}_{_slugify(master_definition['slug'], fallback='sage')}"
                await connection.execute(
                    """
                    INSERT INTO agent_definitions (
                        id, tenant_id, workspace_id, slug, name, description, agent_kind, visibility, status,
                        category, icon, created_by_user_id, current_version_id, published_version_id,
                        source_workflow_definition_id, metadata, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, 'published', $9, $10, $11, NULL, NULL, NULL, '{"system_agent":true,"hidden_from_catalog":true}'::jsonb, NOW(), NOW()
                    )
                    """,
                    master_definition_id,
                    tenant_token,
                    workspace_token,
                    master_definition["slug"],
                    master_definition["name"],
                    master_definition["description"],
                    master_definition["agent_kind"],
                    master_definition["visibility"],
                    master_definition["category"],
                    master_definition["icon"],
                    _normalize_token(created_by_user_id),
                )
            master_version_existing = await connection.fetchrow(
                """
                SELECT id
                FROM agent_definition_versions
                WHERE tenant_id = $1 AND workspace_id = $2 AND agent_definition_id = $3 AND version_number = 1
                LIMIT 1
                """,
                tenant_token,
                workspace_token,
                master_definition_id,
            )
            master_version_id = str(master_version_existing.get("id") or "").strip() if master_version_existing is not None else f"{master_definition_id}_v1"
            if master_version_existing is None:
                await connection.execute(
                    """
                    INSERT INTO agent_definition_versions (
                        id, tenant_id, workspace_id, agent_definition_id, version_number, status, manifest,
                        compiled_workflow_version_id, capability_manifest, memory_scope_manifest, policy_manifest,
                        placement_manifest, template_inputs_schema, metadata, created_by_user_id, created_at
                    ) VALUES (
                        $1, $2, $3, $4, 1, 'published', $5::jsonb, NULL, $6::jsonb, '{}'::jsonb, $7::jsonb,
                        $8::jsonb, '{}'::jsonb, '{"system_agent":true,"hidden_from_catalog":true}'::jsonb, $9, NOW()
                    )
                    """,
                    master_version_id,
                    tenant_token,
                    workspace_token,
                    master_definition_id,
                    _to_json(master_definition.get("manifest"), default={}),
                    _to_json(master_definition.get("capability_manifest"), default={}),
                    _to_json(master_definition.get("policy_manifest"), default={}),
                    _to_json(master_definition.get("placement_manifest"), default={}),
                    _normalize_token(created_by_user_id),
                )
            await connection.execute(
                """
                UPDATE agent_definitions
                SET
                    current_version_id = COALESCE(current_version_id, $4),
                    published_version_id = COALESCE(published_version_id, $4),
                    updated_at = NOW()
                WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3
                """,
                master_definition_id,
                tenant_token,
                workspace_token,
                master_version_id,
            )

            master_install_existing = await connection.fetchrow(
                """
                SELECT wai.id
                FROM workspace_agent_installs wai
                INNER JOIN agent_definitions ad
                    ON ad.id = wai.agent_definition_id
                WHERE wai.tenant_id = $1
                  AND wai.workspace_id = $2
                  AND ad.agent_kind = 'master'
                LIMIT 1
                """,
                tenant_token,
                workspace_token,
            )
            if master_install_existing is None:
                await connection.execute(
                    """
                    INSERT INTO workspace_agent_installs (
                        id, tenant_id, workspace_id, agent_definition_id, agent_definition_version_id, installed_by_user_id,
                        install_scope, owner_user_id, thread_id, label, status, enabled, runtime_profile_id, compiled_workflow_version_id,
                        root_folder_uri, tool_toggles, folder_grants, connector_bindings, memory_scope_overrides,
                        policy_context_overrides, metadata, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        'workspace', NULL, NULL, $7, 'active', TRUE, $8, NULL,
                        NULL, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
                        '{"trust_mode":"guarded","session_mode":"copilot"}'::jsonb, '{"system_agent":true,"hidden_from_agents_dashboard":true}'::jsonb, NOW(), NOW()
                    )
                    """,
                    f"ainstall_{workspace_slug}_sage",
                    tenant_token,
                    workspace_token,
                    master_definition_id,
                    master_version_id,
                    _normalize_token(created_by_user_id),
                    master_definition["name"],
                    f"rprof_{workspace_slug}_empyralis-cloud",
                )


async def list_runtime_profiles(
    *,
    tenant_id: str,
    workspace_id: str,
) -> List[Dict[str, Any]]:
    await ensure_workspace_agent_registry_seeded(tenant_id=tenant_id, workspace_id=workspace_id)
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return []
    rows = await pool.fetch(
        """
        SELECT *
        FROM runtime_profiles
        WHERE tenant_id = $1 AND workspace_id = $2
        ORDER BY
            CASE WHEN slug = 'empyralis-cloud' THEN 0 ELSE 1 END,
            label ASC
        """,
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
    )
    return [item for item in (_row_to_runtime_profile(row) for row in rows) if item]


async def list_agent_definitions(
    *,
    tenant_id: str,
    workspace_id: str,
    include_private: bool = False,
) -> List[Dict[str, Any]]:
    await ensure_workspace_agent_registry_seeded(tenant_id=tenant_id, workspace_id=workspace_id)
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return []
    rows = await pool.fetch(
        """
        SELECT
            ad.*,
            adv.id AS version_id,
            adv.version_number,
            adv.status AS version_status,
            adv.manifest,
            adv.capability_manifest,
            adv.memory_scope_manifest,
            adv.policy_manifest,
            adv.placement_manifest,
            adv.template_inputs_schema,
            adv.metadata AS version_metadata,
            adv.compiled_workflow_version_id AS version_compiled_workflow_version_id
        FROM agent_definitions ad
        LEFT JOIN agent_definition_versions adv
            ON adv.id = COALESCE(ad.published_version_id, ad.current_version_id)
        WHERE ad.tenant_id = $1
          AND ad.workspace_id = $2
          AND ($3::bool OR COALESCE(ad.visibility, 'workspace') <> 'private')
        ORDER BY ad.updated_at DESC, ad.name ASC
        """,
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
        bool(include_private),
    )
    return [item for item in (_row_to_agent_definition(row) for row in rows) if item]


async def get_agent_definition(
    definition_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
) -> Optional[Dict[str, Any]]:
    await ensure_workspace_agent_registry_seeded(tenant_id=tenant_id, workspace_id=workspace_id)
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT
            ad.*,
            adv.id AS version_id,
            adv.version_number,
            adv.status AS version_status,
            adv.manifest,
            adv.capability_manifest,
            adv.memory_scope_manifest,
            adv.policy_manifest,
            adv.placement_manifest,
            adv.template_inputs_schema,
            adv.metadata AS version_metadata,
            adv.compiled_workflow_version_id AS version_compiled_workflow_version_id
        FROM agent_definitions ad
        LEFT JOIN agent_definition_versions adv
            ON adv.id = COALESCE(ad.published_version_id, ad.current_version_id)
        WHERE ad.id = $1 AND ad.tenant_id = $2 AND ad.workspace_id = $3
        LIMIT 1
        """,
        str(definition_id or "").strip(),
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
    )
    return _row_to_agent_definition(row)


async def list_workspace_agent_installs(
    *,
    tenant_id: str,
    workspace_id: str,
    include_master: bool = False,
) -> List[Dict[str, Any]]:
    await ensure_workspace_agent_registry_seeded(tenant_id=tenant_id, workspace_id=workspace_id)
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return []
    rows = await pool.fetch(
        """
        SELECT
            wai.*,
            ad.slug AS agent_definition_slug,
            ad.name AS agent_definition_name,
            ad.description AS agent_definition_description,
            ad.category AS agent_definition_category,
            ad.icon AS agent_definition_icon,
            ad.agent_kind,
            adv.version_number AS definition_version_number,
            adv.manifest,
            adv.capability_manifest,
            adv.policy_manifest,
            adv.placement_manifest,
            rp.slug AS runtime_profile_slug,
            rp.label AS runtime_profile_label,
            rp.runtime_class,
            rp.placement_mode,
            rp.runtime_id,
            rp.machine_id,
            rp.default_execution_target,
            rp.status AS runtime_profile_status,
            cwv.workflow_id AS compiled_workflow_id
        FROM workspace_agent_installs wai
        INNER JOIN agent_definitions ad
            ON ad.id = wai.agent_definition_id
        INNER JOIN agent_definition_versions adv
            ON adv.id = wai.agent_definition_version_id
        LEFT JOIN runtime_profiles rp
            ON rp.id = wai.runtime_profile_id
        LEFT JOIN workflow_versions cwv
            ON cwv.id = wai.compiled_workflow_version_id
        WHERE wai.tenant_id = $1
          AND wai.workspace_id = $2
          AND ($3::bool OR COALESCE(ad.agent_kind, 'specialist') <> 'master')
        ORDER BY wai.updated_at DESC, wai.created_at DESC
        """,
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
        bool(include_master),
    )
    return [item for item in (_row_to_install_summary(row) for row in rows) if item]


async def get_workspace_master_agent_install(
    *,
    tenant_id: str,
    workspace_id: str,
    created_by_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    await ensure_workspace_agent_registry_seeded(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        created_by_user_id=created_by_user_id,
    )
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    row = await pool.fetchrow(
        """
        SELECT wai.id
        FROM workspace_agent_installs wai
        INNER JOIN agent_definitions ad
            ON ad.id = wai.agent_definition_id
        WHERE wai.tenant_id = $1
          AND wai.workspace_id = $2
          AND ad.agent_kind = 'master'
        ORDER BY wai.updated_at DESC, wai.created_at DESC
        LIMIT 1
        """,
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
    )
    install_id = str(row.get("id") or "").strip() if row is not None else ""
    if not install_id:
        return None
    return await get_workspace_agent_install_bundle(
        install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )


def _pick_definition_version_id(definition: Dict[str, Any], requested_version_id: Optional[str]) -> Optional[str]:
    requested = _normalize_token(requested_version_id)
    if requested:
        return requested
    return _normalize_token(definition.get("published_version_id")) or _normalize_token(definition.get("current_version_id")) or _normalize_token(_dict_json(definition.get("current_version")).get("id"))


def _default_runtime_profile_id(definition: Dict[str, Any], runtime_profiles: List[Dict[str, Any]]) -> Optional[str]:
    current_version = _dict_json(definition.get("current_version"))
    placement_manifest = _dict_json(current_version.get("placement_manifest"))
    preferred_slug = _normalize_token(placement_manifest.get("preferred_runtime_slug"))
    for profile in runtime_profiles:
        if preferred_slug and str(profile.get("slug") or "").strip() == preferred_slug:
            return _normalize_token(profile.get("id"))
    return _normalize_token(runtime_profiles[0].get("id")) if runtime_profiles else None


async def create_workspace_agent_install(
    *,
    tenant_id: str,
    workspace_id: str,
    agent_definition_id: str,
    agent_definition_version_id: Optional[str] = None,
    installed_by_user_id: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    label: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    root_folder_uri: Optional[str] = None,
    tool_toggles: Optional[Dict[str, Any]] = None,
    folder_grants: Optional[List[Any]] = None,
    connector_bindings: Optional[Dict[str, Any]] = None,
    memory_scope_overrides: Optional[Dict[str, Any]] = None,
    policy_context_overrides: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    definition = await get_agent_definition(
        agent_definition_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    if not isinstance(definition, dict):
        return None
    runtime_profiles = await list_runtime_profiles(tenant_id=tenant_id, workspace_id=workspace_id)
    resolved_runtime_profile_id = _normalize_token(runtime_profile_id) or _default_runtime_profile_id(definition, runtime_profiles)
    current_version = _dict_json(definition.get("current_version"))
    capability_manifest = _dict_json(current_version.get("capability_manifest"))
    default_toggles = _default_tool_toggles_from_capabilities(capability_manifest)
    merged_toggles = {**default_toggles, **_dict_json(tool_toggles)}
    merged_policy = {
        "trust_mode": str(_dict_json(current_version.get("policy_manifest")).get("trust_mode") or "guarded").strip() or "guarded",
        **_dict_json(policy_context_overrides),
    }
    install_id = f"ainstall_{uuid.uuid4().hex[:16]}"
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    resolved_version_id = _pick_definition_version_id(definition, agent_definition_version_id)
    await pool.execute(
        """
        INSERT INTO workspace_agent_installs (
            id, tenant_id, workspace_id, agent_definition_id, agent_definition_version_id, installed_by_user_id,
            install_scope, owner_user_id, thread_id, label, status, enabled, runtime_profile_id, compiled_workflow_version_id,
            root_folder_uri, tool_toggles, folder_grants, connector_bindings, memory_scope_overrides,
            policy_context_overrides, metadata, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            'workspace', $7, $8, $9, 'active', TRUE, $10, NULL,
            $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
            $16::jsonb, $17::jsonb, NOW(), NOW()
        )
        """,
        install_id,
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
        str(agent_definition_id or "").strip(),
        resolved_version_id,
        _normalize_token(installed_by_user_id),
        _normalize_token(owner_user_id),
        _normalize_token(thread_id),
        _normalize_token(label) or str(definition.get("name") or "").strip() or "Installed Agent",
        resolved_runtime_profile_id,
        _normalize_token(root_folder_uri),
        _to_json(merged_toggles, default={}),
        _to_json(folder_grants, default=[]),
        _to_json(connector_bindings, default={}),
        _to_json(memory_scope_overrides, default={}),
        _to_json(merged_policy, default={}),
        _to_json(metadata, default={}),
    )
    return await get_workspace_agent_install_bundle(
        install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )


async def update_workspace_agent_install(
    install_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    label: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    root_folder_uri: Optional[str] = None,
    tool_toggles: Optional[Dict[str, Any]] = None,
    folder_grants: Optional[List[Any]] = None,
    connector_bindings: Optional[Dict[str, Any]] = None,
    memory_scope_overrides: Optional[Dict[str, Any]] = None,
    policy_context_overrides: Optional[Dict[str, Any]] = None,
    enabled: Optional[bool] = None,
    status: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    existing = await get_workspace_agent_install_bundle(
        install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    if not isinstance(existing, dict):
        return None
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    next_tool_toggles = {**_dict_json(existing.get("tool_toggles")), **_dict_json(tool_toggles)}
    next_policy = {**_dict_json(existing.get("policy_context_overrides")), **_dict_json(policy_context_overrides)}
    next_metadata = {**_dict_json(existing.get("metadata")), **_dict_json(metadata)}
    await pool.execute(
        """
        UPDATE workspace_agent_installs
        SET
            label = $4,
            runtime_profile_id = $5,
            root_folder_uri = $6,
            tool_toggles = $7::jsonb,
            folder_grants = $8::jsonb,
            connector_bindings = $9::jsonb,
            memory_scope_overrides = $10::jsonb,
            policy_context_overrides = $11::jsonb,
            enabled = $12,
            status = $13,
            metadata = $14::jsonb,
            updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3
        """,
        str(install_id or "").strip(),
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
        _normalize_token(label) or _normalize_token(existing.get("label")),
        _normalize_token(runtime_profile_id) if runtime_profile_id is not None else _normalize_token(existing.get("runtime_profile_id")),
        _normalize_token(root_folder_uri) if root_folder_uri is not None else _normalize_token(existing.get("root_folder_uri")),
        _to_json(next_tool_toggles, default={}),
        _to_json(folder_grants if folder_grants is not None else existing.get("folder_grants"), default=[]),
        _to_json(connector_bindings if connector_bindings is not None else existing.get("connector_bindings"), default={}),
        _to_json(memory_scope_overrides if memory_scope_overrides is not None else existing.get("memory_scope_overrides"), default={}),
        _to_json(next_policy, default={}),
        bool(enabled) if enabled is not None else bool(existing.get("enabled", True)),
        _normalize_token(status) or str(existing.get("status") or "active").strip() or "active",
        _to_json(next_metadata, default={}),
    )
    return await get_workspace_agent_install_bundle(
        install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )


async def get_runtime_profile(
    runtime_profile_id: str,
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    clauses = ["id = $1"]
    params: List[Any] = [str(runtime_profile_id or "").strip()]
    if tenant_id:
        params.append(str(tenant_id or "").strip())
        clauses.append(f"tenant_id = ${len(params)}")
    if workspace_id:
        params.append(str(workspace_id or "").strip())
        clauses.append(f"workspace_id = ${len(params)}")
    row = await pool.fetchrow(
        f"""
        SELECT *
        FROM runtime_profiles
        WHERE {' AND '.join(clauses)}
        LIMIT 1
        """,
        *params,
    )
    return _row_to_runtime_profile(row)


async def get_workspace_agent_install_bundle(
    install_id: str,
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    clauses = ["wai.id = $1"]
    params: List[Any] = [str(install_id or "").strip()]
    if tenant_id:
        params.append(str(tenant_id or "").strip())
        clauses.append(f"wai.tenant_id = ${len(params)}")
    if workspace_id:
        params.append(str(workspace_id or "").strip())
        clauses.append(f"wai.workspace_id = ${len(params)}")
    row = await pool.fetchrow(
        f"""
        SELECT
            wai.*,
            ad.slug AS agent_definition_slug,
            ad.name AS agent_definition_name,
            ad.description AS agent_definition_description,
            ad.agent_kind,
            ad.visibility AS agent_definition_visibility,
            ad.status AS agent_definition_status,
            ad.source_workflow_definition_id,
            ad.metadata AS agent_definition_metadata,
            adv.status AS agent_definition_version_status,
            adv.manifest,
            adv.capability_manifest,
            adv.memory_scope_manifest,
            adv.policy_manifest,
            adv.placement_manifest,
            adv.template_inputs_schema,
            adv.metadata AS agent_definition_version_metadata,
            adv.compiled_workflow_version_id AS definition_compiled_workflow_version_id,
            rp.slug AS runtime_profile_slug,
            rp.label AS runtime_profile_label,
            rp.runtime_class,
            rp.placement_mode,
            rp.runtime_id,
            rp.machine_id,
            rp.default_execution_target,
            rp.supported_capabilities,
            rp.root_folder_uri AS runtime_profile_root_folder_uri,
            rp.allowed_connector_scopes,
            rp.status AS runtime_profile_status,
            rp.last_seen_at AS runtime_profile_last_seen_at,
            rp.metadata AS runtime_profile_metadata,
            cwv.workflow_id AS compiled_workflow_id
        FROM workspace_agent_installs wai
        INNER JOIN agent_definitions ad
            ON ad.id = wai.agent_definition_id
        INNER JOIN agent_definition_versions adv
            ON adv.id = wai.agent_definition_version_id
        LEFT JOIN runtime_profiles rp
            ON rp.id = wai.runtime_profile_id
        LEFT JOIN workflow_versions cwv
            ON cwv.id = wai.compiled_workflow_version_id
        WHERE {' AND '.join(clauses)}
        LIMIT 1
        """,
        *params,
    )
    if row is None:
        return None
    payload = dict(row)
    runtime_profile = None
    if payload.get("runtime_profile_id"):
        runtime_profile = {
            "id": str(payload.get("runtime_profile_id") or "").strip(),
            "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
            "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
            "slug": str(payload.get("runtime_profile_slug") or "").strip() or None,
            "label": str(payload.get("runtime_profile_label") or "").strip() or None,
            "runtime_class": str(payload.get("runtime_class") or "").strip() or "cloud_worker",
            "placement_mode": str(payload.get("placement_mode") or "").strip() or "auto",
            "runtime_id": _normalize_token(payload.get("runtime_id")),
            "machine_id": _normalize_token(payload.get("machine_id")),
            "default_execution_target": str(payload.get("default_execution_target") or "").strip() or "auto",
            "supported_capabilities": _list_json(payload.get("supported_capabilities")),
            "root_folder_uri": _normalize_token(payload.get("runtime_profile_root_folder_uri")),
            "allowed_connector_scopes": _list_json(payload.get("allowed_connector_scopes")),
            "status": str(payload.get("runtime_profile_status") or "").strip() or "active",
            "last_seen_at": _iso(payload.get("runtime_profile_last_seen_at")),
            "metadata": _dict_json(payload.get("runtime_profile_metadata")),
        }
    return {
        "id": str(payload.get("id") or "").strip(),
        "tenant_id": str(payload.get("tenant_id") or "").strip() or None,
        "workspace_id": str(payload.get("workspace_id") or "").strip() or None,
        "agent_definition_id": str(payload.get("agent_definition_id") or "").strip() or None,
        "agent_definition_version_id": str(payload.get("agent_definition_version_id") or "").strip() or None,
        "installed_by_user_id": _normalize_token(payload.get("installed_by_user_id")),
        "install_scope": str(payload.get("install_scope") or "").strip() or "workspace",
        "owner_user_id": _normalize_token(payload.get("owner_user_id")),
        "thread_id": _normalize_token(payload.get("thread_id")),
        "label": _normalize_token(payload.get("label")),
        "status": str(payload.get("status") or "").strip() or "active",
        "enabled": bool(payload.get("enabled")),
        "runtime_profile_id": _normalize_token(payload.get("runtime_profile_id")),
        "compiled_workflow_version_id": _normalize_token(payload.get("compiled_workflow_version_id")),
        "compiled_workflow_id": _normalize_token(payload.get("compiled_workflow_id")),
        "root_folder_uri": _normalize_token(payload.get("root_folder_uri")),
        "tool_toggles": _dict_json(payload.get("tool_toggles")),
        "folder_grants": _list_json(payload.get("folder_grants")),
        "connector_bindings": _dict_json(payload.get("connector_bindings")),
        "memory_scope_overrides": _dict_json(payload.get("memory_scope_overrides")),
        "policy_context_overrides": _dict_json(payload.get("policy_context_overrides")),
        "metadata": _dict_json(payload.get("metadata")),
        "created_at": _iso(payload.get("created_at")),
        "updated_at": _iso(payload.get("updated_at")),
        "agent_definition": {
            "id": str(payload.get("agent_definition_id") or "").strip(),
            "slug": str(payload.get("agent_definition_slug") or "").strip() or None,
            "name": str(payload.get("agent_definition_name") or "").strip() or "Installed Agent",
            "description": str(payload.get("agent_definition_description") or "").strip(),
            "agent_kind": str(payload.get("agent_kind") or "").strip() or "specialist",
            "visibility": str(payload.get("agent_definition_visibility") or "").strip() or "workspace",
            "status": str(payload.get("agent_definition_status") or "").strip() or "draft",
            "source_workflow_definition_id": _normalize_token(payload.get("source_workflow_definition_id")),
            "metadata": _dict_json(payload.get("agent_definition_metadata")),
        },
        "agent_definition_version": {
            "id": str(payload.get("agent_definition_version_id") or "").strip(),
            "status": str(payload.get("agent_definition_version_status") or "").strip() or "draft",
            "manifest": _dict_json(payload.get("manifest")),
            "capability_manifest": _dict_json(payload.get("capability_manifest")),
            "memory_scope_manifest": _dict_json(payload.get("memory_scope_manifest")),
            "policy_manifest": _dict_json(payload.get("policy_manifest")),
            "placement_manifest": _dict_json(payload.get("placement_manifest")),
            "template_inputs_schema": _dict_json(payload.get("template_inputs_schema")),
            "metadata": _dict_json(payload.get("agent_definition_version_metadata")),
            "compiled_workflow_version_id": _normalize_token(payload.get("definition_compiled_workflow_version_id")),
        },
        "runtime_profile": runtime_profile,
    }


async def fetch_workflow_snapshot(
    workflow_id: str,
    *,
    workflow_version_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    params: List[Any] = [str(workflow_id or "").strip()]
    clauses = ["wd.id = $1"]
    version_join = "LEFT JOIN workflow_versions wv ON wv.id = wd.current_version_id"
    if workflow_version_id:
        params.append(str(workflow_version_id or "").strip())
        version_join = f"LEFT JOIN workflow_versions wv ON wv.workflow_id = wd.id AND wv.id = ${len(params)}"
    if tenant_id:
        params.append(str(tenant_id or "").strip())
        clauses.append(f"wd.tenant_id = ${len(params)}")
    if workspace_id:
        params.append(str(workspace_id or "").strip())
        clauses.append(f"wd.workspace_id = ${len(params)}")
    row = await pool.fetchrow(
        f"""
        SELECT
            wd.id AS workflow_id,
            wd.tenant_id,
            wd.workspace_id,
            wd.name,
            wd.description,
            wd.status AS workflow_status,
            wd.updated_at,
            wv.id AS workflow_version_id,
            wv.version_number,
            wv.definition,
            wv.validation,
            wv.metadata,
            wv.created_at
        FROM workflow_definitions wd
        {version_join}
        WHERE {' AND '.join(clauses)}
        LIMIT 1
        """,
        *params,
    )
    return _row_to_workflow_snapshot(row)


async def create_compiled_workflow_artifact(
    *,
    tenant_id: str,
    workspace_id: str,
    name: str,
    description: str,
    definition: Dict[str, Any],
    validation: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    created_by_user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    workflow_id = f"wf_{uuid.uuid4().hex[:12]}"
    version_id = f"wfver_{uuid.uuid4().hex[:16]}"
    now_iso = _utc_now_iso()
    async with pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute(
                """
                INSERT INTO workflow_definitions (
                    id, tenant_id, workspace_id, name, description, status, current_version_id, published_version_id,
                    created_by_user_id, last_run_at, metadata, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, 'compiled', $6, $6, $7, NULL, $8::jsonb, $9::timestamptz, $9::timestamptz
                )
                """,
                workflow_id,
                str(tenant_id or "").strip(),
                str(workspace_id or "").strip(),
                str(name or "").strip() or "Compiled Agent Artifact",
                str(description or "").strip(),
                version_id,
                _normalize_token(created_by_user_id),
                _to_json(metadata, default={}),
                now_iso,
            )
            await connection.execute(
                """
                INSERT INTO workflow_versions (
                    id, tenant_id, workspace_id, workflow_id, version_number, status, definition, validation, created_by_user_id, metadata, created_at
                ) VALUES (
                    $1, $2, $3, $4, 1, 'compiled', $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::timestamptz
                )
                """,
                version_id,
                str(tenant_id or "").strip(),
                str(workspace_id or "").strip(),
                workflow_id,
                _to_json(definition, default={}),
                _to_json(validation, default={}),
                _normalize_token(created_by_user_id),
                _to_json(metadata, default={}),
                now_iso,
            )
    return await fetch_workflow_snapshot(
        workflow_id,
        workflow_version_id=version_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )


async def update_workspace_agent_install_compiled_artifact(
    install_id: str,
    *,
    tenant_id: str,
    workspace_id: str,
    compiled_workflow_version_id: Optional[str],
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    pool = await control_plane_repository.ensure_control_plane_schema()
    if pool is None:
        return None
    await pool.execute(
        """
        UPDATE workspace_agent_installs
        SET
            compiled_workflow_version_id = $4,
            metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
            updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3
        """,
        str(install_id or "").strip(),
        str(tenant_id or "").strip(),
        str(workspace_id or "").strip(),
        _normalize_token(compiled_workflow_version_id),
        _to_json(metadata, default={}),
    )
    return await get_workspace_agent_install_bundle(
        install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
