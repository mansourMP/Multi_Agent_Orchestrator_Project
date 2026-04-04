import unittest

from server_modules.connectors.autopilot_support_registry_bridge_service import AutopilotSupportRegistryBridgeService


class _FakeRegistry:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        type(self).instances.append(self)


class _FakeService:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class AutopilotSupportRegistryBridgeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        _FakeRegistry.instances.clear()

    def test_bridge_caches_registry_and_builders(self) -> None:
        service = AutopilotSupportRegistryBridgeService(
            project_root="/tmp/project",
            default_chat_prefix="/empyralis",
            telegram_default_profile="ops",
            telegram_default_prefix="/emp",
            telegram_default_require_prefix=True,
            telegram_profile_catalog={"ops": {}},
            whatsapp_default_profile="support",
            whatsapp_default_prefix="",
            whatsapp_default_require_prefix=False,
            whatsapp_profile_catalog={"support": {}},
            workflow_api_url="http://workflow",
            runtime_url="http://runtime",
            web_url="http://web",
            installed_skills_enabled=True,
            error_category_hints=[("timeout", "timeout")],
            engine_validation_errors=[],
            env_get=lambda key, default="": "api-key" if key == "ORION_API_KEY" else default,
            init_runtime=lambda: None,
            bool_from_any=lambda value, default=False: bool(value),
            local_companion_snapshot=lambda: {"online_workers": 1},
            current_runtime_metrics=lambda: {"runs_started": 1},
            latest_runtime_run_summary=lambda: "latest",
            list_vault_connectors=lambda workspace_id: [{"workspace_id": workspace_id}],
            http_json_request=lambda *args, **kwargs: {"ok": True},
            camera_setup_service=lambda: {"camera": True},
            resolve_vault_credential=lambda credential_id, workspace_id: {"credential_id": credential_id, "workspace_id": workspace_id},
            list_recent_connector_messages=lambda credentials, limit: [{"credentials": credentials, "limit": limit}],
            query_active_installed_skills=lambda **kwargs: [{"skill": kwargs.get("workspace_id")}],
            cognitive_module=lambda: {"module": True},
            cognitive_defaults=lambda: {"defaults": True},
            truncate_one_line=lambda text, limit: str(text)[:limit],
            normalize_string_list=lambda value: list(value),
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            send_message=lambda **kwargs: kwargs,
            runtime_builtin_skills_getter=lambda: ["a"],
            runtime_skills_snapshot_getter=lambda: {"ok": True},
            normalize_whatsapp_number=lambda value: f"wa:{value}",
            safe_path_token=lambda value: f"safe:{value}",
            support_registry_class=_FakeRegistry,
            profile_service_class=_FakeService,
            runtime_status_service_class=_FakeService,
            workflow_setup_service_class=_FakeService,
            connector_context_service_class=_FakeService,
            approval_service_class=_FakeService,
            common_support_service_class=_FakeService,
            skill_service_class=_FakeService,
            channel_support_service_class=_FakeService,
        )

        first = service.support_service_registry()
        second = service.support_service_registry()

        self.assertIs(first, second)
        self.assertEqual(len(_FakeRegistry.instances), 1)
        profile = first.kwargs["build_profile_service"]()
        workflow = first.kwargs["build_workflow_setup_service"]()
        channel = first.kwargs["build_channel_support_service"]()
        self.assertEqual(profile.kwargs["telegram_default_profile"], "ops")
        self.assertEqual(workflow.kwargs["runtime_api_headers"]()["X-API-Key"], "api-key")
        self.assertEqual(channel.kwargs["safe_path_token"]("abc"), "safe:abc")


if __name__ == "__main__":
    unittest.main()
