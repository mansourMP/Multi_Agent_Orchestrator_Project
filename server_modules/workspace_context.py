from __future__ import annotations

from pathlib import Path
import re
from typing import Dict


_REPO_ROOT = Path(__file__).resolve().parents[1]
_WORKSPACE_DIR = _REPO_ROOT / ".orion-stack" / "workspace"

ALLOWED_CONTEXT_FILENAMES = (
    "SOUL.md",
    "USER.md",
    "IDENTITY.md",
    "HEARTBEAT.md",
    "AGENTS.md",
    "TOOLS.md",
    "MEMORY.md",
    "SELF_MODEL.md",
    "LIFE_STORY.md",
    "GOALS.md",
    "PROCEDURES.md",
    "REFLECTION.md",
)

DEFAULT_CONTEXT_FILE_CONTENTS: Dict[str, str] = {
    "SOUL.md": (
        "# Empyralis\n\n"
        "Empyralis is a calm mobile-first AI product.\n"
        "Its job is to help the user through one personal assistant named Sage.\n"
        "Keep replies clear, useful, and free of product demos or setup chatter.\n"
    ),
    "USER.md": (
        "# User Profile\n\n"
        "- Capture durable user preferences here.\n"
        "- Keep notes short, factual, and useful for future conversations.\n"
    ),
    "IDENTITY.md": (
        "# Identity\n\n"
        "- Capture the user's role, active work, and durable responsibilities here.\n"
        "- Keep this concise and factual.\n"
    ),
    "HEARTBEAT.md": (
        "# Heartbeat\n\n"
        "- Add recurring responsibilities Sage should keep track of here.\n"
    ),
    "AGENTS.md": (
        "# Assistant\n\n"
        "- Sage is the only visible assistant in the mobile product.\n"
        "- Do not introduce hidden roles, internal specialists, or routing language to the user.\n"
    ),
    "TOOLS.md": (
        "# Tools\n\n"
        "- Use tools only when they materially help the user.\n"
        "- Do not describe tools, runtimes, or internal execution unless the user explicitly asks.\n"
        "- Keep sensitive actions approval-gated.\n"
    ),
    "MEMORY.md": (
        "# Curated Memory\n\n"
        "Store stable long-term facts that should remain visible across future sessions.\n"
    ),
    "SELF_MODEL.md": (
        "# Self Model\n\n"
        "- Capture how the user prefers to think, decide, and collaborate.\n"
    ),
    "LIFE_STORY.md": (
        "# Life Story\n\n"
        "- Capture durable background only when the user explicitly wants it saved.\n"
    ),
    "GOALS.md": (
        "# Goals\n\n"
        "- Capture active projects, intentions, and future direction.\n"
    ),
    "PROCEDURES.md": (
        "# Procedures\n\n"
        "- Capture how the user likes work done.\n"
    ),
    "REFLECTION.md": (
        "# Reflection\n\n"
        "- Capture lessons and behavior improvements for future sessions.\n"
    ),
}


def workspace_context_dir() -> Path:
    _WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    return _WORKSPACE_DIR


def _normalize_scope_token(value: str, *, default: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(value or "").strip()).strip("-")
    return token or default


def workspace_scope_dir(workspace_id: str | None = None) -> Path:
    root = workspace_context_dir()
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return root
    token = _normalize_scope_token(normalized_workspace_id, default="default")
    if token == "default":
        return root
    path = root / "workspaces" / token
    path.mkdir(parents=True, exist_ok=True)
    return path


def agent_workspace_context_dir(*, workspace_id: str | None = None, agent_install_id: str | None = None) -> Path:
    scope_root = workspace_scope_dir(workspace_id)
    normalized_install_id = str(agent_install_id or "").strip()
    if not normalized_install_id:
        return scope_root
    install_token = _normalize_scope_token(normalized_install_id, default="install")
    path = scope_root / "agents" / install_token
    path.mkdir(parents=True, exist_ok=True)
    return path


def workspace_knowledge_dir(*, workspace_id: str | None = None, agent_install_id: str | None = None) -> Path:
    path = agent_workspace_context_dir(workspace_id=workspace_id, agent_install_id=agent_install_id) / "knowledge"
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_workspace_context_files(
    *,
    workspace_id: str | None = None,
    agent_install_id: str | None = None,
) -> Dict[str, str]:
    root = agent_workspace_context_dir(workspace_id=workspace_id, agent_install_id=agent_install_id)
    out: Dict[str, str] = {}
    for filename in ALLOWED_CONTEXT_FILENAMES:
        path = root / filename
        if not path.exists():
            path.write_text(DEFAULT_CONTEXT_FILE_CONTENTS.get(filename, "").strip() + "\n", encoding="utf-8")
        try:
            out[filename] = path.read_text(encoding="utf-8")
        except Exception:
            out[filename] = ""
    return out


def read_workspace_context_files(
    *,
    workspace_id: str | None = None,
    agent_install_id: str | None = None,
) -> Dict[str, str]:
    return ensure_workspace_context_files(workspace_id=workspace_id, agent_install_id=agent_install_id)


def read_workspace_context_file(
    filename: str,
    *,
    workspace_id: str | None = None,
    agent_install_id: str | None = None,
) -> str:
    normalized = normalize_workspace_context_filename(filename)
    return ensure_workspace_context_files(workspace_id=workspace_id, agent_install_id=agent_install_id).get(normalized, "")


def write_workspace_context_file(
    filename: str,
    content: str,
    *,
    workspace_id: str | None = None,
    agent_install_id: str | None = None,
) -> Dict[str, str]:
    normalized = normalize_workspace_context_filename(filename)
    root = agent_workspace_context_dir(workspace_id=workspace_id, agent_install_id=agent_install_id)
    path = root / normalized
    text = str(content or "")
    path.write_text(text, encoding="utf-8")
    return {
        "filename": normalized,
        "content": text,
        "path": str(path),
    }


def normalize_workspace_context_filename(filename: str) -> str:
    normalized = str(filename or "").strip()
    if normalized not in ALLOWED_CONTEXT_FILENAMES:
        raise ValueError(f"Unsupported context filename: {normalized or '(empty)'}")
    return normalized
