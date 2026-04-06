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


def sync_list_run_archive(limit: int = 200) -> list[Dict[str, Any]]:
    return _run_sync(
        lambda: list_run_archive(limit),
        operation="sync_list_run_archive",
        fallback=[],
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
