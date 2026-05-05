from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Depends

from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.installed_skills import list_installed_skills


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _skill_status(item: Dict[str, Any]) -> str:
    enabled = bool(item.get("enabled"))
    available = bool(item.get("available"))
    if enabled and available:
        return "active"
    if enabled and not available:
        return "gated"
    return "unavailable"


def _skill_reason(item: Dict[str, Any]) -> str | None:
    missing_bins = [
        _coerce_text(token)
        for token in list(item.get("missing_bins") or [])
        if _coerce_text(token)
    ]
    if missing_bins:
        return f"Missing runtime dependencies: {', '.join(missing_bins)}"
    if not bool(item.get("enabled")):
        return "Disabled for this workspace."
    return None


def register_sage_skills_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    member_dependency = getattr(_server, "require_api_key")

    @app.get("/api/sage-skills", dependencies=[Depends(member_dependency)])
    async def list_workspace_sage_skills(
        workspace_id: Optional[str] = None,
        current_user=Depends(member_dependency),
    ):
        resolved_workspace_id = enforce_workspace_access(
            current_user,
            workspace_id,
            minimum_role="viewer",
        )
        tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
        items = []
        for item in list_installed_skills(workspace_id=resolved_workspace_id):
            runtime_metadata = item.get("runtime_metadata") if isinstance(item.get("runtime_metadata"), dict) else {}
            items.append(
                {
                    "id": _coerce_text(item.get("id")),
                    "name": _coerce_text(item.get("name")) or "Skill",
                    "description": _coerce_text(item.get("description")) or None,
                    "enabled": bool(item.get("enabled")),
                    "available": bool(item.get("available")),
                    "status": _skill_status(item),
                    "reason": _skill_reason(item),
                    "source": _coerce_text(item.get("source")) or None,
                    "required_bins": [token for token in list(item.get("required_bins") or []) if _coerce_text(token)],
                    "missing_bins": [token for token in list(item.get("missing_bins") or []) if _coerce_text(token)],
                    "tools": [token for token in list(item.get("tools") or []) if _coerce_text(token)],
                    "slash_commands": [token for token in list(item.get("slash_commands") or []) if _coerce_text(token)],
                    "permission_label": _coerce_text(runtime_metadata.get("permission_label")) or None,
                    "action_class": _coerce_text(runtime_metadata.get("action_class")) or None,
                    "requires_approval": bool(runtime_metadata.get("requires_approval")),
                    "execution_mode": _coerce_text(runtime_metadata.get("execution_mode")) or None,
                    "allowed_runtime_modes": [
                        token for token in list(runtime_metadata.get("allowed_runtime_modes") or []) if _coerce_text(token)
                    ],
                }
            )
        return {
            "workspace_id": resolved_workspace_id,
            "tenant_id": tenant_id,
            "items": items,
            "summary": {
                "total_count": len(items),
                "active_count": len([item for item in items if item["status"] == "active"]),
                "gated_count": len([item for item in items if item["status"] == "gated"]),
                "unavailable_count": len([item for item in items if item["status"] == "unavailable"]),
            },
        }
