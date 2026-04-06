from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from server_modules.connectors import autopilot_runtime_exports as autopilot_connectors
from server_modules import direct_chat_runtime_exports as operator_chat, runtime_config, runtime_runs_api, runs_core, runs_engine
from server_modules.connectors import discord_connector
from server_modules.runtime_models import RunStartRequest


class _AutoCompleteQueue:
    def __init__(self, run: dict):
        self._run = run
        self.items: list[object] = []

    def put(self, item: object) -> None:
        self.items.append(item)
        self._run["status"] = "completed"
        self._run["result"] = "Done"
        self._run["result_data"] = {"summary": "Done"}


class _PassiveQueue:
    def __init__(self):
        self.items: list[object] = []

    def put(self, item: object) -> None:
        self.items.append(item)


class AgentMachineModeTests(unittest.TestCase):
    def test_agent_machine_full_trust_enabled_requires_matching_owner(self):
        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                self.assertTrue(runtime_config.agent_machine_full_trust_enabled("user-123"))
                self.assertFalse(runtime_config.agent_machine_full_trust_enabled("user-456"))
                self.assertFalse(runtime_config.agent_machine_full_trust_enabled(""))

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "personal"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                self.assertFalse(runtime_config.agent_machine_full_trust_enabled("user-123"))

    def test_agent_machine_inherited_owner_user_id_only_falls_back_in_agent_mode(self):
        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                self.assertEqual(runtime_config.agent_machine_inherited_owner_user_id(""), "user-123")
                self.assertEqual(runtime_config.agent_machine_inherited_owner_user_id("user-999"), "user-999")

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "personal"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                self.assertEqual(runtime_config.agent_machine_inherited_owner_user_id(""), "")

    def test_wait_for_human_decision_bypasses_prompt_for_matching_owner(self):
        run_id = "agent-machine-run"
        previous = runs_engine.runs.get(run_id)
        runs_engine.runs[run_id] = {
            "context": {"metadata": {"owner_user_id": "user-123"}},
            "logs": [],
        }
        try:
            with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
                with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                    with patch("server_modules.runs_core.emit_log") as emit_log_mock:
                        with patch("server_modules.runs_engine.wait_for_human_response") as wait_mock:
                            approved = runs_engine.wait_for_human_decision(run_id, "Confirm send")
        finally:
            if previous is None:
                runs_engine.runs.pop(run_id, None)
            else:
                runs_engine.runs[run_id] = previous

        self.assertTrue(approved)
        wait_mock.assert_not_called()
        emit_log_mock.assert_called_once()

    def test_direct_tool_approval_payload_skips_prompt_for_matching_owner(self):
        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                payload = operator_chat._build_direct_tool_approval_response(
                    tool_calls=[
                        {
                            "name": "shell__exec",
                            "arguments": {"command": "rm -rf /tmp/demo"},
                        }
                    ],
                    tool_capabilities=[],
                    session_ctx={"user_id": "user-123"},
                )

        self.assertIsNone(payload)

    def test_direct_tool_approval_payload_still_requires_prompt_for_owner_mismatch(self):
        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                payload = operator_chat._build_direct_tool_approval_response(
                    tool_calls=[
                        {
                            "name": "shell__exec",
                            "arguments": {"command": "rm -rf /tmp/demo"},
                        }
                    ],
                    tool_capabilities=[],
                    session_ctx={"user_id": "user-456"},
                )

        self.assertIsNotNone(payload)

    def test_runtime_runs_api_threads_user_id_into_direct_chat_session_context(self):
        captured: dict[str, object] = {}

        def _fake_reply(**kwargs):
            captured.update(kwargs)
            return {"reply": "ok"}

        with patch("server_modules.runtime_runs_api._direct_chat_session_manager_enabled", return_value=False):
            with patch("server_modules.direct_chat_runtime_entry_facade_service.build_direct_operator_reply", side_effect=_fake_reply):
                payload = runtime_runs_api._build_direct_chat_event_producer(
                    current_user={"user_id": "user-123"},
                    body={},
                    message="hello",
                    workspace_id="default",
                    session_key="session-1",
                    thread_id="thread-1",
                    client_request_id="request-1",
                )

        self.assertEqual(payload["reply"], "ok")
        self.assertEqual((captured.get("session_ctx") or {}).get("user_id"), "user-123")
        turn_request = captured.get("agent_turn_request")
        self.assertEqual(getattr(turn_request, "workspace_id", None), "default")
        self.assertEqual(getattr(turn_request, "session_id", None), "thread-1")

    def test_runs_core_create_run_from_request_bypasses_local_confirmation_for_agent_machine(self):
        request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="Read a signed-in page",
            metadata={"outcome_pack": "local-execution-v1", "execution_target": "local_companion"},
        )
        precheck = {
            "blocked_count": 0,
            "items": [
                {
                    "tool_id": "browser_automation",
                    "decision": "approval_required",
                    "execution_decision": "approval_required",
                    "reason": "session-backed interactive browser automation requires approval",
                }
            ],
            "allowed": [],
            "require_confirmation": ["browser_automation"],
            "require_confirmation_count": 1,
            "approval_required": ["browser_automation"],
            "approval_required_count": 1,
            "capability_ids": ["browser_automation"],
            "browser_automation_policy": {"reviewed_approval_required": True},
        }
        prepare_payload = {
            "engine": "orion",
            "metadata": {
                "outcome_pack": "local-execution-v1",
                "execution_target": "local_companion",
            },
            "workflow_snapshot": None,
        }

        with patch("server_modules.runs_core._prepare_run_start_request", return_value=prepare_payload):
            with patch("server_modules.runs_core.decide_execution_target", return_value={"selected": "local_companion"}, create=True):
                with patch("server_modules.runs_core.apply_execution_route_metadata", side_effect=lambda metadata, route: metadata, create=True):
                    with patch("server_modules.runs_core.build_doctor_run_gate_from_snapshot", return_value={"blocking": False}):
                        with patch("server_modules.runs_execution._compute_tool_policy_precheck", return_value=precheck):
                            with patch("server_modules.runs_execution.create_run", return_value="run-agent-local") as create_run_mock:
                                with patch.object(runs_core, "agent_machine_inherited_owner_user_id", return_value="user-123"):
                                    with patch.object(runs_core, "agent_machine_full_trust_enabled", return_value=True):
                                        result = runs_core._create_run_from_request(request)

        self.assertEqual(result["status"], "starting")
        self.assertIsNone(result["pending_approval"])
        create_kwargs = create_run_mock.call_args.kwargs
        self.assertFalse(create_kwargs["defer_local_enqueue"])
        metadata = create_kwargs["context"]["metadata"]
        self.assertEqual(metadata["owner_user_id"], "user-123")
        self.assertEqual(metadata["tool_policy_precheck"]["approval_required_count"], 0)
        self.assertTrue(metadata["browser_reviewed_approved"])
        self.assertNotIn("local_execution_waiting_confirmation", metadata)
        self.assertNotIn("local_execution_waiting_approval", metadata)

    def test_runs_core_create_run_from_request_keeps_local_confirmation_for_owner_mismatch(self):
        request = RunStartRequest(
            engine="orion",
            workspace_id="default",
            user_goal="Read a signed-in page",
            metadata={"outcome_pack": "local-execution-v1", "execution_target": "local_companion"},
        )
        precheck = {
            "blocked_count": 0,
            "items": [
                {
                    "tool_id": "browser_automation",
                    "decision": "approval_required",
                    "execution_decision": "approval_required",
                    "reason": "session-backed interactive browser automation requires approval",
                }
            ],
            "allowed": [],
            "require_confirmation": ["browser_automation"],
            "require_confirmation_count": 1,
            "approval_required": ["browser_automation"],
            "approval_required_count": 1,
            "capability_ids": ["browser_automation"],
            "browser_automation_policy": {"reviewed_approval_required": True},
        }
        prepare_payload = {
            "engine": "orion",
            "metadata": {
                "outcome_pack": "local-execution-v1",
                "execution_target": "local_companion",
            },
            "workflow_snapshot": None,
        }

        with patch("server_modules.runs_core._prepare_run_start_request", return_value=prepare_payload):
            with patch("server_modules.runs_core.decide_execution_target", return_value={"selected": "local_companion"}, create=True):
                with patch("server_modules.runs_core.apply_execution_route_metadata", side_effect=lambda metadata, route: metadata, create=True):
                    with patch("server_modules.runs_core.build_doctor_run_gate_from_snapshot", return_value={"blocking": False}):
                        with patch("server_modules.runs_execution._compute_tool_policy_precheck", return_value=precheck):
                            with patch("server_modules.runs_execution.create_run", return_value="run-personal-local") as create_run_mock:
                                with patch("server_modules.runs_core._begin_run_pending_confirmation", return_value={"approval_id": "approval-local-1"}):
                                    with patch.object(runs_core, "agent_machine_inherited_owner_user_id", return_value="user-456"):
                                        with patch.object(runs_core, "agent_machine_full_trust_enabled", return_value=False):
                                            result = runs_core._create_run_from_request(request)

        self.assertEqual(result["status"], "waiting_for_input")
        self.assertEqual(result["pending_approval"]["approval_id"], "approval-local-1")
        create_kwargs = create_run_mock.call_args.kwargs
        self.assertTrue(create_kwargs["defer_local_enqueue"])
        metadata = create_kwargs["context"]["metadata"]
        self.assertTrue(metadata["local_execution_waiting_confirmation"])
        self.assertTrue(metadata["local_execution_waiting_approval"])
        self.assertNotIn("browser_reviewed_approved", metadata)

    def test_wait_for_run_terminal_status_auto_approves_matching_owner_confirmation(self):
        run_id = "run-autopilot-auto-approve"
        run = {
            "status": "waiting_for_input",
            "context": {"metadata": {"owner_user_id": "user-123"}},
            "pending_confirmation": {"approval_id": "approval-1", "source": "runtime_wait"},
        }
        run["input_queue"] = _AutoCompleteQueue(run)

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                autopilot_connectors._init()
                dispatch_service = autopilot_connectors._telegram_run_dispatch_service()
                with patch.object(autopilot_connectors, "runs", {run_id: run}, create=True):
                    with patch.object(dispatch_service, "time_now", side_effect=[0, 0, 1]):
                        with patch.object(dispatch_service, "sleep", return_value=None):
                            result = dispatch_service.wait_for_terminal_status(run_id)

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["auto_approved"])
        self.assertEqual(run["input_queue"].items, [{"approval_id": "approval-1", "decision": "proceed"}])

    def test_wait_for_run_terminal_status_does_not_auto_approve_owner_mismatch(self):
        run_id = "run-autopilot-owner-mismatch"
        passive_queue = _PassiveQueue()
        run = {
            "status": "waiting_for_input",
            "context": {"metadata": {"owner_user_id": "user-456"}},
            "pending_confirmation": {"approval_id": "approval-2", "source": "runtime_wait"},
            "input_queue": passive_queue,
        }

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                autopilot_connectors._init()
                dispatch_service = autopilot_connectors._telegram_run_dispatch_service()
                with patch.object(autopilot_connectors, "runs", {run_id: run}, create=True):
                    with patch.object(dispatch_service, "time_now", side_effect=[0, 0, 31, 31, 31]):
                        with patch.object(dispatch_service, "sleep", return_value=None):
                            result = dispatch_service.wait_for_terminal_status(run_id, timeout_seconds=30)

        self.assertEqual(result["status"], "timeout")
        self.assertFalse(result["auto_approved"])
        self.assertEqual(passive_queue.items, [])

    def test_wait_for_run_terminal_status_does_not_auto_approve_workflow_human_node(self):
        run_id = "run-autopilot-human-node"
        passive_queue = _PassiveQueue()
        run = {
            "status": "waiting_for_input",
            "context": {"metadata": {"owner_user_id": "user-123"}},
            "pending_confirmation": {"approval_id": "approval-3", "source": "workflow_human_node"},
            "input_queue": passive_queue,
        }

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                autopilot_connectors._init()
                dispatch_service = autopilot_connectors._telegram_run_dispatch_service()
                with patch.object(autopilot_connectors, "runs", {run_id: run}, create=True):
                    with patch.object(dispatch_service, "time_now", side_effect=[0, 0, 31, 31, 31]):
                        with patch.object(dispatch_service, "sleep", return_value=None):
                            result = dispatch_service.wait_for_terminal_status(run_id, timeout_seconds=30)

        self.assertEqual(result["status"], "timeout")
        self.assertFalse(result["auto_approved"])
        self.assertEqual(passive_queue.items, [])

    def test_telegram_autopilot_run_inherits_machine_owner(self):
        captured: dict[str, object] = {}

        def _fake_execute_system_run_start_request(request, **kwargs):
            captured["request"] = request
            captured["execute_kwargs"] = kwargs
            return {"run_id": "run-telegram-1", "route": {"selected": "cloud"}}

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                autopilot_connectors._init()
                with patch("server_modules.connectors.autopilot_runtime_exports.decide_execution_target", return_value={"selected": "cloud"}, create=True):
                    with patch("server_modules.connectors.autopilot_runtime_exports.apply_execution_route_metadata", side_effect=lambda metadata, route: metadata, create=True):
                        with patch("server_modules.connectors.autopilot_runtime_exports.execute_system_run_start_request_via_turn_runtime", side_effect=_fake_execute_system_run_start_request, create=True):
                            with patch("server_modules.connectors.autopilot_runtime_exports._stamp_request_owner", side_effect=lambda req, current_user: req, create=True):
                                with patch("server_modules.connectors.autopilot_runtime_exports._run_execution_services", side_effect=lambda: object(), create=True):
                                    autopilot_connectors._autopilot_run_entry_service().create_telegram_run(
                                        goal="Investigate this issue",
                                        workspace_id="default",
                                        connector_id="cred-telegram",
                                        chat_id="123",
                                        sender_id="456",
                                        update_id=1,
                                        media_max_items=autopilot_connectors.ORION_TELEGRAM_MEDIA_MAX_ITEMS,
                                        trust_mode_value=autopilot_connectors.ORION_TELEGRAM_AUTOPILOT_TRUST_MODE,
                                        execution_target_value=autopilot_connectors.ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET,
                                    )

        self.assertEqual(captured["request"].metadata["owner_user_id"], "user-123")

    def test_whatsapp_autopilot_run_inherits_machine_owner(self):
        captured: dict[str, object] = {}

        def _fake_execute_system_run_start_request(request, **kwargs):
            captured["request"] = request
            captured["execute_kwargs"] = kwargs
            return {"run_id": "run-whatsapp-1", "route": {"selected": "cloud"}}

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                autopilot_connectors._init()
                with patch("server_modules.connectors.autopilot_runtime_exports.decide_execution_target", return_value={"selected": "cloud"}, create=True):
                    with patch("server_modules.connectors.autopilot_runtime_exports.apply_execution_route_metadata", side_effect=lambda metadata, route: metadata, create=True):
                        with patch("server_modules.connectors.autopilot_runtime_exports.execute_system_run_start_request_via_turn_runtime", side_effect=_fake_execute_system_run_start_request, create=True):
                            with patch("server_modules.connectors.autopilot_runtime_exports._stamp_request_owner", side_effect=lambda req, current_user: req, create=True):
                                with patch("server_modules.connectors.autopilot_runtime_exports._run_execution_services", side_effect=lambda: object(), create=True):
                                    autopilot_connectors._autopilot_run_entry_service().create_whatsapp_run(
                                        goal="Handle this request",
                                        workspace_id="default",
                                        connector_id="cred-whatsapp",
                                        from_number="whatsapp:+15551230000",
                                        to_number="whatsapp:+15559870000",
                                        message_sid="SM123",
                                        account_sid="AC123",
                                        trust_mode_value=autopilot_connectors.ORION_WHATSAPP_AUTOPILOT_TRUST_MODE,
                                        execution_target_value=autopilot_connectors.ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET,
                                    )

        self.assertEqual(captured["request"].metadata["owner_user_id"], "user-123")

    def test_discord_inbound_run_inherits_machine_owner(self):
        parsed = discord_connector.parse_inbound_event(
            {
                "t": "MESSAGE_CREATE",
                "d": {
                    "id": "msg-1",
                    "channel_id": "123",
                    "guild_id": "456",
                    "content": "<@999> please investigate this",
                    "author": {"id": "321", "username": "alice"},
                    "mentions": [{"id": "999"}],
                },
            }
        )
        created: list[dict[str, object]] = []

        def _fake_create_run(*, context):
            created.append(context)
            return "run-discord-1"

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                result = discord_connector.dispatch_inbound_event(
                    parsed,
                    connector_entry={"id": "cred-discord", "workspace_id": "default", "metadata": {}},
                    credentials={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"},
                    append_event_fn=None,
                    create_run_fn=_fake_create_run,
                )

        self.assertTrue(result["triggered"])
        self.assertEqual(created[0]["metadata"]["owner_user_id"], "user-123")

    def test_discord_inbound_canonical_run_start_inherits_machine_owner(self):
        parsed = discord_connector.parse_inbound_event(
            {
                "t": "MESSAGE_CREATE",
                "d": {
                    "id": "msg-1",
                    "channel_id": "123",
                    "guild_id": "456",
                    "content": "<@999> please investigate this",
                    "author": {"id": "321", "username": "alice"},
                    "mentions": [{"id": "999"}],
                },
            }
        )
        captured: dict[str, object] = {}

        def _fake_start_run(request):
            captured["request"] = request
            return {"run_id": "run-discord-2"}

        with patch.object(runtime_config, "AGENT_MACHINE_MODE", "agent"):
            with patch.object(runtime_config, "AGENT_MACHINE_OWNER", "user-123"):
                result = discord_connector.dispatch_inbound_event(
                    parsed,
                    connector_entry={"id": "cred-discord", "workspace_id": "default", "metadata": {}},
                    credentials={"bot_token": "discord-token", "channel_id": "123", "guild_id": "456"},
                    append_event_fn=None,
                    run_start_request_class=lambda **kwargs: SimpleNamespace(**kwargs),
                    start_run_request=_fake_start_run,
                )

        self.assertTrue(result["triggered"])
        request = captured["request"]
        self.assertEqual(request.metadata["owner_user_id"], "user-123")


if __name__ == "__main__":
    unittest.main()
