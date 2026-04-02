from __future__ import annotations
import os, json, time, threading, uuid, hashlib
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from pathlib import Path

_server = None
def _init():
    global _server
    if _server is not None: return
    import server as _s
    _server = _s
    for k, v in vars(_s).items():
        if not k.startswith("__") and k not in globals():
            globals()[k] = v

def _idempotency_record_key(method: str, path: str, idem_key: str) -> str:
    raw = f"{method.upper()}:{path}:{idem_key.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _prune_idempotency_locked():
    _init()
    now = _utc_now()
    expired: List[str] = []
    for key, record in IDEMPOTENCY_RECORDS.items():
        expires_at = _parse_utc_ts(record.get("expires_at"))
        if expires_at is None or expires_at <= now:
            expired.append(key)
    for key in expired:
        IDEMPOTENCY_RECORDS.pop(key, None)


def _persist_idempotency():
    _init()
    with IDEMPOTENCY_LOCK:
        _prune_idempotency_locked()
    _server.sync_acp_manager_paths(idempotency_path=_server.ORION_IDEMPOTENCY_FILE)
    _server.ACP_MANAGER._persist_idempotency()


def _load_idempotency():
    _init()
    with IDEMPOTENCY_LOCK:
        _server.sync_acp_manager_paths(idempotency_path=_server.ORION_IDEMPOTENCY_FILE)
        _server.ACP_MANAGER.reload_secondary_state()
        _prune_idempotency_locked()


def _idempotency_get(method: str, path: str, idem_key: str, body_hash: str) -> Dict[str, Any]:
    _init()
    composite = _idempotency_record_key(method, path, idem_key)
    with IDEMPOTENCY_LOCK:
        _prune_idempotency_locked()
        record = IDEMPOTENCY_RECORDS.get(composite)
    if not isinstance(record, dict):
        return {"hit": False}
    stored_hash = str(record.get("body_hash") or "")
    if stored_hash != body_hash:
        return {"hit": True, "conflict": True}
    return {"hit": True, "record": record}


def _idempotency_store(method: str, path: str, idem_key: str, body_hash: str, status_code: int, response_json: Any):
    _init()
    composite = _idempotency_record_key(method, path, idem_key)
    expires_at = (_utc_now() + timedelta(seconds=max(60, ORION_IDEMPOTENCY_TTL_SECONDS))).isoformat().replace("+00:00", "Z")
    record = {
        "method": method.upper(),
        "path": path,
        "idempotency_key": idem_key,
        "body_hash": body_hash,
        "status_code": int(status_code),
        "response": response_json,
        "created_at": _utc_now_iso(),
        "expires_at": expires_at,
    }
    with IDEMPOTENCY_LOCK:
        IDEMPOTENCY_RECORDS[composite] = record
    _persist_idempotency()
