from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from server_modules import auth as auth_module
from server_modules import billing_service


router = APIRouter()
get_current_user = auth_module.get_current_user


class BillingCheckoutRequest(BaseModel):
    workspace_id: str
    plan_id: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class BillingPortalRequest(BaseModel):
    workspace_id: str
    return_url: Optional[str] = None


@router.get("/billing/summary")
async def billing_summary(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="owner",
    )
    return await run_in_threadpool(
        billing_service.workspace_billing_summary_for_workspace_id,
        resolved_workspace_id,
    )


@router.post("/billing/checkout")
async def billing_checkout(
    body: BillingCheckoutRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        body.workspace_id,
        minimum_role="owner",
    )
    user = auth_module.get_authenticated_user_record(current_user)
    return await run_in_threadpool(
        billing_service.create_workspace_checkout_session,
        workspace_id=resolved_workspace_id,
        plan_id=body.plan_id,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        billing_email=str(user.get("email") or "").strip().lower() or None,
    )


@router.post("/billing/portal")
async def billing_portal(
    body: BillingPortalRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    auth_module.validate_csrf(request)
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        body.workspace_id,
        minimum_role="owner",
    )
    return await run_in_threadpool(
        billing_service.create_workspace_portal_session,
        workspace_id=resolved_workspace_id,
        return_url=body.return_url,
    )


@router.post("/billing/webhooks/stripe")
async def stripe_billing_webhook(request: Request):
    body = await request.body()
    signature = str(request.headers.get("stripe-signature") or "").strip()
    return await run_in_threadpool(
        billing_service.handle_stripe_webhook,
        body,
        signature,
    )
