from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException

from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.schemas import SageContextFileUpdateRequest
from server_modules.workspace_context import read_workspace_context_files, write_workspace_context_file


def register_sage_context_file_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    member_dependency = getattr(_server, "require_api_key")

    @app.get("/api/sage-context-files", dependencies=[Depends(member_dependency)])
    async def list_workspace_sage_context_files(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id,
            minimum_role="viewer",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        files = read_workspace_context_files(workspace_id=resolved_workspace_id)
        return {
            "ok": True,
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "files": [
                {
                    "filename": filename,
                    "content": str(content or ""),
                }
                for filename, content in files.items()
            ],
        }

    @app.patch("/api/sage-context-files/{filename:path}", dependencies=[Depends(member_dependency)])
    async def update_workspace_sage_context_file(
        filename: str,
        body: SageContextFileUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            minimum_role="member",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        try:
            saved = write_workspace_context_file(
                filename,
                body.content,
                workspace_id=resolved_workspace_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "filename": saved["filename"],
            "content": saved["content"],
        }
