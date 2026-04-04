import unittest

from server_modules.connectors.telegram_poll_state_service import TelegramPollStateService


class TelegramPollStateServiceTests(unittest.TestCase):
    def test_record_processed_update_sets_state_and_increments_counter(self) -> None:
        states = []
        increments = []
        service = TelegramPollStateService(
            set_connector_state=lambda connector_id, patch: states.append((connector_id, patch)),
            utc_now_iso=lambda: "2026-04-04T00:00:00Z",
            increment_processed_updates=lambda: increments.append(True),
        )

        service.record_processed_update(
            connector_id="conn-1",
            label="label-1",
            workspace_id="ws-1",
            update_id=7,
            chat_id="chat-1",
            action="run",
            profile_id="profile-1",
            allow_from=["u1"],
            run_id="run-1",
            approval_state_patch={"approval_pending": True},
        )

        self.assertEqual(states[0][0], "conn-1")
        self.assertEqual(states[0][1]["last_run_id"], "run-1")
        self.assertTrue(states[0][1]["approval_pending"])
        self.assertEqual(increments, [True])

    def test_record_poll_completion_and_error(self) -> None:
        states = []
        service = TelegramPollStateService(
            set_connector_state=lambda connector_id, patch: states.append((connector_id, patch)),
            utc_now_iso=lambda: "2026-04-04T00:00:00Z",
            increment_processed_updates=lambda: None,
        )

        service.record_poll_completion(
            connector_id="conn-1",
            label="label-1",
            workspace_id="ws-1",
            max_seen=9,
            profile_id="profile-1",
            allow_from=["u1"],
            approval_state_patch={"approval_pending": True},
        )
        service.record_connector_error(
            connector_id="conn-1",
            label="label-1",
            workspace_id="ws-1",
            detail="boom",
            category="runtime",
        )

        self.assertEqual(states[0][1]["last_update_id"], 9)
        self.assertEqual(states[1][1]["last_error"], "boom")


if __name__ == "__main__":
    unittest.main()
