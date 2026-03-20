from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml
except Exception:  # pragma: no cover - optional during bootstrap
    yaml = None  # type: ignore[assignment]


def solutions_root() -> Path:
    explicit = str(os.getenv("ORION_INSTALLED_SOLUTIONS_DIR", "")).strip()
    if explicit:
        return Path(explicit).expanduser()
    return (Path(__file__).resolve().parent.parent / "solutions").resolve()


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _load_structured(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    raw_text = _read_text(path)
    if not raw_text.strip():
        return {}
    if yaml is not None:
        try:
            parsed = yaml.safe_load(raw_text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    try:
        parsed = json.loads(raw_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _bool_from_any(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    token = str(value).strip().lower()
    if token in {"1", "true", "yes", "on"}:
        return True
    if token in {"0", "false", "no", "off"}:
        return False
    return default


def _load_solution_module(solution: Dict[str, Any]):
    module_path = Path(str(solution.get("path") or "")).expanduser() / "solution.py"
    if not module_path.exists():
        return None
    module_name = f"empyralis_solution_{str(solution.get('id') or 'solution').replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, str(module_path))
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _call_solution_hook(solution: Dict[str, Any], hook_name: str, *args: Any, **kwargs: Any) -> Any:
    module = _load_solution_module(solution)
    if module is None:
        return None
    hook = getattr(module, hook_name, None)
    if not callable(hook):
        return None
    return hook(*args, **kwargs)


def list_installed_solutions() -> List[Dict[str, Any]]:
    root = solutions_root()
    if not root.exists():
        return []
    items: List[Dict[str, Any]] = []
    for solution_dir in sorted([path for path in root.iterdir() if path.is_dir()], key=lambda item: item.name.lower()):
        solution_md = solution_dir / "SOLUTION.md"
        install_yaml = solution_dir / "install.yaml"
        ui_preset_path = solution_dir / "ui_preset.json"
        if not solution_md.exists():
            continue
        install = _load_structured(install_yaml)
        ui_preset = _load_structured(ui_preset_path)
        solution_id = str(install.get("id") or solution_dir.name).strip().lower() or solution_dir.name.lower()
        route_base = str(install.get("route_base") or ui_preset.get("route_base") or f"/solutions/{solution_id}").strip()
        item: Dict[str, Any] = {
            "id": solution_id[:120],
            "name": str(install.get("name") or solution_dir.name).strip() or solution_dir.name,
            "description": str(install.get("description") or "").strip()[:500],
            "enabled": _bool_from_any(install.get("enabled"), True),
            "path": str(solution_dir),
            "route_base": route_base,
            "primary_route": str(ui_preset.get("primary_route") or route_base).strip() or route_base,
            "required_skills": [str(value).strip() for value in (install.get("required_skills") if isinstance(install.get("required_skills"), list) else []) if str(value).strip()],
            "data_roots": install.get("data_roots") if isinstance(install.get("data_roots"), list) else [],
            "workflows": install.get("workflows") if isinstance(install.get("workflows"), list) else [],
            "ui_preset": ui_preset,
            "install": install,
        }
        try:
            status = _call_solution_hook(item, "build_status", item)
        except Exception as exc:
            status = {"ok": False, "error": str(exc)}
        if isinstance(status, dict):
            item["status"] = status
        items.append(item)
    return items


def active_installed_solutions() -> List[Dict[str, Any]]:
    return [item for item in list_installed_solutions() if bool(item.get("enabled"))]


def find_installed_solution(solution_id: str) -> Optional[Dict[str, Any]]:
    target = str(solution_id or "").strip().lower()
    if not target:
        return None
    for item in list_installed_solutions():
        if str(item.get("id") or "").strip().lower() == target:
            return item
    return None


def call_installed_solution_hook(solution_id: str, hook_name: str, *args: Any, **kwargs: Any) -> Any:
    solution = find_installed_solution(solution_id)
    if solution is None:
        raise RuntimeError(f"Installed solution '{solution_id}' was not found.")
    return _call_solution_hook(solution, hook_name, solution, *args, **kwargs)
