from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from server_modules import workspace_context


SAGE_MEMORY_CATEGORY_DEFINITIONS: dict[str, dict[str, str]] = {
    "work_context": {
        "label": "Work context",
        "description": "Current projects, priorities, and work context Sage should keep in mind.",
    },
    "personal_context": {
        "label": "Personal context",
        "description": "Important personal details Sage should remember about you.",
    },
    "top_of_mind": {
        "label": "Top of mind",
        "description": "What matters most right now.",
    },
    "brief_history": {
        "label": "Brief history",
        "description": "Short recent history that helps Sage keep continuity.",
    },
    "earlier_context": {
        "label": "Earlier context",
        "description": "Older context Sage may still need later.",
    },
    "long_term_background": {
        "label": "Long-term background",
        "description": "Durable background context Sage should carry forward.",
    },
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _state_file(workspace_id: str) -> Path:
    return workspace_context.workspace_scope_dir(workspace_id) / "sage_memory.json"


def _default_state() -> Dict[str, Any]:
    return {
        "version": 1,
        "updated_at": _utc_now_iso(),
        "entries": [],
    }


def _safe_read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        payload = _default_state()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    if not isinstance(raw.get("entries"), list):
        raw["entries"] = []
    return raw


def _save_state(workspace_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    path = _state_file(workspace_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = _utc_now_iso()
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _clip_text(value: Any, *, limit: int = 180) -> str:
    text = _coerce_text(value)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _require_category(category: str) -> dict[str, str]:
    definition = SAGE_MEMORY_CATEGORY_DEFINITIONS.get(_coerce_text(category))
    if not definition:
        raise HTTPException(status_code=400, detail="Unsupported Sage memory category.")
    return definition


def _normalize_history(items: Any) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": _coerce_text(item.get("id")) or f"memory-history-{uuid.uuid4().hex}",
                "action": _coerce_text(item.get("action")) or "updated",
                "actor_user_id": _coerce_text(item.get("actor_user_id")) or None,
                "occurred_at": _coerce_text(item.get("occurred_at")) or _utc_now_iso(),
                "note": _coerce_text(item.get("note")) or None,
            }
        )
    return normalized[:12]


def _normalize_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    category = _coerce_text(entry.get("category"))
    definition = _require_category(category)
    title = _coerce_text(entry.get("title"))
    content = _coerce_text(entry.get("content"))
    if not title:
        raise HTTPException(status_code=400, detail="Sage memory title is required.")
    if not content:
        raise HTTPException(status_code=400, detail="Sage memory content is required.")
    created_at = _coerce_text(entry.get("created_at")) or _utc_now_iso()
    updated_at = _coerce_text(entry.get("updated_at")) or created_at
    history = _normalize_history(entry.get("history"))
    return {
        "id": _coerce_text(entry.get("id")) or f"memory-{uuid.uuid4().hex}",
        "category": category,
        "category_label": definition["label"],
        "title": title,
        "content": content,
        "summary": _clip_text(content),
        "pinned": bool(entry.get("pinned")),
        "source": _coerce_text(entry.get("source")) or "manual",
        "source_label": _coerce_text(entry.get("source_label")) or "Saved manually",
        "created_at": created_at,
        "updated_at": updated_at,
        "updated_by": _coerce_text(entry.get("updated_by")) or None,
        "history": history,
    }


def _entry_sort_key(item: Dict[str, Any]) -> tuple[int, float, str]:
    updated_at = _coerce_text(item.get("updated_at"))
    try:
        updated_ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00")).timestamp() if updated_at else 0.0
    except ValueError:
        updated_ts = 0.0
    return (
        0 if bool(item.get("pinned")) else 1,
        -updated_ts,
        str(item.get("title") or ""),
    )


def _read_state(workspace_id: str) -> Dict[str, Any]:
    raw = _safe_read_json(_state_file(workspace_id))
    entries: List[Dict[str, Any]] = []
    for item in list(raw.get("entries") or []):
        if not isinstance(item, dict):
            continue
        try:
            entries.append(_normalize_entry(item))
        except HTTPException:
            continue
    raw["entries"] = sorted(entries, key=_entry_sort_key)
    return raw


def _entry_categories(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    counts = {category: 0 for category in SAGE_MEMORY_CATEGORY_DEFINITIONS}
    for entry in entries:
        category = _coerce_text(entry.get("category"))
        if category in counts:
            counts[category] += 1
    return [
        {
            "id": category,
            "label": definition["label"],
            "description": definition["description"],
            "count": counts.get(category, 0),
        }
        for category, definition in SAGE_MEMORY_CATEGORY_DEFINITIONS.items()
    ]


def _summary(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "total_count": len(entries),
        "pinned_count": sum(1 for entry in entries if bool(entry.get("pinned"))),
        "category_counts": {
            category: sum(1 for entry in entries if entry.get("category") == category)
            for category in SAGE_MEMORY_CATEGORY_DEFINITIONS
        },
    }


def _history_event(*, action: str, actor_user_id: Optional[str], note: Optional[str] = None) -> Dict[str, Any]:
    return {
        "id": f"memory-history-{uuid.uuid4().hex}",
        "action": action,
        "actor_user_id": _coerce_text(actor_user_id) or None,
        "occurred_at": _utc_now_iso(),
        "note": _coerce_text(note) or None,
    }


def list_sage_memory(*, workspace_id: str) -> Dict[str, Any]:
    state = _read_state(workspace_id)
    entries = list(state.get("entries") or [])
    return {
        "items": entries,
        "categories": _entry_categories(entries),
        "summary": _summary(entries),
        "updated_at": state.get("updated_at"),
        "memory_context": build_sage_memory_context_block(workspace_id=workspace_id),
    }


def upsert_memory_entry(
    *,
    workspace_id: str,
    category: str,
    title: str,
    content: str,
    pinned: bool = False,
    actor_user_id: Optional[str] = None,
    entry_id: Optional[str] = None,
    source: str = "manual",
    source_label: str = "Saved manually",
) -> Dict[str, Any]:
    state = _read_state(workspace_id)
    entries = list(state.get("entries") or [])
    resolved_entry_id = _coerce_text(entry_id)
    matched_index = next((index for index, item in enumerate(entries) if _coerce_text(item.get("id")) == resolved_entry_id), -1)
    now = _utc_now_iso()

    if matched_index >= 0:
        existing = dict(entries[matched_index])
        history = _normalize_history(existing.get("history"))
        history.insert(0, _history_event(action="corrected", actor_user_id=actor_user_id))
        normalized = _normalize_entry(
            {
                **existing,
                "category": category,
                "title": title,
                "content": content,
                "pinned": pinned if pinned or bool(existing.get("pinned")) else False,
                "source": source,
                "source_label": source_label,
                "updated_at": now,
                "updated_by": _coerce_text(actor_user_id) or None,
                "history": history[:12],
            }
        )
        entries[matched_index] = normalized
    else:
        normalized = _normalize_entry(
            {
                "id": resolved_entry_id or None,
                "category": category,
                "title": title,
                "content": content,
                "pinned": pinned,
                "source": source,
                "source_label": source_label,
                "created_at": now,
                "updated_at": now,
                "updated_by": _coerce_text(actor_user_id) or None,
                "history": [_history_event(action="saved", actor_user_id=actor_user_id)],
            }
        )
        entries.insert(0, normalized)

    state["entries"] = entries
    _save_state(workspace_id, state)
    return {
        "entry": normalized,
        **list_sage_memory(workspace_id=workspace_id),
    }


def set_memory_entry_pinned(
    *,
    workspace_id: str,
    entry_id: str,
    pinned: bool,
    actor_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    state = _read_state(workspace_id)
    entries = list(state.get("entries") or [])
    for index, item in enumerate(entries):
        if _coerce_text(item.get("id")) != _coerce_text(entry_id):
            continue
        history = _normalize_history(item.get("history"))
        history.insert(
            0,
            _history_event(
                action="pinned" if pinned else "unpinned",
                actor_user_id=actor_user_id,
            ),
        )
        updated = _normalize_entry(
            {
                **item,
                "pinned": bool(pinned),
                "updated_at": _utc_now_iso(),
                "updated_by": _coerce_text(actor_user_id) or None,
                "history": history[:12],
            }
        )
        entries[index] = updated
        state["entries"] = entries
        _save_state(workspace_id, state)
        return {
            "entry": updated,
            **list_sage_memory(workspace_id=workspace_id),
        }
    raise HTTPException(status_code=404, detail="Sage memory entry not found.")


def delete_memory_entry(
    *,
    workspace_id: str,
    entry_id: str,
    actor_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    state = _read_state(workspace_id)
    entries = list(state.get("entries") or [])
    remaining: List[Dict[str, Any]] = []
    deleted: Optional[Dict[str, Any]] = None
    for item in entries:
        if deleted is None and _coerce_text(item.get("id")) == _coerce_text(entry_id):
            history = _normalize_history(item.get("history"))
            history.insert(0, _history_event(action="forgotten", actor_user_id=actor_user_id))
            deleted = {
                **item,
                "history": history[:12],
            }
            continue
        remaining.append(item)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Sage memory entry not found.")
    state["entries"] = remaining
    _save_state(workspace_id, state)
    return {
        "deleted": deleted,
        **list_sage_memory(workspace_id=workspace_id),
    }


def build_sage_memory_context_block(*, workspace_id: str, limit_per_category: int = 3) -> str:
    state = _read_state(workspace_id)
    entries = list(state.get("entries") or [])
    if not entries:
        return ""

    lines: List[str] = ["Sage memory"]
    for category, definition in SAGE_MEMORY_CATEGORY_DEFINITIONS.items():
        category_entries = [item for item in entries if item.get("category") == category][: max(1, int(limit_per_category))]
        if not category_entries:
            continue
        lines.append(f"{definition['label']}")
        for item in category_entries:
            pin_marker = " [pinned]" if bool(item.get("pinned")) else ""
            lines.append(
                f"- {str(item.get('title') or '').strip()}: {str(item.get('content') or '').strip()}{pin_marker}"
            )
    return "\n".join(lines).strip()
