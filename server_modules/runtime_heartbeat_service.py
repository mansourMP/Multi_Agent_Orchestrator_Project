from __future__ import annotations

import asyncio
from typing import Any, Callable, Optional


def build_heartbeat_turn_request(
    *,
    build_inbound_agent_turn_request: Callable[..., Any],
    tasks: list[str],
    metadata: dict[str, Any],
    pending_started: Any,
) -> Any:
    merged_metadata = dict(metadata or {})
    merged_metadata.update(
        {
            "source": "heartbeat",
            "heartbeat_tasks": list(tasks),
            "heartbeat_pending_schedules": pending_started if isinstance(pending_started, list) else [],
            "heartbeat_trigger": str(metadata.get("trigger") or "scheduled"),
            "heartbeat_file": str(metadata.get("heartbeat_file") or ""),
        }
    )
    actor_id = (
        str(merged_metadata.get("owner_user_id") or "").strip()
        or str(merged_metadata.get("owner_email") or "").strip().lower()
        or "anonymous"
    )
    actor_display_name = str(merged_metadata.get("owner_email") or actor_id).strip() or actor_id
    heartbeat_goal = (
        "Heartbeat checklist tasks:\n"
        + "\n".join(f"- {task}" for task in tasks)
        + "\n\nHandle the pending items from HEARTBEAT.md."
    )
    policy_context = {
        "trust_mode": str(merged_metadata.get("trust_mode") or "").strip() or None,
        "outcome_pack": str(merged_metadata.get("outcome_pack") or "").strip() or None,
        "execution_target": str(merged_metadata.get("execution_target") or "").strip() or None,
        "action_policy": merged_metadata.get("action_policy") if isinstance(merged_metadata.get("action_policy"), dict) else None,
    }
    context_hints = {
        "engine": str(merged_metadata.get("engine") or "orion").strip().lower() or "orion",
        "workflow_id": str(merged_metadata.get("workflow_id") or "").strip() or None,
        "provider": str(merged_metadata.get("provider") or "").strip() or None,
        "model": str(merged_metadata.get("model") or "").strip() or None,
        "credential_id": str(merged_metadata.get("credential_id") or "").strip() or None,
        "agent_role": str(merged_metadata.get("agent_role") or "orchestrator").strip() or "orchestrator",
        "max_iterations": merged_metadata.get("max_iterations"),
        "metadata": merged_metadata,
    }
    return build_inbound_agent_turn_request(
        tenant_id=str(merged_metadata.get("tenant_id") or actor_id or "default").strip() or "default",
        workspace_id=str(merged_metadata.get("workspace_id") or "default").strip() or "default",
        session_id=(
            str(merged_metadata.get("session_id") or "").strip()
            or str(merged_metadata.get("thread_id") or "").strip()
            or str(merged_metadata.get("parent_run_id") or "").strip()
            or str(merged_metadata.get("workflow_id") or "").strip()
            or "run-start"
        ),
        channel=str(merged_metadata.get("channel") or "web").strip() or "web",
        actor_type="user",
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        message=heartbeat_goal,
        context_hints={key: value for key, value in context_hints.items() if value not in (None, "", [], {})},
        execution_mode="durable",
        response_mode="artifact",
        machine_target=(
            str(merged_metadata.get("machine_target") or "").strip()
            or str(merged_metadata.get("execution_target_selected") or "").strip()
            or str(merged_metadata.get("execution_target") or "").strip()
            or None
        ),
        policy_context={key: value for key, value in policy_context.items() if value not in (None, "", [], {})},
    )


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
    build_inbound_agent_turn_request: Callable[..., Any],
    trigger_pending_heartbeat_schedules: Callable[[], Any],
    execute_system_agent_turn: Callable[..., Any],
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
        turn_request = build_heartbeat_turn_request(
            build_inbound_agent_turn_request=build_inbound_agent_turn_request,
            tasks=tasks,
            metadata=metadata,
            pending_started=pending_started,
        )
        result = execute_system_agent_turn(
            turn_request=turn_request,
            run_execution_services=run_execution_services(),
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
