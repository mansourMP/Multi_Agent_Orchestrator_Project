from __future__ import annotations

import asyncio
import concurrent.futures
from datetime import datetime, timezone
import json
import logging
import threading
from typing import Any, Awaitable, Callable, Dict, Optional, TypeVar

from server_modules import db as runtime_db


LOGGER = logging.getLogger(__name__)
_T = TypeVar("_T")
_SYNC_DISPATCH_LOCK = threading.Lock()
_SYNC_DISPATCH_READY = threading.Event()
_SYNC_DISPATCH_THREAD: Optional[threading.Thread] = None
_SYNC_DISPATCH_LOOP: Optional[asyncio.AbstractEventLoop] = None
_SYNC_DISPATCH_THREAD_ID: Optional[int] = None


class RunStateRepositoryError(RuntimeError):
    """Base exception for durable run-state failures."""


class RunStatePersistenceError(RunStateRepositoryError):
    """Raised when a critical run-state persistence operation cannot complete."""


class RunClaimConflictError(RunStatePersistenceError):
    """Raised when a run is already claimed by another live worker."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def dispatch_repository_call(awaitable: Awaitable[Any], *, operation: str) -> None:
    try:
        future = _submit_awaitable(awaitable, operation=operation)
    except Exception as exc:
        _close_awaitable_quietly(awaitable)
        LOGGER.warning("Repository async dispatch failed during %s: %s", operation, exc)
        return

    def _report_completion(done: concurrent.futures.Future[Any]) -> None:
        try:
            done.result()
        except Exception as exc:  # pragma: no cover - background logging path
            LOGGER.warning("Repository async operation failed during %s: %s", operation, exc)

    future.add_done_callback(_report_completion)


def _close_awaitable_quietly(awaitable: Awaitable[Any]) -> None:
    close_fn = getattr(awaitable, "close", None)
    if callable(close_fn):
        try:
            close_fn()
        except Exception:
            return


def _run_sync_dispatch_loop() -> None:
    global _SYNC_DISPATCH_LOOP, _SYNC_DISPATCH_THREAD_ID

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    _SYNC_DISPATCH_LOOP = loop
    _SYNC_DISPATCH_THREAD_ID = threading.get_ident()
    _SYNC_DISPATCH_READY.set()
    try:
        loop.run_forever()
    finally:  # pragma: no cover - shutdown path
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.run_until_complete(loop.shutdown_asyncgens())
        loop.close()


def _ensure_sync_dispatch_loop() -> asyncio.AbstractEventLoop:
    global _SYNC_DISPATCH_THREAD, _SYNC_DISPATCH_LOOP, _SYNC_DISPATCH_THREAD_ID

    with _SYNC_DISPATCH_LOCK:
        if (
            _SYNC_DISPATCH_LOOP is not None
            and not _SYNC_DISPATCH_LOOP.is_closed()
            and _SYNC_DISPATCH_THREAD is not None
            and _SYNC_DISPATCH_THREAD.is_alive()
        ):
            return _SYNC_DISPATCH_LOOP
        _SYNC_DISPATCH_READY.clear()
        _SYNC_DISPATCH_LOOP = None
        _SYNC_DISPATCH_THREAD_ID = None
        _SYNC_DISPATCH_THREAD = threading.Thread(
            target=_run_sync_dispatch_loop,
            name="run-state-sync-dispatch",
            daemon=True,
        )
        _SYNC_DISPATCH_THREAD.start()

    if not _SYNC_DISPATCH_READY.wait(timeout=5.0):
        raise RuntimeError("Repository sync dispatch loop failed to start.")
    if _SYNC_DISPATCH_LOOP is None:
        raise RuntimeError("Repository sync dispatch loop is unavailable.")
    return _SYNC_DISPATCH_LOOP


def _submit_awaitable(
    awaitable: Awaitable[_T],
    *,
    operation: str,
) -> concurrent.futures.Future[_T]:
    loop = _ensure_sync_dispatch_loop()
    try:
        return asyncio.run_coroutine_threadsafe(awaitable, loop)
    except Exception:
        _close_awaitable_quietly(awaitable)
        raise


def _run_sync(
    awaitable_factory: Callable[[], Awaitable[_T]],
    *,
    operation: str,
    fallback: _T,
    raise_on_error: bool = False,
) -> _T:
    try:
        future = _submit_awaitable(awaitable_factory(), operation=operation)
        return future.result()
    except Exception as exc:
        if raise_on_error:
            raise
        LOGGER.warning("Repository sync dispatch failed during %s: %s", operation, exc)
        return fallback


async def _require_pool(*, operation: str) -> Any:
    pool = await runtime_db.get_pool()
    if pool is None:
        raise RunStatePersistenceError(
            f"Postgres pool unavailable during {operation}; refusing to continue with non-durable run state"
        )
    return pool


def _json_payload(value: Any) -> str:
    try:
        return json.dumps(value if value is not None else {}, ensure_ascii=False, separators=(",", ":"), default=str)
    except Exception:
        return "{}"


def _json_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            parsed = None
        if isinstance(parsed, dict):
            return parsed
    return {}


def _payload_workspace_id(payload: Dict[str, Any]) -> str:
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    return str(payload.get("workspace_id") or context.get("workspace_id") or "default").strip() or "default"


def _payload_tenant_id(payload: Dict[str, Any]) -> str:
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return str(payload.get("tenant_id") or context.get("tenant_id") or metadata.get("tenant_id") or "default").strip() or "default"


async def _ensure_local_queue_tables(pool: Any) -> None:
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS local_queue_claims (
            run_id TEXT PRIMARY KEY,
            worker_id TEXT NOT NULL,
            claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ttl INTEGER NOT NULL,
            trace_id TEXT
        )
        """
    )
    await pool.execute("ALTER TABLE local_queue_claims ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NULL")
    await pool.execute("ALTER TABLE local_queue_claims ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ NULL")
    await pool.execute("ALTER TABLE local_queue_claims ADD COLUMN IF NOT EXISTS last_worker_note TEXT NULL")
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_local_queue_claims_worker_id ON local_queue_claims(worker_id, claimed_at DESC)"
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_local_queue_claims_heartbeat ON local_queue_claims(last_heartbeat_at DESC, claimed_at DESC)"
    )
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS local_queue_dead_letters (
            run_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            specialist_key TEXT NULL,
            reason TEXT NOT NULL,
            trace_id TEXT NULL,
            failure_count INTEGER NOT NULL DEFAULT 0,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_local_queue_dead_letters_workspace ON local_queue_dead_letters(workspace_id, last_recorded_at DESC)"
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_local_queue_dead_letters_specialist ON local_queue_dead_letters(specialist_key, last_recorded_at DESC)"
    )


