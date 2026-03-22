from fastapi import APIRouter, Depends

from server_modules.auth import limit_login_requests, limit_public_requests, login_user, register_user
from server_modules.profile_api import register_profile_routes
from server_modules.schemas import AuthLoginRequest, AuthRegisterRequest


router = APIRouter()


@router.post("/auth/login", dependencies=[Depends(limit_login_requests)])
async def login(body: AuthLoginRequest):
    return login_user(body.email, body.password)


@router.post("/auth/register", dependencies=[Depends(limit_public_requests)])
async def register(body: AuthRegisterRequest):
    return register_user(body.email, body.password, name=body.name)


register_profile_routes(router)
