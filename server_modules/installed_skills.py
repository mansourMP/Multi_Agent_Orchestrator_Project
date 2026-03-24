from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml
except Exception:  # pragma: no cover - optional during bootstrap
    yaml = None  # type: ignore[assignment]


def skills_root() -> Path:
    explicit = str(os.getenv("ORION_INSTALLED_SKILLS_DIR", "")).strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    return (Path(__file__).resolve().parent.parent / "skills").resolve()


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _safe_skill_dir(root: Path, candidate: Path) -> Optional[Path]:
    try:
        if candidate.is_symlink() or not candidate.is_dir():
            return None
    except Exception:
        return None
    resolved_root = root.resolve()
    resolved_candidate = candidate.resolve()
    if not _path_is_within(resolved_candidate, resolved_root):
        return None
    return resolved_candidate


def _safe_skill_file(skill_dir: Path, filename: str) -> Optional[Path]:
    candidate = (skill_dir / filename).resolve()
    if not _path_is_within(candidate, skill_dir) or not candidate.exists() or not candidate.is_file():
        return None
    return candidate


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def _load_yaml(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    raw_text = path.read_text(encoding="utf-8")
    if yaml is None:
        try:
            parsed = json.loads(raw_text)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    try:
        parsed = yaml.safe_load(raw_text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _strip_skill_frontmatter(text: str) -> str:
    raw = str(text or "")
    if not raw.startswith("---\n"):
        return raw.strip()
    marker = raw.find("\n---", 4)
    if marker == -1:
        return raw.strip()
    return raw[marker + 4 :].strip()


def _parse_skill_frontmatter(text: str) -> Dict[str, Any]:
    raw = str(text or "")
    if yaml is None or not raw.startswith("---\n"):
        return {}
    marker = raw.find("\n---", 4)
    if marker == -1:
        return {}
    try:
        parsed = yaml.safe_load(raw[4:marker])
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _bool_from_any(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    token = str(value).strip().lower()
    if not token:
        return default
    if token in {"1", "true", "yes", "on"}:
        return True
    if token in {"0", "false", "no", "off"}:
        return False
    return default


def list_installed_skills() -> List[Dict[str, Any]]:
    root = skills_root()
    if not root.exists():
        return []
    items: List[Dict[str, Any]] = []
    skill_dirs: List[Path] = []
    for path in root.iterdir():
        safe_dir = _safe_skill_dir(root, path)
        if safe_dir is not None:
            skill_dirs.append(safe_dir)
    for skill_dir in sorted(skill_dirs, key=lambda item: item.name.lower()):
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue
        skill_text = _read_text(skill_md)
        frontmatter = _parse_skill_frontmatter(skill_text)
        config = _load_yaml(skill_dir / "config.yaml")
        skill_id = str(frontmatter.get("name") or skill_dir.name).strip().lower() or skill_dir.name.lower()
        description = str(frontmatter.get("description") or "").strip()
        enabled = _bool_from_any(config.get("enabled"), False)
        items.append(
            {
                "id": skill_id[:120],
                "name": str(frontmatter.get("name") or skill_dir.name).strip() or skill_dir.name,
                "description": description[:500],
                "enabled": enabled,
                "path": str(skill_dir),
                "config_path": str(skill_dir / "config.yaml"),
                "has_query_handler": (skill_dir / "query_handler.py").exists(),
                "has_snapshot_worker": (skill_dir / "worker.py").exists(),
                "config": config,
                "skill_body": _strip_skill_frontmatter(skill_text),
            }
        )
    return items


def active_installed_skills() -> List[Dict[str, Any]]:
    return [item for item in list_installed_skills() if bool(item.get("enabled"))]


def merge_skill_prompt_append(existing: str, extra: str, *, max_chars: int = 12000) -> str:
    left = str(existing or "").strip()
    right = str(extra or "").strip()
    if not left:
        return right[:max_chars]
    if not right:
        return left[:max_chars]
    merged = f"{left}\n\n{right}".strip()
    return merged[:max_chars]


def build_active_skill_prompt_append(*, max_chars: int = 12000) -> str:
    active = active_installed_skills()
    if not active:
        return ""
    chunks: List[str] = ["Installed skill instructions (active for this deployment):"]
    for item in active:
        body = str(item.get("skill_body") or "").strip()
        name = str(item.get("name") or item.get("id") or "Skill").strip()
        description = str(item.get("description") or "").strip()
        if description:
            chunks.append(f"\n{name} — {description}")
        else:
            chunks.append(f"\n{name}")
        if body:
            chunks.append(body)
    return "\n".join(chunks).strip()[:max_chars]


def active_installed_skill_ids() -> List[str]:
    return [str(item.get("id") or "").strip() for item in active_installed_skills() if str(item.get("id") or "").strip()]


def _run_skill_query_handler(skill: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    skill_path = Path(str(skill.get("path") or "")).expanduser().resolve()
    handler_path = _safe_skill_file(skill_path, "query_handler.py")
    if handler_path is None:
        return {}
    try:
        completed = subprocess.run(
            [sys.executable, str(handler_path)],
            input=json.dumps(payload).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(skill_path),
            timeout=8,
            check=False,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "skill_id": skill.get("id")}
    raw = (completed.stdout or b"").decode("utf-8", "ignore").strip()
    if completed.returncode != 0:
        detail = (completed.stderr or b"").decode("utf-8", "ignore").strip() or raw or f"exit_{completed.returncode}"
        return {"ok": False, "error": detail[:1000], "skill_id": skill.get("id")}
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {"ok": False, "error": raw[:1000], "skill_id": skill.get("id")}


def query_active_installed_skills(
    *,
    query: str,
    channel: Optional[str] = None,
    workspace_id: Optional[str] = None,
    connector_id: Optional[str] = None,
    chat_id: Optional[str] = None,
    session_key: Optional[str] = None,
) -> Dict[str, Any]:
    active = active_installed_skills()
    combined_prompt = ""
    combined_errors: List[Dict[str, Any]] = []
    first_handled: Optional[Dict[str, Any]] = None
    payload = {
        "query": str(query or "").strip(),
        "channel": str(channel or "").strip(),
        "workspace_id": str(workspace_id or "").strip(),
        "connector_id": str(connector_id or "").strip(),
        "chat_id": str(chat_id or "").strip(),
        "session_key": str(session_key or "").strip(),
        "skills_root": str(skills_root()),
    }
    for skill in active:
        result = _run_skill_query_handler(skill, payload)
        if not result:
            continue
        prompt_append = str(result.get("prompt_append") or "").strip()
        if prompt_append:
            combined_prompt = merge_skill_prompt_append(combined_prompt, prompt_append)
        if result.get("ok") is False and result.get("error"):
            combined_errors.append(
                {
                    "skill_id": str(skill.get("id") or "").strip(),
                    "error": str(result.get("error") or "").strip()[:1000],
                }
            )
        handled = _bool_from_any(result.get("handled"), False)
        response = str(result.get("response") or "").strip()
        if handled and response and first_handled is None:
            first_handled = {
                "skill_id": str(skill.get("id") or "").strip(),
                "response": response[:4000],
                "metadata": result.get("metadata") if isinstance(result.get("metadata"), dict) else {},
            }
    return {
        "handled": bool(first_handled),
        "response": str((first_handled or {}).get("response") or "").strip(),
        "skill_id": str((first_handled or {}).get("skill_id") or "").strip(),
        "metadata": (first_handled or {}).get("metadata") if isinstance((first_handled or {}).get("metadata"), dict) else {},
        "prompt_append": combined_prompt[:12000],
        "active_skill_ids": [str(item.get("id") or "").strip() for item in active if str(item.get("id") or "").strip()],
        "errors": combined_errors,
    }
