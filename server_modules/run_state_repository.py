from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional
import sqlite3

from server_modules import db as runtime_db


LOGGER = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalized_sqlite_db_path() -> Path:
    raw = str(os.getenv("ORION_RUNTIME_STATE_DB") or ".orion_runtime_state.db").strip()
    return Path(raw).expanduser().resolve()


def _json_payload(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"), default=str)
    except Exception:
        return "{}"


def _payload_workspace_id(payload: Dict[str, Any]) -> str:
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    return str(payload.get("workspace_id") or context.get("workspace_id") or "default").strip() or "default"


def _payload_tenant_id(payload: Dict[str, Any]) -> str:
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(payload.get("tenant_id") or context.get("tenant_id") or metadata.get("tenant_id") or "default").strip() or "default"


def _sqlite_live_run_fallback(run_id: str, *, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    token = str(run_id or "").strip()
    if not token:
        return None
    resolved_db_path = db_path or _normalized_sqlite_db_path()
    if not resolved_db_path.exists():
        return None
    try:
        conn = sqlite3.connect(str(resolved_db_path), timeout=5.0)
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute(
                """
                SELECT run_json
                FROM live_runs
                WHERE run_id = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
        finally:
            conn.close()
    except Exception as exc:
        LOGGER.warning("SQLite live-run fallback lookup failed for %s: %s", token, exc)
        return None
    if row is None:
        return None
    try:
        parsed = json.loads(str(row["run_json"] or ""))
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


async def upsert_live_run(
    run_id: str,
    workspace_id: str,
    tenant_id: str,
    state: str,
    payload: Dict[str, Any],
    trace_id: str,
) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            INSERT INTO live_runs (run_id, workspace_id, tenant_id, state, payload, trace_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW(), NOW())
            ON CONFLICT (run_id) DO UPDATE SET
                workspace_id = EXCLUDED.workspace_id,
                tenant_id = EXCLUDED.tenant_id,
                state = EXCLUDED.state,
                payload = EXCLUDED.payload,
                trace_id = COALESCE(NULLIF(EXCLUDED.trace_id, ''), live_runs.trace_id),
                updated_at = NOW()
            """,
            token,
            str(workspace_id or "").strip() or "default",
            str(tenant_id or "").strip() or "default",
            str(state or "").strip() or "queued",
            _json_payload(payload),
            str(trace_id or "").strip() or None,
        )
    except Exception as exc:
        LOGGER.warning("Postgres upsert_live_run failed for %s: %s", token, exc)
        return None
    return None


async def get_live_run(run_id: str) -> Optional[Dict[str, Any]]:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is not None:
        try:
            row = await pool.fetchrow(
                """
                SELECT payload
                FROM live_runs
                WHERE run_id = $1
                LIMIT 1
                """,
                token,
            )
            if row is not None:
                payload = row["payload"]
                if isinstance(payload, dict):
                    return payload
                if isinstance(payload, str):
                    try:
                        parsed = json.loads(payload)
                    except Exception:
                        parsed = None
                    if isinstance(parsed, dict):
                        return parsed
        except Exception as exc:
            LOGGER.warning("Postgres get_live_run failed for %s: %s", token, exc)
    return _sqlite_live_run_fallback(token)


async def record_transition(
    run_id: str,
    from_state: str,
    to_state: str,
    actor: str,
    trace_id: str,
) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            INSERT INTO run_transitions (run_id, from_state, to_state, actor, trace_id, timestamp)
            SELECT $1, $2, $3, $4, $5, NOW()
            WHERE NOT EXISTS (
                SELECT 1
                FROM run_transitions
                WHERE run_id = $1
                  AND from_state = $2
                  AND to_state = $3
                  AND actor = $4
                  AND COALESCE(trace_id, '') = COALESCE($5, '')
            )
            """,
            token,
            str(from_state or "").strip() or "unknown",
            str(to_state or "").strip() or "unknown",
            str(actor or "").strip() or "runtime",
            str(trace_id or "").strip() or None,
        )
    except Exception as exc:
        LOGGER.warning("Postgres record_transition failed for %s: %s", token, exc)
        return None
    return None


async def archive_run(
    run_id: str,
    final_state: str,
    payload: Dict[str, Any],
    trace_id: str,
) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            INSERT INTO run_archive (run_id, workspace_id, tenant_id, final_state, payload, trace_id, completed_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
            ON CONFLICT (run_id) DO UPDATE SET
                workspace_id = EXCLUDED.workspace_id,
                tenant_id = EXCLUDED.tenant_id,
                final_state = EXCLUDED.final_state,
                payload = EXCLUDED.payload,
                trace_id = COALESCE(NULLIF(EXCLUDED.trace_id, ''), run_archive.trace_id),
                completed_at = NOW()
            """,
            token,
            _payload_workspace_id(payload),
            _payload_tenant_id(payload),
            str(final_state or "").strip() or "completed",
            _json_payload(payload),
            str(trace_id or "").strip() or None,
        )
    except Exception as exc:
        LOGGER.warning("Postgres archive_run failed for %s: %s", token, exc)
        return None
    return None


async def claim_run(run_id: str, worker_id: str, ttl: int, trace_id: str) -> None:
    token = str(run_id or "").strip()
    worker = str(worker_id or "").strip()
    if not token or not worker:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            INSERT INTO local_queue_claims (run_id, worker_id, claimed_at, ttl, trace_id)
            VALUES ($1, $2, NOW(), $3, $4)
            ON CONFLICT (run_id) DO UPDATE SET
                worker_id = EXCLUDED.worker_id,
                claimed_at = NOW(),
                ttl = EXCLUDED.ttl,
                trace_id = COALESCE(NULLIF(EXCLUDED.trace_id, ''), local_queue_claims.trace_id)
            """,
            token,
            worker,
            max(1, int(ttl or 0)),
            str(trace_id or "").strip() or None,
        )
    except Exception as exc:
        LOGGER.warning("Postgres claim_run failed for %s: %s", token, exc)
        return None
    return None


async def release_claim(run_id: str) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            DELETE FROM local_queue_claims
            WHERE run_id = $1
            """,
            token,
        )
    except Exception as exc:
        LOGGER.warning("Postgres release_claim failed for %s: %s", token, exc)
        return None
    return None
