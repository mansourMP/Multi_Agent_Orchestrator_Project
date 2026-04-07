from __future__ import annotations

"""Private implementation. No external caller may import from this module directly. Use memory_service.py."""

import sqlite3
import threading
from datetime import timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from fastapi import HTTPException


UtcNowFn = Callable[[], Any]
UtcNowIsoFn = Callable[[], str]
ParseUtcTsFn = Callable[[Any], Any]
NormalizeWorkspaceFn = Callable[[Any], Optional[str]]
JsonSafeFn = Callable[[Any], Any]
CompactTextFn = Callable[[Any, int], str]
EmitLogFn = Callable[[Any, str, str], None]
RefreshArchivedFn = Callable[[str, Dict[str, Any]], None]


ORION_MEMORY_ENABLED = False
ORION_MEMORY_LANCEDB_URI = ""
ORION_MEMORY_DB_PATH = ""
ORION_MEMORY_READ_K = 5
ORION_MEMORY_RETENTION_DAYS_DEFAULT = 30
ORION_MEMORY_MAX_TEXT_CHARS = 6000
MEMORY_BUCKETS: Set[str] = set()
RuntimeMemoryManager: Any = None

UTC_NOW: Optional[UtcNowFn] = None
UTC_NOW_ISO: Optional[UtcNowIsoFn] = None
PARSE_UTC_TS: Optional[ParseUtcTsFn] = None
NORMALIZE_WORKSPACE_ID: Optional[NormalizeWorkspaceFn] = None
JSON_SAFE: Optional[JsonSafeFn] = None
COMPACT_EVENT_TEXT: Optional[CompactTextFn] = None
EMIT_LOG: Optional[EmitLogFn] = None
REFRESH_ARCHIVED_RUN_SNAPSHOT: Optional[RefreshArchivedFn] = None

MEMORY_MANAGER_LOCK = threading.Lock()
MEMORY_MANAGER_INSTANCE: Any = None
MEMORY_MANAGER_ERROR: Optional[str] = None


def _configure_runtime_memory(
    *,
    memory_enabled: bool,
    memory_lancedb_uri: str,
    memory_db_path: str,
    memory_read_k: int,
    memory_retention_days_default: int,
    memory_max_text_chars: int,
    memory_buckets: Set[str],
    runtime_memory_manager: Any,
    utc_now: UtcNowFn,
    utc_now_iso: UtcNowIsoFn,
    parse_utc_ts: ParseUtcTsFn,
    normalize_workspace_id: NormalizeWorkspaceFn,
    json_safe: JsonSafeFn,
    compact_event_text: CompactTextFn,
    emit_log: EmitLogFn,
    refresh_archived_run_snapshot: RefreshArchivedFn,
) -> None:
    global ORION_MEMORY_ENABLED
    global ORION_MEMORY_LANCEDB_URI
    global ORION_MEMORY_DB_PATH
    global ORION_MEMORY_READ_K
    global ORION_MEMORY_RETENTION_DAYS_DEFAULT
    global ORION_MEMORY_MAX_TEXT_CHARS
    global MEMORY_BUCKETS
    global RuntimeMemoryManager
    global UTC_NOW
    global UTC_NOW_ISO
    global PARSE_UTC_TS
    global NORMALIZE_WORKSPACE_ID
    global JSON_SAFE
    global COMPACT_EVENT_TEXT
    global EMIT_LOG
    global REFRESH_ARCHIVED_RUN_SNAPSHOT

    ORION_MEMORY_ENABLED = bool(memory_enabled)
    ORION_MEMORY_LANCEDB_URI = str(memory_lancedb_uri)
    ORION_MEMORY_DB_PATH = str(memory_db_path)
    ORION_MEMORY_READ_K = int(memory_read_k)
    ORION_MEMORY_RETENTION_DAYS_DEFAULT = int(memory_retention_days_default)
    ORION_MEMORY_MAX_TEXT_CHARS = int(memory_max_text_chars)
    MEMORY_BUCKETS = set(memory_buckets)
    RuntimeMemoryManager = runtime_memory_manager

    UTC_NOW = utc_now
    UTC_NOW_ISO = utc_now_iso
    PARSE_UTC_TS = parse_utc_ts
    NORMALIZE_WORKSPACE_ID = normalize_workspace_id
    JSON_SAFE = json_safe
    COMPACT_EVENT_TEXT = compact_event_text
    EMIT_LOG = emit_log
    REFRESH_ARCHIVED_RUN_SNAPSHOT = refresh_archived_run_snapshot


def _utc_now():
    if UTC_NOW is None:
        raise RuntimeError("UTC_NOW not configured")
    return UTC_NOW()


def _utc_now_iso() -> str:
    if UTC_NOW_ISO is None:
        raise RuntimeError("UTC_NOW_ISO not configured")
    return UTC_NOW_ISO()


def _parse_utc_ts(value: Any) -> Any:
    if PARSE_UTC_TS is None:
        raise RuntimeError("PARSE_UTC_TS not configured")
    return PARSE_UTC_TS(value)


def _normalize_workspace_id(value: Any) -> Optional[str]:
    if NORMALIZE_WORKSPACE_ID is None:
        raise RuntimeError("NORMALIZE_WORKSPACE_ID not configured")
    return NORMALIZE_WORKSPACE_ID(value)


def _json_safe(value: Any) -> Any:
    if JSON_SAFE is None:
        raise RuntimeError("JSON_SAFE not configured")
    return JSON_SAFE(value)


def _compact_event_text(value: Any, limit: int = 800) -> str:
    if COMPACT_EVENT_TEXT is None:
        raise RuntimeError("COMPACT_EVENT_TEXT not configured")
    return COMPACT_EVENT_TEXT(value, limit)


