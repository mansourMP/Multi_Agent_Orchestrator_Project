import unittest
from unittest.mock import patch
import asyncio

from server_modules import gateway_approval_service


class GatewayApprovalServiceTests(unittest.TestCase):
    def test_capability_requires_owner_approval_for_known_risky_local_capability(self) -> None:
        self.assertTrue(gateway_approval_service.capability_requires_owner_approval("computer_control.click"))

    def test_capability_requires_owner_approval_for_registry_requires_approval_contract(self) -> None:
        self.assertTrue(gateway_approval_service.capability_requires_owner_approval("shell.execute"))

    def test_capability_requires_owner_approval_allows_low_risk_read_capability(self) -> None:
        self.assertFalse(gateway_approval_service.capability_requires_owner_approval("connector.action.read"))

    def test_capability_requires_owner_approval_defaults_unknown_capability_to_true(self) -> None:
        self.assertTrue(gateway_approval_service.capability_requires_owner_approval("unknown.capability"))

    def test_retry_exhaustion_returns_terminal_structured_error(self) -> None:
        approval = {
            "approval_id": "approval-1",
            "gateway_id": "gateway-1",
            "status": "approved",
            "retry_count": 2,
        }
        exhausted = {
            **approval,
            "status": "failed",
            "decision": "retry_exhausted",
        }
        with (
            patch.dict("os.environ", {"EMPYRALIS_GATEWAY_APPROVAL_MAX_RETRIES": "2"}),
            patch(
                "server_modules.gateway_approval_service.gateway_state_repository.get_gateway_action_approval",
                return_value=approval,
            ),
            patch(
                "server_modules.gateway_approval_service.gateway_state_repository.update_gateway_action_approval_decision",
                return_value=exhausted,
            ) as update_decision,
        ):
            payload = asyncio.run(
                gateway_approval_service.resolve_gateway_tool_approval(
                    registration={"gateway_id": "gateway-1"},
                    approval_id="approval-1",
                    decision="approved",
                    actor="owner-1",
                )
            )

        self.assertEqual(payload["status"], "retry_exhausted")
        self.assertFalse(payload["retryable"])
        self.assertEqual(payload["approval"]["status"], "failed")
        update_decision.assert_called_once_with(
            approval_id="approval-1",
            gateway_id="gateway-1",
            status="failed",
            decision="retry_exhausted",
            actor="system",
            note="Gateway approval retry limit exceeded. Request a new approval before retrying.",
        )


if __name__ == "__main__":
    unittest.main()
