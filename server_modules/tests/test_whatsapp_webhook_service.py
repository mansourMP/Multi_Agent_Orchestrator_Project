import unittest

from server_modules.connectors.whatsapp_webhook_service import WhatsAppWebhookService


class WhatsAppWebhookServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> WhatsAppWebhookService:
        record_events = overrides.pop("record_events", [])
        state_patches = overrides.pop("state_patches", [])
        processed = overrides.pop("processed", [])
        persisted = overrides.pop("persisted", [])
        inbound_marks = overrides.pop("inbound_marks", [])
        errors = overrides.pop("errors", [])
        started = overrides.pop("started", [])

        dispatch_stub = overrides.pop(
            "dispatch_stub",
            type(
                "DispatchStub",
                (),
                {
                    "ack_text": staticmethod(lambda run_id: f"ack:{run_id}"),
                    "start_finalize_thread": staticmethod(lambda *args, **kwargs: started.append(args)),
                },
            )(),
        )

        def connector_match(account_sid, inbound_from, inbound_to):
            return overrides.get("match")

        return WhatsAppWebhookService(
            normalize_number=lambda value: value or "",
            session_key_builder=lambda inbound_from, inbound_to: f"{inbound_from}:{inbound_to}",
            safe_path_token=lambda value: str(value or "").replace(":", "_"),
            connector_match=connector_match,
            resolve_profile=lambda entry: {"id": "profile-1", "prefix": "/empyralis"},
            route_message=overrides.get("route_message", lambda body, profile: {"action": "ignore"}),
            help_text=lambda profile: "help",
            runtime_status_text=lambda workspace_id: "status",
            approvals_list=lambda limit: {"events": []},
            approvals_text=lambda payload, prefix: "approvals",
            approval_resolve=lambda event_id, approved, note: {"ok": True},
            approval_result_text=lambda payload, approved: "approved",
            create_run=lambda **kwargs: {"run_id": "run-1"},
            run_dispatch_service=lambda: dispatch_stub,
            record_channel_event=lambda **kwargs: record_events.append(kwargs),
            set_connector_state=lambda connector_id, payload: state_patches.append((connector_id, payload)),
            persist_state=lambda: persisted.append(True),
            increment_processed=lambda: processed.append(True),
            autopilot_activate=lambda: None,
            mark_inbound=lambda **kwargs: inbound_marks.append(kwargs),
            mark_error=lambda detail: errors.append(detail),
            utc_now_iso=lambda: "2026-04-04T00:00:00Z",
            default_chat_prefix="/empyralis",
        )

    def test_unmatched_connector_returns_error_text(self) -> None:
        record_events = []
        errors = []
        service = self._make_service(record_events=record_events, errors=errors, match=None)
        form = {
            "AccountSid": "AC123",
            "MessageSid": "SM123",
            "From": "whatsapp:+100",
            "To": "whatsapp:+200",
            "Body": "hello",
        }
        response = service.handle_inbound(form)

        self.assertIn("not configured", response.lower())
        self.assertEqual(len(record_events), 2)
        self.assertEqual(errors, [record_events[1]["text"]])

    def test_run_action_starts_finalize_thread(self) -> None:
        record_events = []
        state_patches = []
        processed = []
        persisted = []
        started = []
        service = self._make_service(
            record_events=record_events,
            state_patches=state_patches,
            processed=processed,
            persisted=persisted,
            started=started,
            match={"entry": {"id": "entry-1"}, "secret": {"from_number": "whatsapp:+100"}, "connector_id": "conn-1", "workspace_id": "ws-1"},
            route_message=lambda body, profile: {"action": "run", "goal": "do it"},
        )
        response = service.handle_inbound(
            {
                "AccountSid": "AC123",
                "MessageSid": "SM123",
                "From": "whatsapp:+100",
                "To": "whatsapp:+200",
                "Body": "run do it",
            }
        )

        self.assertEqual(response, "ack:run-1")
        self.assertEqual(len(started), 1)
        self.assertEqual(len(state_patches), 1)
        self.assertEqual(len(processed), 1)
        self.assertEqual(len(persisted), 1)
        self.assertTrue(any(evt["direction"] == "outbound" for evt in record_events))

    def test_ignore_action_skips_state_update(self) -> None:
        state_patches = []
        service = self._make_service(
            state_patches=state_patches,
            match={"entry": {"id": "entry-1"}, "secret": {"from_number": "whatsapp:+100"}, "connector_id": "conn-1", "workspace_id": "ws-1"},
            route_message=lambda body, profile: {"action": "ignore"},
        )
        response = service.handle_inbound(
            {
                "AccountSid": "AC123",
                "MessageSid": "SM123",
                "From": "whatsapp:+100",
                "To": "whatsapp:+200",
                "Body": "hello",
            }
        )

        self.assertEqual(response, "")
        self.assertEqual(state_patches, [])


if __name__ == "__main__":
    unittest.main()
