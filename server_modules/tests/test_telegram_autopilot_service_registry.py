import contextlib
import tempfile
import threading
import unittest
from pathlib import Path

from server_modules.connectors.telegram_autopilot_service_registry import TelegramAutopilotServiceRegistry


class TelegramAutopilotServiceRegistryTests(unittest.TestCase):
    def _make_registry(self) -> TelegramAutopilotServiceRegistry:
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        state_file = Path(tmpdir.name) / "telegram_state.json"

        @contextlib.contextmanager
        def _poll_lock(_bot_token: str):
            yield True

        return TelegramAutopilotServiceRegistry(
            project_root=Path(tmpdir.name),
            default_workspace_id="default",
            default_chat_prefix="/empyralis",
            onboarding_enabled=True,
            require_prefix=True,
            prefix="/empyralis",
            space_status_enabled=True,
            media_max_items=4,
            max_updates=25,
            poll_seconds=5.0,
            delivery_mode="polling",
            run_timeout_seconds=180,
            max_reply_chars=1200,
            send_ack=True,
            state={"connectors_seen": 0},
            lock=threading.Lock(),
            state_file=state_file,
            read_json=lambda path, default: default,
            write_json=lambda path, payload: None,
            persist_state=lambda: None,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            classify_error=lambda detail: "runtime",
            iso_from_epoch=lambda ts: "2026-04-05T00:00:00Z",
            normalize_workspace_id=lambda value: str(value or ""),
            thread_alive=lambda: False,
            enabled=True,
            default_profile="",
            list_connector_entries=lambda: [],
            resolve_profile=lambda entry: {"id": "profile-1"},
            resolve_allow_from=lambda entry: [],
            connector_state=lambda connector_id: {"last_update_id": 0},
            set_connector_state=lambda connector_id, patch: None,
            resolve_secret=lambda entry: {"bot_token": "token", "chat_id": "chat-1"},
            load_vault=lambda: {},
            workspace_visible=lambda workspace_id, requested_ws: True,
            connector_paused=lambda item: False,
            get_updates_process_lock=lambda bot_token: _poll_lock(bot_token),
            notify_pending_approvals=lambda **kwargs: {},
            telegram_api_request=lambda bot_token, method, **kwargs: {"result": []},
            record_channel_event=lambda **kwargs: None,
            record_channel_event_throttled=lambda **kwargs: None,
            send_message=lambda *args, **kwargs: None,
            send_chat_action=lambda *args, **kwargs: None,
            edit_message=lambda *args, **kwargs: None,
            autopilot_log=lambda message: None,
            autopilot_mark_error=lambda detail, source: 8.0,
            mark_poll=lambda clear_error: None,
            mark_started=lambda started_at: None,
            normalize_profile_field=lambda raw_value: str(raw_value or ""),
            select_skill_from_text=lambda raw_text: None,
            skill_goal_builder=lambda skill: "",
            help_text=lambda profile: "help",
            skills_menu_text=lambda profile: "skills",
            menu_keyboard=lambda profile, menu_id: {},
            onboarding_prompt=lambda step_index, retry: "prompt",
            onboarding_start=lambda workspace_id, chat_id: {"active": True},
            profile_text=lambda profile, chat_profile: "profile",
            profile_help_text=lambda profile: "profile help",
            profile_set=lambda workspace_id, chat_id, field_name, value: None,
            profile_clear=lambda workspace_id, chat_id, field_name: None,
            runtime_status_text=lambda workspace_id: "status",
            approvals_list=lambda limit: {},
            approvals_text=lambda payload, prefix: "approvals",
            approval_resolve=lambda event_id, approved, note: {},
            approval_result_text=lambda payload, approved: "result",
            extract_message=lambda update: update.get("message"),
            chat_matches=lambda configured_chat_id, chat: True,
            store_attachments=lambda **kwargs: [],
            route_message=lambda message_text, profile: {"action": "help"},
            session_key_builder=lambda chat_id: f"session:{chat_id}",
            trace_id_builder=lambda chat_id, update_id, message_id: "trace-1",
            guided_setup_handler=lambda **kwargs: {"handled": False},
            sender_allowed=lambda sender, allow_from: True,
            get_chat_profile=lambda workspace_id, chat_id: {},
            explicit_run_command=lambda raw_text: False,
            onboarding_get_state=lambda workspace_id, chat_id: {"active": False},
            onboarding_consume_answer=lambda workspace_id, chat_id, text: {"reply": "ok"},
            profile_get=lambda workspace_id, chat_id: {},
            profile_has_context=lambda chat_profile: False,
            build_goal_with_profile=lambda goal, chat_profile: goal,
            build_goal_with_attachments=lambda goal, attachments: goal,
            workspace_connector_context=lambda **kwargs: {"prompt_append": ""},
            build_goal_with_connector_context=lambda goal, prompt_append: goal,
            space_question_via_mcp=lambda *args, **kwargs: {"handled": False},
            installed_skill_query=lambda **kwargs: {"handled": False},
            truncate_one_line=lambda text, limit: text[:limit],
            create_run=lambda **kwargs: {"run_id": "run-1"},
            include_run_meta=lambda: True,
            humanize_run_summary=lambda text: text,
            runs_get=lambda run_id: {},
            latest_run_error_message=lambda run: "",
            is_non_retryable_run_error=lambda error: False,
            friendly_run_error=lambda error: error,
            summarize_run_terminal_result=lambda run, limit: "",
            local_companion_snapshot=lambda: {},
            can_auto_approve_wait=lambda run: False,
            pending_confirmation_payload=lambda run: {},
            emit_channel_run_delivery_event=lambda **kwargs: None,
            sleep=lambda seconds: None,
        )

    def test_registry_caches_telegram_services(self) -> None:
        registry = self._make_registry()
        self.assertIs(registry.telegram_run_dispatch_service(), registry.telegram_run_dispatch_service())
        self.assertIs(registry.telegram_poll_cycle_service(), registry.telegram_poll_cycle_service())
        self.assertIs(registry.telegram_autopilot_supervisor_service(), registry.telegram_autopilot_supervisor_service())

    def test_registry_builds_nested_poll_services(self) -> None:
        registry = self._make_registry()
        poll_service = registry.telegram_connector_poll_service()
        self.assertIs(poll_service, registry.telegram_connector_poll_service())
        self.assertIsNotNone(registry.telegram_poll_dispatch_service())
        self.assertIsNotNone(registry.telegram_poll_state_service())
        self.assertIsNotNone(registry.telegram_webhook_service())


if __name__ == "__main__":
    unittest.main()
