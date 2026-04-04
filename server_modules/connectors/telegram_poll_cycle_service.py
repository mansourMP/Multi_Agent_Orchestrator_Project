from __future__ import annotations

from typing import Any, Callable, Dict, List


class TelegramPollCycleService:
    def __init__(
        self,
        *,
        max_updates: int,
        poll_seconds: float,
        notify_pending_approvals: Callable[..., Dict[str, Any]],
        get_updates_process_lock: Callable[[str], Any],
        autopilot_log: Callable[[str], Any],
        telegram_api_request: Callable[..., Dict[str, Any]],
        poll_state_service: Callable[[], Any],
        record_channel_event_throttled: Callable[..., Any],
        classify_error: Callable[[Any], str],
        autopilot_mark_error: Callable[[str, str], Any],
    ) -> None:
        self.max_updates = max(1, min(int(max_updates or 1), 100))
        self.poll_seconds = max(1.0, float(poll_seconds or 1.0))
        self.notify_pending_approvals = notify_pending_approvals
        self.get_updates_process_lock = get_updates_process_lock
        self.autopilot_log = autopilot_log
        self.telegram_api_request = telegram_api_request
        self.poll_state_service = poll_state_service
        self.record_channel_event_throttled = record_channel_event_throttled
        self.classify_error = classify_error
        self.autopilot_mark_error = autopilot_mark_error

    def begin_poll(
        self,
        *,
        connector_state: Dict[str, Any],
        bot_token: str,
        configured_chat_id: str,
        workspace_id: str,
        profile: Dict[str, Any],
        connector_id: str,
        label: str,
        last_update_id: int,
    ) -> Dict[str, Any]:
        approval_state_patch = self.notify_pending_approvals(
            connector_state=connector_state,
            bot_token=bot_token,
            chat_id=configured_chat_id,
            workspace_id=workspace_id,
            profile=profile,
            connector_id=connector_id,
        )

        with self.get_updates_process_lock(bot_token) as acquired_poll_lock:
            if not acquired_poll_lock:
                self.autopilot_log(
                    f"skipping getUpdates for {label}: another poller currently holds the Telegram bot lock"
                )
                return {
                    "skipped": True,
                    "approval_state_patch": approval_state_patch,
                    "updates": [],
                }
            updates_result = self.telegram_api_request(
                bot_token,
                "getUpdates",
                params={
                    "offset": int(last_update_id or 0) + 1,
                    "limit": self.max_updates,
                    "timeout": 0,
                },
            )

        updates = updates_result.get("result")
        if not isinstance(updates, list):
            updates = []
        return {
            "skipped": False,
            "approval_state_patch": approval_state_patch,
            "updates": updates,
        }

    def complete_poll(
        self,
        *,
        connector_id: str,
        label: str,
        workspace_id: str,
        max_seen: int,
        last_update_id: int,
        profile_id: str,
        allow_from: List[str],
        approval_state_patch: Dict[str, Any],
    ) -> None:
        if max_seen > last_update_id:
            self.poll_state_service().record_poll_completion(
                connector_id=connector_id,
                label=label,
                workspace_id=workspace_id,
                max_seen=max_seen,
                profile_id=profile_id,
                allow_from=list(allow_from),
                approval_state_patch=approval_state_patch,
            )
        elif approval_state_patch:
            self.poll_state_service().record_poll_approval_only(
                connector_id=connector_id,
                label=label,
                workspace_id=workspace_id,
                profile_id=profile_id,
                allow_from=list(allow_from),
                approval_state_patch=approval_state_patch,
            )

    def handle_connector_error(
        self,
        *,
        connector_id: str,
        label: str,
        workspace_id: str,
        detail: str,
    ) -> None:
        category = self.classify_error(detail)
        self.record_channel_event_throttled(
            channel="telegram",
            direction="system",
            event_type="error",
            text=detail,
            workspace_id=workspace_id,
            action="connector",
            metadata={"connector_id": connector_id, "category": category},
            dedupe_seconds=max(30.0, float(self.poll_seconds) * 6.0),
        )
        self.poll_state_service().record_connector_error(
            connector_id=connector_id,
            label=label,
            workspace_id=workspace_id,
            detail=detail,
            category=category,
        )
        self.autopilot_mark_error(detail, "connector")
