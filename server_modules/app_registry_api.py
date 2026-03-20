from __future__ import annotations

from typing import Any, Dict, List, Optional
import threading


APP_REGISTRY_LOCK = threading.Lock()
LEGACY_SEEDED_APP_IDS = {"nutrition", "finance", "health", "study", "language"}


def _default_app_registry() -> Dict[str, Any]:
    return {
        "apps": [
            {
                "id": "nutrition",
                "name": "Nutrition",
                "description": "Photo-based meal tracking",
                "icon": "restaurant",
                "category": "Hub",
                "status": "available",
                "version": "1.0.0",
                "latest_version": "1.1.0",
                "publisher": "core",
                "entry_route": "/apps/nutrition",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "finance",
                "name": "Finance",
                "description": "Income and expense tracking",
                "icon": "wallet",
                "category": "Hub",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/finance",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "health",
                "name": "Health",
                "description": "Vitals and health logs",
                "icon": "fitness",
                "category": "Hub",
                "status": "available",
                "version": "1.0.0",
                "latest_version": "1.0.1",
                "publisher": "core",
                "entry_route": "/apps/health",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "study",
                "name": "Study",
                "description": "Notes and flashcards",
                "icon": "book",
                "category": "Hub",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/study",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "language",
                "name": "Language Coach",
                "description": "Guided language learning and speaking practice",
                "icon": "language",
                "category": "Education",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/language",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "travel",
                "name": "Travel",
                "description": "Trips, itineraries, and bookings",
                "icon": "airplane",
                "category": "Hub",
                "status": "available",
                "version": "0.9.0",
                "publisher": "community",
                "entry_route": "/apps/travel",
                "permissions": ["files.read"],
            },
            {
                "id": "home",
                "name": "Home",
                "description": "Smart home routines and status",
                "icon": "home",
                "category": "Hub",
                "status": "available",
                "version": "0.9.0",
                "publisher": "community",
                "entry_route": "/apps/home",
                "permissions": ["device.control"],
            },
            {
                "id": "notes",
                "name": "Notes",
                "description": "Capture and organize notes",
                "icon": "document-text",
                "category": "Productivity",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/notes",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "planner",
                "name": "Planner",
                "description": "Daily planning and checklists",
                "icon": "calendar",
                "category": "Productivity",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/planner",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "focus",
                "name": "Focus",
                "description": "Pomodoro sessions and deep work",
                "icon": "timer",
                "category": "Productivity",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/focus",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "reading",
                "name": "Reading",
                "description": "Summaries and highlights",
                "icon": "reader",
                "category": "Learning",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/reading",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "writing",
                "name": "Writing",
                "description": "Drafts, rewrites, and outlines",
                "icon": "create",
                "category": "Productivity",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/writing",
                "permissions": ["files.read", "files.write"],
            },
            {
                "id": "habits",
                "name": "Habits",
                "description": "Track habits and streaks",
                "icon": "checkmark-circle",
                "category": "Health & Habit",
                "status": "available",
                "version": "1.0.0",
                "publisher": "core",
                "entry_route": "/apps/habits",
                "permissions": ["files.read", "files.write"],
            },
        ],
        "updated_at": _utc_now_iso(),
    }


def _load_app_registry() -> Dict[str, Any]:
    # server._safe_read_json requires an explicit fallback value.
    data = _safe_read_json(ORION_APP_REGISTRY_FILE, {})
    if not isinstance(data, dict) or not isinstance(data.get("apps"), list):
        data = _default_app_registry()
        _safe_write_json(ORION_APP_REGISTRY_FILE, data)
        return data

    # Merge in any new default apps that aren't present yet.
    defaults = _default_app_registry()
    existing = {str(item.get("id")): item for item in data.get("apps", []) if isinstance(item, dict)}
    updated = False
    for app in defaults.get("apps", []):
        app_id = str(app.get("id"))
        if app_id and app_id not in existing:
            data["apps"].append(app)
            updated = True

    normalized_apps = []
    for app in data.get("apps", []):
        if not isinstance(app, dict):
            continue
        before = dict(app)
        normalized = _normalize_registry_item(app)
        normalized_apps.append(normalized)
        if normalized != before:
            updated = True
    data["apps"] = normalized_apps

    if updated:
        _save_app_registry(data)
    return data


def _normalize_registry_item(app: Dict[str, Any]) -> Dict[str, Any]:
    app_id = str(app.get("id") or "").strip()
    if (
        app_id in LEGACY_SEEDED_APP_IDS
        and str(app.get("status") or "").strip().lower() == "installed"
        and not app.get("install_source")
        and not app.get("package_id")
        and not app.get("installed_at")
    ):
        app["status"] = "available"

    if not app.get("source"):
        app["source"] = "platform"

    return app


