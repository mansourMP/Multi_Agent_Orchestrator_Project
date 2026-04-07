import unittest

from server_modules.capability_registry import (
    resolve_capability,
    workflow_node_capability_id,
    workflow_tool_capability_id,
)


class CapabilityRegistryTests(unittest.TestCase):
    def test_resolve_capability_returns_contract(self) -> None:
        contract = resolve_capability("screenshot.capture")

        assert contract is not None
        self.assertEqual(contract.capability_id, "screenshot.capture")
        self.assertEqual(contract.display_name, "Capture Screenshot")

    def test_resolve_capability_returns_none_for_missing_capability(self) -> None:
        self.assertIsNone(resolve_capability("missing.capability"))

    def test_resolve_capability_exposes_risk_level(self) -> None:
        contract = resolve_capability("shell.execute")

        assert contract is not None
        self.assertEqual(contract.risk_level, "critical")
        self.assertTrue(contract.requires_approval)

    def test_workflow_node_capability_id_maps_core_node_families(self) -> None:
        self.assertEqual(
            workflow_node_capability_id("trigger", variant="manual"),
            "workflow.trigger.manual",
        )
        self.assertEqual(
            workflow_node_capability_id("decision", variant="classifier"),
            "workflow.decision.classifier",
        )
        self.assertEqual(
            workflow_node_capability_id("subflow", variant="call_workflow"),
            "workflow.subflow.call_workflow",
        )
        self.assertEqual(
            workflow_node_capability_id("loop", variant="repeat"),
            "workflow.loop.repeat",
        )

    def test_workflow_tool_capability_id_maps_connector_and_local_tool_variants(self) -> None:
        self.assertEqual(
            workflow_tool_capability_id(
                "connector_action",
                config={"connector": "telegram_bot", "action_id": "send_message"},
            ),
            "send_message",
        )
        self.assertEqual(
            workflow_tool_capability_id(
                "connector_action",
                config={"connector": "github", "action_id": "list_issues"},
            ),
            "connector.action.read",
        )
        self.assertEqual(
            workflow_tool_capability_id("browser", config={}),
            "browser_automation.interactive",
        )
        self.assertEqual(
            workflow_tool_capability_id("code", config={}),
            "code.execute_reviewed",
        )


if __name__ == "__main__":
    unittest.main()
