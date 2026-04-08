from __future__ import annotations

import json
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
