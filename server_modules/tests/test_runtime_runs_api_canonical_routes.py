import sys
import threading
import types
import unittest
from fastapi import HTTPException

from server_modules import runtime_runs_api
from server_modules.api_contract import ApiAgentTurnRequest


class _FakeApp:
    def __init__(self) -> None:
        self.routes = {}

    def _register(self, method, path, **kwargs):
        def _decorator(fn):
            self.routes[(method, path)] = fn
            return fn

        return _decorator

    def get(self, path, **kwargs):
        return self._register("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self._register("POST", path, **kwargs)

    def delete(self, path, **kwargs):
        return self._register("DELETE", path, **kwargs)


class _FakeRequest:
    def __init__(self, payload=None, *, headers=None) -> None:
        self._payload = payload or {}
        self.headers = headers or {}

    async def json(self):
        return self._payload


class RuntimeRunsApiCanonicalRouteTests(unittest.TestCase):
    def _current_user(self):
        return {
            "user_id": "user-1",
            "email": "user@example.com",
            "auth_type": "bearer",
            "role": "owner",
            "is_admin": True,
            "workspace_ids": ["default", "finance"],
            "workspace_access": {
                "default": {
                    "workspace_id": "default",
                    "tenant_id": "default",
                    "role": "owner",
                    "tenant_role": "owner",
                    "capabilities": {"allow": [], "deny": []},
                    "tenant_capabilities": {"allow": [], "deny": []},
                    "workspace_capabilities": {"allow": [], "deny": []},
                    "dangerous_action_classes": {"allow": [], "deny": []},
                    "tenant_dangerous_action_classes": {"allow": [], "deny": []},
                    "workspace_dangerous_action_classes": {"allow": [], "deny": []},
                    "connectors": {"allow": [], "deny": []},
                    "tenant_connectors": {"allow": [], "deny": []},
                    "workspace_connectors": {"allow": [], "deny": []},
                    "machine_enrollment_scope": "workspace",
                    "trusted_owner_machine_ids": [],
                },
                "finance": {
                    "workspace_id": "finance",
                    "tenant_id": "default",
                    "role": "owner",
                    "tenant_role": "owner",
                    "capabilities": {"allow": [], "deny": []},
                    "tenant_capabilities": {"allow": [], "deny": []},
                    "workspace_capabilities": {"allow": [], "deny": []},
                    "dangerous_action_classes": {"allow": [], "deny": []},
                    "tenant_dangerous_action_classes": {"allow": [], "deny": []},
                    "workspace_dangerous_action_classes": {"allow": [], "deny": []},
                    "connectors": {"allow": [], "deny": []},
                    "tenant_connectors": {"allow": [], "deny": []},
                    "workspace_connectors": {"allow": [], "deny": []},
                    "machine_enrollment_scope": "workspace",
                    "trusted_owner_machine_ids": [],
                },
            },
        }

    def test_register_run_routes_adds_turn_and_runs(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = {}
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = lambda run_id: {}

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        original_register = runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api
        original_refresh = runtime_runs_api._refresh_server_exports
        original_turn = runtime_runs_api.execute_canonical_agent_turn
        original_run_services = runtime_runs_api._run_execution_services
        original_direct_chat_services = runtime_runs_api._direct_chat_execution_services
        original_stream_response = runtime_runs_api.build_agent_turn_stream_response
        original_stream_services = runtime_runs_api._direct_chat_stream_response_services
        original_late_export = runtime_runs_api._late_server_export
        original_privileged = runtime_runs_api._current_user_is_privileged
        original_extract_owner = runtime_runs_api._extract_run_owner_user_id
        original_list_live_runs = runtime_runs_api.run_state_repository.sync_list_live_runs
        original_list_live_runs_page = runtime_runs_api.run_state_repository.sync_list_live_runs_page
        original_resolve_run_start_turn_request = runtime_runs_api.resolve_run_start_turn_request
        original_list_threads = runtime_runs_api.thread_service.list_threads
        original_get_thread = runtime_runs_api.thread_service.get_thread
        try:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = lambda *args, **kwargs: None
            runtime_runs_api._refresh_server_exports = lambda: fake_server
            runtime_runs_api.execute_canonical_agent_turn = self._fake_agent_turn
            runtime_runs_api._run_execution_services = lambda: "run-services"
            runtime_runs_api._direct_chat_execution_services = lambda: "chat-services"
            runtime_runs_api.build_agent_turn_stream_response = self._fake_stream_response
            runtime_runs_api._direct_chat_stream_response_services = lambda: "stream-services"
            runtime_runs_api._current_user_is_privileged = lambda current_user: False
            runtime_runs_api._extract_run_owner_user_id = lambda item: str(item.get("owner_user_id") or "")
            runtime_runs_api.resolve_run_start_turn_request = self._fake_resolve_run_start_turn_request
            runtime_runs_api.thread_service.list_threads = self._fake_list_threads
            runtime_runs_api.thread_service.get_thread = self._fake_get_thread
            runtime_runs_api.run_state_repository.sync_list_live_runs = lambda: [
                {
                    "run_id": "run-live",
                    "status": "running",
                    "owner_user_id": "user-1",
                    "workspace_id": "default",
                    "created_at": "2026-04-06T09:00:00Z",
                    "updated_at": "2026-04-06T10:00:00Z",
                },
                {
                    "run_id": "run-live-finance",
                    "status": "running",
                    "owner_user_id": "user-1",
                    "workspace_id": "finance",
                    "created_at": "2026-04-06T09:10:00Z",
                    "updated_at": "2026-04-06T10:10:00Z",
                }
            ]
            runtime_runs_api.run_state_repository.sync_list_live_runs_page = (
                lambda limit=100, offset=0, workspace_id=None, states=None: [
                    item
                    for item in runtime_runs_api.run_state_repository.sync_list_live_runs()
                    if (not workspace_id or str(item.get("workspace_id") or "") == str(workspace_id))
                    and (not states or str(item.get("status") or "").lower() in {str(state).lower() for state in states})
                ][offset : offset + limit]
            )
            runtime_runs_api._late_server_export = lambda name: {
                "runs": {
                    "run-live": {
                        "run_id": "run-live",
                        "status": "running",
                        "owner_user_id": "user-1",
                        "workspace_id": "default",
                        "created_at": "2026-04-06T09:00:00Z",
                        "updated_at": "2026-04-06T10:00:00Z",
                    },
                    "run-live-finance": {
                        "run_id": "run-live-finance",
                        "status": "running",
                        "owner_user_id": "user-1",
                        "workspace_id": "finance",
                        "created_at": "2026-04-06T09:10:00Z",
                        "updated_at": "2026-04-06T10:10:00Z",
                    }
                },
                "RUN_HISTORY_LOCK": threading.Lock(),
                "RUN_HISTORY": [
                    {
                        "run_id": "run-archived",
                        "status": "completed",
                        "owner_user_id": "user-1",
                        "workspace_id": "default",
                        "created_at": "2026-04-06T08:00:00Z",
                        "updated_at": "2026-04-06T08:30:00Z",
                    },
                    {
                        "run_id": "run-archived-finance",
                        "status": "completed",
                        "owner_user_id": "user-1",
                        "workspace_id": "finance",
                        "created_at": "2026-04-06T07:00:00Z",
                        "updated_at": "2026-04-06T07:30:00Z",
                    }
                ],
                "_serialize_run_snapshot": lambda run_id, run: dict(run),
                "_history_item_matches": lambda item, workspace_id, status, pack_id: True,
                "_summarize_history_item": lambda item: {
                    "run_id": item.get("run_id"),
                    "status": item.get("status"),
                    "updated_at": item.get("updated_at"),
                    "created_at": item.get("created_at"),
                },
                "_parse_utc_ts": lambda value: __import__("datetime").datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None,
            }[name]

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)

            self.assertIn(("POST", "/turn"), app.routes)
            self.assertIn(("GET", "/runs"), app.routes)
            self.assertIn(("POST", "/sessions"), app.routes)
            self.assertIn(("GET", "/sessions/{session_id}"), app.routes)
            self.assertIn(("DELETE", "/sessions/{session_id}"), app.routes)
            self.assertIn(("GET", "/threads"), app.routes)
            self.assertIn(("GET", "/threads/{thread_id}"), app.routes)

            turn_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "thread_id": "thread-1",
                            "workspace_id": "default",
                            "session_id": "thread-1",
                            "channel": "web",
                            "actor": {"type": "user", "id": "user-1"},
                            "message": "hello",
                            "execution_mode": "durable",
                            "response_mode": "artifact",
                        }
                    ),
                    {
                        "thread_id": "thread-1",
                        "workspace_id": "default",
                        "session_id": "thread-1",
                        "channel": "web",
                        "actor": {"type": "user", "id": "user-1"},
                        "message": "hello",
                        "execution_mode": "durable",
                        "response_mode": "artifact",
                    },
                    current_user=self._current_user(),
                )
            )
            self.assertEqual(turn_payload.status, "accepted")
            self.assertEqual(turn_payload.run_id, "run-from-typed-turn")
            self.assertEqual(turn_payload.metadata["kind"], "durable_run")

            stream_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "workspace_id": "default",
                            "session_id": "thread-2",
                            "channel": "web",
                            "actor": {"type": "user", "id": "user-1"},
                            "message": "stream hello",
                        },
                        headers={"last-event-id": "evt-7"},
                    ),
                    {
                        "workspace_id": "default",
                        "session_id": "thread-2",
                        "channel": "web",
                        "actor": {"type": "user", "id": "user-1"},
                        "message": "stream hello",
                    },
                    current_user=self._current_user(),
                )
            )
            self.assertEqual(stream_payload["kind"], "stream")
            self.assertEqual(stream_payload["last_event_id"], "evt-7")
            self.assertEqual(stream_payload["services"], "stream-services")
            self.assertEqual(stream_payload["turn_request"].session_id, "thread-2")
            self.assertEqual(stream_payload["turn_request"].message, "stream hello")

            legacy_stream_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "workspace_id": "default",
                            "thread_id": "legacy-thread",
                            "channel": "web",
                            "message": "legacy hello",
                            "provider": "anthropic",
                            "prior_messages": [],
                        },
                        headers={"last-event-id": "evt-8"},
                    ),
                    {
                        "workspace_id": "default",
                        "thread_id": "legacy-thread",
                        "channel": "web",
                        "message": "legacy hello",
                        "provider": "anthropic",
                        "prior_messages": [],
                    },
                    current_user=self._current_user(),
                )
            )
            self.assertEqual(legacy_stream_payload["kind"], "stream")
            self.assertEqual(legacy_stream_payload["last_event_id"], "evt-8")
            self.assertEqual(legacy_stream_payload["turn_request"].session_id, "legacy-thread")
            self.assertEqual(legacy_stream_payload["chat_body"]["provider"], "anthropic")

            promoted_run_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "tenant_id": "default",
                            "workspace_id": "default",
                            "thread_id": "thread-serious",
                            "session_id": "thread-serious",
                            "channel": "web",
                            "actor": {"type": "user", "id": "user-1"},
                            "message": "Research the release blockers and draft a summary.",
                            "execution_mode": "sync",
                            "response_mode": "stream",
                        }
                    ),
                    {
                        "tenant_id": "default",
                        "workspace_id": "default",
                        "thread_id": "thread-serious",
                        "session_id": "thread-serious",
                        "channel": "web",
                        "actor": {"type": "user", "id": "user-1"},
                        "message": "Research the release blockers and draft a summary.",
                        "execution_mode": "sync",
                        "response_mode": "stream",
                    },
                    current_user=self._current_user(),
                )
            )
            self.assertEqual(promoted_run_payload.status, "accepted")
            self.assertEqual(promoted_run_payload.run_id, "run-from-typed-turn")
            self.assertEqual(promoted_run_payload.metadata["kind"], "durable_run")
            self.assertEqual(
                promoted_run_payload.metadata["turn_request"]["context_hints"]["metadata"]["primary_engine_reason"],
                "task_markers",
            )

            legacy_run_payload = self._run_async(
                app.routes[("POST", "/turn")](
                    _FakeRequest(
                        {
                            "engine": "orion",
                            "workspace_id": "default",
                            "user_goal": "legacy durable hello",
                            "metadata": {"trust_mode": "auto"},
                        }
                    ),
                    {
                        "engine": "orion",
                        "workspace_id": "default",
                        "user_goal": "legacy durable hello",
                        "metadata": {"trust_mode": "auto"},
                    },
                    current_user=self._current_user(),
                )
            )
            self.assertEqual(legacy_run_payload.status, "accepted")
            self.assertEqual(legacy_run_payload.run_id, "run-from-legacy-start")

            runs_payload = self._run_async(app.routes[("GET", "/runs")](current_user=self._current_user()))
            self.assertEqual(runs_payload["count"], 4)
            self.assertEqual(runs_payload["items"][0]["source"], "live")
            self.assertEqual(runs_payload["items"][1]["source"], "live")
            self.assertEqual(runs_payload["items"][2]["source"], "history")

            original_create_session = runtime_runs_api.session_service.create_session
            original_get_session = runtime_runs_api.session_service.get_session
            original_terminate_session = runtime_runs_api.session_service.terminate_session
            try:
                runtime_runs_api.session_service.create_session = self._fake_create_session
                runtime_runs_api.session_service.get_session = self._fake_get_session
                runtime_runs_api.session_service.terminate_session = self._fake_terminate_session

                session_payload = self._run_async(
                    app.routes[("POST", "/sessions")](
                        runtime_runs_api.ApiSessionRequest(
                            workspace_id="default",
                            tenant_id="default",
                            channel="web",
                            actor={"type": "user", "id": "user-1"},
                            metadata={"source": "test"},
                        ),
                        current_user=self._current_user(),
                    )
                )
                self.assertEqual(session_payload.session_id, "session-created")

                fetched_session = self._run_async(
                    app.routes[("GET", "/sessions/{session_id}")](
                        "session-created",
                        current_user=self._current_user(),
                    )
                )
                self.assertEqual(fetched_session.session_id, "session-created")

                deleted_session = self._run_async(
                    app.routes[("DELETE", "/sessions/{session_id}")](
                        "session-created",
                        current_user=self._current_user(),
                    )
                )
                self.assertTrue(deleted_session["ok"])

                thread_list = self._run_async(
                    app.routes[("GET", "/threads")](
                        workspace_id="default",
                        include_turns=True,
                        limit=25,
                        current_user=self._current_user(),
                    )
                )
                self.assertEqual(thread_list["count"], 1)
                self.assertEqual(thread_list["items"][0]["id"], "thread-1")
                self.assertEqual(thread_list["items"][0]["turns"][0]["role"], "user")

                thread_detail = self._run_async(
                    app.routes[("GET", "/threads/{thread_id}")](
                        "thread-1",
                        current_user=self._current_user(),
                    )
                )
                self.assertEqual(thread_detail["id"], "thread-1")
                self.assertEqual(thread_detail["turns"][1]["role"], "assistant")
            finally:
                runtime_runs_api.session_service.create_session = original_create_session
                runtime_runs_api.session_service.get_session = original_get_session
                runtime_runs_api.session_service.terminate_session = original_terminate_session
        finally:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = original_register
            runtime_runs_api._refresh_server_exports = original_refresh
            runtime_runs_api.execute_canonical_agent_turn = original_turn
            runtime_runs_api._run_execution_services = original_run_services
            runtime_runs_api._direct_chat_execution_services = original_direct_chat_services
            runtime_runs_api.build_agent_turn_stream_response = original_stream_response
            runtime_runs_api._direct_chat_stream_response_services = original_stream_services
            runtime_runs_api._late_server_export = original_late_export
            runtime_runs_api._current_user_is_privileged = original_privileged
            runtime_runs_api._extract_run_owner_user_id = original_extract_owner
            runtime_runs_api.resolve_run_start_turn_request = original_resolve_run_start_turn_request
            runtime_runs_api.thread_service.list_threads = original_list_threads
            runtime_runs_api.thread_service.get_thread = original_get_thread
            runtime_runs_api.run_state_repository.sync_list_live_runs = original_list_live_runs
            runtime_runs_api.run_state_repository.sync_list_live_runs_page = original_list_live_runs_page
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

    def test_list_approvals_filters_resolved_items_and_projects_visibility_fields(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = {}
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = lambda run_id: {}

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        original_register = runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api
        original_refresh = runtime_runs_api._refresh_server_exports
        original_privileged = runtime_runs_api._current_user_is_privileged
        original_extract_owner = runtime_runs_api._extract_run_owner_user_id
        original_list_pending_approvals = runtime_runs_api.run_state_repository.sync_list_pending_approvals
        original_list_pending_approvals_page = runtime_runs_api.run_state_repository.sync_list_pending_approvals_page
        try:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = lambda *args, **kwargs: None
            runtime_runs_api._refresh_server_exports = lambda: fake_server
            runtime_runs_api._current_user_is_privileged = lambda current_user: False
            runtime_runs_api._extract_run_owner_user_id = lambda item: str(item.get("owner_user_id") or "")
            runtime_runs_api.run_state_repository.sync_list_pending_approvals = lambda limit=100: [
                {
                    "approval_id": "approval-1",
                    "run_id": "run-pending",
                    "owner_user_id": "user-1",
                    "workspace_id": "default",
                    "status": "requested",
                    "prompt": "Approve sending the summary by email.",
                    "requested_at": "2026-04-06T10:00:00Z",
                    "expires_at": "2026-04-06T10:05:00Z",
                    "correlation_id": "corr-1",
                    "target": "email",
                    "actions": ["send_email"],
                    "labels": ["email"],
                    "capabilities": ["smtp.send"],
                    "agent_role": "sage",
                    "email_preview": {
                        "recipient": "demo@example.com",
                        "subject": "AI summary",
                        "body_preview": "Top three paper findings.",
                    },
                    "metadata": {
                        "kind": "email_review",
                        "target": "email",
                        "approval_actions": ["send_email"],
                        "approval_labels": ["email"],
                        "approval_capabilities": ["smtp.send"],
                        "email_preview": {
                            "recipient": "demo@example.com",
                            "subject": "AI summary",
                            "body_preview": "Top three paper findings.",
                        },
                    },
                },
                {
                    "approval_id": "approval-2",
                    "run_id": "run-resolved",
                    "owner_user_id": "user-1",
                    "workspace_id": "default",
                    "status": "resolved",
                    "prompt": "Already handled.",
                },
            ]
            runtime_runs_api.run_state_repository.sync_list_pending_approvals_page = (
                lambda limit=100, offset=0, workspace_id=None: [
                    item
                    for item in runtime_runs_api.run_state_repository.sync_list_pending_approvals(limit=100)
                    if (not workspace_id or str(item.get("workspace_id") or "") == str(workspace_id))
                ][offset : offset + limit]
            )

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)

            payload = self._run_async(
                app.routes[("GET", "/approvals")](
                    workspace_id="default",
                    current_user=self._current_user(),
                )
            )
        finally:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = original_register
            runtime_runs_api._refresh_server_exports = original_refresh
            runtime_runs_api._current_user_is_privileged = original_privileged
            runtime_runs_api._extract_run_owner_user_id = original_extract_owner
            runtime_runs_api.run_state_repository.sync_list_pending_approvals = original_list_pending_approvals
            runtime_runs_api.run_state_repository.sync_list_pending_approvals_page = original_list_pending_approvals_page
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

        self.assertEqual(payload["count"], 1)
        item = payload["items"][0]
        self.assertEqual(item["approval_id"], "approval-1")
        self.assertEqual(item["owner_user_id"], "user-1")
        self.assertEqual(item["prompt"], "Approve sending the summary by email.")
        self.assertEqual(item["scope"], "once")
        self.assertFalse(item["reusable"])
        self.assertEqual(item["target"], "email")
        self.assertEqual(item["actions"], ["send_email"])
        self.assertEqual(item["labels"], ["email"])
        self.assertEqual(item["capabilities"], ["smtp.send"])
        self.assertEqual(item["agent_role"], "sage")
        self.assertEqual(item["email_preview"]["recipient"], "demo@example.com")
        self.assertEqual(item["email_preview"]["subject"], "AI summary")
        self.assertEqual(item["target"], "email")

    def test_list_approvals_rejects_free_workspace_plan(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = {}
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = lambda run_id: {}

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        original_register = runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api
        original_refresh = runtime_runs_api._refresh_server_exports
        try:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = lambda *args, **kwargs: None
            runtime_runs_api._refresh_server_exports = lambda: fake_server

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)
            handler = app.routes[("GET", "/approvals")]

            with unittest.mock.patch(
                "server_modules.runtime_runs_api.entitlements_service.workspace_entitlement_payload_for_workspace_id",
                return_value={"capabilities": {"approvals_enabled": False}},
            ):
                with self.assertRaises(HTTPException) as exc:
                    self._run_async(
                        handler(
                            workspace_id="default",
                            current_user=self._current_user(),
                        )
                    )
        finally:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = original_register
            runtime_runs_api._refresh_server_exports = original_refresh
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(exc.exception.detail, "Approvals are not included in this workspace plan.")

    def test_list_runs_applies_workspace_history_window(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = {}
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = lambda run_id: {}
        fake_server.RUN_HISTORY_LOCK = threading.Lock()
        fake_server.RUN_HISTORY = [
            {
                "run_id": "run-old",
                "workspace_id": "default",
                "owner_user_id": "user-1",
                "status": "completed",
                "updated_at": "2026-03-20T00:00:00Z",
                "created_at": "2026-03-20T00:00:00Z",
            },
            {
                "run_id": "run-new",
                "workspace_id": "default",
                "owner_user_id": "user-1",
                "status": "completed",
                "updated_at": "2026-04-08T00:00:00Z",
                "created_at": "2026-04-08T00:00:00Z",
            },
        ]
        fake_server._serialize_run_snapshot = lambda run_id, run: dict(run)
        fake_server._summarize_history_item = lambda item: dict(item)
        fake_server._parse_utc_ts = lambda value: runtime_runs_api.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        fake_server._history_item_matches = lambda item, workspace_id, status, pack_id: (
            (not workspace_id or str(item.get("workspace_id") or "") == str(workspace_id))
            and (not status or str(item.get("status") or "") == str(status))
        )

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        original_register = runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api
        original_refresh = runtime_runs_api._refresh_server_exports
        original_list_live_runs = runtime_runs_api.run_state_repository.sync_list_live_runs
        original_list_live_runs_page = runtime_runs_api.run_state_repository.sync_list_live_runs_page
        try:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = lambda *args, **kwargs: None
            runtime_runs_api._refresh_server_exports = lambda: fake_server
            runtime_runs_api.run_state_repository.sync_list_live_runs = lambda: []
            runtime_runs_api.run_state_repository.sync_list_live_runs_page = lambda limit=100, offset=0, workspace_id=None, states=None: []

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)
            handler = app.routes[("GET", "/runs")]

            with unittest.mock.patch(
                "server_modules.runtime_runs_api.entitlements_service.workspace_entitlement_payload_for_workspace_id",
                return_value={"capabilities": {"history_window_days": 7}},
            ), unittest.mock.patch(
                "server_modules.runtime_runs_api._utc_now",
                return_value=runtime_runs_api.datetime(2026, 4, 11, tzinfo=runtime_runs_api.timezone.utc),
            ):
                payload = self._run_async(
                    handler(
                        workspace_id="default",
                        current_user=self._current_user(),
                    )
                )
        finally:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = original_register
            runtime_runs_api._refresh_server_exports = original_refresh
            runtime_runs_api.run_state_repository.sync_list_live_runs = original_list_live_runs
            runtime_runs_api.run_state_repository.sync_list_live_runs_page = original_list_live_runs_page
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

        self.assertEqual([item["run_id"] for item in payload["items"]], ["run-new"])

    def test_threads_apply_workspace_history_window(self):
        fake_server = types.ModuleType("server")
        fake_server.require_api_key = object()
        fake_server.require_admin_api_key = object()
        fake_server.ORION_SINGLE_AGENT_MODE = False
        fake_server.runs = {}
        fake_server.iter_logs_for_run = lambda run_id: []
        fake_server._get_replay_payload = lambda run_id: {}

        async def _fake_list_threads(*, workspace_id, tenant_id=None, owner_user_id=None, include_turns=False, limit=50):
            turns_new = [
                {
                    "id": "turn-old",
                    "tenant_id": tenant_id or "default",
                    "workspace_id": workspace_id,
                    "thread_id": "thread-new",
                    "role": "user",
                    "content": "old",
                    "created_at": "2026-04-01T00:00:00Z",
                    "updated_at": "2026-04-01T00:00:00Z",
                },
                {
                    "id": "turn-new",
                    "tenant_id": tenant_id or "default",
                    "workspace_id": workspace_id,
                    "thread_id": "thread-new",
                    "role": "assistant",
                    "content": "new",
                    "created_at": "2026-04-10T00:00:00Z",
                    "updated_at": "2026-04-10T00:00:00Z",
                },
            ] if include_turns else []
            return [
                {
                    "id": "thread-old",
                    "tenant_id": tenant_id or "default",
                    "workspace_id": workspace_id,
                    "owner_user_id": owner_user_id or "user-1",
                    "channel": "web",
                    "title": "old thread",
                    "status": "active",
                    "metadata": {},
                    "created_at": "2026-04-01T00:00:00Z",
                    "updated_at": "2026-04-01T00:00:00Z",
                    "last_turn_at": "2026-04-01T00:00:00Z",
                    "turns": [],
                },
                {
                    "id": "thread-new",
                    "tenant_id": tenant_id or "default",
                    "workspace_id": workspace_id,
                    "owner_user_id": owner_user_id or "user-1",
                    "channel": "web",
                    "title": "new thread",
                    "status": "active",
                    "metadata": {},
                    "created_at": "2026-04-10T00:00:00Z",
                    "updated_at": "2026-04-10T00:00:00Z",
                    "last_turn_at": "2026-04-10T00:00:00Z",
                    "turns": turns_new,
                },
            ]

        async def _fake_get_thread(thread_id, *, tenant_id, workspace_id, include_turns=True):
            for item in await _fake_list_threads(
                workspace_id=workspace_id,
                tenant_id=tenant_id,
                owner_user_id="user-1",
                include_turns=include_turns,
                limit=10,
            ):
                if item.get("id") == thread_id:
                    return item
            return None

        previous_server = sys.modules.get("server")
        sys.modules["server"] = fake_server
        original_register = runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api
        original_refresh = runtime_runs_api._refresh_server_exports
        original_list_threads = runtime_runs_api.thread_service.list_threads
        original_get_thread = runtime_runs_api.thread_service.get_thread
        try:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = lambda *args, **kwargs: None
            runtime_runs_api._refresh_server_exports = lambda: fake_server
            runtime_runs_api.thread_service.list_threads = _fake_list_threads
            runtime_runs_api.thread_service.get_thread = _fake_get_thread

            app = _FakeApp()
            runtime_runs_api.register_run_routes(app)
            list_handler = app.routes[("GET", "/threads")]
            detail_handler = app.routes[("GET", "/threads/{thread_id}")]

            with unittest.mock.patch(
                "server_modules.runtime_runs_api.entitlements_service.workspace_entitlement_payload_for_workspace_id",
                return_value={"capabilities": {"history_window_days": 7}},
            ), unittest.mock.patch(
                "server_modules.runtime_runs_api._utc_now",
                return_value=runtime_runs_api.datetime(2026, 4, 11, tzinfo=runtime_runs_api.timezone.utc),
            ):
                payload = self._run_async(
                    list_handler(
                        workspace_id="default",
                        include_turns=True,
                        current_user=self._current_user(),
                    )
                )
                detail = self._run_async(
                    detail_handler(
                        "thread-new",
                        current_user=self._current_user(),
                    )
                )
                with self.assertRaises(HTTPException) as exc:
                    self._run_async(
                        detail_handler(
                            "thread-old",
                            current_user=self._current_user(),
                        )
                    )
        finally:
            runtime_runs_api.runtime_route_registration_service.register_runtime_run_routes_from_api = original_register
            runtime_runs_api._refresh_server_exports = original_refresh
            runtime_runs_api.thread_service.list_threads = original_list_threads
            runtime_runs_api.thread_service.get_thread = original_get_thread
            if previous_server is None:
                sys.modules.pop("server", None)
            else:
                sys.modules["server"] = previous_server

        self.assertEqual([item["id"] for item in payload["items"]], ["thread-new"])
        self.assertEqual([item["id"] for item in detail["turns"]], ["turn-new"])
        self.assertEqual(exc.exception.status_code, 404)

    async def _fake_agent_turn(self, **kwargs):
        turn_request = kwargs.get("turn_request")
        if kwargs.get("run_request") is not None:
            return {
                "kind": "durable_run",
                "result": {
                    "status": "accepted",
                    "run_id": "run-from-legacy-start",
                    "route": {"selected": "cloud"},
                    "created_run": {
                        "run_id": "run-from-legacy-start",
                        "status": "accepted",
                    },
                },
            }
        if getattr(turn_request, "execution_mode", None) == "durable":
            return {
                "kind": "durable_run",
                "result": {
                    "status": "accepted",
                    "run_id": "run-from-typed-turn",
                    "route": {"selected": "cloud"},
                    "created_run": {
                        "run_id": "run-from-typed-turn",
                        "status": "accepted",
                    },
                },
            }
        return {
            "kind": "direct_chat_stream",
            "workspace_id": "default",
            "session_key": "session-1",
            "thread_id": "thread-1",
            "client_request_id": "req-1",
        }

    async def _fake_stream_response(self, **kwargs):
        return {
            "kind": "stream",
            "turn_request": kwargs["turn_request"],
            "chat_body": kwargs.get("chat_body"),
            "last_event_id": kwargs["last_event_id"],
            "services": kwargs["services"],
        }

    def _fake_resolve_run_start_turn_request(self, *, current_user, body, stamp_request_owner_fn):
        request = body
        turn_request = runtime_runs_api.request_body_to_turn_request(
            ApiAgentTurnRequest(
                tenant_id="default",
                workspace_id=str(getattr(request, "workspace_id", None) or "default"),
                session_id="legacy-run-start-session",
                channel="web",
                actor={"type": "user", "id": "user-1"},
                message=str(getattr(request, "user_goal", None) or ""),
                execution_mode="durable",
                response_mode="artifact",
                context_hints={
                    "engine": str(getattr(request, "engine", None) or "orion"),
                    "metadata": getattr(request, "metadata", None) or {},
                },
            )
        )
        return types.SimpleNamespace(request=request, turn_request=turn_request)

    async def _fake_create_session(self, *args, **kwargs):
        return "session-created"

    async def _fake_get_session(self, session_id):
        return {
            "session_id": session_id,
            "workspace_id": "default",
            "tenant_id": "default",
            "channel": "web",
            "actor": {"type": "user", "id": "user-1"},
            "created_at": "2026-04-06T00:00:00Z",
            "expires_at": "2026-04-07T00:00:00Z",
            "metadata": {"source": "test"},
            "status": "active",
        }

    async def _fake_terminate_session(self, session_id):
        return None

    async def _fake_list_threads(self, *, workspace_id, tenant_id=None, owner_user_id=None, include_turns=False, limit=50):
        return [
            {
                "id": "thread-1",
                "tenant_id": tenant_id or "default",
                "workspace_id": workspace_id,
                "owner_user_id": owner_user_id or "user-1",
                "channel": "web",
                "title": "hello",
                "status": "active",
                "metadata": {},
                "created_at": "2026-04-06T00:00:00Z",
                "updated_at": "2026-04-06T00:05:00Z",
                "last_turn_at": "2026-04-06T00:05:00Z",
                "turns": [
                    {
                        "id": "turn-1",
                        "tenant_id": tenant_id or "default",
                        "workspace_id": workspace_id,
                        "thread_id": "thread-1",
                        "role": "user",
                        "content": "hello",
                        "created_at": "2026-04-06T00:00:00Z",
                        "updated_at": "2026-04-06T00:00:00Z",
                    },
                    {
                        "id": "turn-2",
                        "tenant_id": tenant_id or "default",
                        "workspace_id": workspace_id,
                        "thread_id": "thread-1",
                        "role": "assistant",
                        "content": "hi",
                        "created_at": "2026-04-06T00:05:00Z",
                        "updated_at": "2026-04-06T00:05:00Z",
                    },
                ] if include_turns else [],
            }
        ]

    async def _fake_get_thread(self, thread_id, *, tenant_id, workspace_id, include_turns=True):
        items = await self._fake_list_threads(workspace_id="default", tenant_id="default", owner_user_id="user-1", include_turns=include_turns, limit=1)
        return items[0] if thread_id == "thread-1" else None

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
