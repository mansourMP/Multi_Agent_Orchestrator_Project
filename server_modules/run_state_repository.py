from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import threading
from typing import Any, Awaitable, Callable, Dict, Optional, TypeVar

from server_modules import db as runtime_db


LOGGER = logging.getLogger(__name__)
_T = TypeVar("_T")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def dispatch_repository_call(awaitable: Awaitable[Any], *, operation: str) -> None:
    async def _guard() -> None:
        try:
            await awaitable
        except Exception as exc:
            LOGGER.warning("Repository dispatch failed during %s: %s", operation, exc)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        try:
            worker = threading.Thread(
                target=lambda: asyncio.run(_guard()),
                name=f"run-state-repository-{operation}",
                daemon=True,
            )
            worker.start()
        except Exception as exc:
            LOGGER.warning("Repository background dispatch start failed during %s: %s", operation, exc)
        return
    try:
        loop.create_task(_guard())
    except Exception as exc:
        LOGGER.warning("Repository async dispatch failed during %s: %s", operation, exc)

def _run_sync(awaitable_factory: Callable[[], Awaitable[_T]], *, operation: str, fallback: _T) -> _T:
    result_box: dict[str, _T] = {"value": fallback}

    async def _guard() -> _T:
        try:
            value = await awaitable_factory()
        except Exception as exc:
            LOGGER.warning("Repository sync operation failed during %s: %s", operation, exc)
            return fallback
        return value

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        try:
            return asyncio.run(_guard())
        except Exception as exc:
            LOGGER.warning("Repository sync dispatch failed during %s: %s", operation, exc)
            return fallback

    def _worker() -> None:
        result_box["value"] = asyncio.run(_guard())

    try:
        thread = threading.Thread(target=_worker, name=f"run-state-sync-{operation}", daemon=True)
        thread.start()
        thread.join()
    except Exception as exc:
        LOGGER.warning("Repository sync thread failed during %s: %s", operation, exc)
        return fallback
    return result_box["value"]


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
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            DELETE FROM live_runs
            WHERE run_id = $1
            """,
            token,
        )
    except Exception as exc:
        LOGGER.warning("Postgres delete_live_run failed for %s: %s", token, exc)
        return None
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
                payload @> jsonb_build_object('pending_confirmation', jsonb_build_object('approval_id', $1)) OR
                payload @> jsonb_build_object('pending_approval', jsonb_build_object('approval_id', $1))
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
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
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
        LOGGER.warning("Postgres record_approval_resolution failed for %s/%s: %s", run_token, approval_token, exc)
        return None
    return None


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
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
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
                last_replayed_at TIMESTAMPTZ NULL
            )
            """
        )
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
                last_replayed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NULL, NULL)
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
        LOGGER.warning("Postgres persist_outbox_event failed for %s: %s", token, exc)
        return None
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
                last_replayed_at TIMESTAMPTZ NULL
            )
            """
        )
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
                last_replayed_at
            FROM runtime_outbox
            WHERE delivered_at IS NULL
              AND created_at <= NOW() - ($1::text || ' seconds')::interval
            ORDER BY created_at ASC
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
            }
        )
    return items


async def mark_outbox_event_delivered(event_id: str) -> None:
    token = str(event_id or "").strip()
    if not token:
        return None
    pool = await runtime_db.get_pool()
    if pool is None:
        return None
    try:
        await pool.execute(
            """
            UPDATE runtime_outbox
            SET delivered_at = NOW(),
                last_replayed_at = NOW()
            WHERE event_id = $1
            """,
            token,
        )
    except Exception as exc:
        LOGGER.warning("Postgres mark_outbox_event_delivered failed for %s: %s", token, exc)
        return None
    return None


async def list_expired_local_claims() -> list[Dict[str, Any]]:
    pool = await runtime_db.get_pool()
    if pool is None:
        return []
    try:
        rows = await pool.fetch(
            """
            SELECT
                claims.run_id,
                claims.worker_id,
                claims.claimed_at,
                claims.ttl,
                claims.trace_id,
                live_runs.payload AS run_payload
            FROM local_queue_claims AS claims
            LEFT JOIN live_runs ON live_runs.run_id = claims.run_id
            WHERE claims.claimed_at + (GREATEST(COALESCE(claims.ttl, 0), 1) * INTERVAL '1 second') <= NOW()
            ORDER BY claims.claimed_at ASC
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
    )


def sync_delete_live_run(run_id: str) -> None:
    _run_sync(
        lambda: delete_live_run(run_id),
        operation="sync_delete_live_run",
        fallback=None,
    )


def sync_archive_run(run_id: str, final_state: str, payload: Dict[str, Any], trace_id: str) -> None:
    _run_sync(
        lambda: archive_run(run_id, final_state, payload, trace_id),
        operation="sync_archive_run",
        fallback=None,
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
    )
