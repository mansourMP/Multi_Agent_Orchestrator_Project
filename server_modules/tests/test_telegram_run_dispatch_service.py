import unittest
from pathlib import Path

from server_modules.connectors.telegram_run_dispatch_service import TelegramRunDispatchService


class _Queue:
    def __init__(self) -> None:
        self.items = []

    def put(self, item):
        self.items.append(item)


class TelegramRunDispatchServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramRunDispatchService:
        runs = overrides.pop("runs", {})
        time_values = overrides.pop("time_values", [0.0, 999.0])
        local_state = overrides.pop(
            "local_state",
            {"pending_runs": 0, "claimed_runs": 0, "online_workers": 1},
        )
        include_meta = overrides.pop("include_meta", lambda: False)
        service = TelegramRunDispatchService(
            project_root=Path("/tmp/empyralis"),
            default_timeout_seconds=60,
            default_max_reply_chars=240,
            send_ack=overrides.pop("send_ack", True),
            include_run_meta=include_meta,
            humanize_run_summary=lambda text: str(text or "").strip(),
            truncate_one_line=lambda text, limit: str(text or "").strip()[:limit],
            runs_get=lambda run_id: runs.get(run_id),
            latest_run_error_message=lambda run: str(run.get("error") or ""),
            is_non_retryable_run_error=lambda error: "fatal" in str(error or "").lower(),
            friendly_run_error=lambda error: f"Friendly: {error}",
            summarize_run_terminal_result=lambda run, limit: str(run.get("result") or "Run finished.")[:limit],
            local_companion_snapshot=lambda: dict(local_state),
            can_auto_approve_wait=lambda run: bool(run.get("can_auto_approve")),
            pending_confirmation_payload=lambda run: dict(run.get("pending_confirmation") or {}),
            emit_channel_run_delivery_event=overrides.pop("emit_channel_run_delivery_event", lambda **kwargs: None),
            time_now=lambda: time_values.pop(0) if time_values else 999.0,
            sleep=lambda seconds: None,
        )
        return service

    def test_run_reply_text_respects_meta_flag(self) -> None:
        without_meta = self._make_service(include_meta=lambda: False)
        with_meta = self._make_service(include_meta=lambda: True)

        self.assertEqual(without_meta.run_reply_text("completed", "run-1", "Done"), "Done")
        self.assertEqual(
            with_meta.run_reply_text("completed", "run-1", "Done"),
            "⬢ completed\nrun_id: run-1\nDone",
        )

    def test_wait_for_terminal_status_auto_approves_waiting_run(self) -> None:
        queue = _Queue()
        run = {
            "status": "waiting_for_input",
            "can_auto_approve": True,
            "pending_confirmation": {"approval_id": "ap-1"},
            "input_queue": queue,
        }
        service = self._make_service(runs={"run-1": run}, time_values=[0.0, 0.0, 61.0, 61.0])

        result = service.wait_for_terminal_status("run-1", timeout_seconds=60)

        self.assertEqual(result["status"], "timeout")
        self.assertTrue(result["auto_approved"])
        self.assertEqual(queue.items, [{"approval_id": "ap-1", "decision": "proceed"}])

    def test_dispatch_run_action_sends_ack_and_schedules_durable_delivery(self) -> None:
        emitted = []
        service = self._make_service(include_meta=lambda: True, emit_channel_run_delivery_event=lambda **kwargs: emitted.append(kwargs))

        chat_actions = []
        sent_messages = []

        result = service.dispatch_run_action(
            bot_token="bot",
            chat_id="chat-1",
            workspace_id="ws-1",
            connector_id="conn-1",
            sender_id="user-1",
            update_id=7,
            inbound_message_id="msg-1",
            profile_context={"project": "alpha"},
            media_attachments=[{"path": "a.png"}],
            skill_override={"id": "skill"},
            trace_id="trace-1",
            source_event_id="evt-1",
            connector_entry={"assigned_agent_role": "operator"},
            connector_context={"connector_provider": "telegram"},
            session_key="tg:chat-1",
            profile={"id": "profile-1"},
            action="run",
            goal="Summarize everything",
            create_run=lambda **kwargs: {"run_id": "run-1", "route": "local"},
            record_channel_event=lambda **kwargs: None,
            send_chat_action=lambda *args, **kwargs: chat_actions.append((args, kwargs)),
            send_message=lambda *args, **kwargs: sent_messages.append((args, kwargs)) or "pending-1",
            edit_message=lambda *args, **kwargs: True,
        )

        self.assertEqual(result["run_id"], "run-1")
        self.assertEqual(result["status"], "accepted")
        self.assertEqual(len(chat_actions), 1)
        self.assertEqual(len(sent_messages), 1)
        self.assertIn("Thinking...\nrun_id: run-1", sent_messages[0][1]["text"])
        self.assertEqual(len(emitted), 1)
        self.assertEqual(emitted[0]["channel"], "telegram")
        self.assertEqual(emitted[0]["payload"]["pending_message_id"], "pending-1")

    def test_deliver_final_response_edits_pending_message(self) -> None:
        service = self._make_service(include_meta=lambda: True)
        edited_messages = []
        sent_messages = []
        channel_events = []

        result = service.deliver_final_response(
            bot_token="bot",
            chat_id="chat-1",
            workspace_id="ws-1",
            connector_id="conn-1",
            session_key="tg:chat-1",
            profile={"id": "profile-1"},
            run_id="run-1",
            pending_message_id="pending-1",
            inbound_message_id="msg-1",
            action="run",
            trace_id="trace-1",
            source_event_id="evt-1",
            status="completed",
            summary="Run finished.",
            record_channel_event=lambda **kwargs: channel_events.append(kwargs),
            send_message=lambda *args, **kwargs: sent_messages.append((args, kwargs)) or "msg-2",
            edit_message=lambda *args, **kwargs: edited_messages.append((args, kwargs)) or True,
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(edited_messages), 1)
        self.assertEqual(sent_messages, [])
        self.assertEqual(channel_events[0]["event_type"], "run_completed")


if __name__ == "__main__":
    unittest.main()
