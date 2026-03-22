from fastapi import APIRouter

from server_modules.agent_workspace_api import register_agent_workspace_routes


router = APIRouter()

register_agent_workspace_routes(router)
