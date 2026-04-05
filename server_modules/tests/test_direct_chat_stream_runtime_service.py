import unittest
from pathlib import Path

from server_modules import direct_chat_stream_runtime_service as runtime_service


class DirectChatStreamRuntimeServiceTests(unittest.TestCase):
    def test_resolve_chat_stream_state_db_path_prefers_override(self):
        path = runtime_service.resolve_chat_stream_state_db_path(
            override="/tmp/override.db",
            late_server_export=lambda name: "/tmp/server.db",
            fallback_db_path="/tmp/fallback.db",
        )

        self.assertEqual(path, Path("/tmp/override.db"))

    def test_resolve_chat_stream_state_db_path_falls_back_when_server_export_fails(self):
        path = runtime_service.resolve_chat_stream_state_db_path(
            override=None,
            late_server_export=lambda name: (_ for _ in ()).throw(RuntimeError("missing")),
            fallback_db_path="/tmp/fallback.db",
        )

        self.assertEqual(path, Path("/tmp/fallback.db"))

    def test_configured_direct_chat_worker_count_uses_first_positive_value(self):
        values = {
            "ORION_RUNTIME_UVICORN_WORKERS": "bad",
            "UVICORN_WORKERS": "0",
            "WEB_CONCURRENCY": "3",
        }

        count = runtime_service.configured_direct_chat_worker_count(getenv=values.get)

        self.assertEqual(count, 3)

    def test_build_direct_chat_session_manager_passes_db_path(self):
        calls = []

        result = runtime_service.build_direct_chat_session_manager(
            get_default_session_manager=lambda **kwargs: calls.append(kwargs) or "manager",
            db_path=Path("/tmp/state.db"),
        )

        self.assertEqual(result, "manager")
        self.assertEqual(calls, [{"db_path": Path("/tmp/state.db")}])

    def test_build_default_direct_chat_session_manager_factory_imports_manager_module(self):
        calls = []

        factory = runtime_service.build_default_direct_chat_session_manager_factory(
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            import_module=lambda name, fromlist=(): type(
                "ManagerModule",
                (),
                {"get_default_session_manager": staticmethod(lambda **kwargs: calls.append(kwargs) or "manager")},
            )(),
        )

        self.assertEqual(factory(), "manager")
        self.assertEqual(calls, [{"db_path": Path("/tmp/state.db")}])

    def test_build_direct_chat_execution_services_preserves_callbacks(self):
        captured = {}

        result = runtime_service.build_direct_chat_execution_services(
            builder=lambda **kwargs: captured.update(kwargs) or "services",
            chat_stream_key=lambda *args, **kwargs: "key",
            session_manager_enabled=lambda: True,
            session_manager_factory=lambda: "manager",
            build_direct_operator_reply=lambda *args, **kwargs: {},
            build_chat_turn_event_stream=lambda *args, **kwargs: iter(()),
        )

        self.assertEqual(result, "services")
        self.assertIn("chat_stream_key", captured)
        self.assertIn("session_manager_enabled", captured)
        self.assertIn("session_manager_factory", captured)
        self.assertIn("build_direct_operator_reply", captured)
        self.assertIn("build_chat_turn_event_stream", captured)

    def test_build_imported_direct_chat_execution_services_imports_operator_chat_module(self):
        captured = {}

        result = runtime_service.build_imported_direct_chat_execution_services(
            builder=lambda **kwargs: captured.update(kwargs) or "services",
            chat_stream_key=lambda *args, **kwargs: "key",
            session_manager_enabled=lambda: True,
            session_manager_factory=lambda: "manager",
            import_module=lambda name, fromlist=(): type(
                "OperatorChatModule",
                (),
                {
                    "build_direct_operator_reply": staticmethod(lambda *args, **kwargs: {}),
                    "build_chat_turn_event_stream": staticmethod(lambda *args, **kwargs: iter(())),
                },
            )(),
        )

        self.assertEqual(result, "services")
        self.assertIn("build_direct_operator_reply", captured)
        self.assertIn("build_chat_turn_event_stream", captured)

    def test_build_direct_chat_stream_response_services_preserves_callbacks(self):
        services = runtime_service.build_direct_chat_stream_response_services(
            resolve_direct_chat_turn_request=lambda **kwargs: None,
            chat_stream_request_signature=lambda **kwargs: "sig",
            execute_agent_turn_request=lambda **kwargs: None,
            build_turn_execution_services=lambda **kwargs: None,
            run_execution_services=lambda: "run",
            direct_chat_execution_services=lambda: "chat",
            get_chat_stream_state=lambda *args, **kwargs: None,
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            get_or_create_chat_stream_session=lambda *args, **kwargs: {},
            extract_direct_chat_error_response=lambda event: None,
            start_chat_stream_producer=lambda session, producer_fn: None,
            iter_chat_stream_events=lambda session, last_event_id: iter(()),
        )

        self.assertEqual(services.chat_stream_request_signature(), "sig")
        self.assertEqual(services.run_execution_services(), "run")
        self.assertEqual(services.direct_chat_execution_services(), "chat")

    def test_build_direct_chat_stream_response_services_factory_returns_services(self):
        factory = runtime_service.build_direct_chat_stream_response_services_factory(
            resolve_direct_chat_turn_request=lambda **kwargs: None,
            chat_stream_request_signature=lambda **kwargs: "sig",
            execute_agent_turn_request=lambda **kwargs: None,
            build_turn_execution_services=lambda **kwargs: None,
            run_execution_services=lambda: "run",
            direct_chat_execution_services=lambda: "chat",
            get_chat_stream_state=lambda *args, **kwargs: None,
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            get_or_create_chat_stream_session=lambda *args, **kwargs: {},
            extract_direct_chat_error_response=lambda event: None,
            start_chat_stream_producer=lambda session, producer_fn: None,
            iter_chat_stream_events=lambda session, last_event_id: iter(()),
        )

        services = factory()

        self.assertEqual(services.chat_stream_request_signature(), "sig")
        self.assertEqual(services.run_execution_services(), "run")

    def test_build_default_chat_stream_session_factory_uses_state_service_defaults(self):
        factory = runtime_service.build_default_chat_stream_session_factory(
            now_iso=lambda: "2026-04-05T00:00:00Z",
        )

        session = factory(
            "session-1",
            thread_id="thread-1",
            request_id="req-1",
            workspace_id="default",
        )

        self.assertEqual(session["key"], "session-1")
        self.assertEqual(session["thread_id"], "thread-1")
        self.assertEqual(session["created_at"], "2026-04-05T00:00:00Z")

    def test_build_persist_chat_stream_session_state_binds_db_path_and_upsert(self):
        calls = []
        persist = runtime_service.build_persist_chat_stream_session_state(
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            now_iso=lambda: "2026-04-05T00:00:00Z",
            upsert_state=lambda db_path, payload: calls.append((db_path, payload)),
        )

        persist(
            {
                "key": "session-1",
                "thread_id": "thread-1",
                "request_id": "req-1",
                "workspace_id": "default",
                "status": "active",
                "created_at": "2026-04-05T00:00:00Z",
            }
        )

        self.assertEqual(calls[0][0], Path("/tmp/state.db"))
        self.assertEqual(calls[0][1]["session_id"], "session-1")

    def test_build_replayable_chat_stream_session_loader_replays_completed_state(self):
        loader = runtime_service.build_replayable_chat_stream_session_loader(
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            get_state=lambda db_path, key: {
                "status": "completed",
                "last_event_seq": 3,
                "final_payload": {"reply": "Done"},
            },
            upsert_state=lambda db_path, payload: None,
            metrics_inc=lambda key, amount: None,
            now_iso=lambda: "2026-04-05T00:00:00Z",
            interrupted_final_payload=lambda partial_text, error_text: {"reply": "Interrupted"},
            build_replay_session=lambda key, *, thread_id, request_id, workspace_id, state: {
                "key": key,
                "thread_id": thread_id,
                "request_id": request_id,
                "workspace_id": workspace_id,
                "state": state,
            },
        )

        session = loader(
            "session-1",
            thread_id="thread-1",
            request_id="req-1",
            workspace_id="default",
        )

        self.assertEqual(session["key"], "session-1")
        self.assertEqual(session["state"]["status"], "completed")

    def test_build_initialize_chat_stream_runtime_state_fn_binds_db_path_and_runtime_callbacks(self):
        calls = []
        initialize = runtime_service.build_initialize_chat_stream_runtime_state_fn(
            ensure_single_worker_runtime_fn=lambda: calls.append("single-worker"),
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            stale_after_seconds=10,
            ttl_seconds=20,
            mark_stale_sessions_interrupted=lambda db_path, **kwargs: calls.append(("interrupt", db_path)) or 0,
            delete_sessions_older_than=lambda db_path, **kwargs: calls.append(("cleanup", db_path)) or 0,
            metrics_inc=lambda key, amount: calls.append((key, amount)),
            session_manager_enabled=lambda: False,
            session_manager_factory=lambda: object(),
        )

        initialize(now_ts=123.0)

        self.assertEqual(calls[0], "single-worker")
        self.assertEqual(calls[1], ("interrupt", Path("/tmp/state.db")))
        self.assertEqual(calls[2], ("cleanup", Path("/tmp/state.db")))

    def test_build_get_or_create_chat_stream_session_fn_uses_lock_and_db_path(self):
        sessions = {}
        calls = []
        get_or_create = runtime_service.build_get_or_create_chat_stream_session_fn(
            sessions,
            lock=__import__("threading").Lock(),
            prune_sessions_locked=lambda: calls.append("pruned"),
            delete_sessions_older_than=lambda *args, **kwargs: 0,
            chat_stream_state_db_path=lambda: Path("/tmp/state.db"),
            state_ttl_seconds=60,
            load_replayable_session=lambda *args, **kwargs: None,
            default_session_factory=lambda key, *, thread_id, request_id, workspace_id: {
                "key": key,
                "thread_id": thread_id,
                "request_id": request_id,
                "workspace_id": workspace_id,
                "condition": __import__("threading").Condition(),
                "events": [],
                "next_event_id": 1,
                "producer_started": False,
                "completed": False,
                "last_accessed_at": 0,
            },
            persist_session_state=lambda session: calls.append(("persisted", session["key"])),
        )

        session = get_or_create(
            "session-1",
            thread_id="thread-1",
            request_id="req-1",
            workspace_id="default",
        )

        self.assertEqual(session["key"], "session-1")
        self.assertEqual(calls[0], "pruned")
        self.assertEqual(calls[1], ("persisted", "session-1"))


if __name__ == "__main__":
    unittest.main()
