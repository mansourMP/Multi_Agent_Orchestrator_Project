from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Dict, List


class AutopilotCommonSupportService:
    def __init__(
        self,
        *,
        project_root: Path,
        env_get: Callable[[str, str], str],
        import_cognitive_module: Callable[[], Any],
    ) -> None:
        self.project_root = Path(project_root)
        self.env_get = env_get
        self.import_cognitive_module = import_cognitive_module

    def cognitive_defaults(self) -> Dict[str, str]:
        niche_id = str(self.env_get("ORION_COGNITIVE_NICHE_ID", "astronomy") or "astronomy").strip() or "astronomy"
        db_override = str(self.env_get("ORION_COGNITIVE_DB_PATH", "") or "").strip()
        if db_override:
            db_path = db_override
        else:
            db_path = str(self.project_root / "python_engine" / "agency_memory.db")
        return {"niche_id": niche_id, "db_path": db_path}

    def cognitive_module(self):
        try:
            return self.import_cognitive_module()
        except Exception:
            return None

    def normalize_string_list(self, value: Any) -> List[str]:
        if isinstance(value, list):
            out: List[str] = []
            for item in value:
                token = str(item or "").strip()
                if token:
                    out.append(token)
            return out
        return []

    def chat_id_from_session_key(self, session_key: str) -> str:
        key = str(session_key or "").strip()
        if not key:
            return ""
        if key.startswith("telegram:"):
            return key.split(":", 1)[1].strip()
        return ""
