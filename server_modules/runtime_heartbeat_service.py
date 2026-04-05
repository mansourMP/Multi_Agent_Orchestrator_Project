from __future__ import annotations

import asyncio
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


def build_heartbeat_run_callback(
    *,
    run_start_request_class: Callable[..., Any],
    trigger_pending_heartbeat_schedules: Callable[[], Any],
    execute_system_run_start_request_via_turn_runtime: Callable[..., Any],
    stamp_request_owner_fn: Callable[..., Any],
    run_execution_services: Callable[[], Any],
) -> Callable[[list[str], dict[str, Any]], dict[str, Any]]:
    def _start_heartbeat_run(tasks: list[str], metadata: dict[str, Any]) -> dict[str, Any]:
        pending_schedule_result = trigger_pending_heartbeat_schedules()
        pending_started = pending_schedule_result.get("started") if isinstance(pending_schedule_result, dict) else []
        if not tasks:
            if pending_started:
                first = pending_started[0] if isinstance(pending_started, list) and pending_started else {}
                return {
                    "acted": True,
                    "run_id": str((first or {}).get("run_id") or "").strip() or None,
                    "summary": f"Heartbeat started {len(pending_started)} pending schedule(s).",
                }
            return {
                "acted": False,
                "summary": "No pending heartbeat tasks.",
            }
        heartbeat_goal = (
            "Heartbeat checklist tasks:\n"
            + "\n".join(f"- {task}" for task in tasks)
            + "\n\nHandle the pending items from HEARTBEAT.md."
        )
        request = run_start_request_class(
            engine="orion",
            workspace_id=str(metadata.get("workspace_id") or "default").strip() or "default",
            user_goal=heartbeat_goal,
            agent_role="orchestrator",
            metadata={
                "source": "heartbeat",
                "heartbeat_tasks": list(tasks),
                "heartbeat_pending_schedules": pending_started if isinstance(pending_started, list) else [],
                "heartbeat_trigger": str(metadata.get("trigger") or "scheduled"),
                "heartbeat_file": str(metadata.get("heartbeat_file") or ""),
            },
        )
        result = execute_system_run_start_request_via_turn_runtime(
            request,
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=run_execution_services(),
        )
        return {
            "acted": True,
            **(result if isinstance(result, dict) else {}),
            "summary": (
                f"Heartbeat started a run for {len(tasks)} task(s)."
                + (f" Also started {len(pending_started)} pending schedule(s)." if pending_started else "")
            ),
        }

    return _start_heartbeat_run


def build_heartbeat_notify_callback(
    *,
    handle_telegram_send_message: Callable[..., Any],
) -> Callable[[str], None]:
    def _heartbeat_notify(message: str) -> None:
        try:
            asyncio.run(handle_telegram_send_message(message, workspace_id="default"))
        except Exception:
            return

    return _heartbeat_notify
