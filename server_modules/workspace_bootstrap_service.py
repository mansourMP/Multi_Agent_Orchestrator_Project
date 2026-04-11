from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from server_modules import auth as auth_module
from server_modules import control_plane_repository
from server_modules import entitlements_service
from server_modules import runtime_attachment_service


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        token = value.strip().lower()
        if token in {"1", "true", "yes", "on"}:
            return True
        if token in {"0", "false", "no", "off"}:
            return False
    return bool(default)


def _entitlement_flags(entitlements: Dict[str, Any]) -> Dict[str, bool]:
    return {
        str(key): value
        for key, value in entitlements.items()
        if isinstance(value, bool)
    }


def _entitlement_limits(entitlements: Dict[str, Any]) -> Dict[str, int | float | None]:
    out: Dict[str, int | float | None] = {}
    for key, value in entitlements.items():
        if isinstance(value, bool):
            continue
        if value is None or isinstance(value, (int, float)):
            out[str(key)] = value
    return out


def _normalized_deployment_mode(raw_mode: Any) -> str:
    token = str(raw_mode or "").strip().lower()
    if token == "local_only":
        return "local_companion"
    if token == "self_hosted_business":
        return "self_host_runtime"
    if token == "hybrid":
        return "hybrid"
    return "cloud_default"


def _runtime_target_kind(target_id: str) -> str:
    if target_id == "local_companion":
        return "local_companion"
    if target_id == "self_host_runtime":
        return "self_host_runtime"
    return "cloud_default"


def _workspace_traits(
    *,
    workspace: Dict[str, Any],
    role: str,
    capabilities: Dict[str, Any],
) -> Dict[str, Any]:
    metadata = _coerce_dict(workspace.get("metadata"))
    shell_meta = {
        **_coerce_dict(metadata.get("shell")),
        **_coerce_dict(metadata.get("ui")),
        **_coerce_dict(metadata.get("workspace_traits")),
    }
    workspace_kind = str(workspace.get("workspace_type") or workspace.get("kind") or "personal").strip() or "personal"
    compliance_mode = (
        str(
            shell_meta.get("complianceMode")
            or shell_meta.get("compliance_mode")
            or metadata.get("compliance_mode")
            or "standard"
        ).strip()
        or "standard"
    )
    document_heavy = _coerce_bool(
        shell_meta.get("documentHeavy"),
        default=workspace_kind == "enterprise" or compliance_mode in {"legal", "financial"},
    )
    admin_heavy = _coerce_bool(
        shell_meta.get("adminHeavy"),
        default=workspace_kind in {"side_business", "team"} and role in {"owner", "admin"},
    )
    operating_mode = str(
        shell_meta.get("operatingMode")
        or (
            "document_workstation"
            if document_heavy and role in {"viewer", "member"}
            else "operations"
            if admin_heavy and role in {"owner", "admin"}
            else "personal"
        )
    ).strip() or "personal"
    default_surface = str(
        shell_meta.get("defaultSurface")
        or (
            "workstation"
            if operating_mode == "document_workstation"
            else "dashboard"
            if operating_mode == "operations"
            else "chat"
        )
    ).strip() or "chat"
    return {
        "operatingMode": operating_mode,
        "defaultSurface": default_surface,
        "documentHeavy": bool(document_heavy),
        "adminHeavy": bool(admin_heavy),
        "complianceMode": compliance_mode,
        "mobileEnabled": bool(capabilities.get("mobile_app_enabled")),
    }


def _preferred_shell_profile(*, role: str, traits: Dict[str, Any]) -> str:
    operating_mode = str(traits.get("operatingMode") or "").strip().lower()
    if operating_mode == "document_workstation":
        return "document_workstation_shell"
    if operating_mode == "operations" and role in {"owner", "admin"}:
        return "operations_admin_shell"
    return "personal_shell"


def _default_route(*, workspace_id: str, traits: Dict[str, Any]) -> str:
    default_surface = str(traits.get("defaultSurface") or "chat").strip().lower()
    if default_surface == "dashboard":
        return f"/w/{workspace_id}/dashboard"
    if default_surface == "workstation":
        return f"/w/{workspace_id}/workstation"
    return f"/w/{workspace_id}/chat"


def _membership_permissions(*, role: str, capabilities: Dict[str, Any], traits: Dict[str, Any]) -> List[str]:
    permissions = {
        "workspace.read",
        "chat.read",
        "runs.read",
        "notifications.read",
    }
    if capabilities.get("artifacts_enabled"):
        permissions.add("artifacts.read")
    if role in {"member", "owner", "admin"}:
        permissions.update({"chat.write", "runs.write"})
    if capabilities.get("approvals_enabled"):
        permissions.add("approvals.read")
        if role in {"member", "owner", "admin"}:
            permissions.add("approvals.review")
    if capabilities.get("mobile_app_enabled"):
        permissions.add("mobile.use")
    if capabilities.get("telegram_channel_enabled"):
        permissions.add("channels.telegram.use")
    if capabilities.get("whatsapp_channel_enabled"):
        permissions.add("channels.whatsapp.use")
    if str(traits.get("operatingMode") or "").strip().lower() == "document_workstation":
        permissions.add("documents.workstation.use")
    if role in {"owner", "admin"}:
        permissions.update(
            {
                "workspace.admin",
                "members.manage",
                "billing.read",
                "billing.write",
                "routing.read",
                "routing.write",
            }
        )
    return sorted(permissions)


