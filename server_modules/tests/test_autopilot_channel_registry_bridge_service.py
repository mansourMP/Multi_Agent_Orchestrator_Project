import unittest

from server_modules.connectors.autopilot_channel_registry_bridge_service import AutopilotChannelRegistryBridgeService


class _FakeTelegramRegistry:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        type(self).instances.append(self)


class _FakeWhatsAppRegistry:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        type(self).instances.append(self)


class _FakeChannelSupportService:
    def classify_error(self, detail):
        return f"classified:{detail}"

    def iso_from_epoch(self, ts):
        return f"iso:{ts}"

    def telegram_autopilot_log(self, message):
        return f"log:{message}"

    def telegram_session_key(self, chat_id):
        return f"tg-session:{chat_id}"

    def telegram_trace_id(self, chat_id, update_id, message_id):
        return f"tg-trace:{chat_id}:{update_id}:{message_id}"

    def truncate_one_line(self, text, limit):
        return str(text)[:limit]

    def include_run_meta(self):
        return True

    def whatsapp_session_key(self, inbound_from, inbound_to):
        return f"wa-session:{inbound_from}:{inbound_to}"


class _FakeProfileService:
    def resolve_telegram_profile(self, entry):
        return {"kind": "telegram", "entry": entry}

    def resolve_whatsapp_profile(self, entry):
        return {"kind": "whatsapp", "entry": entry}

    def whatsapp_help_text(self, profile):
        return f"wa-help:{profile.get('id')}"


class _FakeRuntimeStatusService:
    def runtime_status_text(self, workspace_id):
        return f"status:{workspace_id}"


class _FakeWorkflowSetupService:
    def handle_telegram_guided_automation_setup(self, **kwargs):
        return kwargs


class _FakeConnectorContextService:
    def workspace_connector_context(self, **kwargs):
        return kwargs

    def build_goal_with_connector_context(self, goal, prompt_append):
        return f"{goal}|{prompt_append}"

    def installed_skill_query(self, **kwargs):
        return kwargs


class _FakeApprovalService:
    def notify_pending_approvals(self, **kwargs):
        return kwargs

    def approvals_list(self, limit):
        return {"limit": limit}

    def approvals_text(self, payload, prefix):
        return f"{prefix}:{payload.get('limit')}"

    def approval_resolve(self, event_id, approved, note):
        return {"event_id": event_id, "approved": approved, "note": note}

    def approval_result_text(self, payload, approved):
        return f"{payload.get('event_id')}:{approved}"


class _FakeSkillService:
    def select_skill_from_text(self, raw_text):
        return {"name": raw_text}

    def telegram_skill_goal(self, skill):
        return f"goal:{skill.get('name')}"

    def telegram_skills_menu_text(self, profile):
        return f"skills:{profile.get('id')}"


class _FakeSupportRegistry:
    def __init__(self):
        self.channel = _FakeChannelSupportService()
        self.profile = _FakeProfileService()
        self.runtime = _FakeRuntimeStatusService()
        self.workflow = _FakeWorkflowSetupService()
        self.context = _FakeConnectorContextService()
        self.approval = _FakeApprovalService()
        self.skill = _FakeSkillService()

    def channel_support_service(self):
        return self.channel

    def profile_service(self):
        return self.profile

    def runtime_status_service(self):
        return self.runtime

    def workflow_setup_service(self):
        return self.workflow

    def connector_context_service(self):
        return self.context

    def approval_service(self):
        return self.approval

    def skill_service(self):
        return self.skill


class _FakeConnectorSupportService:
    def resolve_allow_from(self, entry, allow_from):
        return [entry.get("id"), allow_from]

    def get_secret(self, entry):
        return {"secret": entry.get("id")}

    def connector_paused(self, item):
        return bool(item.get("paused"))

    def chat_matches(self, configured_chat_id, chat):
        return configured_chat_id == chat.get("id")

    def sender_allowed(self, sender, allow_from):
        return sender.get("id") in allow_from


class _FakeTransportService:
    def api_request(self, bot_token, method, **kwargs):
        return {"bot_token": bot_token, "method": method, "kwargs": kwargs}

    def send_message(self, *args, **kwargs):
        return {"args": args, "kwargs": kwargs}

    def send_chat_action(self, *args, **kwargs):
        return {"args": args, "kwargs": kwargs}

    def edit_message(self, *args, **kwargs):
        return {"args": args, "kwargs": kwargs}


class _FakeTerminalService:
    pass


