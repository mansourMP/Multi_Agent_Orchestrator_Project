from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from server_modules import bounded_scheduler_service
from server_modules.runtime_lane_queue import runtime_lane_queue_snapshot
from server_modules.sage_profile_service import list_sage_profile


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _parse_utc(value: Any) -> Optional[datetime]:
    token = _coerce_text(value)
    if not token:
        return None
    try:
        parsed = datetime.fromisoformat(token.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _format_quiet_hours(start: int, end: int) -> str:
    return f"{int(start):02d}:00–{int(end):02d}:00"


def _queue_status_label(status: str) -> str:
    token = _coerce_text(status).lower()
    if token in {"running", "active", "started"}:
        return "Running now"
    if "approval" in token:
        return "Needs your OK"
    if token in {"queued", "pending", "waiting"}:
        return "Waiting"
    if token in {"completed", "executed", "done", "succeeded", "success"}:
        return "Done"
    if token in {"failed", "cancelled", "canceled"}:
        return "Done"
    return "Waiting"


def _governed_work_item(
    *,
    item_id: str,
    label: str,
    lane: str,
    product_lane: str,
    status: str,
    summary: Optional[str] = None,
    scheduled_for: Optional[str] = None,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": item_id,
        "label": label or "Queued work",
        "lane": lane or None,
        "product_lane": product_lane,
        "status": status,
        "status_label": _queue_status_label(status),
        "summary": summary or None,
        "scheduled_for": scheduled_for or None,
        "run_id": run_id or None,
    }


def _derive_queue_overview(
    *,
    schedule_items: List[Dict[str, Any]],
    next_action: Optional[Dict[str, Any]],
    wake_queue: Dict[str, Any],
    lane_queue: Dict[str, Any],
    quiet_hours: Dict[str, Any],
) -> Dict[str, Any]:
    running_items: List[Dict[str, Any]] = []
    waiting_items: List[Dict[str, Any]] = []
    blocked_items: List[Dict[str, Any]] = []
    done_items: List[Dict[str, Any]] = []
    scheduled_items: List[Dict[str, Any]] = []

    lanes = lane_queue.get("lanes") if isinstance(lane_queue.get("lanes"), dict) else {}
    for lane_name, lane_value in lanes.items():
        lane_payload = lane_value if isinstance(lane_value, dict) else {}
        for entry in list(lane_payload.get("active") or []):
            if not isinstance(entry, dict):
                continue
            running_items.append(
                _governed_work_item(
                    item_id=_coerce_text(entry.get("id")),
                    label=_coerce_text(entry.get("label")) or "Running work",
                    lane=str(lane_name),
                    product_lane="now",
                    status=_coerce_text(entry.get("status")) or "running",
                    summary=_coerce_text(entry.get("summary")) or (_coerce_text(entry.get("run_id")) and f"Run {_coerce_text(entry.get('run_id'))}") or None,
                    run_id=_coerce_text(entry.get("run_id")) or None,
                )
            )
        for entry in list(lane_payload.get("pending") or []):
            if not isinstance(entry, dict):
                continue
            status = _coerce_text(entry.get("status")) or "queued"
            destination = blocked_items if "approval" in status.lower() else waiting_items
            destination.append(
                _governed_work_item(
                    item_id=_coerce_text(entry.get("id")),
                    label=_coerce_text(entry.get("label")) or "Queued work",
                    lane=str(lane_name),
                    product_lane="needs_ok" if "approval" in status.lower() else "waiting",
                    status=status,
                    summary=_coerce_text(entry.get("summary")) or None,
                    run_id=_coerce_text(entry.get("run_id")) or None,
                )
            )

    for entry in list(lane_queue.get("recent") or []):
        if not isinstance(entry, dict):
            continue
        status = _coerce_text(entry.get("status")) or "completed"
        if "approval" in status.lower():
            blocked_items.append(
                _governed_work_item(
                    item_id=_coerce_text(entry.get("id")),
                    label=_coerce_text(entry.get("label")) or "Approval waiting",
                    lane=_coerce_text(entry.get("lane")),
                    product_lane="needs_ok",
                    status=status,
                    summary=_coerce_text(entry.get("summary")) or None,
                    run_id=_coerce_text(entry.get("run_id")) or None,
                )
            )
        else:
            done_items.append(
                _governed_work_item(
                    item_id=_coerce_text(entry.get("id")),
                    label=_coerce_text(entry.get("label")) or "Finished work",
                    lane=_coerce_text(entry.get("lane")),
                    product_lane="done",
                    status=status,
                    summary=_coerce_text(entry.get("summary")) or None,
                    run_id=_coerce_text(entry.get("run_id")) or None,
                )
            )

    for item in schedule_items:
        if not isinstance(item, dict) or not item.get("enabled"):
            continue
        scheduled_items.append(
            _governed_work_item(
                item_id=_coerce_text(item.get("id")),
                label=_coerce_text(item.get("name")) or "Scheduled action",
                lane="cron",
                product_lane="scheduled",
                status="scheduled",
                summary=(
                    f"{_coerce_text(item.get('schedule_kind')) or 'cron'} · "
                    f"{_coerce_text(item.get('wake_mode')) or 'now'} · "
                    f"{_coerce_text(item.get('delivery')) or 'announce'}"
                ),
                scheduled_for=_coerce_text(item.get("next_run_at")) or None,
            )
        )

    pending_wakeups = int(wake_queue.get("pending_count") or 0)
    return {
        "next_scheduled_action": next_action,
        "queued_count": len(waiting_items),
        "running_now_count": len(running_items),
        "blocked_on_approval_count": len(blocked_items),
        "done_count": len(done_items),
        "pending_wakeup_count": pending_wakeups,
        "quiet_hours": quiet_hours,
        "lanes": {
            "now": running_items[:6],
            "waiting": waiting_items[:6],
            "scheduled": scheduled_items[:6],
            "needs_ok": blocked_items[:6],
            "done": done_items[:6],
        },
    }


def _serialize_schedule_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": _coerce_text(item.get("id")),
        "name": _coerce_text(item.get("name")) or "Scheduled action",
        "enabled": bool(item.get("enabled")),
        "schedule_kind": _coerce_text(item.get("schedule_kind")) or "cron",
        "day_of_week": _coerce_text(item.get("day_of_week")) or None,
        "time_hhmm": _coerce_text(item.get("time_hhmm")) or None,
        "timezone": _coerce_text(item.get("timezone")) or "local",
        "next_run_at": _coerce_text(item.get("next_run_at")) or None,
        "wake_mode": _coerce_text(item.get("wake_mode")) or "now",
        "delivery": _coerce_text(item.get("delivery")) or "announce",
        "pending_heartbeat": bool(item.get("pending_heartbeat")),
        "pending_heartbeat_slot": _coerce_text(item.get("pending_heartbeat_slot")) or None,
        "last_run_at": _coerce_text(item.get("last_run_at")) or None,
        "last_error": _coerce_text(item.get("last_error")) or None,
    }


