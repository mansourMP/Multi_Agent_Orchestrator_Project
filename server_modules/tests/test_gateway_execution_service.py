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

    async def test_execute_tool_via_gateway_forwards_agent_scope_and_policy(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["filesystem.read"],
            "metadata": {
                "runtime_access_mode": "full_access",
                "autonomous_agent_setup_warning_acknowledged": True,
                "capability_readiness": {"ready": ["filesystem.read"]},
            },
        }
        dispatch_mock = AsyncMock(
            return_value={
                "request_id": "req-1",
                "capability_id": "filesystem.read_write",
                "run_id": "run-1",
                "result": {"content": "ok"},
            }
        )

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
                    "capability_readiness": {"ready": ["filesystem.read"]},
                },
            ),
            patch("server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke", dispatch_mock),
            patch("server_modules.gateway_execution_service.gateway_activity_service.append_gateway_activity", AsyncMock()),
            patch(
                "server_modules.gateway_execution_service.rust_runtime_kernel_client.run_runtime_kernel_enforced",
                side_effect=rust_side_effect,
            ),
        ):
            await gateway_execution_service.execute_tool_via_gateway(
                gateway_id="gw-1",
                capability_id="filesystem.read",
                arguments={"path": "/Users/mansur/notes.txt"},
                run_id="run-1",
                trace_id="trace-1",
                workspace_id="ws-1",
                request_id="req-1",
                agent_scope="sage",
            )

        dispatch_kwargs = dispatch_mock.await_args.kwargs
        self.assertEqual(dispatch_kwargs["capability_id"], "filesystem.read_write")
        self.assertEqual(dispatch_kwargs["arguments"]["mode"], "read")
        self.assertEqual(dispatch_kwargs["runtime_access_mode"], "full_access")
        self.assertEqual(dispatch_kwargs["agent_scope"], "sage")
        self.assertEqual(dispatch_kwargs["policy"]["mode"], "full_access")
        self.assertEqual(dispatch_kwargs["policy"]["agent_scope"], "sage")
        self.assertTrue(dispatch_kwargs["policy"]["full_access_warning_acknowledged"])
        self.assertEqual(dispatch_kwargs["policy"]["allowed_paths"], ["/"])

    async def test_full_access_gateway_dispatch_requires_sage_scope(self) -> None:
        registration = {
            "gateway_id": "gw-1",
            "device_id": "dev-1",
            "workspace_id": "ws-1",
            "status": "active",
            "device_trust_state": "trusted",
            "capabilities": ["shell.execute"],
            "metadata": {
                "runtime_access_mode": "full_access",
                "autonomous_agent_setup_warning_acknowledged": True,
                "capability_readiness": {"ready": ["shell.execute"]},
            },
        }
        with patch("server_modules.gateway_execution_service.gateway_state_repository.get_gateway_registration", return_value=registration):
            with self.assertRaisesRegex(PermissionError, "only to Sage"):
                await gateway_execution_service.execute_tool_via_gateway(
                    gateway_id="gw-1",
                    capability_id="shell.execute",
                    arguments={"command": "pwd"},
                    run_id="run-1",
                    trace_id="trace-1",
                    workspace_id="ws-1",
                    request_id="req-1",
                    agent_scope="studio_agent",
                )

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
