from __future__ import annotations

import unittest
from unittest.mock import patch

from server_modules.hardware_runtime_adapters import gateway_adapter


def _registration(**overrides):
    base = {
        "gateway_id": "gw-1",
        "device_id": "device-1",
        "workspace_id": "ws-1",
        "status": "active",
        "device_trust_state": "trusted",
    }
    base.update(overrides)
    return base


class HardwareGatewayAdapterTests(unittest.TestCase):
    def test_find_gateway_registration_prefers_live_active_gateway(self) -> None:
        with (
            patch(
                "server_modules.hardware_runtime_adapters.gateway_adapter.gateway_state_repository.list_workspace_gateway_registrations",
                return_value=[
                    _registration(gateway_id="gw-offline"),
                    _registration(gateway_id="gw-live"),
                    _registration(gateway_id="gw-revoked", device_trust_state="revoked"),
                ],
            ),
            patch(
                "server_modules.hardware_runtime_adapters.gateway_adapter.gateway_protocol_service.gateway_connection_is_live",
                side_effect=lambda gateway_id: gateway_id == "gw-live",
            ),
        ):
            registration = gateway_adapter.find_gateway_registration(gateway_id=None, workspace_id="ws-1")

        self.assertEqual(registration["gateway_id"], "gw-live")

    def test_registration_usability_keeps_hard_boundaries(self) -> None:
        self.assertEqual(
            gateway_adapter.registration_is_usable(_registration(status="inactive"), workspace_id="ws-1"),
            (False, "gateway_registration_inactive"),
        )
        self.assertEqual(
            gateway_adapter.registration_is_usable(_registration(device_trust_state="revoked"), workspace_id="ws-1"),
            (False, "gateway_device_revoked"),
        )
        self.assertEqual(
            gateway_adapter.registration_is_usable(_registration(workspace_id="other"), workspace_id="ws-1"),
            (False, "gateway_workspace_mismatch"),
        )
        self.assertEqual(
            gateway_adapter.registration_is_usable(_registration(), workspace_id="ws-1"),
            (True, ""),
        )

    def test_execution_readiness_fails_closed_for_stale_heartbeat(self) -> None:
        with (
            patch(
                "server_modules.gateway_execution_service.gateway_protocol_service.gateway_connection_is_live",
                return_value=True,
            ),
            patch(
                "server_modules.gateway_execution_service.gateway_registry_service.gateway_registration_public_payload",
                return_value={
                    "connection_status": "degraded",
                    "heartbeat_fresh": False,
                    "reported_health_state": "online",
                },
            ),
        ):
            self.assertEqual(
                gateway_adapter.gateway_execution_service.gateway_registration_execution_readiness(
                    _registration(capabilities=["shell.execute"]),
                    workspace_id="ws-1",
                    capability_id="shell.execute",
                ),
                (False, "gateway_heartbeat_stale"),
            )

    def test_execution_readiness_fails_closed_for_missing_capability(self) -> None:
        self.assertEqual(
            gateway_adapter.gateway_execution_service.gateway_registration_execution_readiness(
                _registration(capabilities=["screenshot.capture"]),
                workspace_id="ws-1",
                capability_id="shell.execute",
            ),
            (False, "gateway_capability_missing"),
        )

    def test_execution_readiness_allows_fresh_healthy_registered_capability(self) -> None:
        with (
            patch(
                "server_modules.gateway_execution_service.gateway_protocol_service.gateway_connection_is_live",
                return_value=True,
            ),
            patch(
                "server_modules.gateway_execution_service.gateway_registry_service.gateway_registration_public_payload",
                return_value={
                    "connection_status": "online",
                    "heartbeat_fresh": True,
                    "reported_health_state": "online",
                    "capability_readiness": {"ready": ["shell.execute"]},
                },
            ),
        ):
            self.assertEqual(
                gateway_adapter.gateway_execution_service.gateway_registration_execution_readiness(
                    _registration(
                        capabilities=["shell.execute"],
                        metadata={"capability_readiness": {"ready": ["shell.execute"]}},
                    ),
                    workspace_id="ws-1",
                    capability_id="shell.execute",
                ),
                (True, ""),
            )

    def test_execution_readiness_requires_heartbeat_capability_ready(self) -> None:
        with (
            patch(
                "server_modules.gateway_execution_service.gateway_protocol_service.gateway_connection_is_live",
                return_value=True,
            ),
            patch(
                "server_modules.gateway_execution_service.gateway_registry_service.gateway_registration_public_payload",
                return_value={
                    "connection_status": "online",
                    "heartbeat_fresh": True,
                    "reported_health_state": "online",
                    "metadata": {
                        "service_inventory": [
                            {
                                "id": "postgres",
                                "status": "ready",
                                "passive": True,
                                "execution_enabled": False,
                            }
                        ],
                        "capability_readiness": {
                            "passive_services": ["postgres"],
                            "service_statuses": {"postgres": "ready"},
                        },
                    },
                },
            ),
        ):
            self.assertEqual(
                gateway_adapter.gateway_execution_service.gateway_registration_execution_readiness(
                    _registration(
                        capabilities=["shell.execute"],
                        metadata={
                            "service_inventory": [
                                {
                                    "id": "postgres",
                                    "status": "ready",
                                    "passive": True,
                                    "execution_enabled": False,
                                }
                            ],
                            "capability_readiness": {
                                "passive_services": ["postgres"],
                                "service_statuses": {"postgres": "ready"},
                            },
                        },
                    ),
                    workspace_id="ws-1",
                    capability_id="shell.execute",
                ),
                (False, "gateway_capability_not_ready"),
            )

    def test_execution_summary_uses_user_visible_result_text(self) -> None:
        self.assertEqual(
            gateway_adapter.execution_summary(
                "shell.execute",
                {"result": {"command": "pwd", "exit_code": 0}},
            ),
            "Ran command: pwd",
        )
        self.assertEqual(
            gateway_adapter.execution_summary(
                "filesystem.read",
                {"result": {"path": "/tmp/demo.txt", "mode": "read"}},
            ),
            "Read file action completed: /tmp/demo.txt",
        )