def _next_action(items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    ranked = sorted(
        (
            item
            for item in items
            if item.get("enabled") and _parse_utc(item.get("next_run_at")) is not None
        ),
        key=lambda item: _parse_utc(item.get("next_run_at")) or datetime.max.replace(tzinfo=timezone.utc),
    )
    if not ranked:
        return None
    return dict(ranked[0])


async def build_sage_heartbeat_snapshot(
    *,
    tenant_id: str,
    workspace_id: str,
    account_seed: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    profile_payload = list_sage_profile(
        workspace_id=workspace_id,
        account_seed=account_seed,
    )
    scheduler_payload = await bounded_scheduler_service.scheduler_status_snapshot(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    policy = scheduler_payload.get("policy") if isinstance(scheduler_payload.get("policy"), dict) else {}
    quiet_start = int(policy.get("quiet_hours_start") or 22)
    quiet_end = int(policy.get("quiet_hours_end") or 7)
    raw_jobs = (
        scheduler_payload.get("exact_jobs", {}).get("items")
        if isinstance(scheduler_payload.get("exact_jobs"), dict)
        else []
    )
    schedule_items = [
        _serialize_schedule_item(item)
        for item in raw_jobs
        if isinstance(item, dict)
    ]
    next_action = _next_action(schedule_items)
    wake_queue = scheduler_payload.get("wake_queue") if isinstance(scheduler_payload.get("wake_queue"), dict) else {}
    lane_queue = runtime_lane_queue_snapshot()
    profile = profile_payload.get("profile") if isinstance(profile_payload.get("profile"), dict) else {}
    bootstrap = profile_payload.get("bootstrap") if isinstance(profile_payload.get("bootstrap"), dict) else {}
    quiet_hours_status = bounded_scheduler_service.quiet_hours_status_snapshot(
        policy=bounded_scheduler_service.SchedulerPolicyBounds(
            quiet_hours_start=quiet_start,
            quiet_hours_end=quiet_end,
            max_event_triggers_per_hour=int(policy.get("max_event_triggers_per_hour") or bounded_scheduler_service.DEFAULT_MAX_EVENT_TRIGGERS_PER_HOUR),
            max_self_proposed_per_hour=int(policy.get("max_self_proposed_per_hour") or bounded_scheduler_service.DEFAULT_MAX_SELF_PROPOSED_PER_HOUR),
            max_runtime_seconds=int(policy.get("max_runtime_seconds") or bounded_scheduler_service.DEFAULT_MAX_RUNTIME_SECONDS),
            minimum_battery_percent=int(policy.get("minimum_battery_percent") or bounded_scheduler_service.DEFAULT_MINIMUM_BATTERY_PERCENT),
            require_network_online=bool(policy.get("require_network_online")),
            require_owner_approval_for_privileged_wakeups=bool(policy.get("require_owner_approval_for_privileged_wakeups")),
            plan_tier=_coerce_text(policy.get("plan_tier")) or "default",
        )
    )
    queue_overview = _derive_queue_overview(
        schedule_items=schedule_items,
        next_action=next_action,
        wake_queue=wake_queue,
        lane_queue=lane_queue if isinstance(lane_queue, dict) else {},
        quiet_hours=quiet_hours_status,
    )
    return {
        "workspace_id": workspace_id,
        "profile": {
            "recurring_responsibility": _coerce_text(profile.get("recurring_responsibility")) or None,
            "communication_style": _coerce_text(profile.get("communication_style")) or None,
        },
        "bootstrap": {
            "complete": bool(bootstrap.get("complete")),
            "progress_label": _coerce_text(bootstrap.get("progress_label")) or None,
        },
        "quiet_hours": {
            "start_hour": quiet_start,
            "end_hour": quiet_end,
            "label": _format_quiet_hours(quiet_start, quiet_end),
        },
        "ambient_monitor": scheduler_payload.get("ambient_monitor") if isinstance(scheduler_payload.get("ambient_monitor"), dict) else {},
        "reminders": {
            "count": len(schedule_items),
            "items": schedule_items,
        },
        "next_scheduled_action": next_action,
        "wake_queue": {
            "pending_count": int(wake_queue.get("pending_count") or 0),
            "claimed_count": int(wake_queue.get("claimed_count") or 0),
            "pending": wake_queue.get("pending") if isinstance(wake_queue.get("pending"), list) else [],
            "claimed": wake_queue.get("claimed") if isinstance(wake_queue.get("claimed"), list) else [],
        },
        "lane_queue": lane_queue if isinstance(lane_queue, dict) else {},
        "queue_overview": queue_overview,
        "policy": {
            "plan_tier": _coerce_text(policy.get("plan_tier")) or None,
            "require_network_online": bool(policy.get("require_network_online")),
            "minimum_battery_percent": int(policy.get("minimum_battery_percent") or 0),
            "max_self_proposed_per_hour": int(policy.get("max_self_proposed_per_hour") or 0),
        },
        "retry": bounded_scheduler_service.retry_queue_status(workspace_id),
        "plugin": _plugin_health_snapshot(),
    }


def _plugin_health_snapshot() -> Dict[str, Any]:
    try:
        from server_modules.plugin_system import get_global_hook_registry
        return get_global_hook_registry().snapshot()
    except Exception:
        return {"error": "plugin_system_unavailable"}
