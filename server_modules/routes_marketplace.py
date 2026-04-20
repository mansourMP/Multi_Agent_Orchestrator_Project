from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from server_modules.deployed_agent_marketplace_service import get_deployed_agent_marketplace_service
from server_modules.schemas import (
    MarketplaceAgentListResponse,
    MarketplaceUpgradeClickRequest,
    MarketplaceUpgradeClickResponse,
)


router = APIRouter()


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
