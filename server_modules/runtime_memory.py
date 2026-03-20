from __future__ import annotations

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


def configure_runtime_memory(
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
    manager = _memory_manager()
    if manager is None:
        return []
    try:
        fetch_limit = max(int(k), 1)
        fetch_limit = min(max(fetch_limit * 8, 24), 120)
        raw_results = manager.search_memory(query, fetch_limit)
    except Exception:
        return []
    if not isinstance(raw_results, list):
        return []

    out: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        mem_id = str(item.get("id") or "").strip()
        if not mem_id or mem_id in seen_ids:
            continue
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        if not _memory_item_matches_scope(
            metadata,
            bucket=bucket,
            workspace_id=workspace_id,
            profile_id=profile_id,
            project_id=project_id,
            session_key=session_key,
        ):
            continue
        seen_ids.add(mem_id)
        out.append(
            {
                "id": mem_id,
                "text": str(item.get("text") or ""),
                "score": item.get("score"),
                "metadata": metadata,
            }
        )
        if len(out) >= int(k):
            break
    return out


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
    reads = trace.get("reads") if isinstance(trace.get("reads"), list) else []
    writes = trace.get("writes") if isinstance(trace.get("writes"), list) else []
    return {
        "enabled": bool(trace.get("enabled")),
        "reads": [_json_safe(item) for item in reads[-20:]],
        "writes": [_json_safe(item) for item in writes[-20:]],
        "last_error": str(trace.get("last_error") or "").strip() or None,
        "updated_at": str(trace.get("updated_at") or "").strip() or None,
    }


def _memory_prompt_context_block(context: Dict[str, Any], max_items: int = 6) -> str:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    memory_ctx = metadata.get("memory_context") if isinstance(metadata.get("memory_context"), dict) else {}
    items = memory_ctx.get("items") if isinstance(memory_ctx.get("items"), list) else []
    if not items:
        return "Memory Context:\n- none"
    lines: List[str] = []
    for item in items[: max(1, max_items)]:
        if not isinstance(item, dict):
            continue
        mmeta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        bucket = str(mmeta.get("bucket") or "unknown").strip().lower()
        text = _compact_event_text(item.get("text"), limit=220)
        if text:
            lines.append(f"- ({bucket}) {text}")
    if not lines:
        return "Memory Context:\n- none"
    return "Memory Context:\n" + "\n".join(lines)


def _run_result_summary(run: Dict[str, Any]) -> str:
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else {}
    if isinstance(run.get("result"), str) and str(run.get("result")).strip():
        return str(run.get("result")).strip()
    if isinstance(result_data.get("summary"), str) and str(result_data.get("summary")).strip():
        return str(result_data.get("summary")).strip()
    return ""


def _memory_health_snapshot() -> Dict[str, Any]:
    db_path = Path(ORION_MEMORY_DB_PATH)
    rows = 0
    sqlite_error: Optional[str] = None
    if db_path.exists():
        try:
            conn = sqlite3.connect(str(db_path))
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM fallback_memory")
            row = cur.fetchone()
            rows = int(row[0] if row and row[0] is not None else 0)
            conn.close()
        except Exception as exc:
            sqlite_error = str(exc)
    manager = _memory_manager()
    lancedb_initialized = bool(getattr(getattr(manager, "lancedb", None), "_initialized", False)) if manager else False
    return {
        "enabled": ORION_MEMORY_ENABLED,
        "manager_ready": manager is not None,
        "manager_error": MEMORY_MANAGER_ERROR,
        "db_path": str(db_path),
        "db_exists": db_path.exists(),
        "db_size_bytes": int(db_path.stat().st_size) if db_path.exists() else 0,
        "sqlite_rows": rows,
        "sqlite_error": sqlite_error,
        "lancedb_uri": ORION_MEMORY_LANCEDB_URI,
        "lancedb_initialized": lancedb_initialized,
    }


def _hydrate_run_memory_context(run_id: str, run: Dict[str, Any]) -> None:
    trace = run.setdefault("memory_trace", {"enabled": ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None})
    if not ORION_MEMORY_ENABLED:
        trace["enabled"] = False
        trace["updated_at"] = _utc_now_iso()
        return
    manager = _memory_manager()
    if manager is None:
        trace["last_error"] = MEMORY_MANAGER_ERROR or "memory_unavailable"
        trace["updated_at"] = _utc_now_iso()
        return

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if str(metadata.get("memory_read_enabled") or "1").strip().lower() in {"0", "false", "no", "off"}:
        trace["updated_at"] = _utc_now_iso()
        return

    user_goal = str(context.get("user_goal") or "").strip()
    business_plan = str(context.get("business_plan") or "").strip()
    query = "\n".join([part for part in [user_goal, business_plan] if part]).strip()
    if not query:
        query = "recent context"
    read_k = ORION_MEMORY_READ_K
    try:
        read_k = max(1, min(int(metadata.get("memory_read_k") or ORION_MEMORY_READ_K), 20))
    except Exception:
        read_k = ORION_MEMORY_READ_K

    scope = _memory_scope_from_context(context)
    bucket_queries: List[tuple[str, Dict[str, Optional[str]]]] = []
    if scope.get("profile_id"):
        bucket_queries.append(("profile", {"profile_id": scope.get("profile_id")}))
    if scope.get("project_id"):
        bucket_queries.append(("project", {"project_id": scope.get("project_id")}))
    if scope.get("session_key"):
        bucket_queries.append(("session", {"session_key": scope.get("session_key")}))
    if not bucket_queries:
        bucket_queries.append(("session", {"session_key": f"run:{run_id}"}))

    aggregated: List[Dict[str, Any]] = []
    read_records: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    for bucket, bucket_scope in bucket_queries:
        items = _memory_search_scoped(
            query,
            bucket=bucket,
            workspace_id=scope.get("workspace_id"),
            profile_id=bucket_scope.get("profile_id"),
            project_id=bucket_scope.get("project_id"),
            session_key=bucket_scope.get("session_key"),
            k=read_k,
        )
        read_records.append({"bucket": bucket, "count": len(items), "k": read_k})
        for item in items:
            mem_id = str(item.get("id") or "").strip()
            if not mem_id or mem_id in seen_ids:
                continue
            seen_ids.add(mem_id)
            aggregated.append(item)

    memory_context = {
        "query": _compact_event_text(query, limit=500),
        "scope": scope,
        "items": aggregated[: max(1, read_k * 2)],
        "count": len(aggregated),
    }
    metadata["memory_context"] = memory_context
    context["metadata"] = metadata
    run["context"] = context
    trace_reads = trace.get("reads") if isinstance(trace.get("reads"), list) else []
    trace_reads.extend(read_records)
    trace["reads"] = trace_reads[-20:]
    trace["updated_at"] = _utc_now_iso()
    run["memory_trace"] = trace

    _emit_log(
        run["logs"],
        "info",
        f"Memory context loaded: {len(aggregated)} item(s).",
        event="memory_context",
        data={"query": memory_context["query"], "scope": scope, "count": len(aggregated)},
    )


def _persist_run_memory(run_id: str, run: Dict[str, Any]) -> None:
    trace = run.setdefault("memory_trace", {"enabled": ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None})
    if not ORION_MEMORY_ENABLED:
        trace["enabled"] = False
        trace["updated_at"] = _utc_now_iso()
        return
    manager = _memory_manager()
    if manager is None:
        trace["last_error"] = MEMORY_MANAGER_ERROR or "memory_unavailable"
        trace["updated_at"] = _utc_now_iso()
        return
    if str(run.get("status") or "").strip().lower() != "completed":
        trace["updated_at"] = _utc_now_iso()
        return

    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if str(metadata.get("memory_write_enabled") or "1").strip().lower() in {"0", "false", "no", "off"}:
        trace["updated_at"] = _utc_now_iso()
        return

    scope = _memory_scope_from_context(context)
    goal = _compact_event_text(context.get("user_goal"), limit=700)
    summary = _compact_event_text(_run_result_summary(run), limit=1300)
    if not summary:
        trace["updated_at"] = _utc_now_iso()
        return
    memory_text = f"Goal: {goal or 'n/a'}\nResult: {summary}"
    memory_text = memory_text[:ORION_MEMORY_MAX_TEXT_CHARS]

    retention_days = ORION_MEMORY_RETENTION_DAYS_DEFAULT
    try:
        retention_days = max(1, min(int(metadata.get("memory_retention_days") or retention_days), 3650))
    except Exception:
        retention_days = ORION_MEMORY_RETENTION_DAYS_DEFAULT
    expires_at = (_utc_now() + timedelta(days=retention_days)).isoformat().replace("+00:00", "Z")

    targets: List[Dict[str, str]] = []
    session_key = scope.get("session_key") or f"run:{run_id}"
    targets.append({"bucket": "session", "session_key": session_key})
    if scope.get("project_id"):
        targets.append({"bucket": "project", "project_id": scope["project_id"]})
    if scope.get("profile_id"):
        targets.append({"bucket": "profile", "profile_id": scope["profile_id"]})

    writes = trace.get("writes") if isinstance(trace.get("writes"), list) else []
    for target in targets:
        bucket = str(target.get("bucket") or "").strip().lower()
        if bucket not in MEMORY_BUCKETS:
            continue
        record_metadata = {
            "bucket": bucket,
            "workspace_id": scope.get("workspace_id") or "default",
            "profile_id": target.get("profile_id") or "",
            "project_id": target.get("project_id") or "",
            "session_key": target.get("session_key") or "",
            "source": "run_completion",
            "run_id": run_id,
            "engine": str(run.get("engine") or "").strip().lower(),
            "retention_days": retention_days,
            "expires_at": expires_at,
        }
        try:
            memory_id = manager.upsert_memory(memory_text, record_metadata)
            writes.append({"bucket": bucket, "id": memory_id, "scope": _json_safe(target)})
        except Exception as exc:
            trace["last_error"] = f"memory_write_failed:{exc}"

    trace["writes"] = writes[-20:]
    trace["updated_at"] = _utc_now_iso()
    run["memory_trace"] = trace
    _refresh_archived_run_snapshot(run_id, run)
    if writes:
        _emit_log(
            run["logs"],
            "info",
            f"Memory write completed: {len(writes)} item(s).",
            event="memory_write",
            data={"writes": writes[-len(targets):]},
        )
