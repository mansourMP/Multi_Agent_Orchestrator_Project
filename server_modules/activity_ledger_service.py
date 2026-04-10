from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from server_modules import control_plane_repository


DETAIL_LEVELS = {"feed_summary", "timeline_detail", "audit_reference"}
EVENT_CLASSES = {
    "sage_activity",
    "specialist_activity",
    "application_activity",
    "delegation",
    "artifact_created",
    "artifact_updated",
    "approval",
    "blocked_action",
    "memory_update",
    "run_status",
    "system_activity",
}


def _run_coro_sync(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError as exc:
        if "asyncio.run() cannot be called from a running event loop" not in str(exc):
            raise

    result: Dict[str, Any] = {}
    failure: Dict[str, BaseException] = {}

    def _runner() -> None:
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as err:  # pragma: no cover
            failure["error"] = err

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if "error" in failure:
        raise failure["error"]
    return result.get("value")


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _coerce_artifacts(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, dict):
        items = [value]
    elif isinstance(value, list):
        items = value
    else:
        items = []
    out: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        record = {
            "id": str(item.get("id") or "").strip() or None,
            "name": str(item.get("name") or "").strip() or None,
            "kind": str(item.get("kind") or item.get("type") or "").strip() or None,
            "path": str(item.get("path") or item.get("uri") or "").strip() or None,
            "preview_path": str(item.get("preview_path") or item.get("preview_url") or "").strip() or None,
            "review_required": bool(item.get("review_required")),
        }
        out.append({key: value for key, value in record.items() if value is not None})
    return out


def _normalize_detail_level(value: Any, *, default: str = "timeline_detail") -> str:
    token = str(value or "").strip().lower() or default
    return token if token in DETAIL_LEVELS else default


def _normalize_event_class(value: Any, *, default: str = "system_activity") -> str:
    token = str(value or "").strip().lower() or default
    return token if token in EVENT_CLASSES else default


def _compact_text(value: Any, *, limit: int = 220) -> str:
    text = " ".join(str(value or "").strip().split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _iso_ts(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    token = str(value or "").strip()
    return token or None


def _row_metadata(row: Dict[str, Any]) -> Dict[str, Any]:
    metadata = _coerce_dict(row.get("metadata"))
    metadata.setdefault("detail_level", str(row.get("detail_level") or "feed_summary"))
    metadata.setdefault("actor_type", str(row.get("actor_type") or "system"))
    metadata.setdefault("actor_id", str(row.get("actor_id") or "system"))
    if str(row.get("install_id") or "").strip():
        metadata.setdefault("install_id", str(row.get("install_id") or "").strip())
    if str(row.get("app_id") or "").strip():
        metadata.setdefault("app_id", str(row.get("app_id") or "").strip())
    if str(row.get("thread_id") or "").strip():
        metadata.setdefault("thread_id", str(row.get("thread_id") or "").strip())
    if str(row.get("status") or "").strip():
        metadata.setdefault("status", str(row.get("status") or "").strip())
    metadata["review_required"] = bool(row.get("review_required"))
    metadata["artifacts"] = _coerce_artifacts(row.get("artifacts"))
    return metadata


def _notification_session_key(row: Dict[str, Any]) -> str:
    session_key = str(row.get("session_key") or "").strip()
    if session_key:
        return session_key
    run_id = str(row.get("run_id") or "").strip()
    if run_id:
        return f"run:{run_id}"
    actor_type = str(row.get("actor_type") or "activity").strip()
    actor_id = str(row.get("actor_id") or "activity").strip()
    return f"activity:{actor_type}:{actor_id}"


def _project_notification_item(row: Dict[str, Any]) -> Dict[str, Any]:
    action = str(row.get("action") or row.get("event_class") or "notification").strip() or "notification"
    title = str(row.get("title") or "").strip() or action.replace("_", " ").title()
    return {
        "id": str(row.get("id") or "").strip() or None,
        "ts": _iso_ts(row.get("created_at")),
        "channel": str(row.get("channel") or "activity").strip() or "activity",
        "direction": str(row.get("direction") or "system").strip() or "system",
        "event_type": str(row.get("event_class") or "").strip() or None,
        "workspace_id": str(row.get("workspace_id") or "").strip() or None,
        "session_key": _notification_session_key(row),
        "session_id": _notification_session_key(row),
        "run_id": str(row.get("run_id") or "").strip() or None,
        "trace_id": str(row.get("trace_id") or "").strip() or None,
        "action": action,
        "title": title,
        "text": str(row.get("summary") or "").strip() or title,
        "metadata": _row_metadata(row),
    }


def _project_timeline_item(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row.get("id") or "").strip() or None,
        "ts": _iso_ts(row.get("created_at")),
        "workspace_id": str(row.get("workspace_id") or "").strip() or None,
        "event_class": str(row.get("event_class") or "").strip() or None,
        "detail_level": str(row.get("detail_level") or "").strip() or None,
        "status": str(row.get("status") or "").strip() or None,
        "action": str(row.get("action") or "").strip() or None,
        "channel": str(row.get("channel") or "").strip() or None,
        "direction": str(row.get("direction") or "").strip() or None,
        "session_key": str(row.get("session_key") or "").strip() or None,
        "run_id": str(row.get("run_id") or "").strip() or None,
        "thread_id": str(row.get("thread_id") or "").strip() or None,
        "trace_id": str(row.get("trace_id") or "").strip() or None,
        "title": str(row.get("title") or "").strip() or None,
        "summary": str(row.get("summary") or "").strip() or None,
        "review_required": bool(row.get("review_required")),
        "actor": {
            "type": str(row.get("actor_type") or "system").strip() or "system",
            "id": str(row.get("actor_id") or "system").strip() or "system",
            "install_id": str(row.get("install_id") or "").strip() or None,
            "app_id": str(row.get("app_id") or "").strip() or None,
        },
        "artifacts": _coerce_artifacts(row.get("artifacts")),
        "metadata": _coerce_dict(row.get("metadata")),
        "payload": _coerce_dict(row.get("payload")),
    }


async def append_activity_event(
    *,
    tenant_id: str,
    workspace_id: str,
    actor_type: str,
    actor_id: str,
    event_class: str,
    detail_level: str = "timeline_detail",
    install_id: Optional[str] = None,
    app_id: Optional[str] = None,
    run_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    session_key: Optional[str] = None,
    channel: Optional[str] = None,
    direction: Optional[str] = None,
    action: Optional[str] = None,
    trace_id: Optional[str] = None,
    title: str = "",
    summary: str = "",
    status: str = "logged",
    review_required: bool = False,
    artifacts: Optional[List[Dict[str, Any]]] = None,
    payload: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    return await control_plane_repository.append_activity_ledger_event(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        actor_type=str(actor_type or "").strip().lower() or "system",
        actor_id=str(actor_id or "").strip() or str(actor_type or "system").strip().lower() or "system",
        event_class=_normalize_event_class(event_class),
        detail_level=_normalize_detail_level(detail_level),
        install_id=str(install_id or "").strip() or None,
        app_id=str(app_id or "").strip() or None,
        run_id=str(run_id or "").strip() or None,
        thread_id=str(thread_id or "").strip() or None,
        session_key=str(session_key or "").strip() or None,
        channel=str(channel or "").strip().lower() or None,
        direction=str(direction or "").strip().lower() or None,
        action=str(action or "").strip().lower() or None,
        trace_id=str(trace_id or "").strip() or None,
        title=_compact_text(title, limit=140),
        summary=_compact_text(summary, limit=320),
        status=str(status or "logged").strip().lower() or "logged",
        review_required=bool(review_required),
        artifacts=_coerce_artifacts(artifacts),
        payload=_coerce_dict(payload),
        metadata=_coerce_dict(metadata),
        event_id=event_id,
    )


def record_notification_activity(*, event: Any, notification: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = _coerce_dict(getattr(event, "payload", {}))
    metadata = _coerce_dict(notification.get("metadata"))
    action = str(notification.get("action") or "").strip().lower()
    event_class = _normalize_event_class(
        metadata.get("activity_event_class")
        or payload.get("activity_event_class")
        or (
            "approval"
            if action == "approval_requested"
            else "blocked_action"
            if action in {"run_failed", "machine_revoked", "machine_enrollment_failed"}
            else "run_status"
            if action == "run_completed"
            else "system_activity"
        )
    )
    actor_type = str(
        metadata.get("activity_actor_type")
        or payload.get("activity_actor_type")
        or ("system" if event_class in {"approval", "blocked_action", "run_status", "system_activity"} else "application")
    ).strip().lower() or "system"
    actor_id = str(
        metadata.get("activity_actor_id")
        or payload.get("activity_actor_id")
        or metadata.get("agent_install_id")
        or payload.get("agent_install_id")
        or getattr(event, "run_id", None)
        or actor_type
    ).strip() or actor_type
    artifacts = metadata.get("artifacts") or payload.get("artifacts")
    return _run_coro_sync(
        append_activity_event(
            tenant_id=str(notification.get("tenant_id") or getattr(event, "tenant_id", "")).strip() or "default",
            workspace_id=str(notification.get("workspace_id") or getattr(event, "workspace_id", "")).strip() or "default",
            actor_type=actor_type,
            actor_id=actor_id,
            install_id=str(metadata.get("agent_install_id") or payload.get("agent_install_id") or "").strip() or None,
            app_id=str(metadata.get("app_id") or payload.get("source_app") or "").strip() or None,
            run_id=str(notification.get("run_id") or getattr(event, "run_id", "")).strip() or None,
            thread_id=str(metadata.get("thread_id") or "").strip() or None,
            session_key=str(notification.get("session_key") or "").strip() or None,
            channel=str(notification.get("channel") or "runtime").strip().lower() or "runtime",
            direction=str(notification.get("direction") or "system").strip().lower() or "system",
            event_class=event_class,
            detail_level="feed_summary",
            action=action or event_class,
            trace_id=str(notification.get("trace_id") or getattr(event, "trace_id", "")).strip() or None,
            title=str(notification.get("title") or "").strip(),
            summary=str(notification.get("text") or notification.get("title") or "").strip(),
            status=str(metadata.get("status") or "delivered").strip().lower() or "delivered",
            review_required=bool(metadata.get("review_required")),
            artifacts=artifacts if isinstance(artifacts, list) else _coerce_artifacts(artifacts),
            payload={
                "outbox_event_type": str(getattr(event, "event_type", "") or "").strip(),
                "notification": {
                    "id": str(notification.get("id") or "").strip() or None,
                    "action": action or None,
                    "title": str(notification.get("title") or "").strip() or None,
                },
                "outbox_payload": payload,
            },
            metadata=metadata,
            event_id=str(notification.get("id") or "").strip() or None,
        )
    )


async def list_notification_feed_items(
    *,
    tenant_id: str,
    workspace_id: str,
    channel: Optional[str] = None,
    session_key: Optional[str] = None,
    direction: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    rows = await control_plane_repository.list_activity_ledger_events(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        detail_levels=["feed_summary"],
        channel=str(channel or "").strip().lower() or None,
        session_key=str(session_key or "").strip() or None,
        direction=str(direction or "").strip().lower() or None,
        action=str(action or "").strip().lower() or None,
        run_id=str(run_id or "").strip() or None,
        trace_id=str(trace_id or "").strip() or None,
        limit=max(1, int(limit or 100)),
    )
    return [_project_notification_item(row) for row in rows]


def list_notification_feed_items_sync(**kwargs: Any) -> List[Dict[str, Any]]:
    return list(_run_coro_sync(list_notification_feed_items(**kwargs)) or [])


async def list_activity_timeline_payload(
    *,
    tenant_id: str,
    workspace_id: str,
    limit: int = 80,
    event_class: Optional[str] = None,
    detail_level: Optional[str] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
    install_id: Optional[str] = None,
    app_id: Optional[str] = None,
    run_id: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> Dict[str, Any]:
    rows = await control_plane_repository.list_activity_ledger_events(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        event_classes=[str(event_class or "").strip().lower()] if str(event_class or "").strip() else None,
        detail_levels=[_normalize_detail_level(detail_level)] if str(detail_level or "").strip() else None,
        actor_type=str(actor_type or "").strip().lower() or None,
        actor_id=str(actor_id or "").strip() or None,
        install_id=str(install_id or "").strip() or None,
        app_id=str(app_id or "").strip() or None,
        run_id=str(run_id or "").strip() or None,
        thread_id=str(thread_id or "").strip() or None,
        limit=max(1, min(int(limit or 80), 500)),
    )
    items = [_project_timeline_item(row) for row in rows]
    by_class: Dict[str, int] = {}
    review_required_count = 0
    for item in items:
        token = str(item.get("event_class") or "").strip()
        if token:
            by_class[token] = by_class.get(token, 0) + 1
        if bool(item.get("review_required")):
            review_required_count += 1
    return {
        "items": items,
        "count": len(items),
        "total": len(items),
        "summary": {
            "review_required_count": review_required_count,
            "by_class": by_class,
        },
    }


async def list_sage_recent_activity_payload(
    *,
    tenant_id: str,
    workspace_id: str,
    limit: int = 12,
) -> Dict[str, Any]:
    rows = await control_plane_repository.list_activity_ledger_events(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        detail_levels=["feed_summary", "timeline_detail"],
        limit=max(1, min(int(limit or 12), 50)),
    )
    items = [
        {
            "id": str(row.get("id") or "").strip() or None,
            "ts": _iso_ts(row.get("created_at")),
            "event_class": str(row.get("event_class") or "").strip() or None,
            "action": str(row.get("action") or "").strip() or None,
            "title": str(row.get("title") or "").strip() or None,
            "summary": str(row.get("summary") or "").strip() or None,
            "actor_type": str(row.get("actor_type") or "").strip() or None,
            "actor_id": str(row.get("actor_id") or "").strip() or None,
            "install_id": str(row.get("install_id") or "").strip() or None,
            "app_id": str(row.get("app_id") or "").strip() or None,
            "run_id": str(row.get("run_id") or "").strip() or None,
            "review_required": bool(row.get("review_required")),
            "artifacts": _coerce_artifacts(row.get("artifacts")),
        }
        for row in rows
    ]
    by_class: Dict[str, int] = {}
    for item in items:
        token = str(item.get("event_class") or "").strip()
        if token:
            by_class[token] = by_class.get(token, 0) + 1
    return {
        "items": items,
        "count": len(items),
        "summary": {
            "count": len(items),
            "by_class": by_class,
        },
    }
