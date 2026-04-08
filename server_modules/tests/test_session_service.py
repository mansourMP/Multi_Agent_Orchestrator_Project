import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from server_modules import session_service


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


class SessionServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_session_writes_to_postgres_and_preserves_preferred_id(self):
        pool = _FakePool()
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "runtime.db"
            with patch("server_modules.session_service.runtime_db.get_pool", return_value=pool):
                with patch.dict(os.environ, {"ORION_RUNTIME_STATE_DB": str(db_path)}, clear=False):
                    session_id = await session_service.create_session(
                        workspace_id="workspace-1",
                        tenant_id="tenant-1",
                        actor={"type": "user", "id": "user-1"},
                        channel="web",
                        metadata={"source": "test"},
                        session_id="thread-1",
                    )

        self.assertEqual(session_id, "thread-1")
        self.assertGreaterEqual(len(pool.execute_calls), 2)
        self.assertTrue(any("runtime_sessions" in query for query, _ in pool.execute_calls))

    async def test_get_session_prefers_postgres(self):
        pool = _FakePool(
            fetchrow_result={
                "session_id": "session-1",
                "workspace_id": "workspace-1",
                "tenant_id": "tenant-1",
                "channel": "web",
                "actor": {"type": "user", "id": "user-1"},
                "created_at": "2026-04-06T00:00:00Z",
                "expires_at": "2099-01-01T00:00:00Z",
                "metadata": {"source": "pg"},
            }
        )
        with patch("server_modules.session_service.runtime_db.get_pool", return_value=pool):
            record = await session_service.get_session("session-1")

        self.assertIsNotNone(record)
        self.assertEqual(record["session_id"], "session-1")
        self.assertEqual(record["metadata"]["source"], "pg")

    async def test_get_session_falls_back_to_sqlite(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "runtime.db"
            with patch.dict(os.environ, {"ORION_RUNTIME_STATE_DB": str(db_path)}, clear=False):
                created = await session_service.create_session(
                    workspace_id="workspace-1",
                    tenant_id="tenant-1",
                    actor={"type": "user", "id": "user-1"},
                    channel="web",
                    metadata={"source": "sqlite"},
                    session_id="session-sqlite",
                )
                with patch("server_modules.session_service.runtime_db.get_pool", return_value=None):
                    record = await session_service.get_session(created)

        self.assertIsNotNone(record)
        self.assertEqual(record["session_id"], "session-sqlite")
        self.assertEqual(record["metadata"]["source"], "sqlite")

    async def test_extend_and_terminate_session_are_non_throwing(self):
        pool = _FakePool(execute_error=RuntimeError("db down"))
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "runtime.db"
            with patch.dict(os.environ, {"ORION_RUNTIME_STATE_DB": str(db_path)}, clear=False):
                with patch("server_modules.session_service.runtime_db.get_pool", return_value=None):
                    await session_service.create_session(
                        workspace_id="workspace-1",
                        tenant_id="tenant-1",
                        actor={"type": "user", "id": "user-1"},
                        channel="web",
                        session_id="session-1",
                    )
                with patch("server_modules.session_service.runtime_db.get_pool", return_value=pool):
                    extended = await session_service.extend_session("session-1")
                    await session_service.terminate_session("session-1")
                with patch("server_modules.session_service.runtime_db.get_pool", return_value=None):
                    missing = await session_service.get_session("session-1")

        self.assertIsNotNone(extended)
        self.assertIsNone(missing)

    async def test_create_session_mirrors_master_agent_and_runtime_profile_bindings(self):
        upsert_mock = AsyncMock(return_value={"id": "session-1"})
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "runtime.db"
            with (
                patch.dict(os.environ, {"ORION_RUNTIME_STATE_DB": str(db_path)}, clear=False),
                patch("server_modules.session_service.runtime_db.get_pool", return_value=None),
                patch("server_modules.session_service.control_plane_repository.upsert_agent_session", new=upsert_mock),
            ):
                await session_service.create_session(
                    workspace_id="workspace-1",
                    tenant_id="tenant-1",
                    actor={"type": "user", "id": "user-1"},
                    channel="web",
                    metadata={
                        "thread_id": "thread-1",
                        "master_agent_install_id": "install-master",
                        "runtime_profile_id": "profile-1",
                    },
                    session_id="session-1",
                )

        self.assertEqual(upsert_mock.await_args.kwargs["master_agent_install_id"], "install-master")
        self.assertEqual(upsert_mock.await_args.kwargs["runtime_profile_id"], "profile-1")


if __name__ == "__main__":
    unittest.main()
