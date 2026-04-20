from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from server_modules import control_plane_repository
from server_modules import deployed_agent_service
from server_modules.schemas import DeployedAgentAdminDashboardResponse


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


class DeployedAgentAdminDashboardService:
    async def get_dashboard(
        self,
        *,
        agent_id: str,
        workspace_id: str,
        current_user: Optional[Dict[str, Any]],
        limit: int = 50,
        offset: int = 0,
        cursor_last_message_at: Optional[str] = None,
        cursor_external_user_id: Optional[str] = None,
    ) -> DeployedAgentAdminDashboardResponse:
        resolved_workspace_id = deployed_agent_service.require_deployed_agent_admin_access(
            current_user=current_user,
            workspace_id=workspace_id,
        )
        workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
        if not isinstance(workspace, dict):
            raise HTTPException(status_code=400, detail="Workspace is unavailable.")
        tenant_id = _normalize_text(workspace.get("tenant_id"))
        if not tenant_id:
            raise HTTPException(status_code=400, detail="Workspace is missing a tenant binding.")
        payload = await control_plane_repository.get_deployed_agent_admin_dashboard(
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            deployed_agent_id=agent_id,
            limit=limit,
            offset=offset,
            cursor_last_message_at=cursor_last_message_at,
            cursor_external_user_id=cursor_external_user_id,
        )
        if not isinstance(payload, dict):
            raise HTTPException(status_code=404, detail="Deployed agent not found.")
        return DeployedAgentAdminDashboardResponse.model_validate(payload)


_SERVICE = DeployedAgentAdminDashboardService()


def get_deployed_agent_admin_dashboard_service() -> DeployedAgentAdminDashboardService:
    return _SERVICE
