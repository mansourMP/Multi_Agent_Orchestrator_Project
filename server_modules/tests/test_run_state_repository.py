import unittest
from unittest.mock import patch

from server_modules import run_state_repository


class _FakePool:
    def __init__(self, *, fetchrow_result=None, fetchrow_results=None, fetch_result=None, execute_error: Exception | None = None):
        self.fetchrow_result = fetchrow_result
        self.fetchrow_results = list(fetchrow_results or [])
        self.fetch_result = list(fetch_result or [])
        self.execute_error = execute_error
        self.execute_calls = []
        self.fetchrow_calls = []
        self.fetch_calls = []

    async def execute(self, query, *args):
        self.execute_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        return "OK"

    async def fetchrow(self, query, *args):
        self.fetchrow_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        if self.fetchrow_results:
            return self.fetchrow_results.pop(0)
        return self.fetchrow_result

    async def fetch(self, query, *args):
        self.fetch_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        return list(self.fetch_result)


class RunStateRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_upsert_live_run_writes_to_postgres_pool(self):
        pool = _FakePool()
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            result = await run_state_repository.upsert_live_run(
                "run-1",
                "workspace-1",
                "tenant-1",
                "queued",
                {"run_id": "run-1", "status": "queued"},
                "trace-1",
            )

        self.assertIsNone(result)
        self.assertEqual(len(pool.execute_calls), 1)
        _, args = pool.execute_calls[0]
        self.assertEqual(args[0], "run-1")
        self.assertEqual(args[1], "workspace-1")
        self.assertEqual(args[2], "tenant-1")
        self.assertEqual(args[3], "queued")

    async def test_get_live_run_prefers_postgres_payload(self):
        pool = _FakePool(fetchrow_result={"payload": {"run_id": "run-1", "status": "executing"}})
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            result = await run_state_repository.get_live_run("run-1")

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "executing")
        self.assertEqual(len(pool.fetchrow_calls), 1)

    async def test_get_live_run_returns_none_when_postgres_unavailable(self):
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=None):
            result = await run_state_repository.get_live_run("run-sqlite")

        self.assertIsNone(result)

    async def test_record_transition_is_non_throwing_when_postgres_fails(self):
        pool = _FakePool(execute_error=RuntimeError("db down"))
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            result = await run_state_repository.record_transition(
                "run-1",
                "queued",
                "executing",
                "runtime",
                "trace-1",
            )

        self.assertIsNone(result)
        self.assertEqual(len(pool.execute_calls), 1)

    async def test_archive_run_claim_and_release_are_idempotent_calls(self):
        pool = _FakePool()
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.archive_run(
                "run-1",
                "completed",
                {
                    "run_id": "run-1",
                    "workspace_id": "workspace-1",
                    "tenant_id": "tenant-1",
                    "status": "completed",
                    "context": {"workspace_id": "workspace-1", "tenant_id": "tenant-1"},
                },
                "trace-1",
            )
            await run_state_repository.claim_run("run-1", "worker-1", 30, "trace-2")
            await run_state_repository.release_claim("run-1")

        self.assertEqual(len(pool.execute_calls), 3)
        self.assertIn("run_archive", pool.execute_calls[0][0])
        self.assertIn("local_queue_claims", pool.execute_calls[1][0])
        self.assertIn("DELETE FROM local_queue_claims", pool.execute_calls[2][0])

    async def test_persist_and_replay_outbox_events_round_trip_through_postgres(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "event_id": "evt-1",
                    "event_type": "approval_resolved",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                    "run_id": "run-1",
                    "machine_id": None,
                    "trace_id": "trace-1",
                    "idempotency_key": "approval_resolved:approval-1:approved",
                    "payload": {"approval_id": "approval-1"},
                    "created_at": "2026-04-07T00:00:00Z",
                    "delivered_at": None,
                    "last_replayed_at": None,
                    "retry_count": 0,
                    "last_delivery_error": None,
                    "last_attempted_at": None,
                    "next_attempt_at": None,
                    "poisoned_at": None,
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.persist_outbox_event(
                event_id="evt-1",
                event_type="approval_resolved",
                tenant_id="tenant-1",
                workspace_id="ws-1",
                run_id="run-1",
                machine_id=None,
                trace_id="trace-1",
                idempotency_key="approval_resolved:approval-1:approved",
                payload={"approval_id": "approval-1"},
            )
            items = await run_state_repository.list_undelivered_outbox_events(older_than_seconds=30)
            await run_state_repository.mark_outbox_event_delivered("evt-1")

        self.assertEqual(items[0]["event_id"], "evt-1")
        self.assertGreaterEqual(len(pool.execute_calls), 3)
        self.assertIn("runtime_outbox", pool.execute_calls[0][0])
        self.assertIn("runtime_outbox", pool.execute_calls[1][0])
        self.assertEqual(len(pool.fetch_calls), 1)
        self.assertIn("UPDATE runtime_outbox", pool.execute_calls[-1][0])

    async def test_record_outbox_delivery_failure_and_status_snapshot_include_retry_fields(self):
        pool = _FakePool(
            fetchrow_results=[
                {
                    "undelivered_count": 2,
                    "poisoned_count": 1,
                    "total_retry_count": 5,
                    "max_retry_count": 3,
                },
                {
                    "event_id": "evt-1",
                    "last_delivery_error": "boom",
                    "last_attempted_at": "2026-04-07T00:01:00Z",
                    "retry_count": 3,
                },
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            await run_state_repository.record_outbox_delivery_failure(
                "evt-1",
                error_text="boom",
                retry_delay_seconds=15,
                poison=False,
            )
            status = await run_state_repository.get_outbox_delivery_status()

        self.assertTrue(any("UPDATE runtime_outbox" in query for query, _args in pool.execute_calls))
        self.assertEqual(status["undelivered_count"], 2)
        self.assertEqual(status["poisoned_count"], 1)
        self.assertEqual(status["last_delivery_error"]["event_id"], "evt-1")

    async def test_list_expired_local_claims_returns_joined_run_payloads(self):
        pool = _FakePool(
            fetch_result=[
                {
                    "run_id": "run-1",
                    "worker_id": "worker-1",
                    "claimed_at": "2026-04-07T00:00:00Z",
                    "ttl": 30,
                    "trace_id": "trace-1",
                    "run_payload": {"run_id": "run-1", "status": "running_local"},
                }
            ]
        )
        with patch("server_modules.run_state_repository.runtime_db.get_pool", return_value=pool):
            items = await run_state_repository.list_expired_local_claims()

        self.assertEqual(items[0]["run_id"], "run-1")
        self.assertEqual(items[0]["worker_id"], "worker-1")
        self.assertEqual(items[0]["run_payload"]["status"], "running_local")
