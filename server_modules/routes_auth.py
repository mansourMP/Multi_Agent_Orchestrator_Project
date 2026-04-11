from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server_modules.auth import (
    auth_provider_options,
    enterprise_status_for_user,
    ensure_public_registration_enabled,
    get_authenticated_user_profile,
    list_authenticated_user_devices,
    get_current_user,
    limit_login_requests,
    limit_public_requests,
    login_user,
    load_tenant_enterprise_settings,
    provision_user_account,
    register_user,
    refresh_authenticated_session,
    require_admin_access,
    revoke_authenticated_user_device,
    upsert_tenant_enterprise_settings,
    update_authenticated_user_profile,
)
from server_modules.channel_pairing_service import (
    create_authenticated_channel_pairing_intent,
    list_authenticated_channel_links,
    revoke_authenticated_channel_link,
)
from server_modules.profile_api import register_profile_routes
from server_modules.schemas import AuthLoginRequest, AuthRegisterRequest


router = APIRouter()


def _require_tenant_id(value: Optional[str]) -> str:
    token = str(value or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="tenant_id is required.")
    return token


class AuthMePatchRequest(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class AuthRefreshRequest(BaseModel):
    refresh_token: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    device_platform: Optional[str] = None
    workspace_id: Optional[str] = None
    session_ttl_seconds: Optional[int] = None


class ChannelPairingIntentCreateRequest(BaseModel):
    provider: str
    workspace_id: Optional[str] = None
    scopes: Optional[list[str]] = None
    ttl_seconds: Optional[int] = None
    allow_relink: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


class ChannelLinkRevokeRequest(BaseModel):
    confirm: bool = False
    reason: Optional[str] = None


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
    return login_user(
        body.email,
        body.password,
        channel=body.channel,
        device_id=body.device_id,
        device_name=body.device_name,
        device_platform=body.device_platform,
        workspace_id=body.workspace_id,
        session_ttl_seconds=body.session_ttl_seconds,
    )


@router.post("/auth/register", dependencies=[Depends(limit_public_requests), Depends(ensure_public_registration_enabled)])
async def register(body: AuthRegisterRequest):
    return register_user(
        body.email,
        body.password,
        name=body.name,
        channel=body.channel,
        device_id=body.device_id,
        device_name=body.device_name,
        device_platform=body.device_platform,
        workspace_id=body.workspace_id,
        session_ttl_seconds=body.session_ttl_seconds,
    )


@router.post("/auth/signup", dependencies=[Depends(limit_public_requests), Depends(ensure_public_registration_enabled)])
async def signup(body: AuthRegisterRequest):
    return await register(body)


@router.get("/auth/providers")
async def auth_providers():
    return auth_provider_options()


@router.get("/auth/me")
async def auth_me(current_user=Depends(get_current_user)):
    return get_authenticated_user_profile(current_user)


@router.get("/auth/status")
async def auth_status(current_user=Depends(get_current_user)):
    profile = get_authenticated_user_profile(current_user)
    user = profile.get("user") if isinstance(profile, dict) else None
    return {"authenticated": True, "user": user}


@router.post("/auth/refresh")
async def refresh_session(body: AuthRefreshRequest):
    return refresh_authenticated_session(
        body.refresh_token,
        device_id=body.device_id,
        device_name=body.device_name,
        device_platform=body.device_platform,
        workspace_id=body.workspace_id,
        session_ttl_seconds=body.session_ttl_seconds,
    )


@router.get("/auth/devices")
async def auth_devices(current_user=Depends(get_current_user)):
    return list_authenticated_user_devices(current_user)


@router.delete("/auth/devices/{device_id}")
async def auth_revoke_device(device_id: str, current_user=Depends(get_current_user)):
    return revoke_authenticated_user_device(current_user, device_id)


@router.post("/auth/channel-pairing/intents")
async def create_channel_pairing_intent(
    body: ChannelPairingIntentCreateRequest,
    current_user=Depends(get_current_user),
):
    return create_authenticated_channel_pairing_intent(
        current_user,
        provider=body.provider,
        workspace_id=body.workspace_id,
        scopes=body.scopes,
        ttl_seconds=body.ttl_seconds,
        allow_relink=bool(body.allow_relink),
        metadata=body.metadata,
    )


@router.get("/auth/channel-pairing/links")
async def auth_channel_links(
    provider: Optional[str] = None,
    workspace_id: Optional[str] = None,
    include_revoked: bool = False,
    current_user=Depends(get_current_user),
):
    return list_authenticated_channel_links(
        current_user,
        provider=provider,
        workspace_id=workspace_id,
        include_revoked=include_revoked,
    )


@router.post("/auth/channel-pairing/links/{link_id}/revoke")
async def auth_revoke_channel_link(
    link_id: str,
    body: ChannelLinkRevokeRequest,
    current_user=Depends(get_current_user),
):
    return revoke_authenticated_channel_link(
        current_user,
        link_id=link_id,
        confirm=body.confirm,
        reason=body.reason,
    )


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
    resolved_tenant_id = _require_tenant_id(tenant_id)
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
    resolved_tenant_id = _require_tenant_id(body.tenant_id)
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
