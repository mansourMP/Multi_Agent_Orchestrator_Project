import contextlib
import unittest

from server_modules.connectors.telegram_poll_cycle_service import TelegramPollCycleService


class _PollStateStub:
    def __init__(self) -> None:
        self.completed = []
        self.approval_only = []
        self.errors = []

    def record_poll_completion(self, **kwargs):
        self.completed.append(kwargs)

    def record_poll_approval_only(self, **kwargs):
        self.approval_only.append(kwargs)

    def record_connector_error(self, **kwargs):
        self.errors.append(kwargs)


class TelegramPollCycleServiceTests(unittest.TestCase):
    def _make_service(self, **overrides) -> TelegramPollCycleService:
        logs = overrides.pop("logs", [])
        events = overrides.pop("events", [])
        errors = overrides.pop("mark_errors", [])
        poll_state = overrides.pop("poll_state", _PollStateStub())

        @contextlib.contextmanager
        def _lock(_bot_token: str):
            yield overrides.get("lock_acquired", True)

        return TelegramPollCycleService(
            max_updates=25,
            poll_seconds=5.0,
            notify_pending_approvals=overrides.pop(
                "notify_pending_approvals",
                lambda **kwargs: {"approval_pending": True},
            ),
            get_updates_process_lock=overrides.pop("get_updates_process_lock", lambda bot_token: _lock(bot_token)),
            autopilot_log=lambda message: logs.append(message),
            telegram_api_request=overrides.pop(
                "telegram_api_request",
                lambda bot_token, method, **kwargs: {"result": [{"update_id": 2}]},
            ),
            poll_state_service=lambda: poll_state,
            record_channel_event_throttled=lambda **kwargs: events.append(kwargs),
            classify_error=overrides.pop("classify_error", lambda detail: "runtime"),
            autopilot_mark_error=lambda detail, source: errors.append((detail, source)),
        )

    def test_begin_poll_skips_when_lock_not_acquired(self) -> None:
        logs = []

        @contextlib.contextmanager
        def _lock(_bot_token: str):
            yield False

        service = self._make_service(logs=logs, get_updates_process_lock=lambda bot_token: _lock(bot_token))
        result = service.begin_poll(
            connector_state={},
            bot_token="token",
            configured_chat_id="chat-1",
            workspace_id="ws",
            profile={"id": "profile-1"},
            connector_id="conn",
            label="Telegram",
            last_update_id=1,
        )
        self.assertTrue(result["skipped"])
        self.assertEqual(result["updates"], [])
        self.assertEqual(len(logs), 1)

    def test_begin_poll_returns_updates_and_approval_patch(self) -> None:
        service = self._make_service(
            notify_pending_approvals=lambda **kwargs: {"approval_pending": True},
            telegram_api_request=lambda bot_token, method, **kwargs: {"result": [{"update_id": 3}]},
        )
        result = service.begin_poll(
            connector_state={},
            bot_token="token",
            configured_chat_id="chat-1",
            workspace_id="ws",
            profile={"id": "profile-1"},
            connector_id="conn",
            label="Telegram",
            last_update_id=2,
        )
        self.assertFalse(result["skipped"])
        self.assertEqual(result["approval_state_patch"]["approval_pending"], True)
        self.assertEqual(result["updates"][0]["update_id"], 3)

    def test_complete_poll_routes_to_completion_or_approval_only(self) -> None:
        poll_state = _PollStateStub()
        service = self._make_service(poll_state=poll_state)
        service.complete_poll(
            connector_id="conn",
            label="Telegram",
            workspace_id="ws",
            max_seen=8,
            last_update_id=7,
            profile_id="profile-1",
            allow_from=["alice"],
            approval_state_patch={"approval_pending": True},
        )
        service.complete_poll(
            connector_id="conn",
            label="Telegram",
            workspace_id="ws",
            max_seen=7,
            last_update_id=7,
            profile_id="profile-1",
            allow_from=["alice"],
            approval_state_patch={"approval_pending": True},
        )
        self.assertEqual(len(poll_state.completed), 1)
        self.assertEqual(len(poll_state.approval_only), 1)

    def test_handle_connector_error_records_event_state_and_mark(self) -> None:
        poll_state = _PollStateStub()
        events = []
        mark_errors = []
        service = self._make_service(poll_state=poll_state, events=events, mark_errors=mark_errors)
        service.handle_connector_error(
            connector_id="conn",
            label="Telegram",
            workspace_id="ws",
            detail="boom",
        )
        self.assertEqual(events[0]["event_type"], "error")
        self.assertEqual(poll_state.errors[0]["category"], "runtime")
        self.assertEqual(mark_errors, [("boom", "connector")])


if __name__ == "__main__":
    unittest.main()
