import threading
import unittest

from server_modules.connectors.telegram_autopilot_state_service import TelegramAutopilotStateService


class TelegramAutopilotStateServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramAutopilotStateService:
        state = overrides.pop("state", {})
        writes = overrides.pop("writes", [])
        vault_payload = overrides.pop("vault_payload", {"credentials": []})
        return TelegramAutopilotStateService(
            state=state,
            lock=threading.RLock(),
            read_json=overrides.pop("read_json", lambda path, default: default),
            write_json=lambda path, payload: writes.append((path, payload)),
            state_file="telegram-state.json",
            utc_now_iso=overrides.pop("utc_now_iso", lambda: "2026-04-05T00:00:00Z"),
            normalize_workspace_id=overrides.pop("normalize_workspace_id", lambda value: str(value or "")),
            load_vault=overrides.pop("load_vault", lambda: vault_payload),
            workspace_visible=overrides.pop("workspace_visible", lambda workspace_id, requested_ws: True),
            connector_paused=overrides.pop("connector_paused", lambda item: False),
            resolve_secret=overrides.pop("resolve_secret", lambda entry: {}),
            enabled=overrides.pop("enabled", True),
            default_profile="assistant",
            require_prefix=True,
            prefix="/empyralis",
            delivery_mode=overrides.pop("delivery_mode", "polling"),
            poll_seconds=5.0,
            max_updates=25,
            run_timeout_seconds=180,
            max_reply_chars=1200,
            thread_alive=overrides.pop("thread_alive", lambda: True),
        )

    def test_load_and_persist_state(self) -> None:
        writes = []
        service = self._make_service(
            writes=writes,
            read_json=lambda path, default: {
                "state": {
                    "connectors": {"c1": {"last_action": "run"}},
                    "processed_updates": 5,
                    "runs_started": 2,
                    "last_poll_at": "t1",
                    "last_error": "boom",
                    "last_error_at": "t2",
                    "last_error_category": "runtime",
                    "last_error_source": "loop",
                    "error_count": 3,
                    "consecutive_errors": 1,
                    "retry_count": 4,
                    "last_retry_at": "t3",
                    "backoff_seconds": 2.5,
                    "next_retry_at": "t4",
                    "last_success_at": "t5",
                }
            },
        )
        service.load_state()
        self.assertEqual(service.state["processed_updates"], 5)
        service.persist_state()
        self.assertEqual(writes[0][1]["state"]["retry_count"], 4)

    def test_list_connector_entries_dedupes_identity(self) -> None:
        service = self._make_service(
            vault_payload={
                "credentials": [
                    {"id": "a", "provider": "telegram_bot", "workspace_id": "ws", "label": "B"},
                    {"id": "b", "provider": "telegram_bot", "workspace_id": "ws", "label": "A"},
                ]
            },
            resolve_secret=lambda entry: {
                "bot_token": "token",
                "chat_id": "chat",
            },
        )
        entries = service.list_connector_entries("ws")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["id"], "a")

    def test_snapshot_includes_connectors_counts_and_thread(self) -> None:
        service = self._make_service(
            state={
                "active": True,
                "connectors": {
                    "c1": {"last_error": "boom", "dropped_sender_count": 2},
                    "c2": {"dropped_sender_count": 1},
                },
                "processed_updates": 4,
                "runs_started": 1,
                "retry_count": 2,
            },
            thread_alive=lambda: True,
        )
        snapshot = service.snapshot(include_connectors=True)
        self.assertTrue(snapshot["enabled"])
        self.assertEqual(snapshot["delivery_mode"], "polling")
        self.assertEqual(snapshot["connector_state_count"], 2)
        self.assertEqual(snapshot["connector_error_count"], 1)
        self.assertEqual(snapshot["dropped_sender_count"], 3)
        self.assertTrue(snapshot["thread_alive"])
        self.assertEqual(snapshot["connectors"], service.state["connectors"])

    def test_connector_state_and_patch(self) -> None:
        writes = []
        service = self._make_service(writes=writes, state={})
        self.assertEqual(service.connector_state("conn-1"), {})
        service.set_connector_state("conn-1", {"last_action": "run"})
        self.assertEqual(service.state["connectors"]["conn-1"]["last_action"], "run")
        self.assertEqual(writes[0][1]["state"]["connectors"]["conn-1"]["last_action"], "run")


if __name__ == "__main__":
    unittest.main()
