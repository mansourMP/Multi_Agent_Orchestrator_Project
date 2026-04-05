import unittest
from unittest.mock import AsyncMock, Mock, patch

from server_modules import runtime_runs_api
from server_modules.agent_turn import build_direct_chat_turn_request
from server_modules.direct_chat_service import DirectChatExecutionServices, build_direct_chat_execution_services
from server_modules.run_service import RunExecutionServices
from server_modules.runtime_models import RunStartRequest
from server_modules import turn_runtime
from server_modules.turn_runtime import (
    TurnExecutionServices,
    build_turn_execution_services,
    execute_built_legacy_unowned_system_run_start_request_via_turn_runtime,
    execute_built_unowned_system_run_start_request_via_turn_runtime,
    execute_agent_turn_request,
    execute_run_start_request_via_turn_runtime,
    execute_system_run_start_request_via_turn_runtime,
    execute_unowned_system_run_start_request_via_turn_runtime,
)


class _DummyManager:
    def __init__(self) -> None:
        self.calls = []
        self.eviction_calls = 0

    def evict_idle_handles(self, **kwargs):
        self.eviction_calls += 1
        return 0

    def iter_turn_events(self, **kwargs):
        self.calls.append(kwargs)
        yield {
            "type": "final",
            "payload": {
                "reply": "session-manager",
                "actions": [],
                "mode": "answer",
                "error": "",
            },
        }


