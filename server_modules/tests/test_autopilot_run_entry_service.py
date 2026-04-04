import unittest

from server_modules.connectors.autopilot_run_entry_service import AutopilotRunEntryService


class AutopilotRunEntryServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> AutopilotRunEntryService:
        self.created = overrides.pop("created", [])
        self.events = overrides.pop("events", [])
        self.telegram_started = overrides.pop("telegram_started", [])
        self.whatsapp_started = overrides.pop("whatsapp_started", [])
        return AutopilotRunEntryService(
            telegram_profile_fields=["project", "role"],
            telegram_engine="orion",
            whatsapp_engine="orion",
            safe_path_token=overrides.pop("safe_path_token", lambda value: str(value or "x").replace(":", "_")),
            assigned_agent_role=overrides.pop("assigned_agent_role", lambda entry: str(entry.get("agent_role") or "")),
            normalize_trust_mode=overrides.pop("normalize_trust_mode", lambda value: str(value or "").strip() or "personal"),
            normalize_execution_target=overrides.pop("normalize_execution_target", lambda value: str(value or "").strip() or "cloud"),
            decide_execution_target=overrides.pop("decide_execution_target", lambda metadata: {"selected": metadata.get("execution_target")}),
            apply_execution_route_metadata=overrides.pop(
                "apply_execution_route_metadata",
                lambda metadata, route: {**metadata, "route_selected": route.get("selected")},
            ),
            create_run=overrides.pop(
                "create_run",
                lambda **kwargs: self.created.append(kwargs) or f"run-{len(self.created)}",
            ),
            record_channel_event=overrides.pop("record_channel_event", lambda **kwargs: self.events.append(kwargs)),
            telegram_session_key=overrides.pop("telegram_session_key", lambda chat_id: f"telegram:{chat_id}"),
            whatsapp_session_key=overrides.pop("whatsapp_session_key", lambda from_number, to_number: f"whatsapp:{from_number}->{to_number}"),
            inherit_owner_user_id=overrides.pop("inherit_owner_user_id", lambda owner_user_id=None: "user-123"),
            agent_machine_full_trust_enabled=overrides.pop("agent_machine_full_trust_enabled", lambda owner_user_id: owner_user_id == "user-123"),
            telegram_runs_started=overrides.pop("telegram_runs_started", lambda: self.telegram_started.append(True)),
            whatsapp_runs_started=overrides.pop("whatsapp_runs_started", lambda: self.whatsapp_started.append(True)),
        )

    def test_create_telegram_run_includes_owner_and_profile_context(self) -> None:
        service = self._make_service()
        result = service.create_telegram_run(
            goal="Investigate",
            workspace_id="default",
            connector_id="cred-telegram",
            chat_id="123",
            sender_id="456",
            update_id=1,
            profile_context={"project": "alpha"},
            trust_mode_value="agent",
            execution_target_value="cloud",
        )

        self.assertEqual(result["run_id"], "run-1")
        metadata = self.created[0]["context"]["metadata"]
        self.assertEqual(metadata["owner_user_id"], "user-123")
        self.assertEqual(metadata["telegram"]["profile_context"]["project"], "alpha")
        self.assertEqual(metadata["route_selected"], "cloud")
        self.assertEqual(len(self.telegram_started), 1)
        self.assertEqual(self.events[0]["event_type"], "run_started")

    def test_create_whatsapp_run_includes_owner(self) -> None:
        service = self._make_service()
        result = service.create_whatsapp_run(
            goal="Handle this",
            workspace_id="default",
            connector_id="cred-whatsapp",
            from_number="whatsapp:+1",
            to_number="whatsapp:+2",
            message_sid="SM123",
            account_sid="AC123",
            trust_mode_value="agent",
            execution_target_value="cloud",
        )

        self.assertEqual(result["run_id"], "run-1")
        metadata = self.created[0]["context"]["metadata"]
        self.assertEqual(metadata["owner_user_id"], "user-123")
        self.assertEqual(metadata["route_selected"], "cloud")
        self.assertEqual(len(self.whatsapp_started), 1)

    def test_can_auto_approve_wait_requires_matching_owner_and_approval(self) -> None:
        service = self._make_service()
        run = {
            "context": {"metadata": {"owner_user_id": "user-123", "local_execution_waiting_confirmation": True}},
            "pending_confirmation": {"approval_id": "approval-1", "source": "runtime_wait"},
        }
        self.assertTrue(service.can_auto_approve_wait(run))
        run["context"]["metadata"]["owner_user_id"] = "user-999"
        self.assertFalse(service.can_auto_approve_wait(run))


if __name__ == "__main__":
    unittest.main()
