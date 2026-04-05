import asyncio
import unittest

from fastapi.responses import JSONResponse, StreamingResponse

from server_modules.direct_chat_stream_response_service import (
    DirectChatStreamResponseServices,
    build_direct_chat_stream_response,
)


class _Resolution:
    def __init__(self) -> None:
        self.turn_request = {"kind": "direct_chat"}
        self.workspace_id = "default"
        self.thread_id = "thread-1"
        self.client_request_id = "req-1"


class DirectChatStreamResponseServiceTests(unittest.TestCase):
    def _services(self, **overrides):
        async def _execute_agent_turn_request(**kwargs):
            return {
                "workspace_id": "default",
                "session_key": "session-1",
                "thread_id": "thread-1",
                "client_request_id": "req-1",
                "producer": lambda: iter(()),
            }

        base = DirectChatStreamResponseServices(
            resolve_direct_chat_turn_request=lambda **kwargs: _Resolution(),
            chat_stream_request_signature=lambda **kwargs: "sig",
            execute_agent_turn_request=_execute_agent_turn_request,
            build_turn_execution_services=lambda **kwargs: {"services": kwargs},
            run_execution_services=lambda: "run-services",
            direct_chat_execution_services=lambda: "chat-services",
            get_chat_stream_state=lambda db_path, key: None,
            chat_stream_state_db_path=lambda: "/tmp/state.db",
            get_or_create_chat_stream_session=lambda *args, **kwargs: {"producer_started": False},
            extract_direct_chat_error_response=lambda event: None,
            start_chat_stream_producer=lambda session, producer: None,
            iter_chat_stream_events=lambda session, last_event_id: iter([b"data: ok\n\n"]),
        )
        for key, value in overrides.items():
            setattr(base, key, value)
        return base

    def test_returns_chat_unavailable_when_producer_finishes_immediately(self):
        payload = asyncio.run(
            build_direct_chat_stream_response(
                current_user={"user_id": "user-1"},
                body={"message": "hello"},
                last_event_id=None,
                services=self._services(),
            )
        )

        self.assertIsInstance(payload, JSONResponse)
        self.assertEqual(payload.status_code, 500)

    def test_returns_immediate_provider_error_response(self):
        async def _execute_agent_turn_request(**kwargs):
            return {
                "workspace_id": "default",
                "session_key": "session-1",
                "thread_id": "thread-1",
                "client_request_id": "req-1",
                "producer": lambda: iter([{"type": "final", "payload": {"error": "no_provider"}}]),
            }

        services = self._services(
            execute_agent_turn_request=_execute_agent_turn_request,
            extract_direct_chat_error_response=lambda event: {"error": "no_provider", "message": "No AI provider configured"},
        )

        payload = asyncio.run(
            build_direct_chat_stream_response(
                current_user={"user_id": "user-1"},
                body={"message": "hello"},
                last_event_id=None,
                services=services,
            )
        )

        self.assertIsInstance(payload, JSONResponse)
        self.assertEqual(payload.status_code, 409)

    def test_returns_streaming_response_for_live_stream(self):
        started = {}

        async def _execute_agent_turn_request(**kwargs):
            return {
                "workspace_id": "default",
                "session_key": "session-1",
                "thread_id": "thread-1",
                "client_request_id": "req-1",
                "producer": lambda: iter([{"type": "chunk", "delta": "Hello"}]),
            }

        services = self._services(
            execute_agent_turn_request=_execute_agent_turn_request,
            start_chat_stream_producer=lambda session, producer: started.setdefault("called", True),
        )

        payload = asyncio.run(
            build_direct_chat_stream_response(
                current_user={"user_id": "user-1"},
                body={"message": "hello"},
                last_event_id="0",
                services=services,
            )
        )

        self.assertIsInstance(payload, StreamingResponse)
        self.assertTrue(started["called"])


if __name__ == "__main__":
    unittest.main()
