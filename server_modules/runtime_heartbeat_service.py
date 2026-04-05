from __future__ import annotations

from typing import Any, Callable, Optional


def heartbeat_scheduler(*, lock: Any, scheduler: Any) -> Any:
    with lock:
        return scheduler


def ensure_heartbeat_scheduler_started(
    *,
    lock: Any,
    scheduler: Any,
    scheduler_factory: Callable[[], Any],
) -> Any:
    with lock:
        if scheduler is None:
            scheduler = scheduler_factory()
            scheduler.start()
        return scheduler


def heartbeat_status_payload(*, scheduler: Optional[Any]) -> dict[str, Any]:
    if scheduler is None:
        return {
            "ok": False,
            "detail": "Heartbeat scheduler is not configured.",
        }
    return {
        "ok": True,
        **scheduler.status(),
    }


def trigger_heartbeat_payload(*, scheduler: Optional[Any]) -> dict[str, Any]:
    if scheduler is None:
        raise RuntimeError("Heartbeat scheduler is not configured.")
    return {
        "ok": True,
        **scheduler.trigger_now(),
    }