async def _ensure_fleet_runtime_tables(pool: Any) -> None:
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS fleet_worker_registrations (
            worker_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            machine_id TEXT NOT NULL,
            runtime_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            control_state TEXT NOT NULL DEFAULT 'active',
            current_run_id TEXT NULL,
            instance_id TEXT NULL,
            shard_key TEXT NOT NULL,
            prewarm_state TEXT NULL,
            warm_pool TEXT NULL,
            lease_seconds INTEGER NOT NULL DEFAULT 30,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_heartbeat_at TIMESTAMPTZ NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_fleet_worker_registrations_workspace_seen ON fleet_worker_registrations(workspace_id, last_heartbeat_at DESC, updated_at DESC)"
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_fleet_worker_registrations_shard ON fleet_worker_registrations(shard_key, status, control_state)"
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_fleet_worker_registrations_prewarm ON fleet_worker_registrations(prewarm_state, runtime_type, updated_at DESC)"
    )
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS fleet_queue_partitions (
            partition_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            specialist_key TEXT NOT NULL,
            pending_count INTEGER NOT NULL DEFAULT 0,
            claimed_count INTEGER NOT NULL DEFAULT 0,
            online_workers INTEGER NOT NULL DEFAULT 0,
            busy_workers INTEGER NOT NULL DEFAULT 0,
            idle_workers INTEGER NOT NULL DEFAULT 0,
            prewarmed_workers INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL DEFAULT 'healthy',
            retry_after_seconds INTEGER NOT NULL DEFAULT 0,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_fleet_queue_partitions_workspace ON fleet_queue_partitions(workspace_id, state, updated_at DESC)"
    )
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_fleet_queue_partitions_specialist ON fleet_queue_partitions(specialist_key, updated_at DESC)"
    )


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
    pool = await _require_pool(operation="upsert_live_run")
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
        raise RunStatePersistenceError(f"Postgres upsert_live_run failed for {token}: {exc}") from exc
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
    return None


async def get_archived_run(run_id: str) -> Optional[Dict[str, Any]]:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        row = await pool.fetchrow(
            """
            SELECT payload
            FROM run_archive
            WHERE run_id = $1
            LIMIT 1
            """,
            token,
        )
    except Exception as exc:
        LOGGER.warning("Postgres get_archived_run failed for %s: %s", token, exc)
        return None
    if row is None:
        return None
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
    return None