class RuntimeRunsApiSessionManagerTests(unittest.TestCase):
    def test_builder_helpers_preserve_turn_runtime_callbacks(self):
        run_execution = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
            create_run_from_request=lambda req: {"run_id": "unused"},
        )
        direct_chat = build_direct_chat_execution_services(
            chat_stream_key=runtime_runs_api._chat_stream_key,
            session_manager_enabled=runtime_runs_api._direct_chat_session_manager_enabled,
            session_manager_factory=runtime_runs_api._direct_chat_session_manager,
            build_direct_operator_reply=lambda **kwargs: {"reply": "unused"},
            build_chat_turn_event_stream=lambda **kwargs: iter(()),
        )

        services = build_turn_execution_services(
            run_execution=run_execution,
            direct_chat=direct_chat,
        )

        self.assertIs(services.run_execution, run_execution)
        self.assertIs(services.direct_chat, direct_chat)

    def test_runtime_runs_api_uses_session_manager_when_flag_enabled(self):
        manager = _DummyManager()
        body = {
            "message": "hello",
            "thread_id": "thread-1",
            "provider": "openai",
            "model": "gpt-test",
            "availability": {},
        }
        current_user = {"user_id": "user-1", "email": "user@example.com"}

        with patch.object(runtime_runs_api, "_direct_chat_session_manager_enabled", return_value=True), patch.object(
            runtime_runs_api,
            "_direct_chat_session_manager",
            return_value=manager,
        ):
            producer = runtime_runs_api._build_direct_chat_event_producer(
                current_user=current_user,
                body=body,
                message="hello",
                workspace_id="default",
                session_key="user-1:thread-1:req-1",
                thread_id="thread-1",
                client_request_id="req-1",
            )
            events = list(producer)

        self.assertEqual(events[-1]["payload"]["reply"], "session-manager")
        self.assertEqual(len(manager.calls), 1)
        call = manager.calls[0]
        self.assertEqual(call["session_id"], "user-1:default:thread-1")
        self.assertEqual(call["actor_key"], "user-1:default:thread-1")
        self.assertEqual(call["workspace_id"], "default")
        self.assertEqual(call["user_id"], "user-1")
        self.assertEqual(call["request_meta"]["request_id"], "req-1")
        self.assertEqual(call["request_meta"]["agent_turn_request"]["workspace_id"], "default")
        self.assertEqual(call["request_meta"]["agent_turn_request"]["session_id"], "thread-1")
        self.assertEqual(call["request_meta"]["agent_turn_request"]["message"], "hello")
        self.assertEqual(manager.eviction_calls, 1)

    def test_execute_agent_turn_request_returns_direct_chat_stream_plan(self):
        turn_request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={"thread_id": "thread-1"},
            workspace_id="default",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )
        services = build_turn_execution_services(
            run_execution=RunExecutionServices(
                stamp_request_owner=lambda req, current_user: req,
                prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
                create_run_from_request=lambda req: {"run_id": "unused"},
            ),
            direct_chat=build_direct_chat_execution_services(
                chat_stream_key=runtime_runs_api._chat_stream_key,
                session_manager_enabled=runtime_runs_api._direct_chat_session_manager_enabled,
                session_manager_factory=runtime_runs_api._direct_chat_session_manager,
                build_direct_operator_reply=lambda **kwargs: {"reply": "unused"},
                build_chat_turn_event_stream=lambda **kwargs: iter(()),
            ),
        )

        execution = __import__("asyncio").run(
            execute_agent_turn_request(
                turn_request=turn_request,
                current_user={"user_id": "user-1"},
                services=services,
                chat_body={"thread_id": "thread-1", "client_request_id": "req-1"},
            )
        )

        self.assertEqual(execution["kind"], "direct_chat_stream")
        self.assertEqual(execution["workspace_id"], "default")
        self.assertEqual(execution["thread_id"], "thread-1")
        self.assertEqual(execution["client_request_id"], "req-1")
        self.assertTrue(callable(execution["producer"]))

    def test_execute_agent_turn_request_delegates_durable_branch_through_run_service(self):
        turn_request = type("TurnRequest", (), {"execution_mode": "durable"})()
        services = build_turn_execution_services(
            run_execution=RunExecutionServices(
                stamp_request_owner=lambda req, current_user: req,
                prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
                create_run_from_request=lambda req: {"run_id": "unused"},
            ),
            direct_chat=build_direct_chat_execution_services(
                chat_stream_key=runtime_runs_api._chat_stream_key,
                session_manager_enabled=runtime_runs_api._direct_chat_session_manager_enabled,
                session_manager_factory=runtime_runs_api._direct_chat_session_manager,
                build_direct_operator_reply=lambda **kwargs: {"reply": "unused"},
                build_chat_turn_event_stream=lambda **kwargs: iter(()),
            ),
        )

        with patch.object(
            turn_runtime.run_service,
            "execute_durable_agent_turn_dispatch",
            new=AsyncMock(return_value={"result": {"run_id": "run-durable"}}),
        ) as execute_mock:
            execution = __import__("asyncio").run(
                execute_agent_turn_request(
                    turn_request=turn_request,
                    current_user={"user_id": "user-1"},
                    services=services,
                    run_request={"run": True},
                )
            )

        self.assertEqual(execution["result"]["run_id"], "run-durable")
        self.assertIs(execute_mock.await_args.kwargs["turn_request"], turn_request)
        self.assertEqual(execute_mock.await_args.kwargs["base_request"], {"run": True})

    def test_execute_run_start_request_via_turn_runtime_returns_result_payload(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        services = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
            create_run_from_request=lambda req: {"run_id": "unused"},
        )

        with patch.object(
            turn_runtime,
            "execute_durable_turn_request",
            new=AsyncMock(return_value={"result": {"run_id": "run-1", "status": "starting"}}),
        ):
            result = __import__("asyncio").run(
                execute_run_start_request_via_turn_runtime(
                    request,
                    current_user={"user_id": "user-1"},
                    stamp_request_owner_fn=lambda req, current_user: req,
                    services=services,
                )
            )

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "starting")

    def test_execute_system_run_start_request_via_turn_runtime_uses_system_user(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        captured = {}

        async def _fake_execute(request_payload, *, current_user, **kwargs):
            captured["current_user"] = dict(current_user or {})
            return {"run_id": "run-2", "status": "starting"}

        with patch.object(
            turn_runtime,
            "execute_run_start_request_via_turn_runtime",
            side_effect=_fake_execute,
        ):
            result = execute_system_run_start_request_via_turn_runtime(
                request,
                stamp_request_owner_fn=lambda req, current_user: req,
                services=RunExecutionServices(
                    stamp_request_owner=lambda req, current_user: req,
                    prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
                    create_run_from_request=lambda req: {"run_id": "unused"},
                ),
            )

        self.assertEqual(result["run_id"], "run-2")
        self.assertEqual(captured["current_user"]["auth_type"], "api_key")

    def test_execute_unowned_system_run_start_request_via_turn_runtime_uses_noop_owner_stamp(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        captured = {}
        original = object()

        def _fake_system_execute(request_payload, *, stamp_request_owner_fn, current_user=None, **kwargs):
            captured["stamped"] = stamp_request_owner_fn(original, {"user_id": "ignored"})
            captured["current_user"] = dict(current_user or {})
            return {"run_id": "run-3", "status": "starting"}

        with patch.object(
            turn_runtime,
            "execute_system_run_start_request_via_turn_runtime",
            side_effect=_fake_system_execute,
        ):
            result = execute_unowned_system_run_start_request_via_turn_runtime(
                request,
                services=RunExecutionServices(
                    stamp_request_owner=lambda req, current_user: req,
                    prepare_run_start_request=lambda req: {"metadata": dict(req.metadata or {})},
                    create_run_from_request=lambda req: {"run_id": "unused"},
                ),
            )

        self.assertEqual(result["run_id"], "run-3")
        self.assertIs(captured["stamped"], original)

    def test_execute_built_unowned_system_run_start_request_via_turn_runtime_builds_services(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        built_services = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": {}},
            create_run_from_request=lambda req: {"run_id": "unused"},
        )
        captured = {}

        def _fake_execute(request_payload, *, stamp_request_owner_fn, services, **kwargs):
            captured["stamped"] = stamp_request_owner_fn("req", {"user_id": "ignored"})
            captured["services"] = services
            return {"run_id": "run-4", "status": "starting"}

        result = execute_built_unowned_system_run_start_request_via_turn_runtime(
            request,
            execute_system_run_start_request_via_turn_runtime_fn=_fake_execute,
            build_run_execution_services_fn=lambda: built_services,
        )

        self.assertEqual(result["run_id"], "run-4")
        self.assertEqual(captured["stamped"], "req")
        self.assertIs(captured["services"], built_services)

    def test_execute_built_legacy_unowned_system_run_start_request_via_turn_runtime_bypasses_mocked_create(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        create_run = Mock(return_value={"run_id": "run-5", "status": "starting"})
        built_services = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": {}},
            create_run_from_request=lambda req: {"run_id": "unused"},
        )

        with patch(
            "server_modules.turn_runtime.execute_built_unowned_system_run_start_request_via_turn_runtime"
        ) as execute_built:
            result = execute_built_legacy_unowned_system_run_start_request_via_turn_runtime(
                request,
                execute_system_run_start_request_via_turn_runtime_fn=lambda *args, **kwargs: {"run_id": "unexpected"},
                build_run_execution_services_fn=lambda: built_services,
                create_run_from_request_fn=create_run,
            )

        self.assertEqual(result["run_id"], "run-5")
        create_run.assert_called_once_with(request)
        execute_built.assert_not_called()

    def test_execute_built_legacy_unowned_system_run_start_request_via_turn_runtime_uses_runtime_when_not_mocked(self):
        request = RunStartRequest(engine="orion", workspace_id="default", user_goal="hello")
        built_services = RunExecutionServices(
            stamp_request_owner=lambda req, current_user: req,
            prepare_run_start_request=lambda req: {"metadata": {}},
            create_run_from_request=lambda req: {"run_id": "unused"},
        )

        with patch(
            "server_modules.turn_runtime.execute_built_unowned_system_run_start_request_via_turn_runtime",
            return_value={"run_id": "run-6", "status": "starting"},
        ) as execute_built:
            result = execute_built_legacy_unowned_system_run_start_request_via_turn_runtime(
                request,
                execute_system_run_start_request_via_turn_runtime_fn=lambda *args, **kwargs: {"run_id": "unexpected"},
                build_run_execution_services_fn=lambda: built_services,
                create_run_from_request_fn=lambda req: {"run_id": "unused"},
            )

        self.assertEqual(result["run_id"], "run-6")
        execute_built.assert_called_once()


if __name__ == "__main__":
    unittest.main()