def _emit_log(log_queue, level: str, message: str, event: str = "runtime", data: Optional[dict] = None) -> None:
    if EMIT_LOG is None:
        raise RuntimeError("EMIT_LOG not configured")
    EMIT_LOG(log_queue, level, message, event=event, data=data)


def _refresh_archived_run_snapshot(run_id: str, run: Dict[str, Any]) -> None:
    if REFRESH_ARCHIVED_RUN_SNAPSHOT is None:
        return
    REFRESH_ARCHIVED_RUN_SNAPSHOT(run_id, run)


def _normalize_memory_bucket(value: Any, *, required: bool = True) -> Optional[str]:
    bucket = str(value or "").strip().lower()
    if not bucket:
        if required:
            raise HTTPException(status_code=400, detail="memory bucket is required.")
        return None
    if bucket not in MEMORY_BUCKETS:
        raise HTTPException(status_code=400, detail="memory bucket must be one of: profile, project, session.")
    return bucket


def _memory_manager() -> Any:
    global MEMORY_MANAGER_INSTANCE, MEMORY_MANAGER_ERROR
    if not ORION_MEMORY_ENABLED:
        MEMORY_MANAGER_ERROR = "memory_disabled"
        return None
    with MEMORY_MANAGER_LOCK:
        if MEMORY_MANAGER_INSTANCE is not None:
            return MEMORY_MANAGER_INSTANCE
        if RuntimeMemoryManager is None:
            MEMORY_MANAGER_ERROR = "memory_manager_import_failed"
            return None
        try:
            MEMORY_MANAGER_INSTANCE = RuntimeMemoryManager(
                lancedb_uri=ORION_MEMORY_LANCEDB_URI,
                sqlite_path=ORION_MEMORY_DB_PATH,
            )
            MEMORY_MANAGER_ERROR = None
            return MEMORY_MANAGER_INSTANCE
        except Exception as exc:
            MEMORY_MANAGER_ERROR = f"memory_manager_init_failed: {exc}"
            MEMORY_MANAGER_INSTANCE = None
            return None


def _memory_manager_or_503() -> Any:
    manager = _memory_manager()
    if manager is None:
        reason = MEMORY_MANAGER_ERROR or "memory_unavailable"
        raise HTTPException(status_code=503, detail=reason)
    return manager


def _memory_item_matches_scope(
    metadata: Dict[str, Any],
    *,
    bucket: Optional[str],
    workspace_id: Optional[str],
    profile_id: Optional[str],
    project_id: Optional[str],
    session_key: Optional[str],
) -> bool:
    if bucket and str(metadata.get("bucket") or "").strip().lower() != bucket:
        return False
    if workspace_id and str(metadata.get("workspace_id") or "").strip() != workspace_id:
        return False
    if profile_id and str(metadata.get("profile_id") or "").strip() != profile_id:
        return False
    if project_id and str(metadata.get("project_id") or "").strip() != project_id:
        return False
    if session_key and str(metadata.get("session_key") or "").strip() != session_key:
        return False
    expires_at = _parse_utc_ts(metadata.get("expires_at"))
    if expires_at and expires_at <= _utc_now():
        return False
    return True


def _memory_search_scoped(
    query: str,
    *,
    bucket: Optional[str] = None,
    workspace_id: Optional[str] = None,
    profile_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_key: Optional[str] = None,
    k: int = 5,
) -> List[Dict[str, Any]]:
    from server_modules import memory_service

    return memory_service._memory_search_scoped(
        query,
        bucket=bucket,
        workspace_id=workspace_id,
        profile_id=profile_id,
        project_id=project_id,
        session_key=session_key,
        k=k,
    )


def _memory_scope_from_context(context: Dict[str, Any]) -> Dict[str, str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    workspace_id = _normalize_workspace_id(context.get("workspace_id") or metadata.get("workspace_id")) or "default"
    session_key = str(metadata.get("session_key") or "").strip()
    if not session_key:
        chat_id = str(metadata.get("chat_id") or "").strip()
        if chat_id:
            session_key = f"telegram:{chat_id}"
    scope = {
        "workspace_id": workspace_id,
        "profile_id": str(metadata.get("profile_id") or metadata.get("user_id") or "").strip(),
        "project_id": str(metadata.get("project_id") or context.get("workflow_id") or "").strip(),
        "session_key": session_key,
    }
    return scope


def _trim_memory_trace(trace: Dict[str, Any]) -> Dict[str, Any]:
    from server_modules import memory_service

    return memory_service._trim_memory_trace(trace)


def _memory_prompt_context_block(context: Dict[str, Any], max_items: int = 6) -> str:
    from server_modules import memory_service

    return memory_service._memory_prompt_context_block(context, max_items=max_items)


def _run_result_summary(run: Dict[str, Any]) -> str:
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else {}
    if isinstance(run.get("result"), str) and str(run.get("result")).strip():
        return str(run.get("result")).strip()
    if isinstance(result_data.get("summary"), str) and str(result_data.get("summary")).strip():
        return str(result_data.get("summary")).strip()
    return ""


def _memory_health_snapshot() -> Dict[str, Any]:
    from server_modules import memory_service

    return memory_service._memory_health_snapshot()


def _hydrate_run_memory_context(run_id: str, run: Dict[str, Any]) -> None:
    from server_modules import memory_service

    return memory_service._hydrate_run_memory_context(run_id, run)


def _persist_run_memory(run_id: str, run: Dict[str, Any]) -> None:
    from server_modules import memory_service

    return memory_service._persist_run_memory(run_id, run)
