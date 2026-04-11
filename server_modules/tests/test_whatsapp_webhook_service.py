import unittest
from unittest.mock import patch

from server_modules import entitlements_service
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
                    "schedule_final_delivery": staticmethod(lambda **kwargs: started.append(kwargs)),
                },
            )(),
        )

        def connector_match(account_sid, inbound_from, inbound_to):
            return overrides.get("match")

        pairing_result = overrides.get(
            "pairing_result",
            {
                "authorized": True,
                "status": "linked",
                "workspace_id": "ws-1",
                "link": {
                    "link_id": "link-1",
                    "scopes": ["chat", "whatsapp:chat", "whatsapp:opt_in"],
                },
            },
        )

        return WhatsAppWebhookService(
            normalize_number=lambda value: value or "",
            session_key_builder=lambda inbound_from, inbound_to: f"{inbound_from}:{inbound_to}",
            safe_path_token=lambda value: str(value or "").replace(":", "_"),
            connector_match=connector_match,
            resolve_profile=lambda entry: {"id": "profile-1", "prefix": "/empyralis"},
            route_message=overrides.get("route_message", lambda body, profile: {"action": "ignore"}),
            help_text=lambda profile: "help",
            runtime_status_text=lambda workspace_id: "status",
            approvals_list=lambda limit, workspace_id=None: {"events": []},
            approvals_text=lambda payload, prefix: "approvals",
            approval_resolve=lambda event_id, approved, note, workspace_id=None: {"ok": True},
            approval_result_text=lambda payload, approved: "approved",
            create_run=lambda **kwargs: {"run_id": "run-1"},
            run_dispatch_service=lambda: dispatch_stub,
            record_channel_event=lambda **kwargs: record_events.append(kwargs),
            set_connector_state=lambda connector_id, payload: state_patches.append((connector_id, payload)),
            persist_state=lambda: persisted.append(True),
            mark_processed_message=overrides.get("mark_processed_message", lambda connector_id, message_sid: True),
            increment_processed=lambda: processed.append(True),
            autopilot_activate=lambda: None,
            mark_inbound=lambda **kwargs: inbound_marks.append(kwargs),
            mark_error=lambda detail: errors.append(detail),
            utc_now_iso=lambda: "2026-04-04T00:00:00Z",
            default_chat_prefix="/empyralis",
            require_explicit_opt_in=overrides.get("require_explicit_opt_in", True),
            redact_event_text=overrides.get("redact_event_text", True),
            retention_days=overrides.get("retention_days", 30),
            channel_pairing_service=lambda: type(
                "PairingStub",
                (),
                {"authorize_channel_message": staticmethod(lambda **kwargs: pairing_result)},
            )(),
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
        self.assertTrue(errors)
        self.assertIn("No matching WhatsApp connector", errors[0])
        self.assertEqual(record_events[0]["text"], "[redacted]")
        self.assertTrue(record_events[0]["metadata"]["redacted_text"])
        self.assertEqual(record_events[0]["metadata"]["retention_days"], 30)

    def test_run_action_schedules_durable_delivery(self) -> None:
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
        self.assertEqual(started[0]["run_id"], "run-1")
        self.assertEqual(len(state_patches), 1)
        self.assertEqual(len(processed), 1)
        self.assertEqual(len(persisted), 1)
        self.assertTrue(any(evt["direction"] == "outbound" for evt in record_events))
        inbound_events = [evt for evt in record_events if evt["direction"] == "inbound"]
        self.assertEqual(inbound_events[0]["text"], "[redacted]")
        self.assertEqual(inbound_events[0]["metadata"]["link_id"], "link-1")

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

    def test_unpaired_sender_gets_guidance_without_run_access(self) -> None:
        state_patches = []
        processed = []
        service = self._make_service(
            state_patches=state_patches,
            processed=processed,
            pairing_result={
                "authorized": False,
                "status": "pairing_required",
                "reply_text": "pair me",
            },
            match={"entry": {"id": "entry-1"}, "secret": {"from_number": "whatsapp:+100"}, "connector_id": "conn-1", "workspace_id": "ws-1"},
            route_message=lambda body, profile: {"action": "run", "goal": "do it"},
        )

        response = service.handle_inbound(
            {
                "AccountSid": "AC123",
                "MessageSid": "SM124",
                "From": "whatsapp:+100",
                "To": "whatsapp:+200",
                "Body": "hello",
            }
        )

        self.assertEqual(response, "pair me")
        self.assertEqual(state_patches, [])
        self.assertEqual(processed, [])

    def test_missing_whatsapp_opt_in_scope_gets_guidance_without_run_access(self) -> None:
        state_patches = []
        processed = []
        service = self._make_service(
            state_patches=state_patches,
            processed=processed,
            pairing_result={
                "authorized": True,
                "status": "linked",
                "workspace_id": "ws-1",
                "link": {
                    "link_id": "link-1",
                    "scopes": ["chat", "whatsapp:chat"],
                },
            },
            match={"entry": {"id": "entry-1"}, "secret": {"from_number": "whatsapp:+100"}, "connector_id": "conn-1", "workspace_id": "ws-1"},
            route_message=lambda body, profile: {"action": "run", "goal": "do it"},
        )

        response = service.handle_inbound(
            {
                "AccountSid": "AC123",
                "MessageSid": "SM125",
                "From": "whatsapp:+100",
                "To": "whatsapp:+200",
                "Body": "hello",
            }
        )

        self.assertIn("not opted in", response.lower())
        self.assertEqual(state_patches, [])
        self.assertEqual(processed, [])

    def test_duplicate_message_sid_is_ignored_without_side_effects(self) -> None:
        record_events = []
        processed = []
        started = []
        service = self._make_service(
            record_events=record_events,
            processed=processed,
            started=started,
            match={"entry": {"id": "entry-1"}, "secret": {"from_number": "whatsapp:+100"}, "connector_id": "conn-1", "workspace_id": "ws-1"},
            route_message=lambda body, profile: {"action": "run", "goal": "do it"},
            mark_processed_message=lambda connector_id, message_sid: False,
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

        self.assertEqual(response, "")
        self.assertEqual(processed, [])
        self.assertEqual(started, [])
        self.assertTrue(any(evt["event_type"] == "duplicate" for evt in record_events))

    def test_entitlement_denial_returns_guidance_without_run_access(self) -> None:
        record_events = []
        state_patches = []
        processed = []
        service = self._make_service(
            record_events=record_events,
            state_patches=state_patches,
            processed=processed,
            match={"entry": {"id": "entry-1"}, "secret": {"from_number": "whatsapp:+100"}, "connector_id": "conn-1", "workspace_id": "ws-1"},
            route_message=lambda body, profile: {"action": "run", "goal": "do it"},
        )

        with patch(
            "server_modules.connectors.whatsapp_webhook_service.entitlements_service.enforce_channel_surface_access_for_workspace_id",
            side_effect=entitlements_service.EntitlementDeniedError(
                reason="whatsapp_channel_unavailable",
                message="WhatsApp access is not included in this workspace plan.",
            ),
        ):
            response = service.handle_inbound(
                {
                    "AccountSid": "AC123",
                    "MessageSid": "SM126",
                    "From": "whatsapp:+100",
                    "To": "whatsapp:+200",
                    "Body": "run do it",
                }
            )

        self.assertEqual(response, "WhatsApp access is not included in this workspace plan.")
        self.assertEqual(state_patches, [])
        self.assertEqual(processed, [])
        self.assertTrue(any(evt["action"] == "entitlement_denied" for evt in record_events))


if __name__ == "__main__":
    unittest.main()
