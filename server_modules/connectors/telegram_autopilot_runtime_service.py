from __future__ import annotations

import time
from typing import Any, Callable, Dict


class TelegramAutopilotRuntimeService:
    def __init__(
        self,
        *,
        state: Dict[str, Any],
        lock: Any,
        utc_now_iso: Callable[[], str],
        classify_error: Callable[[Any], str],
        iso_from_epoch: Callable[[float], str],
        persist_state: Callable[[], Any],
        poll_seconds: float,
    ) -> None:
        self.state = state
        self.lock = lock
        self.utc_now_iso = utc_now_iso
        self.classify_error = classify_error
        self.iso_from_epoch = iso_from_epoch
        self.persist_state = persist_state
        self.poll_seconds = max(1.0, float(poll_seconds or 1.0))

    def increment_processed_updates(self) -> None:
        with self.lock:
            self.state["processed_updates"] = int(self.state.get("processed_updates") or 0) + 1

    def set_connectors_seen(self, count: int) -> None:
        with self.lock:
            self.state["connectors_seen"] = max(0, int(count or 0))

    def mark_error(self, detail: str, source: str = "loop") -> float:
        now_ts = time.time()
        now_iso = self.utc_now_iso()
        category = self.classify_error(detail)
        source_name = str(source or "loop")
        backoff_seconds = 0.0
        with self.lock:
            self.state["last_error"] = detail
            self.state["last_poll_at"] = now_iso
            self.state["last_error_at"] = now_iso
            self.state["last_error_category"] = category
            self.state["last_error_source"] = source_name
            self.state["error_count"] = int(self.state.get("error_count") or 0) + 1
            self.state["consecutive_errors"] = int(self.state.get("consecutive_errors") or 0) + 1
            if source_name == "loop":
                self.state["retry_count"] = int(self.state.get("retry_count") or 0) + 1
                self.state["last_retry_at"] = now_iso
                consecutive = int(self.state.get("consecutive_errors") or 0)
                backoff_seconds = min(60.0, self.poll_seconds * (1.6 ** min(consecutive, 8)))
                self.state["backoff_seconds"] = round(backoff_seconds, 3)
                self.state["next_retry_at"] = self.iso_from_epoch(now_ts + backoff_seconds)
        self.persist_state()
        return backoff_seconds

    def mark_poll(self, clear_error: bool = True) -> None:
        now = self.utc_now_iso()
        with self.lock:
            self.state["last_poll_at"] = now
            if clear_error:
                self.state["last_error"] = None
                self.state["last_error_at"] = None
                self.state["last_error_category"] = None
                self.state["last_error_source"] = None
                self.state["consecutive_errors"] = 0
                self.state["backoff_seconds"] = 0.0
                self.state["next_retry_at"] = None
                self.state["last_success_at"] = now
