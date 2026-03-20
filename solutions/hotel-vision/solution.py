from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from fastapi.responses import FileResponse, Response

SOLUTION_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SOLUTION_DIR.parent.parent
VISION_QUERY_HANDLER = PROJECT_ROOT / "skills" / "vision-monitor" / "query_handler.py"


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    items: List[Dict[str, Any]] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                items.append(parsed)
        except Exception:
            continue
    return items


def _write_jsonl(path: Path, items: Iterable[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in items), encoding="utf-8")


def _load_install(solution: Dict[str, Any]) -> Dict[str, Any]:
    return solution.get("install") if isinstance(solution.get("install"), dict) else {}


def _solution_roots(solution: Dict[str, Any]) -> List[Path]:
    install = _load_install(solution)
    demo_root = SOLUTION_DIR / "demo" / "spaces"
    roots: List[Path] = []
    for raw in install.get("data_roots") if isinstance(install.get("data_roots"), list) else []:
        token = str(raw or "").strip()
        if not token:
            continue
        if token.startswith("/solutions/hotel-vision/demo/spaces"):
            candidate = demo_root
        elif token.startswith("/spaces"):
            candidate = PROJECT_ROOT / "spaces"
        else:
            candidate = (PROJECT_ROOT / token.lstrip("/")).resolve()
        roots.append(candidate.resolve())
    if not roots:
        roots = [(PROJECT_ROOT / "spaces").resolve(), demo_root.resolve()]
    unique: List[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        unique.append(root)
    return unique


def _space_dirs(solution: Dict[str, Any]) -> Dict[str, Path]:
    dirs: Dict[str, Path] = {}
    for root in reversed(_solution_roots(solution)):
        if not root.exists():
            continue
        for entry in root.iterdir():
            if not entry.is_dir():
                continue
            if entry.name.startswith("_"):
                continue
            dirs[entry.name] = entry
    return dict(sorted(dirs.items(), key=lambda item: item[0].lower()))


def _load_space_config(space_dir: Path) -> Dict[str, Any]:
    config_path = space_dir / "config.json"
    config = _read_json(config_path)
    if config:
        return config
    return {
        "space_id": space_dir.name,
        "space_name": space_dir.name.replace("-", " ").title(),
        "camera_url": "",
        "business_hours": {"mon-sun": "00:00-23:59"},
        "scan_cadence_minutes": 5,
        "busy_threshold": 15,
        "telegram_recipients": [],
    }


def _load_current_state(space_dir: Path) -> Dict[str, Any]:
    return _read_json(space_dir / "current_state.json")


def _load_history(space_dir: Path, *, hours: int = 24) -> List[Dict[str, Any]]:
    items = _read_jsonl(space_dir / "history.jsonl")
    legacy_dir = space_dir / "history"
    if legacy_dir.exists():
        for legacy_file in sorted(legacy_dir.glob("*.jsonl")):
            items.extend(_read_jsonl(legacy_file))
    cutoff = datetime.now().astimezone() - timedelta(hours=max(1, hours))
    filtered: List[Dict[str, Any]] = []
    for item in items:
        ts = str(item.get("ts") or item.get("timestamp") or "").strip()
        try:
            parsed = datetime.fromisoformat(ts)
        except Exception:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if parsed >= cutoff:
            filtered.append(item)
    return sorted(filtered, key=lambda item: str(item.get("ts") or item.get("timestamp") or ""))


def _load_alerts(space_dir: Path) -> List[Dict[str, Any]]:
    return _read_jsonl(space_dir / "alerts.jsonl")


def _space_card(space_dir: Path) -> Dict[str, Any]:
    config = _load_space_config(space_dir)
    state = _load_current_state(space_dir)
    summary_lines = state.get("summary_lines") if isinstance(state.get("summary_lines"), list) else []
    summary_line = str(summary_lines[0] if summary_lines else "").strip()
    unresolved_alerts = [item for item in _load_alerts(space_dir) if not bool(item.get("resolved"))]
    snapshot_path = str(state.get("snapshot_path") or "").strip()
    return {
        "space_id": str(config.get("space_id") or space_dir.name).strip(),
        "space_name": str(config.get("space_name") or config.get("space_id") or space_dir.name).strip(),
        "camera_url": str(config.get("camera_url") or "").strip(),
        "hotel_name": str(config.get("hotel_name") or "").strip() or None,
        "timezone": str(config.get("timezone") or "").strip() or None,
        "business_hours": config.get("business_hours") if isinstance(config.get("business_hours"), dict) else {},
        "scan_cadence_minutes": int(config.get("scan_cadence_minutes") or 5),
        "busy_threshold": int(config.get("busy_threshold") or 15),
        "telegram_recipients": [str(item).strip() for item in (config.get("telegram_recipients") if isinstance(config.get("telegram_recipients"), list) else []) if str(item).strip()],
        "status": str(state.get("status") or "unknown").strip() or "unknown",
        "occupancy_count": int(state.get("occupancy_count") or 0),
        "updated_at": str(state.get("timestamp") or "").strip() or None,
        "confidence": float(state.get("confidence") or 0),
        "summary_line": summary_line,
        "summary_lines": [str(item).strip() for item in summary_lines if str(item).strip()],
        "snapshot_path": snapshot_path or None,
        "snapshot_url": f"/api/solutions/hotel-vision/spaces/{space_dir.name}/snapshot",
        "current_state": state,
        "unresolved_alert_count": len(unresolved_alerts),
    }


def _now_label(now: datetime, values: Iterable[str]) -> Optional[str]:
    latest: Optional[datetime] = None
    for value in values:
        token = str(value or "").strip()
        if not token:
            continue
        try:
            parsed = datetime.fromisoformat(token)
        except Exception:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=now.tzinfo)
        if latest is None or parsed > latest:
            latest = parsed
    return latest.isoformat() if latest else None


