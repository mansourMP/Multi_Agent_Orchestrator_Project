from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from server_modules import auth as auth_module
from server_modules import control_plane_repository
from server_modules import platform_analytics_service
from server_modules import workspace_config_schema
from server_modules.workspace_bootstrap_service import build_workspace_bootstrap
from server_modules.workspace_channel_operations_service import (
    build_workspace_channel_operations,
)


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _require_email(value: Any) -> str:
    email = str(value or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    return email


def _require_role(value: Any) -> str:
    role = auth_module.normalize_rbac_role(value, default="member")
    if role not in {"viewer", "member", "owner"}:
        raise HTTPException(status_code=400, detail="role must be viewer, member, or owner.")
    return role


def _enforce_owner_scope(current_user: Any, workspace_id: str) -> str:
    return auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="owner",
    )


def _enforce_platform_admin(current_user: Any) -> Dict[str, Any]:
    if not auth_module.current_user_has_auth_admin_access(current_user if isinstance(current_user, dict) else None):
        raise HTTPException(status_code=403, detail="Admin role required.")
    return dict(current_user or {})


def _active_owner_count(members: list[Dict[str, Any]]) -> int:
    return sum(
        1
        for member in members
        if str(member.get("status") or "active").strip().lower() == "active"
        and str(member.get("role") or "member").strip().lower() == "owner"
    )


