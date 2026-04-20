from __future__ import annotations

from datetime import datetime
import logging
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from server_modules import auth as auth_module
from server_modules import control_plane_repository
from server_modules import entitlements_service
from server_modules import workspace_bootstrap_service


logger = logging.getLogger(__name__)


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _require_string(value: Any, *, field: str) -> str:
    token = str(value or "").strip()
    if not token:
        raise HTTPException(status_code=500, detail=f"Account shell is missing required field: {field}.")
    return token


def _version_component(value: Any) -> int:
    if isinstance(value, datetime):
        return int(value.timestamp())
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _workspace_capabilities(
    *,
    role: str,
    workspace_record: Optional[Dict[str, Any]],
    workspace_id: str,
    current_user: Optional[Dict[str, Any]],
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    entitlement_state = entitlements_service.resolve_workspace_entitlement_state_for_workspace_id(
        workspace_id=workspace_id,
        workspace=workspace_record,
    )
    capability_flags = entitlements_service.workspace_capability_flags(state=entitlement_state)
    workspace_traits = workspace_bootstrap_service._workspace_traits(
        workspace=_coerce_dict(workspace_record),
        role=role,
        capabilities=capability_flags,
    )
    capabilities = {
        **capability_flags,
        "workspace_admin_enabled": role in {"owner", "admin"},
        "platform_admin_enabled": bool((current_user or {}).get("auth_admin") or (current_user or {}).get("is_admin")),
        "billing_read_enabled": role in {"owner", "admin"},
        "billing_write_enabled": role in {"owner", "admin"},
        "routing_read_enabled": role in {"owner", "admin"},
        "routing_write_enabled": role in {"owner", "admin"},
        "document_workstation_enabled": bool(workspace_traits.get("documentHeavy")),
        "channel_pairing_enabled": (
            role in {"member", "owner", "admin"}
            and (
                bool(capability_flags.get("telegram_channel_enabled"))
                or bool(capability_flags.get("whatsapp_channel_enabled"))
            )
        ),
    }
    return workspace_traits, capabilities, capability_flags


async def build_account_shell_payload(current_user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    user = auth_module.get_authenticated_user_record(current_user)
    memberships = auth_module.list_authenticated_workspace_memberships(current_user)
    identity_versions = auth_module.get_authenticated_identity_versions(current_user)
    membership_version_prefix = int(identity_versions.get("membership_version") or 1)

    workspace_memberships: List[Dict[str, Any]] = []
    for membership_row in memberships:
        raw_workspace_id = str(membership_row.get("workspace_id") or "").strip()
        if not raw_workspace_id:
            logger.warning("Skipping account-shell membership with missing workspace_id.")
            continue
        try:
            workspace_record = await control_plane_repository.get_workspace_by_id(raw_workspace_id)
            tenant_id = str(
                membership_row.get("tenant_id") or _coerce_dict(workspace_record).get("tenant_id") or ""
            ).strip()
            if not tenant_id:
                raise HTTPException(
                    status_code=500,
                    detail=f"Account shell is missing required field: workspaceMemberships[{raw_workspace_id}].tenant_id.",
                )
            workspace = workspace_bootstrap_service._workspace_payload(
                workspace_id=raw_workspace_id,
                tenant_id=tenant_id,
                workspace=workspace_record,
                workspace_name=str(membership_row.get("workspace_name") or "").strip() or None,
            )
            role = auth_module.normalize_rbac_role(
                membership_row.get("role"),
                default=auth_module.workspace_role(current_user, raw_workspace_id) or "viewer",
            )
            workspace_traits, capabilities, _ = _workspace_capabilities(
                role=role,
                workspace_record=workspace_record,
                workspace_id=raw_workspace_id,
                current_user=current_user,
            )
            shell_hints = workspace_bootstrap_service._shell_hints(
                workspace_id=raw_workspace_id,
                role=role,
                workspace=workspace_record,
                traits=workspace_traits,
            )
            permissions = workspace_bootstrap_service._membership_permissions(
                role=role,
                capabilities=capabilities,
                traits=workspace_traits,
            )
            membership_version = (
                f"{membership_version_prefix}:{_version_component(membership_row.get('updated_at'))}"
            )
            workspace_memberships.append(
                {
                    "workspace": {
                        "id": workspace["id"],
                        "tenantId": workspace["tenantId"],
                        "label": workspace["label"],
                        "kind": workspace["kind"],
                    },
                    "role": role,
                    "permissions": permissions,
                    "membershipVersion": membership_version,
                    "defaultRoute": shell_hints["defaultRoute"],
                    "preferredShellProfileId": shell_hints["preferredProfile"],
                    "setupCompleted": bool(shell_hints["setupCompleted"]),
                    "requiresOnboarding": bool(shell_hints["requiresOnboarding"]),
                }
            )
        except HTTPException as exc:
            logger.warning(
                "Skipping account-shell membership for workspace %s because payload derivation failed: %s",
                raw_workspace_id,
                exc.detail,
            )
            continue
        except Exception:
            logger.exception(
                "Skipping account-shell membership for workspace %s because workspace lookup failed.",
                raw_workspace_id,
            )
            continue

    return {
        "account": {
            "id": _require_string(user.get("id"), field="account.id"),
            "email": _require_string(user.get("email"), field="account.email"),
            "displayName": str(user.get("name") or user.get("display_name") or "").strip() or None,
        },
        "workspaceMemberships": workspace_memberships,
    }
