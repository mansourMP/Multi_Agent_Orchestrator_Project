from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server_modules import auth as auth_module
from server_modules import connected_external_agent_service
from server_modules import deployed_agent_service
from server_modules import runtime_attachment_service


router = APIRouter()
get_current_user = auth_module.get_current_user


class StudioWorkspaceRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)


class ConnectedExternalAgentCreateRequest(StudioWorkspaceRequest):
    name: str = Field(min_length=1, max_length=160)
    provider_kind: str = Field(default="custom", max_length=80)
    endpoints: Dict[str, Any] = Field(default_factory=dict)
    manifest: Dict[str, Any] = Field(default_factory=dict)
    secret_ref: Optional[str] = Field(default=None, max_length=240)


class ConnectedExternalAgentUpdateRequest(StudioWorkspaceRequest):
    name: Optional[str] = Field(default=None, max_length=160)
    provider_kind: Optional[str] = Field(default=None, max_length=80)
    endpoints: Optional[Dict[str, Any]] = None
    manifest: Optional[Dict[str, Any]] = None
    secret_ref: Optional[str] = Field(default=None, max_length=240)


class ConnectedExternalAgentChatRequest(StudioWorkspaceRequest):
    message: str = Field(min_length=1, max_length=16_000)
    recent_messages: list[Dict[str, Any]] = Field(default_factory=list)


def _workspace_scope(current_user: Any, workspace_id: str, *, minimum_role: str = "viewer") -> tuple[str, str]:
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role=minimum_role,
    )
    tenant_id = auth_module.workspace_tenant_id(current_user, resolved_workspace_id)
    return resolved_workspace_id, tenant_id


def _raise_service_error(error: Exception) -> None:
    raise connected_external_agent_service.http_error_from_exception(error) from error


@router.get("/studio/agent-surfaces")
async def list_studio_agent_surfaces(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, workspace_id, minimum_role="viewer")
    native_agents: list[dict[str, Any]] = []
    agent_computers: list[dict[str, Any]] = []
    try:
        native_payload = await deployed_agent_service.list_deployed_agents(
            current_user=current_user,
            owner_workspace_id=resolved_workspace_id,
        )
        native_agents = list(native_payload.get("items") or []) if isinstance(native_payload, dict) else []
    except Exception:
        native_agents = []
    try:
        runtime_payload = await runtime_attachment_service.list_workspace_runtime_attachments(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
        )
        agent_computers = list(runtime_payload.get("items") or []) if isinstance(runtime_payload, dict) else []
    except Exception:
        agent_computers = []
    return await connected_external_agent_service.build_agent_surfaces_payload(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        native_agents=native_agents,
        agent_computers=agent_computers,
    )


@router.get("/studio/external-agents")
async def list_connected_external_agents(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, workspace_id, minimum_role="viewer")
    return await connected_external_agent_service.list_connected_external_agents(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
    )


@router.post("/studio/external-agents")
async def create_connected_external_agent(
    body: ConnectedExternalAgentCreateRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="owner")
    try:
        return await connected_external_agent_service.create_connected_external_agent(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            name=body.name,
            provider_kind=body.provider_kind,
            endpoints=body.endpoints,
            manifest=body.manifest,
            secret_ref=body.secret_ref,
            created_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
    except Exception as error:
        _raise_service_error(error)


@router.get("/studio/external-agents/{external_agent_id}")
async def get_connected_external_agent(
    external_agent_id: str,
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, workspace_id, minimum_role="viewer")
    try:
        return await connected_external_agent_service.get_connected_external_agent(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            external_agent_id=external_agent_id,
        )
    except Exception as error:
        _raise_service_error(error)


@router.patch("/studio/external-agents/{external_agent_id}")
async def update_connected_external_agent(
    external_agent_id: str,
    body: ConnectedExternalAgentUpdateRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="owner")
    try:
        return await connected_external_agent_service.update_connected_external_agent(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            external_agent_id=external_agent_id,
            name=body.name,
            provider_kind=body.provider_kind,
            endpoints=body.endpoints,
            manifest=body.manifest,
            secret_ref=body.secret_ref,
        )
    except Exception as error:
        _raise_service_error(error)


@router.post("/studio/external-agents/{external_agent_id}/refresh-manifest")
async def refresh_connected_external_agent_manifest(
    external_agent_id: str,
    body: StudioWorkspaceRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="owner")
    try:
        return await connected_external_agent_service.refresh_connected_external_agent_manifest(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            external_agent_id=external_agent_id,
        )
    except Exception as error:
        _raise_service_error(error)


@router.post("/studio/external-agents/{external_agent_id}/chat-turn")
async def chat_with_connected_external_agent(
    external_agent_id: str,
    body: ConnectedExternalAgentChatRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="owner")
    try:
        return await connected_external_agent_service.chat_with_connected_external_agent(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            external_agent_id=external_agent_id,
            message=body.message,
            recent_messages=body.recent_messages,
        )
    except Exception as error:
        _raise_service_error(error)


@router.post("/studio/external-agents/{external_agent_id}/disconnect")
async def disconnect_connected_external_agent(
    external_agent_id: str,
    body: StudioWorkspaceRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id, tenant_id = _workspace_scope(current_user, body.workspace_id, minimum_role="owner")
    try:
        return await connected_external_agent_service.disconnect_connected_external_agent(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            external_agent_id=external_agent_id,
        )
    except Exception as error:
        _raise_service_error(error)