def build_status(solution: Dict[str, Any]) -> Dict[str, Any]:
    space_dirs = _space_dirs(solution)
    cards = [_space_card(space_dir) for space_dir in space_dirs.values()]
    unresolved_alerts = sum(int(card.get("unresolved_alert_count") or 0) for card in cards)
    now = datetime.now().astimezone()
    last_scan_at = _now_label(now, [str(card.get("updated_at") or "") for card in cards])
    recent_alerts = [
        {
            "id": str(item.get("id") or "").strip(),
            "ts": str(item.get("ts") or "").strip(),
            "title": str(item.get("space_name") or item.get("space_id") or "Alert").strip(),
            "message": str(item.get("message") or "").strip(),
            "severity": str(item.get("severity") or "").strip() or "warning",
            "solution_id": "hotel-vision",
        }
        for item in list_alerts(solution, unresolved_only=True, days=7)[:6]
    ]
    return {
        "ok": True,
        "spaces_monitored": len(cards),
        "unresolved_alerts": unresolved_alerts,
        "last_scan_at": last_scan_at,
        "summary": f"{len(cards)} spaces · {unresolved_alerts} unresolved alerts",
        "recent_alerts": recent_alerts,
    }


def list_spaces(solution: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [_space_card(space_dir) for space_dir in _space_dirs(solution).values()]


def get_space(solution: Dict[str, Any], space_id: str) -> Dict[str, Any]:
    space_dir = _space_dirs(solution).get(str(space_id or "").strip())
    if space_dir is None:
        raise FileNotFoundError(f"Space '{space_id}' was not found.")
    return _space_card(space_dir)


def get_space_history(solution: Dict[str, Any], space_id: str, *, hours: int = 24) -> List[Dict[str, Any]]:
    space_dir = _space_dirs(solution).get(str(space_id or "").strip())
    if space_dir is None:
        raise FileNotFoundError(f"Space '{space_id}' was not found.")
    return _load_history(space_dir, hours=hours)


def list_alerts(
    solution: Dict[str, Any],
    *,
    unresolved_only: bool = False,
    days: Optional[int] = None,
    space_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    cutoff: Optional[datetime] = None
    if isinstance(days, int) and days > 0:
        cutoff = datetime.now().astimezone() - timedelta(days=days)
    items: List[Dict[str, Any]] = []
    for current_space_id, space_dir in _space_dirs(solution).items():
        if space_id and current_space_id != str(space_id).strip():
            continue
        card = _space_card(space_dir)
        for alert in _load_alerts(space_dir):
            if unresolved_only and bool(alert.get("resolved")):
                continue
            ts = str(alert.get("ts") or "").strip()
            if cutoff is not None:
                try:
                    parsed = datetime.fromisoformat(ts)
                except Exception:
                    continue
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=datetime.now().astimezone().tzinfo)
                if parsed < cutoff:
                    continue
            item = dict(alert)
            item["space_name"] = card.get("space_name")
            items.append(item)
    return sorted(items, key=lambda item: str(item.get("ts") or ""), reverse=True)


def resolve_alert(solution: Dict[str, Any], alert_id: str) -> Dict[str, Any]:
    target = str(alert_id or "").strip()
    if not target:
        raise RuntimeError("alert_id is required.")
    for space_dir in _space_dirs(solution).values():
        alerts_path = space_dir / "alerts.jsonl"
        items = _load_alerts(space_dir)
        changed = False
        for item in items:
            if str(item.get("id") or "").strip() != target:
                continue
            item["resolved"] = True
            item["resolved_at"] = datetime.now().astimezone().isoformat()
            changed = True
        if changed:
            _write_jsonl(alerts_path, items)
            return {"ok": True, "resolved": True, "alert_id": target}
    raise FileNotFoundError(f"Alert '{target}' was not found.")


def answer_space_question(solution: Dict[str, Any], space_id: str, question: str) -> Dict[str, Any]:
    card = get_space(solution, space_id)
    space_dir = _space_dirs(solution).get(str(space_id or "").strip())
    if not VISION_QUERY_HANDLER.exists():
        raise RuntimeError("vision-monitor query handler is missing.")
    prompt = f"{card.get('space_name')}: {str(question or '').strip()}".strip()
    payload = {"query": prompt, "channel": "web", "workspace_id": "default", "session_key": f"hotel-vision:{space_id}"}
    env = dict(os.environ)
    if space_dir is not None:
        env["EMPYRALIS_VISION_SPACES_ROOT"] = str(space_dir.parent)
    completed = subprocess.run(
        [sys.executable, str(VISION_QUERY_HANDLER)],
        input=json.dumps(payload).encode("utf-8"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(VISION_QUERY_HANDLER.parent),
        env=env,
        timeout=8,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or b"").decode("utf-8", "ignore").strip() or f"exit_{completed.returncode}"
        raise RuntimeError(detail)
    parsed = json.loads((completed.stdout or b"{}").decode("utf-8", "ignore") or "{}")
    if not isinstance(parsed, dict):
        raise RuntimeError("Vision query handler returned invalid JSON.")
    response = str(parsed.get("response") or "").strip()
    if response:
        return {"ok": True, "answer": response, "metadata": parsed.get("metadata") if isinstance(parsed.get("metadata"), dict) else {}}
    fallback = card.get("summary_line") or "No live answer is available for this space right now."
    return {"ok": True, "answer": str(fallback), "metadata": {"fallback": True}}


def get_snapshot_path(solution: Dict[str, Any], space_id: str) -> Path:
    card = get_space(solution, space_id)
    snapshot_path = Path(str(card.get("snapshot_path") or "").strip()).expanduser()
    if snapshot_path.exists():
        return snapshot_path
    raise FileNotFoundError(f"Snapshot for '{space_id}' is not available.")


def update_space_config(solution: Dict[str, Any], space_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    space_dir = _space_dirs(solution).get(str(space_id or "").strip())
    if space_dir is None:
        raise FileNotFoundError(f"Space '{space_id}' was not found.")
    config_path = space_dir / "config.json"
    current = _load_space_config(space_dir)
    business_hours_payload = payload.get("business_hours")
    if isinstance(business_hours_payload, dict):
        next_business_hours = {
            str(key).strip(): str(value).strip()
            for key, value in business_hours_payload.items()
            if str(key).strip() and str(value).strip()
        }
    else:
        next_business_hours = current.get("business_hours") if isinstance(current.get("business_hours"), dict) else {"mon-sun": "07:00-22:00"}
    next_config = {
        **current,
        "space_id": str(current.get("space_id") or payload.get("space_id") or space_dir.name).strip() or space_dir.name,
        "space_name": str(payload.get("space_name") or current.get("space_name") or space_dir.name.replace("-", " ").title()).strip(),
        "camera_url": str(payload.get("camera_url") or current.get("camera_url") or "").strip(),
        "business_hours": next_business_hours,
        "scan_cadence_minutes": max(1, int(payload.get("scan_cadence_minutes") or current.get("scan_cadence_minutes") or 5)),
        "busy_threshold": max(1, int(payload.get("busy_threshold") or current.get("busy_threshold") or 15)),
        "telegram_recipients": [
            str(item).strip()
            for item in (payload.get("telegram_recipients") if isinstance(payload.get("telegram_recipients"), list) else current.get("telegram_recipients") if isinstance(current.get("telegram_recipients"), list) else [])
            if str(item).strip()
        ],
        "hotel_name": str(payload.get("hotel_name") or current.get("hotel_name") or "").strip(),
        "timezone": str(payload.get("timezone") or current.get("timezone") or "").strip(),
    }
    _write_json(config_path, next_config)
    return _space_card(space_dir)


def handle_api_request(
    solution: Dict[str, Any],
    method: str,
    subpath: str,
    body: Optional[Dict[str, Any]] = None,
    query: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any] | Response:
    path = str(subpath or "").strip("/")
    parts = [part for part in path.split("/") if part]
    request_method = str(method or "GET").upper()
    payload = body if isinstance(body, dict) else {}
    params = query if isinstance(query, dict) else {}

    if request_method == "GET" and parts == ["spaces"]:
        return {"ok": True, "items": list_spaces(solution)}

    if len(parts) >= 2 and parts[0] == "spaces":
        space_id = parts[1]
        if request_method == "GET" and len(parts) == 2:
            return {"ok": True, "item": get_space(solution, space_id)}
        if request_method == "GET" and len(parts) == 3 and parts[2] == "history":
            hours = max(1, min(int(params.get("hours") or 24), 168))
            return {"ok": True, "items": get_space_history(solution, space_id, hours=hours)}
        if request_method == "GET" and len(parts) == 3 and parts[2] == "snapshot":
            return FileResponse(get_snapshot_path(solution, space_id))
        if request_method == "POST" and len(parts) == 3 and parts[2] == "ask":
            question = str(payload.get("question") or "").strip()
            if not question:
                raise RuntimeError("question is required.")
            return answer_space_question(solution, space_id, question)
        if request_method == "PUT" and len(parts) == 3 and parts[2] == "config":
            return {"ok": True, "item": update_space_config(solution, space_id, payload)}

    if request_method == "GET" and parts == ["alerts"]:
        unresolved_only = str(params.get("unresolved_only") or "").strip().lower() in {"1", "true", "yes", "on"}
        days = max(1, min(int(params.get("days") or 7), 365))
        space_id = str(params.get("space_id") or "").strip() or None
        return {
            "ok": True,
            "items": list_alerts(solution, unresolved_only=unresolved_only, days=days, space_id=space_id),
        }

    if request_method == "POST" and len(parts) == 3 and parts[0] == "alerts" and parts[2] == "resolve":
        return resolve_alert(solution, parts[1])

    raise RuntimeError(f"Unsupported solution route: {request_method} /{path}")
