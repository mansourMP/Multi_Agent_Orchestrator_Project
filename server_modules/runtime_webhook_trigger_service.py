from __future__ import annotations

import fnmatch
import time
from typing import Any, Callable, Optional


def load_webhook_triggers(
    triggers: dict[str, dict[str, Any]],
    *,
    lock: Any,
    loaded: bool,
    path: Any,
    safe_read_json: Callable[[Any, dict[str, Any]], Any],
) -> bool:
    with lock:
        if loaded:
            return loaded
        payload = safe_read_json(path, {"version": 1, "items": []})
        items = payload.get("items") if isinstance(payload, dict) else []
        triggers.clear()
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                trigger_id = str(item.get("id") or "").strip()
                if not trigger_id:
                    continue
                triggers[trigger_id] = dict(item)
        return True


def persist_webhook_triggers_locked(
    triggers: dict[str, dict[str, Any]],
    *,
    path: Any,
    safe_write_json: Callable[[Any, dict[str, Any]], None],
    now_ts: Optional[float] = None,
) -> None:
    safe_write_json(
        path,
        {
            "version": 1,
            "updated_at": float(now_ts or time.time()),
            "items": list(triggers.values()),
        },
    )


def match_webhook_trigger(
    triggers: dict[str, dict[str, Any]],
    *,
    lock: Any,
    workspace_id: str,
    request_url: str,
) -> Optional[dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    with lock:
        for item in triggers.values():
            if not isinstance(item, dict) or not bool(item.get("enabled", True)):
                continue
            if str(item.get("workspace_id") or "default").strip() != normalized_workspace_id:
                continue
            pattern = str(item.get("url_pattern") or "").strip()
            if not pattern or fnmatch.fnmatch(request_url, pattern) or fnmatch.fnmatch(
                f"/webhooks/ingest/{normalized_workspace_id}",
                pattern,
            ):
                return dict(item)
    return None


def build_webhook_trigger(
    *,
    trigger_id: str,
    workspace_id: str,
    url_pattern: str,
    workflow_id: str,
    user_goal: Any,
    metadata: Any,
    enabled: Any,
    now_ts: Optional[float] = None,
) -> dict[str, Any]:
    return {
        "id": str(trigger_id).strip(),
        "workspace_id": str(workspace_id or "default").strip() or "default",
        "url_pattern": str(url_pattern or "").strip(),
        "workflow_id": str(workflow_id or "").strip(),
        "user_goal": str(user_goal or "").strip() or None,
        "metadata": metadata if isinstance(metadata, dict) else {},
        "enabled": bool(enabled),
        "created_at": float(now_ts or time.time()),
    }
