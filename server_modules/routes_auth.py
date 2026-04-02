from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from server_modules.auth import (
    ensure_public_registration_enabled,
    get_authenticated_user_profile,
    get_current_user,
    limit_login_requests,
    limit_public_requests,
    login_user,
    register_user,
    update_authenticated_user_profile,
)
from server_modules.profile_api import register_profile_routes
from server_modules.schemas import AuthLoginRequest, AuthRegisterRequest


router = APIRouter()


class AuthMePatchRequest(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


@router.post("/auth/login", dependencies=[Depends(limit_login_requests)])
async def login(body: AuthLoginRequest):
    return login_user(body.email, body.password)


@router.post("/auth/register", dependencies=[Depends(limit_public_requests), Depends(ensure_public_registration_enabled)])
async def register(body: AuthRegisterRequest):
    return register_user(body.email, body.password, name=body.name)


@router.get("/auth/me")
async def auth_me(current_user=Depends(get_current_user)):
    return get_authenticated_user_profile(current_user)


@router.patch("/auth/me")
async def patch_auth_me(body: AuthMePatchRequest, current_user=Depends(get_current_user)):
    return update_authenticated_user_profile(current_user, name=body.name, avatar_url=body.avatar_url)


register_profile_routes(router)
