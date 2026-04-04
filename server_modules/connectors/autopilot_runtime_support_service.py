from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional


class AutopilotRuntimeSupportService:
    def __init__(
        self,
        *,
        run_history: List[Any],
        run_history_lock: Any,
        runtime_metrics: Dict[str, Any],
        metrics_lock: Any,
        utc_now: Callable[[], datetime],
        parse_utc_ts: Callable[[Any], Optional[datetime]],
        worker_online_helper: Callable[[Dict[str, Any], Optional[datetime]], bool],
        local_lease_seconds: int,
        local_queue_lock: Any,
        local_pending_run_ids: Any,
        local_claimed_runs: Any,
        local_worker_registry: Dict[str, Any],
        truncate_one_line: Callable[[str, int], str],
        non_retryable_run_error_hints: List[str],
    ) -> None:
        self.run_history = run_history
        self.run_history_lock = run_history_lock
        self.runtime_metrics = runtime_metrics
        self.metrics_lock = metrics_lock
        self.utc_now = utc_now
        self.parse_utc_ts = parse_utc_ts
        self.worker_online_helper = worker_online_helper
        self.local_lease_seconds = int(local_lease_seconds or 0)
        self.local_queue_lock = local_queue_lock
        self.local_pending_run_ids = local_pending_run_ids
        self.local_claimed_runs = local_claimed_runs
        self.local_worker_registry = local_worker_registry
        self.truncate_one_line = truncate_one_line
        self.non_retryable_run_error_hints = tuple(str(item or "").strip().lower() for item in non_retryable_run_error_hints if str(item or "").strip())

    def latest_runtime_run_summary(self) -> str:
        recent_line = "none"
        with self.run_history_lock:
            if self.run_history:
                latest = self.run_history[0] if isinstance(self.run_history[0], dict) else {}
                rid = str(latest.get("run_id") or "")[:8]
                status = str(latest.get("status") or "unknown")
                recent_line = f"{rid} {status}" if rid else status
        return recent_line

    def current_runtime_metrics(self) -> Dict[str, int]:
        with self.metrics_lock:
            return {
                "runs_started": int(self.runtime_metrics.get("runs_started") or 0),
                "runs_completed": int(self.runtime_metrics.get("runs_completed") or 0),
                "runs_failed": int(self.runtime_metrics.get("runs_failed") or 0),
                "runs_timeout": int(self.runtime_metrics.get("runs_timeout") or 0),
            }

    def worker_online(self, record: Dict[str, Any], now: Optional[datetime] = None) -> bool:
        try:
            return bool(self.worker_online_helper(record, now))
        except Exception:
            pass

        ref = now or self.utc_now()
        seen_at = self.parse_utc_ts(record.get("last_seen_at"))
        if seen_at is None:
            return False
        lease_seconds = int(record.get("lease_seconds") or self.local_lease_seconds)
        online_window_seconds = max(20, lease_seconds * 2)
        return (ref - seen_at).total_seconds() <= online_window_seconds

    def local_companion_snapshot(self) -> Dict[str, int]:
        now = self.utc_now()
        with self.local_queue_lock:
            pending_runs = len(self.local_pending_run_ids)
            claimed_runs = len(self.local_claimed_runs)
            online_workers = len(
                [
                    record
                    for record in self.local_worker_registry.values()
                    if isinstance(record, dict) and self.worker_online(record, now)
                ]
            )
        return {
            "online_workers": int(online_workers),
            "pending_runs": int(pending_runs),
            "claimed_runs": int(claimed_runs),
        }

    def extract_run_error_messages(self, run: Dict[str, Any]) -> List[str]:
        messages: List[str] = []
        events = run.get("events") if isinstance(run.get("events"), list) else []
        for event in events:
            if not isinstance(event, dict):
                continue
            event_name = str(event.get("event") or "").strip().lower()
            if event_name != "run_error":
                continue
            message = str(event.get("message") or "").strip()
            if message:
                messages.append(message)
        for key in ("error", "last_error"):
            message = str(run.get(key) or "").strip()
            if message:
                messages.append(message)
        deduped: List[str] = []
        seen: set[str] = set()
        for message in messages:
            marker = message.lower()
            if marker in seen:
                continue
            seen.add(marker)
            deduped.append(message)
        return deduped

    def latest_run_error_message(self, run: Dict[str, Any]) -> str:
        messages = self.extract_run_error_messages(run)
        if not messages:
            return ""
        return messages[-1]

    def is_non_retryable_run_error(self, detail: str) -> bool:
        text = str(detail or "").strip().lower()
        if not text:
            return False
        return any(marker in text for marker in self.non_retryable_run_error_hints)

    def friendly_run_error(self, detail: str) -> str:
        text = str(detail or "").strip()
        lower = text.lower()
        if "missing scopes" in lower or "api.responses.write" in lower:
            return "AI account authorization failed. Missing required scope: api.responses.write. Open Setup and reconnect your AI account."
        if (
            "invalid api key" in lower
            or "incorrect api key" in lower
            or "unauthorized" in lower
            or "forbidden" in lower
        ):
            return "AI account authorization failed. Open Setup and reconnect your AI account."
        if "no credentials available" in lower or "api key is required" in lower or "api_key is required" in lower:
            return "No valid AI account is connected. Open Setup and connect an account."
        return text or "Run failed."

    def humanize_telegram_run_summary(self, summary: str) -> str:
        text = str(summary or "").strip()
        if not text:
            return "Something went wrong. Please try again."

        lower = text.lower()
        if "run timed out waiting on local companion" in lower:
            return "Still working on it, but the local helper is taking too long. Give me a moment and try again."
        if "local companion is offline" in lower:
            return "The local helper is offline right now. Start it in Setup and try again."
        if lower == "run not found." or "run not found" in lower:
            return "I lost track of that request. Please send it again."
        if "missing required scope" in lower or "api.responses.write" in lower:
            return "I couldn’t get a model reply right now. Please retry in a moment."
        if (
            "ai account authorization failed" in lower
            or "invalid api key" in lower
            or "incorrect api key" in lower
            or "unauthorized" in lower
            or "forbidden" in lower
        ):
            return "I couldn’t get a model reply right now. Please retry in a moment."
        if "no valid ai account is connected" in lower or "no credentials available" in lower:
            return "I don’t have a working model connection right now. Please retry in a moment."
        if "approval window timed out" in lower or "approval timeout" in lower:
            return "I waited too long for approval. Please send the request again and approve it when prompted."
        if "requires local companion execution" in lower:
            return "That task needs local execution first. Start the local helper in Setup and try again."
        if "run blocked by safety policy" in lower or "action policy blocked" in lower:
            return "That action is blocked by your current safety settings. Review approvals or trust settings and try again."
        if lower == "run failed." or "run failed on attempt" in lower:
            return "Something went wrong while I was handling that. Please try again."
        if "run timed out while waiting for completion" in lower:
            return "I am taking longer than expected. Please try again in a moment."
        return text

    def summarize_run_terminal_result(self, run: Dict[str, Any], summary_limit: int) -> str:
        summary = str(run.get("result") or "").strip()
        if not summary and isinstance(run.get("result_data"), dict):
            summary = self.truncate_one_line(json.dumps(run.get("result_data")), summary_limit)
        if not summary:
            latest_error = self.latest_run_error_message(run)
            if latest_error:
                summary = self.friendly_run_error(latest_error)
        if not summary:
            summary = "Run finished."
        return self.truncate_one_line(summary, summary_limit)
