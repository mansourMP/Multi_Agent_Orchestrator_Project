from __future__ import annotations

from typing import Any, Dict, List, Optional

from server_modules import direct_chat_context_service
from server_modules import direct_chat_metadata_service
from server_modules import skills_service


def normalize_tool_capabilities(availability: Any) -> List[Dict[str, Any]]:
    return skills_service.normalize_availability_capability_payloads(availability)


def tool_capability(availability: Dict[str, Any], tool_id: str) -> Optional[Dict[str, Any]]:
    token = str(tool_id or "").strip().lower()
    for item in normalize_tool_capabilities(availability):
        if item.get("id") == token:
            return item
    return None


def tool_connected(availability: Dict[str, Any], tool_id: str) -> bool:
    item = tool_capability(availability, tool_id)
    return bool(item and item.get("connected"))


def tool_runtime_usable(availability: Dict[str, Any], tool_id: str) -> Optional[bool]:
    item = tool_capability(availability, tool_id)
    if not isinstance(item, dict):
        return None
    return item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None


def local_worker_available(availability: Dict[str, Any]) -> bool:
    if not isinstance(availability, dict):
        return False
    runtime_ok = availability.get("runtime_ok")
    if isinstance(runtime_ok, bool):
        return runtime_ok
    return True


def active_run_count(workspace_id: str) -> int:
    try:
        from server_modules.shared import runs as live_runs
    except Exception:
        return 0
    return direct_chat_context_service.active_run_count(workspace_id, live_runs=live_runs)


def recent_run_prompts_for_suggestions(workspace_id: str) -> List[str]:
    try:
        from server_modules.shared import RUN_HISTORY, RUN_HISTORY_LOCK
    except Exception:
        return []
    with RUN_HISTORY_LOCK:
        history_items = list(RUN_HISTORY)
    return direct_chat_metadata_service.recent_run_prompts_for_suggestions(
        workspace_id,
        run_history=history_items,
    )
