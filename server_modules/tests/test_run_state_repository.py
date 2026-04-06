import unittest
from unittest.mock import patch

from server_modules import run_state_repository


class _FakePool:
    def __init__(self, *, fetchrow_result=None, execute_error: Exception | None = None):
        self.fetchrow_result = fetchrow_result
        self.execute_error = execute_error
        self.execute_calls = []
        self.fetchrow_calls = []

    async def execute(self, query, *args):
        self.execute_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        return "OK"

    async def fetchrow(self, query, *args):
        self.fetchrow_calls.append((query, args))
        if self.execute_error is not None:
            raise self.execute_error
        return self.fetchrow_result


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
