from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import sqlite3


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


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


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
        conn.commit()


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
