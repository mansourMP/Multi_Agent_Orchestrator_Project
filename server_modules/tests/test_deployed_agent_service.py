from __future__ import annotations

import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from server_modules import control_plane_repository
from server_modules import deployed_agent_service


def _fake_scoped_connection(connection):
    @asynccontextmanager
    async def _manager(*args, **kwargs):
        yield connection

    return _manager


def _workspace_record() -> dict[str, object]:
    return {
        "id": "workspace-row-1",
        "tenant_id": "tenant-1",
        "workspace_id": "ws-1",
        "slug": "ws-1",
        "name": "Workspace 1",
        "workspace_type": "team",
        "status": "active",
        "created_by_user_id": "user-owner",
        "metadata": {"billing": {"plan": "free"}},
    }


def _owner_user() -> dict[str, object]:
    return {
        "user_id": "user-owner",
        "email": "owner@example.com",
        "auth_type": "bearer",
        "workspace_access": {
            "ws-1": {
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "role": "owner",
            }
        },
    }


def _member_user() -> dict[str, object]:
    return {
        "user_id": "user-member",
        "email": "member@example.com",
        "auth_type": "bearer",
        "workspace_access": {
            "ws-1": {
                "workspace_id": "ws-1",
                "tenant_id": "tenant-1",
                "role": "member",
            }
        },
    }


def _admin_user() -> dict[str, object]:
    return {
        "user_id": "user-admin",
        "email": "admin@example.com",
        "auth_type": "bearer",
        "auth_admin": True,
        "is_admin": True,
    }


def _deployed_agent_row(
    *,
    deployment_state: str = "draft",
    backing_install_id: str = "ainstall_1",
    last_paused_at: str | None = None,
    metadata: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "id": "dagent_1",
        "tenant_id": "tenant-1",
        "owner_workspace_id": "ws-1",
        "backing_install_id": backing_install_id,
        "created_by_user_id": "user-owner",
        "name": "Store Assistant",
        "avatar": "https://example.com/avatar.png",
        "persona": "Helpful retail agent",
        "system_prompt": "Use the catalog and return policy.",
        "deployment_state": deployment_state,
        "channels": {"telegram": {"enabled": True, "endpoint_key": "store-bot"}},
        "knowledge_sources": [{"id": "doc-1", "uri": "kb://doc-1"}],
        "runtime_target": "cloud",
        "billing_plan": "free",
        "metadata": dict(metadata or {"source": "test"}),
        "last_deployed_at": None,
        "last_paused_at": last_paused_at,
        "created_at": "2026-04-13T10:00:00Z",
        "updated_at": "2026-04-13T10:00:00Z",
    }


def _backing_install(
    *,
    install_id: str = "ainstall_1",
    specialist_mode: str = "owner_edit",
) -> dict[str, object]:
    return {
        "id": install_id,
        "tenant_id": "tenant-1",
        "workspace_id": "ws-1",
        "runtime_profile_id": None,
        "runtime_mode": "hosted_secure",
        "connector_bindings": {},
        "metadata": {"specialist_mode": specialist_mode},
        "specialist_mode": specialist_mode,
    }


def _telegram_readiness_payload(**overrides) -> dict[str, object]:
    payload: dict[str, object] = {
        "channel": "telegram",
        "workspace_id": "ws-1",
        "ready_for_live": True,
        "status": "ready",
        "blockers": [],
        "warnings": [],
        "next_action": "Telegram is ready.",
        "configured_binding": {
            "enabled": True,
            "connector_id": "tg-1",
            "endpoint_key": "store-bot",
            "is_inbound_owner": True,
            "webhook_path": "/channels/telegram/webhook/tg-1",
        },
        "connectors": [
            {
                "id": "tg-1",
                "label": "Store Bot",
                "connector_id": "tg-1",
                "credential_id": "tg-1",
                "endpoint_key": "store-bot",
                "webhook_path": "/channels/telegram/webhook/tg-1",
                "webhook_url": "https://runtime.example/channels/telegram/webhook/tg-1",
            }
        ],
        "webhook": {
            "status": "live",
            "delivery_mode": "webhook",
        },
        "autopilot": {"status": "live"},
        "whatsapp": {"available": False},
    }
    payload.update(overrides)
    return payload


def _conversation_summary_row(
    *,
    session_id: str = "sess-1",
    latest_run_id: str | None = "run-1",
    last_message_at: str = "2026-04-13T12:05:00Z",
) -> dict[str, object]:
    return {
        "session_id": session_id,
        "channel": "telegram",
        "endpoint_key": "store-bot",
        "thread_id": "thread-1",
        "latest_run_id": latest_run_id,
        "last_message": "Can I return this order?",
        "last_message_at": last_message_at,
        "customer_actor": {
            "id": f"user-{session_id}",
            "display_name": f"Customer {session_id}",
            "type": "customer",
        },
    }


def _channel_event(
    *,
    event_id: str,
    direction: str,
    text: str,
    created_at: str,
    run_id: str | None = "run-1",
) -> dict[str, object]:
    return {
        "id": event_id,
        "channel_key": "telegram",
        "endpoint_key": "store-bot",
        "session_key": "sess-1",
        "thread_id": "thread-1",
        "responder_install_id": "ainstall_1",
        "direction": direction,
        "event_type": "message",
        "run_id": run_id,
        "actor": {
            "id": "customer-1" if direction == "inbound" else "agent-1",
            "display_name": "Customer 1" if direction == "inbound" else "Store Assistant",
            "type": "customer" if direction == "inbound" else "agent",
        },
        "text": text,
        "payload": {},
        "metadata": {},
        "status": "logged",
        "created_at": created_at,
        "updated_at": created_at,
    }


def _activity_row(
    *,
    event_id: str,
    created_at: str,
    event_class: str,
    action: str,
    summary: str,
    payload: dict[str, object] | None = None,
    metadata: dict[str, object] | None = None,
    run_id: str | None = "run-1",
) -> dict[str, object]:
    return {
        "id": event_id,
        "workspace_id": "ws-1",
        "install_id": "ainstall_1",
        "run_id": run_id,
        "thread_id": "thread-1",
        "session_key": "sess-1",
        "channel": "telegram",
        "direction": "system",
        "event_class": event_class,
        "action": action,
        "title": summary,
        "summary": summary,
        "status": "logged",
        "payload": dict(payload or {}),
        "metadata": dict(metadata or {}),
        "created_at": created_at,
    }


