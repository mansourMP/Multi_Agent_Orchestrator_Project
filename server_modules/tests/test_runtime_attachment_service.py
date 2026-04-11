import asyncio
from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, patch

from server_modules import entitlements_service, hybrid_policy_service, runtime_attachment_service


class RuntimeAttachmentServiceTests(unittest.TestCase):
    def test_list_workspace_runtime_attachments_reads_profiles_without_hot_path_seeding(self) -> None:
        runtime_attachment_service._RUNTIME_ATTACHMENTS_CACHE.clear()
        with (
            patch(
                "server_modules.runtime_attachment_service.agent_registry_repository.list_runtime_profiles",
                new=AsyncMock(
                    return_value=[
                        {
                            "id": "profile-cloud",
                            "slug": "empyralis-cloud",
                            "label": "Empyralis Cloud",
                            "runtime_class": "cloud_worker",
                            "status": "active",
                        }
                    ]
                ),
            ) as profiles_mock,
            patch(
                "server_modules.runtime_attachment_service.run_state_repository.list_fleet_workers",
                new=AsyncMock(return_value=[]),
            ),
        ):
            inventory = asyncio.run(
                runtime_attachment_service.list_workspace_runtime_attachments(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                )
            )

        self.assertEqual(inventory["deployment_mode"], "cloud_only")
        self.assertEqual(profiles_mock.await_args.kwargs["seed_if_missing"], False)

    def test_list_workspace_runtime_targets_reuses_snapshot_for_identical_inventory(self) -> None:
        runtime_attachment_service._RUNTIME_TARGETS_CACHE.clear()
        inventory = {
            "tenant_id": "tenant-1",
            "workspace_id": "workspace-1",
            "_snapshot_version": "runtime-snapshot-1",
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "online": True,
                    "healthy": True,
                    "supports_runtime_modes": ["hosted_secure"],
                }
            ],
        }

        with patch(
            "server_modules.runtime_attachment_service.build_workspace_runtime_targets",
            wraps=runtime_attachment_service.build_workspace_runtime_targets,
        ) as build_mock:
            first = asyncio.run(
                runtime_attachment_service.list_workspace_runtime_targets(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    inventory=inventory,
                )
            )
            second = asyncio.run(
                runtime_attachment_service.list_workspace_runtime_targets(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    inventory=inventory,
                )
            )

        self.assertEqual(first["default_target_id"], second["default_target_id"])
        self.assertEqual(build_mock.call_count, 1)

    def test_list_workspace_runtime_attachments_reports_hybrid_topology(self) -> None:
        runtime_profiles = [
            {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "label": "Empyralis Cloud",
                "runtime_class": "cloud_worker",
                "status": "active",
                "runtime_id": "runtime-cloud",
            },
            {
                "id": "profile-local",
                "slug": "my-local-mac",
                "label": "My Local Mac",
                "runtime_class": "desktop_companion",
                "status": "active",
                "runtime_id": "runtime-local",
                "machine_id": "machine-local",
            },
        ]
        fleet_workers = [
            {
                "worker_id": "runtime-local",
                "runtime_id": "runtime-local",
                "machine_id": "machine-local",
                "runtime_type": "local_companion",
                "display_name": "Mansur Mac mini",
                "online": True,
                "status": "idle",
                "control_state": "active",
                "execution_targets": ["local_companion"],
                "capabilities": ["computer_control", "file_access"],
            }
        ]

        inventory = asyncio.run(
            runtime_attachment_service.list_workspace_runtime_attachments(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                runtime_profiles=runtime_profiles,
                fleet_workers=fleet_workers,
            )
        )

        self.assertEqual(inventory["deployment_mode"], "hybrid")
        self.assertEqual(len(inventory["attachments"]), 2)
        self.assertEqual(inventory["attachments"][0]["attachment_kind"], "managed_cloud")
        self.assertEqual(inventory["attachments"][1]["attachment_kind"], "local_companion")
        self.assertTrue(inventory["attachments"][1]["healthy"])

    def test_list_workspace_runtime_attachments_supports_local_only_topology(self) -> None:
        runtime_profiles = [
            {
                "id": "profile-local",
                "slug": "my-local-mac",
                "label": "My Local Mac",
                "runtime_class": "desktop_companion",
                "status": "active",
                "runtime_id": "runtime-local",
                "machine_id": "machine-local",
            }
        ]
        fleet_workers = [
            {
                "worker_id": "runtime-local",
                "runtime_id": "runtime-local",
                "machine_id": "machine-local",
                "runtime_type": "local_companion",
                "display_name": "Local Box",
                "online": True,
                "status": "idle",
                "control_state": "active",
                "execution_targets": ["local_companion"],
            }
        ]

        inventory = asyncio.run(
            runtime_attachment_service.list_workspace_runtime_attachments(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                runtime_profiles=runtime_profiles,
                fleet_workers=fleet_workers,
            )
        )

        self.assertEqual(inventory["deployment_mode"], "local_only")
        self.assertEqual([item["attachment_kind"] for item in inventory["attachments"]], ["local_companion"])

    def test_list_workspace_runtime_attachments_maps_worker_only_local_runtime_to_local_companion(self) -> None:
        inventory = asyncio.run(
            runtime_attachment_service.list_workspace_runtime_attachments(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                runtime_profiles=[],
                fleet_workers=[
                    {
                        "runtime_id": "worker-local-1",
                        "runtime_type": "local",
                        "display_name": "Worker Local 1",
                        "online": True,
                        "status": "idle",
                        "control_state": "active",
                        "execution_targets": ["local"],
                        "capabilities": ["filesystem.read_write", "local.worker"],
                    }
                ],
            )
        )

        self.assertEqual(inventory["deployment_mode"], "local_only")
        self.assertEqual(len(inventory["attachments"]), 1)
        self.assertEqual(inventory["attachments"][0]["attachment_kind"], "local_companion")
        self.assertEqual(inventory["attachments"][0]["runtime_class"], "desktop_companion")
        self.assertEqual(
            inventory["attachments"][0]["supports_runtime_modes"],
            ["local_secure", "privileged_device"],
        )

    def test_list_workspace_runtime_attachments_infers_online_from_recent_worker_heartbeat(self) -> None:
        inventory = asyncio.run(
            runtime_attachment_service.list_workspace_runtime_attachments(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                runtime_profiles=[],
                fleet_workers=[
                    {
                        "runtime_id": "worker-local-2",
                        "runtime_type": "local",
                        "display_name": "Worker Local 2",
                        "online": False,
                        "status": "busy",
                        "control_state": "active",
                        "execution_targets": ["local"],
                        "capabilities": ["filesystem.read_write", "local.worker"],
                        "lease_seconds": 30,
                        "last_heartbeat_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    }
                ],
            )
        )

        self.assertTrue(inventory["attachments"][0]["online"])
        self.assertTrue(inventory["attachments"][0]["healthy"])

    def test_build_workspace_runtime_targets_projects_cloud_default_for_hybrid_workspace(self) -> None:
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "online": True,
                    "healthy": True,
                    "supports_runtime_modes": ["hosted_secure"],
                },
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "online": True,
                    "healthy": True,
                    "supports_runtime_modes": ["local_secure", "privileged_device"],
                },
            ],
        }

        payload = runtime_attachment_service.build_workspace_runtime_targets(
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            inventory=inventory,
        )

        self.assertEqual(payload["default_target_id"], "cloud_default")
        self.assertEqual(payload["routing_contract"]["mobile_entry_mode"], "platform_first")
        self.assertFalse(payload["routing_contract"]["direct_mobile_lan_default"])
        targets = {item["target_id"]: item for item in payload["targets"]}
        self.assertTrue(targets["cloud_default"]["default_for_workspace"])
        self.assertEqual(targets["cloud_default"]["status"], "live")
        self.assertEqual(targets["local_companion"]["connection_mode"], "platform_relay")
        self.assertFalse(targets["local_companion"]["direct_mobile_connection_required"])

    def test_build_workspace_runtime_targets_projects_self_host_without_identity_fork(self) -> None:
        inventory = {
            "deployment_mode": "self_hosted_business",
            "attachments": [
                {
                    "attachment_id": "self_hosted_business_node:profile-self-host",
                    "attachment_kind": "self_hosted_business_node",
                    "online": True,
                    "healthy": True,
                    "supports_runtime_modes": ["hosted_secure"],
                }
            ],
        }

        payload = runtime_attachment_service.build_workspace_runtime_targets(
            tenant_id="tenant-1",
            workspace_id="workspace-1",
            inventory=inventory,
        )

        self.assertEqual(payload["default_target_id"], "self_host_runtime")
        self.assertTrue(payload["routing_contract"]["supports_self_host_without_identity_fork"])
        targets = {item["target_id"]: item for item in payload["targets"]}
        self.assertTrue(targets["self_host_runtime"]["default_for_workspace"])
        self.assertTrue(targets["self_host_runtime"]["workspace_scoped_identity"])
        self.assertEqual(targets["self_host_runtime"]["execution_target"], "cloud")

    def test_resolve_install_runtime_plan_selects_local_attachment_for_local_secure(self) -> None:
        install = {
            "runtime_mode": "local_secure",
            "runtime_profile": {
                "id": "profile-local",
                "slug": "my-local-mac",
                "runtime_class": "desktop_companion",
                "runtime_id": "runtime-local",
                "machine_id": "machine-local",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "my-local-mac",
                    "allowed_runtime_classes": ["desktop_companion"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": "profile-local",
                    "runtime_profile_slug": "my-local-mac",
                    "runtime_id": "runtime-local",
                    "machine_id": "machine-local",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
            ],
        }

        plan = asyncio.run(
            runtime_attachment_service.resolve_install_runtime_plan(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                install=install,
                inventory=inventory,
            )
        )

        self.assertEqual(plan["execution_target_selected"], "local_companion")
        self.assertEqual(plan["machine_target"], "machine-local")
        self.assertEqual(plan["selected_attachment"]["attachment_kind"], "local_companion")
        self.assertTrue(plan["privacy_split"]["local_private_memory_stays_local"])
        self.assertFalse(plan["state_layer_policy"]["cross_install_private_memory_allowed"])
        self.assertEqual(plan["state_layer_policy"]["artifacts_history"]["cross_install_exchange_mode"], "artifacts_only")

    def test_resolve_install_runtime_plan_rejects_offline_local_attachment(self) -> None:
        install = {
            "runtime_mode": "local_secure",
            "runtime_profile": {
                "id": "profile-local",
                "runtime_class": "desktop_companion",
                "runtime_id": "runtime-local",
                "machine_id": "machine-local",
            },
            "agent_definition_version": {"placement_manifest": {"allowed_runtime_classes": ["desktop_companion"]}},
        }
        inventory = {
            "deployment_mode": "local_only",
            "attachments": [
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": "profile-local",
                    "runtime_id": "runtime-local",
                    "machine_id": "machine-local",
                    "online": False,
                    "healthy": False,
                    "control_state": "active",
                }
            ],
        }

        with self.assertRaises(runtime_attachment_service.RuntimeAttachmentSelectionError) as ctx:
            asyncio.run(
                runtime_attachment_service.resolve_install_runtime_plan(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    install=install,
                    inventory=inventory,
                )
            )

        self.assertEqual(str(ctx.exception), "Selected runtime attachment is offline.")

    def test_resolve_install_runtime_plan_allows_requested_machine_for_unprofiled_local_worker(self) -> None:
        install = {
            "runtime_mode": "local_secure",
            "runtime_profile": {
                "id": "profile-local",
                "runtime_class": "desktop_companion",
            },
            "agent_definition_version": {"placement_manifest": {"allowed_runtime_classes": ["desktop_companion"]}},
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "local_companion:phase52-proof-worker",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": None,
                    "runtime_id": "phase52-proof-worker",
                    "machine_id": "phase52-proof-worker",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
            ],
        }

        plan = asyncio.run(
            runtime_attachment_service.resolve_install_runtime_plan(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                install=install,
                inventory=inventory,
                requested_machine_target="phase52-proof-worker",
            )
        )

        self.assertEqual(plan["execution_target_selected"], "local_companion")
        self.assertEqual(plan["machine_target"], "phase52-proof-worker")
        self.assertEqual(plan["selected_attachment"]["attachment_id"], "local_companion:phase52-proof-worker")

    def test_resolve_install_runtime_plan_supports_self_hosted_secure_node(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-enterprise",
                "slug": "workspace-secure-node",
                "runtime_class": "self_hosted_business_node",
                "runtime_id": "runtime-enterprise",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "workspace-secure-node",
                    "allowed_runtime_classes": ["self_hosted_business_node"],
                }
            },
        }
        inventory = {
            "deployment_mode": "self_hosted_business",
            "attachments": [
                {
                    "attachment_id": "self_hosted_business_node:profile-enterprise",
                    "attachment_kind": "self_hosted_business_node",
                    "runtime_class": "self_hosted_business_node",
                    "runtime_profile_id": "profile-enterprise",
                    "runtime_profile_slug": "workspace-secure-node",
                    "runtime_id": "runtime-enterprise",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                }
            ],
        }

        plan = asyncio.run(
            runtime_attachment_service.resolve_install_runtime_plan(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                install=install,
                inventory=inventory,
            )
        )

        self.assertEqual(plan["selected_attachment"]["attachment_kind"], "self_hosted_business_node")
        self.assertEqual(plan["execution_target_selected"], "cloud")
        self.assertEqual(plan["entitlements"]["enforcement_target"], "self_hosted")

    def test_resolve_install_runtime_plan_rejects_hosted_quota_exhaustion(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "cloud_only",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                }
            ],
        }
        workspace = {
            "metadata": {
                "billing": {
                    "plan": "free",
                    "entitlement_usage": {"hosted_runtime_minutes_monthly": 60},
                }
            }
        }

        with self.assertRaises(entitlements_service.EntitlementQuotaExceededError) as ctx:
            asyncio.run(
                runtime_attachment_service.resolve_install_runtime_plan(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    install=install,
                    inventory=inventory,
                    workspace=workspace,
                )
            )

        self.assertEqual(ctx.exception.reason, "hosted_runtime_minutes_exhausted")

    def test_resolve_install_runtime_plan_fails_closed_when_local_only_memory_is_requested_for_hosted(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": "profile-local",
                    "runtime_profile_slug": "my-local-mac",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
            ],
        }

        with self.assertRaises(runtime_attachment_service.RuntimeAttachmentSelectionError) as ctx:
            asyncio.run(
                runtime_attachment_service.resolve_install_runtime_plan(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    install=install,
                    inventory=inventory,
                    policy_context={
                        "requested_memory_layers": ["local_private_memory"],
                    },
                )
            )

        self.assertEqual(ctx.exception.reason, "local_runtime_required_for_hosted_execution")

    def test_resolve_install_runtime_plan_rejects_invalid_summary_bridge_payloads(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                }
            ],
        }

        with self.assertRaises(runtime_attachment_service.RuntimeAttachmentSelectionError) as ctx:
            asyncio.run(
                runtime_attachment_service.resolve_install_runtime_plan(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    install=install,
                    inventory=inventory,
                    policy_context={
                        "requested_memory_layers": ["episodic_memory"],
                        "sync_class": "summary_bridge_only",
                        "summary_payload_classes": ["raw_private_file_content_without_explicit_share"],
                        "last_safe_summary_available": True,
                    },
                )
            )

        self.assertEqual(ctx.exception.reason, "summary_bridge_payload_not_allowed")

    def test_resolve_install_runtime_plan_marks_local_offline_summary_bridge_degraded_mode(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": "profile-local",
                    "runtime_profile_slug": "my-local-mac",
                    "online": False,
                    "healthy": False,
                    "control_state": "active",
                },
            ],
        }

        plan = asyncio.run(
            runtime_attachment_service.resolve_install_runtime_plan(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                install=install,
                inventory=inventory,
                policy_context={
                    "requested_memory_layers": ["local_private_memory"],
                    "sync_class": "summary_bridge_only",
                    "summary_payload_classes": ["bounded_local_private_summaries"],
                    "last_safe_summary_available": True,
                },
            )
        )

        self.assertEqual(plan["execution_target_selected"], "cloud")
        self.assertEqual(plan["sync_enforcement"]["effective_sync_class"], "summary_bridge_only")
        self.assertEqual(plan["degraded_mode"]["state"], "local_offline_summary_bridge")
        self.assertTrue(plan["degraded_mode"]["last_safe_summary_only"])
        self.assertEqual(plan["state_layer_policy"]["local_private_memory_access"], "cloud_safe_summaries_only")

    def test_resolve_install_runtime_plan_uses_persisted_summary_bridge_status_for_offline_fallback(self) -> None:
        install = {
            "id": "install-1",
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": "profile-local",
                    "runtime_profile_slug": "my-local-mac",
                    "online": False,
                    "healthy": False,
                    "control_state": "active",
                },
            ],
        }

        with patch.object(
            runtime_attachment_service.memory_service,
            "hybrid_summary_bridge_status",
            return_value={
                "record_count": 1,
                "available_payload_classes": ["bounded_local_private_summaries"],
                "last_safe_summary_available": True,
                "latest_published_at": "2026-04-10T00:00:00Z",
                "latest_last_safe_at": "2026-04-10T00:00:00Z",
            },
        ):
            plan = asyncio.run(
                runtime_attachment_service.resolve_install_runtime_plan(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    install=install,
                    inventory=inventory,
                    policy_context={
                        "requested_memory_layers": ["local_private_memory"],
                        "sync_class": "summary_bridge_only",
                        "summary_payload_classes": ["bounded_local_private_summaries"],
                    },
                )
            )

        self.assertEqual(plan["degraded_mode"]["state"], "local_offline_summary_bridge")
        self.assertTrue(plan["sync_enforcement"]["summary_bridge_status"]["last_safe_summary_available"])

    def test_resolve_install_runtime_plan_fails_closed_when_offline_summary_bridge_has_no_safe_snapshot(self) -> None:
        install = {
            "id": "install-1",
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "local_companion:profile-local",
                    "attachment_kind": "local_companion",
                    "runtime_class": "desktop_companion",
                    "runtime_profile_id": "profile-local",
                    "runtime_profile_slug": "my-local-mac",
                    "online": False,
                    "healthy": False,
                    "control_state": "active",
                },
            ],
        }

        with patch.object(
            runtime_attachment_service.memory_service,
            "hybrid_summary_bridge_status",
            return_value={
                "record_count": 0,
                "available_payload_classes": [],
                "last_safe_summary_available": False,
                "latest_published_at": None,
                "latest_last_safe_at": None,
            },
        ):
            with self.assertRaises(runtime_attachment_service.RuntimeAttachmentSelectionError) as ctx:
                asyncio.run(
                    runtime_attachment_service.resolve_install_runtime_plan(
                        tenant_id="tenant-1",
                        workspace_id="workspace-1",
                        install=install,
                        inventory=inventory,
                        policy_context={
                            "requested_memory_layers": ["local_private_memory"],
                            "sync_class": "summary_bridge_only",
                            "summary_payload_classes": ["bounded_local_private_summaries"],
                        },
                    )
                )

        self.assertEqual(ctx.exception.reason, "summary_bridge_snapshot_unavailable")

    def test_resolve_install_runtime_plan_prefers_self_hosted_when_customer_controlled_compute_is_required(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-enterprise",
                "slug": "workspace-secure-node",
                "runtime_class": "self_hosted_business_node",
                "runtime_id": "runtime-enterprise",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "allowed_runtime_classes": ["cloud_worker", "self_hosted_business_node"],
                }
            },
        }
        inventory = {
            "deployment_mode": "hybrid",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
                {
                    "attachment_id": "self_hosted_business_node:profile-enterprise",
                    "attachment_kind": "self_hosted_business_node",
                    "runtime_class": "self_hosted_business_node",
                    "runtime_profile_id": "profile-enterprise",
                    "runtime_profile_slug": "workspace-secure-node",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                },
            ],
        }

        plan = asyncio.run(
            runtime_attachment_service.resolve_install_runtime_plan(
                tenant_id="tenant-1",
                workspace_id="workspace-1",
                install=install,
                inventory=inventory,
                policy_context={"customer_controlled_compute_required": True},
            )
        )

        self.assertEqual(plan["selected_attachment"]["attachment_kind"], "self_hosted_business_node")
        self.assertEqual(
            plan["placement_enforcement"]["preferred_attachment_kinds"],
            ["self_hosted_business_node", "managed_cloud"],
        )

    def test_resolve_install_runtime_plan_requires_explicit_opt_in_for_document_sync(self) -> None:
        install = {
            "runtime_mode": "hosted_secure",
            "runtime_profile": {
                "id": "profile-cloud",
                "slug": "empyralis-cloud",
                "runtime_class": "cloud_worker",
                "runtime_id": "runtime-cloud",
            },
            "agent_definition_version": {
                "placement_manifest": {
                    "preferred_runtime_slug": "empyralis-cloud",
                    "allowed_runtime_classes": ["cloud_worker"],
                }
            },
        }
        inventory = {
            "deployment_mode": "cloud_only",
            "attachments": [
                {
                    "attachment_id": "managed_cloud:profile-cloud",
                    "attachment_kind": "managed_cloud",
                    "runtime_class": "cloud_worker",
                    "runtime_profile_id": "profile-cloud",
                    "runtime_profile_slug": "empyralis-cloud",
                    "online": True,
                    "healthy": True,
                    "control_state": "active",
                }
            ],
        }

        with self.assertRaises(runtime_attachment_service.RuntimeAttachmentSelectionError) as ctx:
            asyncio.run(
                runtime_attachment_service.resolve_install_runtime_plan(
                    tenant_id="tenant-1",
                    workspace_id="workspace-1",
                    install=install,
                    inventory=inventory,
                    policy_context={
                        "requested_memory_layers": ["notes_documents_retrieval"],
                        "sync_class": "explicit_opt_in",
                    },
                )
            )

        self.assertEqual(ctx.exception.reason, "explicit_opt_in_required")


class HybridPolicyServiceTests(unittest.TestCase):
    def test_evaluate_hybrid_runtime_policy_reports_local_cloud_availability_and_identity(self) -> None:
        state = hybrid_policy_service.evaluate_hybrid_runtime_policy(
            runtime_mode="hosted_secure",
            policy_context={
                "requested_memory_layers": ["app_event_history"],
            },
            attachments=[
                {
                    "attachment_kind": "managed_cloud",
                    "online": True,
                    "control_state": "active",
                },
                {
                    "attachment_kind": "local_companion",
                    "online": True,
                    "control_state": "active",
                },
            ],
        )

        self.assertEqual(state["effective_sync_class"], "sync_allowed")
        self.assertTrue(state["placement"]["availability"]["local_online"])
        self.assertTrue(state["placement"]["availability"]["managed_cloud_online"])
        self.assertEqual(state["shared_identity"]["sage_identity"], "shared")
