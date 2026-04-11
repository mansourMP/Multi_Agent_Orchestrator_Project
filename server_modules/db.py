from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Optional

try:
    import asyncpg
except Exception:  # pragma: no cover - optional dependency at import time
    asyncpg = None


LOGGER = logging.getLogger(__name__)

_POOLS_BY_LOOP: dict[int, tuple[Any, Any, str]] = {}
_POOL_INIT_FAILED = False
_MISSING_DSN_LOGGED = False
_ENV_DSN_LOADED = False
_LOCAL_ENV_TOKENS = {"dev", "development", "local", "test", "testing"}


def _resolved_environment() -> str:
    return str(os.getenv("ORION_ENV") or os.getenv("ENV") or "").strip().lower()


def _allow_database_url_backfill() -> bool:
    return _resolved_environment() in _LOCAL_ENV_TOKENS


def _load_database_url_from_backend_env() -> None:
    global _ENV_DSN_LOADED
    if _ENV_DSN_LOADED or str(os.getenv("DATABASE_URL") or "").strip():
        _ENV_DSN_LOADED = True
        return
    if not _allow_database_url_backfill():
        _ENV_DSN_LOADED = True
        return
    try:
        root = Path(__file__).resolve().parents[1]
        env_path = root / "backend" / ".env"
        if not env_path.exists():
            _ENV_DSN_LOADED = True
            return
        for line in env_path.read_text(encoding="utf-8").splitlines():
            token = line.strip()
            if not token or token.startswith("#") or "=" not in token:
                continue
            key, value = token.split("=", 1)
            if key.strip() == "DATABASE_URL" and value.strip():
                os.environ.setdefault("DATABASE_URL", value.strip())
                break
    except Exception:
        pass
    _ENV_DSN_LOADED = True


def configured_database_url() -> str:
    _load_database_url_from_backend_env()
    return str(os.getenv("DATABASE_URL") or "").strip()


def configured_postgres_pool_max_size() -> int:
    raw = str(os.getenv("ORION_POSTGRES_POOL_MAX_SIZE") or "").strip()
    if not raw:
        return 50
    try:
        return max(50, int(raw))
    except Exception:
        return 50


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
    global _POOL_INIT_FAILED, _MISSING_DSN_LOGGED

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

    current_loop = asyncio.get_running_loop()
    current_loop_key = id(current_loop)

    stale_loop_keys = [
        loop_key
        for loop_key, (loop_obj, _pool, _dsn) in list(_POOLS_BY_LOOP.items())
        if bool(getattr(loop_obj, "is_closed", lambda: False)())
    ]
    for loop_key in stale_loop_keys:
        _loop_obj, stale_pool, _dsn = _POOLS_BY_LOOP.pop(loop_key)
        try:
            stale_pool.terminate()
        except Exception:
            pass

    existing = _POOLS_BY_LOOP.get(current_loop_key)
    if existing is not None:
        loop_obj, pool, dsn = existing
        if loop_obj is current_loop and dsn == database_url:
            return pool
        try:
            await pool.close()
        except Exception:
            try:
                pool.terminate()
            except Exception:
                pass
        _POOLS_BY_LOOP.pop(current_loop_key, None)

    try:
        pool = await asyncpg.create_pool(
            dsn=database_url,
            min_size=1,
            max_size=configured_postgres_pool_max_size(),
            command_timeout=10.0,
        )
        _POOLS_BY_LOOP[current_loop_key] = (current_loop, pool, database_url)
        _POOL_INIT_FAILED = False
        LOGGER.info("Postgres pool initialized — run state will be durable")
        return pool
    except Exception as exc:  # pragma: no cover - network/db dependent
        if not _POOL_INIT_FAILED:
            LOGGER.warning("WARNING: DATABASE_URL not set or Postgres unavailable — run state is memory/SQLite only")
            LOGGER.debug("Postgres pool initialization failure detail: %s", exc)
        _POOLS_BY_LOOP.pop(current_loop_key, None)
        _POOL_INIT_FAILED = True
        return None
