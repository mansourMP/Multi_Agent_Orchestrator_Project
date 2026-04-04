import unittest

from server_modules.agent_turn import (
    bind_agent_turn_metadata,
    build_direct_chat_turn_request,
    build_run_start_turn_request,
    resolve_agent_turn_request,
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


if __name__ == "__main__":
    unittest.main()
