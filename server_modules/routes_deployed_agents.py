from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server_modules import auth as auth_module
from server_modules import deployed_agent_service
from server_modules.deployed_agent_admin_dashboard_service import get_deployed_agent_admin_dashboard_service


router = APIRouter()
get_current_user = auth_module.get_current_user


class DeployedAgentCreateRequest(BaseModel):
    workspace_id: str
    name: str
    avatar: Optional[str] = None
    persona: str = ""
    system_prompt: str = ""
    channels: Dict[str, Any] = Field(default_factory=dict)
    knowledge_sources: list[Dict[str, Any]] = Field(default_factory=list)
    runtime_target: Optional[str] = None
    billing_plan: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    config: Optional[Dict[str, Any]] = None
    runtime_profile_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None


class DeployedAgentUpdateRequest(BaseModel):
    workspace_id: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    persona: Optional[str] = None
    system_prompt: Optional[str] = None
    deployment_state: Optional[str] = None
    channels: Optional[Dict[str, Any]] = None
    knowledge_sources: Optional[list[Dict[str, Any]]] = None
    runtime_target: Optional[str] = None
    billing_plan: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    is_public: Optional[bool] = None
    category: Optional[str] = None
    quality_stars: Optional[int] = Field(default=None, ge=1, le=5)
    cost_tier: Optional[str] = None


class DeployedAgentWorkspaceRequest(BaseModel):
    workspace_id: str


class DeployedAgentExternalUserDeleteRequest(BaseModel):
    workspace_id: str
    channel: str
    session_id: Optional[str] = None
    note: Optional[str] = None


def _raise_for_value_error(error: ValueError, *, default_status: int = 400) -> None:
    message = str(error)
    if "transition" in message.lower() or "live deployment" in message.lower():
        raise HTTPException(status_code=409, detail=message) from error
    raise HTTPException(status_code=default_status, detail=message) from error


