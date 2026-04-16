from __future__ import annotations

from typing import Optional

from fastapi import Depends

from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.sage_memory_service import (
    delete_memory_entry,
    list_sage_memory,
    set_memory_entry_pinned,
    upsert_memory_entry,
)
from server_modules.schemas import (
    SageMemoryEntryCreateRequest,
    SageMemoryEntryPinRequest,
    SageMemoryEntryUpdateRequest,
)


def register_sage_memory_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    member_dependency = getattr(_server, "require_api_key")

    @app.get("/api/sage-memory", dependencies=[Depends(member_dependency)])
    async def list_workspace_sage_memory(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id,
            minimum_role="viewer",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        payload = list_sage_memory(workspace_id=resolved_workspace_id)
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **payload,
        }

    @app.post("/api/sage-memory/entries", dependencies=[Depends(member_dependency)])
    async def create_workspace_sage_memory_entry(
        body: SageMemoryEntryCreateRequest,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            minimum_role="member",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        payload = upsert_memory_entry(
            workspace_id=resolved_workspace_id,
            category=body.category,
            title=body.title,
            content=body.content,
            pinned=bool(body.pinned),
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **payload,
        }

    @app.patch("/api/sage-memory/entries/{entry_id}", dependencies=[Depends(member_dependency)])
    async def update_workspace_sage_memory_entry(
        entry_id: str,
        body: SageMemoryEntryUpdateRequest,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            minimum_role="member",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        payload = upsert_memory_entry(
            workspace_id=resolved_workspace_id,
            entry_id=entry_id,
            category=body.category,
            title=body.title,
            content=body.content,
            pinned=bool(body.pinned),
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **payload,
        }

    @app.delete("/api/sage-memory/entries/{entry_id}", dependencies=[Depends(member_dependency)])
    async def delete_workspace_sage_memory_entry(
        entry_id: str,
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id,
            minimum_role="member",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        payload = delete_memory_entry(
            workspace_id=resolved_workspace_id,
            entry_id=entry_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **payload,
        }

    @app.post("/api/sage-memory/entries/{entry_id}/pin", dependencies=[Depends(member_dependency)])
    async def pin_workspace_sage_memory_entry(
        entry_id: str,
        body: SageMemoryEntryPinRequest,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            body.workspace_id,
            minimum_role="member",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        payload = set_memory_entry_pinned(
            workspace_id=resolved_workspace_id,
            entry_id=entry_id,
            pinned=bool(body.pinned),
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            **payload,
        }
