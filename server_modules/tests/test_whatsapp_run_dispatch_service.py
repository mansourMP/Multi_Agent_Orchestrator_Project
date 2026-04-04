import unittest

from server_modules.connectors.whatsapp_run_dispatch_service import WhatsAppRunDispatchService


class WhatsAppRunDispatchServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> WhatsAppRunDispatchService:
        return WhatsAppRunDispatchService(
            default_timeout_seconds=60,
            default_max_reply_chars=240,
            send_ack=overrides.pop("send_ack", True),
            include_run_meta=overrides.pop("include_run_meta", lambda: False),
            truncate_one_line=lambda text, limit: str(text or "").strip()[:limit],
            wait_for_run_terminal_status=overrides.pop(
                "wait_for_run_terminal_status",
                lambda run_id, timeout_seconds=None, max_reply_chars=None: {
                    "status": "completed",
                    "summary": "Run finished.",
                },
            ),
            run_reply_text=overrides.pop(
                "run_reply_text",
                lambda status, run_id, summary: f"{status}:{run_id}:{summary}",
            ),
            send_whatsapp_message=overrides.pop(
                "send_whatsapp_message",
                lambda **kwargs: {"sid": "SM123"},
            ),
            append_dead_letter=overrides.pop("append_dead_letter", lambda **kwargs: None),
            record_channel_event=overrides.pop("record_channel_event", lambda **kwargs: None),
            set_connector_state=overrides.pop("set_connector_state", lambda connector_id, payload: None),
            utc_now_iso=overrides.pop("utc_now_iso", lambda: "2026-04-04T00:00:00Z"),
            classify_error=overrides.pop("classify_error", lambda detail: "runtime"),
            log_error=overrides.pop("log_error", lambda message: None),
            mark_error=overrides.pop("mark_error", lambda detail: None),
            session_key_builder=overrides.pop("session_key_builder", lambda reply_to, from_number: f"{reply_to}:{from_number}"),
            safe_path_token=overrides.pop("safe_path_token", lambda value: str(value or "").replace(":", "_")),
        )

    def test_ack_text_includes_run_meta_when_enabled(self) -> None:
        service = self._make_service(include_run_meta=lambda: True)
        self.assertEqual(
            service.ack_text("run-1"),
            "⏣ Empyralis started your request.\nrun_id: run-1",
        )
        self.assertEqual(service.ack_text(""), "⏣ Empyralis started your request.")

    def test_finalize_run_async_records_success(self) -> None:
        events = []
        states = []
        service = self._make_service(
            record_channel_event=lambda **kwargs: events.append(kwargs),
            set_connector_state=lambda connector_id, payload: states.append((connector_id, payload)),
        )

        service.finalize_run_async(
            "run-1",
            "conn-1",
            "ws-1",
            {"id": "profile-1"},
            {
                "account_sid": "AC123",
                "auth_token": "token",
                "from_number": "whatsapp:+100",
            },
            "whatsapp:+200",
        )

        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["direction"], "outbound")
        self.assertEqual(events[1]["event_type"], "run_completed")
        self.assertEqual(states[0][0], "conn-1")
        self.assertEqual(states[0][1]["last_error"], None)

    def test_finalize_run_async_dead_letters_send_failure(self) -> None:
        dead_letters = []
        events = []
        states = []
        marked = []
        service = self._make_service(
            send_whatsapp_message=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("twilio down")),
            append_dead_letter=lambda **kwargs: dead_letters.append(kwargs),
            record_channel_event=lambda **kwargs: events.append(kwargs),
            set_connector_state=lambda connector_id, payload: states.append((connector_id, payload)),
            mark_error=lambda detail: marked.append(detail),
            classify_error=lambda detail: "network",
        )

        service.finalize_run_async(
            "run-2",
            "conn-2",
            "ws-2",
            {"id": "profile-2"},
            {
                "account_sid": "AC999",
                "auth_token": "token",
                "from_number": "whatsapp:+300",
            },
            "whatsapp:+400",
        )

        self.assertEqual(len(dead_letters), 1)
        self.assertEqual(events[0]["event_type"], "error")
        self.assertEqual(states[0][1]["last_error_category"], "network")
        self.assertEqual(marked, ["twilio down"])


if __name__ == "__main__":
    unittest.main()
