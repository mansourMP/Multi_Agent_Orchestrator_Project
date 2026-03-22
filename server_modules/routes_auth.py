from fastapi import APIRouter

from server_modules.profile_api import register_profile_routes


router = APIRouter()

register_profile_routes(router)
