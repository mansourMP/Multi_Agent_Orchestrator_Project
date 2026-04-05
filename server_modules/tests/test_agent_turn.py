import unittest

from server_modules.agent_turn import (
    bind_agent_turn_request_meta,
    bind_agent_turn_metadata,
    build_agent_turn_session_context,
    build_direct_chat_turn_request,
    build_run_start_turn_request,
    ensure_direct_chat_turn_request,
    resolve_direct_chat_turn_request,
    resolve_agent_turn_request,
    resolve_agent_turn_request_from_runtime_context,
    resolve_agent_turn_request_with_fallback,
    resolve_run_start_turn_request,
    serialize_agent_turn_request,
)
from server_modules.run_service import build_run_start_request_from_turn
from server_modules.runtime_models import RunStartRequest


class AgentTurnTests(unittest.TestCase):
    def test_build_direct_chat_turn_request_normalizes_core_fields(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1", "email": "user@example.com"},
            body={
                "provider": "openai",
                "model": "gpt-test",
                "reasoning_effort": "high",
                "attachments": [{"kind": "file", "uri": "artifact://demo", "name": "demo.txt"}],
            },
            workspace_id="workspace-1",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello world",
        )

        self.assertEqual(request.workspace_id, "workspace-1")
        self.assertEqual(request.session_id, "thread-1")
        self.assertEqual(request.actor.id, "user-1")
        self.assertEqual(request.response_mode, "stream")
        self.assertEqual(request.execution_mode, "sync")
        self.assertEqual(request.context_hints["provider"], "openai")
        self.assertEqual(request.attachments[0].uri, "artifact://demo")

    def test_build_run_start_turn_request_and_bind_metadata(self):
        run_request = RunStartRequest(
            engine="orion",
            workspace_id="workspace-1",
            workflow_id="workflow-1",
            user_goal="Review the latest inbox state",
            agent_role="orchestrator",
            metadata={
                "owner_user_id": "user-1",
                "owner_email": "user@example.com",
                "execution_target": "local_companion",
                "trust_mode": "guarded",
            },
        )

        turn_request = build_run_start_turn_request(run_request)
        metadata = bind_agent_turn_metadata(run_request.metadata, turn_request, source="runs/start")

        self.assertEqual(turn_request.execution_mode, "durable")
        self.assertEqual(turn_request.response_mode, "artifact")
        self.assertEqual(turn_request.machine_target, "local_companion")
        self.assertEqual(metadata["source"], "runs/start")
        self.assertEqual(metadata["agent_turn_contract_version"], 1)
        self.assertEqual(metadata["agent_turn_request"]["workspace_id"], "workspace-1")
        self.assertEqual(metadata["agent_turn_request"]["actor"]["id"], "user-1")

    def test_resolve_agent_turn_request_round_trips_serialized_payload(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={},
            workspace_id="default",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )

        round_tripped = resolve_agent_turn_request(serialize_agent_turn_request(request))

        self.assertIsNotNone(round_tripped)
        self.assertEqual(round_tripped.workspace_id, "default")
        self.assertEqual(round_tripped.session_id, "thread-1")
        self.assertEqual(round_tripped.message, "hello")

    def test_resolve_agent_turn_request_with_fallback_uses_secondary_payload(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={},
            workspace_id="default",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )

        resolved = resolve_agent_turn_request_with_fallback(
            None,
            serialize_agent_turn_request(request),
        )

        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.workspace_id, "default")
        self.assertEqual(resolved.message, "hello")

    def test_resolve_agent_turn_request_from_runtime_context_prefers_request_meta(self):
        meta_request = build_direct_chat_turn_request(
            current_user={"user_id": "meta-user"},
            body={},
            workspace_id="workspace-meta",
            thread_id="thread-meta",
            client_request_id="req-meta",
            message="meta message",
        )
        session_request = build_direct_chat_turn_request(
            current_user={"user_id": "session-user"},
            body={},
            workspace_id="workspace-session",
            thread_id="thread-session",
            client_request_id="req-session",
            message="session message",
        )

        resolved = resolve_agent_turn_request_from_runtime_context(
            request_meta={"agent_turn_request": serialize_agent_turn_request(meta_request)},
            session_ctx={"agent_turn_request": serialize_agent_turn_request(session_request)},
        )

        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.workspace_id, "workspace-meta")
        self.assertEqual(resolved.message, "meta message")

    def test_build_run_start_request_from_turn_preserves_canonical_metadata(self):
        base_request = RunStartRequest(
            engine="orion",
            workspace_id="workspace-1",
            user_goal="Original goal",
            provider="openai",
            model="gpt-test",
            metadata={"owner_user_id": "user-1", "trust_mode": "guarded"},
        )
        turn_request = build_run_start_turn_request(base_request)

        converted = build_run_start_request_from_turn(turn_request, base_request=base_request)

        self.assertEqual(converted.workspace_id, "workspace-1")
        self.assertEqual(converted.user_goal, "Original goal")
        self.assertEqual(converted.provider, "openai")
        self.assertEqual(converted.metadata["agent_turn_request"]["workspace_id"], "workspace-1")
        self.assertEqual(converted.metadata["agent_turn_request"]["message"], "Original goal")
        self.assertEqual(converted.metadata["channel"], "web")

    def test_bind_agent_turn_request_meta_binds_serialized_turn_request(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={},
            workspace_id="workspace-1",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )

        bound = bind_agent_turn_request_meta({"request_id": "req-1"}, request)

        self.assertEqual(bound["agent_turn_request"]["workspace_id"], "workspace-1")
        self.assertEqual(bound["thread_id"], "thread-1")

    def test_build_agent_turn_session_context_serializes_turn_request(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={},
            workspace_id="workspace-1",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )

        context = build_agent_turn_session_context(
            request,
            workspace_id="ignored",
            session_id="ignored",
            user_id="user-1",
        )

        self.assertEqual(context["workspace_id"], "workspace-1")
        self.assertEqual(context["thread_id"], "thread-1")
        self.assertEqual(context["agent_turn_request"]["message"], "hello")

    def test_resolve_direct_chat_turn_request_normalizes_api_inputs(self):
        resolved = resolve_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={"message": "hello", "workspace_id": "workspace-1", "thread_id": "thread-1"},
            request_signature_fn=lambda body: "req-1",
        )

        self.assertEqual(resolved.workspace_id, "workspace-1")
        self.assertEqual(resolved.thread_id, "thread-1")
        self.assertEqual(resolved.client_request_id, "req-1")
        self.assertEqual(resolved.turn_request.message, "hello")
        self.assertEqual(resolved.turn_request.workspace_id, "workspace-1")

    def test_ensure_direct_chat_turn_request_accepts_serialized_contract(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={"thread_id": "thread-1"},
            workspace_id="default",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )

        ensured = ensure_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={"thread_id": "thread-1"},
            workspace_id="default",
            thread_id="thread-1",
            client_request_id="req-1",
            message="ignored",
            agent_turn_request=serialize_agent_turn_request(request),
        )

        self.assertEqual(ensured.workspace_id, "default")
        self.assertEqual(ensured.session_id, "thread-1")
        self.assertEqual(ensured.message, "hello")

    def test_resolve_run_start_turn_request_stamps_request_before_turn_build(self):
        resolution = resolve_run_start_turn_request(
            current_user={"user_id": "user-1"},
            body=RunStartRequest(
                engine="orion",
                workspace_id="workspace-1",
                user_goal="Review inbox",
                metadata={},
            ),
            stamp_request_owner_fn=lambda req, current_user: RunStartRequest(
                engine=req.engine,
                workspace_id=req.workspace_id,
                user_goal=req.user_goal,
                metadata={**dict(req.metadata or {}), "owner_user_id": current_user["user_id"]},
            ),
        )

        self.assertEqual(resolution.request.metadata["owner_user_id"], "user-1")
        self.assertEqual(resolution.turn_request.workspace_id, "workspace-1")
        self.assertEqual(resolution.turn_request.message, "Review inbox")
        self.assertEqual(resolution.turn_request.actor.id, "user-1")


if __name__ == "__main__":
    unittest.main()