def _find_member(members: list[Dict[str, Any]], user_id: str) -> Optional[Dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return None
    for member in members:
        if str(member.get("user_id") or "").strip() == clean_user_id:
            return member
    return None


def _guard_last_owner(member: Dict[str, Any], members: list[Dict[str, Any]], *, next_role: Optional[str] = None) -> None:
    current_role = str(member.get("role") or "member").strip().lower()
    if current_role != "owner":
        return
    if next_role is not None and str(next_role or "").strip().lower() == "owner":
        return
    if _active_owner_count(members) <= 1:
        raise HTTPException(
            status_code=409,
            detail="Cannot remove or demote the last workspace owner.",
        )


async def build_workspace_routing_payload(workspace_id: str, current_user: Any) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    bootstrap = await build_workspace_bootstrap(
        current_user=current_user,
        workspace_id=resolved_workspace_id,
    )
    channel_operations = await build_workspace_channel_operations(
        current_user=current_user,
        workspace_id=resolved_workspace_id,
    )
    admin_defaults = workspace_config_schema.workspace_admin_defaults_from_metadata(
        _coerce_dict((workspace or {}).get("metadata"))
    )
    return {
        "workspace": bootstrap.get("workspace"),
        "membership": bootstrap.get("membership"),
        "runtime": bootstrap.get("runtime"),
        "shellHints": bootstrap.get("shellHints"),
        "workspaceTraits": bootstrap.get("workspaceTraits"),
        "channelOperations": channel_operations,
        "admin_defaults": admin_defaults.model_dump(exclude_none=True),
        "config": workspace_config_schema.workspace_admin_defaults_envelope(admin_defaults),
    }


async def update_workspace_routing_payload(
    workspace_id: str,
    current_user: Any,
    payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    existing_defaults = workspace_config_schema.workspace_admin_defaults_from_metadata(
        _coerce_dict(workspace.get("metadata"))
    )
    body = _coerce_dict(payload)
    raw_defaults = _coerce_dict(body.get("admin_defaults"))
    next_defaults = workspace_config_schema.WorkspaceAdminDefaultsConfig.model_validate(
        {
            "runtime_target": str(
                raw_defaults.get("runtime_target")
                or existing_defaults.runtime_target
            ).strip()
            or existing_defaults.runtime_target,
            "billing_plan": str(
                raw_defaults.get("billing_plan")
                or existing_defaults.billing_plan
            ).strip()
            or existing_defaults.billing_plan,
            "privacy_policy_url": str(
                raw_defaults.get("privacy_policy_url")
                or existing_defaults.privacy_policy_url
                or ""
            ).strip()
            or None,
            "public_start_cta_label": str(
                raw_defaults.get("public_start_cta_label")
                or existing_defaults.public_start_cta_label
                or ""
            ).strip()
            or None,
            "public_start_cta_url": str(
                raw_defaults.get("public_start_cta_url")
                or existing_defaults.public_start_cta_url
                or ""
            ).strip()
            or None,
            "context_budget_preset": str(
                raw_defaults.get("context_budget_preset")
                or existing_defaults.context_budget_preset
            ).strip()
            or existing_defaults.context_budget_preset,
            "retention_preset": str(
                raw_defaults.get("retention_preset")
                or existing_defaults.retention_preset
            ).strip()
            or existing_defaults.retention_preset,
            "health_safety_enabled": bool(
                raw_defaults.get("health_safety_enabled")
                if "health_safety_enabled" in raw_defaults
                else existing_defaults.health_safety_enabled
            ),
            "allowed_live_channels": [
                str(item).strip()
                for item in list(raw_defaults.get("allowed_live_channels") or existing_defaults.allowed_live_channels)
                if str(item).strip()
            ],
        }
    )
    updated = await control_plane_repository.update_workspace_admin_defaults_metadata(
        resolved_workspace_id,
        workspace_config_schema.workspace_admin_defaults_envelope(next_defaults),
    )
    if not isinstance(updated, dict):
        raise HTTPException(status_code=500, detail="Workspace routing defaults could not be updated.")
    return await build_workspace_routing_payload(
        workspace_id=resolved_workspace_id,
        current_user=current_user,
    )


async def build_platform_analytics_payload(current_user: Any) -> Dict[str, Any]:
    resolved_user = _enforce_platform_admin(current_user)
    return await platform_analytics_service.build_platform_analytics_payload(
        current_user=resolved_user,
    )


async def build_workspace_members_payload(workspace_id: str, current_user: Any) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    members = await control_plane_repository.list_workspace_members(resolved_workspace_id)
    invites = await control_plane_repository.list_workspace_invites(resolved_workspace_id)
    pending_invites = [
        invite
        for invite in invites
        if str((invite or {}).get("status") or "pending").strip().lower() == "pending"
    ]
    invite_history = [
        invite
        for invite in invites
        if str((invite or {}).get("status") or "").strip().lower() != "pending"
    ]
    return {
        "workspace": {
            "id": resolved_workspace_id,
            "tenantId": str((workspace or {}).get("tenant_id") or "").strip() or None,
            "label": str((workspace or {}).get("name") or resolved_workspace_id).strip(),
            "kind": str((workspace or {}).get("workspace_type") or (workspace or {}).get("kind") or "personal").strip() or "personal",
        },
        "members": members,
        "invites": invites,
        "pending_invites": pending_invites,
        "invite_history": invite_history,
    }


async def invite_workspace_member(
    workspace_id: str,
    current_user: Any,
    *,
    email: str,
    role: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    invite = await control_plane_repository.create_workspace_invite(
        workspace_id=resolved_workspace_id,
        email=_require_email(email),
        role=_require_role(role),
        invited_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        metadata={
            "source": "workspace_admin_service",
        },
    )
    if not isinstance(invite, dict):
        raise HTTPException(status_code=500, detail="Workspace invite could not be created.")
    return invite


async def update_workspace_member_role(
    workspace_id: str,
    current_user: Any,
    *,
    user_id: str,
    role: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    clean_user_id = str(user_id or "").strip()
    clean_role = _require_role(role)
    members = await control_plane_repository.list_workspace_members(resolved_workspace_id)
    member = _find_member(members, clean_user_id)
    if not isinstance(member, dict):
        raise HTTPException(status_code=404, detail="Workspace member not found.")
    _guard_last_owner(member, members, next_role=clean_role)
    return auth_module.upsert_workspace_membership(
        clean_user_id,
        resolved_workspace_id,
        clean_role,
    )


async def remove_workspace_member(
    workspace_id: str,
    current_user: Any,
    *,
    user_id: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    clean_user_id = str(user_id or "").strip()
    members = await control_plane_repository.list_workspace_members(resolved_workspace_id)
    member = _find_member(members, clean_user_id)
    if not isinstance(member, dict):
        raise HTTPException(status_code=404, detail="Workspace member not found.")
    _guard_last_owner(member, members)
    return auth_module.remove_workspace_membership(
        clean_user_id,
        resolved_workspace_id,
    )


async def revoke_workspace_invite(
    workspace_id: str,
    current_user: Any,
    *,
    invite_id: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    clean_invite_id = str(invite_id or "").strip()
    if not clean_invite_id:
        raise HTTPException(status_code=400, detail="invite_id is required.")
    invite = await control_plane_repository.get_workspace_invite(
        resolved_workspace_id,
        clean_invite_id,
    )
    if not isinstance(invite, dict):
        raise HTTPException(status_code=404, detail="Workspace invite not found.")
    status = str(invite.get("status") or "pending").strip().lower()
    if status == "accepted":
        raise HTTPException(status_code=409, detail="Accepted invites cannot be revoked.")
    if status == "revoked":
        return invite
    revoked = await control_plane_repository.revoke_workspace_invite(clean_invite_id)
    if not isinstance(revoked, dict):
        raise HTTPException(status_code=500, detail="Workspace invite could not be revoked.")
    return revoked


async def build_workspace_policies_payload(workspace_id: str, current_user: Any) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    policy_config = workspace_config_schema.workspace_policy_config_from_legacy(
        auth_module.load_workspace_policy(resolved_workspace_id),
        workspace_id=resolved_workspace_id,
        tenant_id=str((workspace or {}).get("tenant_id") or "").strip() or None,
    )
    return {
        "workspace": {
            "id": resolved_workspace_id,
            "tenantId": str((workspace or {}).get("tenant_id") or "").strip() or None,
            "label": str((workspace or {}).get("name") or resolved_workspace_id).strip(),
        },
        "policy": workspace_config_schema.workspace_policy_to_legacy_payload(policy_config),
        "config": workspace_config_schema.workspace_policy_envelope(policy_config),
    }


async def update_workspace_policies_payload(
    workspace_id: str,
    current_user: Any,
    payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    body = _coerce_dict(payload)
    existing = workspace_config_schema.workspace_policy_config_from_legacy(
        auth_module.load_workspace_policy(resolved_workspace_id),
        workspace_id=resolved_workspace_id,
    )

    def _token_list(value: Any, fallback: list[str]) -> list[str]:
        if not isinstance(value, list):
            return list(fallback)
        return [str(item).strip() for item in value if str(item).strip()]

    capabilities = _coerce_dict(body.get("capabilities"))
    dangerous = _coerce_dict(body.get("dangerous_action_classes"))
    connectors = _coerce_dict(body.get("connectors"))
    next_policy = auth_module.upsert_workspace_policy(
        resolved_workspace_id,
        capability_allow=_token_list(capabilities.get("allow"), list(existing.capabilities.allow)),
        capability_deny=_token_list(capabilities.get("deny"), list(existing.capabilities.deny)),
        dangerous_allow=_token_list(dangerous.get("allow"), list(existing.dangerous_action_classes.allow)),
        dangerous_deny=_token_list(dangerous.get("deny"), list(existing.dangerous_action_classes.deny)),
        connector_allow=_token_list(connectors.get("allow"), list(existing.connectors.allow)),
        connector_deny=_token_list(connectors.get("deny"), list(existing.connectors.deny)),
        machine_enrollment_scope=str(
            body.get("machine_enrollment_scope")
            or existing.machine_policy.machine_enrollment_scope
            or "workspace"
        ).strip(),
        trusted_owner_machine_ids=_token_list(
            body.get("trusted_owner_machine_ids"),
            list(existing.machine_policy.trusted_owner_machine_ids or []),
        ),
    )
    next_config = workspace_config_schema.workspace_policy_config_from_legacy(
        next_policy,
        workspace_id=resolved_workspace_id,
    )
    return {
        "workspace_id": resolved_workspace_id,
        "policy": workspace_config_schema.workspace_policy_to_legacy_payload(next_config),
        "config": workspace_config_schema.workspace_policy_envelope(next_config),
    }