@router.post("/deployed-agents")
async def create_deployed_agent(
    body: DeployedAgentCreateRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    try:
        payload = await deployed_agent_service.create_draft_deployed_agent(
            current_user=current_user,
            owner_workspace_id=body.workspace_id,
            name=body.name,
            avatar=body.avatar,
            persona=body.persona,
            system_prompt=body.system_prompt,
            channels=body.channels,
            knowledge_sources=body.knowledge_sources,
            runtime_target=body.runtime_target,
            billing_plan=body.billing_plan,
            metadata=body.metadata,
            config=body.config,
            runtime_profile_id=body.runtime_profile_id,
            provider=body.provider,
            model=body.model,
        )
    except HTTPException:
        raise
    except ValueError as error:
        _raise_for_value_error(error)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Deployed agent could not be created.")
    return payload


@router.get("/deployed-agents")
async def list_deployed_agents(
    workspace_id: str,
    deployment_state: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    return await deployed_agent_service.list_deployed_agents(
        current_user=current_user,
        owner_workspace_id=workspace_id,
        deployment_state=deployment_state,
    )


@router.get("/deployed-agents/analytics")
async def list_deployed_agent_analytics(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await deployed_agent_service.list_deployed_agent_analytics(
        current_user=current_user,
        owner_workspace_id=workspace_id,
    )


@router.get("/deployed-agents/{deployed_agent_id}/analytics")
async def get_deployed_agent_analytics(
    deployed_agent_id: str,
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    payload = await deployed_agent_service.get_deployed_agent_analytics(
        deployed_agent_id=deployed_agent_id,
        current_user=current_user,
        owner_workspace_id=workspace_id,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.get("/deployed-agents/{deployed_agent_id}/admin-dashboard")
async def get_deployed_agent_admin_dashboard(
    deployed_agent_id: str,
    workspace_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor_last_message_at: Optional[str] = None,
    cursor_external_user_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    return await get_deployed_agent_admin_dashboard_service().get_dashboard(
        agent_id=deployed_agent_id,
        workspace_id=workspace_id,
        current_user=current_user,
        limit=limit,
        offset=offset,
        cursor_last_message_at=cursor_last_message_at,
        cursor_external_user_id=cursor_external_user_id,
    )


@router.get("/deployed-agents/{deployed_agent_id}/memory")
async def list_deployed_agent_memory_entries(
    deployed_agent_id: str,
    workspace_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(get_current_user),
):
    payload = await deployed_agent_service.list_deployed_agent_memory_entries(
        deployed_agent_id=deployed_agent_id,
        current_user=current_user,
        owner_workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.get("/deployed-agents/telegram-readiness")
async def get_deployed_agent_telegram_readiness(
    workspace_id: str,
    deployed_agent_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    try:
        payload = await deployed_agent_service.get_deployed_agent_telegram_readiness(
            current_user=current_user,
            owner_workspace_id=workspace_id,
            deployed_agent_id=deployed_agent_id,
        )
    except HTTPException:
        raise
    except ValueError as error:
        _raise_for_value_error(error)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Telegram readiness is unavailable.")
    return payload


@router.get("/deployed-agents/{deployed_agent_id}")
async def get_deployed_agent(
    deployed_agent_id: str,
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    payload = await deployed_agent_service.get_deployed_agent_detail(
        deployed_agent_id=deployed_agent_id,
        current_user=current_user,
        owner_workspace_id=workspace_id,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.patch("/deployed-agents/{deployed_agent_id}")
async def update_deployed_agent(
    deployed_agent_id: str,
    body: DeployedAgentUpdateRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    updates = body.model_dump(exclude_none=True)
    updates.pop("workspace_id", None)
    try:
        payload = await deployed_agent_service.update_deployed_agent(
            deployed_agent_id=deployed_agent_id,
            current_user=current_user,
            owner_workspace_id=body.workspace_id,
            updates=updates,
        )
    except HTTPException:
        raise
    except ValueError as error:
        _raise_for_value_error(error)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.post("/deployed-agents/{deployed_agent_id}/deploy")
async def deploy_deployed_agent(
    deployed_agent_id: str,
    body: DeployedAgentWorkspaceRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    try:
        payload = await deployed_agent_service.deploy_deployed_agent(
            deployed_agent_id=deployed_agent_id,
            current_user=current_user,
            owner_workspace_id=body.workspace_id,
        )
    except HTTPException:
        raise
    except ValueError as error:
        _raise_for_value_error(error, default_status=409)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.post("/deployed-agents/{deployed_agent_id}/pause")
async def pause_deployed_agent(
    deployed_agent_id: str,
    body: DeployedAgentWorkspaceRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    try:
        payload = await deployed_agent_service.pause_deployed_agent(
            deployed_agent_id=deployed_agent_id,
            current_user=current_user,
            owner_workspace_id=body.workspace_id,
        )
    except HTTPException:
        raise
    except ValueError as error:
        _raise_for_value_error(error, default_status=409)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.get("/deployed-agents/{deployed_agent_id}/conversations")
async def list_deployed_agent_conversations(
    deployed_agent_id: str,
    workspace_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(get_current_user),
):
    payload = await deployed_agent_service.list_deployed_agent_conversations(
        deployed_agent_id=deployed_agent_id,
        current_user=current_user,
        owner_workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Deployed agent not found.")
    return payload


@router.get("/deployed-agents/{deployed_agent_id}/conversations/{session_id}")
async def get_deployed_agent_conversation_detail(
    deployed_agent_id: str,
    session_id: str,
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    payload = await deployed_agent_service.get_deployed_agent_conversation_detail(
        deployed_agent_id=deployed_agent_id,
        session_id=session_id,
        current_user=current_user,
        owner_workspace_id=workspace_id,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return payload


@router.post("/deployed-agents/{deployed_agent_id}/external-users/{external_user_id}/delete")
async def delete_deployed_agent_external_user_data(
    deployed_agent_id: str,
    external_user_id: str,
    body: DeployedAgentExternalUserDeleteRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    try:
        payload = await deployed_agent_service.delete_deployed_agent_external_user_data(
            deployed_agent_id=deployed_agent_id,
            external_user_id=external_user_id,
            channel_key=body.channel,
            current_user=current_user,
            owner_workspace_id=body.workspace_id,
            note=body.note,
            session_id=body.session_id,
        )
    except HTTPException:
        raise
    except ValueError as error:
        _raise_for_value_error(error)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=404, detail="Customer record not found.")
    return payload
