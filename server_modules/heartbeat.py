from __future__ import annotations

import asyncio
import hashlib
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from server_modules.workspace_context import workspace_context_dir


HeartbeatRunCallback = Callable[[List[str], Dict[str, Any]], Dict[str, Any]]
HeartbeatNotifyCallback = Callable[[str], None]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _heartbeat_file_path() -> Path:
    return workspace_context_dir() / "HEARTBEAT.md"


def parse_unchecked_heartbeat_tasks(text: str) -> List[str]:
    tasks: List[str] = []
    for raw_line in str(text or "").splitlines():
        line = raw_line.strip()
        if line.startswith("- [ ] "):
            task = line[6:].strip()
            if task:
                tasks.append(task)
    return tasks


class HeartbeatScheduler:
    def __init__(
        self,
        *,
        interval_seconds: int = 1800,
        workspace_id: str = "default",
        run_callback: Optional[HeartbeatRunCallback] = None,
        notify_callback: Optional[HeartbeatNotifyCallback] = None,
    ) -> None:
        self.interval_seconds = max(60, int(interval_seconds or 1800))
        self.workspace_id = str(workspace_id or "default").strip() or "default"
        self.run_callback = run_callback
        self.notify_callback = notify_callback
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._started = False
        self._stop_event = threading.Event()
        self._last_acted_signature = ""
        self._status: Dict[str, Any] = {
            "running": False,
            "workspace_id": self.workspace_id,
            "interval_seconds": self.interval_seconds,
            "last_checked_at": None,
            "last_acted_at": None,
            "last_status": "idle",
            "last_summary": "Heartbeat not started yet.",
            "last_run_id": None,
            "last_tasks": [],
            "last_notification": None,
        }

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run_forever, daemon=True, name="heartbeat-scheduler")
            self._thread.start()
            self._started = True
            self._status["running"] = True
            self._status["last_summary"] = "Heartbeat scheduler started."

    def stop(self) -> None:
        with self._lock:
            self._stop_event.set()
            self._status["running"] = False

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._status)

    def trigger_now(self) -> Dict[str, Any]:
        return self._run_once(trigger="manual")

    def _run_forever(self) -> None:
        while not self._stop_event.wait(self.interval_seconds):
            self._run_once(trigger="scheduled")

    def _run_once(self, *, trigger: str) -> Dict[str, Any]:
        heartbeat_file = _heartbeat_file_path()
        checked_at = _utc_now_iso()
        if not heartbeat_file.exists():
            return self._update_status(
                checked_at=checked_at,
                status="no_file",
                summary="No HEARTBEAT.md file found.",
                tasks=[],
                trigger=trigger,
            )
        try:
            content = heartbeat_file.read_text(encoding="utf-8")
        except Exception as exc:
            return self._update_status(
                checked_at=checked_at,
                status="error",
                summary=f"Failed to read HEARTBEAT.md: {exc}",
                tasks=[],
                trigger=trigger,
            )
        tasks = parse_unchecked_heartbeat_tasks(content)
        if not tasks:
            self._last_acted_signature = ""
            return self._update_status(
                checked_at=checked_at,
                status="clear",
                summary="No pending heartbeat tasks.",
                tasks=[],
                trigger=trigger,
            )

        signature = hashlib.sha256("\n".join(tasks).encode("utf-8")).hexdigest()
        if signature == self._last_acted_signature:
            return self._update_status(
                checked_at=checked_at,
                status="unchanged",
                summary="Pending heartbeat tasks already triggered. Waiting for checklist changes.",
                tasks=tasks,
                trigger=trigger,
            )

        if self.run_callback is None:
            return self._update_status(
                checked_at=checked_at,
                status="error",
                summary="Heartbeat run callback is not configured.",
                tasks=tasks,
                trigger=trigger,
            )

        try:
            result = self.run_callback(
                tasks,
                {
                    "workspace_id": self.workspace_id,
                    "trigger": trigger,
                    "heartbeat_file": str(heartbeat_file),
                },
            )
        except Exception as exc:
            return self._update_status(
                checked_at=checked_at,
                status="error",
                summary=f"Heartbeat failed to start a run: {exc}",
                tasks=tasks,
                trigger=trigger,
            )

        run_id = str((result or {}).get("run_id") or "").strip() or None
        summary = str((result or {}).get("summary") or "").strip() or (
            f"Heartbeat started a run for {len(tasks)} task(s)."
        )
        self._last_acted_signature = signature
        status = self._update_status(
            checked_at=checked_at,
            acted_at=checked_at,
            status="acted",
            summary=summary,
            run_id=run_id,
            tasks=tasks,
            trigger=trigger,
        )
        self._notify(
            f"Heartbeat acted on {len(tasks)} task(s) in workspace '{self.workspace_id}'."
            + (f" Run: {run_id}." if run_id else "")
        )
        return status

    def _notify(self, message: str) -> None:
        if self.notify_callback is None:
            with self._lock:
                self._status["last_notification"] = {
                    "at": _utc_now_iso(),
                    "status": "skipped",
                    "message": message,
                }
            return
        try:
            self.notify_callback(message)
            note = {
                "at": _utc_now_iso(),
                "status": "sent",
                "message": message,
            }
        except Exception as exc:
            note = {
                "at": _utc_now_iso(),
                "status": "failed",
                "message": message,
                "error": str(exc),
            }
        with self._lock:
            self._status["last_notification"] = note

    def _update_status(
        self,
        *,
        checked_at: str,
        status: str,
        summary: str,
        tasks: List[str],
        trigger: str,
        acted_at: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            self._status.update(
                {
                    "running": bool(self._started and not self._stop_event.is_set()),
                    "workspace_id": self.workspace_id,
                    "interval_seconds": self.interval_seconds,
                    "last_checked_at": checked_at,
                    "last_acted_at": acted_at or self._status.get("last_acted_at"),
                    "last_status": status,
                    "last_summary": summary,
                    "last_run_id": run_id if run_id is not None else self._status.get("last_run_id"),
                    "last_tasks": list(tasks),
                    "last_trigger": trigger,
                }
            )
            return dict(self._status)


async def best_effort_async_notify(callback: Callable[[str], Any], text: str) -> None:
    result = callback(text)
    if asyncio.iscoroutine(result):
        await result
