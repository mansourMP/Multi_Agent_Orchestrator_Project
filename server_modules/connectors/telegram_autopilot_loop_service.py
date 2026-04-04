from __future__ import annotations

from typing import Any, Callable, Dict, List


class TelegramAutopilotLoopService:
    def __init__(
        self,
        *,
        poll_seconds: float,
        list_connector_entries: Callable[[], List[Dict[str, Any]]],
        set_connectors_seen: Callable[[int], Any],
        mark_poll: Callable[[bool], Any],
        poll_connector: Callable[[Dict[str, Any]], Any],
        autopilot_log: Callable[[str], Any],
        record_channel_event_throttled: Callable[..., Any],
        normalize_workspace_id: Callable[[Any], str],
        persist_state: Callable[[], Any],
        autopilot_mark_error: Callable[[str, str], float],
    ) -> None:
        self.poll_seconds = max(1.0, float(poll_seconds or 1.0))
        self.list_connector_entries = list_connector_entries
        self.set_connectors_seen = set_connectors_seen
        self.mark_poll = mark_poll
        self.poll_connector = poll_connector
        self.autopilot_log = autopilot_log
        self.record_channel_event_throttled = record_channel_event_throttled
        self.normalize_workspace_id = normalize_workspace_id
        self.persist_state = persist_state
        self.autopilot_mark_error = autopilot_mark_error

    def run_iteration(self) -> float:
        sleep_seconds = self.poll_seconds
        try:
            entries = self.list_connector_entries()
            had_connector_error = False
            self.set_connectors_seen(len(entries))
            self.mark_poll(False)
            for entry in entries:
                try:
                    self.poll_connector(entry)
                except Exception as connector_exc:
                    had_connector_error = True
                    self.autopilot_log(f"connector error: {connector_exc}")
                    self.record_channel_event_throttled(
                        channel="telegram",
                        direction="system",
                        event_type="error",
                        text=str(connector_exc),
                        workspace_id=self.normalize_workspace_id(entry.get("workspace_id")),
                        action="connector",
                        metadata={
                            "connector_id": str(entry.get("id") or "").strip(),
                            "source": "connector_loop",
                        },
                        dedupe_seconds=max(30.0, float(self.poll_seconds) * 6.0),
                    )
            if not had_connector_error:
                self.mark_poll(True)
            self.persist_state()
            return sleep_seconds
        except Exception as exc:
            detail = str(exc)
            sleep_seconds = max(self.poll_seconds, self.autopilot_mark_error(detail, "loop"))
            self.autopilot_log(f"loop error: {detail}")
            self.record_channel_event_throttled(
                channel="telegram",
                direction="system",
                event_type="error",
                text=detail,
                action="autopilot_loop",
                metadata={"source": "loop"},
                dedupe_seconds=max(45.0, float(self.poll_seconds) * 8.0),
            )
            return sleep_seconds
