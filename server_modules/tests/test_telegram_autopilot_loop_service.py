import unittest

from server_modules.connectors.telegram_autopilot_loop_service import TelegramAutopilotLoopService


class TelegramAutopilotLoopServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramAutopilotLoopService:
        logs = overrides.pop("logs", [])
        events = overrides.pop("events", [])
        seen = overrides.pop("seen", [])
        marked = overrides.pop("marked", [])
        persisted = overrides.pop("persisted", [])
        errors = overrides.pop("errors", [])
        return TelegramAutopilotLoopService(
            poll_seconds=5.0,
            list_connector_entries=overrides.pop("list_connector_entries", lambda: []),
            set_connectors_seen=lambda count: seen.append(count),
            mark_poll=lambda clear_error: marked.append(clear_error),
            poll_connector=overrides.pop("poll_connector", lambda entry: None),
            autopilot_log=lambda message: logs.append(message),
            record_channel_event_throttled=lambda **kwargs: events.append(kwargs),
            normalize_workspace_id=overrides.pop("normalize_workspace_id", lambda value: str(value or "")),
            persist_state=lambda: persisted.append(True),
            autopilot_mark_error=lambda detail, source: errors.append((detail, source)) or 8.0,
        )

    def test_run_iteration_processes_connectors_and_persists(self) -> None:
        polled = []
        seen = []
        marked = []
        persisted = []
        service = self._make_service(
            seen=seen,
            marked=marked,
            persisted=persisted,
            list_connector_entries=lambda: [{"id": "c1"}, {"id": "c2"}],
            poll_connector=lambda entry: polled.append(entry["id"]),
        )
        sleep_seconds = service.run_iteration()
        self.assertEqual(sleep_seconds, 5.0)
        self.assertEqual(seen, [2])
        self.assertEqual(marked, [False, True])
        self.assertEqual(polled, ["c1", "c2"])
        self.assertEqual(persisted, [True])

    def test_run_iteration_records_connector_errors_and_keeps_running(self) -> None:
        logs = []
        events = []
        marked = []

        def _poll(entry):
            if entry["id"] == "bad":
                raise RuntimeError("boom")

        service = self._make_service(
            logs=logs,
            events=events,
            marked=marked,
            list_connector_entries=lambda: [{"id": "bad", "workspace_id": "ws-1"}],
            poll_connector=_poll,
        )
        sleep_seconds = service.run_iteration()
        self.assertEqual(sleep_seconds, 5.0)
        self.assertEqual(marked, [False])
        self.assertEqual(events[0]["metadata"]["source"], "connector_loop")
        self.assertIn("connector error", logs[0])

    def test_run_iteration_records_loop_error_and_uses_backoff(self) -> None:
        logs = []
        events = []
        errors = []
        service = self._make_service(
            logs=logs,
            events=events,
            errors=errors,
            list_connector_entries=lambda: (_ for _ in ()).throw(RuntimeError("loop failed")),
        )
        sleep_seconds = service.run_iteration()
        self.assertEqual(sleep_seconds, 8.0)
        self.assertEqual(errors, [("loop failed", "loop")])
        self.assertEqual(events[0]["action"], "autopilot_loop")
        self.assertIn("loop error", logs[0])


if __name__ == "__main__":
    unittest.main()
