import unittest

from server_modules.connectors.autopilot_registry_facade_service import AutopilotRegistryFacadeService


class _FakeBridge:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        type(self).instances.append(self)

    def telegram_service_registry(self):
        return {"telegram": True, "kwargs": self.kwargs}

    def whatsapp_service_registry(self):
        return {"whatsapp": True, "kwargs": self.kwargs}

    def telegram_helper_registry(self):
        return {"helper": True, "kwargs": self.kwargs}

    def support_service_registry(self):
        class _SupportRegistry:
            def profile_service(self_inner):
                return {"profile": True}

            def runtime_status_service(self_inner):
                return {"status": True}

            def workflow_setup_service(self_inner):
                return {"workflow": True}

            def connector_context_service(self_inner):
                return {"context": True}

            def approval_service(self_inner):
                return {"approval": True}

            def common_support_service(self_inner):
                class _Common:
                    def cognitive_module(self):
                        return "module"

                    def cognitive_defaults(self):
                        return {"ok": True}

                    def normalize_string_list(self, value):
                        return value

                    def chat_id_from_session_key(self, key):
                        return key

                return _Common()

            def skill_service(self_inner):
                class _Skill:
                    def select_skill_from_text(self, text):
                        return {"text": text}

                    def telegram_skill_goal(self, skill):
                        return f"goal:{skill}"

                return _Skill()

            def channel_support_service(self_inner):
                class _Channel:
                    def truncate_one_line(self, text, limit):
                        return str(text)[:limit]

                    def telegram_session_key(self, chat_id):
                        return f"tg:{chat_id}"

                    def whatsapp_session_key(self, a, b):
                        return f"wa:{a}:{b}"

                return _Channel()

        return _SupportRegistry()

    def runtime_service_registry(self):
        class _RuntimeRegistry:
            def connector_support_service(self_inner):
                class _Connector:
                    def bool_from_any(self, value, default=False):
                        return bool(value) if value is not None else default

                    def get_secret(self, entry):
                        return entry

                    def connector_assigned_agent_role(self, entry):
                        return "assistant"

                return _Connector()

            def transport_service(self_inner):
                class _Transport:
                    def api_request(self, *args, **kwargs):
                        return {"args": args, "kwargs": kwargs}

                    def send_message(self, **kwargs):
                        return kwargs

                return _Transport()

            def terminal_service(self_inner):
                return {"terminal": True}

            def run_entry_service(self_inner):
                return {"run_entry": True}

            def runtime_support_service(self_inner):
                class _RuntimeSupport:
                    def local_companion_snapshot(self):
                        return {"local": True}

                    def current_runtime_metrics(self):
                        return {"metrics": True}

                    def latest_runtime_run_summary(self):
                        return "summary"

                return _RuntimeSupport()

            def menu_service(self_inner):
                class _Menu:
                    def reply_keyboard(self, profile):
                        return {"profile": profile}

                return _Menu()

        return _RuntimeRegistry()


class _FakeBridgeFacade:
    def event_bridge_service(self):
        class _EventBridge:
            def append_channel_dead_letter(self, **kwargs):
                return kwargs

            def record_channel_event(self, **kwargs):
                return kwargs

        return _EventBridge()


class AutopilotRegistryFacadeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        _FakeBridge.instances.clear()

    def _service(self, patched):
        return AutopilotRegistryFacadeService(
            project_root="/tmp/project",
            default_chat_prefix="/empyralis",
            telegram_default_workspace_id_getter=lambda: patched["telegram_workspace_id"],
            telegram_onboarding_enabled=True,
            telegram_require_prefix_getter=lambda: patched["telegram_require_prefix"],
            telegram_prefix_getter=lambda: patched["telegram_prefix"],
            telegram_space_status_enabled=True,
            telegram_media_max_items=4,
            telegram_max_updates=5,
            telegram_poll_seconds=2.0,
            telegram_run_timeout_seconds_getter=lambda: patched["telegram_timeout"],
            telegram_max_reply_chars_getter=lambda: patched["telegram_max_reply_chars"],
            telegram_send_ack_getter=lambda: patched["telegram_send_ack"],
            telegram_enabled_getter=lambda: patched["telegram_enabled"],
            telegram_default_profile_getter=lambda: patched["telegram_profile"],
            telegram_guided_automation_setup_enabled=True,
            telegram_trust_mode_value_getter=lambda: patched["telegram_trust_mode"],
            telegram_execution_target_value_getter=lambda: patched["telegram_execution_target"],
            whatsapp_enabled_getter=lambda: patched["whatsapp_enabled"],
            whatsapp_default_profile_getter=lambda: patched["whatsapp_profile"],
            whatsapp_require_prefix_getter=lambda: patched["whatsapp_require_prefix"],
            whatsapp_prefix_getter=lambda: patched["whatsapp_prefix"],
            whatsapp_run_timeout_seconds_getter=lambda: patched["whatsapp_timeout"],
            whatsapp_max_reply_chars_getter=lambda: patched["whatsapp_max_reply_chars"],
            whatsapp_send_ack_getter=lambda: patched["whatsapp_send_ack"],
            whatsapp_trust_mode_value_getter=lambda: patched["whatsapp_trust_mode"],
            whatsapp_execution_target_value_getter=lambda: patched["whatsapp_execution_target"],
            telegram_state_getter=lambda: {"active": True},
            telegram_lock_getter=lambda: object(),
            telegram_state_file="/tmp/tg-state.json",
            whatsapp_state_getter=lambda: {"active": True},
            whatsapp_lock_getter=lambda: object(),
            whatsapp_state_file="/tmp/wa-state.json",
            read_json=lambda path, default: default,
            write_json=lambda path, payload: payload,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            normalize_workspace_id=lambda value: str(value or "default"),
            load_vault=lambda: {"vault": True},
            workspace_visible=lambda workspace_id, entry: True,
            telegram_thread_alive=lambda: True,
            telegram_allow_from_value=lambda: "",
            get_updates_process_lock=lambda bot_token: bot_token,
            mark_telegram_started=lambda started_at: started_at,
            resolve_vault_credential=lambda credential_id, workspace_id: {"credential_id": credential_id, "workspace_id": workspace_id},
            safe_path_token=lambda value: f"safe:{value}",
            runs_get=lambda run_id: {"run_id": run_id},
            telegram_space_question_via_mcp=lambda **kwargs: kwargs,
            helper_profile_state_file="/tmp/profiles.json",
            helper_onboarding_state_file="/tmp/onboarding.json",
            helper_camera_setup_state_file="/tmp/camera.json",
            helper_media_dir="/tmp/media",
            helper_media_enabled=True,
            helper_media_max_items=4,
            helper_media_max_bytes=1024,
            helper_media_include_in_goal=True,
            helper_quick_goal_templates={"project update": "summary"},
            helper_menu_goal_templates={"project update": "summary"},
            support_workflow_api_url="http://workflow",
            support_runtime_url="http://runtime",
            support_web_url="http://web",
            telegram_profile_catalog_getter=lambda: {"ops": {}},
            whatsapp_profile_catalog_getter=lambda: {"support": {}},
            support_installed_skills_enabled=True,
            support_error_category_hints=[("timeout", "timeout")],
            support_engine_validation_errors_getter=lambda: [],
            env_get=lambda key, default="": default,
            init_runtime=lambda: None,
            runtime_telegram_engine_getter=lambda: "orion",
            runtime_whatsapp_engine_getter=lambda: "orion",
            runtime_telegram_show_buttons=True,
            runtime_local_lease_seconds=30,
            runtime_non_retryable_run_error_hints=["fatal"],
            runtime_builtin_skills_limit_builder=lambda scope_key, limit: [{"scope_key": scope_key, "limit": limit}],
            normalize_agent_role=lambda value: str(value or "").lower(),
            allow_any_chat_getter=lambda: True,
            http_json_request=lambda *args, **kwargs: {"args": args, "kwargs": kwargs},
            telegram_profile_fields=["about"],
            normalize_trust_mode=lambda value: str(value),
            normalize_execution_target=lambda value: str(value),
            decide_execution_target=lambda metadata: {"selected": "cloud", "metadata": metadata},
            apply_execution_route_metadata=lambda metadata, route: {**metadata, "route": route},
            create_run=lambda **kwargs: kwargs,
            inherit_owner_user_id=lambda owner_user_id=None: owner_user_id,
            agent_machine_full_trust_enabled=lambda owner_user_id: True,
            run_history=[],
            run_history_lock=object(),
            runtime_metrics={"runs": 1},
            metrics_lock=object(),
            utc_now=lambda: "now",
            parse_utc_ts=lambda value: value,
            worker_online_helper=lambda record, now=None: True,
            local_queue_lock=object(),
            local_pending_run_ids=[],
            local_claimed_runs=[],
            local_worker_registry={},
            truncate_one_line=lambda text, limit: str(text)[:limit],
            bool_from_any=lambda value, default=False: bool(value) if value is not None else default,
            local_companion_snapshot=lambda: {"local": True},
            current_runtime_metrics=lambda: {"metrics": True},
            latest_runtime_run_summary=lambda: "summary",
            list_vault_connectors=lambda workspace_id: [],
            list_recent_connector_messages=lambda credentials, limit: [],
            query_active_installed_skills=lambda **kwargs: [],
            runtime_builtin_skills_getter=lambda: [],
            runtime_skills_snapshot_getter=lambda: [],
            bridge_facade_getter=lambda: _FakeBridgeFacade(),
            channel_registry_bridge_class=_FakeBridge,
            helper_registry_bridge_class=_FakeBridge,
            support_registry_bridge_class=_FakeBridge,
            runtime_registry_bridge_class=_FakeBridge,
        )

    def test_facade_caches_bridge_builders_and_preserves_late_bound_values(self) -> None:
        patched = {
            "telegram_workspace_id": "default",
            "telegram_require_prefix": False,
            "telegram_prefix": "/empyralis",
            "telegram_timeout": 180,
            "telegram_max_reply_chars": 1200,
            "telegram_send_ack": False,
            "telegram_enabled": True,
            "telegram_profile": "ops",
            "telegram_trust_mode": "workspace_write",
            "telegram_execution_target": "local",
            "whatsapp_enabled": True,
            "whatsapp_profile": "support",
            "whatsapp_require_prefix": False,
            "whatsapp_prefix": "/empyralis",
            "whatsapp_timeout": 180,
            "whatsapp_max_reply_chars": 1200,
            "whatsapp_send_ack": False,
            "whatsapp_trust_mode": "workspace_write",
            "whatsapp_execution_target": "local",
        }
        service = self._service(patched)

        channel_first = service.channel_registry_bridge_service()
        self.assertIs(channel_first, service.channel_registry_bridge_service())
        helper_first = service.helper_registry_bridge_service()
        self.assertIs(helper_first, service.helper_registry_bridge_service())
        support_first = service.support_registry_bridge_service()
        self.assertIs(support_first, service.support_registry_bridge_service())
        runtime_first = service.runtime_registry_bridge_service()
        self.assertIs(runtime_first, service.runtime_registry_bridge_service())

        self.assertEqual(len(_FakeBridge.instances), 4)
        self.assertEqual(channel_first.kwargs["telegram_default_workspace_id"], "default")
        self.assertEqual(helper_first.kwargs["default_chat_prefix"], "/empyralis")
        self.assertEqual(support_first.kwargs["workflow_api_url"], "http://workflow")
        self.assertEqual(runtime_first.kwargs["telegram_engine"], "orion")

        self.assertEqual(service.telegram_service_registry()["telegram"], True)
        self.assertEqual(service.whatsapp_service_registry()["whatsapp"], True)
        self.assertEqual(service.telegram_helper_registry()["helper"], True)
        self.assertEqual(service.profile_service(), {"profile": True})
        self.assertEqual(service.runtime_status_service(), {"status": True})
        self.assertEqual(service.terminal_service(), {"terminal": True})


if __name__ == "__main__":
    unittest.main()
