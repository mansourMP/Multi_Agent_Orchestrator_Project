from __future__ import annotations

import os
from pathlib import Path


def empyralis_state_home() -> Path:
    raw = str(os.getenv("EMPYRALIS_STATE_HOME") or "").strip()
    return Path(raw).expanduser() if raw else Path.home() / ".empyralis" / "state"


def default_cognitive_db_path() -> str:
    return str(empyralis_state_home() / "memory" / "agency_memory.db")


def default_lancedb_uri() -> str:
    return str(empyralis_state_home() / "memory" / "lancedb")
