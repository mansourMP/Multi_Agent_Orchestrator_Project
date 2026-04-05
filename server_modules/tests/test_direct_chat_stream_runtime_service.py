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


if __name__ == "__main__":
    unittest.main()
