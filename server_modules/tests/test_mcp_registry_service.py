import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from server_modules import mcp_registry_service


class McpRegistryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.registry_path = Path(self.temp_dir.name) / "mcp_servers.json"
        self.registry_patcher = patch.object(mcp_registry_service, "MCP_SERVER_REGISTRY_FILE", self.registry_path)
        self.registry_patcher.start()

    def tearDown(self) -> None:
        self.registry_patcher.stop()
        self.temp_dir.cleanup()
        super().tearDown()

    def test_upsert_can_discover_tools_and_expose_virtual_skill_entries(self) -> None:
        with patch(
            "server_modules.mcp_registry_service._list_tools_streamable_http_async",
            new=AsyncMock(
                return_value=[
                    {
                        "name": "lookup_stock",
                        "label": "Lookup Stock",
                        "description": "Read inventory data.",
                        "action_class": "read",
                        "connector_scopes": ["inventory"],
                        "trigger_terms": ["lookup stock"],
                    }
                ]
            ),
        ):
            record = mcp_registry_service.upsert_workspace_mcp_server(
                workspace_id="workspace-1",
                server_id="inventory-feed",
                label="Inventory Feed",
                transport="streamable_http",
                endpoint="https://example.com/mcp",
                discover_tools=True,
            )

        self.assertEqual(record["id"], "inventory-feed")
        self.assertEqual(record["tools"][0]["name"], "lookup_stock")

        servers = mcp_registry_service.list_workspace_mcp_servers("workspace-1")
        self.assertEqual(servers[0]["tool_count"], 1)
        self.assertEqual(servers[0]["skill_ids"], ["mcp:inventory-feed:lookup_stock"])

        skills = mcp_registry_service.list_workspace_mcp_skill_entries("workspace-1")
        self.assertEqual(skills[0]["id"], "mcp:inventory-feed:lookup_stock")
        self.assertEqual(skills[0]["execution_adapter"], "mcp_tool")

    def test_invoke_workspace_mcp_skill_returns_tool_payload_and_arguments(self) -> None:
        mcp_registry_service.upsert_workspace_mcp_server(
            workspace_id="workspace-1",
            server_id="inventory-feed",
            label="Inventory Feed",
            transport="streamable_http",
            endpoint="https://example.com/mcp",
            tools=[
                {
                    "name": "lookup_stock",
                    "label": "Lookup Stock",
                    "description": "Read inventory data.",
                    "input_schema": {
                        "type": "object",
                        "properties": {"sku": {"type": "string"}},
                        "required": ["sku"],
                    },
                    "action_class": "read",
                    "connector_scopes": ["inventory"],
                }
            ],
            metadata={},
        )

        with patch(
            "server_modules.mcp_registry_service._call_streamable_http_tool_async",
            new=AsyncMock(return_value={"reply": "SKU-1 is in stock.", "sku": "SKU-1"}),
        ):
            result = mcp_registry_service.invoke_workspace_mcp_skill(
                workspace_id="workspace-1",
                skill_id="mcp:inventory-feed:lookup_stock",
                goal='{"sku":"SKU-1"}',
                agent_label="Sage",
            )

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["reply"], "SKU-1 is in stock.")
        self.assertEqual(result["mcp"]["arguments"], {"sku": "SKU-1"})
        self.assertEqual(result["mcp"]["server_id"], "inventory-feed")


if __name__ == "__main__":
    unittest.main()
