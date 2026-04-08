from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _load_database_url_from_backend_env() -> None:
    if str(os.getenv("DATABASE_URL") or "").strip():
        return
    env_path = ROOT / "backend" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        token = line.strip()
        if not token or token.startswith("#") or "=" not in token:
            continue
        key, value = token.split("=", 1)
        if key.strip() == "DATABASE_URL" and value.strip():
            os.environ.setdefault("DATABASE_URL", value.strip())
            return


_load_database_url_from_backend_env()

from server_modules.control_plane_repository import ensure_control_plane_schema


async def _main() -> int:
    pool = await ensure_control_plane_schema()
    if pool is None:
        print("Control-plane migration skipped: DATABASE_URL is not configured or Postgres is unavailable.")
        return 1
    print("Control-plane schema is ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
