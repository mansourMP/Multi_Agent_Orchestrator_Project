import unittest
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

from server_modules import agent_channel_router, channel_concurrency_service, safe_mode_service
from server_modules.agent_manifest import AgentManifest


class AgentChannelRouterTests(unittest.IsolatedAsyncioTestCase):
    def tearDown(self) -> None:
        safe_mode_service.reset_state_for_tests()

    async def test_shell_surface_contract_freezes_full_shells_and_channel_shells(self):
        mobile = agent_channel_router.shell_surface_contract("mobile")
        web = agent_channel_router.shell_surface_contract("web")
        desktop = agent_channel_router.shell_surface_contract("desktop")
        telegram = agent_channel_router.shell_surface_contract("telegram")
        whatsapp = agent_channel_router.shell_surface_contract("whatsapp")

        for shell in (mobile, web, desktop):
            self.assertEqual(shell["surface_class"], agent_channel_router.FULL_SHELL_CLASS)
            self.assertEqual(shell["control_depth"], "full")
            self.assertTrue(shell["shares_captain_identity"])
            self.assertTrue(shell["uses_shared_run_engine"])
            self.assertIn("application_navigation", shell["allowed_capabilities"])
            self.assertIn("separate_product_brain", shell["forbidden_capabilities"])

        for shell in (telegram, whatsapp):
            self.assertEqual(shell["surface_class"], agent_channel_router.CHANNEL_SHELL_CLASS)
            self.assertEqual(shell["control_depth"], "lightweight")
            self.assertTrue(shell["shares_captain_identity"])
            self.assertTrue(shell["uses_shared_run_engine"])
            self.assertFalse(shell["deep_connector_control_surface"])
            self.assertIn("conversation", shell["allowed_capabilities"])
            self.assertIn("summary_visibility", shell["allowed_capabilities"])
            self.assertIn("deep_admin_surface", shell["forbidden_capabilities"])
            self.assertIn("separate_product_brain", shell["forbidden_capabilities"])

    async def test_route_inbound_channel_message_dispatches_to_specialist_and_records_audit(self):
        manifest = AgentManifest(
            manifest_id="manifest-parts-pro",
            identity={
                "name": "Parts Pro",
                "role": "Inventory Specialist",
                "archetype": "support_specialist",
                "summary": "Help customers find in-stock parts.",
            },
            skills=[{"id": "inventory-tool", "enabled": True}],
            channels={"telegram": True},
        )
        owner_route = {
            "install": {
                "id": "install-specialist",
                "label": "Parts Pro",
                "owner_user_id": "user-1",
                "runtime_mode": "hosted_secure",
                "runtime_profile_id": "runtime-cloud",
                "runtime_profile": {
                    "id": "runtime-cloud",
                    "label": "Empyralis Cloud",
                    "runtime_class": "cloud_worker",
                },
            },
            "manifest": manifest,
            "owner_type": "specialist",
        }
        master_install = {
            "id": "install-sage",
            "label": "Sage",
        }

        @asynccontextmanager
        async def _slot(*args, **kwargs):
            yield {
                "lease_id": "lease-1",
                "quota_snapshot": channel_concurrency_service.ChannelQuotaSnapshot(
                    max_workspace_active_threads=24,
                    max_agent_active_threads=8,
                    max_workspace_turns_per_minute=180,
                    max_runtime_seconds=45,
                ),
            }

        with (
            patch(
                "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
                new=AsyncMock(return_value=owner_route),
            ),
            patch(
                "server_modules.agent_channel_router.agent_registry_repository.get_workspace_master_agent_install",
                new=AsyncMock(return_value=master_install),
            ),
            patch(
                "server_modules.agent_channel_router.control_plane_repository.append_agent_channel_event",
                new=AsyncMock(side_effect=[
                    {"id": "evt-in"},
                    {"id": "evt-out"},
                ]),
            ) as append_event_mock,
            patch(
                "server_modules.agent_channel_router.execute_canonical_channel_turn",
                new=AsyncMock(return_value={
                    "kind": "durable_run",
                    "result": {
                        "status": "accepted",
                        "run_id": "run-1",
                        "engine": "orion",
                        "route": {"selected": "cloud"},
                    },
                }),
            ) as execute_mock,
            patch("server_modules.agent_channel_router.channel_concurrency_service.channel_execution_slot", new=_slot),
        ):
            result = await agent_channel_router.route_inbound_channel_message(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                channel_key="telegram",
                endpoint_key="@partspro_bot",
                customer_message="Do you have 2022 Tesla Model 3 wipers?",
                actor_id="telegram-user-1",
                actor_display_name="Customer",
                message_id="tg-msg-1",
            )

        self.assertEqual(result["owner"]["install_id"], "install-specialist")
        self.assertEqual(result["audit"]["inbound_event_id"], "evt-in")
        self.assertEqual(result["audit"]["outbound_event_id"], "evt-out")
        self.assertEqual(result["channel_key"], "telegram")
        self.assertEqual(result["status"], "accepted")
        self.assertEqual(result["run_id"], "run-1")
        self.assertIn("Run accepted", result["reply"])
        self.assertEqual(append_event_mock.await_count, 2)
        turn_request = execute_mock.await_args.kwargs["turn_request"]
        self.assertEqual(turn_request.thread_id, "thread-workspace-1-telegram-partspro-bot-telegram-partspro-bot-telegram-user-1")
        self.assertEqual(turn_request.session_id, "telegram:partspro-bot:telegram-user-1")
        self.assertEqual(turn_request.context_hints["metadata"]["active_agent_install_id"], "install-specialist")
        self.assertEqual(turn_request.context_hints["metadata"]["master_agent_install_id"], "install-sage")
        self.assertEqual(turn_request.context_hints["metadata"]["runtime_profile_id"], "runtime-cloud")
        self.assertEqual(execute_mock.await_args.kwargs["current_user"]["user_id"], "user-1")

    async def test_route_inbound_channel_message_gracefully_handles_thread_busy(self):
        manifest = AgentManifest(
            manifest_id="manifest-parts-pro",
            identity={
                "name": "Parts Pro",
                "role": "Inventory Specialist",
                "archetype": "support_specialist",
                "summary": "Help customers find in-stock parts.",
            },
        )
        owner_route = {
            "install": {
                "id": "install-specialist",
                "label": "Parts Pro",
                "owner_user_id": "user-1",
                "runtime_mode": "hosted_secure",
            },
            "manifest": manifest,
            "owner_type": "specialist",
        }
        quota_snapshot = channel_concurrency_service.ChannelQuotaSnapshot(
            max_workspace_active_threads=24,
            max_agent_active_threads=8,
            max_workspace_turns_per_minute=180,
            max_runtime_seconds=45,
        )

        @asynccontextmanager
        async def _busy_slot(*args, **kwargs):
            raise channel_concurrency_service.ChannelExecutionLimitError(
                reason="thread_busy",
                message="I’m still finishing the previous message in this conversation. One moment.",
                retry_after_seconds=2,
                quota_snapshot=quota_snapshot,
            )
            yield  # pragma: no cover

        with (
            patch(
                "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
                new=AsyncMock(return_value=owner_route),
            ),
            patch(
                "server_modules.agent_channel_router.agent_registry_repository.get_workspace_master_agent_install",
                new=AsyncMock(return_value={"id": "install-sage", "label": "Sage"}),
            ),
            patch(
                "server_modules.agent_channel_router.control_plane_repository.append_agent_channel_event",
                new=AsyncMock(side_effect=[{"id": "evt-in"}, {"id": "evt-out"}]),
            ) as append_event_mock,
            patch("server_modules.agent_channel_router.channel_concurrency_service.channel_execution_slot", new=_busy_slot),
            patch("server_modules.agent_channel_router.execute_canonical_channel_turn", new=AsyncMock()) as execute_mock,
        ):
            result = await agent_channel_router.route_inbound_channel_message(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                channel_key="telegram",
                endpoint_key="@partspro_bot",
                customer_message="Hello?",
                actor_id="telegram-user-1",
            )

        self.assertEqual(result["status"], "thread_busy")
        self.assertEqual(result["retry_after_seconds"], 2)
        self.assertEqual(result["limit_reason"], "thread_busy")
        self.assertIn("previous message", result["reply"])
        self.assertEqual(append_event_mock.await_count, 2)
        execute_mock.assert_not_awaited()

    async def test_route_inbound_channel_message_gracefully_handles_runtime_cap(self):
        manifest = AgentManifest(
            manifest_id="manifest-parts-pro",
            identity={
                "name": "Parts Pro",
                "role": "Inventory Specialist",
                "archetype": "support_specialist",
                "summary": "Help customers find in-stock parts.",
            },
        )
        owner_route = {
            "install": {
                "id": "install-specialist",
                "label": "Parts Pro",
                "owner_user_id": "user-1",
                "runtime_mode": "hosted_secure",
            },
            "manifest": manifest,
            "owner_type": "specialist",
        }
        quota_snapshot = channel_concurrency_service.ChannelQuotaSnapshot(
            max_workspace_active_threads=24,
            max_agent_active_threads=8,
            max_workspace_turns_per_minute=180,
            max_runtime_seconds=9,
        )

        @asynccontextmanager
        async def _slot(*args, **kwargs):
            yield {"lease_id": "lease-1", "quota_snapshot": quota_snapshot}

        async def _timeout_wait_for(awaitable, timeout):
            if hasattr(awaitable, "close"):
                awaitable.close()
            raise TimeoutError

        with (
            patch(
                "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
                new=AsyncMock(return_value=owner_route),
            ),
            patch(
                "server_modules.agent_channel_router.agent_registry_repository.get_workspace_master_agent_install",
                new=AsyncMock(return_value={"id": "install-sage", "label": "Sage"}),
            ),
            patch(
                "server_modules.agent_channel_router.control_plane_repository.append_agent_channel_event",
                new=AsyncMock(side_effect=[{"id": "evt-in"}, {"id": "evt-out"}]),
            ),
            patch("server_modules.agent_channel_router.channel_concurrency_service.channel_execution_slot", new=_slot),
            patch("server_modules.agent_channel_router.asyncio.wait_for", new=_timeout_wait_for),
            patch("server_modules.agent_channel_router.execute_canonical_channel_turn", new=AsyncMock(return_value={"kind": "durable_run"})),
        ):
            result = await agent_channel_router.route_inbound_channel_message(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                channel_key="telegram",
                endpoint_key="@partspro_bot",
                customer_message="Do you have wipers?",
                actor_id="telegram-user-1",
            )

        self.assertEqual(result["status"], "runtime_capped")
        self.assertEqual(result["limit_reason"], "runtime_cap_exceeded")
        self.assertIn("service window", result["reply"])

    async def test_route_inbound_channel_message_rejects_unbound_endpoint(self):
        with patch(
            "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
            new=AsyncMock(return_value=None),
        ):
            with self.assertRaises(agent_channel_router.ChannelOwnerNotFoundError) as error:
                await agent_channel_router.route_inbound_channel_message(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    channel_key="email",
                    endpoint_key="service@example.com",
                    customer_message="Hello",
                )

        self.assertEqual(str(error.exception), "No active channel owner is configured for this endpoint.")

    async def test_route_inbound_channel_message_rejects_disabled_channel_before_owner_resolution(self):
        safe_mode_service.set_kill_switch(
            scope="channel",
            enabled=True,
            workspace_id="workspace-1",
            channel_key="telegram",
            endpoint_key="@partspro_bot",
            reason="incident",
        )

        with patch(
            "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
            new=AsyncMock(),
        ) as resolve_owner_mock:
            with self.assertRaises(agent_channel_router.ChannelSecurityDeniedError) as error:
                await agent_channel_router.route_inbound_channel_message(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    channel_key="telegram",
                    endpoint_key="@partspro_bot",
                    customer_message="Hello",
                )

        self.assertEqual(str(error.exception), "This channel is temporarily disabled by a security control.")
        resolve_owner_mock.assert_not_awaited()

    async def test_route_inbound_channel_message_rejects_disabled_agent_before_thread_side_effects(self):
        safe_mode_service.set_kill_switch(
            scope="agent",
            enabled=True,
            workspace_id="workspace-1",
            agent_install_id="install-specialist",
            reason="incident",
        )
        manifest = AgentManifest(
            manifest_id="manifest-parts-pro",
            identity={
                "name": "Parts Pro",
                "role": "Inventory Specialist",
                "archetype": "support_specialist",
                "summary": "Help customers find in-stock parts.",
            },
        )
        owner_route = {
            "install": {
                "id": "install-specialist",
                "label": "Parts Pro",
                "owner_user_id": "user-1",
                "runtime_mode": "hosted_secure",
            },
            "manifest": manifest,
            "owner_type": "specialist",
        }

        with (
            patch(
                "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
                new=AsyncMock(return_value=owner_route),
            ),
            patch("server_modules.agent_channel_router.control_plane_repository.append_agent_channel_event", new=AsyncMock()) as append_event_mock,
        ):
            with self.assertRaises(agent_channel_router.ChannelSecurityDeniedError) as error:
                await agent_channel_router.route_inbound_channel_message(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    channel_key="telegram",
                    endpoint_key="@partspro_bot",
                    customer_message="Hello",
                )

        self.assertEqual(str(error.exception), "This agent is temporarily disabled by a security control.")
        append_event_mock.assert_not_awaited()

    async def test_route_inbound_channel_message_ignores_duplicate_inbound_event_before_thread_side_effects(self):
        manifest = AgentManifest(
            manifest_id="manifest-parts-pro",
            identity={
                "name": "Parts Pro",
                "role": "Inventory Specialist",
                "archetype": "support_specialist",
                "summary": "Help customers find in-stock parts.",
            },
        )
        owner_route = {
            "install": {
                "id": "install-specialist",
                "label": "Parts Pro",
                "owner_user_id": "user-1",
                "runtime_mode": "hosted_secure",
            },
            "manifest": manifest,
            "owner_type": "specialist",
        }

        with (
            patch(
                "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
                new=AsyncMock(return_value=owner_route),
            ),
            patch(
                "server_modules.agent_channel_router.agent_registry_repository.get_workspace_master_agent_install",
                new=AsyncMock(return_value={"id": "install-sage", "label": "Sage"}),
            ),
            patch(
                "server_modules.agent_channel_router.control_plane_repository.append_agent_channel_event",
                new=AsyncMock(return_value={"id": "evt-existing", "_duplicate_hit": True}),
            ) as append_event_mock,
            patch("server_modules.agent_channel_router.execute_canonical_channel_turn", new=AsyncMock()) as execute_mock,
        ):
            result = await agent_channel_router.route_inbound_channel_message(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                channel_key="telegram",
                endpoint_key="@partspro_bot",
                customer_message="Hello",
                actor_id="telegram-user-1",
                message_id="msg-1",
            )

        self.assertEqual(result["status"], "duplicate_ignored")
        self.assertEqual(result["audit"]["inbound_event_id"], "evt-existing")
        execute_mock.assert_not_awaited()
        self.assertEqual(append_event_mock.await_count, 1)

    async def test_route_inbound_channel_message_returns_draining_result_without_execution_side_effects(self):
        safe_mode_service.set_incident_control(
            scope="channel",
            mode="drain",
            workspace_id="workspace-1",
            channel_key="telegram",
            endpoint_key="@partspro_bot",
            reason="draining backlog",
        )
        manifest = AgentManifest(
            manifest_id="manifest-parts-pro",
            identity={
                "name": "Parts Pro",
                "role": "Inventory Specialist",
                "archetype": "support_specialist",
                "summary": "Help customers find in-stock parts.",
            },
        )
        owner_route = {
            "install": {
                "id": "install-specialist",
                "label": "Parts Pro",
                "owner_user_id": "user-1",
                "runtime_mode": "hosted_secure",
            },
            "manifest": manifest,
            "owner_type": "specialist",
        }

        with (
            patch(
                "server_modules.agent_channel_router.agent_specialist_repository.resolve_active_inbound_channel_owner",
                new=AsyncMock(return_value=owner_route),
            ),
            patch(
                "server_modules.agent_channel_router.agent_registry_repository.get_workspace_master_agent_install",
                new=AsyncMock(return_value={"id": "install-sage", "label": "Sage"}),
            ),
            patch(
                "server_modules.agent_channel_router.control_plane_repository.append_agent_channel_event",
                new=AsyncMock(side_effect=[{"id": "evt-in"}, {"id": "evt-out"}]),
            ) as append_event_mock,
            patch("server_modules.agent_channel_router.execute_canonical_channel_turn", new=AsyncMock()) as execute_mock,
        ):
            result = await agent_channel_router.route_inbound_channel_message(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                channel_key="telegram",
                endpoint_key="@partspro_bot",
                customer_message="Hello",
                actor_id="telegram-user-1",
                message_id="msg-2",
            )

        self.assertEqual(result["status"], "draining")
        self.assertEqual(result["incident_mode"], "drain")
        self.assertEqual(result["audit"]["outbound_event_id"], "evt-out")
        self.assertEqual(append_event_mock.await_count, 2)
        execute_mock.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
