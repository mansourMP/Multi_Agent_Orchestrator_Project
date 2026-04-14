from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from server_modules import auth as auth_module
from server_modules import control_plane_repository
from server_modules import workspace_admin_service
from server_modules.workspace_channel_operations_service import (
    build_workspace_channel_operations,
)
from server_modules.workspace_bootstrap_service import build_workspace_bootstrap


router = APIRouter()
get_current_user = auth_module.get_current_user

VALID_WORKSPACE_TYPES = {"personal", "professional", "team"}
VALID_SHELL_PROFILES = {
    "personal_shell",
    "document_workstation_shell",
    "operations_admin_shell",
}


def _require_workspace_type(value: Any) -> str:
    token = str(value or "").strip().lower()
    if token not in VALID_WORKSPACE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"workspace_type must be one of: {', '.join(sorted(VALID_WORKSPACE_TYPES))}.",
        )
    return token


def _require_shell_profile(value: Any) -> str:
    token = str(value or "").strip()
    if token not in VALID_SHELL_PROFILES:
        raise HTTPException(
            status_code=400,
            detail="preferred_shell_profile is invalid.",
        )
    return token


def _require_default_route(value: Any) -> str:
    token = str(value or "").strip()
    if not token.startswith("/") or token.startswith("//"):
        raise HTTPException(status_code=400, detail="default_route must be a valid route path.")
    return token


def _extract_workspace_id_from_route(route: str) -> Optional[str]:
    token = str(route or "").strip()
    if not token.startswith("/w/"):
        return None
    suffix = token[3:]
    workspace_token = suffix.split("/", 1)[0].strip()
    return workspace_token or None


def _require_workspace_default_route(value: Any, *, workspace_id: Optional[str] = None) -> str:
    token = _require_default_route(value)
    route_workspace_id = _extract_workspace_id_from_route(token)
    if token.startswith("/w/") and route_workspace_id is None:
        raise HTTPException(status_code=400, detail="default_route must target a valid workspace route.")
    if route_workspace_id is None:
        return token
    if not workspace_id:
        raise HTTPException(
            status_code=400,
            detail="default_route must be workspace-relative and may not target another workspace.",
        )
    if route_workspace_id != workspace_id:
        raise HTTPException(
            status_code=400,
            detail="default_route must resolve inside the current workspace.",
        )
    return token


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _workspace_summary_payload(workspace_record: Dict[str, Any]) -> Dict[str, Any]:
    metadata = _coerce_dict(workspace_record.get("metadata"))
    shell = _coerce_dict(metadata.get("shell"))
    workspace_id = str(workspace_record.get("workspace_id") or "").strip()
    label = str(workspace_record.get("name") or "").strip() or workspace_id
    preferred_shell_profile_id = str(shell.get("preferredProfile") or "").strip() or None
    default_route = control_plane_repository._normalize_workspace_default_route(
        workspace_id,
        shell.get("defaultRoute") or "/chat",
    )
    setup_completed = bool(shell.get("setupCompleted")) and bool(label) and bool(preferred_shell_profile_id)

    return {
        "workspace": {
            "id": workspace_id,
            "tenantId": str(workspace_record.get("tenant_id") or "").strip(),
            "label": label,
            "kind": str(
                workspace_record.get("workspace_type")
                or workspace_record.get("kind")
                or "personal"
            ).strip()
            or "personal",
        },
        "defaultRoute": default_route,
        "preferredShellProfileId": preferred_shell_profile_id,
        "setupCompleted": setup_completed,
        "requiresOnboarding": not setup_completed,
    }


class WorkspaceCreateRequest(BaseModel):
    name: str
    workspace_type: str
    preferred_shell_profile: str
    default_route: str
    tenant_id: Optional[str] = None


class WorkspaceUpdateRequest(BaseModel):
    name: Optional[str] = None
    workspace_type: Optional[str] = None
    preferred_shell_profile: Optional[str] = None
    default_route: Optional[str] = None
    setup_completed: Optional[bool] = None


class WorkspaceInviteRequest(BaseModel):
    email: str
    role: str = "member"


class WorkspaceMemberUpdateRequest(BaseModel):
    role: str


class WorkspacePoliciesUpdateRequest(BaseModel):
    capabilities: Optional[Dict[str, list[str]]] = None
    dangerous_action_classes: Optional[Dict[str, list[str]]] = None
    connectors: Optional[Dict[str, list[str]]] = None
    machine_enrollment_scope: Optional[str] = None
    trusted_owner_machine_ids: Optional[list[str]] = None


class WorkspaceRoutingUpdateRequest(BaseModel):
    admin_defaults: Optional[Dict[str, Any]] = None


@router.get("/workspaces")
async def list_workspaces(
    current_user=Depends(get_current_user),
):
    user = auth_module.get_authenticated_user_record(current_user)
    memberships = auth_module.list_authenticated_workspace_memberships(current_user)
    membership_index = {
        str(item.get("workspace_id") or "").strip(): dict(item)
        for item in memberships
        if isinstance(item, dict) and str(item.get("workspace_id") or "").strip()
    }
    workspaces = await control_plane_repository.list_workspaces_for_user(str(user.get("id") or "").strip())
    return {
        "items": [
            {
                **_workspace_summary_payload(workspace_record),
                "role": auth_module.normalize_rbac_role(
                    membership_index.get(str(workspace_record.get("workspace_id") or "").strip(), {}).get("role"),
                    default="viewer",
                ),
            }
            for workspace_record in workspaces
        ]
    }


