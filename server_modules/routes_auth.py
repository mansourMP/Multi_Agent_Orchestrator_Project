from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from server_modules.auth import (
    ORION_DEFAULT_TENANT_ID,
    enterprise_status_for_user,
    ensure_public_registration_enabled,
    get_authenticated_user_profile,
    get_current_user,
    limit_login_requests,
    limit_public_requests,
    login_user,
    load_tenant_enterprise_settings,
    provision_user_account,
    register_user,
    require_admin_access,
    upsert_tenant_enterprise_settings,
    update_authenticated_user_profile,
)
from server_modules.profile_api import register_profile_routes
from server_modules.schemas import AuthLoginRequest, AuthRegisterRequest


router = APIRouter()


class AuthMePatchRequest(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class EnterpriseSsoConfigPatchRequest(BaseModel):
    enabled: Optional[bool] = None
    provider: Optional[str] = None
    issuer_url: Optional[str] = None
    metadata_url: Optional[str] = None
    client_id: Optional[str] = None
    audience: Optional[str] = None
    domains: Optional[list[str]] = None
    scopes: Optional[list[str]] = None


class EnterpriseMfaConfigPatchRequest(BaseModel):
    required: Optional[bool] = None
    methods: Optional[list[str]] = None
    grace_period_hours: Optional[int] = None


class EnterpriseScimConfigPatchRequest(BaseModel):
    enabled: Optional[bool] = None
    base_url: Optional[str] = None
    provisioning_mode: Optional[str] = None
    last_token_rotation_at: Optional[int] = None


class EnterpriseConfigPatchRequest(BaseModel):
    tenant_id: Optional[str] = None
    sso: Optional[EnterpriseSsoConfigPatchRequest] = None
    mfa: Optional[EnterpriseMfaConfigPatchRequest] = None
    scim: Optional[EnterpriseScimConfigPatchRequest] = None


class AdminProvisionUserRequest(BaseModel):
    email: str
    name: Optional[str] = None
    tenant_id: Optional[str] = None
    workspace_roles: Optional[dict[str, str]] = None
    provisioning_source: Optional[str] = None
    external_id: Optional[str] = None
    auth_provider: Optional[str] = None
    sso_subject: Optional[str] = None


@router.post("/auth/login", dependencies=[Depends(limit_login_requests)])
async def login(body: AuthLoginRequest):
    return login_user(body.email, body.password)


@router.post("/auth/register", dependencies=[Depends(limit_public_requests), Depends(ensure_public_registration_enabled)])
async def register(body: AuthRegisterRequest):
    return register_user(body.email, body.password, name=body.name)


@router.get("/auth/me")
async def auth_me(current_user=Depends(get_current_user)):
    return get_authenticated_user_profile(current_user)


@router.get("/auth/status")
async def auth_status(current_user=Depends(get_current_user)):
    profile = get_authenticated_user_profile(current_user)
    user = profile.get("user") if isinstance(profile, dict) else None
    return {"authenticated": True, "user": user}


@router.get("/auth/enterprise/status")
async def auth_enterprise_status(current_user=Depends(get_current_user)):
    return enterprise_status_for_user(current_user)


@router.patch("/auth/me")
async def patch_auth_me(body: AuthMePatchRequest, current_user=Depends(get_current_user)):
    return update_authenticated_user_profile(current_user, name=body.name, avatar_url=body.avatar_url)


@router.get("/auth/admin/enterprise-config")
async def get_enterprise_config(
    tenant_id: Optional[str] = None,
    current_user=Depends(require_admin_access),
):
    resolved_tenant_id = str(tenant_id or ORION_DEFAULT_TENANT_ID).strip() or ORION_DEFAULT_TENANT_ID
    return {
        "ok": True,
        "tenant_id": resolved_tenant_id,
        "config": load_tenant_enterprise_settings(resolved_tenant_id),
    }


@router.patch("/auth/admin/enterprise-config")
async def patch_enterprise_config(
    body: EnterpriseConfigPatchRequest,
    current_user=Depends(require_admin_access),
):
    resolved_tenant_id = str(body.tenant_id or ORION_DEFAULT_TENANT_ID).strip() or ORION_DEFAULT_TENANT_ID
    config = upsert_tenant_enterprise_settings(
        resolved_tenant_id,
        sso=body.sso.model_dump(exclude_none=True) if body.sso is not None else None,
        mfa=body.mfa.model_dump(exclude_none=True) if body.mfa is not None else None,
        scim=body.scim.model_dump(exclude_none=True) if body.scim is not None else None,
    )
    return {"ok": True, "tenant_id": resolved_tenant_id, "config": config}


@router.post("/auth/admin/provision/users")
async def admin_provision_user(
    body: AdminProvisionUserRequest,
    current_user=Depends(require_admin_access),
):
    return provision_user_account(
        email=body.email,
        name=body.name,
        tenant_id=body.tenant_id,
        workspace_roles=body.workspace_roles,
        provisioning_source=body.provisioning_source or "admin_api",
        external_id=body.external_id,
        auth_provider=body.auth_provider,
        sso_subject=body.sso_subject,
    )


register_profile_routes(router)
