from __future__ import annotations

import logging
import os
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


async def get_pool() -> Any:
    global _POOL, _POOL_DSN, _POOL_INIT_FAILED, _MISSING_DSN_LOGGED

    database_url = str(os.getenv("DATABASE_URL") or "").strip()
    if not database_url:
        if not _MISSING_DSN_LOGGED:
            LOGGER.info("DATABASE_URL is not set; Postgres runtime persistence is disabled.")
            _MISSING_DSN_LOGGED = True
        return None

    if asyncpg is None:
        if not _POOL_INIT_FAILED:
            LOGGER.warning("asyncpg is unavailable; Postgres runtime persistence is disabled.")
            _POOL_INIT_FAILED = True
        return None

    if _POOL is not None and _POOL_DSN == database_url:
        return _POOL

    try:
        _POOL = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=5, command_timeout=10.0)
        _POOL_DSN = database_url
        _POOL_INIT_FAILED = False
        return _POOL
    except Exception as exc:  # pragma: no cover - network/db dependent
        if not _POOL_INIT_FAILED:
            LOGGER.warning("Failed to initialize Postgres pool for runtime persistence: %s", exc)
        _POOL = None
        _POOL_DSN = None
        _POOL_INIT_FAILED = True
        return None

