import unittest
import asyncio
from unittest.mock import AsyncMock, patch

from server_modules.agent_turn import (
    AgentTurnRequest,
    agent_turn,
    bind_agent_turn_request_meta,
    bind_agent_turn_metadata,
    build_agent_turn_session_context,
    build_direct_chat_turn_request,
    build_discord_turn_request,
    build_inbound_agent_turn_request,
    build_local_worker_turn_request,
    build_telegram_turn_request,
    build_whatsapp_turn_request,
    resolve_agent_turn_session_identity,
    build_run_start_turn_request,
    ensure_direct_chat_turn_request,
    normalize_turn_policy_context,
    resolve_direct_chat_turn_request,
    resolve_agent_turn_request,
    resolve_agent_turn_request_from_runtime_context,
    resolve_agent_turn_request_with_fallback,
    resolve_run_start_turn_request,
    serialize_agent_turn_request,
    TurnActor,
)
from server_modules.run_service import build_run_start_request_from_turn
from server_modules.runtime_models import RunStartRequest


class AgentTurnTests(unittest.TestCase):
    def test_agent_turn_persists_master_thread_and_turns(self):
        turn_request = AgentTurnRequest(
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            thread_id="thread-1",
            session_id="session-1",
            channel="web",
            actor=TurnActor(type="user", id="user-1", display_name="Alice"),
            message="hello world",
            execution_mode="sync",
            response_mode="stream",
            context_hints={"request_id": "req-1"},
        )

        with patch("server_modules.agent_turn.session_service.get_session", new=AsyncMock(return_value={
            "session_id": "session-1",
            "workspace_id": "workspace-1",
            "tenant_id": "tenant-1",
            "channel": "web",
            "actor": {"type": "user", "id": "user-1"},
            "created_at": "2026-04-08T00:00:00Z",
            "expires_at": "2099-01-01T00:00:00Z",
            "metadata": {"thread_id": "thread-1"},
            "status": "active",
        })), patch("server_modules.agent_turn.session_service.extend_session", new=AsyncMock(return_value=None)), patch("server_modules.agent_turn.thread_service.ensure_master_thread", new=AsyncMock(return_value={"id": "thread-1"})) as ensure_thread_mock, patch("server_modules.agent_turn.thread_service.record_user_turn", new=AsyncMock(return_value={"id": "turn-user"})) as record_user_mock, patch("server_modules.agent_turn.thread_service.record_assistant_turn", new=AsyncMock(return_value={"id": "turn-assistant"})) as record_assistant_mock, patch("server_modules.turn_runtime.build_turn_execution_services", return_value={"services": "ok"}), patch("server_modules.turn_runtime.execute_agent_turn_request", new=AsyncMock(return_value={
            "status": "completed",
            "reply": "done",
            "run_id": "run-1",
            "approvals": [],
            "interventions": [],
            "metadata": {"agent_role": "master-agent"},
        })):
            result = asyncio.run(
                agent_turn(
                    turn_request=turn_request,
                    current_user={"user_id": "user-1", "role": "owner", "is_admin": True},
                    run_execution_services={"run": "services"},
                    direct_chat_services={"direct_chat": "services"},
                )
            )

        self.assertEqual(result["reply"], "done")
        ensure_thread_mock.assert_awaited_once()
        self.assertEqual(ensure_thread_mock.await_args.kwargs["thread_id"], "thread-1")
        record_user_mock.assert_awaited_once()
        self.assertEqual(record_user_mock.await_args.kwargs["content"], "hello world")
        record_assistant_mock.assert_awaited_once()
        self.assertEqual(record_assistant_mock.await_args.kwargs["run_id"], "run-1")

    def test_build_inbound_agent_turn_request_normalizes_generic_inputs(self):
        request = build_inbound_agent_turn_request(
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            session_id="session-1",
            channel="Discord",
            actor_type="user",
            actor_id="user-1",
            actor_display_name="Alice",
            message="hello",
            execution_mode="durable",
            response_mode="artifact",
            context_hints={"source": "discord"},
        )

        self.assertEqual(request.channel, "discord")
        self.assertEqual(request.execution_mode, "durable")
        self.assertEqual(request.actor.display_name, "Alice")
        self.assertEqual(request.context_hints["source"], "discord")

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

    def test_build_direct_chat_turn_request_tracks_client_request_id_in_context_hints(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1", "email": "user@example.com"},
            body={},
            workspace_id="workspace-1",
            thread_id="thread-1",
            client_request_id="req-123",
            message="hello world",
        )

        self.assertEqual(request.context_hints["request_id"], "req-123")

    def test_build_telegram_turn_request_shapes_channel_identity(self):
        request = build_telegram_turn_request(
            workspace_id="workspace-1",
            connector_entry={"metadata": {"tenant_id": "tenant-1", "trust_mode": "guarded"}},
            goal="Check status",
            chat_id="chat-1",
            sender_id="sender-1",
            update_id=42,
            message_id="msg-1",
            trace_id="tg:trace-1",
            source_event_id="event-1",
            metadata={"execution_target": "local_companion"},
        )

        self.assertEqual(request.channel, "telegram")
        self.assertEqual(request.session_id, "chat-1")
        self.assertEqual(request.actor.id, "sender-1")
        self.assertEqual(request.tenant_id, "tenant-1")
        self.assertEqual(request.context_hints["telegram"]["message_id"], "msg-1")
        self.assertEqual(request.policy_context["execution_target"], "local_companion")

    def test_build_whatsapp_turn_request_shapes_channel_identity(self):
        request = build_whatsapp_turn_request(
            workspace_id="workspace-1",
            connector_entry={"metadata": {"tenant_id": "tenant-1", "trust_mode": "guarded"}},
            goal="Handle inbound",
            from_number="whatsapp:+1",
            to_number="whatsapp:+2",
            message_sid="SM123",
            account_sid="AC123",
            session_id="whatsapp:+1->+2",
            trace_id="wa:trace-1",
            metadata={"execution_target": "cloud"},
        )

        self.assertEqual(request.channel, "whatsapp")
        self.assertEqual(request.session_id, "whatsapp:+1->+2")
        self.assertEqual(request.actor.id, "whatsapp:+1")
        self.assertEqual(request.tenant_id, "tenant-1")
        self.assertEqual(request.context_hints["whatsapp"]["message_sid"], "SM123")
        self.assertEqual(request.policy_context["execution_target"], "cloud")

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

    def test_normalize_turn_policy_context_downgrades_non_owner_agent_mode_and_logs(self):
        with self.assertLogs("server_modules.agent_turn", level="WARNING") as captured:
            normalized = normalize_turn_policy_context(
                {"session_mode": "agent", "trust_mode": "auto"},
                current_user={"user_id": "user-2", "role": "member", "is_admin": False},
                workspace_id="workspace-1",
                session_id="thread-1",
            )

        self.assertEqual(normalized["requested_session_mode"], "agent")
        self.assertEqual(normalized["session_mode"], "copilot")
        self.assertEqual(normalized["effective_session_mode"], "copilot")
        self.assertEqual(normalized["trust_mode"], "guarded")
        self.assertTrue(normalized["interactive_approvals"])
        self.assertTrue(normalized["session_mode_downgraded"])
        self.assertIn("Downgraded requested agent session mode to copilot.", captured.output[0])

    def test_normalize_turn_policy_context_allows_owner_agent_mode(self):
        with patch("server_modules.runtime_config.agent_machine_full_trust_enabled", return_value=True):
            normalized = normalize_turn_policy_context(
                {"session_mode": "agent", "trust_mode": "guarded"},
                current_user={"user_id": "user-1", "role": "owner", "is_admin": True},
                workspace_id="workspace-1",
                session_id="thread-1",
            )

        self.assertEqual(normalized["session_mode"], "agent")
        self.assertEqual(normalized["effective_session_mode"], "agent")
        self.assertEqual(normalized["trust_mode"], "auto")
        self.assertFalse(normalized["interactive_approvals"])

    def test_normalize_turn_policy_context_downgrades_owner_when_full_trust_is_disabled(self):
        with patch("server_modules.runtime_config.agent_machine_full_trust_enabled", return_value=False), self.assertLogs("server_modules.agent_turn", level="WARNING") as captured:
            normalized = normalize_turn_policy_context(
                {"session_mode": "agent", "trust_mode": "auto"},
                current_user={"user_id": "user-1", "role": "owner", "is_admin": True},
                workspace_id="workspace-1",
                session_id="thread-1",
            )

        self.assertEqual(normalized["session_mode"], "copilot")
        self.assertEqual(normalized["trust_mode"], "guarded")
        self.assertEqual(normalized["session_mode_downgrade_reason"], "full_trust_disabled")
        self.assertIn("Downgraded requested agent session mode to copilot.", captured.output[0])

    def test_agent_turn_validates_existing_session_before_dispatch(self):
        request = build_inbound_agent_turn_request(
            workspace_id="workspace-1",
            session_id="thread-1",
            channel="web",
            actor_type="user",
            actor_id="user-1",
            message="hello",
        )

        async def _run():
            with patch("server_modules.agent_turn.session_service.get_session", new=AsyncMock(return_value={
                "session_id": "thread-1",
                "workspace_id": "workspace-1",
                "tenant_id": "default",
                "channel": "web",
                "actor": {"type": "user", "id": "user-1"},
                "created_at": "2026-04-06T00:00:00Z",
                "expires_at": "2026-04-07T00:00:00Z",
                "metadata": {"source": "test"},
                "status": "active",
            })) as get_session, patch("server_modules.agent_turn.session_service.extend_session", new=AsyncMock(return_value=None)) as extend_session, patch(
                "server_modules.turn_runtime.build_turn_execution_services",
                return_value="services",
            ), patch(
                "server_modules.turn_runtime.execute_agent_turn_request",
                new=AsyncMock(return_value={"status": "ok", "session_id": "thread-1"}),
            ) as execute_agent_turn_request:
                result = await agent_turn(
                    turn_request=request,
                    current_user={"user_id": "user-1"},
                    run_execution_services="run-services",
                )
                return result, get_session, extend_session, execute_agent_turn_request

        import asyncio

        result, get_session, extend_session, execute_agent_turn_request = asyncio.run(_run())
        self.assertEqual(result["status"], "ok")
        self.assertEqual(request.context_hints["session"]["session_id"], "thread-1")
        get_session.assert_awaited()
        extend_session.assert_awaited_once_with("thread-1")
        execute_agent_turn_request.assert_awaited()

    def test_agent_turn_creates_session_when_missing(self):
        request = AgentTurnRequest(
            tenant_id="default",
            workspace_id="workspace-1",
            thread_id="thread-1",
            session_id="",
            channel="web",
            actor=TurnActor(type="user", id="user-1", display_name="user-1"),
            message="hello",
        )

        async def _run():
            with patch("server_modules.agent_turn.session_service.get_session", new=AsyncMock(return_value={
                "session_id": "generated-session",
                "workspace_id": "workspace-1",
                "tenant_id": "default",
                "channel": "web",
                "actor": {"type": "user", "id": "user-1"},
                "created_at": "2026-04-06T00:00:00Z",
                "expires_at": "2026-04-07T00:00:00Z",
                "metadata": {"source": "agent_turn"},
                "status": "active",
            })), patch("server_modules.agent_turn.session_service.create_session", new=AsyncMock(return_value="generated-session")) as create_session, patch(
                "server_modules.turn_runtime.build_turn_execution_services",
                return_value="services",
            ), patch(
                "server_modules.turn_runtime.execute_agent_turn_request",
                new=AsyncMock(return_value={"status": "ok", "session_id": "generated-session"}),
            ):
                return await agent_turn(
                    turn_request=request,
                    current_user={"user_id": "user-1"},
                    run_execution_services="run-services",
                ), create_session

        import asyncio

        result, create_session = asyncio.run(_run())
        self.assertEqual(result["session_id"], "generated-session")
        self.assertEqual(request.session_id, "generated-session")
        create_session.assert_awaited_once()

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
        self.assertIsNone(context["effective_session_mode"])

    def test_resolve_agent_turn_session_identity_prefers_request_fields(self):
        request = build_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={},
            workspace_id="workspace-1",
            thread_id="thread-1",
            client_request_id="req-1",
            message="hello",
        )

        identity = resolve_agent_turn_session_identity(
            request,
            workspace_id="ignored",
            session_id="ignored",
            user_id="fallback-user",
        )

        self.assertEqual(identity["workspace_id"], "workspace-1")
        self.assertEqual(identity["thread_id"], "thread-1")
        self.assertEqual(identity["user_id"], "fallback-user")

    def test_resolve_direct_chat_turn_request_normalizes_api_inputs(self):
        resolved = resolve_direct_chat_turn_request(
            current_user={"user_id": "user-1"},
            body={"message": "hello", "workspace_id": "workspace-1", "thread_id": "thread-1"},
            request_signature_fn=lambda body: "req-1",
        )

        self.assertEqual(resolved.workspace_id, "workspace-1")
        self.assertEqual(resolved.thread_id, "thread-1")

    def test_build_discord_turn_request_preserves_channel_metadata(self):
        request = build_discord_turn_request(
            parsed={
                "channel_id": "channel-1",
                "guild_id": "guild-1",
                "user_id": "user-1",
                "username": "alice",
                "message_id": "msg-1",
                "event_type": "message_create",
            },
            connector_entry={"workspace_id": "workspace-1", "metadata": {"trust_mode": "guarded"}},
            goal="please investigate this",
            trace_id="trace-1",
        )

        self.assertEqual(request.workspace_id, "workspace-1")
        self.assertEqual(request.channel, "discord")
        self.assertEqual(request.execution_mode, "durable")
        self.assertEqual(request.context_hints["discord"]["channel_id"], "channel-1")
        self.assertEqual(request.message, "please investigate this")

    def test_build_local_worker_turn_request_uses_worker_and_run_identity(self):
        request = build_local_worker_turn_request(
            worker_id="worker-1",
            run={"id": "run-1"},
            context={"workspace_id": "workspace-1"},
            metadata={"thread_id": "thread-1", "execution_target": "local_companion"},
            goal="Summarize priorities",
        )

        self.assertEqual(request.channel, "local_worker")
        self.assertEqual(request.actor.type, "worker")
        self.assertEqual(request.actor.id, "worker-1")
        self.assertEqual(request.session_id, "thread-1")
        self.assertEqual(request.machine_target, "local_companion")
        self.assertEqual(request.message, "Summarize priorities")

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