class _FakeRunEntryService:
    def create_telegram_run(self, **kwargs):
        return kwargs

    def create_whatsapp_run(self, **kwargs):
        return kwargs

    def can_auto_approve_wait(self, run):
        return run == "wait"

    def pending_confirmation_payload(self, run):
        return {"run": run}


class _FakeRuntimeSupportService:
    def humanize_telegram_run_summary(self, text):
        return f"summary:{text}"

    def latest_run_error_message(self, run):
        return f"error:{run}"

    def is_non_retryable_run_error(self, error):
        return error == "fatal"

    def friendly_run_error(self, error):
        return f"friendly:{error}"

    def summarize_run_terminal_result(self, run, limit):
        return f"{run}:{limit}"

    def local_companion_snapshot(self):
        return {"status": "ok"}


class _FakeMenuService:
    def menu_keyboard(self, profile, menu_id):
        return {"profile": profile.get("id"), "menu_id": menu_id}


class _FakeRuntimeRegistry:
    def __init__(self):
        self.connector = _FakeConnectorSupportService()
        self.transport = _FakeTransportService()
        self.terminal = _FakeTerminalService()
        self.run_entry = _FakeRunEntryService()
        self.runtime_support = _FakeRuntimeSupportService()
        self.menu = _FakeMenuService()

    def connector_support_service(self):
        return self.connector

    def transport_service(self):
        return self.transport

    def terminal_service(self):
        return self.terminal

    def run_entry_service(self):
        return self.run_entry

    def runtime_support_service(self):
        return self.runtime_support

    def menu_service(self):
        return self.menu


class _FakeProfileHelperService:
    def normalize_profile_field(self, raw_value):
        return str(raw_value).strip().lower()

    def onboarding_prompt(self, step_index, retry):
        return f"{step_index}:{retry}"

    def start_onboarding(self, workspace_id, chat_id):
        return {"workspace_id": workspace_id, "chat_id": chat_id}

    def profile_text(self, profile, chat_profile):
        return f"{profile.get('id')}:{chat_profile.get('id')}"

    def profile_help_text(self, profile):
        return f"profile-help:{profile.get('id')}"

    def set_profile_field(self, workspace_id, chat_id, field_name, value):
        return (workspace_id, chat_id, field_name, value)

    def clear_profile(self, workspace_id, chat_id, field_name):
        return (workspace_id, chat_id, field_name)

    def get_profile(self, workspace_id, chat_id):
        return {"workspace_id": workspace_id, "chat_id": chat_id}

    def get_onboarding_state(self, workspace_id, chat_id):
        return {"workspace_id": workspace_id, "chat_id": chat_id, "state": "active"}

    def onboarding_consume_answer(self, workspace_id, chat_id, text):
        return {"workspace_id": workspace_id, "chat_id": chat_id, "text": text}

    def profile_has_context(self, chat_profile):
        return bool(chat_profile)

    def build_goal_with_profile(self, goal, chat_profile):
        return f"{goal}|{chat_profile.get('chat_id')}"


class _FakeRoutingHelperService:
    def help_text(self, profile):
        return f"help:{profile.get('id')}"

    def route_message(self, message_text, profile):
        return {"message_text": message_text, "profile": profile.get("id")}

    def is_explicit_run_command(self, raw_text):
        return raw_text.startswith("/run")


class _FakeMediaHelperService:
    def extract_message(self, update):
        return update.get("message")

    def store_attachments(self, **kwargs):
        return [kwargs]

    def build_goal_with_attachments(self, goal, attachments):
        return f"{goal}|attachments:{len(attachments)}"


class _FakeHelperRegistry:
    def __init__(self):
        self.profile = _FakeProfileHelperService()
        self.routing = _FakeRoutingHelperService()
        self.media = _FakeMediaHelperService()

    def profile_service(self):
        return self.profile

    def routing_service(self):
        return self.routing

    def media_service(self):
        return self.media


class _FakeEventBridgeService:
    def record_channel_event(self, **kwargs):
        return kwargs

    def record_channel_event_throttled(self, **kwargs):
        return kwargs

    def append_channel_dead_letter(self, **kwargs):
        return kwargs


class AutopilotChannelRegistryBridgeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        _FakeTelegramRegistry.instances.clear()
        _FakeWhatsAppRegistry.instances.clear()

    def _service(self) -> AutopilotChannelRegistryBridgeService:
        return AutopilotChannelRegistryBridgeService(
            project_root="/tmp/project",
            default_chat_prefix="/empyralis",
            telegram_default_workspace_id="default",
            telegram_onboarding_enabled=True,
            telegram_require_prefix=True,
            telegram_prefix="/emp",
            telegram_space_status_enabled=True,
            telegram_media_max_items=4,
            telegram_max_updates=10,
            telegram_poll_seconds=2.0,
            telegram_run_timeout_seconds=180,
            telegram_max_reply_chars=1200,
            telegram_send_ack=True,
            telegram_enabled=True,
            telegram_default_profile="ops",
            telegram_guided_automation_setup_enabled=True,
            telegram_trust_mode_value="workspace_write",
            telegram_execution_target_value="local",
            whatsapp_enabled=True,
            whatsapp_default_profile="support",
            whatsapp_require_prefix=False,
            whatsapp_prefix="",
            whatsapp_run_timeout_seconds=90,
            whatsapp_max_reply_chars=800,
            whatsapp_send_ack=False,
            whatsapp_trust_mode_value="full",
            whatsapp_execution_target_value="cloud",
            telegram_state={},
            telegram_lock=object(),
            telegram_state_file="/tmp/tg.json",
            whatsapp_state={},
            whatsapp_lock=object(),
            whatsapp_state_file="/tmp/wa.json",
            read_json=lambda path, default: default,
            write_json=lambda path, payload: payload,
            utc_now_iso=lambda: "2026-04-05T00:00:00Z",
            normalize_workspace_id=lambda value: str(value or "default"),
            load_vault=lambda: {"vault": True},
            workspace_visible=lambda workspace_id, requested_ws: workspace_id == requested_ws,
            telegram_thread_alive=lambda: True,
            telegram_allow_from_value=lambda: "admin",
            get_updates_process_lock=lambda bot_token: bot_token,
            mark_telegram_started=lambda started_at: started_at,
            resolve_vault_credential=lambda credential_id, workspace_id: {"credential_id": credential_id, "workspace_id": workspace_id},
            safe_path_token=lambda value: f"safe:{value}",
            runs_get=lambda run_id: {"run_id": run_id},
            sleep=lambda seconds: seconds,
            telegram_space_question_via_mcp=lambda goal, **kwargs: {"goal": goal, **kwargs},
            telegram_helper_registry=lambda: _FakeHelperRegistry(),
            autopilot_support_service_registry=lambda: _FakeSupportRegistry(),
            autopilot_runtime_service_registry=lambda: _FakeRuntimeRegistry(),
            autopilot_event_bridge_service=lambda: _FakeEventBridgeService(),
            telegram_registry_class=_FakeTelegramRegistry,
            whatsapp_registry_class=_FakeWhatsAppRegistry,
        )

    def test_bridge_caches_telegram_registry_and_wires_callbacks(self) -> None:
        service = self._service()

        first = service.telegram_service_registry()
        second = service.telegram_service_registry()

        self.assertIs(first, second)
        self.assertEqual(len(_FakeTelegramRegistry.instances), 1)
        kwargs = first.kwargs
        self.assertEqual(kwargs["default_workspace_id"], "default")
        self.assertEqual(kwargs["classify_error"]("boom"), "classified:boom")
        self.assertEqual(kwargs["resolve_profile"]({"id": "conn-1"}), {"kind": "telegram", "entry": {"id": "conn-1"}})
        self.assertEqual(kwargs["help_text"]({"id": "ops"}), "help:ops")
        self.assertEqual(kwargs["send_message"]("chat-1", "hello")["args"], ("chat-1", "hello"))
        self.assertEqual(
            kwargs["create_run"](goal="test"),
            {
                "goal": "test",
                "media_max_items": 4,
                "trust_mode_value": "workspace_write",
                "execution_target_value": "local",
            },
        )

    def test_bridge_caches_whatsapp_registry_and_wires_callbacks(self) -> None:
        service = self._service()

        first = service.whatsapp_service_registry()
        second = service.whatsapp_service_registry()

        self.assertIs(first, second)
        self.assertEqual(len(_FakeWhatsAppRegistry.instances), 1)
        kwargs = first.kwargs
        self.assertTrue(kwargs["enabled"])
        self.assertEqual(kwargs["classify_error"]("down"), "classified:down")
        self.assertEqual(kwargs["help_text"]({"id": "support"}), "wa-help:support")
        self.assertEqual(kwargs["safe_path_token"]("abc"), "safe:abc")
        self.assertEqual(
            kwargs["create_run"](goal="reply"),
            {
                "goal": "reply",
                "trust_mode_value": "full",
                "execution_target_value": "cloud",
            },
        )
        self.assertEqual(kwargs["session_key_builder"]("+1", "+2"), "wa-session:+1:+2")


if __name__ == "__main__":
    unittest.main()