@router.post("/workspaces")
async def create_workspace(
    body: WorkspaceCreateRequest,
    current_user=Depends(get_current_user),
):
    user = auth_module.get_authenticated_user_record(current_user)
    clean_name = str(body.name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="name is required.")

    workspace_record = await control_plane_repository.create_workspace_for_user(
        user_id=str(user.get("id") or "").strip(),
        tenant_id=None,
        name=clean_name,
        workspace_type=_require_workspace_type(body.workspace_type),
        preferred_shell_profile=_require_shell_profile(body.preferred_shell_profile),
        default_route=_require_workspace_default_route(body.default_route),
    )
    if not isinstance(workspace_record, dict):
        raise HTTPException(status_code=500, detail="Workspace could not be created.")
    return _workspace_summary_payload(workspace_record)


@router.patch("/workspaces/{workspace_id}")
async def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdateRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="owner",
    )

    updates: Dict[str, Any] = {}
    if body.name is not None:
        clean_name = str(body.name or "").strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="name cannot be empty.")
        updates["name"] = clean_name
    if body.workspace_type is not None:
        updates["workspace_type"] = _require_workspace_type(body.workspace_type)
    if body.preferred_shell_profile is not None:
        updates["preferred_shell_profile"] = _require_shell_profile(body.preferred_shell_profile)
    if body.default_route is not None:
        updates["default_route"] = _require_workspace_default_route(
            body.default_route,
            workspace_id=resolved_workspace_id,
        )
    if body.setup_completed is not None:
        updates["setup_completed"] = bool(body.setup_completed)
    if not updates:
        raise HTTPException(status_code=400, detail="At least one workspace profile field must be supplied.")

    workspace_record = await control_plane_repository.update_workspace_profile(
        resolved_workspace_id,
        updates,
    )
    if not isinstance(workspace_record, dict):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return _workspace_summary_payload(workspace_record)


@router.get("/workspaces/{workspace_id}/bootstrap")
async def workspace_bootstrap(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await build_workspace_bootstrap(
        current_user=current_user,
        workspace_id=workspace_id,
    )


@router.get("/workspaces/{workspace_id}/channel-operations")
async def workspace_channel_operations(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await build_workspace_channel_operations(
        current_user=current_user,
        workspace_id=workspace_id,
    )


@router.get("/workspaces/{workspace_id}/routing")
async def workspace_routing(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.build_workspace_routing_payload(
        workspace_id=workspace_id,
        current_user=current_user,
    )


@router.patch("/workspaces/{workspace_id}/routing")
async def workspace_routing_update(
    workspace_id: str,
    body: WorkspaceRoutingUpdateRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    return await workspace_admin_service.update_workspace_routing_payload(
        workspace_id=workspace_id,
        current_user=current_user,
        payload=(
            body.model_dump(exclude_none=True)
            if hasattr(body, "model_dump")
            else body.dict(exclude_none=True)
        ),
    )


@router.get("/workspaces/{workspace_id}/members")
async def workspace_members(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.build_workspace_members_payload(
        workspace_id=workspace_id,
        current_user=current_user,
    )


@router.post("/workspaces/{workspace_id}/members/invites")
async def workspace_member_invites(
    workspace_id: str,
    body: WorkspaceInviteRequest,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.invite_workspace_member(
        workspace_id=workspace_id,
        current_user=current_user,
        email=body.email,
        role=body.role,
    )


@router.delete("/workspaces/{workspace_id}/members/invites/{invite_id}")
async def workspace_member_invite_revoke(
    workspace_id: str,
    invite_id: str,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.revoke_workspace_invite(
        workspace_id=workspace_id,
        current_user=current_user,
        invite_id=invite_id,
    )


@router.patch("/workspaces/{workspace_id}/members/{user_id}")
async def workspace_member_update(
    workspace_id: str,
    user_id: str,
    body: WorkspaceMemberUpdateRequest,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.update_workspace_member_role(
        workspace_id=workspace_id,
        current_user=current_user,
        user_id=user_id,
        role=body.role,
    )


@router.delete("/workspaces/{workspace_id}/members/{user_id}")
async def workspace_member_remove(
    workspace_id: str,
    user_id: str,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.remove_workspace_member(
        workspace_id=workspace_id,
        current_user=current_user,
        user_id=user_id,
    )


@router.get("/workspaces/{workspace_id}/policies")
async def workspace_policies(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.build_workspace_policies_payload(
        workspace_id=workspace_id,
        current_user=current_user,
    )


@router.patch("/workspaces/{workspace_id}/policies")
async def workspace_policies_update(
    workspace_id: str,
    body: WorkspacePoliciesUpdateRequest,
    current_user=Depends(get_current_user),
):
    return await workspace_admin_service.update_workspace_policies_payload(
        workspace_id=workspace_id,
        current_user=current_user,
        payload=(
            body.model_dump(exclude_none=True)
            if hasattr(body, "model_dump")
            else body.dict(exclude_none=True)
        ),
    )
