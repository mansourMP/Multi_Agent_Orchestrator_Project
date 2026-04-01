from __future__ import annotations

from pathlib import Path
from typing import Dict


_REPO_ROOT = Path(__file__).resolve().parents[1]
_WORKSPACE_DIR = _REPO_ROOT / ".orion-stack" / "workspace"

ALLOWED_CONTEXT_FILENAMES = (
    "SOUL.md",
    "USER.md",
    "AGENTS.md",
    "TOOLS.md",
    "MEMORY.md",
)

DEFAULT_CONTEXT_FILE_CONTENTS: Dict[str, str] = {
    "SOUL.md": (
        "# Empyralis\n\n"
        "Empyralis is a transparent local-first agent workspace.\n"
        "Its job is to help the user run reliable AI agents on their laptop, keep execution visible, and"
        " ask for approval before sensitive actions.\n"
    ),
    "USER.md": (
        "# User Profile\n\n"
        "- Capture durable user preferences here.\n"
        "- Keep notes short, factual, and useful for future conversations.\n"
    ),
    "AGENTS.md": (
        "# Available Agents\n\n"
        "- Orchestrator: routes work and coordinates durable execution.\n"
        "- Builder: handles product, engineering, workflow, and implementation work.\n"
        "- Research: handles synthesis, analysis, and briefing work.\n"
        "- Support: handles replies, inbox triage, and follow-up drafting.\n"
        "- Private Assistant: handles planning, reminders, and personal organization.\n"
    ),
    "TOOLS.md": (
        "# Tools\n\n"
        "- Direct chat can use local file, shell, and screenshot tools when allowed.\n"
        "- Durable runs can use local execution, browser automation, approvals, and connected systems.\n"
        "- Sensitive actions must stay approval-gated.\n"
    ),
    "MEMORY.md": (
        "# Curated Memory\n\n"
        "Store stable long-term facts that should remain visible across future sessions.\n"
    ),
}


def workspace_context_dir() -> Path:
    _WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    return _WORKSPACE_DIR


def ensure_workspace_context_files() -> Dict[str, str]:
    root = workspace_context_dir()
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


def read_workspace_context_files() -> Dict[str, str]:
    return ensure_workspace_context_files()


def read_workspace_context_file(filename: str) -> str:
    normalized = normalize_workspace_context_filename(filename)
    return ensure_workspace_context_files().get(normalized, "")


def write_workspace_context_file(filename: str, content: str) -> Dict[str, str]:
    normalized = normalize_workspace_context_filename(filename)
    root = workspace_context_dir()
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
