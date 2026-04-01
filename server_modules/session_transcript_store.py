from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules.agent_memory import save_daily_log


_REPO_ROOT = Path(__file__).resolve().parents[1]
_TRANSCRIPTS_ROOT = _REPO_ROOT / ".orion-stack" / "transcripts"


def _normalize_workspace_token(workspace_id: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(workspace_id or "default").strip()).strip("-")
    return token or "default"


def _transcript_dir(workspace_id: str) -> Path:
    path = _TRANSCRIPTS_ROOT / _normalize_workspace_token(workspace_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _compact_line(text: Any, limit: int = 320) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "").strip())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


def build_transcript_summary(
    *,
    messages: List[Dict[str, Any]],
    user_message: str,
    assistant_reply: str,
) -> str:
    notable_user_points: List[str] = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        if str(item.get("role") or "").strip().lower() != "user":
            continue
        content = _compact_line(item.get("content"), limit=220)
        if content:
            notable_user_points.append(content)
        if len(notable_user_points) >= 2:
            break
    primary_user_line = _compact_line(user_message, limit=280)
    if not primary_user_line and notable_user_points:
        primary_user_line = notable_user_points[0]
    assistant_line = _compact_line(assistant_reply, limit=420)
    lines = ["Transcript summary:"]
    if primary_user_line:
        lines.append(f"- Latest user request: {primary_user_line}")
    if notable_user_points:
        lines.append(f"- Earlier context: {' | '.join(notable_user_points[:2])}")
    if assistant_line:
        lines.append(f"- Outcome: {assistant_line}")
    return "\n".join(lines).strip()


def save_session_transcript(
    *,
    workspace_id: str,
    thread_id: str,
    provider: Optional[str],
    model: Optional[str],
    messages: List[Dict[str, Any]],
    user_message: str,
    assistant_reply: str,
) -> Dict[str, Any]:
    now = _utc_now()
    day_token = now.strftime("%Y-%m-%d")
    transcript_path = _transcript_dir(workspace_id) / f"{day_token}.jsonl"
    payload = {
        "timestamp": now.isoformat().replace("+00:00", "Z"),
        "workspace_id": _normalize_workspace_token(workspace_id),
        "thread_id": str(thread_id or "").strip() or None,
        "provider": str(provider or "").strip() or None,
        "model": str(model or "").strip() or None,
        "messages": [dict(item) for item in messages if isinstance(item, dict)],
    }
    with transcript_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")

    summary = build_transcript_summary(
        messages=messages,
        user_message=user_message,
        assistant_reply=assistant_reply,
    )
    if summary:
        try:
            save_daily_log(workspace_id, summary)
        except Exception:
            pass
    return {
        "path": str(transcript_path),
        "summary": summary,
    }
