from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from server_modules import gateway_execution_service


class GatewayExecutionServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_tool_via_gateway_dispatches_and_appends_activity(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
        }
        dispatch_mock = AsyncMock(
            return_value={
                "request_id": "req-1",
                "capability_id": "computer_control.click",
                "run_id": "run-1",
                "result": {"clicked": True, "x": 12, "y": 34},
            }
        )
        activity_mock = AsyncMock(return_value={"id": "activity-1"})
        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke", dispatch_mock),
            patch("server_modules.gateway_execution_service.gateway_activity_service.append_gateway_activity", activity_mock),
        ):
            response = await gateway_execution_service.execute_tool_via_gateway(
                gateway_id="gw-1",
                capability_id="computer_control.click",
                arguments={"x": 12, "y": 34},
                run_id="run-1",
                trace_id="trace-1",
                workspace_id="ws-1",
                request_id="req-1",
            )

        self.assertEqual(response["gateway_id"], "gw-1")
        self.assertEqual(response["device_id"], "dev-1")
        self.assertTrue(response["result"]["clicked"])
        dispatch_mock.assert_awaited_once()
        activity_mock.assert_awaited_once()
        activity_kwargs = activity_mock.await_args.kwargs
        self.assertEqual(activity_kwargs["action"], "gateway_tool_executed")
        self.assertEqual(activity_kwargs["status"], "completed")
        self.assertEqual(activity_kwargs["payload"]["request_id"], "req-1")
        self.assertEqual(activity_kwargs["payload"]["run_id"], "run-1")

    async def test_interrupt_tool_via_gateway_dispatches_and_appends_activity(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
        }
        dispatch_mock = AsyncMock(
            return_value={
                "request_id": "interrupt-1",
                "run_id": "run-1",
                "target_request_id": "req-1",
                "interrupted": True,
                "interrupt_count": 1,
            }
        )
        activity_mock = AsyncMock(return_value={"id": "activity-2"})
        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_interrupt", dispatch_mock),
            patch("server_modules.gateway_execution_service.gateway_activity_service.append_gateway_activity", activity_mock),
        ):
            response = await gateway_execution_service.interrupt_tool_via_gateway(
                gateway_id="gw-1",
                run_id="run-1",
                trace_id="trace-1",
                workspace_id="ws-1",
                target_request_id="req-1",
                reason="operator_requested_stop",
                request_id="interrupt-1",
            )

        self.assertEqual(response["gateway_id"], "gw-1")
        self.assertEqual(response["run_id"], "run-1")
        self.assertTrue(response["interrupted"])
        dispatch_mock.assert_awaited_once()
        activity_mock.assert_awaited_once()
        activity_kwargs = activity_mock.await_args.kwargs
        self.assertEqual(activity_kwargs["action"], "gateway_tool_interrupted")
        self.assertEqual(activity_kwargs["status"], "completed")
        self.assertEqual(activity_kwargs["payload"]["request_id"], "interrupt-1")
        self.assertEqual(activity_kwargs["payload"]["target_request_id"], "req-1")
