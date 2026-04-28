import importlib
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server_modules import (
    auth,
    gateway_state_repository,
    personal_channels_repository,
    routes_gateway,
    routes_personal_channels,
)


class GatewayRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        global auth
        global gateway_state_repository
        global personal_channels_repository
        global routes_gateway
        global routes_personal_channels

        auth = importlib.import_module("server_modules.auth")
        gateway_state_repository = importlib.import_module("server_modules.gateway_state_repository")
        personal_channels_repository = importlib.import_module("server_modules.personal_channels_repository")
        routes_gateway = importlib.import_module("server_modules.routes_gateway")
        routes_personal_channels = importlib.import_module("server_modules.routes_personal_channels")

        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "gateway-state.sqlite3"
        self.auth_db_path = Path(self.tmpdir.name) / "auth-users.sqlite3"
        self.runtime_state_db_path = Path(self.tmpdir.name) / "runtime-state.sqlite3"
        self.personal_channels_db_path = Path(self.tmpdir.name) / "personal-channels.sqlite3"
        gateway_state_repository.init_gateway_state_db(self.db_path)
        personal_channels_repository.init_personal_channels_db(self.personal_channels_db_path)
        self.app = FastAPI()
        self.app.include_router(routes_gateway.router, prefix="/api")
        self.app.include_router(routes_personal_channels.router, prefix="/api")
        self.app.dependency_overrides[routes_gateway.require_api_key] = lambda: self._current_user()
        self.app.dependency_overrides[routes_personal_channels.require_api_key] = lambda: self._current_user()
        self.client = TestClient(self.app)
        self.patchers = [
            patch.object(gateway_state_repository, "GATEWAY_STATE_DB_FILE", self.db_path),
            patch.object(auth, "AUTH_DB_FILE", self.auth_db_path),
            patch.object(personal_channels_repository, "PERSONAL_CHANNELS_DB_FILE", self.personal_channels_db_path),
            patch.dict(os.environ, {"ORION_RUNTIME_STATE_DB": str(self.runtime_state_db_path)}, clear=False),
            patch("server_modules.session_service.runtime_db.get_pool", new=AsyncMock(return_value=None)),
            patch(
                "server_modules.gateway_activity_service.activity_ledger_service.append_activity_event",
                new=AsyncMock(return_value={"id": "aevt-1"}),
            ),
            patch(
                "server_modules.gateway_activity_service.agent_trace_service.resume_trace",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "server_modules.gateway_activity_service.agent_trace_service.emit_approval_requested",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "server_modules.gateway_activity_service.agent_trace_service.emit_approval_resolved",
                new=AsyncMock(return_value=None),
            ),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.tmpdir.cleanup()

    @staticmethod
    def _current_user():
        return {
            "auth_type": "api_key",
            "role": "owner",
            "is_admin": True,
            "user_id": "owner-1",
            "workspace_roles": {"default": "owner"},
            "workspace_access": {
                "default": {
                    "workspace_id": "default",
                    "tenant_id": "default",
                    "role": "owner",
                    "tenant_role": "owner",
                }
            },
        }

    @staticmethod
    def _other_workspace_user():
        return {
            "auth_type": "bearer",
            "role": "owner",
            "is_admin": False,
            "user_id": "owner-2",
            "workspace_roles": {"other": "owner"},
            "workspace_access": {
                "other": {
                    "workspace_id": "other",
                    "tenant_id": "tenant-other",
                    "role": "owner",
                    "tenant_role": "owner",
                }
            },
        }

    def _register_gateway(self) -> dict:
        pairing_response = self.client.post(
            "/api/gateway/pairings/intents",
            json={"workspace_id": "default", "display_name": "Mansur Mac", "platform": "macos"},
        )
        self.assertEqual(pairing_response.status_code, 200)
        pairing_payload = pairing_response.json()
        registration_response = self.client.post(
            "/api/gateway/registrations",
            json={
                "pairing_token": pairing_payload["pairing_token"],
                "device_id": "device-local-1",
                "display_name": "Mansur Mac",
                "platform": "macos-arm64",
                "capabilities": ["screen.read", "system.presence"],
            },
        )
        self.assertEqual(registration_response.status_code, 200)
        return registration_response.json()

    def test_pair_register_connect_heartbeat_and_reconnect(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]

        session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(session_response.status_code, 200)
        session_payload = session_response.json()
        self.assertEqual(session_payload["scope"]["gateway_id"], gateway_id)
        self.assertEqual(session_payload["scope"]["device_id"], "device-local-1")
        self.assertIn("/api/gateway/ws", session_payload["ws_url"])

        ws_path = (
            f"/api/gateway/ws?gateway_id={gateway_id}"
            f"&session_token={session_payload['session_token']}"
        )
        with self.client.websocket_connect(ws_path) as websocket:
            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-connect-1",
                    "type": "gateway.connect",
                    "ts": "2026-04-22T12:00:00Z",
                    "scope": session_payload["scope"],
                    "payload": {
                        "gateway_version": "0.1.0",
                        "device_metadata": {"hostname": "mansur-mac"},
                        "requested_capabilities": ["screen.read"],
                        "journal_cursor": 0,
                        "checkpoint_cursor": 0,
                    },
                }
            )
            connect_ack = websocket.receive_json()
            hello_event = websocket.receive_json()
            presence_event = websocket.receive_json()
            self.assertTrue(connect_ack["ok"])
            self.assertEqual(hello_event["type"], "gateway.hello")
            self.assertEqual(presence_event["type"], "gateway.presence")

            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-heartbeat-1",
                    "type": "gateway.heartbeat",
                    "ts": "2026-04-22T12:00:01Z",
                    "scope": session_payload["scope"],
                    "payload": {
                        "health_state": "online",
                        "journal_cursor": 5,
                        "checkpoint_cursor": 3,
                        "capability_readiness": {"screen.read": "ready"},
                    },
                }
            )
            heartbeat_ack = websocket.receive_json()
            self.assertTrue(heartbeat_ack["ok"])

            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-state-1",
                    "type": "gateway.state.update",
                    "ts": "2026-04-22T12:00:02Z",
                    "scope": session_payload["scope"],
                    "payload": {
                        "status": "online",
                        "health_state": "online",
                        "journal_cursor": 7,
                        "checkpoint_cursor": 4,
                    },
                }
            )
            state_ack = websocket.receive_json()
            state_presence = websocket.receive_json()
            self.assertTrue(state_ack["ok"])
            self.assertEqual(state_presence["type"], "gateway.presence")

            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-disconnect-1",
                    "type": "gateway.disconnect",
                    "ts": "2026-04-22T12:00:03Z",
                    "scope": session_payload["scope"],
                    "payload": {"reason": "test_disconnect"},
                }
            )
            disconnect_ack = websocket.receive_json()
            self.assertTrue(disconnect_ack["ok"])

        list_response = self.client.get("/api/gateway/registrations", params={"workspace_id": "default"})
        self.assertEqual(list_response.status_code, 200)
        list_payload = list_response.json()
        self.assertEqual(list_payload["count"], 1)
        self.assertEqual(list_payload["items"][0]["gateway_id"], gateway_id)
        self.assertEqual(list_payload["items"][0]["journal_cursor"], 7)
        self.assertEqual(list_payload["items"][0]["checkpoint_cursor"], 4)
        self.assertEqual(list_payload["items"][0]["device_trust_state"], "verified")

        reconnect_session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(reconnect_session_response.status_code, 200)
        reconnect_session = reconnect_session_response.json()
        reconnect_path = (
            f"/api/gateway/ws?gateway_id={gateway_id}"
            f"&session_token={reconnect_session['session_token']}"
        )
        with self.client.websocket_connect(reconnect_path) as websocket:
            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-connect-2",
                    "type": "gateway.connect",
                    "ts": "2026-04-22T12:00:10Z",
                    "scope": reconnect_session["scope"],
                    "payload": {
                        "gateway_version": "0.1.0",
                        "device_metadata": {"hostname": "mansur-mac"},
                        "requested_capabilities": ["screen.read"],
                        "journal_cursor": 7,
                        "checkpoint_cursor": 4,
                    },
                }
            )
            reconnect_ack = websocket.receive_json()
            reconnect_hello = websocket.receive_json()
            self.assertTrue(reconnect_ack["ok"])
            self.assertEqual(reconnect_hello["type"], "gateway.hello")

    @patch(
        "server_modules.personal_channels_service.gateway_execution_service.execute_tool_via_gateway",
        new_callable=AsyncMock,
    )
    def test_configure_telegram_personal_gateway_dispatches_config_capability(self, execute_tool_mock: AsyncMock) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        execute_tool_mock.return_value = {
            "gateway_id": gateway_id,
            "result": {
                "status": "updated",
                "reconnect_requested": True,
                "config": {
                    "has_api_id": True,
                    "has_api_hash": True,
                    "has_phone_number": True,
                },
                "state": {
                    "status": "code_required",
                    "login_hint": "******1234",
                },
            },
        }

        response = self.client.post(
            f"/api/personal-channels/telegram/gateways/{gateway_id}/setup",
            json={
                "api_id": 123456,
                "api_hash": "hash-123",
                "phone_number": "+8618657105303",
                "login_code": "12345",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["gateway_id"], gateway_id)
        self.assertEqual(payload["channel_key"], "telegram_personal")
        self.assertEqual(payload["status"], "updated")
        self.assertEqual(payload["state"]["status"], "code_required")
        self.assertEqual(
            execute_tool_mock.await_args.kwargs["capability_id"],
            "channel.telegram.personal.configure",
        )
        self.assertEqual(
            execute_tool_mock.await_args.kwargs["arguments"],
            {
                "api_id": 123456,
                "api_hash": "hash-123",
                "phone_number": "+8618657105303",
                "login_code": "12345",
            },
        )

    @patch(
        "server_modules.personal_channels_service.gateway_execution_service.execute_tool_via_gateway",
        new_callable=AsyncMock,
    )
    def test_configure_whatsapp_personal_gateway_dispatches_config_capability(self, execute_tool_mock: AsyncMock) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        execute_tool_mock.return_value = {
            "gateway_id": gateway_id,
            "result": {
                "status": "updated",
                "reconnect_requested": True,
                "config": {
                    "has_phone_number": True,
                },
                "state": {
                    "status": "pairing_code_required",
                    "login_hint": "*******5303",
                    "pairing_code": "K6YNWTTP",
                },
            },
        }

        response = self.client.post(
            f"/api/personal-channels/whatsapp/gateways/{gateway_id}/setup",
            json={
                "phone_number": "8618657105303",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["gateway_id"], gateway_id)
        self.assertEqual(payload["channel_key"], "whatsapp_personal")
        self.assertEqual(payload["status"], "updated")
        self.assertEqual(payload["state"]["pairing_code"], "K6YNWTTP")
        self.assertEqual(
            execute_tool_mock.await_args.kwargs["capability_id"],
            "channel.whatsapp.personal.configure",
        )
        self.assertEqual(
            execute_tool_mock.await_args.kwargs["arguments"],
            {
                "phone_number": "8618657105303",
            },
        )

    def test_rotate_token_rejects_stale_gateway_token(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        old_token = registration_payload["gateway_token"]

        rotate_response = self.client.post(f"/api/gateway/registrations/{gateway_id}/rotate-token")
        self.assertEqual(rotate_response.status_code, 200)
        rotated_payload = rotate_response.json()
        new_token = rotated_payload["gateway_token"]
        self.assertNotEqual(new_token, old_token)

        stale_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": old_token},
        )
        self.assertEqual(stale_response.status_code, 401)

        fresh_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": new_token},
        )
        self.assertEqual(fresh_response.status_code, 200)

    def test_wrong_workspace_user_cannot_rotate_gateway_token(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]

        self.app.dependency_overrides[routes_gateway.require_api_key] = lambda: self._other_workspace_user()
        denied_response = self.client.post(f"/api/gateway/registrations/{gateway_id}/rotate-token")
        self.assertEqual(denied_response.status_code, 403)

    def test_revoke_gateway_blocks_future_sessions(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]

        initial_session = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(initial_session.status_code, 200)

        revoke_response = self.client.post(
            f"/api/gateway/registrations/{gateway_id}/revoke",
            json={"reason": "owner_revoked_gateway"},
        )
        self.assertEqual(revoke_response.status_code, 200)
        revoked_payload = revoke_response.json()
        self.assertEqual(revoked_payload["gateway"]["status"], "revoked")
        self.assertEqual(revoked_payload["gateway"]["device_trust_state"], "revoked")

        blocked_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(blocked_response.status_code, 401)

    def test_tool_invoke_and_interrupt_flow_through_gateway_with_audit_events(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]
        session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(session_response.status_code, 200)
        session_payload = session_response.json()

        async def _dispatch_tool_invoke(**kwargs):
            request_id = str(kwargs.get("request_id") or "").strip() or "tool-click-1"
            payload = {
                "request_id": request_id,
                "capability_id": str(kwargs.get("capability_id") or "").strip(),
                "run_id": str(kwargs.get("run_id") or "").strip(),
                "result": {"clicked": True, "x": 48, "y": 96},
            }
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=session_payload["session_id"],
                direction="outbound",
                frame_kind="request",
                message_type="tool.invoke",
                payload={"id": request_id, "payload": dict(kwargs)},
            )
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=session_payload["session_id"],
                direction="inbound",
                frame_kind="response",
                message_type="tool.result",
                payload={"id": request_id, "payload": payload},
            )
            return payload

        async def _dispatch_tool_interrupt(**kwargs):
            request_id = str(kwargs.get("request_id") or "").strip() or "tool-interrupt-1"
            payload = {
                "request_id": request_id,
                "run_id": str(kwargs.get("run_id") or "").strip(),
                "target_request_id": str(kwargs.get("target_request_id") or "").strip() or None,
                "interrupted": True,
                "interrupt_count": 1,
            }
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=session_payload["session_id"],
                direction="outbound",
                frame_kind="request",
                message_type="tool.interrupt",
                payload={"id": request_id, "payload": dict(kwargs)},
            )
            gateway_state_repository.record_gateway_event(
                gateway_id=gateway_id,
                session_id=session_payload["session_id"],
                direction="inbound",
                frame_kind="response",
                message_type="tool.interrupt.result",
                payload={"id": request_id, "payload": payload},
            )
            return payload

        with patch(
            "server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_invoke",
            AsyncMock(side_effect=_dispatch_tool_invoke),
        ), patch(
            "server_modules.gateway_execution_service.gateway_protocol_service.dispatch_tool_interrupt",
            AsyncMock(side_effect=_dispatch_tool_interrupt),
        ):
            execute_response = self.client.post(
                f"/api/gateway/registrations/{gateway_id}/tools/execute",
                json={
                    "capability_id": "computer_control.click",
                    "arguments": {"x": 48, "y": 96, "button": "left", "double": False},
                    "run_id": "run-local-1",
                    "trace_id": "trace-local-1",
                    "request_id": "tool-click-1",
                    "interactive_approvals": False,
                },
            )
            self.assertEqual(execute_response.status_code, 200)
            self.assertEqual(execute_response.json()["result"]["clicked"], True)

            interrupt_response = self.client.post(
                f"/api/gateway/registrations/{gateway_id}/tools/interrupt",
                json={
                    "run_id": "run-local-1",
                    "trace_id": "trace-local-1",
                    "target_request_id": "tool-click-1",
                    "request_id": "tool-interrupt-1",
                    "reason": "operator_requested_stop",
                },
            )
            self.assertEqual(interrupt_response.status_code, 200)
            self.assertEqual(interrupt_response.json()["interrupted"], True)
            self.assertEqual(interrupt_response.json()["interrupt_count"], 1)

        events = gateway_state_repository.list_gateway_events(
            gateway_id,
            session_id=session_payload["session_id"],
        )
        event_types = [event["message_type"] for event in events]
        self.assertIn("tool.invoke", event_types)
        self.assertIn("tool.result", event_types)
        self.assertIn("tool.interrupt", event_types)
        self.assertIn("tool.interrupt.result", event_types)

    def test_whatsapp_personal_channel_state_reply_reconnect_and_dedupe(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]

        session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(session_response.status_code, 200)
        session_payload = session_response.json()
        ws_path = (
            f"/api/gateway/ws?gateway_id={gateway_id}"
            f"&session_token={session_payload['session_token']}"
        )

        with patch(
            "server_modules.personal_channel_sage_bridge_service.build_whatsapp_personal_reply",
            return_value={"text": "Sage reply from cloud", "source": "test_bridge"},
        ):
            with self.client.websocket_connect(ws_path) as websocket:
                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-connect-wa-1",
                        "type": "gateway.connect",
                        "ts": "2026-04-22T12:30:00Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "gateway_version": "0.1.0",
                            "device_metadata": {"hostname": "mansur-mac"},
                            "requested_capabilities": ["channel.whatsapp.personal"],
                            "journal_cursor": 0,
                            "checkpoint_cursor": 0,
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()
                websocket.receive_json()

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-state-wa-qr",
                        "type": "gateway.state.update",
                        "ts": "2026-04-22T12:30:01Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "journal_cursor": 1,
                            "checkpoint_cursor": 1,
                            "personal_channels": {
                                "whatsapp_personal": {
                                    "provider": "whatsapp_baileys",
                                    "status": "qr_required",
                                    "qr_code": "qr-test-123",
                                    "retryable": True,
                                }
                            },
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()

                qr_view = self.client.get(f"/api/personal-channels/whatsapp/gateways/{gateway_id}")
                self.assertEqual(qr_view.status_code, 200)
                qr_payload = qr_view.json()
                self.assertEqual(qr_payload["state"]["status"], "qr_required")
                self.assertEqual(qr_payload["state"]["qr_code"], "qr-test-123")

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-state-wa-pairing",
                        "type": "gateway.state.update",
                        "ts": "2026-04-22T12:30:01.500Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "journal_cursor": 2,
                            "checkpoint_cursor": 2,
                            "personal_channels": {
                                "whatsapp_personal": {
                                    "provider": "whatsapp_baileys",
                                    "status": "pairing_code_required",
                                    "login_hint": "*******1234",
                                    "pairing_code": "ABCD1234",
                                    "pairing_code_generated_at": "2026-04-22T12:30:01.500Z",
                                    "retryable": True,
                                }
                            },
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()

                pairing_view = self.client.get(f"/api/personal-channels/whatsapp/gateways/{gateway_id}")
                self.assertEqual(pairing_view.status_code, 200)
                pairing_payload = pairing_view.json()
                self.assertEqual(pairing_payload["state"]["status"], "pairing_code_required")
                self.assertEqual(pairing_payload["state"]["metadata"]["login_hint"], "*******1234")
                self.assertEqual(pairing_payload["state"]["metadata"]["pairing_code"], "ABCD1234")

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-state-wa-connected",
                        "type": "gateway.state.update",
                        "ts": "2026-04-22T12:30:02Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "journal_cursor": 3,
                            "checkpoint_cursor": 3,
                            "personal_channels": {
                                "whatsapp_personal": {
                                    "provider": "whatsapp_baileys",
                                    "status": "connected",
                                    "linked_jid": "me@s.whatsapp.net",
                                    "linked_name": "Mansur",
                                    "connected_at": "2026-04-22T12:30:02Z",
                                    "retryable": True,
                                }
                            },
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()

                connected_view = self.client.get(f"/api/personal-channels/whatsapp/gateways/{gateway_id}")
                self.assertEqual(connected_view.status_code, 200)
                connected_payload = connected_view.json()
                self.assertEqual(connected_payload["state"]["status"], "connected")
                self.assertEqual(connected_payload["state"]["linked_jid"], "me@s.whatsapp.net")

                websocket.send_json(
                    {
                        "kind": "event",
                        "type": "channel.inbound",
                        "seq": 7,
                        "ack": 2,
                        "ts": "2026-04-22T12:30:03Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "channel_key": "whatsapp_personal",
                            "provider": "whatsapp_baileys",
                            "message": {
                                "external_message_id": "wamid.inbound.1",
                                "remote_jid": "user-1@s.whatsapp.net",
                                "sender_jid": "user-1@s.whatsapp.net",
                                "push_name": "User One",
                                "text": "Hello from WhatsApp",
                                "received_at": "2026-04-22T12:30:03Z",
                                "from_me": False,
                            },
                        },
                    }
                )
                outbound_request = websocket.receive_json()
                self.assertEqual(outbound_request["kind"], "request")
                self.assertEqual(outbound_request["type"], "channel.outbound")
                self.assertEqual(outbound_request["payload"]["remote_jid"], "user-1@s.whatsapp.net")
                self.assertEqual(outbound_request["payload"]["text"], "Sage reply from cloud")

                websocket.send_json(
                    {
                        "kind": "response",
                        "id": outbound_request["id"],
                        "ok": True,
                        "ts": "2026-04-22T12:30:04Z",
                        "payload": {
                            "channel_key": "whatsapp_personal",
                            "provider": "whatsapp_baileys",
                            "idempotency_key": outbound_request["payload"]["idempotency_key"],
                            "external_message_id": "wamid.outbound.1",
                            "remote_jid": "user-1@s.whatsapp.net",
                            "text": "Sage reply from cloud",
                            "delivered": True,
                        },
                    }
                )

                delivered_view = self.client.get(f"/api/personal-channels/whatsapp/gateways/{gateway_id}")
                self.assertEqual(delivered_view.status_code, 200)
                delivered_payload = delivered_view.json()
                self.assertEqual(len(delivered_payload["recent_messages"]["inbound"]), 1)
                self.assertEqual(len(delivered_payload["recent_messages"]["outbound"]), 1)
                self.assertEqual(delivered_payload["recent_messages"]["outbound"][0]["status"], "delivered")

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-disconnect-wa-1",
                        "type": "gateway.disconnect",
                        "ts": "2026-04-22T12:30:05Z",
                        "scope": session_payload["scope"],
                        "payload": {"reason": "reconnect_for_dedupe"},
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])

        reconnect_session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(reconnect_session_response.status_code, 200)
        reconnect_session = reconnect_session_response.json()
        reconnect_path = (
            f"/api/gateway/ws?gateway_id={gateway_id}"
            f"&session_token={reconnect_session['session_token']}"
        )

        with patch(
            "server_modules.personal_channel_sage_bridge_service.build_whatsapp_personal_reply",
            return_value={"text": "Sage reply from cloud", "source": "test_bridge"},
        ):
            with self.client.websocket_connect(reconnect_path) as websocket:
                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-connect-wa-2",
                        "type": "gateway.connect",
                        "ts": "2026-04-22T12:31:00Z",
                        "scope": reconnect_session["scope"],
                        "payload": {
                            "gateway_version": "0.1.0",
                            "device_metadata": {"hostname": "mansur-mac"},
                            "requested_capabilities": ["channel.whatsapp.personal"],
                            "journal_cursor": 2,
                            "checkpoint_cursor": 2,
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()
                websocket.receive_json()

                websocket.send_json(
                    {
                        "kind": "event",
                        "type": "channel.inbound",
                        "seq": 8,
                        "ack": 2,
                        "ts": "2026-04-22T12:31:01Z",
                        "scope": reconnect_session["scope"],
                        "payload": {
                            "channel_key": "whatsapp_personal",
                            "provider": "whatsapp_baileys",
                            "message": {
                                "external_message_id": "wamid.inbound.1",
                                "remote_jid": "user-1@s.whatsapp.net",
                                "sender_jid": "user-1@s.whatsapp.net",
                                "push_name": "User One",
                                "text": "Hello from WhatsApp",
                                "received_at": "2026-04-22T12:31:01Z",
                                "from_me": False,
                            },
                        },
                    }
                )
                time.sleep(0.15)
                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-disconnect-wa-2",
                        "type": "gateway.disconnect",
                        "ts": "2026-04-22T12:31:02Z",
                        "scope": reconnect_session["scope"],
                        "payload": {"reason": "dedupe_verified"},
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])

        view_after_reconnect = self.client.get(f"/api/personal-channels/whatsapp/gateways/{gateway_id}")
        self.assertEqual(view_after_reconnect.status_code, 200)
        reconnect_payload = view_after_reconnect.json()
        self.assertEqual(len(reconnect_payload["recent_messages"]["inbound"]), 1)
        self.assertEqual(len(reconnect_payload["recent_messages"]["outbound"]), 1)

        all_events = gateway_state_repository.list_gateway_events(gateway_id)
        outbound_request_events = [
            event
            for event in all_events
            if event["message_type"] == "channel.outbound" and event["direction"] == "outbound"
        ]
        outbound_result_events = [
            event
            for event in all_events
            if event["message_type"] == "channel.outbound.result" and event["direction"] == "inbound"
        ]
        self.assertEqual(len(outbound_request_events), 1)
        self.assertEqual(len(outbound_result_events), 1)

    def test_telegram_personal_channel_state_reply_reconnect_and_dedupe(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]

        session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(session_response.status_code, 200)
        session_payload = session_response.json()
        ws_path = (
            f"/api/gateway/ws?gateway_id={gateway_id}"
            f"&session_token={session_payload['session_token']}"
        )

        with patch(
            "server_modules.personal_channel_sage_bridge_service.build_telegram_personal_reply",
            return_value={"text": "Sage reply from Telegram cloud", "source": "test_bridge"},
        ):
            with self.client.websocket_connect(ws_path) as websocket:
                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-connect-tg-1",
                        "type": "gateway.connect",
                        "ts": "2026-04-22T13:30:00Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "gateway_version": "0.1.0",
                            "device_metadata": {"hostname": "mansur-mac"},
                            "requested_capabilities": ["channel.telegram.personal"],
                            "journal_cursor": 0,
                            "checkpoint_cursor": 0,
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()
                websocket.receive_json()

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-state-tg-code",
                        "type": "gateway.state.update",
                        "ts": "2026-04-22T13:30:01Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "journal_cursor": 1,
                            "checkpoint_cursor": 1,
                            "personal_channels": {
                                "telegram_personal": {
                                    "provider": "telegram_gramjs",
                                    "status": "code_required",
                                    "login_hint": "******1234",
                                    "retryable": False,
                                }
                            },
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()

                login_view = self.client.get(f"/api/personal-channels/telegram/gateways/{gateway_id}")
                self.assertEqual(login_view.status_code, 200)
                login_payload = login_view.json()
                self.assertEqual(login_payload["state"]["status"], "code_required")
                self.assertEqual(login_payload["state"]["login_hint"], "******1234")

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-state-tg-connected",
                        "type": "gateway.state.update",
                        "ts": "2026-04-22T13:30:02Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "journal_cursor": 2,
                            "checkpoint_cursor": 2,
                            "personal_channels": {
                                "telegram_personal": {
                                    "provider": "telegram_gramjs",
                                    "status": "connected",
                                    "linked_user_id": "123456",
                                    "linked_username": "mansur",
                                    "linked_name": "Mansur",
                                    "connected_at": "2026-04-22T13:30:02Z",
                                    "retryable": True,
                                }
                            },
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()

                connected_view = self.client.get(f"/api/personal-channels/telegram/gateways/{gateway_id}")
                self.assertEqual(connected_view.status_code, 200)
                connected_payload = connected_view.json()
                self.assertEqual(connected_payload["state"]["status"], "connected")
                self.assertEqual(connected_payload["state"]["linked_username"], "mansur")

                websocket.send_json(
                    {
                        "kind": "event",
                        "type": "channel.inbound",
                        "seq": 9,
                        "ack": 2,
                        "ts": "2026-04-22T13:30:03Z",
                        "scope": session_payload["scope"],
                        "payload": {
                            "channel_key": "telegram_personal",
                            "provider": "telegram_gramjs",
                            "message": {
                                "external_message_id": "tg.inbound.1",
                                "remote_jid": "telegram-user-1",
                                "sender_jid": "telegram-user-1",
                                "push_name": "User One",
                                "text": "Hello from Telegram",
                                "received_at": "2026-04-22T13:30:03Z",
                                "from_me": False,
                            },
                        },
                    }
                )
                outbound_request = websocket.receive_json()
                self.assertEqual(outbound_request["kind"], "request")
                self.assertEqual(outbound_request["type"], "channel.outbound")
                self.assertEqual(outbound_request["payload"]["remote_jid"], "telegram-user-1")
                self.assertEqual(outbound_request["payload"]["text"], "Sage reply from Telegram cloud")

                websocket.send_json(
                    {
                        "kind": "response",
                        "id": outbound_request["id"],
                        "ok": True,
                        "ts": "2026-04-22T13:30:04Z",
                        "payload": {
                            "channel_key": "telegram_personal",
                            "provider": "telegram_gramjs",
                            "idempotency_key": outbound_request["payload"]["idempotency_key"],
                            "external_message_id": "tg.outbound.1",
                            "remote_jid": "telegram-user-1",
                            "text": "Sage reply from Telegram cloud",
                            "delivered": True,
                        },
                    }
                )

                delivered_view = self.client.get(f"/api/personal-channels/telegram/gateways/{gateway_id}")
                self.assertEqual(delivered_view.status_code, 200)
                delivered_payload = delivered_view.json()
                self.assertEqual(len(delivered_payload["recent_messages"]["inbound"]), 1)
                self.assertEqual(len(delivered_payload["recent_messages"]["outbound"]), 1)
                self.assertEqual(delivered_payload["recent_messages"]["outbound"][0]["status"], "delivered")

                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-disconnect-tg-1",
                        "type": "gateway.disconnect",
                        "ts": "2026-04-22T13:30:05Z",
                        "scope": session_payload["scope"],
                        "payload": {"reason": "reconnect_for_dedupe"},
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])

        reconnect_session_response = self.client.post(
            "/api/gateway/sessions",
            json={"gateway_id": gateway_id, "gateway_token": gateway_token},
        )
        self.assertEqual(reconnect_session_response.status_code, 200)
        reconnect_session = reconnect_session_response.json()
        reconnect_path = (
            f"/api/gateway/ws?gateway_id={gateway_id}"
            f"&session_token={reconnect_session['session_token']}"
        )

        with patch(
            "server_modules.personal_channel_sage_bridge_service.build_telegram_personal_reply",
            return_value={"text": "Sage reply from Telegram cloud", "source": "test_bridge"},
        ):
            with self.client.websocket_connect(reconnect_path) as websocket:
                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-connect-tg-2",
                        "type": "gateway.connect",
                        "ts": "2026-04-22T13:31:00Z",
                        "scope": reconnect_session["scope"],
                        "payload": {
                            "gateway_version": "0.1.0",
                            "device_metadata": {"hostname": "mansur-mac"},
                            "requested_capabilities": ["channel.telegram.personal"],
                            "journal_cursor": 2,
                            "checkpoint_cursor": 2,
                        },
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])
                websocket.receive_json()
                websocket.receive_json()

                websocket.send_json(
                    {
                        "kind": "event",
                        "type": "channel.inbound",
                        "seq": 10,
                        "ack": 2,
                        "ts": "2026-04-22T13:31:01Z",
                        "scope": reconnect_session["scope"],
                        "payload": {
                            "channel_key": "telegram_personal",
                            "provider": "telegram_gramjs",
                            "message": {
                                "external_message_id": "tg.inbound.1",
                                "remote_jid": "telegram-user-1",
                                "sender_jid": "telegram-user-1",
                                "push_name": "User One",
                                "text": "Hello from Telegram",
                                "received_at": "2026-04-22T13:31:01Z",
                                "from_me": False,
                            },
                        },
                    }
                )
                time.sleep(0.15)
                websocket.send_json(
                    {
                        "kind": "request",
                        "id": "req-disconnect-tg-2",
                        "type": "gateway.disconnect",
                        "ts": "2026-04-22T13:31:02Z",
                        "scope": reconnect_session["scope"],
                        "payload": {"reason": "dedupe_verified"},
                    }
                )
                self.assertTrue(websocket.receive_json()["ok"])

        view_after_reconnect = self.client.get(f"/api/personal-channels/telegram/gateways/{gateway_id}")
        self.assertEqual(view_after_reconnect.status_code, 200)
        reconnect_payload = view_after_reconnect.json()
        self.assertEqual(len(reconnect_payload["recent_messages"]["inbound"]), 1)
        self.assertEqual(len(reconnect_payload["recent_messages"]["outbound"]), 1)

        all_events = gateway_state_repository.list_gateway_events(gateway_id)
        outbound_request_events = [
            event
            for event in all_events
            if event["message_type"] == "channel.outbound" and event["direction"] == "outbound"
            and event["payload"].get("payload", {}).get("channel_key") == "telegram_personal"
        ]
        outbound_result_events = [
            event
            for event in all_events
            if event["message_type"] == "channel.outbound.result" and event["direction"] == "inbound"
            and event["payload"].get("payload", {}).get("channel_key") == "telegram_personal"
        ]
        self.assertEqual(len(outbound_request_events), 1)
        self.assertEqual(len(outbound_result_events), 1)


if __name__ == "__main__":
    unittest.main()