async def delete_live_run(run_id: str) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="delete_live_run")
    try:
        await pool.execute(
            """
            DELETE FROM live_runs
            WHERE run_id = $1
            """,
            token,
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres delete_live_run failed for {token}: {exc}") from exc
    return None


async def list_live_runs() -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    try:
        rows = await pool.fetch(
            """
            SELECT payload
            FROM live_runs
            ORDER BY updated_at DESC, created_at DESC
            """
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_live_runs failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = row["payload"]
        if isinstance(payload, dict):
            items.append(payload)
            continue
        if isinstance(payload, str):
            try:
                parsed = json.loads(payload)
            except Exception:
                parsed = None
            if isinstance(parsed, dict):
                items.append(parsed)
    return items


async def list_live_runs_by_state(states: list[str]) -> list[Dict[str, Any]]:
    normalized_states = [str(state or "").strip().lower() for state in (states or []) if str(state or "").strip()]
    if not normalized_states:
        return await list_live_runs()
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    try:
        rows = await pool.fetch(
            """
            SELECT payload
            FROM live_runs
            WHERE LOWER(COALESCE(state, '')) = ANY($1::text[])
            ORDER BY updated_at DESC, created_at DESC
            """,
            normalized_states,
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_live_runs_by_state failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = row["payload"]
        if isinstance(payload, dict):
            items.append(payload)
            continue
        if isinstance(payload, str):
            try:
                parsed = json.loads(payload)
            except Exception:
                parsed = None
            if isinstance(parsed, dict):
                items.append(parsed)
    return items


async def list_run_archive(limit: int = 200) -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    try:
        rows = await pool.fetch(
            """
            SELECT payload
            FROM run_archive
            ORDER BY completed_at DESC
            LIMIT $1
            """,
            max(1, int(limit or 0)),
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_run_archive failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = row["payload"]
        if isinstance(payload, dict):
            items.append(payload)
            continue
        if isinstance(payload, str):
            try:
                parsed = json.loads(payload)
            except Exception:
                parsed = None
            if isinstance(parsed, dict):
                items.append(parsed)
    return items


async def find_live_run_by_approval_id(approval_id: str) -> Optional[Dict[str, Any]]:
    approval_token = str(approval_id or "").strip()
    if not approval_token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        row = await pool.fetchrow(
            """
            SELECT payload
            FROM live_runs
            WHERE
                payload @> jsonb_build_object('pending_confirmation', jsonb_build_object('approval_id', $1::text)) OR
                payload @> jsonb_build_object('pending_approval', jsonb_build_object('approval_id', $1::text))
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            approval_token,
        )
    except Exception as exc:
        LOGGER.warning("Postgres find_live_run_by_approval_id failed for %s: %s", approval_token, exc)
        return None
    if row is None:
        return None
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
    return None


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
    pool = await _require_pool(operation="record_transition")
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
        raise RunStatePersistenceError(f"Postgres record_transition failed for {token}: {exc}") from exc
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
    pool = await _require_pool(operation="archive_run")
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
        raise RunStatePersistenceError(f"Postgres archive_run failed for {token}: {exc}") from exc
    return None


async def claim_run(run_id: str, worker_id: str, ttl: int, trace_id: str) -> None:
    token = str(run_id or "").strip()
    worker = str(worker_id or "").strip()
    if not token or not worker:
        return None
    pool = await _require_pool(operation="claim_run")
    try:
        await _ensure_local_queue_tables(pool)
        row = await pool.fetchrow(
            """
            INSERT INTO local_queue_claims (
                run_id,
                worker_id,
                claimed_at,
                ttl,
                trace_id,
                last_heartbeat_at,
                last_progress_at,
                last_worker_note
            )
            VALUES ($1, $2, NOW(), $3, $4, NOW(), NOW(), NULL)
            ON CONFLICT (run_id) DO UPDATE SET
                worker_id = EXCLUDED.worker_id,
                claimed_at = NOW(),
                ttl = EXCLUDED.ttl,
                trace_id = COALESCE(NULLIF(EXCLUDED.trace_id, ''), local_queue_claims.trace_id),
                last_heartbeat_at = NOW(),
                last_progress_at = NOW(),
                last_worker_note = NULL
            WHERE
                local_queue_claims.worker_id = EXCLUDED.worker_id OR
                COALESCE(local_queue_claims.last_heartbeat_at, local_queue_claims.claimed_at) +
                    (GREATEST(COALESCE(local_queue_claims.ttl, 0), 1) * INTERVAL '1 second') <= NOW()
            RETURNING run_id
            """,
            token,
            worker,
            max(1, int(ttl or 0)),
            str(trace_id or "").strip() or None,
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres claim_run failed for {token}: {exc}") from exc
    if row is None:
        raise RunClaimConflictError(
            f"Run {token} is already claimed by another live worker; refusing to overwrite the active claim"
        )
    return None


async def release_claim(run_id: str) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="release_claim")
    try:
        await _ensure_local_queue_tables(pool)
        await pool.execute(
            """
            DELETE FROM local_queue_claims
            WHERE run_id = $1
            """,
            token,
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres release_claim failed for {token}: {exc}") from exc
    return None


async def touch_claim_heartbeat(
    run_id: str,
    worker_id: str,
    *,
    note: Optional[str] = None,
    progress: bool = False,
) -> None:
    token = str(run_id or "").strip()
    worker = str(worker_id or "").strip()
    if not token or not worker:
        return None
    pool = await _require_pool(operation="touch_claim_heartbeat")
    try:
        await _ensure_local_queue_tables(pool)
        await pool.execute(
            """
            UPDATE local_queue_claims
            SET
                last_heartbeat_at = NOW(),
                last_progress_at = CASE WHEN $3 THEN NOW() ELSE last_progress_at END,
                last_worker_note = CASE
                    WHEN NULLIF($4, '') IS NOT NULL THEN LEFT($4, 280)
                    ELSE last_worker_note
                END
            WHERE run_id = $1
              AND worker_id = $2
            """,
            token,
            worker,
            bool(progress),
            str(note or "").strip() or None,
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres touch_claim_heartbeat failed for {token}: {exc}") from exc
    return None


async def append_local_queue_dead_letter(
    *,
    run_id: str,
    tenant_id: str,
    workspace_id: str,
    specialist_key: Optional[str],
    reason: str,
    trace_id: str,
    failure_count: int,
    payload: Dict[str, Any],
) -> None:
    token = str(run_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="append_local_queue_dead_letter")
    try:
        await _ensure_local_queue_tables(pool)
        await pool.execute(
            """
            INSERT INTO local_queue_dead_letters (
                run_id,
                tenant_id,
                workspace_id,
                specialist_key,
                reason,
                trace_id,
                failure_count,
                payload,
                first_recorded_at,
                last_recorded_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
            ON CONFLICT (run_id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                workspace_id = EXCLUDED.workspace_id,
                specialist_key = EXCLUDED.specialist_key,
                reason = EXCLUDED.reason,
                trace_id = COALESCE(NULLIF(EXCLUDED.trace_id, ''), local_queue_dead_letters.trace_id),
                failure_count = GREATEST(local_queue_dead_letters.failure_count, EXCLUDED.failure_count),
                payload = EXCLUDED.payload,
                last_recorded_at = NOW()
            """,
            token,
            str(tenant_id or "").strip() or "default",
            str(workspace_id or "").strip() or "default",
            str(specialist_key or "").strip() or None,
            str(reason or "").strip() or "worker_failure",
            str(trace_id or "").strip() or None,
            max(0, int(failure_count or 0)),
            _json_payload(payload),
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres append_local_queue_dead_letter failed for {token}: {exc}") from exc
    return None


async def get_local_queue_dead_letter_status() -> Dict[str, Any]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return {
            "dead_letter_count": 0,
            "total_failure_count": 0,
            "last_recorded_at": None,
            "workspace_hotspots": [],
            "specialist_hotspots": [],
        }
    try:
        await _ensure_local_queue_tables(pool)
        summary_row = await pool.fetchrow(
            """
            SELECT
                COUNT(*)::int AS dead_letter_count,
                COALESCE(SUM(failure_count), 0)::int AS total_failure_count,
                MAX(last_recorded_at) AS last_recorded_at
            FROM local_queue_dead_letters
            """
        )
        workspace_rows = await pool.fetch(
            """
            SELECT workspace_id, COUNT(*)::int AS count
            FROM local_queue_dead_letters
            GROUP BY workspace_id
            ORDER BY count DESC, workspace_id ASC
            LIMIT 5
            """
        )
        specialist_rows = await pool.fetch(
            """
            SELECT COALESCE(NULLIF(specialist_key, ''), 'workspace-default') AS specialist_key, COUNT(*)::int AS count
            FROM local_queue_dead_letters
            GROUP BY COALESCE(NULLIF(specialist_key, ''), 'workspace-default')
            ORDER BY count DESC, specialist_key ASC
            LIMIT 5
            """
        )
    except Exception as exc:
        LOGGER.warning("Postgres get_local_queue_dead_letter_status failed: %s", exc)
        return {
            "dead_letter_count": 0,
            "total_failure_count": 0,
            "last_recorded_at": None,
            "workspace_hotspots": [],
            "specialist_hotspots": [],
        }
    return {
        "dead_letter_count": int(summary_row["dead_letter_count"] if summary_row is not None else 0),
        "total_failure_count": int(summary_row["total_failure_count"] if summary_row is not None else 0),
        "last_recorded_at": str(summary_row["last_recorded_at"] or "").strip() or None if summary_row is not None else None,
        "workspace_hotspots": [
            {
                "workspace_id": str(row["workspace_id"] or "").strip() or "default",
                "count": int(row["count"] or 0),
            }
            for row in (workspace_rows or [])
        ],
        "specialist_hotspots": [
            {
                "specialist_key": str(row["specialist_key"] or "").strip() or "workspace-default",
                "count": int(row["count"] or 0),
            }
            for row in (specialist_rows or [])
        ],
    }


async def upsert_fleet_worker(record: Dict[str, Any], *, heartbeat_seen: bool = True) -> None:
    worker_id = str(record.get("worker_id") or record.get("runtime_id") or "").strip()
    if not worker_id:
        return None
    payload = dict(record or {})
    payload["worker_id"] = worker_id
    payload["runtime_id"] = str(payload.get("runtime_id") or worker_id).strip() or worker_id
    payload["machine_id"] = str(payload.get("machine_id") or payload["runtime_id"] or worker_id).strip() or worker_id
    payload["tenant_id"] = str(payload.get("tenant_id") or "default").strip() or "default"
    payload["workspace_id"] = str(payload.get("workspace_id") or "default").strip() or "default"
    execution_targets = payload.get("execution_targets") if isinstance(payload.get("execution_targets"), list) else []
    first_target = str(execution_targets[0] if execution_targets else "").strip().lower() or "local"
    shard_key = str(payload.get("queue_shard") or "").strip() or (
        f"{payload['tenant_id']}:{payload['workspace_id']}:{str(payload.get('runtime_type') or 'local').strip() or 'local'}:{first_target}"
    )
    pool = await _require_pool(operation="upsert_fleet_worker")
    try:
        await _ensure_fleet_runtime_tables(pool)
        await pool.execute(
            """
            INSERT INTO fleet_worker_registrations (
                worker_id,
                tenant_id,
                workspace_id,
                machine_id,
                runtime_type,
                status,
                control_state,
                current_run_id,
                instance_id,
                shard_key,
                prewarm_state,
                warm_pool,
                lease_seconds,
                payload,
                registered_at,
                last_registered_at,
                last_heartbeat_at,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb,
                NOW(), NOW(), CASE WHEN $15 THEN NOW() ELSE NULL END, NOW()
            )
            ON CONFLICT (worker_id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                workspace_id = EXCLUDED.workspace_id,
                machine_id = EXCLUDED.machine_id,
                runtime_type = EXCLUDED.runtime_type,
                status = EXCLUDED.status,
                control_state = EXCLUDED.control_state,
                current_run_id = EXCLUDED.current_run_id,
                instance_id = EXCLUDED.instance_id,
                shard_key = EXCLUDED.shard_key,
                prewarm_state = EXCLUDED.prewarm_state,
                warm_pool = EXCLUDED.warm_pool,
                lease_seconds = EXCLUDED.lease_seconds,
                payload = EXCLUDED.payload,
                last_registered_at = NOW(),
                last_heartbeat_at = CASE
                    WHEN $15 THEN NOW()
                    ELSE fleet_worker_registrations.last_heartbeat_at
                END,
                updated_at = NOW()
            """,
            worker_id,
            payload["tenant_id"],
            payload["workspace_id"],
            payload["machine_id"],
            str(payload.get("runtime_type") or "local").strip() or "local",
            str(payload.get("status") or "idle").strip() or "idle",
            str(payload.get("control_state") or "active").strip().lower() or "active",
            str(payload.get("current_run_id") or "").strip() or None,
            str(payload.get("instance_id") or "").strip() or None,
            shard_key,
            str(payload.get("prewarm_state") or "").strip().lower() or None,
            str(payload.get("warm_pool") or "").strip() or None,
            max(1, int(payload.get("lease_seconds") or 30)),
            _json_payload(payload),
            bool(heartbeat_seen),
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres upsert_fleet_worker failed for {worker_id}: {exc}") from exc
    return None


async def get_fleet_worker(worker_id: str) -> Optional[Dict[str, Any]]:
    token = str(worker_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await _ensure_fleet_runtime_tables(pool)
        row = await pool.fetchrow(
            """
            SELECT worker_id, tenant_id, workspace_id, machine_id, runtime_type, status, control_state,
                   current_run_id, instance_id, shard_key, prewarm_state, warm_pool, lease_seconds,
                   registered_at, last_registered_at, last_heartbeat_at, updated_at, payload
            FROM fleet_worker_registrations
            WHERE worker_id = $1
            LIMIT 1
            """,
            token,
        )
    except Exception as exc:
        LOGGER.warning("Postgres get_fleet_worker failed for %s: %s", token, exc)
        return None
    if row is None:
        return None
    payload = _json_object(row["payload"])
    payload.update(
        {
            "worker_id": str(row["worker_id"] or "").strip(),
            "runtime_id": str(payload.get("runtime_id") or row["worker_id"] or "").strip(),
            "tenant_id": str(row["tenant_id"] or "").strip() or "default",
            "workspace_id": str(row["workspace_id"] or "").strip() or "default",
            "machine_id": str(row["machine_id"] or "").strip() or token,
            "runtime_type": str(row["runtime_type"] or "").strip() or "local",
            "status": str(row["status"] or "").strip() or "idle",
            "control_state": str(row["control_state"] or "").strip().lower() or "active",
            "current_run_id": str(row["current_run_id"] or "").strip() or None,
            "instance_id": str(row["instance_id"] or "").strip() or None,
            "queue_shard": str(row["shard_key"] or "").strip() or None,
            "prewarm_state": str(row["prewarm_state"] or "").strip() or None,
            "warm_pool": str(row["warm_pool"] or "").strip() or None,
            "lease_seconds": int(row["lease_seconds"] or 30),
            "registered_at": str(row["registered_at"] or "").strip() or None,
            "last_registered_at": str(row["last_registered_at"] or "").strip() or None,
            "last_heartbeat_at": str(row["last_heartbeat_at"] or "").strip() or None,
            "updated_at": str(row["updated_at"] or "").strip() or None,
        }
    )
    return payload


async def list_fleet_workers(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    tenant_filter = str(tenant_id or "").strip()
    workspace_filter = str(workspace_id or "").strip()
    try:
        await _ensure_fleet_runtime_tables(pool)
        rows = await pool.fetch(
            """
            SELECT worker_id, tenant_id, workspace_id, machine_id, runtime_type, status, control_state,
                   current_run_id, instance_id, shard_key, prewarm_state, warm_pool, lease_seconds,
                   registered_at, last_registered_at, last_heartbeat_at, updated_at, payload
            FROM fleet_worker_registrations
            WHERE ($1 = '' OR tenant_id = $1)
              AND ($2 = '' OR workspace_id = $2)
            ORDER BY COALESCE(last_heartbeat_at, updated_at, last_registered_at) DESC, worker_id ASC
            """,
            tenant_filter,
            workspace_filter,
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_fleet_workers failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = _json_object(row["payload"])
        payload.update(
            {
                "worker_id": str(row["worker_id"] or "").strip(),
                "runtime_id": str(payload.get("runtime_id") or row["worker_id"] or "").strip(),
                "tenant_id": str(row["tenant_id"] or "").strip() or "default",
                "workspace_id": str(row["workspace_id"] or "").strip() or "default",
                "machine_id": str(row["machine_id"] or "").strip() or str(row["worker_id"] or "").strip(),
                "runtime_type": str(row["runtime_type"] or "").strip() or "local",
                "status": str(row["status"] or "").strip() or "idle",
                "control_state": str(row["control_state"] or "").strip().lower() or "active",
                "current_run_id": str(row["current_run_id"] or "").strip() or None,
                "instance_id": str(row["instance_id"] or "").strip() or None,
                "queue_shard": str(row["shard_key"] or "").strip() or None,
                "prewarm_state": str(row["prewarm_state"] or "").strip() or None,
                "warm_pool": str(row["warm_pool"] or "").strip() or None,
                "lease_seconds": int(row["lease_seconds"] or 30),
                "registered_at": str(row["registered_at"] or "").strip() or None,
                "last_registered_at": str(row["last_registered_at"] or "").strip() or None,
                "last_heartbeat_at": str(row["last_heartbeat_at"] or "").strip() or None,
                "updated_at": str(row["updated_at"] or "").strip() or None,
            }
        )
        items.append(payload)
    return items


async def upsert_fleet_queue_partition(
    *,
    partition_id: str,
    tenant_id: str,
    workspace_id: str,
    specialist_key: str,
    pending_count: int,
    claimed_count: int,
    online_workers: int,
    busy_workers: int,
    idle_workers: int,
    prewarmed_workers: int,
    state: str,
    retry_after_seconds: int,
    payload: Dict[str, Any],
) -> None:
    token = str(partition_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="upsert_fleet_queue_partition")
    try:
        await _ensure_fleet_runtime_tables(pool)
        await pool.execute(
            """
            INSERT INTO fleet_queue_partitions (
                partition_id,
                tenant_id,
                workspace_id,
                specialist_key,
                pending_count,
                claimed_count,
                online_workers,
                busy_workers,
                idle_workers,
                prewarmed_workers,
                state,
                retry_after_seconds,
                payload,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
            ON CONFLICT (partition_id) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                workspace_id = EXCLUDED.workspace_id,
                specialist_key = EXCLUDED.specialist_key,
                pending_count = EXCLUDED.pending_count,
                claimed_count = EXCLUDED.claimed_count,
                online_workers = EXCLUDED.online_workers,
                busy_workers = EXCLUDED.busy_workers,
                idle_workers = EXCLUDED.idle_workers,
                prewarmed_workers = EXCLUDED.prewarmed_workers,
                state = EXCLUDED.state,
                retry_after_seconds = EXCLUDED.retry_after_seconds,
                payload = EXCLUDED.payload,
                updated_at = NOW()
            """,
            token,
            str(tenant_id or "").strip() or "default",
            str(workspace_id or "").strip() or "default",
            str(specialist_key or "").strip() or "workspace-default",
            max(0, int(pending_count or 0)),
            max(0, int(claimed_count or 0)),
            max(0, int(online_workers or 0)),
            max(0, int(busy_workers or 0)),
            max(0, int(idle_workers or 0)),
            max(0, int(prewarmed_workers or 0)),
            str(state or "").strip().lower() or "healthy",
            max(0, int(retry_after_seconds or 0)),
            _json_payload(payload),
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres upsert_fleet_queue_partition failed for {token}: {exc}") from exc
    return None


async def list_fleet_queue_partitions(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    tenant_filter = str(tenant_id or "").strip()
    workspace_filter = str(workspace_id or "").strip()
    try:
        await _ensure_fleet_runtime_tables(pool)
        rows = await pool.fetch(
            """
            SELECT partition_id, tenant_id, workspace_id, specialist_key, pending_count, claimed_count,
                   online_workers, busy_workers, idle_workers, prewarmed_workers, state, retry_after_seconds,
                   updated_at, payload
            FROM fleet_queue_partitions
            WHERE ($1 = '' OR tenant_id = $1)
              AND ($2 = '' OR workspace_id = $2)
            ORDER BY updated_at DESC, partition_id ASC
            """,
            tenant_filter,
            workspace_filter,
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_fleet_queue_partitions failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = _json_object(row["payload"])
        payload.update(
            {
                "partition_id": str(row["partition_id"] or "").strip(),
                "tenant_id": str(row["tenant_id"] or "").strip() or "default",
                "workspace_id": str(row["workspace_id"] or "").strip() or "default",
                "specialist_key": str(row["specialist_key"] or "").strip() or "workspace-default",
                "pending_count": int(row["pending_count"] or 0),
                "claimed_count": int(row["claimed_count"] or 0),
                "online_workers": int(row["online_workers"] or 0),
                "busy_workers": int(row["busy_workers"] or 0),
                "idle_workers": int(row["idle_workers"] or 0),
                "prewarmed_workers": int(row["prewarmed_workers"] or 0),
                "state": str(row["state"] or "").strip().lower() or "healthy",
                "retry_after_seconds": int(row["retry_after_seconds"] or 0),
                "updated_at": str(row["updated_at"] or "").strip() or None,
            }
        )
        items.append(payload)
    return items


async def record_approval_resolution(
    run_id: str,
    approval_id: str,
    resolution: str,
    actor: str,
    trace_id: str,
) -> None:
    run_token = str(run_id or "").strip()
    approval_token = str(approval_id or "").strip()
    if not run_token or not approval_token:
        return None
    pool = await _require_pool(operation="record_approval_resolution")
    try:
        await pool.execute(
            """
            INSERT INTO run_approvals (run_id, step_id, requested_at, resolved_at, resolution, actor, trace_id)
            SELECT $1, $2, NOW(), NOW(), $3, $4, $5
            WHERE NOT EXISTS (
                SELECT 1
                FROM run_approvals
                WHERE run_id = $1
                  AND step_id = $2
                  AND resolution = $3
                  AND actor = $4
                  AND COALESCE(trace_id, '') = COALESCE($5, '')
            )
            """,
            run_token,
            approval_token,
            str(resolution or "").strip() or "approved",
            str(actor or "").strip() or "system",
            str(trace_id or "").strip() or None,
        )
    except Exception as exc:
        raise RunStatePersistenceError(
            f"Postgres record_approval_resolution failed for {run_token}/{approval_token}: {exc}"
        ) from exc
    return None


async def _ensure_runtime_outbox_table(pool: Any) -> None:
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS runtime_outbox (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            workspace_id TEXT NOT NULL,
            run_id TEXT NULL,
            machine_id TEXT NULL,
            trace_id TEXT NULL,
            idempotency_key TEXT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            delivered_at TIMESTAMPTZ NULL,
            last_replayed_at TIMESTAMPTZ NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            last_delivery_error TEXT NULL,
            last_attempted_at TIMESTAMPTZ NULL,
            next_attempt_at TIMESTAMPTZ NULL,
            poisoned_at TIMESTAMPTZ NULL
        )
        """
    )
    await pool.execute("ALTER TABLE runtime_outbox ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0")
    await pool.execute("ALTER TABLE runtime_outbox ADD COLUMN IF NOT EXISTS last_delivery_error TEXT NULL")
    await pool.execute("ALTER TABLE runtime_outbox ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ NULL")
    await pool.execute("ALTER TABLE runtime_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL")
    await pool.execute("ALTER TABLE runtime_outbox ADD COLUMN IF NOT EXISTS poisoned_at TIMESTAMPTZ NULL")
    await pool.execute(
        "CREATE INDEX IF NOT EXISTS idx_runtime_outbox_due ON runtime_outbox (delivered_at, poisoned_at, next_attempt_at, created_at)"
    )


async def persist_outbox_event(
    *,
    event_id: str,
    event_type: str,
    tenant_id: str,
    workspace_id: str,
    run_id: Optional[str],
    machine_id: Optional[str],
    trace_id: str,
    idempotency_key: str,
    payload: Dict[str, Any],
) -> None:
    token = str(event_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="persist_outbox_event")
    try:
        await _ensure_runtime_outbox_table(pool)
        await pool.execute(
            """
            INSERT INTO runtime_outbox (
                event_id,
                event_type,
                tenant_id,
                workspace_id,
                run_id,
                machine_id,
                trace_id,
                idempotency_key,
                payload,
                created_at,
                delivered_at,
                last_replayed_at,
                retry_count,
                last_delivery_error,
                last_attempted_at,
                next_attempt_at,
                poisoned_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NULL, NULL, 0, NULL, NULL, NULL, NULL)
            ON CONFLICT (event_id) DO UPDATE SET
                event_type = EXCLUDED.event_type,
                tenant_id = EXCLUDED.tenant_id,
                workspace_id = EXCLUDED.workspace_id,
                run_id = EXCLUDED.run_id,
                machine_id = EXCLUDED.machine_id,
                trace_id = COALESCE(NULLIF(EXCLUDED.trace_id, ''), runtime_outbox.trace_id),
                idempotency_key = COALESCE(NULLIF(EXCLUDED.idempotency_key, ''), runtime_outbox.idempotency_key),
                payload = EXCLUDED.payload
            """,
            token,
            str(event_type or "").strip() or "runtime_event",
            str(tenant_id or "").strip() or "default",
            str(workspace_id or "").strip() or "default",
            str(run_id or "").strip() or None,
            str(machine_id or "").strip() or None,
            str(trace_id or "").strip() or None,
            str(idempotency_key or "").strip() or None,
            _json_payload(payload),
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres persist_outbox_event failed for {token}: {exc}") from exc
    return None


async def list_undelivered_outbox_events(
    *,
    older_than_seconds: int = 30,
    limit: int = 200,
) -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    try:
        await _ensure_runtime_outbox_table(pool)
        rows = await pool.fetch(
            """
            SELECT
                event_id,
                event_type,
                tenant_id,
                workspace_id,
                run_id,
                machine_id,
                trace_id,
                idempotency_key,
                payload,
                created_at,
                delivered_at,
                last_replayed_at,
                retry_count,
                last_delivery_error,
                last_attempted_at,
                next_attempt_at,
                poisoned_at
            FROM runtime_outbox
            WHERE delivered_at IS NULL
              AND poisoned_at IS NULL
              AND COALESCE(next_attempt_at, created_at) <= NOW() - ($1 * INTERVAL '1 second')
            ORDER BY COALESCE(next_attempt_at, created_at) ASC, created_at ASC
            LIMIT $2
            """,
            max(0, int(older_than_seconds or 0)),
            max(1, int(limit or 0)),
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_undelivered_outbox_events failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = row["payload"]
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        if not isinstance(payload, dict):
            payload = {}
        items.append(
            {
                "event_id": str(row["event_id"] or "").strip(),
                "event_type": str(row["event_type"] or "").strip(),
                "tenant_id": str(row["tenant_id"] or "").strip() or "default",
                "workspace_id": str(row["workspace_id"] or "").strip() or "default",
                "run_id": str(row["run_id"] or "").strip() or None,
                "machine_id": str(row["machine_id"] or "").strip() or None,
                "trace_id": str(row["trace_id"] or "").strip(),
                "idempotency_key": str(row["idempotency_key"] or "").strip(),
                "payload": payload,
                "created_at": str(row["created_at"] or "").strip() or None,
                "delivered_at": str(row["delivered_at"] or "").strip() or None,
                "last_replayed_at": str(row["last_replayed_at"] or "").strip() or None,
                "retry_count": int(row["retry_count"] or 0),
                "last_delivery_error": str(row["last_delivery_error"] or "").strip() or None,
                "last_attempted_at": str(row["last_attempted_at"] or "").strip() or None,
                "next_attempt_at": str(row["next_attempt_at"] or "").strip() or None,
                "poisoned_at": str(row["poisoned_at"] or "").strip() or None,
            }
        )
    return items


async def mark_outbox_event_delivered(event_id: str) -> None:
    token = str(event_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="mark_outbox_event_delivered")
    try:
        await _ensure_runtime_outbox_table(pool)
        await pool.execute(
            """
            UPDATE runtime_outbox
            SET delivered_at = NOW(),
                last_replayed_at = NOW(),
                last_attempted_at = NOW(),
                last_delivery_error = NULL,
                next_attempt_at = NULL,
                poisoned_at = NULL
            WHERE event_id = $1
            """,
            token,
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres mark_outbox_event_delivered failed for {token}: {exc}") from exc
    return None


async def record_outbox_delivery_failure(
    event_id: str,
    *,
    error_text: str,
    retry_delay_seconds: Optional[int],
    poison: bool = False,
    increment_retry: bool = True,
) -> None:
    token = str(event_id or "").strip()
    if not token:
        return None
    pool = await _require_pool(operation="record_outbox_delivery_failure")
    try:
        await _ensure_runtime_outbox_table(pool)
        await pool.execute(
            """
            UPDATE runtime_outbox
            SET retry_count = COALESCE(retry_count, 0) + CASE WHEN $5::boolean THEN 1 ELSE 0 END,
                last_delivery_error = LEFT($2, 2000),
                last_attempted_at = NOW(),
                last_replayed_at = NOW(),
                next_attempt_at = CASE
                    WHEN $3::boolean THEN NULL
                    WHEN $4::integer IS NULL THEN NULL
                    ELSE NOW() + ($4::text || ' seconds')::interval
                END,
                poisoned_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END
            WHERE event_id = $1
            """,
            token,
            str(error_text or "").strip() or "outbox_delivery_failed",
            bool(poison),
            (None if retry_delay_seconds is None else max(0, int(retry_delay_seconds))),
            bool(increment_retry),
        )
    except Exception as exc:
        raise RunStatePersistenceError(f"Postgres record_outbox_delivery_failure failed for {token}: {exc}") from exc
    return None


async def get_outbox_delivery_status() -> Dict[str, Any]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return {
            "undelivered_count": 0,
            "poisoned_count": 0,
            "total_retry_count": 0,
            "max_retry_count": 0,
            "last_delivery_error": None,
        }
    try:
        await _ensure_runtime_outbox_table(pool)
        summary_row = await pool.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE delivered_at IS NULL AND poisoned_at IS NULL) AS undelivered_count,
                COUNT(*) FILTER (WHERE delivered_at IS NULL AND poisoned_at IS NOT NULL) AS poisoned_count,
                COALESCE(SUM(retry_count), 0) AS total_retry_count,
                COALESCE(MAX(retry_count), 0) AS max_retry_count
            FROM runtime_outbox
            """
        )
        error_row = await pool.fetchrow(
            """
            SELECT event_id, last_delivery_error, last_attempted_at, retry_count
            FROM runtime_outbox
            WHERE COALESCE(last_delivery_error, '') <> ''
            ORDER BY last_attempted_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """
        )
    except Exception as exc:
        LOGGER.warning("Postgres get_outbox_delivery_status failed: %s", exc)
        return {
            "undelivered_count": 0,
            "poisoned_count": 0,
            "total_retry_count": 0,
            "max_retry_count": 0,
            "last_delivery_error": None,
        }
    return {
        "undelivered_count": int(summary_row["undelivered_count"] if summary_row is not None else 0),
        "poisoned_count": int(summary_row["poisoned_count"] if summary_row is not None else 0),
        "total_retry_count": int(summary_row["total_retry_count"] if summary_row is not None else 0),
        "max_retry_count": int(summary_row["max_retry_count"] if summary_row is not None else 0),
        "last_delivery_error": (
            {
                "event_id": str(error_row["event_id"] or "").strip(),
                "message": str(error_row["last_delivery_error"] or "").strip(),
                "last_attempted_at": str(error_row["last_attempted_at"] or "").strip() or None,
                "retry_count": int(error_row["retry_count"] or 0),
            }
            if error_row is not None
            else None
        ),
    }


async def list_expired_local_claims() -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    try:
        await _ensure_local_queue_tables(pool)
        rows = await pool.fetch(
            """
            SELECT
                claims.run_id,
                claims.worker_id,
                claims.claimed_at,
                claims.last_heartbeat_at,
                claims.last_progress_at,
                claims.ttl,
                claims.trace_id,
                live_runs.payload AS run_payload
            FROM local_queue_claims AS claims
            LEFT JOIN live_runs ON live_runs.run_id = claims.run_id
            WHERE COALESCE(claims.last_heartbeat_at, claims.claimed_at) +
                    (GREATEST(COALESCE(claims.ttl, 0), 1) * INTERVAL '1 second') <= NOW()
            ORDER BY COALESCE(claims.last_heartbeat_at, claims.claimed_at) ASC
            """
        )
    except Exception as exc:
        LOGGER.warning("Postgres list_expired_local_claims failed: %s", exc)
        return []
    items: list[Dict[str, Any]] = []
    for row in rows or []:
        payload = row["run_payload"]
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = None
        items.append(
            {
                "run_id": str(row["run_id"] or "").strip() or None,
                "worker_id": str(row["worker_id"] or "").strip() or None,
                "claimed_at": str(row["claimed_at"] or "").strip() or None,
                "last_heartbeat_at": str(row["last_heartbeat_at"] or "").strip() or None,
                "last_progress_at": str(row["last_progress_at"] or "").strip() or None,
                "ttl": int(row["ttl"] or 0),
                "trace_id": str(row["trace_id"] or "").strip() or None,
                "run_payload": payload if isinstance(payload, dict) else None,
            }
        )
    return items


def sync_upsert_live_run(
    run_id: str,
    workspace_id: str,
    tenant_id: str,
    state: str,
    payload: Dict[str, Any],
    trace_id: str,
) -> None:
    _run_sync(
        lambda: upsert_live_run(run_id, workspace_id, tenant_id, state, payload, trace_id),
        operation="sync_upsert_live_run",
        fallback=None,
        raise_on_error=True,
    )


def sync_delete_live_run(run_id: str) -> None:
    _run_sync(
        lambda: delete_live_run(run_id),
        operation="sync_delete_live_run",
        fallback=None,
        raise_on_error=True,
    )


def sync_archive_run(run_id: str, final_state: str, payload: Dict[str, Any], trace_id: str) -> None:
    _run_sync(
        lambda: archive_run(run_id, final_state, payload, trace_id),
        operation="sync_archive_run",
        fallback=None,
        raise_on_error=True,
    )


def sync_list_live_runs() -> list[Dict[str, Any]]:
    return _run_sync(lambda: list_live_runs(), operation="sync_list_live_runs", fallback=[])


def sync_get_live_run(run_id: str) -> Optional[Dict[str, Any]]:
    return _run_sync(
        lambda: get_live_run(run_id),
        operation="sync_get_live_run",
        fallback=None,
    )


def sync_get_archived_run(run_id: str) -> Optional[Dict[str, Any]]:
    return _run_sync(
        lambda: get_archived_run(run_id),
        operation="sync_get_archived_run",
        fallback=None,
    )


def sync_list_live_runs_by_state(states: list[str]) -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_live_runs_by_state(states),
        operation="sync_list_live_runs_by_state",
        fallback=[],
    )


def sync_list_run_archive(limit: int = 200) -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_run_archive(limit),
        operation="sync_list_run_archive",
        fallback=[],
    )


def sync_find_live_run_by_approval_id(approval_id: str) -> Optional[Dict[str, Any]]:
    return _run_sync(
        lambda: find_live_run_by_approval_id(approval_id),
        operation="sync_find_live_run_by_approval_id",
        fallback=None,
    )


def sync_record_approval_resolution(
    run_id: str,
    approval_id: str,
    resolution: str,
    actor: str,
    trace_id: str,
) -> None:
    _run_sync(
        lambda: record_approval_resolution(run_id, approval_id, resolution, actor, trace_id),
        operation="sync_record_approval_resolution",
        fallback=None,
        raise_on_error=True,
    )


def sync_persist_outbox_event(
    *,
    event_id: str,
    event_type: str,
    tenant_id: str,
    workspace_id: str,
    run_id: Optional[str],
    machine_id: Optional[str],
    trace_id: str,
    idempotency_key: str,
    payload: Dict[str, Any],
) -> None:
    _run_sync(
        lambda: persist_outbox_event(
            event_id=event_id,
            event_type=event_type,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            run_id=run_id,
            machine_id=machine_id,
            trace_id=trace_id,
            idempotency_key=idempotency_key,
            payload=payload,
        ),
        operation="sync_persist_outbox_event",
        fallback=None,
        raise_on_error=True,
    )


def sync_list_undelivered_outbox_events(*, older_than_seconds: int = 30, limit: int = 200) -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_undelivered_outbox_events(older_than_seconds=older_than_seconds, limit=limit),
        operation="sync_list_undelivered_outbox_events",
        fallback=[],
    )


def sync_mark_outbox_event_delivered(event_id: str) -> None:
    _run_sync(
        lambda: mark_outbox_event_delivered(event_id),
        operation="sync_mark_outbox_event_delivered",
        fallback=None,
        raise_on_error=True,
    )


def sync_record_outbox_delivery_failure(
    event_id: str,
    *,
    error_text: str,
    retry_delay_seconds: Optional[int],
    poison: bool = False,
    increment_retry: bool = True,
) -> None:
    _run_sync(
        lambda: record_outbox_delivery_failure(
            event_id,
            error_text=error_text,
            retry_delay_seconds=retry_delay_seconds,
            poison=poison,
            increment_retry=increment_retry,
        ),
        operation="sync_record_outbox_delivery_failure",
        fallback=None,
        raise_on_error=True,
    )


def sync_get_outbox_delivery_status() -> Dict[str, Any]:
    return _run_sync(
        get_outbox_delivery_status,
        operation="sync_get_outbox_delivery_status",
        fallback={
            "undelivered_count": 0,
            "poisoned_count": 0,
            "total_retry_count": 0,
            "max_retry_count": 0,
            "last_delivery_error": None,
        },
    )


def sync_list_expired_local_claims() -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_expired_local_claims(),
        operation="sync_list_expired_local_claims",
        fallback=[],
    )


def sync_release_claim(run_id: str) -> None:
    _run_sync(
        lambda: release_claim(run_id),
        operation="sync_release_claim",
        fallback=None,
        raise_on_error=True,
    )


def sync_touch_claim_heartbeat(
    run_id: str,
    worker_id: str,
    *,
    note: Optional[str] = None,
    progress: bool = False,
) -> None:
    _run_sync(
        lambda: touch_claim_heartbeat(run_id, worker_id, note=note, progress=progress),
        operation="sync_touch_claim_heartbeat",
        fallback=None,
        raise_on_error=True,
    )


def sync_append_local_queue_dead_letter(
    *,
    run_id: str,
    tenant_id: str,
    workspace_id: str,
    specialist_key: Optional[str],
    reason: str,
    trace_id: str,
    failure_count: int,
    payload: Dict[str, Any],
) -> None:
    _run_sync(
        lambda: append_local_queue_dead_letter(
            run_id=run_id,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            specialist_key=specialist_key,
            reason=reason,
            trace_id=trace_id,
            failure_count=failure_count,
            payload=payload,
        ),
        operation="sync_append_local_queue_dead_letter",
        fallback=None,
        raise_on_error=True,
    )


def sync_get_local_queue_dead_letter_status() -> Dict[str, Any]:
    return _run_sync(
        get_local_queue_dead_letter_status,
        operation="sync_get_local_queue_dead_letter_status",
        fallback={
            "dead_letter_count": 0,
            "total_failure_count": 0,
            "last_recorded_at": None,
            "workspace_hotspots": [],
            "specialist_hotspots": [],
        },
    )


def sync_upsert_fleet_worker(record: Dict[str, Any], *, heartbeat_seen: bool = True) -> None:
    _run_sync(
        lambda: upsert_fleet_worker(record, heartbeat_seen=heartbeat_seen),
        operation="sync_upsert_fleet_worker",
        fallback=None,
        raise_on_error=True,
    )


def sync_get_fleet_worker(worker_id: str) -> Optional[Dict[str, Any]]:
    return _run_sync(
        lambda: get_fleet_worker(worker_id),
        operation="sync_get_fleet_worker",
        fallback=None,
    )


def sync_list_fleet_workers(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_fleet_workers(tenant_id=tenant_id, workspace_id=workspace_id),
        operation="sync_list_fleet_workers",
        fallback=[],
    )


def sync_upsert_fleet_queue_partition(
    *,
    partition_id: str,
    tenant_id: str,
    workspace_id: str,
    specialist_key: str,
    pending_count: int,
    claimed_count: int,
    online_workers: int,
    busy_workers: int,
    idle_workers: int,
    prewarmed_workers: int,
    state: str,
    retry_after_seconds: int,
    payload: Dict[str, Any],
) -> None:
    _run_sync(
        lambda: upsert_fleet_queue_partition(
            partition_id=partition_id,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            specialist_key=specialist_key,
            pending_count=pending_count,
            claimed_count=claimed_count,
            online_workers=online_workers,
            busy_workers=busy_workers,
            idle_workers=idle_workers,
            prewarmed_workers=prewarmed_workers,
            state=state,
            retry_after_seconds=retry_after_seconds,
            payload=payload,
        ),
        operation="sync_upsert_fleet_queue_partition",
        fallback=None,
        raise_on_error=True,
    )


def sync_list_fleet_queue_partitions(
    *,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
) -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_fleet_queue_partitions(tenant_id=tenant_id, workspace_id=workspace_id),
        operation="sync_list_fleet_queue_partitions",
        fallback=[],
    )
