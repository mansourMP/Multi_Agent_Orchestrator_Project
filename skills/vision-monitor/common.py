from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


SKILL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SKILL_DIR.parent.parent


def load_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    target = (config_path or (SKILL_DIR / "config.yaml")).expanduser().resolve()
    raw_text = target.read_text(encoding="utf-8")
    try:
        import yaml  # type: ignore

        raw = yaml.safe_load(raw_text)
    except Exception:
        raw = json.loads(raw_text)
    return raw if isinstance(raw, dict) else {}


def spaces_root(config: Dict[str, Any]) -> Path:
    explicit = str(os.getenv("EMPYRALIS_VISION_SPACES_ROOT", "")).strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    storage = config.get("storage") if isinstance(config.get("storage"), dict) else {}
    return (PROJECT_ROOT / str(storage.get("spaces_root") or "spaces").strip()).resolve()


def snapshots_root(config: Dict[str, Any]) -> Path:
    storage = config.get("storage") if isinstance(config.get("storage"), dict) else {}
    return (PROJECT_ROOT / str(storage.get("snapshots_root") or "spaces/_snapshots").strip()).resolve()


def current_state_path(root: Path, space_id: str) -> Path:
    return root / space_id / "current_state.json"


def history_path(root: Path, space_id: str) -> Path:
    return root / space_id / "history.jsonl"


def alerts_path(root: Path, space_id: str) -> Path:
    return root / space_id / "alerts.jsonl"


def config_path(root: Path, space_id: str) -> Path:
    return root / space_id / "config.json"


