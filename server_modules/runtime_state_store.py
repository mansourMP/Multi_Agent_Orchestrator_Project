from __future__ import annotations

import json
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional
import sqlite3

# SQLite is retained only for local-only offline cache concerns such as queue
# recovery, chat stream state, channel events, and runtime sessions.
# Live run truth and archived run history are durably sourced from Postgres.


def _parse_ts(raw: Any) -> float:
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return time.time()
    value = raw.strip()
    if not value:
        return time.time()
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value).astimezone(timezone.utc).timestamp()
    except Exception:
        return time.time()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@contextmanager
def _connect(db_path: Path) -> Iterator[sqlite3.Connection]:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
    finally:
        conn.close()


def init_runtime_state_db(db_path: Path) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS live_runs (
                run_id TEXT PRIMARY KEY,
                status TEXT,
                engine TEXT,
                workspace_id TEXT,
                execution_target TEXT,
                created_at TEXT,
                updated_at TEXT,
                sort_ts REAL NOT NULL,
                run_json TEXT NOT NULL,
                persisted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS local_pending_queue (
                run_id TEXT PRIMARY KEY,
                queue_order INTEGER NOT NULL,
                queued_at TEXT,
                persisted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS local_claims (
                run_id TEXT PRIMARY KEY,
                worker_id TEXT,
                claimed_at TEXT,
                last_heartbeat_at TEXT,
                lease_seconds INTEGER,
                claim_json TEXT NOT NULL,
                persisted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runtime_registrations (
                runtime_id TEXT PRIMARY KEY,
                runtime_type TEXT,
                status TEXT,
                current_run_id TEXT,
                last_seen_at TEXT,
                runtime_json TEXT NOT NULL,
                persisted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS run_history (
                run_id TEXT PRIMARY KEY,
                status TEXT,
                workspace_id TEXT,
                pack_id TEXT,
                created_at TEXT,
                updated_at TEXT,
                completed_at TEXT,
                sort_ts REAL NOT NULL,
                snapshot_json TEXT NOT NULL,
                persisted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS channel_events (
                id TEXT PRIMARY KEY,
                ts TEXT,
                workspace_id TEXT,
                channel TEXT,
                direction TEXT,
                event_type TEXT,
                session_key TEXT,
                run_id TEXT,
                trace_id TEXT,
                action TEXT,
                sort_ts REAL NOT NULL,
                event_json TEXT NOT NULL,
                persisted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_stream_state (
                session_id TEXT PRIMARY KEY,
                thread_id TEXT,
                request_id TEXT,
                workspace_id TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_event_seq INTEGER NOT NULL DEFAULT 0,
                partial_text TEXT NOT NULL DEFAULT '',
                final_payload_json TEXT,
                error_text TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runtime_sessions (
                session_id TEXT PRIMARY KEY,
                actor_key TEXT NOT NULL,
                workspace_id TEXT,
                user_id TEXT,
                status TEXT NOT NULL,
                runtime_options_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_touched_at TEXT NOT NULL,
                last_error TEXT,
                meta_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runtime_session_turns (
                turn_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                request_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT,
                input_json TEXT NOT NULL,
                final_payload_json TEXT,
                error_text TEXT,
                metrics_json TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES runtime_sessions(session_id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_live_runs_sort_ts ON live_runs(sort_ts DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_live_runs_workspace ON live_runs(workspace_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_local_pending_queue_order ON local_pending_queue(queue_order ASC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_local_claims_worker ON local_claims(worker_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_registrations_status ON runtime_registrations(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_run_history_sort_ts ON run_history(sort_ts DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_registrations_seen ON runtime_registrations(last_seen_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_run_history_workspace ON run_history(workspace_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_channel_events_sort_ts ON channel_events(sort_ts DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_channel_events_workspace ON channel_events(workspace_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_channel_events_session ON channel_events(session_key)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_channel_events_run ON channel_events(run_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_stream_state_updated ON chat_stream_state(updated_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_stream_state_status ON chat_stream_state(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_sessions_actor_key ON runtime_sessions(actor_key)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_sessions_status ON runtime_sessions(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_sessions_touched ON runtime_sessions(last_touched_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_session_turns_session ON runtime_session_turns(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_session_turns_status ON runtime_session_turns(status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_runtime_session_turns_updated ON runtime_session_turns(updated_at DESC)"
        )
        conn.commit()


def _json_blob(value: Any, *, fallback: str = "{}") -> str:
    if isinstance(value, str):
        token = value.strip()
        return token or fallback
    try:
        return json.dumps(value if value is not None else json.loads(fallback), ensure_ascii=False, separators=(",", ":"))
    except Exception:
        return fallback


def _parse_json_blob(raw: Any, fallback: Any) -> Any:
    if not isinstance(raw, str) or not raw.strip():
        return fallback
    try:
        parsed = json.loads(raw)
    except Exception:
        return fallback
    return parsed if parsed is not None else fallback


def _normalize_chat_stream_state_row(row: sqlite3.Row) -> Dict[str, Any]:
    final_payload = _parse_json_blob(row["final_payload_json"], None)
    if not isinstance(final_payload, dict):
        final_payload = None
    metadata = _parse_json_blob(row["metadata_json"], {})
    if not isinstance(metadata, dict):
        metadata = {}
    return {
        "session_id": str(row["session_id"] or "").strip(),
        "thread_id": str(row["thread_id"] or "").strip(),
        "request_id": str(row["request_id"] or "").strip(),
        "workspace_id": str(row["workspace_id"] or "").strip(),
        "status": str(row["status"] or "").strip(),
        "created_at": str(row["created_at"] or "").strip(),
        "updated_at": str(row["updated_at"] or "").strip(),
        "last_event_seq": int(row["last_event_seq"] or 0),
        "partial_text": str(row["partial_text"] or ""),
        "final_payload": final_payload,
        "error_text": str(row["error_text"] or "").strip(),
        "metadata": metadata,
    }


def _normalize_runtime_session_row(row: sqlite3.Row) -> Dict[str, Any]:
    runtime_options = _parse_json_blob(row["runtime_options_json"], {})
    if not isinstance(runtime_options, dict):
        runtime_options = {}
    meta = _parse_json_blob(row["meta_json"], {})
    if not isinstance(meta, dict):
        meta = {}
    return {
        "session_id": str(row["session_id"] or "").strip(),
        "actor_key": str(row["actor_key"] or "").strip(),
        "workspace_id": str(row["workspace_id"] or "").strip(),
        "user_id": str(row["user_id"] or "").strip(),
        "status": str(row["status"] or "").strip(),
        "runtime_options": runtime_options,
        "created_at": str(row["created_at"] or "").strip(),
        "updated_at": str(row["updated_at"] or "").strip(),
        "last_touched_at": str(row["last_touched_at"] or "").strip(),
        "last_error": str(row["last_error"] or "").strip(),
        "meta": meta,
    }


def _normalize_runtime_session_turn_row(row: sqlite3.Row) -> Dict[str, Any]:
    input_payload = _parse_json_blob(row["input_json"], {})
    if not isinstance(input_payload, dict):
        input_payload = {}
    final_payload = _parse_json_blob(row["final_payload_json"], None)
    if not isinstance(final_payload, dict):
        final_payload = None
    metrics = _parse_json_blob(row["metrics_json"], {})
    if not isinstance(metrics, dict):
        metrics = {}
    return {
        "turn_id": str(row["turn_id"] or "").strip(),
        "session_id": str(row["session_id"] or "").strip(),
        "request_id": str(row["request_id"] or "").strip(),
        "status": str(row["status"] or "").strip(),
        "started_at": str(row["started_at"] or "").strip(),
        "updated_at": str(row["updated_at"] or "").strip(),
        "completed_at": str(row["completed_at"] or "").strip(),
        "input": input_payload,
        "final_payload": final_payload,
        "error_text": str(row["error_text"] or "").strip(),
        "metrics": metrics,
    }


def upsert_runtime_session(db_path: Path, item: Dict[str, Any]) -> None:
    session_id = str(item.get("session_id") or "").strip()
    if not session_id:
        return
    created_at = str(item.get("created_at") or "").strip() or _utc_now_iso()
    updated_at = str(item.get("updated_at") or "").strip() or created_at
    last_touched_at = str(item.get("last_touched_at") or "").strip() or updated_at
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO runtime_sessions (
                session_id, actor_key, workspace_id, user_id, status,
                runtime_options_json, created_at, updated_at, last_touched_at,
                last_error, meta_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                actor_key = excluded.actor_key,
                workspace_id = excluded.workspace_id,
                user_id = excluded.user_id,
                status = excluded.status,
                runtime_options_json = excluded.runtime_options_json,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                last_touched_at = excluded.last_touched_at,
                last_error = excluded.last_error,
                meta_json = excluded.meta_json
            """,
            (
                session_id,
                str(item.get("actor_key") or "").strip() or session_id,
                str(item.get("workspace_id") or "").strip(),
                str(item.get("user_id") or "").strip(),
                str(item.get("status") or "ready").strip() or "ready",
                _json_blob(item.get("runtime_options") if isinstance(item.get("runtime_options"), dict) else {}, fallback="{}"),
                created_at,
                updated_at,
                last_touched_at,
                str(item.get("last_error") or "").strip() or None,
                _json_blob(item.get("meta") if isinstance(item.get("meta"), dict) else {}, fallback="{}"),
            ),
        )
        conn.commit()


def get_runtime_session(db_path: Path, session_id: str) -> Optional[Dict[str, Any]]:
    token = str(session_id or "").strip()
    if not token:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT session_id, actor_key, workspace_id, user_id, status,
                   runtime_options_json, created_at, updated_at, last_touched_at,
                   last_error, meta_json
            FROM runtime_sessions
            WHERE session_id = ?
            """,
            (token,),
        ).fetchone()
    if row is None:
        return None
    return _normalize_runtime_session_row(row)


def list_runtime_sessions(
    db_path: Path,
    *,
    statuses: Optional[List[str]] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    params: List[Any] = []
    query = """
        SELECT session_id, actor_key, workspace_id, user_id, status,
               runtime_options_json, created_at, updated_at, last_touched_at,
               last_error, meta_json
        FROM runtime_sessions
    """
    normalized_statuses = [str(item).strip() for item in (statuses or []) if str(item).strip()]
    if normalized_statuses:
        placeholders = ", ".join("?" for _ in normalized_statuses)
        query += f"\nWHERE status IN ({placeholders})"
        params.extend(normalized_statuses)
    query += "\nORDER BY last_touched_at DESC"
    if isinstance(limit, int) and limit > 0:
        query += "\nLIMIT ?"
        params.append(limit)
    with _connect(db_path) as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [_normalize_runtime_session_row(row) for row in rows]


def delete_runtime_session(db_path: Path, session_id: str) -> None:
    token = str(session_id or "").strip()
    if not token:
        return
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM runtime_sessions WHERE session_id = ?", (token,))
        conn.commit()


def upsert_runtime_session_turn(db_path: Path, item: Dict[str, Any]) -> None:
    turn_id = str(item.get("turn_id") or "").strip()
    session_id = str(item.get("session_id") or "").strip()
    request_id = str(item.get("request_id") or "").strip()
    if not turn_id or not session_id or not request_id:
        return
    started_at = str(item.get("started_at") or "").strip() or _utc_now_iso()
    updated_at = str(item.get("updated_at") or "").strip() or started_at
    completed_at = str(item.get("completed_at") or "").strip() or None
    final_payload = item.get("final_payload")
    final_payload_json = (
        _json_blob(final_payload, fallback="{}")
        if isinstance(final_payload, dict)
        else (str(item.get("final_payload_json") or "").strip() or None)
    )
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO runtime_session_turns (
                turn_id, session_id, request_id, status, started_at,
                updated_at, completed_at, input_json, final_payload_json,
                error_text, metrics_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(turn_id) DO UPDATE SET
                session_id = excluded.session_id,
                request_id = excluded.request_id,
                status = excluded.status,
                started_at = excluded.started_at,
                updated_at = excluded.updated_at,
                completed_at = excluded.completed_at,
                input_json = excluded.input_json,
                final_payload_json = excluded.final_payload_json,
                error_text = excluded.error_text,
                metrics_json = excluded.metrics_json
            """,
            (
                turn_id,
                session_id,
                request_id,
                str(item.get("status") or "running").strip() or "running",
                started_at,
                updated_at,
                completed_at,
                _json_blob(item.get("input") if isinstance(item.get("input"), dict) else {}, fallback="{}"),
                final_payload_json,
                str(item.get("error_text") or "").strip() or None,
                _json_blob(item.get("metrics") if isinstance(item.get("metrics"), dict) else {}, fallback="{}"),
            ),
        )
        conn.commit()


def get_runtime_session_turn(db_path: Path, turn_id: str) -> Optional[Dict[str, Any]]:
    token = str(turn_id or "").strip()
    if not token:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT turn_id, session_id, request_id, status, started_at,
                   updated_at, completed_at, input_json, final_payload_json,
                   error_text, metrics_json
            FROM runtime_session_turns
            WHERE turn_id = ?
            """,
            (token,),
        ).fetchone()
    if row is None:
        return None
    return _normalize_runtime_session_turn_row(row)


def list_runtime_session_turns(
    db_path: Path,
    *,
    session_id: str = "",
    statuses: Optional[List[str]] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    params: List[Any] = []
    clauses: List[str] = []
    session_token = str(session_id or "").strip()
    if session_token:
        clauses.append("session_id = ?")
        params.append(session_token)
    normalized_statuses = [str(item).strip() for item in (statuses or []) if str(item).strip()]
    if normalized_statuses:
        placeholders = ", ".join("?" for _ in normalized_statuses)
        clauses.append(f"status IN ({placeholders})")
        params.extend(normalized_statuses)
    query = """
        SELECT turn_id, session_id, request_id, status, started_at,
               updated_at, completed_at, input_json, final_payload_json,
               error_text, metrics_json
        FROM runtime_session_turns
    """
    if clauses:
        query += "\nWHERE " + " AND ".join(clauses)
    query += "\nORDER BY updated_at DESC"
    if isinstance(limit, int) and limit > 0:
        query += "\nLIMIT ?"
        params.append(limit)
    with _connect(db_path) as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [_normalize_runtime_session_turn_row(row) for row in rows]


def delete_runtime_session_turn(db_path: Path, turn_id: str) -> None:
    token = str(turn_id or "").strip()
    if not token:
        return
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM runtime_session_turns WHERE turn_id = ?", (token,))
        conn.commit()


def upsert_chat_stream_state(db_path: Path, item: Dict[str, Any]) -> None:
    session_id = str(item.get("session_id") or "").strip()
    if not session_id:
        return
    created_at = str(item.get("created_at") or "").strip() or _utc_now_iso()
    updated_at = str(item.get("updated_at") or "").strip() or created_at
    final_payload = item.get("final_payload")
    final_payload_json = None
    if isinstance(final_payload, dict):
        final_payload_json = _json_blob(final_payload, fallback="{}")
    else:
        raw_payload = str(item.get("final_payload_json") or "").strip()
        final_payload_json = raw_payload or None
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO chat_stream_state (
                session_id, thread_id, request_id, workspace_id, status,
                created_at, updated_at, last_event_seq, partial_text,
                final_payload_json, error_text, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                thread_id = excluded.thread_id,
                request_id = excluded.request_id,
                workspace_id = excluded.workspace_id,
                status = excluded.status,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                last_event_seq = excluded.last_event_seq,
                partial_text = excluded.partial_text,
                final_payload_json = excluded.final_payload_json,
                error_text = excluded.error_text,
                metadata_json = excluded.metadata_json
            """,
            (
                session_id,
                str(item.get("thread_id") or "").strip(),
                str(item.get("request_id") or "").strip(),
                str(item.get("workspace_id") or "").strip(),
                str(item.get("status") or "active").strip() or "active",
                created_at,
                updated_at,
                max(0, int(item.get("last_event_seq") or 0)),
                str(item.get("partial_text") or ""),
                final_payload_json,
                str(item.get("error_text") or "").strip() or None,
                _json_blob(item.get("metadata") if isinstance(item.get("metadata"), dict) else {}, fallback="{}"),
            ),
        )
        conn.commit()


def get_chat_stream_state(db_path: Path, session_id: str) -> Optional[Dict[str, Any]]:
    token = str(session_id or "").strip()
    if not token:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT session_id, thread_id, request_id, workspace_id, status,
                   created_at, updated_at, last_event_seq, partial_text,
                   final_payload_json, error_text, metadata_json
            FROM chat_stream_state
            WHERE session_id = ?
            """,
            (token,),
        ).fetchone()
    if row is None:
        return None
    return _normalize_chat_stream_state_row(row)


def list_chat_stream_states(
    db_path: Path,
    *,
    statuses: Optional[List[str]] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    params: List[Any] = []
    query = """
        SELECT session_id, thread_id, request_id, workspace_id, status,
               created_at, updated_at, last_event_seq, partial_text,
               final_payload_json, error_text, metadata_json
        FROM chat_stream_state
    """
    normalized_statuses = [
        str(item).strip()
        for item in (statuses or [])
        if str(item).strip()
    ]
    if normalized_statuses:
        placeholders = ", ".join("?" for _ in normalized_statuses)
        query += f"\nWHERE status IN ({placeholders})"
        params.extend(normalized_statuses)
    query += "\nORDER BY updated_at DESC"
    if isinstance(limit, int) and limit > 0:
        query += "\nLIMIT ?"
        params.append(limit)
    with _connect(db_path) as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return [_normalize_chat_stream_state_row(row) for row in rows]


def delete_expired_chat_stream_states(
    db_path: Path,
    *,
    older_than_seconds: int,
    now_ts: Optional[float] = None,
) -> int:
    ttl_seconds = max(1, int(older_than_seconds or 0))
    cutoff = datetime.fromtimestamp(float(now_ts if now_ts is not None else time.time()) - ttl_seconds, timezone.utc)
    cutoff_iso = cutoff.isoformat().replace("+00:00", "Z")
    with _connect(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM chat_stream_state WHERE updated_at < ?",
            (cutoff_iso,),
        )
        conn.commit()
        return int(cursor.rowcount or 0)


def upsert_live_run_state(db_path: Path, item: Dict[str, Any]) -> None:
    run_id = str(item.get("run_id") or "").strip()
    if not run_id:
        return
    context = item.get("context") if isinstance(item.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    created_at = str(item.get("created_at") or "").strip()
    updated_at = str(item.get("updated_at") or "").strip()
    sort_ts = _parse_ts(updated_at or created_at)
    payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO live_runs (
                run_id, status, engine, workspace_id, execution_target,
                created_at, updated_at, sort_ts, run_json, persisted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                status = excluded.status,
                engine = excluded.engine,
                workspace_id = excluded.workspace_id,
                execution_target = excluded.execution_target,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                sort_ts = excluded.sort_ts,
                run_json = excluded.run_json,
                persisted_at = excluded.persisted_at
            """,
            (
                run_id,
                str(item.get("status") or "").strip(),
                str(item.get("engine") or "").strip(),
                str(
                    item.get("workspace_id")
                    or context.get("workspace_id")
                    or ""
                ).strip(),
                str(
                    item.get("execution_target")
                    or metadata.get("execution_target_selected")
                    or metadata.get("execution_target_requested")
                    or ""
                ).strip(),
                created_at,
                updated_at,
                sort_ts,
                payload,
                _utc_now_iso(),
            ),
        )
        conn.commit()


def delete_live_run_state(db_path: Path, run_id: str) -> None:
    token = str(run_id or "").strip()
    if not token:
        return
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM live_runs WHERE run_id = ?", (token,))
        conn.commit()


def list_live_run_states(db_path: Path, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    params: List[Any] = []
    query = """
        SELECT run_json
        FROM live_runs
        ORDER BY sort_ts DESC
    """
    if isinstance(limit, int) and limit > 0:
        query += "\nLIMIT ?"
        params.append(limit)
    with _connect(db_path) as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        raw = row["run_json"]
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                out.append(parsed)
        except Exception:
            continue
    return out


def mark_stale_chat_stream_sessions_interrupted(
    db_path: Path,
    *,
    stale_before_ts: float,
    error_text: str,
) -> int:
    interrupted = 0
    for item in list_chat_stream_states(db_path, statuses=["active"]):
        updated_ts = _parse_ts(item.get("updated_at"))
        if updated_ts > float(stale_before_ts):
            continue
        item["status"] = "interrupted"
        item["updated_at"] = _utc_now_iso()
        item["error_text"] = str(error_text or "").strip()
        item["last_event_seq"] = max(1, int(item.get("last_event_seq") or 0) + 1)
        upsert_chat_stream_state(db_path, item)
        interrupted += 1
    return interrupted


def delete_chat_stream_sessions_older_than(db_path: Path, *, older_than_ts: float) -> int:
    deleted = 0
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT session_id, updated_at, created_at
            FROM chat_stream_state
            """
        ).fetchall()
        for row in rows:
            reference = _parse_ts(row["updated_at"] or row["created_at"])
            if reference > float(older_than_ts):
                continue
            session_id = str(row["session_id"] or "").strip()
            if not session_id:
                continue
            conn.execute("DELETE FROM chat_stream_state WHERE session_id = ?", (session_id,))
            deleted += 1
        conn.commit()
    return deleted


def replace_local_runtime_state(
    db_path: Path,
    *,
    pending_run_ids: List[str],
    claimed_runs: Dict[str, Dict[str, Any]],
    runtime_registrations: Dict[str, Dict[str, Any]],
) -> None:
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM local_pending_queue")
        for idx, raw_run_id in enumerate(pending_run_ids):
            run_id = str(raw_run_id or "").strip()
            if not run_id:
                continue
            conn.execute(
                """
                INSERT INTO local_pending_queue (
                    run_id, queue_order, queued_at, persisted_at
                )
                VALUES (?, ?, ?, ?)
                """,
                (
                    run_id,
                    idx,
                    _utc_now_iso(),
                    _utc_now_iso(),
                ),
            )

        conn.execute("DELETE FROM local_claims")
        for raw_run_id, raw_claim in claimed_runs.items():
            run_id = str(raw_run_id or "").strip()
            claim = raw_claim if isinstance(raw_claim, dict) else None
            if not run_id or not isinstance(claim, dict):
                continue
            payload = json.dumps(claim, ensure_ascii=False, separators=(",", ":"))
            conn.execute(
                """
                INSERT INTO local_claims (
                    run_id, worker_id, claimed_at, last_heartbeat_at,
                    lease_seconds, claim_json, persisted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    str(claim.get("worker_id") or "").strip(),
                    str(claim.get("claimed_at") or "").strip(),
                    str(claim.get("last_heartbeat_at") or "").strip(),
                    int(claim.get("lease_seconds") or 0),
                    payload,
                    _utc_now_iso(),
                ),
            )

        conn.execute("DELETE FROM runtime_registrations")
        for raw_runtime_id, raw_record in runtime_registrations.items():
            runtime_id = str(raw_runtime_id or "").strip()
            record = raw_record if isinstance(raw_record, dict) else None
            if not runtime_id or not isinstance(record, dict):
                continue
            payload = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
            conn.execute(
                """
                INSERT INTO runtime_registrations (
                    runtime_id, runtime_type, status, current_run_id,
                    last_seen_at, runtime_json, persisted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    runtime_id,
                    str(record.get("runtime_type") or "").strip(),
                    str(record.get("status") or "").strip(),
                    str(record.get("current_run_id") or "").strip(),
                    str(record.get("last_seen_at") or "").strip(),
                    payload,
                    _utc_now_iso(),
                ),
            )
        conn.commit()


def load_local_runtime_state(db_path: Path) -> Dict[str, Any]:
    with _connect(db_path) as conn:
        queue_rows = conn.execute(
            """
            SELECT run_id
            FROM local_pending_queue
            ORDER BY queue_order ASC
            """
        ).fetchall()
        claim_rows = conn.execute(
            """
            SELECT run_id, claim_json
            FROM local_claims
            """
        ).fetchall()
        runtime_rows = conn.execute(
            """
            SELECT runtime_id, runtime_json
            FROM runtime_registrations
            """
        ).fetchall()

    pending_run_ids = [str(row["run_id"] or "").strip() for row in queue_rows if str(row["run_id"] or "").strip()]
    claimed_runs: Dict[str, Dict[str, Any]] = {}
    for row in claim_rows:
        run_id = str(row["run_id"] or "").strip()
        if not run_id:
            continue
        try:
            parsed = json.loads(row["claim_json"])
        except Exception:
            continue
        if isinstance(parsed, dict):
            claimed_runs[run_id] = parsed

    runtime_registrations: Dict[str, Dict[str, Any]] = {}
    for row in runtime_rows:
        runtime_id = str(row["runtime_id"] or "").strip()
        if not runtime_id:
            continue
        try:
            parsed = json.loads(row["runtime_json"])
        except Exception:
            continue
        if isinstance(parsed, dict):
            runtime_registrations[runtime_id] = parsed

    return {
        "pending_run_ids": pending_run_ids,
        "claimed_runs": claimed_runs,
        "runtime_registrations": runtime_registrations,
    }


def _prune_run_history(conn: sqlite3.Connection, limit: int) -> None:
    conn.execute(
        """
        DELETE FROM run_history
        WHERE run_id NOT IN (
            SELECT run_id
            FROM run_history
            ORDER BY sort_ts DESC
            LIMIT ?
        )
        """,
        (max(1, int(limit)),),
    )


def _prune_channel_events(conn: sqlite3.Connection, limit: int) -> None:
    conn.execute(
        """
        DELETE FROM channel_events
        WHERE id NOT IN (
            SELECT id
            FROM channel_events
            ORDER BY sort_ts DESC
            LIMIT ?
        )
        """,
        (max(1, int(limit)),),
    )


def upsert_run_history_item(db_path: Path, item: Dict[str, Any], limit: int) -> None:
    run_id = str(item.get("run_id") or "").strip()
    if not run_id:
        return
    created_at = str(item.get("created_at") or "").strip()
    updated_at = str(item.get("updated_at") or "").strip()
    completed_at = str(item.get("completed_at") or "").strip()
    sort_ts = _parse_ts(updated_at or completed_at or created_at)
    payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO run_history (
                run_id, status, workspace_id, pack_id,
                created_at, updated_at, completed_at,
                sort_ts, snapshot_json, persisted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                status = excluded.status,
                workspace_id = excluded.workspace_id,
                pack_id = excluded.pack_id,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                completed_at = excluded.completed_at,
                sort_ts = excluded.sort_ts,
                snapshot_json = excluded.snapshot_json,
                persisted_at = excluded.persisted_at
            """,
            (
                run_id,
                str(item.get("status") or "").strip(),
                str(item.get("workspace_id") or "").strip(),
                str(item.get("pack_id") or "").strip(),
                created_at,
                updated_at,
                completed_at,
                sort_ts,
                payload,
                _utc_now_iso(),
            ),
        )
        _prune_run_history(conn, limit)
        conn.commit()


def replace_run_history(db_path: Path, items: List[Dict[str, Any]], limit: int) -> None:
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM run_history")
        for item in items[: max(1, int(limit))]:
            run_id = str(item.get("run_id") or "").strip()
            if not run_id:
                continue
            created_at = str(item.get("created_at") or "").strip()
            updated_at = str(item.get("updated_at") or "").strip()
            completed_at = str(item.get("completed_at") or "").strip()
            sort_ts = _parse_ts(updated_at or completed_at or created_at)
            payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
            conn.execute(
                """
                INSERT INTO run_history (
                    run_id, status, workspace_id, pack_id,
                    created_at, updated_at, completed_at,
                    sort_ts, snapshot_json, persisted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    str(item.get("status") or "").strip(),
                    str(item.get("workspace_id") or "").strip(),
                    str(item.get("pack_id") or "").strip(),
                    created_at,
                    updated_at,
                    completed_at,
                    sort_ts,
                    payload,
                    _utc_now_iso(),
                ),
            )
        _prune_run_history(conn, limit)
        conn.commit()


def list_run_history(db_path: Path, limit: int) -> List[Dict[str, Any]]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT snapshot_json
            FROM run_history
            ORDER BY sort_ts DESC
            LIMIT ?
            """,
            (max(1, int(limit)),),
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        raw = row["snapshot_json"]
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                out.append(parsed)
        except Exception:
            continue
    return out


def append_channel_event(db_path: Path, item: Dict[str, Any], limit: int) -> None:
    event_id = str(item.get("id") or "").strip()
    if not event_id:
        return
    ts = str(item.get("ts") or "").strip()
    sort_ts = _parse_ts(ts)
    payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO channel_events (
                id, ts, workspace_id, channel, direction, event_type,
                session_key, run_id, trace_id, action,
                sort_ts, event_json, persisted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                ts = excluded.ts,
                workspace_id = excluded.workspace_id,
                channel = excluded.channel,
                direction = excluded.direction,
                event_type = excluded.event_type,
                session_key = excluded.session_key,
                run_id = excluded.run_id,
                trace_id = excluded.trace_id,
                action = excluded.action,
                sort_ts = excluded.sort_ts,
                event_json = excluded.event_json,
                persisted_at = excluded.persisted_at
            """,
            (
                event_id,
                ts,
                str(item.get("workspace_id") or "").strip(),
                str(item.get("channel") or "").strip().lower(),
                str(item.get("direction") or "").strip().lower(),
                str(item.get("event_type") or "").strip().lower(),
                str(item.get("session_key") or "").strip(),
                str(item.get("run_id") or "").strip(),
                str(item.get("trace_id") or "").strip(),
                str(item.get("action") or "").strip().lower(),
                sort_ts,
                payload,
                _utc_now_iso(),
            ),
        )
        _prune_channel_events(conn, limit)
        conn.commit()


def replace_channel_events(db_path: Path, items: List[Dict[str, Any]], limit: int) -> None:
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM channel_events")
        for item in items[: max(1, int(limit))]:
            event_id = str(item.get("id") or "").strip()
            if not event_id:
                continue
            ts = str(item.get("ts") or "").strip()
            sort_ts = _parse_ts(ts)
            payload = json.dumps(item, ensure_ascii=False, separators=(",", ":"))
            conn.execute(
                """
                INSERT INTO channel_events (
                    id, ts, workspace_id, channel, direction, event_type,
                    session_key, run_id, trace_id, action,
                    sort_ts, event_json, persisted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    ts,
                    str(item.get("workspace_id") or "").strip(),
                    str(item.get("channel") or "").strip().lower(),
                    str(item.get("direction") or "").strip().lower(),
                    str(item.get("event_type") or "").strip().lower(),
                    str(item.get("session_key") or "").strip(),
                    str(item.get("run_id") or "").strip(),
                    str(item.get("trace_id") or "").strip(),
                    str(item.get("action") or "").strip().lower(),
                    sort_ts,
                    payload,
                    _utc_now_iso(),
                ),
            )
        _prune_channel_events(conn, limit)
        conn.commit()


def list_channel_events(db_path: Path, limit: int) -> List[Dict[str, Any]]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT event_json
            FROM channel_events
            ORDER BY sort_ts DESC
            LIMIT ?
            """,
            (max(1, int(limit)),),
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        raw = row["event_json"]
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                out.append(parsed)
        except Exception:
            continue
    return out
