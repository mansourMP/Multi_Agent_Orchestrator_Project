import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server_modules import auth, gateway_state_repository, personal_channels_repository, routes_gateway


class GatewayPhase7RoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.gateway_db_path = Path(self.tmpdir.name) / "gateway-state.sqlite3"
        self.auth_db_path = Path(self.tmpdir.name) / "auth-users.sqlite3"
        self.personal_channels_db_path = Path(self.tmpdir.name) / "personal-channels.sqlite3"
        self.runtime_state_db_path = Path(self.tmpdir.name) / "runtime-state.sqlite3"
        gateway_state_repository.init_gateway_state_db(self.gateway_db_path)
        personal_channels_repository.init_personal_channels_db(self.personal_channels_db_path)
        self.app = FastAPI()
        self.app.include_router(routes_gateway.router, prefix="/api")
        self.app.dependency_overrides[routes_gateway.require_api_key] = lambda: self._current_user()
        self.client = TestClient(self.app)

        self.patchers = [
            patch.object(gateway_state_repository, "GATEWAY_STATE_DB_FILE", self.gateway_db_path),
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
                "capabilities": [
                    "browser.session.start",
                    "browser.session.action",
                    "browser.session.takeover",
                    "browser.session.resume",
                    "browser.session.interrupt",
                ],
            },
        )
        self.assertEqual(registration_response.status_code, 200)
        return registration_response.json()

    def _connect_gateway(self, gateway_id: str, gateway_token: str) -> tuple[dict, str]:
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
        return session_payload, ws_path

    def test_gateway_browser_routes_cover_start_approval_resume_interrupt_and_fallback(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]
        session_payload, ws_path = self._connect_gateway(gateway_id, gateway_token)

        with self.client.websocket_connect(ws_path) as websocket:
            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-connect-browser-1",
                    "type": "gateway.connect",
                    "ts": "2026-04-22T15:00:00Z",
                    "scope": session_payload["scope"],
                    "payload": {
                        "gateway_version": "0.1.0",
                        "device_metadata": {"hostname": "mansur-mac"},
                        "requested_capabilities": [
                            "browser.session.start",
                            "browser.session.action",
                            "browser.session.takeover",
                            "browser.session.resume",
                            "browser.session.interrupt",
                        ],
                        "journal_cursor": 0,
                        "checkpoint_cursor": 0,
                    },
                }
            )
            self.assertTrue(websocket.receive_json()["ok"])
            websocket.receive_json()
            websocket.receive_json()

            start_response: dict = {}

            def _post_start() -> None:
                start_response["response"] = self.client.post(
                    f"/api/gateway/registrations/{gateway_id}/browser/sessions",
                    json={
                        "url": "https://example.com",
                        "session_profile": "qa-browser",
                        "interactive_actions": ["navigate"],
                        "run_id": "run-browser-1",
                        "trace_id": "trace-browser-1",
                    },
                )

            start_thread = threading.Thread(target=_post_start)
            start_thread.start()
            start_frame = websocket.receive_json()
            self.assertEqual(start_frame["type"], "tool.invoke")
            self.assertEqual(start_frame["payload"]["capability_id"], "browser.session.start")
            browser_metadata = start_frame["payload"]["arguments"]["browser_metadata"]
            self.assertEqual(browser_metadata["browser_session_profile"], "qa-browser")
            self.assertEqual(browser_metadata["execution_target_selected"], "local_gateway")
            websocket.send_json(
                {
                    "kind": "response",
                    "id": start_frame["id"],
                    "ok": True,
                    "ts": "2026-04-22T15:00:01Z",
                    "payload": {
                        "request_id": start_frame["id"],
                        "capability_id": "browser.session.start",
                        "run_id": "run-browser-1",
                        "result": {
                            "browser_session": {
                                "browser_session_id": "gbsess-1",
                                "status": "active",
                                "execution_target": "local_gateway",
                                "session_profile": "qa-browser",
                                "current_url": "https://example.com",
                                "manual_takeover": False,
                                "resume_supported": True,
                                "reviewed_approval_required": False,
                                "reviewed_approved": False,
                                "immutable_plan_hash": "plan-1",
                                "execution_binding": {"cwd": "/tmp/project"},
                                "checkpoint": {
                                    "next_action_index": 1,
                                    "session_profile": "qa-browser",
                                    "current_url": "https://example.com",
                                },
                                "snapshot": {
                                    "url": "https://example.com",
                                    "tabs": [{"id": 1, "url": "https://example.com"}],
                                    "accessibility_snapshot": {"role": "document"},
                                },
                                "metadata": {
                                    "browser_resume_supported": True,
                                    "browser_execution_binding": {"cwd": "/tmp/project"},
                                },
                            },
                            "status": "started",
                        },
                    },
                }
            )
            start_thread.join(timeout=5)
            self.assertEqual(start_response["response"].status_code, 200)
            start_payload = start_response["response"].json()
            self.assertEqual(start_payload["browser_session"]["browser_session_id"], "gbsess-1")
            self.assertTrue(start_payload["browser_session"]["resume_supported"])

            approval_response = self.client.post(
                f"/api/gateway/registrations/{gateway_id}/browser/sessions/gbsess-1/actions",
                json={
                    "action": "click",
                    "action_args": {"selector": "#login"},
                    "run_id": "run-browser-1",
                    "trace_id": "trace-browser-1",
                },
            )
            self.assertEqual(approval_response.status_code, 202)
            approval_payload = approval_response.json()
            self.assertEqual(approval_payload["status"], "approval_required")
            approval_id = approval_payload["approval"]["approval_id"]

            resolve_response: dict = {}

            def _resolve_approval() -> None:
                resolve_response["response"] = self.client.post(
                    f"/api/gateway/registrations/{gateway_id}/approvals/{approval_id}/resolve",
                    json={"decision": "approved", "note": "Proceed", "timeout_seconds": 5},
                )

            resolve_thread = threading.Thread(target=_resolve_approval)
            resolve_thread.start()
            action_frame = websocket.receive_json()
            self.assertEqual(action_frame["type"], "tool.invoke")
            self.assertEqual(action_frame["payload"]["capability_id"], "browser.session.action")
            self.assertEqual(action_frame["payload"]["arguments"]["action"], "click")
            websocket.send_json(
                {
                    "kind": "response",
                    "id": action_frame["id"],
                    "ok": True,
                    "ts": "2026-04-22T15:00:02Z",
                    "payload": {
                        "request_id": action_frame["id"],
                        "capability_id": "browser.session.action",
                        "run_id": "run-browser-1",
                        "result": {
                            "browser_session": {
                                "browser_session_id": "gbsess-1",
                                "status": "active",
                                "execution_target": "local_gateway",
                                "session_profile": "qa-browser",
                                "current_url": "https://example.com/app",
                                "manual_takeover": False,
                                "resume_supported": True,
                                "reviewed_approval_required": True,
                                "reviewed_approved": True,
                                "immutable_plan_hash": "plan-2",
                                "execution_binding": {"cwd": "/tmp/project"},
                                "checkpoint": {
                                    "next_action_index": 2,
                                    "session_profile": "qa-browser",
                                    "current_url": "https://example.com/app",
                                },
                                "snapshot": {
                                    "url": "https://example.com/app",
                                    "tabs": [{"id": 1, "url": "https://example.com/app"}],
                                    "accessibility_snapshot": {"role": "application"},
                                },
                                "metadata": {
                                    "browser_resume_supported": True,
                                    "browser_reviewed_approval_required": True,
                                    "browser_reviewed_approved": True,
                                },
                            },
                            "status": "completed",
                            "action_result": {"clicked": True},
                        },
                    },
                }
            )
            resolve_thread.join(timeout=5)
            self.assertEqual(resolve_response["response"].status_code, 200)
            resolved_payload = resolve_response["response"].json()
            self.assertEqual(resolved_payload["status"], "executed")
            self.assertEqual(
                resolved_payload["execution"]["browser_session"]["checkpoint"]["next_action_index"],
                2,
            )

            takeover_response: dict = {}

            def _post_takeover() -> None:
                takeover_response["response"] = self.client.post(
                    f"/api/gateway/registrations/{gateway_id}/browser/sessions/gbsess-1/takeover",
                    json={"run_id": "run-browser-1", "trace_id": "trace-browser-1"},
                )

            takeover_thread = threading.Thread(target=_post_takeover)
            takeover_thread.start()
            takeover_frame = websocket.receive_json()
            self.assertEqual(takeover_frame["payload"]["capability_id"], "browser.session.takeover")
            websocket.send_json(
                {
                    "kind": "response",
                    "id": takeover_frame["id"],
                    "ok": True,
                    "ts": "2026-04-22T15:00:03Z",
                    "payload": {
                        "request_id": takeover_frame["id"],
                        "capability_id": "browser.session.takeover",
                        "run_id": "run-browser-1",
                        "result": {
                            "browser_session": {
                                "browser_session_id": "gbsess-1",
                                "status": "waiting_for_input",
                                "execution_target": "local_gateway",
                                "session_profile": "qa-browser",
                                "current_url": "https://example.com/app",
                                "manual_takeover": True,
                                "resume_supported": True,
                                "reviewed_approval_required": True,
                                "reviewed_approved": True,
                                "immutable_plan_hash": "plan-2",
                                "execution_binding": {"cwd": "/tmp/project"},
                                "checkpoint": {
                                    "next_action_index": 2,
                                    "session_profile": "qa-browser",
                                    "current_url": "https://example.com/app",
                                    "manual_takeover": True,
                                },
                                "snapshot": {"url": "https://example.com/app"},
                                "metadata": {"manual_takeover": True, "browser_resume_supported": True},
                            },
                            "status": "waiting_for_input",
                            "manual_takeover": True,
                        },
                    },
                }
            )
            takeover_thread.join(timeout=5)
            self.assertEqual(takeover_response["response"].status_code, 200)
            self.assertTrue(takeover_response["response"].json()["browser_session"]["manual_takeover"])

            resume_response: dict = {}

            def _post_resume() -> None:
                resume_response["response"] = self.client.post(
                    f"/api/gateway/registrations/{gateway_id}/browser/sessions/gbsess-1/resume",
                    json={"run_id": "run-browser-1", "trace_id": "trace-browser-1"},
                )

            resume_thread = threading.Thread(target=_post_resume)
            resume_thread.start()
            resume_frame = websocket.receive_json()
            self.assertEqual(resume_frame["payload"]["capability_id"], "browser.session.resume")
            websocket.send_json(
                {
                    "kind": "response",
                    "id": resume_frame["id"],
                    "ok": True,
                    "ts": "2026-04-22T15:00:04Z",
                    "payload": {
                        "request_id": resume_frame["id"],
                        "capability_id": "browser.session.resume",
                        "run_id": "run-browser-1",
                        "result": {
                            "browser_session": {
                                "browser_session_id": "gbsess-1",
                                "status": "active",
                                "execution_target": "local_gateway",
                                "session_profile": "qa-browser",
                                "current_url": "https://example.com/app",
                                "manual_takeover": False,
                                "resume_supported": True,
                                "reviewed_approval_required": True,
                                "reviewed_approved": True,
                                "immutable_plan_hash": "plan-2",
                                "execution_binding": {"cwd": "/tmp/project"},
                                "checkpoint": {
                                    "next_action_index": 2,
                                    "session_profile": "qa-browser",
                                    "current_url": "https://example.com/app",
                                    "manual_takeover": False,
                                },
                                "snapshot": {"url": "https://example.com/app"},
                                "metadata": {"browser_resume_supported": True},
                            },
                            "status": "resumed",
                        },
                    },
                }
            )
            resume_thread.join(timeout=5)
            self.assertEqual(resume_response["response"].status_code, 200)
            self.assertFalse(resume_response["response"].json()["browser_session"]["manual_takeover"])

            doctor_response = self.client.get(f"/api/gateway/registrations/{gateway_id}/doctor")
            self.assertEqual(doctor_response.status_code, 200)
            self.assertEqual(doctor_response.json()["browser"]["count"], 1)
            self.assertEqual(doctor_response.json()["browser"]["active_count"], 1)

            interrupt_response: dict = {}

            def _post_interrupt() -> None:
                interrupt_response["response"] = self.client.post(
                    f"/api/gateway/registrations/{gateway_id}/browser/sessions/gbsess-1/interrupt",
                    json={"run_id": "run-browser-1", "trace_id": "trace-browser-1"},
                )

            interrupt_thread = threading.Thread(target=_post_interrupt)
            interrupt_thread.start()
            interrupt_frame = websocket.receive_json()
            self.assertEqual(interrupt_frame["payload"]["capability_id"], "browser.session.interrupt")
            websocket.send_json(
                {
                    "kind": "response",
                    "id": interrupt_frame["id"],
                    "ok": True,
                    "ts": "2026-04-22T15:00:05Z",
                    "payload": {
                        "request_id": interrupt_frame["id"],
                        "capability_id": "browser.session.interrupt",
                        "run_id": "run-browser-1",
                        "result": {
                            "browser_session": {
                                "browser_session_id": "gbsess-1",
                                "status": "interrupted",
                                "execution_target": "local_gateway",
                                "session_profile": "qa-browser",
                                "current_url": "https://example.com/app",
                                "manual_takeover": False,
                                "resume_supported": True,
                                "reviewed_approval_required": True,
                                "reviewed_approved": True,
                                "immutable_plan_hash": "plan-2",
                                "execution_binding": {"cwd": "/tmp/project"},
                                "checkpoint": {
                                    "next_action_index": 2,
                                    "session_profile": "qa-browser",
                                    "current_url": "https://example.com/app",
                                },
                                "snapshot": {"url": "https://example.com/app"},
                                "metadata": {"browser_resume_supported": True},
                                "interrupted_at": "2026-04-22T15:00:05Z",
                            },
                            "status": "interrupted",
                            "interrupted": True,
                            "interrupt_count": 1,
                        },
                    },
                }
            )
            interrupt_thread.join(timeout=5)
            self.assertEqual(interrupt_response["response"].status_code, 200)
            self.assertEqual(interrupt_response["response"].json()["result"]["interrupt_count"], 1)

        fallback_response = self.client.post(
            f"/api/gateway/registrations/{gateway_id}/browser/sessions",
            json={
                "url": "https://fallback.example.com",
                "session_profile": "qa-browser",
                "run_id": "run-browser-fallback",
                "trace_id": "trace-browser-fallback",
                "allow_cloud_fallback": True,
            },
        )
        self.assertEqual(fallback_response.status_code, 202)
        fallback_payload = fallback_response.json()
        self.assertEqual(fallback_payload["status"], "fallback_ready")
        self.assertEqual(fallback_payload["execution_target"], "cloud_browser")

        events_payload = self.client.get(f"/api/gateway/registrations/{gateway_id}/events")
        self.assertEqual(events_payload.status_code, 200)
        event_types = [item["message_type"] for item in events_payload.json()["items"]]
        self.assertIn("gateway.browser.fallback_ready", event_types)

    def test_gateway_browser_attach_mode_reports_attach_required_and_attached_states(self) -> None:
        registration_payload = self._register_gateway()
        gateway_id = registration_payload["gateway"]["gateway_id"]
        gateway_token = registration_payload["gateway_token"]
        session_payload, ws_path = self._connect_gateway(gateway_id, gateway_token)

        with self.client.websocket_connect(ws_path) as websocket:
            websocket.send_json(
                {
                    "kind": "request",
                    "id": "req-connect-browser-attach-1",
                    "type": "gateway.connect",
                    "ts": "2026-04-22T16:00:00Z",
                    "scope": session_payload["scope"],
                    "payload": {
                        "gateway_version": "0.1.0",
                        "device_metadata": {"hostname": "mansur-mac"},
                        "requested_capabilities": [
                            "browser.session.start",
                            "browser.session.action",
                            "browser.session.takeover",
                            "browser.session.resume",
                            "browser.session.interrupt",
                        ],
                        "journal_cursor": 0,
                        "checkpoint_cursor": 0,
                    },
                }
            )
            self.assertTrue(websocket.receive_json()["ok"])
            websocket.receive_json()
            websocket.receive_json()

            attach_required_response: dict = {}

            def _post_attach_required() -> None:
                attach_required_response["response"] = self.client.post(
                    f"/api/gateway/registrations/{gateway_id}/browser/sessions",
                    json={
                        "session_mode": "existing_session_attach",
                        "run_id": "run-browser-attach-required",
                        "trace_id": "trace-browser-attach-required",
                    },
                )

            attach_required_thread = threading.Thread(target=_post_attach_required)
            attach_required_thread.start()
            attach_required_frame = websocket.receive_json()
            self.assertEqual(attach_required_frame["payload"]["capability_id"], "browser.session.start")
            self.assertEqual(
                attach_required_frame["payload"]["arguments"]["session_mode"],
                "existing_session_attach",
            )
            self.assertEqual(
                attach_required_frame["payload"]["arguments"]["browser_metadata"]["browser_session_mode"],
                "existing_session_attach",
            )
            self.assertIsNone(
                attach_required_frame["payload"]["arguments"]["attach_endpoint_url"],
            )
            websocket.send_json(
                {
                    "kind": "response",
                    "id": attach_required_frame["id"],
                    "ok": True,
                    "ts": "2026-04-22T16:00:01Z",
                    "payload": {
                        "request_id": attach_required_frame["id"],
                        "capability_id": "browser.session.start",
                        "run_id": "run-browser-attach-required",
                        "result": {
                            "browser_session": {
                                "browser_session_id": "gbsess-attach-required",
                                "status": "attach_required",
                                "execution_target": "local_gateway",
                                "session_profile": "gateway_default",
                                "current_url": None,
                                "manual_takeover": False,
                                "resume_supported": False,
                                "reviewed_approval_required": False,
                                "reviewed_approved": False,
                                "immutable_plan_hash": "plan-attach-required",
                                "execution_binding": {"cwd": "/tmp/project"},
                                "checkpoint": {
                                    "next_action_index": 0,
                                    "session_profile": "gateway_default",
                                    "session_mode": "existing_session_attach",
                                    "attach_state": "attach_required",
                                },
                                "snapshot": {},
                                "metadata": {
                                    "browser_session_mode": "existing_session_attach",
                                    "browser_attach_state": "attach_required",
                                },
                            },
                            "status": "attach_required",
                        },
                    },
                }
            )
            attach_required_thread.join(timeout=5)
            self.assertEqual(attach_required_response["response"].status_code, 202)
            self.assertEqual(
                attach_required_response["response"].json()["browser_session"]["status"],
                "attach_required",
            )

            attach_response = self.client.post(
                f"/api/gateway/registrations/{gateway_id}/browser/sessions",
                json={
                    "session_mode": "existing_session_attach",
                    "attach_endpoint_url": "http://127.0.0.1:9222",
                    "interactive_actions": ["navigate"],
                    "run_id": "run-browser-attach-1",
                    "trace_id": "trace-browser-attach-1",
                },
            )
            self.assertEqual(attach_response.status_code, 202)
            attach_approval_payload = attach_response.json()
            self.assertEqual(attach_approval_payload["status"], "approval_required")
            self.assertTrue(str(attach_approval_payload["approval"]["approval_id"]).strip())