def _live_run_snapshot() -> dict[str, object]:
    return {
        "run_id": "run-1",
        "thread_id": "thread-1",
        "status": "completed",
        "updated_at": "2026-04-13T12:05:03Z",
        "events": [
            {
                "event": "workflow_node_start",
                "message": "Lookup return policy",
                "ts": "2026-04-13T12:05:01.500000Z",
                "step_id": "node-1",
                "step_number": 1,
            }
        ],
        "result_data": {
            "summary": "Connector action completed: telegram_bot.send_message.",
            "connector_action": {
                "connector": "telegram_bot",
                "action_id": "send_message",
                "chat_id": "store-bot",
                "result": "sent",
            },
        },
    }


class DeployedAgentServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_control_plane_schema_declares_deployed_agents_table_and_unique_backing_install(self) -> None:
        schema = control_plane_repository.CONTROL_PLANE_SCHEMA_SQL
        self.assertIn("CREATE TABLE IF NOT EXISTS deployed_agents", schema)
        self.assertIn("backing_install_id TEXT NOT NULL REFERENCES workspace_agent_installs(id) ON DELETE CASCADE", schema)
        self.assertIn("UNIQUE(backing_install_id)", schema)

    async def test_repository_create_and_resolve_deployed_agent_rows(self) -> None:
        row = _deployed_agent_row()
        connection = AsyncMock()
        connection.fetchrow = AsyncMock(side_effect=[row, row, row])
        connection.fetch = AsyncMock(return_value=[row])

        with patch(
            "server_modules.control_plane_repository._scoped_connection",
            new=_fake_scoped_connection(connection),
        ):
            created = await control_plane_repository.create_deployed_agent(
                tenant_id="tenant-1",
                owner_workspace_id="ws-1",
                backing_install_id="ainstall_1",
                created_by_user_id="user-owner",
                name="Store Assistant",
                avatar="https://example.com/avatar.png",
                persona="Helpful retail agent",
                system_prompt="Use the catalog and return policy.",
                deployment_state="draft",
                channels={"telegram": {"enabled": True, "endpoint_key": "store-bot"}},
                knowledge_sources=[{"id": "doc-1", "uri": "kb://doc-1"}],
                runtime_target="cloud",
                billing_plan="free",
                metadata={"source": "test"},
            )
            by_id = await control_plane_repository.get_deployed_agent_by_id(
                "dagent_1",
                tenant_id="tenant-1",
                owner_workspace_id="ws-1",
            )
            by_backing = await control_plane_repository.get_deployed_agent_by_backing_install_id(
                "ainstall_1",
                tenant_id="tenant-1",
                owner_workspace_id="ws-1",
            )
            listed = await control_plane_repository.list_deployed_agents_for_workspace(
                "ws-1",
                tenant_id="tenant-1",
            )

        self.assertEqual(created["id"], "dagent_1")
        self.assertEqual(by_id["backing_install_id"], "ainstall_1")
        self.assertEqual(by_backing["owner_workspace_id"], "ws-1")
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["name"], "Store Assistant")
        insert_query = connection.fetchrow.await_args_list[0].args[0]
        self.assertIn("INSERT INTO deployed_agents", insert_query)

    async def test_repository_update_deployed_agent_returns_normalized_row(self) -> None:
        connection = AsyncMock()
        updated_row = _deployed_agent_row(deployment_state="staging")
        connection.fetchrow = AsyncMock(return_value=updated_row)

        with patch(
            "server_modules.control_plane_repository._scoped_connection",
            new=_fake_scoped_connection(connection),
        ):
            updated = await control_plane_repository.update_deployed_agent(
                "dagent_1",
                tenant_id="tenant-1",
                owner_workspace_id="ws-1",
                updates={
                    "deployment_state": "staging",
                    "channels": {"telegram": {"enabled": True}},
                },
            )

        self.assertEqual(updated["deployment_state"], "staging")
        update_query = connection.fetchrow.await_args.args[0]
        self.assertIn("UPDATE deployed_agents", update_query)
        self.assertIn("deployment_state = $4", update_query)

    async def test_repository_lists_deployed_agent_conversation_sessions_using_existing_channel_event_truth(self) -> None:
        summary_row = _conversation_summary_row()
        connection = AsyncMock()
        connection.fetch = AsyncMock(return_value=[summary_row])

        with patch(
            "server_modules.control_plane_repository._scoped_connection",
            new=_fake_scoped_connection(connection),
        ):
            rows = await control_plane_repository.list_deployed_agent_conversation_sessions(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                deployed_agent_id="dagent_1",
                backing_install_id="ainstall_1",
                limit=10,
                offset=0,
            )

        self.assertEqual(rows[0]["session_id"], "sess-1")
        query = connection.fetch.await_args.args[0]
        self.assertIn("metadata->>'deployed_agent_id' = $3", query)
        self.assertIn("OR responder_install_id = $4", query)

    async def test_repository_summarize_deployed_agent_activity_rollup_uses_existing_channel_event_truth(self) -> None:
        connection = AsyncMock()
        connection.fetchrow = AsyncMock(
            return_value={
                "deployed_agent_id": "dagent_1",
                "active_users_30d": 12,
                "session_count_30d": 3,
                "message_count_day": 3,
                "message_count_week": 18,
                "message_count_month": 58,
                "latest_message_at": "2026-04-13T12:05:00Z",
            }
        )

        with patch(
            "server_modules.control_plane_repository._scoped_connection",
            new=_fake_scoped_connection(connection),
        ):
            payload = await control_plane_repository.summarize_deployed_agent_activity_rollup(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                deployed_agent_id="dagent_1",
                backing_install_id="ainstall_1",
            )

        self.assertEqual(payload["active_users_30d"], 12)
        query = connection.fetchrow.await_args.args[0]
        self.assertIn("FROM agent_channel_events", query)
        self.assertIn("message_count_month", query)

    async def test_repository_lists_deployed_agent_session_analytics_using_existing_event_truth(self) -> None:
        connection = AsyncMock()
        connection.fetch = AsyncMock(
            return_value=[
                {
                    "session_id": "sess-1",
                    "latest_run_id": "run-1",
                    "had_escalation": True,
                    "latest_outcome": "completed",
                    "last_activity_at": "2026-04-13T12:05:00Z",
                }
            ]
        )

        with patch(
            "server_modules.control_plane_repository._scoped_connection",
            new=_fake_scoped_connection(connection),
        ):
            rows = await control_plane_repository.list_deployed_agent_session_analytics(
                tenant_id="tenant-1",
                workspace_id="ws-1",
                deployed_agent_id="dagent_1",
                backing_install_id="ainstall_1",
            )

        self.assertEqual(rows[0]["session_id"], "sess-1")
        query = connection.fetch.await_args.args[0]
        self.assertIn("FROM activity_ledger_events", query)
        self.assertIn("had_escalation", query)

    async def test_create_draft_deployed_agent_creates_backing_specialist_install(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(backing_install_id="ainstall_1")

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ) as create_specialist_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            created = await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                avatar="https://example.com/avatar.png",
                persona="Helpful retail agent",
                system_prompt="Use the catalog and return policy.",
                channels={"telegram": {"enabled": True, "endpoint_key": "store-bot"}},
                knowledge_sources=[{"id": "doc-1", "uri": "kb://doc-1"}],
                runtime_target="cloud",
                billing_plan="free",
                metadata={"paused_message": "  We are closed for inventory. Please come back later.  "},
            )

        self.assertEqual(created["backing_install_id"], "ainstall_1")
        self.assertEqual(created["deployment_state"], "draft")
        specialist_kwargs = create_specialist_mock.await_args.kwargs
        self.assertEqual(specialist_kwargs["label"], "Store Assistant")
        self.assertEqual(specialist_kwargs["metadata"]["specialist_mode"], "owner_edit")
        self.assertEqual(specialist_kwargs["manifest"].identity.name, "Store Assistant")
        self.assertEqual(
            specialist_kwargs["tool_toggles"],
            {
                "web_search": False,
                "http_request": False,
                "spreadsheet_read": False,
                "spreadsheet_append": False,
                "gmail_send": False,
                "calendar_write": False,
            },
        )
        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertEqual(persisted_kwargs["backing_install_id"], "ainstall_1")
        self.assertEqual(
            persisted_kwargs["metadata"]["paused_message"],
            "We are closed for inventory. Please come back later.",
        )

    async def test_create_draft_deployed_agent_normalizes_daily_limit_metadata(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "daily_message_limit": 25,
                "upgrade_cta_url": "https://app.empyralist.com/signup",
                "upgrade_cta_label": "Continue on Empyralist",
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                metadata={
                    "daily_message_limit": " 25 ",
                    "upgrade_cta_url": " https://app.empyralist.com/signup ",
                    "upgrade_cta_label": " Continue on Empyralist ",
                },
            )

        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertEqual(persisted_kwargs["metadata"]["daily_message_limit"], 25)
        self.assertEqual(
            persisted_kwargs["metadata"]["upgrade_cta_url"],
            "https://app.empyralist.com/signup",
        )
        self.assertEqual(
            persisted_kwargs["metadata"]["upgrade_cta_label"],
            "Continue on Empyralist",
        )

    async def test_create_draft_deployed_agent_normalizes_monthly_cost_cap_metadata(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "monthly_cost_cap_usd": 25.5,
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                metadata={
                    "monthly_cost_cap_usd": " 25.5 ",
                },
            )

        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertEqual(persisted_kwargs["metadata"]["monthly_cost_cap_usd"], 25.5)

    async def test_create_draft_deployed_agent_normalizes_memory_toggle_metadata(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "memory_enabled": True,
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                metadata={
                    "memory_enabled": " enabled ",
                },
            )

        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertTrue(persisted_kwargs["metadata"]["memory_enabled"])

    async def test_create_draft_deployed_agent_normalizes_health_safety_metadata(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "health_safety_enabled": True,
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="HealthGuide",
                metadata={
                    "health_safety_enabled": " enabled ",
                },
            )

        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertTrue(persisted_kwargs["metadata"]["health_safety_enabled"])

    async def test_create_draft_deployed_agent_persists_provider_model_selection(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "provider": "deepseek",
                "model": "deepseek-reasoner",
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ) as create_specialist_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            created = await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                provider="deepseek",
                model="deepseek-reasoner",
            )

        self.assertEqual(created["provider"], "deepseek")
        self.assertEqual(created["model"], "deepseek-reasoner")
        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertEqual(persisted_kwargs["metadata"]["provider"], "deepseek")
        self.assertEqual(persisted_kwargs["metadata"]["model"], "deepseek-reasoner")
        specialist_kwargs = create_specialist_mock.await_args.kwargs
        self.assertEqual(specialist_kwargs["metadata"]["provider"], "deepseek")
        self.assertEqual(specialist_kwargs["metadata"]["model"], "deepseek-reasoner")

    async def test_create_draft_deployed_agent_applies_workspace_admin_defaults(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "platform_cta_label": "Join now",
                "health_safety_enabled": True,
                "context_budget_preset": "deep",
            }
        )
        workspace = _workspace_record()
        workspace["metadata"] = {
            "billing": {"plan": "free"},
            "admin_defaults": {
                "payload": {
                    "runtime_target": "local",
                    "billing_plan": "pro",
                    "public_start_cta_label": "Join now",
                    "public_start_cta_url": "https://example.com/start",
                    "context_budget_preset": "deep",
                    "retention_preset": "extended",
                    "health_safety_enabled": True,
                }
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=workspace),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ) as create_specialist_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                config={
                    "customer_policy": {
                        "public_intro": "Fast help for shoppers.",
                    }
                },
            )

        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertEqual(persisted_kwargs["runtime_target"], "local")
        self.assertEqual(persisted_kwargs["billing_plan"], "pro")
        self.assertEqual(persisted_kwargs["metadata"]["platform_cta_label"], "Join now")
        self.assertEqual(persisted_kwargs["metadata"]["context_budget_preset"], "deep")
        self.assertEqual(persisted_kwargs["metadata"]["retention_preset"], "extended")
        self.assertTrue(persisted_kwargs["metadata"]["health_safety_enabled"])
        specialist_kwargs = create_specialist_mock.await_args.kwargs
        self.assertEqual(specialist_kwargs["metadata"]["platform_cta_url"], "https://example.com/start")
        self.assertEqual(specialist_kwargs["metadata"]["public_intro"], "Fast help for shoppers.")

    async def test_create_draft_deployed_agent_separates_runtime_placement_from_computer_automation(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={
                "runtime_placement": "managed_cloud",
                "computer_automation": {"enabled": False, "allowed_domains": []},
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            created = await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                config={
                    "runtime_placement": "managed_cloud",
                    "computer_automation": {
                        "enabled": False,
                        "runtime_class": "virtual_browser",
                        "allowed_domains": ["supplier.example.com"],
                        "max_concurrent_sessions": 1,
                    },
                },
            )

        persisted_kwargs = create_deployed_agent_mock.await_args.kwargs
        self.assertEqual(persisted_kwargs["runtime_target"], "cloud")
        self.assertEqual(persisted_kwargs["metadata"]["runtime_placement"], "managed_cloud")
        self.assertFalse(persisted_kwargs["metadata"]["computer_automation"]["enabled"])
        self.assertFalse(created["config"]["computer_automation"]["enabled"])
        self.assertFalse(created["config"]["agent_workspace"]["isolation"]["sage_memory_access"])

    async def test_create_draft_deployed_agent_supports_customer_hosted_without_cloud_computer(self) -> None:
        backing_install = _backing_install()
        persisted_row = _deployed_agent_row(
            metadata={"runtime_placement": "customer_hosted"},
        )
        persisted_row["runtime_target"] = "self_hosted"

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.create_workspace_specialist",
                new=AsyncMock(return_value=backing_install),
            ) as create_specialist_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.create_deployed_agent",
                new=AsyncMock(return_value=persisted_row),
            ) as create_deployed_agent_mock,
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=backing_install),
            ),
        ):
            await deployed_agent_service.create_draft_deployed_agent(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                name="Store Assistant",
                config={"runtime_placement": "customer_hosted"},
            )

        self.assertEqual(create_deployed_agent_mock.await_args.kwargs["runtime_target"], "self_hosted")
        self.assertEqual(create_specialist_mock.await_args.kwargs["runtime_mode"], "hosted_secure")

    async def test_create_draft_deployed_agent_enforces_free_specialist_limit(self) -> None:
        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[_deployed_agent_row()]),
            ),
        ):
            with self.assertRaises(deployed_agent_service.entitlements_service.EntitlementQuotaExceededError) as ctx:
                await deployed_agent_service.create_draft_deployed_agent(
                    current_user=_owner_user(),
                    owner_workspace_id="ws-1",
                    name="Second Specialist",
                )

        self.assertEqual(ctx.exception.reason, "specialist_limit_exceeded")

    async def test_list_deployed_agent_analytics_uses_workspace_roster_and_service_summary(self) -> None:
        analytics_payload = {
            "items": [
                {
                    "deployed_agent_id": "dagent_1",
                    "active_users_last_30d": 12,
                }
            ]
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agents_for_workspace",
                new=AsyncMock(return_value=[_deployed_agent_row()]),
            ) as list_agents_mock,
            patch(
                "server_modules.deployed_agent_service.deployed_agent_analytics_service.summarize_workspace_deployed_agent_analytics",
                new=AsyncMock(return_value=analytics_payload),
            ) as summarize_mock,
        ):
            payload = await deployed_agent_service.list_deployed_agent_analytics(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
            )

        self.assertEqual(payload, analytics_payload)
        self.assertEqual(list_agents_mock.await_args.kwargs["tenant_id"], "tenant-1")
        self.assertEqual(summarize_mock.await_args.kwargs["workspace_id"], "ws-1")

    async def test_get_deployed_agent_analytics_returns_single_summary(self) -> None:
        analytics_payload = {
            "deployed_agent_id": "dagent_1",
            "active_users_last_30d": 12,
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ) as get_agent_mock,
            patch(
                "server_modules.deployed_agent_service.deployed_agent_analytics_service.summarize_deployed_agent_analytics",
                new=AsyncMock(return_value=analytics_payload),
            ) as summarize_mock,
        ):
            payload = await deployed_agent_service.get_deployed_agent_analytics(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
            )

        self.assertEqual(payload, analytics_payload)
        self.assertEqual(get_agent_mock.await_args.kwargs["tenant_id"], "tenant-1")
        self.assertEqual(summarize_mock.await_args.kwargs["workspace_id"], "ws-1")

    async def test_execute_deployed_agent_catalog_action_reads_scoped_live_catalog(self) -> None:
        metadata = {
            "public_tier": "pro",
            "provider": "deepseek",
            "model": "deepseek-v4-pro",
            "estimated_total_tokens": 1111,
            "live_data_connectors": {
                "product_catalog": {
                    "connector_type": "google_sheets",
                    "connector_id": "gsheet-products-1",
                    "workspace_id": "ws-1",
                    "deployed_agent_id": "dagent_1",
                    "rows": [
                        {
                            "sku": "SHOE-AIRMAX-42-BLK",
                            "product_name": "Nike Air Max 90",
                            "category": "shoes",
                            "price": 129.0,
                            "currency": "USD",
                            "quantity_available": 8,
                            "variant": "black / size 42",
                            "brand": "Nike",
                        }
                    ],
                }
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row(metadata=metadata)),
            ) as get_agent_mock,
        ):
            payload = await deployed_agent_service.execute_deployed_agent_catalog_action(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                action_id="catalog.lookup",
                arguments={
                    "connector_id": "gsheet-products-1",
                    "query": "Do you have Nike Air Max 90 black size 42?",
                },
            )

        self.assertTrue(payload["read_only"])
        self.assertEqual(payload["matches"][0]["sku"], "SHOE-AIRMAX-42-BLK")
        self.assertIn("8 in stock", payload["answer"])
        self.assertEqual(get_agent_mock.await_args.kwargs["tenant_id"], "tenant-1")
        self.assertEqual(get_agent_mock.await_args.kwargs["owner_workspace_id"], "ws-1")

    async def test_execute_deployed_agent_catalog_action_rejects_cross_agent_source(self) -> None:
        metadata = {
            "live_data_connectors": {
                "product_catalog": {
                    "connector_type": "google_sheets",
                    "workspace_id": "ws-1",
                    "deployed_agent_id": "dagent_other",
                    "rows": [
                        {
                            "sku": "PRIVATE-SKU",
                            "product_name": "Private Product",
                            "category": "private",
                            "price": 1.0,
                            "currency": "USD",
                            "quantity_available": 1,
                        }
                    ],
                }
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row(metadata=metadata)),
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                await deployed_agent_service.execute_deployed_agent_catalog_action(
                    deployed_agent_id="dagent_1",
                    current_user=_owner_user(),
                    owner_workspace_id="ws-1",
                    action_id="catalog.lookup",
                    arguments={"query": "Private Product"},
                )

        self.assertEqual(error.exception.status_code, 403)

    async def test_evaluate_deployed_shop_assistant_customer_question_returns_business_metrics(self) -> None:
        metadata = {
            "public_tier": "pro",
            "provider": "deepseek",
            "model": "deepseek-v4-pro",
            "estimated_total_tokens": 1111,
            "live_data_connectors": {
                "product_catalog": {
                    "connector_type": "google_sheets",
                    "connector_id": "gsheet-products-1",
                    "workspace_id": "ws-1",
                    "deployed_agent_id": "dagent_1",
                    "rows": [
                        {
                            "sku": "SHOE-AIRMAX-42-BLK",
                            "product_name": "Nike Air Max 90",
                            "category": "shoes",
                            "price": 129.0,
                            "currency": "USD",
                            "quantity_available": 8,
                            "variant": "black / size 42",
                            "brand": "Nike",
                        }
                    ],
                }
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row(metadata=metadata)),
            ),
        ):
            payload = await deployed_agent_service.evaluate_deployed_shop_assistant_customer_question(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                connector_id="gsheet-products-1",
                customer_message="Do you have Nike Air Max 90 black size 42?",
            )

        self.assertEqual(payload["status"], "answered")
        self.assertIn("8 in stock", payload["answer"])
        self.assertEqual(payload["roi_metrics"]["questions_handled"], 1)
        self.assertEqual(payload["roi_metrics"]["inventory_hits"], 1)
        evidence = payload["activity_billing_evidence"]
        self.assertEqual(evidence["visible_activity"]["tier_label"], "Pro")
        self.assertNotIn("raw_provider", evidence["visible_activity"])
        self.assertEqual(evidence["admin_audit"]["raw_provider"], "deepseek")
        self.assertEqual(evidence["admin_audit"]["raw_model"], "deepseek-v4-pro")
        self.assertTrue(
            any(item["credit_item_type"] == "connector_read" for item in evidence["credit_line_items"])
        )

    def test_project_deployed_agent_includes_restaurant_specialist_profile(self) -> None:
        row = _deployed_agent_row(
            metadata={
                "source": "test",
                "provider": "gemini",
                "model": "gemini-2.5-flash",
                "memory_enabled": True,
                "context_budget_preset": "balanced",
                "retention_preset": "standard",
                "selected_tool_ids": ["spreadsheet_read", "spreadsheet_append"],
                "platform_cta_label": "Open menu",
                "platform_cta_url": "https://menu.example.com/bluebird",
            }
        )
        row["knowledge_sources"] = [
            {"id": "menu-pdf", "uri": "kb://menu-pdf", "title": "Main menu"},
            {"id": "menu-sheet", "uri": "sheet://daily-menu", "title": "Daily menu"},
        ]
        row["channels"] = {
            "telegram": {
                "enabled": True,
                "endpoint_key": "bluebird-cafe",
                "bot_username": "bluebirdcafe_bot",
            }
        }

        projected = deployed_agent_service.project_deployed_agent(row, include_internal=True)

        self.assertIsInstance(projected, dict)
        config = projected["config"]
        profile = config["specialist_profile"]
        self.assertEqual(profile["knowledge"]["mode"], "menu_reference")
        self.assertEqual(profile["knowledge"]["source_count"], 2)
        self.assertEqual(profile["live_data"]["connector_family"], "google_workspace")
        self.assertTrue(profile["memory"]["memory_enabled"])
        self.assertEqual(profile["actions"]["order_capture_mode"], "spreadsheet_append")
        self.assertEqual(profile["channel"]["primary"], "telegram_bot")

    def test_require_deployed_agent_admin_access_allows_owner(self) -> None:
        resolved = deployed_agent_service.require_deployed_agent_admin_access(
            current_user=_owner_user(),
            workspace_id="ws-1",
        )
        self.assertEqual(resolved, "ws-1")

    def test_require_deployed_agent_admin_access_allows_auth_admin(self) -> None:
        resolved = deployed_agent_service.require_deployed_agent_admin_access(
            current_user=_admin_user(),
            workspace_id="ws-1",
        )
        self.assertEqual(resolved, "ws-1")

    def test_require_deployed_agent_admin_access_rejects_member(self) -> None:
        with self.assertRaises(HTTPException) as error:
            deployed_agent_service.require_deployed_agent_admin_access(
                current_user=_member_user(),
                workspace_id="ws-1",
            )

        self.assertEqual(error.exception.status_code, 403)

    def test_validate_state_transition_rejects_invalid_transition(self) -> None:
        with self.assertRaises(ValueError) as error:
            deployed_agent_service.validate_state_transition("live", "draft")

        self.assertIn("live -> draft", str(error.exception))

    def test_validate_can_deploy_requires_customer_live_backing_install(self) -> None:
        with self.assertRaises(ValueError) as error:
            deployed_agent_service.validate_can_deploy(
                deployed_agent=_deployed_agent_row(deployment_state="live"),
                backing_install=_backing_install(specialist_mode="owner_edit"),
            )

        self.assertIn("customer_live", str(error.exception))

    def test_validate_can_deploy_rejects_non_telegram_live_channels(self) -> None:
        deployed_agent = _deployed_agent_row(deployment_state="live")
        deployed_agent["channels"] = {
            "telegram": {"enabled": True},
            "whatsapp": {"enabled": True},
        }

        with self.assertRaises(ValueError) as error:
            deployed_agent_service.validate_can_deploy(
                deployed_agent=deployed_agent,
                backing_install=_backing_install(specialist_mode="customer_live"),
            )

        self.assertIn("Only Telegram", str(error.exception))

    def test_validate_can_deploy_allows_workspace_configured_live_channels(self) -> None:
        deployed_agent = _deployed_agent_row(deployment_state="live")
        deployed_agent["channels"] = {
            "telegram": {"enabled": True},
            "whatsapp": {"enabled": True},
        }

        deployed_agent_service.validate_can_deploy(
            deployed_agent=deployed_agent,
            backing_install=_backing_install(specialist_mode="customer_live"),
            allowed_live_channels={"telegram", "whatsapp"},
        )

    def test_paused_channel_reply_uses_safe_default_when_not_configured(self) -> None:
        reply = deployed_agent_service.paused_channel_reply(
            deployed_agent=_deployed_agent_row(deployment_state="paused"),
        )

        self.assertEqual(reply, "Store Assistant is temporarily paused. Please try again shortly.")

    def test_paused_channel_reply_uses_configured_metadata_message(self) -> None:
        reply = deployed_agent_service.paused_channel_reply(
            deployed_agent=_deployed_agent_row(
                deployment_state="paused",
                metadata={
                    "source": "test",
                    "paused_message": "The store team is offline right now. Please check back after 9 AM.",
                },
            ),
        )

        self.assertEqual(reply, "The store team is offline right now. Please check back after 9 AM.")

    def test_daily_limit_channel_reply_uses_configured_cta(self) -> None:
        reply = deployed_agent_service.daily_limit_channel_reply(
            deployed_agent=_deployed_agent_row(
                metadata={
                    "daily_message_limit": 25,
                    "upgrade_cta_url": "https://app.empyralist.com/signup",
                    "upgrade_cta_label": "Continue on Empyralist",
                }
            ),
        )

        self.assertEqual(
            reply,
            "Store Assistant has reached today's free message limit. Continue on Empyralist: https://app.empyralist.com/signup\n\nPrivacy: http://127.0.0.1:3000/privacy",
        )

    async def test_pause_deployed_agent_from_live_sets_pause_timestamp(self) -> None:
        paused_row = _deployed_agent_row(
            deployment_state="paused",
            last_paused_at="2026-04-13T11:00:00Z",
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row(deployment_state="live")),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.set_deployed_agent_state",
                new=AsyncMock(return_value=paused_row),
            ) as set_state_mock,
        ):
            paused = await deployed_agent_service.pause_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
            )

        self.assertEqual(paused["deployment_state"], "paused")
        self.assertEqual(paused["last_paused_at"], "2026-04-13T11:00:00Z")
        self.assertTrue(set_state_mock.await_args.kwargs["last_paused_at"])

    async def test_update_deployed_agent_mirrors_to_backing_specialist(self) -> None:
        updated_row = _deployed_agent_row()
        updated_row["name"] = "Store Concierge"
        updated_install = _backing_install()

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=updated_install),
            ) as update_manifest_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ),
        ):
            updated = await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={
                    "name": "Store Concierge",
                    "persona": "Calm concierge",
                    "channels": {
                        "telegram": {
                            "enabled": True,
                            "is_inbound_owner": True,
                            "endpoint_key": "store-bot",
                        }
                    },
                },
            )

        self.assertEqual(updated["name"], "Store Concierge")
        self.assertEqual(update_manifest_mock.await_args.kwargs["manifest"].identity.name, "Store Concierge")
        self.assertEqual(update_manifest_mock.await_args.kwargs["metadata"]["specialist_mode"], "owner_edit")
        self.assertTrue(update_manifest_mock.await_args.kwargs["channel_bindings"]["telegram"]["is_inbound_owner"])

    async def test_update_deployed_agent_enriches_telegram_binding_from_connector_selection(self) -> None:
        updated_row = _deployed_agent_row()

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ),
            patch(
                "server_modules.deployed_agent_service._workspace_telegram_connector_options",
                return_value=_telegram_readiness_payload()["connectors"],
            ),
            patch(
                "server_modules.deployed_agent_service._workspace_telegram_status_payload",
                return_value=_telegram_readiness_payload(),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ) as update_deployed_agent_mock,
        ):
            await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={
                    "channels": {
                        "telegram": {
                            "enabled": True,
                            "connector_id": "tg-1",
                        }
                    },
                },
            )

        telegram = update_deployed_agent_mock.await_args.kwargs["updates"]["channels"]["telegram"]
        self.assertEqual(telegram["connector_id"], "tg-1")
        self.assertEqual(telegram["credential_id"], "tg-1")
        self.assertEqual(telegram["endpoint_key"], "store-bot")
        self.assertTrue(telegram["is_inbound_owner"])

    async def test_update_deployed_agent_can_clear_paused_message_metadata(self) -> None:
        existing = _deployed_agent_row(metadata={"source": "test", "paused_message": "Temporarily offline."})
        updated_row = _deployed_agent_row(metadata={"source": "test"})

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=existing),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ) as update_deployed_agent_mock,
        ):
            updated = await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={"metadata": {"paused_message": None}},
            )

        self.assertNotIn("paused_message", update_deployed_agent_mock.await_args.kwargs["updates"]["metadata"])
        self.assertNotIn("paused_message", updated["metadata"])

    async def test_update_deployed_agent_can_clear_daily_limit_metadata(self) -> None:
        existing = _deployed_agent_row(
            metadata={
                "source": "test",
                "daily_message_limit": 25,
                "upgrade_cta_url": "https://app.empyralist.com/signup",
                "upgrade_cta_label": "Continue on Empyralist",
            }
        )
        updated_row = _deployed_agent_row(metadata={"source": "test"})

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=existing),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ) as update_deployed_agent_mock,
        ):
            updated = await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={
                    "metadata": {
                        "daily_message_limit": None,
                        "upgrade_cta_url": None,
                        "upgrade_cta_label": None,
                    }
                },
            )

        metadata = update_deployed_agent_mock.await_args.kwargs["updates"]["metadata"]
        self.assertNotIn("daily_message_limit", metadata)
        self.assertNotIn("upgrade_cta_url", metadata)
        self.assertNotIn("upgrade_cta_label", metadata)
        self.assertNotIn("daily_message_limit", updated["metadata"])

    async def test_update_deployed_agent_preserves_current_budget_cycle_operational_state(self) -> None:
        existing = _deployed_agent_row(
            metadata={
                "source": "test",
                "monthly_cost_cap_usd": 25.0,
                "current_budget_cycle": {
                    "usage_month": "2026-04-01",
                    "current_burn_usd": 8.5,
                    "percent_used": 34.0,
                },
            }
        )
        updated_row = _deployed_agent_row(
            metadata={
                "source": "test",
                "monthly_cost_cap_usd": 30.0,
                "current_budget_cycle": {
                    "usage_month": "2026-04-01",
                    "current_burn_usd": 8.5,
                    "percent_used": 34.0,
                },
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=existing),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ) as update_deployed_agent_mock,
        ):
            updated = await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={
                    "metadata": {
                        "monthly_cost_cap_usd": "30",
                    }
                },
            )

        metadata = update_deployed_agent_mock.await_args.kwargs["updates"]["metadata"]
        operational_state = update_deployed_agent_mock.await_args.kwargs["updates"]["operational_state"]
        self.assertEqual(metadata["monthly_cost_cap_usd"], 30.0)
        self.assertEqual(operational_state["current_budget_cycle"]["current_burn_usd"], 8.5)
        self.assertEqual(updated["operational_state"]["current_budget_cycle"]["current_burn_usd"], 8.5)

    async def test_update_deployed_agent_can_disable_memory_metadata(self) -> None:
        existing = _deployed_agent_row(
            metadata={
                "source": "test",
                "memory_enabled": True,
            }
        )
        updated_row = _deployed_agent_row(
            metadata={
                "source": "test",
                "memory_enabled": False,
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=existing),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ) as update_deployed_agent_mock,
        ):
            updated = await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={
                    "metadata": {
                        "memory_enabled": False,
                    }
                },
            )

        metadata = update_deployed_agent_mock.await_args.kwargs["updates"]["metadata"]
        self.assertFalse(metadata["memory_enabled"])
        self.assertFalse(updated["metadata"]["memory_enabled"])

    async def test_update_deployed_agent_can_change_provider_model_selection(self) -> None:
        existing = _deployed_agent_row(
            metadata={
                "source": "test",
                "provider": "openai",
                "model": "gpt-4o",
            }
        )
        updated_row = _deployed_agent_row(
            metadata={
                "source": "test",
                "provider": "anthropic",
                "model": "claude-3-5-sonnet-20241022",
            }
        )

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=existing),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=_backing_install()),
            ) as update_specialist_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.update_deployed_agent",
                new=AsyncMock(return_value=updated_row),
            ) as update_deployed_agent_mock,
        ):
            updated = await deployed_agent_service.update_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                updates={
                    "provider": "anthropic",
                    "model": "claude-3-5-sonnet-20241022",
                },
            )

        self.assertEqual(updated["provider"], "anthropic")
        self.assertEqual(updated["model"], "claude-3-5-sonnet-20241022")
        metadata = update_deployed_agent_mock.await_args.kwargs["updates"]["metadata"]
        self.assertEqual(metadata["provider"], "anthropic")
        self.assertEqual(metadata["model"], "claude-3-5-sonnet-20241022")
        specialist_metadata = update_specialist_mock.await_args.kwargs["metadata"]
        self.assertEqual(specialist_metadata["provider"], "anthropic")
        self.assertEqual(specialist_metadata["model"], "claude-3-5-sonnet-20241022")

    async def test_list_deployed_agent_conversations_paginates_deterministically(self) -> None:
        session_rows = [
            _conversation_summary_row(session_id="sess-2", latest_run_id="run-2", last_message_at="2026-04-13T12:06:00Z"),
            _conversation_summary_row(session_id="sess-1", latest_run_id="run-1", last_message_at="2026-04-13T12:05:00Z"),
        ]

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agent_conversation_sessions",
                new=AsyncMock(return_value=session_rows),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_activity_ledger_events",
                new=AsyncMock(
                    side_effect=[
                        [
                            _activity_row(
                                event_id="aevt-1",
                                created_at="2026-04-13T12:06:01Z",
                                event_class="approval",
                                action="approval_requested",
                                summary="Approval requested",
                            )
                        ],
                        [],
                        [],
                    ]
                ),
            ),
        ):
            payload = await deployed_agent_service.list_deployed_agent_conversations(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                limit=1,
                offset=0,
            )

        self.assertEqual(payload["offset"], 0)
        self.assertEqual(payload["limit"], 1)
        self.assertTrue(payload["has_more"])
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["session_id"], "sess-2")
        self.assertEqual(payload["items"][0]["escalation_state"], "approval_requested")

    async def test_get_deployed_agent_conversation_detail_includes_messages_tool_calls_and_approval_events(self) -> None:
        session_events = [
            _channel_event(
                event_id="cevt-1",
                direction="inbound",
                text="Can I return this order?",
                created_at="2026-04-13T12:05:00Z",
            ),
            _channel_event(
                event_id="cevt-2",
                direction="outbound",
                text="I can help with that. Let me check the return policy.",
                created_at="2026-04-13T12:05:02Z",
            ),
        ]

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agent_conversation_events",
                new=AsyncMock(return_value=session_events),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_activity_ledger_events",
                new=AsyncMock(
                    side_effect=[
                        [
                            _activity_row(
                                event_id="aevt-tool",
                                created_at="2026-04-13T12:05:01Z",
                                event_class="specialist_activity",
                                action="tool_called",
                                summary="Executed telegram_bot.send_message",
                                payload={
                                    "tool_name": "telegram_bot.send_message",
                                    "connector_action": {
                                        "connector": "telegram_bot",
                                        "action_id": "send_message",
                                    },
                                },
                            ),
                            _activity_row(
                                event_id="aevt-approval",
                                created_at="2026-04-13T12:05:03Z",
                                event_class="approval",
                                action="approval_requested",
                                summary="Approval requested",
                                payload={"approval_id": "approval-1"},
                            ),
                            _activity_row(
                                event_id="aevt-escalation",
                                created_at="2026-04-13T12:05:04Z",
                                event_class="blocked_action",
                                action="escalated",
                                summary="Escalated to human review",
                                payload={"escalated": True},
                            ),
                        ],
                        [],
                        [
                            _activity_row(
                                event_id="aevt-run",
                                created_at="2026-04-13T12:05:05Z",
                                event_class="run_status",
                                action="completed",
                                summary="Run completed",
                            )
                        ],
                    ]
                ),
            ),
            patch(
                "server_modules.deployed_agent_service.run_state_repository.get_live_run",
                new=AsyncMock(return_value=_live_run_snapshot()),
            ),
            patch(
                "server_modules.deployed_agent_service.run_state_repository.get_archived_run",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "server_modules.deployed_agent_service.run_state_repository.get_approval_record",
                new=AsyncMock(
                    return_value={
                        "approval_id": "approval-1",
                        "run_id": "run-1",
                        "status": "resolved",
                        "resolution": "approved",
                    }
                ),
            ),
        ):
            payload = await deployed_agent_service.get_deployed_agent_conversation_detail(
                deployed_agent_id="dagent_1",
                session_id="sess-1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
            )

        self.assertEqual(payload["session_id"], "sess-1")
        self.assertEqual(payload["messages"][0]["direction"], "inbound")
        self.assertEqual(payload["messages"][1]["direction"], "outbound")
        self.assertTrue(payload["run_steps"])
        self.assertTrue(any(item["action"] == "completed" for item in payload["run_steps"]))
        self.assertTrue(any(item["action"] == "workflow_node_start" for item in payload["run_steps"]))
        self.assertTrue(any(item["tool_name"] == "telegram_bot.send_message" for item in payload["tool_calls"]))
        self.assertTrue(any(item["approval_id"] == "approval-1" for item in payload["approval_events"]))
        self.assertTrue(payload["escalation_events"])
        self.assertEqual(payload["outcome"], "completed")
        self.assertEqual(payload["entries"][0]["id"], "cevt-1")
        self.assertTrue(any(item["kind"] == "run_step" for item in payload["entries"]))

    async def test_get_deployed_agent_conversation_detail_returns_none_when_session_is_missing(self) -> None:
        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.list_deployed_agent_conversation_events",
                new=AsyncMock(return_value=[]),
            ),
        ):
            payload = await deployed_agent_service.get_deployed_agent_conversation_detail(
                deployed_agent_id="dagent_1",
                session_id="missing",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
            )

        self.assertIsNone(payload)

    async def test_delete_deployed_agent_external_user_data_returns_deleted_counts(self) -> None:
        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row()),
            ),
            patch(
                "server_modules.deployed_agent_service.external_user_privacy_service.get_external_user_privacy_service",
            ) as privacy_service_mock,
            patch(
                "server_modules.deployed_agent_service.session_service.terminate_session",
                new=AsyncMock(),
            ) as terminate_session,
        ):
            privacy_service_mock.return_value.purge_deployed_agent_external_user_data = AsyncMock(
                return_value={
                    "request": {"id": "privreq_1", "status": "completed", "session_key": "sess-1"},
                    "audit": {"id": "privaudit_1"},
                    "deleted_counts": {
                        "deleted_channel_event_count": 4,
                        "deleted_memory_count": 1,
                        "deleted_daily_usage_count": 2,
                        "deleted_acquisition_touch_count": 1,
                    },
                }
            )
            payload = await deployed_agent_service.delete_deployed_agent_external_user_data(
                deployed_agent_id="dagent_1",
                external_user_id="customer-1",
                channel_key="telegram",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                session_id="sess-1",
            )

        self.assertEqual(payload["deployed_agent_id"], "dagent_1")
        self.assertEqual(payload["deleted_counts"]["deleted_channel_event_count"], 4)
        self.assertEqual(payload["request"]["id"], "privreq_1")
        terminate_session.assert_awaited_once_with("sess-1")

    async def test_deploy_deployed_agent_sets_live_and_customer_live(self) -> None:
        live_row = _deployed_agent_row(deployment_state="live")
        live_row["last_deployed_at"] = "2026-04-13T11:30:00Z"
        live_install = _backing_install(specialist_mode="customer_live")
        draft_row = _deployed_agent_row(deployment_state="draft")
        draft_row["channels"] = {
            "telegram": {
                "enabled": True,
                "is_inbound_owner": True,
                "endpoint_key": "store-bot",
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=draft_row),
            ),
            patch(
                "server_modules.deployed_agent_service.get_deployed_agent_telegram_readiness",
                new=AsyncMock(return_value=_telegram_readiness_payload()),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.get_workspace_specialist",
                new=AsyncMock(return_value=_backing_install(specialist_mode='owner_edit')),
            ),
            patch(
                "server_modules.deployed_agent_service.agent_specialist_repository.update_workspace_specialist_manifest",
                new=AsyncMock(return_value=live_install),
            ) as update_manifest_mock,
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.set_deployed_agent_state",
                new=AsyncMock(return_value=live_row),
            ) as set_state_mock,
        ):
            deployed = await deployed_agent_service.deploy_deployed_agent(
                deployed_agent_id="dagent_1",
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
            )

        self.assertEqual(deployed["deployment_state"], "live")
        self.assertEqual(deployed["backing_install"]["specialist_mode"], "customer_live")
        self.assertEqual(update_manifest_mock.await_args.kwargs["metadata"]["specialist_mode"], "customer_live")
        self.assertTrue(set_state_mock.await_args.kwargs["last_deployed_at"])

    async def test_get_deployed_agent_telegram_readiness_reports_missing_connector(self) -> None:
        draft_row = _deployed_agent_row(deployment_state="draft")
        draft_row["channels"] = {"telegram": {"enabled": True}}

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=draft_row),
            ),
            patch(
                "server_modules.deployed_agent_service._workspace_telegram_status_payload",
                return_value={
                    "status": "live",
                    "issues": [],
                    "webhook": {"status": "live"},
                    "autopilot": {"status": "live"},
                },
            ),
            patch(
                "server_modules.deployed_agent_service._workspace_telegram_connector_options",
                return_value=[],
            ),
        ):
            readiness = await deployed_agent_service.get_deployed_agent_telegram_readiness(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                deployed_agent_id="dagent_1",
            )

        self.assertFalse(readiness["ready_for_live"])
        blocker_codes = {item["code"] for item in readiness["blockers"]}
        self.assertIn("telegram_connector_required", blocker_codes)
        self.assertIn("studio_tool_scope_required", blocker_codes)

    async def test_get_deployed_agent_telegram_readiness_returns_selected_tool_scope(self) -> None:
        draft_row = _deployed_agent_row(
            deployment_state="draft",
            metadata={
                "source": "test",
                "selected_tool_ids": ["web_search", "gmail_send"],
            },
        )
        draft_row["channels"] = {
            "telegram": {
                "enabled": True,
                "connector_id": "tg-1",
                "credential_id": "tg-1",
                "endpoint_key": "store-bot",
                "is_inbound_owner": True,
            }
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=draft_row),
            ),
            patch(
                "server_modules.deployed_agent_service._workspace_telegram_status_payload",
                return_value={
                    "status": "live",
                    "issues": [],
                    "webhook": {"status": "live"},
                    "autopilot": {"status": "live"},
                },
            ),
            patch(
                "server_modules.deployed_agent_service._workspace_telegram_connector_options",
                return_value=[
                    {
                        "id": "tg-1",
                        "label": "Store Bot",
                        "connector_id": "tg-1",
                        "credential_id": "tg-1",
                        "endpoint_key": "store-bot",
                        "webhook_path": "/channels/telegram/webhook/tg-1",
                        "webhook_url": "https://runtime.example/channels/telegram/webhook/tg-1",
                    }
                ],
            ),
        ):
            readiness = await deployed_agent_service.get_deployed_agent_telegram_readiness(
                current_user=_owner_user(),
                owner_workspace_id="ws-1",
                deployed_agent_id="dagent_1",
            )

        self.assertEqual(readiness["tool_scope"]["selected_tool_ids"], ["web_search", "gmail_send"])

    async def test_deploy_deployed_agent_rejects_unready_telegram_binding(self) -> None:
        draft_row = _deployed_agent_row(deployment_state="draft")
        draft_row["channels"] = {"telegram": {"enabled": True}}

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=draft_row),
            ),
            patch(
                "server_modules.deployed_agent_service.get_deployed_agent_telegram_readiness",
                new=AsyncMock(return_value=_telegram_readiness_payload(
                    ready_for_live=False,
                    blockers=[{"code": "telegram_connector_required", "message": "Select a Telegram bot connector."}],
                    next_action="Open the Channels step and choose a Telegram connector.",
                )),
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                await deployed_agent_service.deploy_deployed_agent(
                    deployed_agent_id="dagent_1",
                    current_user=_owner_user(),
                    owner_workspace_id="ws-1",
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("Select a Telegram bot connector.", str(error.exception.detail))

    async def test_deploy_deployed_agent_rejects_invalid_state_transition(self) -> None:
        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=_deployed_agent_row(deployment_state="live")),
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                await deployed_agent_service.deploy_deployed_agent(
                    deployed_agent_id="dagent_1",
                    current_user=_owner_user(),
                    owner_workspace_id="ws-1",
                )

        self.assertEqual(error.exception.status_code, 409)

    async def test_deploy_deployed_agent_rejects_non_telegram_live_channels(self) -> None:
        draft_row = _deployed_agent_row(deployment_state="draft")
        draft_row["channels"] = {
            "telegram": {
                "enabled": True,
                "is_inbound_owner": True,
                "endpoint_key": "store-bot",
            },
            "whatsapp": {"enabled": True},
        }

        with (
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_workspace_by_id",
                new=AsyncMock(return_value=_workspace_record()),
            ),
            patch(
                "server_modules.deployed_agent_service.control_plane_repository.get_deployed_agent_by_id",
                new=AsyncMock(return_value=draft_row),
            ),
            patch(
                "server_modules.deployed_agent_service.get_deployed_agent_telegram_readiness",
                new=AsyncMock(return_value=_telegram_readiness_payload()),
            ),
        ):
            with self.assertRaises(HTTPException) as error:
                await deployed_agent_service.deploy_deployed_agent(
                    deployed_agent_id="dagent_1",
                    current_user=_owner_user(),
                    owner_workspace_id="ws-1",
                )

        self.assertEqual(error.exception.status_code, 409)
        self.assertIn("Only Telegram", str(error.exception.detail))


if __name__ == "__main__":
    unittest.main()
