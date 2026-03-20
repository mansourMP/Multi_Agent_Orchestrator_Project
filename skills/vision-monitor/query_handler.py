from __future__ import annotations

import json
import sys
from typing import Any, Dict, List, Optional

from common import load_config, load_current_state, load_space_configs


def _space_entries(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [item for item in load_space_configs(config) if isinstance(item, dict)]


def _resolve_space(config: Dict[str, Any], query: str) -> Optional[Dict[str, Any]]:
    raw_query = str(query or "").strip().lower()
    spaces = _space_entries(config)
    for space in spaces:
        tokens = [str(space.get("space_id") or "").strip().lower(), str(space.get("space_name") or "").strip().lower()]
        aliases = space.get("aliases") if isinstance(space.get("aliases"), list) else []
        tokens.extend(str(item or "").strip().lower() for item in aliases if str(item or "").strip())
        for token in tokens:
            if token and token in raw_query:
                return space
    default_id = str((config.get("monitoring") if isinstance(config.get("monitoring"), dict) else {}).get("default_space_id") or "").strip()
    for space in spaces:
        if str(space.get("space_id") or "").strip() == default_id:
            return space
    return spaces[0] if spaces else None


def _load_current_state(config: Dict[str, Any], space: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = load_current_state(config, str(space.get("space_id") or "").strip())
    return payload if payload else None


def _build_prompt_append(space: Dict[str, Any], state: Dict[str, Any]) -> str:
    summary_lines = state.get("summary_lines") if isinstance(state.get("summary_lines"), list) else []
    lines = [str(item).strip() for item in summary_lines if str(item).strip()]
    prompt_lines = [
        f"Vision monitor context for space '{space.get('space_name') or space.get('space_id')}':",
        f"- space_id: {state.get('space_id')}",
        f"- timestamp: {state.get('timestamp')}",
        f"- occupancy_count: {state.get('occupancy_count')}",
        f"- status: {state.get('status')}",
        f"- confidence: {state.get('confidence')}",
    ]
    if lines:
        prompt_lines.append("- latest summary:")
        prompt_lines.extend(f"  - {line}" for line in lines[:5])
    return "\n".join(prompt_lines).strip()


def _status_label(status: str) -> str:
    raw = str(status or "").strip().lower()
    if raw.startswith("open"):
        return "open"
    if raw == "closed":
        return "closed"
    return raw or "unknown"


def _deterministic_answer(query: str, space: Dict[str, Any], state: Dict[str, Any]) -> str:
    raw_query = str(query or "").strip().lower()
    name = str(space.get("space_name") or space.get("space_id") or "The space").strip()
    occupancy = int(state.get("occupancy_count") or 0)
    status = _status_label(str(state.get("status") or "unknown"))
    timestamp = str(state.get("timestamp") or "").strip()
    business_state = str(state.get("business_state") or "").strip().lower()

    if any(token in raw_query for token in ("how many people", "how many are there", "occupancy", "people there", "crowded")):
        return f"{name} currently has {occupancy} people. Status is {status}. Last update: {timestamp or 'unknown'}."
    if any(token in raw_query for token in ("open", "closed")):
        open_label = business_state or status
        return f"{name} is currently {open_label}. Last update: {timestamp or 'unknown'}."
    if "clear" in raw_query:
        if occupancy == 0:
            return f"{name} looks clear right now. Last update: {timestamp or 'unknown'}."
        return f"{name} is not fully clear right now; I count {occupancy} people. Last update: {timestamp or 'unknown'}."
    if "issue" in raw_query or "anomal" in raw_query:
        anomalies = state.get("anomalies") if isinstance(state.get("anomalies"), list) else []
        if anomalies:
            return f"{name} has {len(anomalies)} noted issue(s): {', '.join(str(item).strip() for item in anomalies[:3])}."
        return f"No issues are currently flagged for {name}. Last update: {timestamp or 'unknown'}."
    return ""


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception:
        payload = {}
    query = str(payload.get("query") or "").strip()
    config = load_config()
    if not query or not bool(config.get("enabled")):
        print(json.dumps({"ok": True, "handled": False, "prompt_append": ""}))
        return 0

    space = _resolve_space(config, query)
    if not space:
        print(json.dumps({"ok": True, "handled": False, "prompt_append": ""}))
        return 0

    state = _load_current_state(config, space)
    if not state:
        print(
            json.dumps(
                {
                    "ok": True,
                    "handled": True,
                    "response": f"I do not have a live camera state for {space.get('space_name') or space.get('space_id')} yet. Run the vision monitor worker first.",
                    "prompt_append": "",
                    "metadata": {"space_id": str(space.get('space_id') or '').strip(), "state_available": False},
                }
            )
        )
        return 0

    response = _deterministic_answer(query, space, state)
    prompt_append = _build_prompt_append(space, state)
    print(
        json.dumps(
            {
                "ok": True,
                "handled": bool(response),
                "response": response,
                "prompt_append": prompt_append,
                "metadata": {
                    "space_id": str(space.get("space_id") or "").strip(),
                    "timestamp": str(state.get("timestamp") or "").strip(),
                },
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
