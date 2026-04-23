from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from server_modules import auth as auth_module
from server_modules.deployed_agent_marketplace_service import get_deployed_agent_marketplace_service
from server_modules import marketplace_distribution_service
from server_modules.schemas import (
    MarketplaceAgentListResponse,
    MarketplaceUpgradeClickRequest,
    MarketplaceUpgradeClickResponse,
)


router = APIRouter()
get_current_user = auth_module.get_current_user


class MarketplaceDistributionPackageRequest(BaseModel):
    package_id: Optional[str] = None
    kind: Optional[str] = Field(default=None, pattern="^(app|provider)$")
    label: str = Field(min_length=1)
    description: str = Field(min_length=1)
    category: Optional[str] = None
    publisher: Dict[str, Any] = Field(default_factory=dict)
    onboarding: Dict[str, Any] = Field(default_factory=dict)
    verification_status: Optional[str] = None
    review_state: Optional[str] = None
    health_state: Optional[str] = None
    policy_posture: Optional[str] = None
    approval_required: bool = False
    billing: Dict[str, Any] = Field(default_factory=dict)
    provider: Optional[Dict[str, Any]] = None
    app: Optional[Dict[str, Any]] = None


class MarketplaceDistributionRuntimeEventRequest(BaseModel):
    event_type: str = Field(min_length=1)
    health_state: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.get("/marketplace/agents", response_model=MarketplaceAgentListResponse)
async def list_marketplace_agents(
    category: Optional[str] = None,
    cost_tier: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
):
    return await get_deployed_agent_marketplace_service().list_public_agents(
        category=category,
        cost_tier=cost_tier,
        limit=limit,
        offset=offset,
    )


@router.post("/marketplace/upgrade-click", response_model=MarketplaceUpgradeClickResponse)
async def record_marketplace_upgrade_click(
    body: MarketplaceUpgradeClickRequest,
):
    return await get_deployed_agent_marketplace_service().record_upgrade_click(
        channel_attribution=body.channel_attribution,
        source=body.source,
        agent_id=body.agent_id,
    )


@router.get("/workspaces/{workspace_id}/marketplace/packages")
async def list_workspace_marketplace_packages(
    workspace_id: str,
    kind: Optional[str] = Query(default=None),
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    return marketplace_distribution_service.list_marketplace_packages(resolved_workspace_id, kind=kind)


@router.post("/workspaces/{workspace_id}/marketplace/providers")
async def register_workspace_marketplace_provider(
    workspace_id: str,
    body: MarketplaceDistributionPackageRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return marketplace_distribution_service.register_marketplace_package(
            resolved_workspace_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            payload={**body.model_dump(exclude_none=True), "kind": "provider"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/marketplace/apps")
async def register_workspace_marketplace_app(
    workspace_id: str,
    body: MarketplaceDistributionPackageRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return marketplace_distribution_service.register_marketplace_package(
            resolved_workspace_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            payload={**body.model_dump(exclude_none=True), "kind": "app"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/marketplace/packages/{package_id}/install")
async def install_workspace_marketplace_package(
    workspace_id: str,
    package_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return marketplace_distribution_service.install_marketplace_package(
            resolved_workspace_id,
            package_id=package_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/{workspace_id}/marketplace/packages/{package_id}/runtime-events")
async def record_workspace_marketplace_runtime_event(
    workspace_id: str,
    package_id: str,
    body: MarketplaceDistributionRuntimeEventRequest,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(current_user, workspace_id, minimum_role="member")
    try:
        return marketplace_distribution_service.record_marketplace_runtime_event(
            resolved_workspace_id,
            package_id=package_id,
            event_type=body.event_type,
            health_state=body.health_state,
            metadata=body.metadata,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
