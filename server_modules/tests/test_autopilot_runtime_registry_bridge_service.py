import unittest

from server_modules.connectors.autopilot_runtime_registry_bridge_service import AutopilotRuntimeRegistryBridgeService


class _FakeRegistry:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        type(self).instances.append(self)


class _FakeService:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class AutopilotRuntimeRegistryBridgeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        _FakeRegistry.instances.clear()

    def test_bridge_caches_registry_and_builders(self) -> None:
        service = AutopilotRuntimeRegistryBridgeService(
            project_root="/tmp/project",
            default_chat_prefix="/empyralis",
            telegram_poll_seconds=2.0,
            telegram_default_workspace_id="default",
            telegram_media_max_items=4,
            telegram_trust_mode_value="workspace_write",
            telegram_execution_target_value="local",
            telegram_engine="orion",
            whatsapp_engine="orion",
            telegram_show_buttons=True,
            local_lease_seconds=30,
            non_retryable_run_error_hints=["fatal"],
            runtime_builtin_skills_limit_builder=lambda scope_key, limit: [{"scope_key": scope_key, "limit": limit}],
            normalize_workspace_id=lambda value: str(value or "default"),
            resolve_vault_credential=lambda credential_id, workspace_id: {"credential_id": credential_id, "workspace_id": workspace_id},
            normalize_agent_role=lambda value: str(value or "").lower(),
            allow_any_chat=lambda: True,
            http_json_request=lambda *args, **kwargs: {"ok": True},
            telegram_session_key=lambda chat_id: f"tg:{chat_id}",
            safe_path_token=lambda value: f"safe:{value}",
            reply_keyboard=lambda profile: {"profile": profile},
            append_dead_letter=lambda **kwargs: kwargs,
            record_channel_event=lambda **kwargs: kwargs,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            chat_id_from_session_key=lambda key: key.split(":")[-1],
            list_connector_entries=lambda: [{"id": "conn-1"}],
            get_secret=lambda entry: {"secret": entry.get("id")},
            resolve_profile=lambda entry: {"profile": entry.get("id")},
            route_message=lambda text, profile: {"text": text, "profile": profile},
            get_chat_profile=lambda workspace_id, chat_id: {"workspace_id": workspace_id, "chat_id": chat_id},
            build_goal_with_profile=lambda goal, profile: f"{goal}|{profile.get('chat_id')}",
            workspace_connector_context=lambda **kwargs: kwargs,
            build_goal_with_connector_context=lambda goal, prompt: f"{goal}|{prompt}",
            installed_skill_query=lambda **kwargs: kwargs,
            create_telegram_run=lambda **kwargs: kwargs,
            wait_for_run_terminal_status=lambda **kwargs: kwargs,
            runs_get=lambda run_id: {"run_id": run_id},
            send_message=lambda **kwargs: kwargs,
            set_connector_state=lambda connector_id, payload: (connector_id, payload),
            telegram_profile_fields=["about"],
            assigned_agent_role=lambda entry: "assistant",
            normalize_trust_mode=lambda value: str(value),
            normalize_execution_target=lambda value: str(value),
            decide_execution_target=lambda metadata: {"selected": "cloud", "metadata": metadata},
            apply_execution_route_metadata=lambda metadata, route: {**metadata, "route": route},
            run_start_request_class=lambda **kwargs: kwargs,
            start_run_request=lambda request: {"run_id": "run-via-turn", "route": {"selected": "cloud"}, "request": request},
            create_run=lambda **kwargs: kwargs,
            whatsapp_session_key=lambda inbound_from, inbound_to: f"wa:{inbound_from}:{inbound_to}",
            inherit_owner_user_id=lambda owner_user_id=None: owner_user_id or "owner-1",
            agent_machine_full_trust_enabled=lambda owner_user_id: owner_user_id == "owner-1",
            telegram_runs_started=lambda: "tg-started",
            whatsapp_runs_started=lambda: "wa-started",
            run_history=[],
            run_history_lock=object(),
            runtime_metrics={"runs_started": 1},
            metrics_lock=object(),
            utc_now=lambda: "now",
            parse_utc_ts=lambda value: value,
            worker_online_helper=lambda record, now=None: True,
            local_queue_lock=object(),
            local_pending_run_ids=[],
            local_claimed_runs=[],
            local_worker_registry={},
            truncate_one_line=lambda text, limit: str(text)[:limit],
            runtime_registry_class=_FakeRegistry,
            connector_support_service_class=_FakeService,
            transport_service_class=_FakeService,
            terminal_service_class=_FakeService,
            run_entry_service_class=_FakeService,
            runtime_support_service_class=_FakeService,
            menu_service_class=_FakeService,
        )

        first = service.runtime_service_registry()
        second = service.runtime_service_registry()

        self.assertIs(first, second)
        self.assertEqual(len(_FakeRegistry.instances), 1)
        connector = first.kwargs["build_connector_support_service"]()
        terminal = first.kwargs["build_terminal_service"]()
        runtime_support = first.kwargs["build_runtime_support_service"]()
        self.assertTrue(connector.kwargs["allow_any_chat"])
        self.assertEqual(
            terminal.kwargs["create_run"](goal="test"),
            {
                "goal": "test",
                "media_max_items": 4,
                "trust_mode_value": "workspace_write",
                "execution_target_value": "local",
            },
        )
        self.assertEqual(runtime_support.kwargs["non_retryable_run_error_hints"], ["fatal"])


if __name__ == "__main__":
    unittest.main()
