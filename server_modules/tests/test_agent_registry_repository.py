import asyncio
import importlib
import unittest
from datetime import datetime
from unittest.mock import AsyncMock, patch

from server_modules import agent_registry_repository


class _FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeConnection:
    def __init__(self) -> None:
        self.calls = []

    async def execute(self, query, *args):
        self.calls.append((query, args))
        return "INSERT 0 1"

    def transaction(self):
        return _FakeTransaction()


class _FakeAcquire:
    def __init__(self, connection: _FakeConnection) -> None:
        self._connection = connection

    async def __aenter__(self):
        return self._connection

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakePool:
    def __init__(self, connection: _FakeConnection) -> None:
        self._connection = connection

    def acquire(self):
        return _FakeAcquire(self._connection)


class AgentRegistryRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        global agent_registry_repository
        agent_registry_repository = importlib.import_module("server_modules.agent_registry_repository")

    def test_create_compiled_workflow_artifact_binds_real_datetimes(self) -> None:
        connection = _FakeConnection()
        pool = _FakePool(connection)

        with (
            patch(
                "server_modules.agent_registry_repository.control_plane_repository.ensure_control_plane_schema",
                new=AsyncMock(return_value=pool),
            ),
            patch(
                "server_modules.agent_registry_repository.fetch_workflow_snapshot",
                new=AsyncMock(return_value={"workflow_id": "wf-test", "workflow_version_id": "wfver-test"}),
            ) as fetch_snapshot,
        ):
            result = asyncio.run(
                agent_registry_repository.create_compiled_workflow_artifact(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    name="Compiled Agent Artifact",
                    description="Compiled for install execution",
                    definition={"version": "empyralist.workflow.v2", "nodes": [], "edges": []},
                    validation={"status": "ok"},
                    metadata={"source": "test"},
                    created_by_user_id="user-1",
                )
            )

        self.assertEqual(len(connection.calls), 2)
        first_args = connection.calls[0][1]
        second_args = connection.calls[1][1]
        self.assertIsInstance(first_args[8], datetime)
        self.assertIsInstance(second_args[8], datetime)
        self.assertEqual(result["workflow_id"], "wf-test")
        self.assertEqual(result["workflow_version_id"], "wfver-test")
        fetch_snapshot.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
