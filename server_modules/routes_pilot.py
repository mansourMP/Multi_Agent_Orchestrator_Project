"""Pilot program API routes — invite management and validation."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from server_modules import auth, pilot_invite_service

router = APIRouter(prefix="/pilot", tags=["pilot"])


class PilotInviteCreateRequest(BaseModel):
    email: Optional[str] = None
    role: str = "owner"
    plan_id: str = "pilot"
    max_uses: int = 1
    expires_hours: Optional[int] = None


class PilotInviteValidateRequest(BaseModel):
    code: str


class PilotInviteClaimRequest(BaseModel):
    code: str


@router.post("/invites")
async def create_pilot_invite_route(
    body: PilotInviteCreateRequest,
    current_user=Depends(auth.require_admin_access),
) -> Dict[str, Any]:
    invite = await pilot_invite_service.create_pilot_invite(
        email=body.email,
        role=body.role,
        plan_id=body.plan_id,
        max_uses=body.max_uses,
        expires_hours=body.expires_hours,
        created_by_user_id=str(current_user.get("user_id") or "").strip() or None,
    )
    return {"ok": True, "invite": invite}


@router.get("/invites")
async def list_pilot_invites_route(
    current_user=Depends(auth.require_admin_access),
) -> Dict[str, Any]:
    invites = await pilot_invite_service.list_pilot_invites()
    return {"ok": True, "items": invites}


@router.post("/invites/validate")
async def validate_pilot_invite_route(body: PilotInviteValidateRequest) -> Dict[str, Any]:
    result = await pilot_invite_service.validate_pilot_invite_code(body.code)
    return {"ok": True, **result}


@router.post("/invites/claim")
async def claim_pilot_invite_route(body: PilotInviteClaimRequest) -> Dict[str, Any]:
    result = await pilot_invite_service.claim_pilot_invite_code(body.code)
    return {"ok": True, **result}


@router.delete("/invites/{invite_id}")
async def revoke_pilot_invite_route(
    invite_id: str,
    current_user=Depends(auth.require_admin_access),
) -> Dict[str, Any]:
    invite = await pilot_invite_service.revoke_pilot_invite(invite_id)
    return {"ok": True, "invite": invite}
