import threading
import unittest

from server_modules.connectors.telegram_autopilot_runtime_service import TelegramAutopilotRuntimeService


class TelegramAutopilotRuntimeServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramAutopilotRuntimeService:
        state = overrides.pop("state", {})
        persisted = overrides.pop("persisted", [])
        return TelegramAutopilotRuntimeService(
            state=state,
            lock=threading.RLock(),
            utc_now_iso=overrides.pop("utc_now_iso", lambda: "2026-04-05T00:00:00Z"),
            classify_error=overrides.pop("classify_error", lambda detail: "runtime"),
            iso_from_epoch=overrides.pop("iso_from_epoch", lambda ts: f"iso:{int(ts)}"),
            persist_state=lambda: persisted.append(True),
            poll_seconds=5.0,
        )

    def test_increment_and_connectors_seen(self) -> None:
        service = self._make_service(state={})
        service.increment_processed_updates()
        service.increment_processed_updates()
        service.set_connectors_seen(3)
        self.assertEqual(service.state["processed_updates"], 2)
        self.assertEqual(service.state["connectors_seen"], 3)

    def test_mark_error_sets_backoff_for_loop_source(self) -> None:
        persisted = []
        service = self._make_service(state={}, persisted=persisted)
        backoff = service.mark_error("boom", source="loop")
        self.assertGreater(backoff, 0.0)
        self.assertEqual(service.state["last_error"], "boom")
        self.assertEqual(service.state["last_error_category"], "runtime")
        self.assertEqual(service.state["retry_count"], 1)
        self.assertEqual(persisted, [True])

    def test_mark_error_without_loop_source_has_no_retry_backoff(self) -> None:
        service = self._make_service(state={})
        backoff = service.mark_error("boom", source="connector")
        self.assertEqual(backoff, 0.0)
        self.assertNotIn("retry_count", service.state)

    def test_mark_poll_clears_error_and_sets_success(self) -> None:
        service = self._make_service(
            state={
                "last_error": "boom",
                "last_error_at": "t1",
                "last_error_category": "runtime",
                "last_error_source": "loop",
                "consecutive_errors": 3,
                "backoff_seconds": 2.5,
                "next_retry_at": "t2",
            }
        )
        service.mark_poll(clear_error=True)
        self.assertIsNone(service.state["last_error"])
        self.assertEqual(service.state["consecutive_errors"], 0)
        self.assertEqual(service.state["backoff_seconds"], 0.0)
        self.assertEqual(service.state["last_success_at"], "2026-04-05T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
