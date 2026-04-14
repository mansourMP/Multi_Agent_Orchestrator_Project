from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from server_modules.auth import (
    auth_cookie_refresh_token,
    auth_provider_options,
    browser_auth_session_channel,
    clear_auth_cookies,
    enterprise_status_for_user,
    ensure_public_registration_enabled,
    get_authenticated_user_profile,
    list_authenticated_user_devices,
    get_current_user,
    limit_login_requests,
    limit_public_requests,
    login_user,
    load_tenant_enterprise_settings,
    logout_authenticated_session,
    provision_user_account,
    register_user,
    refresh_authenticated_session,
    require_admin_access,
    revoke_authenticated_user_device,
    set_auth_cookies,
    upsert_tenant_enterprise_settings,
    update_authenticated_user_profile,
    validate_csrf,
)
from server_modules.account_shell_service import build_account_shell_payload
from server_modules.channel_pairing_service import (
    create_authenticated_channel_pairing_intent,
    list_authenticated_channel_links,
    revoke_authenticated_channel_link,
)
from server_modules.channel_user_acquisition_service import CHANNEL_ATTRIBUTION_QUERY_PARAM
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
    refresh_token: Optional[str] = None
    channel: Optional[str] = None
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


def _sanitize_browser_auth_payload(payload: dict[str, Any]) -> dict[str, Any]:
    clean_payload = dict(payload or {})
    clean_payload.pop("token", None)
    clean_payload.pop("session_recovery", None)
    return clean_payload


def _resolved_acquisition_token(request: Optional[Request], token: Optional[str]) -> Optional[str]:
    explicit = str(token or "").strip()
    if explicit:
        return explicit
    if request is None:
        return None
    query_value = str(request.query_params.get(CHANNEL_ATTRIBUTION_QUERY_PARAM) or "").strip()
    if query_value:
        return query_value
    header_value = str(request.headers.get("x-channel-attribution") or "").strip()
    return header_value or None


@router.post("/auth/login", dependencies=[Depends(limit_login_requests)])
async def login(body: AuthLoginRequest, request: Request, response: Response):
    payload = login_user(
        body.email,
        body.password,
        acquisition_token=_resolved_acquisition_token(request, body.acquisition_token),
        channel=body.channel,
        device_id=body.device_id,
        device_name=body.device_name,
        device_platform=body.device_platform,
        workspace_id=body.workspace_id,
        session_ttl_seconds=body.session_ttl_seconds,
    )
    if browser_auth_session_channel(body.channel):
        set_auth_cookies(response, payload, request=request, channel=body.channel)
        return _sanitize_browser_auth_payload(payload)
    return payload


@router.post("/auth/register", dependencies=[Depends(limit_public_requests), Depends(ensure_public_registration_enabled)])
async def register(body: AuthRegisterRequest, request: Request, response: Response):
    payload = register_user(
        body.email,
        body.password,
        name=body.name,
        acquisition_token=_resolved_acquisition_token(request, body.acquisition_token),
        channel=body.channel,
        device_id=body.device_id,
        device_name=body.device_name,
        device_platform=body.device_platform,
        workspace_id=body.workspace_id,
        session_ttl_seconds=body.session_ttl_seconds,
    )
    if browser_auth_session_channel(body.channel):
        set_auth_cookies(response, payload, request=request, channel=body.channel)
        return _sanitize_browser_auth_payload(payload)
    return payload


async def signup(
    body: AuthRegisterRequest,
    request: Optional[Request] = None,
    response: Optional[Response] = None,
):
    if request is None and response is None:
        return await register(body)
    if request is None:
        request = Request(
            {
                "type": "http",
                "headers": [],
                "method": "POST",
                "path": "/auth/signup",
                "query_string": b"",
            }
        )
    if response is None:
        response = Response()
    return await register(body, request, response)


@router.post("/auth/signup", dependencies=[Depends(limit_public_requests), Depends(ensure_public_registration_enabled)])
async def signup_route(body: AuthRegisterRequest, request: Request, response: Response):
    return await signup(body, request, response)


@router.get("/auth/providers")
async def auth_providers():
    return auth_provider_options()


@router.get("/auth/me")
async def auth_me(current_user=Depends(get_current_user)):
    return get_authenticated_user_profile(current_user)


@router.get("/auth/account-shell")
async def auth_account_shell(current_user=Depends(get_current_user)):
    return await build_account_shell_payload(current_user)


@router.get("/auth/status")
async def auth_status(current_user=Depends(get_current_user)):
    profile = get_authenticated_user_profile(current_user)
    user = profile.get("user") if isinstance(profile, dict) else None
    return {"authenticated": True, "user": user}


@router.post("/auth/refresh")
async def refresh_session(body: AuthRefreshRequest, request: Request, response: Response):
    requested_channel = body.channel
    browser_session_request = False
    if not requested_channel and auth_cookie_refresh_token(request):
        requested_channel = "web"
        browser_session_request = True
    elif requested_channel is not None:
        browser_session_request = browser_auth_session_channel(requested_channel)
    if browser_session_request:
        validate_csrf(request)
    refresh_token = str(
        body.refresh_token
        or (auth_cookie_refresh_token(request) if browser_session_request else "")
        or ""
    ).strip()
    if not refresh_token:
        raise HTTPException(status_code=400, detail="refresh_token is required.")
    payload = refresh_authenticated_session(
        refresh_token,
        device_id=body.device_id,
        device_name=body.device_name,
        device_platform=body.device_platform,
        workspace_id=body.workspace_id,
        session_ttl_seconds=body.session_ttl_seconds,
    )
    response_channel = requested_channel or str(
        ((payload.get("auth_session") or {}).get("channel") if isinstance(payload, dict) else "") or ""
    ).strip()
    if browser_session_request or (response_channel and browser_auth_session_channel(response_channel)):
        set_auth_cookies(response, payload, request=request, channel=response_channel)
        return _sanitize_browser_auth_payload(payload)
    return payload


@router.post("/auth/logout")
async def logout(request: Request, response: Response, current_user=Depends(get_current_user)):
    validate_csrf(request)
    result = logout_authenticated_session(current_user)
    clear_auth_cookies(response, request=request)
    return result


@router.get("/auth/devices")
async def auth_devices(current_user=Depends(get_current_user)):
    return list_authenticated_user_devices(current_user)


@router.delete("/auth/devices/{device_id}")
async def auth_revoke_device(device_id: str, request: Request, current_user=Depends(get_current_user)):
    validate_csrf(request)
    return revoke_authenticated_user_device(current_user, device_id)


@router.post("/auth/channel-pairing/intents")
async def create_channel_pairing_intent(
    body: ChannelPairingIntentCreateRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    validate_csrf(request)
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
    request: Request,
    current_user=Depends(get_current_user),
):
    validate_csrf(request)
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
async def patch_auth_me(body: AuthMePatchRequest, request: Request, current_user=Depends(get_current_user)):
    validate_csrf(request)
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
    request: Request,
    current_user=Depends(require_admin_access),
):
    validate_csrf(request)
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
    request: Request,
    current_user=Depends(require_admin_access),
):
    validate_csrf(request)
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
