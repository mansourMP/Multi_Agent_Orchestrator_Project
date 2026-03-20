from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import Depends, FastAPI, Header, HTTPException

app = FastAPI(title="Empyralis Platform Registry")
_REGISTRY_LOCK = threading.Lock()

BASE_DIR = Path(__file__).resolve().parent
APPS_DIR = BASE_DIR / "apps"
REGISTRY_FILE = Path(
    os.getenv(
        "EMPYRALIS_PLATFORM_REGISTRY_FILE",
        str(BASE_DIR / "state" / "registry.json"),
    )
)
SEED_FILE = Path(
    os.getenv(
        "EMPYRALIS_PLATFORM_REGISTRY_SEED",
        str(BASE_DIR / "platform_registry.seed.json"),
    )
)
API_KEY = os.getenv("EMPYRALIS_PLATFORM_REGISTRY_KEY", "").strip()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not API_KEY:
        return
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def _read_json(path: Path, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else fallback
    except Exception:
        return fallback


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def _normalize_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    item = dict(raw)
    item["id"] = str(item.get("id") or "").strip()
    item["name"] = str(item.get("name") or item["id"] or "Untitled App").strip()
    item["description"] = str(item.get("description") or "").strip()
    item["status"] = "available"
    item["source"] = "platform"
    item["publisher"] = str(item.get("publisher") or "Empyralis").strip()
    item["version"] = str(item.get("version") or "1.0.0").strip()
    item["latest_version"] = str(item.get("latest_version") or item["version"] or "1.0.0").strip()
    item["release_channel"] = str(item.get("release_channel") or "stable").strip()
    item["package_id"] = str(item.get("package_id") or f"com.empyralis.apps.{item['id']}").strip()
    item["permissions"] = [str(value).strip() for value in item.get("permissions", []) if str(value).strip()]
    item["featured"] = bool(item.get("featured"))
    item["updated_at"] = str(item.get("updated_at") or _utc_now_iso())
    return item


def _load_catalog_seed() -> List[Dict[str, Any]]:
    manifests: List[Dict[str, Any]] = []
    for path in sorted(APPS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        if isinstance(data, dict):
            manifests.append(_normalize_item(data))
    if manifests:
        return manifests

    seed = _read_json(SEED_FILE, {"apps": []})
    return [_normalize_item(item) for item in seed.get("apps", []) if isinstance(item, dict)]


def _load_registry() -> Dict[str, Any]:
    if not REGISTRY_FILE.exists():
        items = _load_catalog_seed()
        data = {"apps": items, "updated_at": _utc_now_iso()}
        _write_json(REGISTRY_FILE, data)
        return data

    data = _read_json(REGISTRY_FILE, {"apps": []})
    items = [_normalize_item(item) for item in data.get("apps", []) if isinstance(item, dict)]
    normalized = {"apps": items, "updated_at": str(data.get("updated_at") or _utc_now_iso())}
    if normalized != data:
        _write_json(REGISTRY_FILE, normalized)
    return normalized


def _save_registry(data: Dict[str, Any]) -> None:
    data["updated_at"] = _utc_now_iso()
    _write_json(REGISTRY_FILE, data)


def _find_app(items: List[Dict[str, Any]], app_id: str) -> Dict[str, Any] | None:
    for item in items:
        if str(item.get("id")) == app_id:
            return item
    return None


@app.get("/health")
def health() -> Dict[str, Any]:
    with _REGISTRY_LOCK:
        data = _load_registry()
    return {
        "ok": True,
        "service": "platform_registry",
        "apps_count": len(data.get("apps", [])),
        "updated_at": data.get("updated_at"),
        "auth_required": bool(API_KEY),
    }


@app.get("/apps/store", dependencies=[Depends(_require_api_key)])
def get_store_apps() -> Dict[str, Any]:
    with _REGISTRY_LOCK:
        data = _load_registry()
    return {"items": data.get("apps", []), "updated_at": data.get("updated_at")}


@app.get("/apps/manifest/{app_id}", dependencies=[Depends(_require_api_key)])
def get_app_manifest(app_id: str) -> Dict[str, Any]:
    with _REGISTRY_LOCK:
        data = _load_registry()
        item = _find_app(data.get("apps", []), app_id)
    if not item:
        raise HTTPException(status_code=404, detail="App not found")
    return {"item": item}


@app.post("/apps/publish", dependencies=[Depends(_require_api_key)])
def publish_app(body: Dict[str, Any]) -> Dict[str, Any]:
    item = _normalize_item(body)
    if not item["id"]:
        raise HTTPException(status_code=400, detail="id required")
    with _REGISTRY_LOCK:
        data = _load_registry()
        existing = _find_app(data.get("apps", []), item["id"])
        if existing:
            existing.update(item)
            existing["updated_at"] = _utc_now_iso()
            result = existing
        else:
            item["created_at"] = _utc_now_iso()
            data.setdefault("apps", []).append(item)
            result = item
        _save_registry(data)
    return {"status": "ok", "item": result}
