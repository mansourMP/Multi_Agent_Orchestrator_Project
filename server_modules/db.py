from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

try:
    import asyncpg
except Exception:  # pragma: no cover - optional dependency at import time
    asyncpg = None


LOGGER = logging.getLogger(__name__)

_POOL: Any = None
_POOL_DSN: Optional[str] = None
_POOL_INIT_FAILED = False
_MISSING_DSN_LOGGED = False


def configured_database_url() -> str:
    return str(os.getenv("DATABASE_URL") or "").strip()


def sqlite_health_status() -> str:
    raw = str(os.getenv("ORION_RUNTIME_STATE_DB") or ".orion_runtime_state.db").strip()
    try:
        path = Path(raw).expanduser().resolve()
        return "active" if path.exists() else "inactive"
    except Exception:
        return "inactive"


async def postgres_health_status() -> str:
    pool = await get_pool()
    return "connected" if pool is not None else "unavailable"


async def get_pool() -> Any:
    global _POOL, _POOL_DSN, _POOL_INIT_FAILED, _MISSING_DSN_LOGGED

    database_url = configured_database_url()
    if not database_url:
        if not _MISSING_DSN_LOGGED:
            LOGGER.warning("WARNING: DATABASE_URL not set or Postgres unavailable — run state is memory/SQLite only")
            _MISSING_DSN_LOGGED = True
        return None

    if asyncpg is None:
        if not _POOL_INIT_FAILED:
            LOGGER.warning("WARNING: DATABASE_URL not set or Postgres unavailable — run state is memory/SQLite only")
            _POOL_INIT_FAILED = True
        return None

    if _POOL is not None and _POOL_DSN == database_url:
        return _POOL

    try:
        _POOL = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=5, command_timeout=10.0)
        _POOL_DSN = database_url
        _POOL_INIT_FAILED = False
        LOGGER.info("Postgres pool initialized — run state will be durable")
        return _POOL
    except Exception as exc:  # pragma: no cover - network/db dependent
        if not _POOL_INIT_FAILED:
            LOGGER.warning("WARNING: DATABASE_URL not set or Postgres unavailable — run state is memory/SQLite only")
            LOGGER.debug("Postgres pool initialization failure detail: %s", exc)
        _POOL = None
        _POOL_DSN = None
        _POOL_INIT_FAILED = True
        return None