def _apply_install_metadata(app_item: Dict[str, Any], body: Dict[str, Any]) -> None:
    package_id = str(body.get("package_id") or app_item.get("package_id") or "").strip()
    release_channel = str(body.get("release_channel") or app_item.get("release_channel") or "stable").strip()
    install_source = str(body.get("install_source") or app_item.get("install_source") or "platform_registry").strip()

    if package_id:
        app_item["package_id"] = package_id
    if release_channel:
        app_item["release_channel"] = release_channel
    if install_source:
        app_item["install_source"] = install_source


def _save_app_registry(data: Dict[str, Any]) -> None:
    data["updated_at"] = _utc_now_iso()
    _safe_write_json(ORION_APP_REGISTRY_FILE, data)


def _find_app(data: Dict[str, Any], app_id: str) -> Optional[Dict[str, Any]]:
    for app in data.get("apps", []):
        if str(app.get("id")) == app_id:
            return app
    return None


def resolve_app_permissions(app_id: str) -> List[str]:
    app_id = str(app_id or "").strip()
    if not app_id:
        return []
    with APP_REGISTRY_LOCK:
        data = _load_app_registry()
        app_item = _find_app(data, app_id)
    if not app_item:
        return []
    if str(app_item.get("status") or "").strip().lower() != "installed":
        return []
    permissions = app_item.get("permissions")
    if not isinstance(permissions, list):
        return []
    return [str(item).strip().lower() for item in permissions if str(item).strip()]


def register_app_registry_routes(app) -> None:
    import server as _server

    module_globals = globals()
    for key, value in _server.__dict__.items():
        if key not in module_globals:
            module_globals[key] = value

    @app.get("/apps/registry", dependencies=[Depends(require_api_key)])
    async def get_app_registry():
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
        return {"items": data.get("apps", []), "updated_at": data.get("updated_at")}

    @app.get("/apps/installed", dependencies=[Depends(require_api_key)])
    async def get_installed_apps():
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
        items = [app for app in data.get("apps", []) if app.get("status") == "installed"]
        return {"items": items}

    @app.get("/apps/store", dependencies=[Depends(require_api_key)])
    async def get_store_apps():
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
        items = [app for app in data.get("apps", []) if app.get("status") != "installed"]
        return {"items": items}

    @app.get("/apps/updates", dependencies=[Depends(require_api_key)])
    async def get_update_apps():
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
        items = [
            app
            for app in data.get("apps", [])
            if app.get("status") == "installed"
            and app.get("latest_version")
            and app.get("latest_version") != app.get("version")
        ]
        return {"items": items}

    @app.get("/apps/manifest/{app_id}", dependencies=[Depends(require_api_key)])
    async def get_app_manifest(app_id: str):
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
            app_item = _find_app(data, app_id)
        if not app_item:
            raise HTTPException(status_code=404, detail="App not found")
        return {"item": app_item}

    @app.post("/apps/install", dependencies=[Depends(require_api_key)])
    async def install_app(body: Dict[str, Any]):
        app_id = str(body.get("app_id") or "").strip()
        if not app_id:
            raise HTTPException(status_code=400, detail="app_id required")
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
            app_item = _find_app(data, app_id)
            if not app_item:
                raise HTTPException(status_code=404, detail="App not found")
            _apply_install_metadata(app_item, body)
            app_item["status"] = "installed"
            app_item["installed_at"] = _utc_now_iso()
            _save_app_registry(data)
        return {"status": "ok", "app": app_item}

    @app.post("/apps/uninstall", dependencies=[Depends(require_api_key)])
    async def uninstall_app(body: Dict[str, Any]):
        app_id = str(body.get("app_id") or "").strip()
        if not app_id:
            raise HTTPException(status_code=400, detail="app_id required")
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
            app_item = _find_app(data, app_id)
            if not app_item:
                raise HTTPException(status_code=404, detail="App not found")
            app_item["status"] = "available"
            _save_app_registry(data)
        return {"status": "ok", "app": app_item}

    @app.post("/apps/update", dependencies=[Depends(require_api_key)])
    async def update_app(body: Dict[str, Any]):
        app_id = str(body.get("app_id") or "").strip()
        if not app_id:
            raise HTTPException(status_code=400, detail="app_id required")
        with APP_REGISTRY_LOCK:
            data = _load_app_registry()
            app_item = _find_app(data, app_id)
            if not app_item:
                raise HTTPException(status_code=404, detail="App not found")
            latest = app_item.get("latest_version")
            if not latest:
                raise HTTPException(status_code=409, detail="No update available")
            _apply_install_metadata(app_item, body)
            app_item["version"] = latest
            app_item["updated_at"] = _utc_now_iso()
            _save_app_registry(data)
        return {"status": "ok", "app": app_item}
