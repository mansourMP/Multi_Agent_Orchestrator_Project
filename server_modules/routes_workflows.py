from fastapi import APIRouter

from server_modules.app_registry_api import register_app_registry_routes
from server_modules.workflow_api import register_workflow_routes


router = APIRouter()

register_app_registry_routes(router)
register_workflow_routes(router)
