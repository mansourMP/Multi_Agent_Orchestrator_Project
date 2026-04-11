from __future__ import annotations

from fastapi import APIRouter, Depends

from server_modules.auth import get_current_user
from server_modules.workspace_bootstrap_service import build_workspace_bootstrap


router = APIRouter()


@router.get("/workspaces/{workspace_id}/bootstrap")
async def workspace_bootstrap(
    workspace_id: str,
    current_user=Depends(get_current_user),
):
    return await build_workspace_bootstrap(
        current_user=current_user,
        workspace_id=workspace_id,
    )
