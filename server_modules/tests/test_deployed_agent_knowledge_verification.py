from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import deployed_agent_service


class DeployedAgentKnowledgeVerificationTests(unittest.TestCase):
    def test_reference_verification_matches_saved_source_metadata(self):
        with patch(
            "server_modules.deployed_agent_service.auth_module.enforce_workspace_access",
            return_value="ws-1",
        ), patch(
            "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
            new=AsyncMock(return_value={"id": "ws-1", "tenant_id": "tenant-1"}),
        ), patch(
            "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
            new=AsyncMock(return_value={
                "id": "agent-1",
                "owner_workspace_id": "ws-1",
                "deployment_state": "draft",
                "knowledge_sources": [
                    {
                        "id": "policy-doc",
                        "label": "Refund Policy",
                        "kind": "document",
                        "uri": "drive://refund-policy",
                    },
                    {
                        "id": "menu-sheet",
                        "label": "Daily Menu",
                        "kind": "google_sheet",
                        "uri": "sheet://menu",
                    },
                ],
            }),
        ):
            result = asyncio.run(
                deployed_agent_service.verify_deployed_agent_knowledge_retrieval(
                    deployed_agent_id="agent-1",
                    current_user={"user_id": "user-1"},
                    owner_workspace_id="ws-1",
                    query="refund policy",
                )
            )

        self.assertEqual(result["status"], "reference_match")
        self.assertEqual(result["verification_kind"], "source_reference")
        self.assertFalse(result["content_retrieval_available"])
        self.assertEqual(result["source_count"], 2)
        self.assertEqual(result["matched_sources"][0]["id"], "policy-doc")
        self.assertGreaterEqual(result["matched_sources"][0]["score"], 1)

    def test_reference_verification_reports_no_content_retrieval_when_no_match(self):
        with patch(
            "server_modules.deployed_agent_service.auth_module.enforce_workspace_access",
            return_value="ws-1",
        ), patch(
            "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
            new=AsyncMock(return_value={"id": "ws-1", "tenant_id": "tenant-1"}),
        ), patch(
            "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
            new=AsyncMock(return_value={
                "id": "agent-1",
                "owner_workspace_id": "ws-1",
                "deployment_state": "draft",
                "knowledge_sources": [
                    {
                        "id": "menu-sheet",
                        "label": "Daily Menu",
                        "kind": "google_sheet",
                        "uri": "sheet://menu",
                    },
                ],
            }),
        ):
            result = asyncio.run(
                deployed_agent_service.verify_deployed_agent_knowledge_retrieval(
                    deployed_agent_id="agent-1",
                    current_user={"user_id": "user-1"},
                    owner_workspace_id="ws-1",
                    query="refund policy",
                )
            )

        self.assertEqual(result["status"], "no_reference_match")
        self.assertFalse(result["content_retrieval_available"])
        self.assertEqual(result["matched_sources"], [])
        self.assertIn("Content-level citation retrieval is not wired yet", result["message"])

    def test_reference_verification_rejects_empty_query(self):
        with patch(
            "server_modules.deployed_agent_service.auth_module.enforce_workspace_access",
            return_value="ws-1",
        ):
            with self.assertRaises(ValueError):
                asyncio.run(
                    deployed_agent_service.verify_deployed_agent_knowledge_retrieval(
                        deployed_agent_id="agent-1",
                        current_user={"user_id": "user-1"},
                        owner_workspace_id="ws-1",
                        query=" ",
                    )
                )


if __name__ == "__main__":
    unittest.main()