def _legacy_space_to_config(config: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
    monitoring = config.get("monitoring") if isinstance(config.get("monitoring"), dict) else {}
    cameras = item.get("cameras") if isinstance(item.get("cameras"), list) else []
    camera = cameras[0] if cameras and isinstance(cameras[0], dict) else {}
    input_cfg = camera.get("input") if isinstance(camera.get("input"), dict) else {}
    input_type = str(input_cfg.get("type") or "webcam").strip().lower()
    camera_url = ""
    if input_type == "file":
        camera_url = f"file://{str(input_cfg.get('path') or '').strip()}"
    elif input_type == "snapshot_url":
        camera_url = str(input_cfg.get("url") or "").strip()
    elif input_type == "rtsp":
        camera_url = str(input_cfg.get("url") or "").strip()
    else:
        camera_url = f"webcam://{int(input_cfg.get('device_index') or 0)}"
    return {
        "space_id": str(item.get("id") or "").strip(),
        "space_name": str(item.get("name") or item.get("id") or "Space").strip(),
        "camera_url": camera_url,
        "business_hours": item.get("business_hours") if isinstance(item.get("business_hours"), dict) else {"mon-sun": "07:00-22:00"},
        "scan_cadence_minutes": max(1, round(int(monitoring.get("interval_seconds") or 300) / 60)),
        "busy_threshold": int(item.get("busy_threshold") or 15),
        "telegram_recipients": [str(value).strip() for value in (item.get("telegram_recipients") if isinstance(item.get("telegram_recipients"), list) else []) if str(value).strip()],
        "aliases": [str(value).strip() for value in (item.get("aliases") if isinstance(item.get("aliases"), list) else []) if str(value).strip()],
    }


def load_space_configs(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    root = spaces_root(config)
    items: List[Dict[str, Any]] = []
    if root.exists():
        for space_dir in sorted([path for path in root.iterdir() if path.is_dir() and not path.name.startswith("_")], key=lambda item: item.name.lower()):
            config_file = config_path(root, space_dir.name)
            if not config_file.exists():
                continue
            try:
                parsed = json.loads(config_file.read_text(encoding="utf-8"))
            except Exception:
                parsed = {}
            if isinstance(parsed, dict) and str(parsed.get("space_id") or space_dir.name).strip():
                items.append(parsed)
    if items:
        return items
    legacy_spaces = config.get("spaces") if isinstance(config.get("spaces"), list) else []
    for item in legacy_spaces:
        if isinstance(item, dict):
            converted = _legacy_space_to_config(config, item)
            if str(converted.get("space_id") or "").strip():
                items.append(converted)
    return items


def resolve_space_config(config: Dict[str, Any], *, space_id: Optional[str] = None) -> Dict[str, Any]:
    spaces = load_space_configs(config)
    if not spaces:
        raise RuntimeError("No monitored spaces are configured.")
    target = str(space_id or "").strip()
    if target:
        for item in spaces:
            if str(item.get("space_id") or "").strip() == target:
                return item
    default_id = str((config.get("monitoring") if isinstance(config.get("monitoring"), dict) else {}).get("default_space_id") or "").strip()
    if default_id:
        for item in spaces:
            if str(item.get("space_id") or "").strip() == default_id:
                return item
    return spaces[0]


def write_space_config(root: Path, space_config: Dict[str, Any]) -> Path:
    space_id = str(space_config.get("space_id") or "").strip()
    if not space_id:
        raise RuntimeError("space_id is required to write config.json.")
    path = config_path(root, space_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "space_id": space_id,
        "space_name": str(space_config.get("space_name") or space_id).strip(),
        "camera_url": str(space_config.get("camera_url") or "").strip(),
        "business_hours": space_config.get("business_hours") if isinstance(space_config.get("business_hours"), dict) else {"mon-sun": "07:00-22:00"},
        "scan_cadence_minutes": int(space_config.get("scan_cadence_minutes") or 5),
        "busy_threshold": int(space_config.get("busy_threshold") or 15),
        "telegram_recipients": [str(value).strip() for value in (space_config.get("telegram_recipients") if isinstance(space_config.get("telegram_recipients"), list) else []) if str(value).strip()],
    }
    if isinstance(space_config.get("aliases"), list):
        payload["aliases"] = [str(value).strip() for value in space_config.get("aliases") if str(value).strip()]
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_current_state(config: Dict[str, Any], space_id: str) -> Dict[str, Any]:
    path = current_state_path(spaces_root(config), space_id)
    if not path.exists():
        return {}
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def resolve_camera_source(space_config: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    space_id = str(space_config.get("space_id") or "").strip()
    camera_url = str(space_config.get("camera_url") or "").strip()
    if camera_url:
        parsed = urlparse(camera_url)
        scheme = parsed.scheme.lower()
        if scheme == "file":
            path_token = parsed.path or parsed.netloc
            return space_config, {"id": "cam-01", "input": {"type": "file", "path": path_token}}
        if scheme == "rtsp":
            return space_config, {"id": "cam-01", "input": {"type": "rtsp", "url": camera_url}}
        if scheme in {"http", "https"}:
            return space_config, {"id": "cam-01", "input": {"type": "snapshot_url", "url": camera_url}}
        if scheme == "webcam":
            device_token = parsed.netloc or parsed.path.strip("/") or "0"
            return space_config, {"id": "cam-01", "input": {"type": "webcam", "device_index": int(device_token or 0)}}
    raise RuntimeError(f"Unsupported or missing camera_url for space '{space_id}'.")


def business_state_for_time(space_config: Dict[str, Any], moment: datetime) -> str:
    business_hours = space_config.get("business_hours") if isinstance(space_config.get("business_hours"), dict) else {}
    if not business_hours:
        return "open"
    day_key = moment.strftime("%a").lower()
    token = (
        str(business_hours.get(day_key) or "").strip()
        or str(business_hours.get("mon-sun") or "").strip()
        or str(business_hours.get("daily") or "").strip()
    )
    if not token:
        return "open"
    if token.lower() in {"closed", "off"}:
        return "closed"
    try:
        start_raw, end_raw = [part.strip() for part in token.split("-", 1)]
        start_hour, start_minute = [int(part) for part in start_raw.split(":", 1)]
        end_hour, end_minute = [int(part) for part in end_raw.split(":", 1)]
        start = moment.replace(hour=start_hour, minute=start_minute, second=0, microsecond=0)
        end = moment.replace(hour=end_hour, minute=end_minute, second=0, microsecond=0)
    except Exception:
        return "open"
    if end <= start:
        return "open" if moment >= start or moment <= end else "closed"
    return "open" if start <= moment <= end else "closed"
