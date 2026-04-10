from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules.memory_service import save_daily_log


_REPO_ROOT = Path(__file__).resolve().parents[1]
_TRANSCRIPTS_ROOT = _REPO_ROOT / ".orion-stack" / "transcripts"


def _normalize_workspace_token(workspace_id: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(workspace_id or "default").strip()).strip("-")
    return token or "default"


def _normalize_agent_token(agent_install_id: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(agent_install_id or "").strip()).strip("-")
    return token or "install"


def _transcript_dir(workspace_id: str, agent_install_id: str | None = None) -> Path:
    path = _TRANSCRIPTS_ROOT / _normalize_workspace_token(workspace_id)
    normalized_agent_install_id = str(agent_install_id or "").strip()
    if normalized_agent_install_id:
        path = path / "agents" / _normalize_agent_token(normalized_agent_install_id)
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


def _latest_message_by_role(messages: List[Dict[str, Any]], role: str) -> str:
    normalized_role = str(role or "").strip().lower()
    for item in reversed(list(messages or [])):
        if not isinstance(item, dict):
            continue
        if str(item.get("role") or "").strip().lower() != normalized_role:
            continue
        content = _compact_line(item.get("content"), limit=420)
        if content:
            return content
    return ""


def list_session_transcript_summaries(
    *,
    workspace_id: str,
    agent_install_id: str | None = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    transcript_dir = _transcript_dir(workspace_id, agent_install_id=agent_install_id)
    safe_limit = max(1, min(int(limit or 5), 20))
    out: List[Dict[str, Any]] = []
    transcript_files = sorted(transcript_dir.glob("*.jsonl"), reverse=True)
    for transcript_path in transcript_files:
        try:
            lines = transcript_path.read_text(encoding="utf-8").splitlines()
        except Exception:
            continue
        for raw_line in reversed(lines):
            if len(out) >= safe_limit:
                return out
            try:
                payload = json.loads(raw_line)
            except Exception:
                continue
            messages = [dict(item) for item in list(payload.get("messages") or []) if isinstance(item, dict)]
            summary = build_transcript_summary(
                messages=messages,
                user_message=_latest_message_by_role(messages, "user"),
                assistant_reply=_latest_message_by_role(messages, "assistant"),
            )
            out.append(
                {
                    "path": str(transcript_path),
                    "timestamp": str(payload.get("timestamp") or "").strip() or None,
                    "thread_id": str(payload.get("thread_id") or "").strip() or None,
                    "provider": str(payload.get("provider") or "").strip() or None,
                    "model": str(payload.get("model") or "").strip() or None,
                    "message_count": len(messages),
                    "summary": summary,
                }
            )
    return out


def save_session_transcript(
    *,
    workspace_id: str,
    agent_install_id: str | None = None,
    thread_id: str,
    provider: Optional[str],
    model: Optional[str],
    messages: List[Dict[str, Any]],
    user_message: str,
    assistant_reply: str,
) -> Dict[str, Any]:
    now = _utc_now()
    day_token = now.strftime("%Y-%m-%d")
    transcript_path = _transcript_dir(workspace_id, agent_install_id=agent_install_id) / f"{day_token}.jsonl"
    payload = {
        "timestamp": now.isoformat().replace("+00:00", "Z"),
        "workspace_id": _normalize_workspace_token(workspace_id),
        "agent_install_id": str(agent_install_id or "").strip() or None,
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
            save_daily_log(workspace_id, summary, agent_install_id=agent_install_id)
        except Exception:
            pass
    return {
        "path": str(transcript_path),
        "summary": summary,
    }
