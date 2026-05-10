from __future__ import annotations

from fastapi import Depends, HTTPException

from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.sage_agent_runtime_service import run_sage_chat_turn
from server_modules.schemas import SageChatRequest


def register_sage_chat_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    member_dependency = getattr(_server, "require_api_key")

    @app.post("/api/sage/chat", dependencies=[Depends(member_dependency)])
    async def sage_chat(
        body: SageChatRequest,
        current_user=Depends(member_dependency),
    ):
        if not body.workspace_id or not str(body.workspace_id).strip():
            raise HTTPException(status_code=400, detail="workspace_id is required.")
        if not body.message or not str(body.message).strip():
            raise HTTPException(status_code=400, detail="message must not be empty.")
        if str(body.mode or "").strip().lower() != "owner_sage":
            raise HTTPException(status_code=400, detail="Unsupported mode. Only owner_sage is allowed.")

        resolved_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            minimum_role="viewer",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)

        try:
            result = run_sage_chat_turn(
                workspace_id=resolved_workspace_id,
                message=str(body.message).strip(),
                surface=str(body.surface or "chat").strip() or "chat",
                mode="owner_sage",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **result,
        }
