from __future__ import annotations

import os
import secrets
import threading
from pathlib import Path


EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
JWT_SECRET_FILE = Path(
    os.getenv("EMPYRALIS_JWT_SECRET_FILE", str(EMPYRALIS_STATE_HOME / "auth" / "jwt_secret"))
).expanduser()

_JWT_SECRET_LOCK = threading.Lock()
_JWT_SECRET_CACHE: str | None = None


def _normalize_secret(raw: str | None) -> str:
    return str(raw or "").strip()


def _explicit_secret() -> str:
    for key in ("ORION_JWT_SECRET", "JWT_SECRET"):
        secret = _normalize_secret(os.getenv(key))
        if secret:
            return secret
    return ""


def _legacy_seed_secret() -> str:
    for key in ("ORION_API_KEY", "RUNTIME_KEY"):
        secret = _normalize_secret(os.getenv(key))
        if secret:
            return secret
    return ""


def _read_secret_file(path: Path) -> str:
    try:
        return _normalize_secret(path.read_text(encoding="utf-8"))
    except Exception:
        return ""


def _write_secret_file(path: Path, secret: str) -> str:
    normalized = _normalize_secret(secret)
    if not normalized:
        raise RuntimeError("JWT secret is empty.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{normalized}\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass
    return normalized


def resolve_jwt_secret() -> str:
    global _JWT_SECRET_CACHE

    explicit = _explicit_secret()
    if explicit:
        _JWT_SECRET_CACHE = explicit
        return explicit

    with _JWT_SECRET_LOCK:
        if _JWT_SECRET_CACHE:
            return _JWT_SECRET_CACHE

        persisted = _read_secret_file(JWT_SECRET_FILE)
        if persisted:
            _JWT_SECRET_CACHE = persisted
            return persisted

        seeded = _legacy_seed_secret()
        if seeded:
            _JWT_SECRET_CACHE = _write_secret_file(JWT_SECRET_FILE, seeded)
            return _JWT_SECRET_CACHE

        generated = secrets.token_urlsafe(48)
        _JWT_SECRET_CACHE = _write_secret_file(JWT_SECRET_FILE, generated)
        return _JWT_SECRET_CACHE

