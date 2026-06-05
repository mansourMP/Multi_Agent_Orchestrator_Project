from __future__ import annotations

import base64
import importlib
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import gateway_execution_service


class GatewayExecutionServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        global gateway_execution_service
        gateway_execution_service = importlib.import_module("server_modules.gateway_execution_service")

    async def test_execute_tool_via_gateway_dispatches_and_appends_activity(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["computer_control.click"],
            "metadata": {"capability_readiness": {"ready": ["computer_control.click"]}},
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
        def rust_side_effect(command, payload):
            if payload.get("operation") == "quota_check":
                return {"ok": True, "decision": "allow", "next_action": "allow_gateway_service_operation"}
            return {"ok": True, "decision": "allow", "next_action": "dispatch_gateway_operation"}

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch("server_modules.gateway_execution_service.gateway_protocol_service.gateway_connection_is_live", return_value=True),
            patch(
                "server_modules.gateway_execution_service.gateway_registry_service.gateway_registration_public_payload",
                return_value={
                    "connection_status": "online",
                    "heartbeat_fresh": True,
                    "reported_health_state": "online",
                    "capability_readiness": {"ready": ["computer_control.click"]},
                },
            ),
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke", dispatch_mock),
            patch("server_modules.gateway_execution_service.gateway_activity_service.append_gateway_activity", activity_mock),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ) as rust_mock,
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
        self.assertGreaterEqual(rust_mock.call_count, 2)
        gateway_decision_calls = [
            call
            for call in rust_mock.call_args_list
            if call.args[0] == "gateway-service-decision"
            and call.args[1].get("operation") == "tool_execute"
        ]
        self.assertTrue(gateway_decision_calls)

    async def test_execution_readiness_allows_degraded_gateway_when_capability_ready(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["screenshot.capture"],
            "metadata": {"capability_readiness": {"ready": ["screenshot.capture"]}},
        }
        with (
            patch("server_modules.gateway_execution_service.gateway_protocol_service.gateway_connection_is_live", return_value=True),
            patch(
                "server_modules.gateway_execution_service.gateway_registry_service.gateway_registration_public_payload",
                return_value={
                    "connection_status": "online",
                    "heartbeat_fresh": True,
                    "reported_health_state": "degraded",
                    "capability_readiness": {"ready": ["screenshot.capture"]},
                },
            ),
        ):
            ready, reason = gateway_execution_service.gateway_registration_execution_readiness(
                registration,
                workspace_id="ws-1",
                capability_id="screenshot.capture",
            )

        self.assertTrue(ready)
        self.assertEqual(reason, "")

    async def test_execute_tool_via_gateway_rust_denial_blocks_dispatch(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["computer_control.click"],
            "metadata": {"capability_readiness": {"ready": ["computer_control.click"]}},
        }
        denied = gateway_execution_service.rust_runtime_kernel_client.RustKernelDecisionError(
            {
                "ok": False,
                "decision": "block",
                "reason": "gateway_kill_switch_enabled",
            },
            command="gateway-service-decision",
        )
        dispatch_mock = AsyncMock()
        def rust_side_effect(command, payload):
            if payload.get("operation") == "quota_check":
                return {"ok": True, "decision": "allow", "next_action": "allow_gateway_service_operation"}
            raise denied

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ) as rust_mock,
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke", dispatch_mock),
        ):
            with self.assertRaisesRegex(ValueError, "Rust gateway-service blocked tool_execute"):
                await gateway_execution_service.execute_tool_via_gateway(
                    gateway_id="gw-1",
                    capability_id="computer_control.click",
                    arguments={"x": 12, "y": 34},
                    run_id="run-1",
                    trace_id="trace-1",
                    workspace_id="ws-1",
                    request_id="req-1",
                )

        self.assertEqual(rust_mock.call_count, 2)
        dispatch_mock.assert_not_awaited()

    async def test_execute_tool_via_gateway_unexpected_next_action_blocks_dispatch(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["computer_control.click"],
            "metadata": {"capability_readiness": {"ready": ["computer_control.click"]}},
        }
        dispatch_mock = AsyncMock()
        def rust_side_effect(command, payload):
            return {
                "ok": True,
                "decision": "allow",
                "next_action": "allow_gateway_service_operation",
            }

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ) as rust_mock,
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke", dispatch_mock),
        ):
            with self.assertRaisesRegex(ValueError, "unexpected next_action"):
                await gateway_execution_service.execute_tool_via_gateway(
                    gateway_id="gw-1",
                    capability_id="computer_control.click",
                    arguments={"x": 12, "y": 34},
                    run_id="run-1",
                    trace_id="trace-1",
                    workspace_id="ws-1",
                    request_id="req-1",
                )

        self.assertEqual(rust_mock.call_count, 2)
        dispatch_mock.assert_not_awaited()

    async def test_execute_tool_via_gateway_wrong_quota_action_blocks_dispatch(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["computer_control.click"],
            "metadata": {"capability_readiness": {"ready": ["computer_control.click"]}},
        }
        dispatch_mock = AsyncMock()

        def rust_side_effect(command, payload):
            if payload.get("operation") == "quota_check":
                return {
                    "ok": True,
                    "decision": "allow",
                    "next_action": "dispatch_gateway_operation",
                }
            return {
                "ok": True,
                "decision": "allow",
                "next_action": "dispatch_gateway_operation",
            }

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ) as rust_mock,
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke", dispatch_mock),
        ):
            with self.assertRaisesRegex(ValueError, "quota_check"):
                await gateway_execution_service.execute_tool_via_gateway(
                    gateway_id="gw-1",
                    capability_id="computer_control.click",
                    arguments={"x": 12, "y": 34},
                    run_id="run-1",
                    trace_id="trace-1",
                    workspace_id="ws-1",
                    request_id="req-1",
                )

        self.assertGreaterEqual(rust_mock.call_count, 1)
        dispatch_mock.assert_not_awaited()

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
        def rust_side_effect(command, payload):
            if payload.get("operation") == "quota_check":
                return {"ok": True, "decision": "allow", "next_action": "allow_gateway_service_operation"}
            return {"ok": True, "decision": "allow", "next_action": "dispatch_gateway_operation"}

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ),
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

    async def test_interrupt_tool_via_gateway_unexpected_next_action_blocks_dispatch(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
        }
        dispatch_mock = AsyncMock()
        def rust_side_effect(command, payload):
            return {
                "ok": True,
                "decision": "allow",
                "next_action": "allow_gateway_service_operation",
            }

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ) as rust_mock,
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_interrupt", dispatch_mock),
        ):
            with self.assertRaisesRegex(ValueError, "unexpected next_action"):
                await gateway_execution_service.interrupt_tool_via_gateway(
                    gateway_id="gw-1",
                    run_id="run-1",
                    trace_id="trace-1",
                    workspace_id="ws-1",
                    target_request_id="req-1",
                    reason="operator_requested_stop",
                    request_id="interrupt-1",
                )

        self.assertEqual(rust_mock.call_count, 2)
        dispatch_mock.assert_not_awaited()

    async def test_interrupt_tool_via_gateway_wrong_quota_action_blocks_dispatch(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
        }
        dispatch_mock = AsyncMock()

        def rust_side_effect(command, payload):
            if payload.get("operation") == "quota_check":
                return {
                    "ok": True,
                    "decision": "allow",
                    "next_action": "dispatch_gateway_operation",
                }
            return {
                "ok": True,
                "decision": "allow",
                "next_action": "dispatch_gateway_operation",
            }

        with (
            patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ) as rust_mock,
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_interrupt", dispatch_mock),
        ):
            with self.assertRaisesRegex(ValueError, "quota_check"):
                await gateway_execution_service.interrupt_tool_via_gateway(
                    gateway_id="gw-1",
                    run_id="run-1",
                    trace_id="trace-1",
                    workspace_id="ws-1",
                    target_request_id="req-1",
                    reason="operator_requested_stop",
                    request_id="interrupt-1",
                )

        self.assertGreaterEqual(rust_mock.call_count, 1)
        dispatch_mock.assert_not_awaited()

    def test_screenshot_retention_off_strips_inline_image_without_artifact(self) -> None:
        encoded = base64.b64encode(b"png-bytes").decode("ascii")
        with patch("server_modules.gateway_execution_service.artifact_service.store_artifact_bytes") as store_mock:
            result = gateway_execution_service._materialize_gateway_artifacts(
                capability_id="screenshot.capture",
                response={
                    "result": {
                        "images": [
                            {
                                "monitor_name": "primary",
                                "width": 100,
                                "height": 80,
                                "data_base64": encoded,
                            }
                        ]
                    }
                },
                registration={
                    "gateway_id": "gw-1",
                    "device_id": "dev-1",
                    "tenant_id": "tenant-1",
                    "workspace_id": "ws-1",
                },
                run_id="run-1",
                screenshot_retention="off",
            )

        store_mock.assert_not_called()
        self.assertEqual(result["images"][0]["screenshot_retention"], "off")
        self.assertFalse(result["images"][0]["artifact_retained"])
        self.assertNotIn("data_base64", result["images"][0])
        self.assertNotIn("artifacts", result)
