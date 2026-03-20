from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


def _safe_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(path)


def _append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def write_space_state(spaces_root: Path, state: Dict[str, Any], *, history_item: Dict[str, Any] | None = None) -> Path:
    space_id = str(state.get("space_id") or "").strip()
    if not space_id:
        raise RuntimeError("State payload is missing space_id.")
    current_path = spaces_root / space_id / "current_state.json"
    _safe_write_json(current_path, state)
    history_payload = history_item if isinstance(history_item, dict) else state
    history_path = spaces_root / space_id / "history.jsonl"
    _append_jsonl(history_path, history_payload)
    return current_path