def _workspace_payload(
    *,
    workspace_id: str,
    tenant_id: str,
    workspace: Optional[Dict[str, Any]],
    workspace_name: Optional[str],
) -> Dict[str, Any]:
    record = _coerce_dict(workspace)
    kind = str(record.get("workspace_type") or record.get("kind") or "personal").strip() or "personal"
    label = (
        str(record.get("name") or "").strip()
        or str(workspace_name or "").strip()
        or workspace_id
    )
    return {
        "id": workspace_id,
        "tenantId": tenant_id,
        "label": label,
        "kind": kind,
    }


async def build_workspace_bootstrap(
    *,
    current_user: Optional[Dict[str, Any]],
    workspace_id: str,
) -> Dict[str, Any]:
    requested_workspace_id = str(workspace_id or "").strip()
    workspace_access = auth_module.workspace_access_map(current_user)
    if (
        requested_workspace_id
        and requested_workspace_id != "default"
        and workspace_access
        and requested_workspace_id not in workspace_access
    ):
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")

    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="viewer",
    )
    user_id = str((current_user or {}).get("user_id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Authenticated user is required.")

    user_bundle = await control_plane_repository.get_user_bundle_by_id(user_id)
    if not isinstance(user_bundle, dict):
        raise HTTPException(status_code=404, detail="User not found.")

    user = _coerce_dict(user_bundle.get("user"))
    memberships = [
        dict(item)
        for item in list(user_bundle.get("memberships") or [])
        if isinstance(item, dict)
    ]
    membership_row = next(
        (item for item in memberships if str(item.get("workspace_id") or "").strip() == resolved_workspace_id),
        None,
    )
    workspace_entry = _coerce_dict(workspace_access.get(resolved_workspace_id))
    tenant_id = auth_module.workspace_tenant_id(current_user, resolved_workspace_id)
    role = auth_module.workspace_role(current_user, resolved_workspace_id) or "viewer"
    workspace_record = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    workspace_payload = _workspace_payload(
        workspace_id=resolved_workspace_id,
        tenant_id=tenant_id,
        workspace=workspace_record,
        workspace_name=str((membership_row or {}).get("workspace_name") or "").strip() or None,
    )

    entitlement_state = entitlements_service.resolve_workspace_entitlement_state_for_workspace_id(
        workspace_id=resolved_workspace_id,
        workspace=workspace_record,
    )
    capability_flags = entitlements_service.workspace_capability_flags(state=entitlement_state)
    runtime_targets = await runtime_attachment_service.list_workspace_runtime_targets(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
    )
    workspace_traits = _workspace_traits(
        workspace=_coerce_dict(workspace_record),
        role=role,
        capabilities=capability_flags,
    )
    preferred_profile = _preferred_shell_profile(role=role, traits=workspace_traits)
    default_route = _default_route(workspace_id=resolved_workspace_id, traits=workspace_traits)
    identity_versions = _coerce_dict((current_user or {}).get("identity_versions"))
    membership_version = (
        f"{int(identity_versions.get('membership_version') or 1)}"
        f":{int((membership_row or {}).get('updated_at') or 0)}"
    )
    capabilities = {
        **capability_flags,
        "workspace_admin_enabled": role in {"owner", "admin"},
        "billing_read_enabled": role in {"owner", "admin"},
        "billing_write_enabled": role in {"owner", "admin"},
        "routing_read_enabled": role in {"owner", "admin"},
        "routing_write_enabled": role in {"owner", "admin"},
        "document_workstation_enabled": bool(workspace_traits.get("documentHeavy")),
    }
    permissions = _membership_permissions(
        role=role,
        capabilities=capabilities,
        traits=workspace_traits,
    )

    return {
        "account": {
            "id": str(user.get("id") or user_id).strip(),
            "email": str(user.get("email") or (current_user or {}).get("email") or "").strip().lower(),
            "displayName": str(user.get("name") or user.get("display_name") or "").strip() or None,
        },
        "workspace": workspace_payload,
        "membership": {
            "role": role,
            "permissions": permissions,
            "version": membership_version,
        },
        "capabilities": capabilities,
        "entitlements": {
            "plan": entitlement_state.plan_id,
            "label": entitlement_state.plan_label,
            "source": entitlement_state.source,
            "flags": _entitlement_flags(entitlement_state.entitlements),
            "limits": _entitlement_limits(entitlement_state.entitlements),
        },
        "workspaceTraits": workspace_traits,
        "runtime": {
            "deploymentMode": _normalized_deployment_mode(runtime_targets.get("deployment_mode")),
            "runtimeTargets": [
                {
                    "id": str(item.get("target_id") or "").strip(),
                    "label": str(item.get("label") or "").strip() or str(item.get("target_id") or "").strip(),
                    "kind": _runtime_target_kind(str(item.get("target_id") or "").strip()),
                    "online": bool(item.get("online")),
                    "preferred": bool(item.get("default_for_workspace")),
                }
                for item in list(runtime_targets.get("targets") or [])
                if str(item.get("target_id") or "").strip()
            ],
        },
        "shellHints": {
            "defaultRoute": default_route,
            "preferredProfile": preferred_profile,
        },
    }
