import asyncio
import unittest
from unittest.mock import patch

from server_modules import health_core
from server_modules import runtime_models
from server_modules.runtime_models import MemorySearchRequest, MemoryUpsertRequest


class HealthCoreMemoryTests(unittest.TestCase):
    def test_memory_search_delegates_to_memory_service(self) -> None:
        body = MemorySearchRequest(
            query="customer migration",
            bucket="session",
            workspace_id="default",
            profile_id="profile-1",
            project_id="project-1",
            session_key="session-1",
            k=4,
        )
        expected = {
            "ok": True,
            "query": "customer migration",
            "bucket": "session",
            "workspace_id": "default",
            "count": 1,
            "items": [{"id": "mem-1", "text": "customer migration"}],
        }

        with patch.object(runtime_models, "_NORMALIZE_MEMORY_BUCKET", side_effect=lambda value, required=True: value), patch.object(
            health_core,
            "runtime_memory_search",
            return_value=expected,
        ) as search_mock:
            result = asyncio.run(health_core.memory_search(body))

        search_mock.assert_called_once_with(
            query="customer migration",
            bucket="session",
            workspace_id="default",
            profile_id="profile-1",
            project_id="project-1",
            session_key="session-1",
            k=4,
        )
        self.assertEqual(result, expected)

    def test_memory_upsert_delegates_to_memory_service(self) -> None:
        body = MemoryUpsertRequest(
            text="Remember the rollout checklist.",
            bucket="session",
            workspace_id="default",
            profile_id="profile-1",
            project_id="project-1",
            session_key="session-1",
            source="api",
            retention_days=14,
            metadata={"source_kind": "test"},
            id="mem-2",
        )
        expected = {
            "ok": True,
            "id": "mem-2",
            "bucket": "session",
            "workspace_id": "default",
            "retention_days": 14,
            "expires_at": "2026-04-18T00:00:00Z",
        }

        with patch.object(runtime_models, "_NORMALIZE_MEMORY_BUCKET", side_effect=lambda value, required=True: value), patch.object(
            health_core,
            "runtime_memory_upsert",
            return_value=expected,
        ) as upsert_mock:
            result = asyncio.run(health_core.memory_upsert(body))

        upsert_mock.assert_called_once_with(
            text="Remember the rollout checklist.",
            bucket="session",
            workspace_id="default",
            profile_id="profile-1",
            project_id="project-1",
            session_key="session-1",
            source="api",
            retention_days=14,
            metadata={"source_kind": "test"},
            memory_id="mem-2",
        )
        self.assertEqual(result, expected)


if __name__ == "__main__":
    unittest.main()
