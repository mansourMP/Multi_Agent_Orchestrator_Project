from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from server_modules import bounded_scheduler_service
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
    profile = profile_payload.get("profile") if isinstance(profile_payload.get("profile"), dict) else {}
    bootstrap = profile_payload.get("bootstrap") if isinstance(profile_payload.get("bootstrap"), dict) else {}
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
        "policy": {
            "plan_tier": _coerce_text(policy.get("plan_tier")) or None,
            "require_network_online": bool(policy.get("require_network_online")),
            "minimum_battery_percent": int(policy.get("minimum_battery_percent") or 0),
            "max_self_proposed_per_hour": int(policy.get("max_self_proposed_per_hour") or 0),
        },
    }
