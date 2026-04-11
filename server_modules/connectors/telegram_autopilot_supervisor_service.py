from __future__ import annotations

from typing import Any, Callable


class TelegramAutopilotSupervisorService:
    def __init__(
        self,
        *,
        delivery_mode: str,
        poll_seconds: float,
        utc_now_iso: Callable[[], str],
        mark_started: Callable[[str], Any],
        persist_state: Callable[[], Any],
        autopilot_log: Callable[[str], Any],
        require_prefix: bool,
        prefix: str,
        loop_service: Callable[[], Any],
        sleep: Callable[[float], Any],
    ) -> None:
        self.delivery_mode = str(delivery_mode or "").strip().lower() or "polling"
        self.poll_seconds = max(1.0, float(poll_seconds or 1.0))
        self.utc_now_iso = utc_now_iso
        self.mark_started = mark_started
        self.persist_state = persist_state
        self.autopilot_log = autopilot_log
        self.require_prefix = bool(require_prefix)
        self.prefix = str(prefix or "")
        self.loop_service = loop_service
        self.sleep = sleep

    def run_forever(self) -> None:
        self.mark_started(self.utc_now_iso())
        self.persist_state()
        if self.delivery_mode != "polling":
            self.autopilot_log(
                f"enabled (delivery={self.delivery_mode}, polling fallback disabled)"
            )
            return
        self.autopilot_log(
            f"enabled (poll={self.poll_seconds}s, prefix={'on' if self.require_prefix else 'off'}:{self.prefix})"
        )
        while True:
            sleep_seconds = self.loop_service().run_iteration()
            self.sleep(max(0.25, float(sleep_seconds)))
