from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import time
from typing import Any, Dict, Iterable, List, Mapping, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from server_modules import runtime_state_store


LOGGER = logging.getLogger(__name__)
EXPO_PUSH_ENDPOINT = str(
    os.getenv("EMPYRALIS_EXPO_PUSH_ENDPOINT", "https://exp.host/--/api/v2/push/send")
).strip() or "https://exp.host/--/api/v2/push/send"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_ts(raw: Any) -> Optional[float]:
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value).astimezone(timezone.utc).timestamp()
    except Exception:
        return None


def _runtime_state_db_path(db_path: Optional[Path] = None) -> Path:
    if db_path is not None:
        return Path(db_path)
    try:
        import server as _server

        value = getattr(_server, "ORION_RUNTIME_STATE_DB", None)
        if value:
            return Path(value)
    except Exception:
        pass
    from server_modules.runtime_config import ORION_RUNTIME_STATE_DB

    return Path(ORION_RUNTIME_STATE_DB)


def _ensure_runtime_state_db(db_path: Optional[Path] = None) -> Path:
    runtime_db = _runtime_state_db_path(db_path)
    runtime_state_store.init_runtime_state_db(runtime_db)
    return runtime_db


def reader_key_for_current_user(current_user: Optional[Dict[str, Any]]) -> str:
    if not isinstance(current_user, dict):
        return "anonymous"
    auth_type = str(current_user.get("auth_type") or "").strip().lower()
    if auth_type == "bearer":
        user_id = str(current_user.get("user_id") or "").strip()
        if user_id:
            return f"user:{user_id}"
    if auth_type in {"api_key", "disabled"}:
        return f"{auth_type}:owner"
    email = str(current_user.get("email") or "").strip().lower()
    if email:
        return f"email:{email}"
    role = str(current_user.get("role") or "viewer").strip().lower() or "viewer"
    return f"role:{role}"


def _title_from_action(action: str) -> str:
    token = str(action or "").strip().replace("_", " ")
    return token[:1].upper() + token[1:] if token else "Notification"


def _default_path_for_action(action: str, *, run_id: Optional[str] = None) -> str:
    normalized = str(action or "").strip().lower()
    if normalized == "approval_requested":
        return "/approvals"
    if normalized in {"run_completed", "run_failed"} and str(run_id or "").strip():
        return f"/runs/{str(run_id).strip()}"
    if normalized.startswith("machine_"):
        return "/machines"
    return "/notifications"


def build_notification_from_outbox_event(event: Any) -> Optional[Dict[str, Any]]:
    event_type = str(getattr(event, "event_type", "") or "").strip().lower()
    payload = dict(getattr(event, "payload", {}) or {})
    tenant_id = str(getattr(event, "tenant_id", "") or "default").strip() or "default"
    workspace_id = str(getattr(event, "workspace_id", "") or "default").strip() or "default"
    run_id = str(getattr(event, "run_id", "") or "").strip() or None
    machine_id = str(getattr(event, "machine_id", "") or "").strip() or None
    trace_id = str(getattr(event, "trace_id", "") or "").strip()
    event_id = str(getattr(event, "event_id", "") or "").strip()
    created_at = str(getattr(event, "created_at", "") or payload.get("emitted_at") or _utc_now_iso()).strip()

    action = ""
    title = ""
    text = ""
    priority = "normal"
    metadata: Dict[str, Any] = dict(payload.get("metadata") or {}) if isinstance(payload.get("metadata"), dict) else {}

    if event_type == "approval_requested":
        action = "approval_requested"
        title = "Approval required"
        text = str(payload.get("prompt") or "").strip() or f"Approval requested for run {run_id or 'unknown'}."
        priority = "high"
    elif event_type == "run_transition":
        to_state = str(payload.get("to_state") or "").strip().lower()
        if to_state not in {"completed", "failed"}:
            return None
        action = f"run_{to_state}"
        title = "Run completed" if to_state == "completed" else "Run failed"
        text = f"Run {run_id or 'unknown'} {to_state}."
        priority = "normal" if to_state == "completed" else "high"
    elif event_type == "machine_event":
        raw_action = str(payload.get("action") or "").strip().lower()
        enrollment_state = str(payload.get("enrollment_state") or payload.get("status") or "").strip().lower()
        error_text = str(payload.get("error") or payload.get("bootstrap_error") or "").strip()
        machine_label = str(payload.get("display_name") or machine_id or "machine").strip() or "machine"
        if raw_action == "revoked":
            action = "machine_revoked"
            title = "Machine revoked"
            text = f"{machine_label} was revoked."
            priority = "high"
        elif raw_action in {"enrollment_failed", "bootstrap_failed"} or (
            raw_action == "enrollment_state_updated" and enrollment_state == "failed"
        ):
            action = "machine_enrollment_failed"
            title = "Machine enrollment failed"
            text = error_text or f"{machine_label} failed to enroll."
            priority = "high"
        else:
            return None
    elif event_type == "notification":
        action = str(payload.get("action") or "notification").strip().lower() or "notification"
        title = str(metadata.get("title") or "").strip() or _title_from_action(action)
        text = str(payload.get("text") or "").strip() or "Notification"
        priority = str(metadata.get("priority") or "normal").strip().lower() or "normal"
    else:
        return None

    route_path = str(metadata.get("path") or "").strip() or _default_path_for_action(action, run_id=run_id)
    notification = {
        "id": event_id,
        "ts": created_at,
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "session_key": (
            f"run:{run_id}"
            if run_id
            else f"machine:{machine_id}"
            if machine_id
            else f"workspace:{workspace_id}"
        ),
        "session_id": (
            f"run:{run_id}"
            if run_id
            else f"machine:{machine_id}"
            if machine_id
            else f"workspace:{workspace_id}"
        ),
        "channel": "runtime",
        "direction": "system",
        "event_type": event_type,
        "run_id": run_id,
        "machine_id": machine_id,
        "trace_id": trace_id,
        "action": action,
        "title": title,
        "text": text,
        "metadata": {
            **metadata,
            "path": route_path,
            "priority": priority,
            "source_event_type": event_type,
            "outbox_event_id": event_id,
            "delivery_channels": ["feed", "push"],
            "run_id": run_id,
            "machine_id": machine_id,
        },
    }
    return notification


def _workspace_filtered_items(
    items: Iterable[Dict[str, Any]],
    *,
    allowed_workspaces: Optional[set[str]],
    requested_workspace_id: Optional[str],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        workspace_id = str(item.get("workspace_id") or "").strip()
        if requested_workspace_id and workspace_id != requested_workspace_id:
            continue
        if allowed_workspaces is not None and workspace_id not in allowed_workspaces:
            continue
        out.append(item)
    return out


def list_notification_payload(
    *,
    current_user: Any,
    limit: int,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    channel: Optional[str] = None,
    session_key: Optional[str] = None,
    direction: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    include_sessions: bool = True,
    session_limit: int = 25,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    from server_modules.auth import allowed_workspace_ids, enforce_workspace_access

    safe_limit = max(1, min(int(limit or 0), 500))
    requested_workspace_id = (
        enforce_workspace_access(current_user, workspace_id, tenant_id=tenant_id, minimum_role="viewer")
        if workspace_id
        else None
    )
    allowed_workspaces = allowed_workspace_ids(current_user)
    items = runtime_state_store.list_notifications(
        _ensure_runtime_state_db(db_path),
        reader_key=reader_key_for_current_user(current_user),
        tenant_id=str(tenant_id or "").strip(),
        workspace_id=str(requested_workspace_id or "").strip(),
        channel=str(channel or "").strip(),
        session_key=str(session_key or "").strip(),
        direction=str(direction or "").strip(),
        action=str(action or "").strip(),
        run_id=str(run_id or "").strip(),
        trace_id=str(trace_id or "").strip(),
        limit=max(safe_limit, 500 if requested_workspace_id else safe_limit * 4),
    )
    filtered = _workspace_filtered_items(
        items,
        allowed_workspaces=allowed_workspaces,
        requested_workspace_id=requested_workspace_id,
    )
    payload = filtered[:safe_limit]
    sessions = (
        runtime_state_store.summarize_notification_sessions(filtered, limit=session_limit)
        if include_sessions
        else []
    )
    return {
        "items": payload,
        "count": len(payload),
        "total": len(filtered),
        "sessions": sessions,
        "session_count": len(sessions),
        "stream": False,
    }


def mark_notifications_read(
    *,
    current_user: Any,
    notification_ids: Optional[List[str]] = None,
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    mark_all: bool = False,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    from server_modules.auth import allowed_workspace_ids, enforce_workspace_access

    requested_workspace_id = (
        enforce_workspace_access(current_user, workspace_id, tenant_id=tenant_id, minimum_role="viewer")
        if workspace_id
        else None
    )
    allowed_workspaces = allowed_workspace_ids(current_user)
    reader_key = reader_key_for_current_user(current_user)
    normalized_ids = [
        str(item or "").strip()
        for item in (notification_ids or [])
        if str(item or "").strip()
    ]
    if mark_all:
        target_items = _workspace_filtered_items(
            runtime_state_store.list_notifications(
                _ensure_runtime_state_db(db_path),
                reader_key=reader_key,
                tenant_id=str(tenant_id or "").strip(),
                workspace_id=str(requested_workspace_id or "").strip(),
                limit=5000,
            ),
            allowed_workspaces=allowed_workspaces,
            requested_workspace_id=requested_workspace_id,
        )
        return {
            "status": "ok",
            **runtime_state_store.mark_notifications_read(
                _ensure_runtime_state_db(db_path),
                reader_key=reader_key,
                notification_ids=[
                    str(item.get("id") or "").strip()
                    for item in target_items
                    if isinstance(item, dict) and str(item.get("id") or "").strip()
                ],
            ),
        }
    allowed_items = runtime_state_store.list_notifications_by_ids(
        _ensure_runtime_state_db(db_path),
        reader_key=reader_key,
        notification_ids=normalized_ids,
    )
    filtered_items = _workspace_filtered_items(
        allowed_items,
        allowed_workspaces=allowed_workspaces,
        requested_workspace_id=requested_workspace_id,
    )
    marked = runtime_state_store.mark_notifications_read(
        _ensure_runtime_state_db(db_path),
        reader_key=reader_key,
        notification_ids=[str(item.get("id") or "").strip() for item in filtered_items],
    )
    return {"status": "ok", **marked}


def register_notification_device(
    *,
    current_user: Any,
    workspace_id: str,
    push_token: str,
    device_id: str,
    provider: str = "expo",
    platform: str = "",
    device_name: str = "",
    app_id: str = "",
    capabilities: Optional[List[str]] = None,
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    from server_modules.auth import enforce_workspace_access, workspace_tenant_id

    workspace_token = enforce_workspace_access(current_user, workspace_id, minimum_role="viewer")
    tenant_id = workspace_tenant_id(current_user, workspace_token)
    record = runtime_state_store.upsert_notification_device(
        _ensure_runtime_state_db(db_path),
        {
            "device_id": str(device_id or "").strip(),
            "tenant_id": str(tenant_id or "default").strip() or "default",
            "workspace_id": workspace_token,
            "reader_key": reader_key_for_current_user(current_user),
            "provider": str(provider or "expo").strip().lower() or "expo",
            "push_token": str(push_token or "").strip(),
            "platform": str(platform or "").strip().lower(),
            "device_name": str(device_name or "").strip(),
            "app_id": str(app_id or "").strip(),
            "capabilities": [str(item or "").strip() for item in (capabilities or []) if str(item or "").strip()],
            "status": "active",
            "registered_at": _utc_now_iso(),
        },
    )
    return {
        "ok": True,
        "device_id": str(record.get("device_id") or "").strip(),
        "workspace_id": workspace_token,
        "tenant_id": str(record.get("tenant_id") or tenant_id or "default").strip() or "default",
        "status": str(record.get("status") or "active").strip() or "active",
        "registered_at": str(record.get("last_registered_at") or "").strip() or _utc_now_iso(),
        "provider": str(record.get("provider") or "expo").strip() or "expo",
    }


def send_expo_push_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not messages:
        return []
    request_payload = json.dumps(messages, ensure_ascii=False).encode("utf-8")
    request = urllib_request.Request(
        EXPO_PUSH_ENDPOINT,
        data=request_payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(request, timeout=10.0) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(body or f"Expo push request failed ({exc.code}).") from exc
    except Exception as exc:
        raise RuntimeError(str(exc) or "Expo push request failed.") from exc
    try:
        payload = json.loads(raw)
    except Exception as exc:
        raise RuntimeError("Expo push response was not valid JSON.") from exc
    data = payload.get("data")
    if isinstance(data, list):
        return [dict(item) if isinstance(item, dict) else {"status": "error", "message": str(item)} for item in data]
    if isinstance(data, dict):
        return [dict(data)]
    return []


def fanout_notification_push(
    notification: Dict[str, Any],
    *,
    db_path: Optional[Path] = None,
    send_push_messages_fn=send_expo_push_messages,
) -> Dict[str, Any]:
    notification_id = str(notification.get("id") or "").strip()
    if not notification_id:
        return {"device_count": 0, "delivered_count": 0}
    runtime_db = _ensure_runtime_state_db(db_path)
    deliveries = runtime_state_store.list_notification_delivery_statuses(
        runtime_db,
        notification_id=notification_id,
    )
    devices = runtime_state_store.list_notification_devices(
        runtime_db,
        tenant_id=str(notification.get("tenant_id") or "").strip(),
        workspace_id=str(notification.get("workspace_id") or "").strip(),
        status="active",
    )
    pending_devices = [
        device
        for device in devices
        if str(device.get("provider") or "").strip().lower() == "expo"
        and str(device.get("push_token") or "").strip()
        and str((deliveries.get(str(device.get("device_id") or "").strip()) or {}).get("status") or "").strip().lower()
        != "delivered"
    ]
    if not pending_devices:
        return {"device_count": 0, "delivered_count": 0}
    metadata = dict(notification.get("metadata") or {}) if isinstance(notification.get("metadata"), dict) else {}
    messages = [
        {
            "to": str(device.get("push_token") or "").strip(),
            "title": str(notification.get("title") or "").strip() or _title_from_action(notification.get("action") or "notification"),
            "body": str(notification.get("text") or "").strip() or "Empyralis notification",
            "data": {
                "notificationId": notification_id,
                "path": str(metadata.get("path") or _default_path_for_action(notification.get("action") or "", run_id=notification.get("run_id"))).strip(),
                "runId": str(notification.get("run_id") or "").strip() or None,
                "workspaceId": str(notification.get("workspace_id") or "").strip() or None,
                "machineId": str(notification.get("machine_id") or "").strip() or None,
            },
        }
        for device in pending_devices
    ]
    results = send_push_messages_fn(messages)
    if len(results) != len(pending_devices):
        raise RuntimeError("Push delivery response count did not match device count.")
    delivered_count = 0
    failures: List[str] = []
    now_iso = _utc_now_iso()
    for device, result in zip(pending_devices, results):
        device_id = str(device.get("device_id") or "").strip()
        status = str((result or {}).get("status") or "").strip().lower()
        if status == "ok":
            runtime_state_store.upsert_notification_delivery(
                runtime_db,
                notification_id=notification_id,
                device_id=device_id,
                status="delivered",
                delivered_at=now_iso,
            )
            runtime_state_store.update_notification_device_status(
                runtime_db,
                device_id,
                status="active",
                last_error="",
                last_delivered_at=now_iso,
            )
            delivered_count += 1
            continue
        details = result.get("details") if isinstance(result, dict) else None
        error_text = ""
        if isinstance(details, dict):
            error_text = str(details.get("error") or details.get("message") or "").strip()
        if not error_text:
            error_text = str(result.get("message") or result.get("error") or "push delivery failed").strip()
        normalized_status = "invalid" if "notregistered" in error_text.lower() or "device not registered" in error_text.lower() else "failed"
        runtime_state_store.upsert_notification_delivery(
            runtime_db,
            notification_id=notification_id,
            device_id=device_id,
            status=normalized_status,
            last_error=error_text,
        )
        runtime_state_store.update_notification_device_status(
            runtime_db,
            device_id,
            status="invalid" if normalized_status == "invalid" else "active",
            last_error=error_text,
        )
        failures.append(f"{device_id}:{error_text}")
    if failures:
        raise RuntimeError("; ".join(failures))
    return {"device_count": len(pending_devices), "delivered_count": delivered_count}


def deliver_notification_from_outbox_event(
    event: Any,
    *,
    db_path: Optional[Path] = None,
    send_push_messages_fn=send_expo_push_messages,
) -> Optional[Dict[str, Any]]:
    notification = build_notification_from_outbox_event(event)
    if notification is None:
        return None
    runtime_db = _ensure_runtime_state_db(db_path)
    runtime_state_store.upsert_notification(runtime_db, notification)
    fanout_notification_push(
        notification,
        db_path=runtime_db,
        send_push_messages_fn=send_push_messages_fn,
    )
    return notification


def iter_notifications_stream(
    *,
    reader_key: str,
    allowed_workspace_ids: Optional[set[str]] = None,
    workspace_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    channel: Optional[str] = None,
    session_key: Optional[str] = None,
    direction: Optional[str] = None,
    action: Optional[str] = None,
    run_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    since_id: Optional[str] = None,
    since_ts: Optional[str] = None,
    include_backlog: bool = False,
    poll_seconds: float = 0.35,
    heartbeat_seconds: float = 5.0,
    timeout_seconds: float = 25.0,
    limit: int = 120,
    db_path: Optional[Path] = None,
):
    safe_limit = max(1, min(int(limit or 0), 500))
    safe_poll = max(0.05, min(float(poll_seconds or 0.0), 5.0))
    safe_heartbeat = max(1.0, min(float(heartbeat_seconds or 0.0), 60.0))
    safe_timeout = max(1.0, min(float(timeout_seconds or 0.0), 300.0))
    cursor_id = str(since_id or "").strip()
    cursor_ts = _parse_ts(since_ts)
    backlog_once = bool(include_backlog and not cursor_id and cursor_ts is None)
    started_mono = time.monotonic()
    next_heartbeat = started_mono + safe_heartbeat
    runtime_db = _ensure_runtime_state_db(db_path)

    while True:
        now_mono = time.monotonic()
        if (now_mono - started_mono) >= safe_timeout:
            yield {"event": "done", "data": json.dumps({"reason": "timeout", "ts": _utc_now_iso()}, ensure_ascii=True)}
            break

        snapshot = runtime_state_store.list_notifications(
            runtime_db,
            reader_key=reader_key,
            tenant_id=str(tenant_id or "").strip(),
            workspace_id=str(workspace_id or "").strip(),
            channel=str(channel or "").strip(),
            session_key=str(session_key or "").strip(),
            direction=str(direction or "").strip(),
            action=str(action or "").strip(),
            run_id=str(run_id or "").strip(),
            trace_id=str(trace_id or "").strip(),
            limit=max(safe_limit, 300),
        )
        filtered = _workspace_filtered_items(
            snapshot,
            allowed_workspaces=allowed_workspace_ids,
            requested_workspace_id=str(workspace_id or "").strip() or None,
        )
        candidates: List[Dict[str, Any]] = []
        if cursor_id:
            cursor_index = -1
            for idx, item in enumerate(filtered):
                if str(item.get("id") or "").strip() == cursor_id:
                    cursor_index = idx
                    break
            if cursor_index > 0:
                candidates = filtered[:cursor_index]
            elif cursor_index < 0 and filtered:
                cursor_id = str(filtered[0].get("id") or cursor_id).strip()
                cursor_ts = _parse_ts(filtered[0].get("ts")) or cursor_ts
        elif cursor_ts is not None:
            candidates = [
                item
                for item in filtered
                if (_parse_ts(item.get("ts")) or 0.0) > cursor_ts
            ]
        elif backlog_once:
            candidates = filtered[:safe_limit]
            backlog_once = False
        elif filtered:
            cursor_id = str(filtered[0].get("id") or "").strip()
            cursor_ts = _parse_ts(filtered[0].get("ts")) or cursor_ts

        if candidates:
            emit_items = list(reversed(candidates[:safe_limit]))
            for item in emit_items:
                yield {"event": "notification", "data": json.dumps(item, ensure_ascii=True)}
            newest = candidates[0]
            cursor_id = str(newest.get("id") or cursor_id).strip()
            cursor_ts = _parse_ts(newest.get("ts")) or cursor_ts
            next_heartbeat = time.monotonic() + safe_heartbeat
        elif now_mono >= next_heartbeat:
            yield {"event": "heartbeat", "data": json.dumps({"ts": _utc_now_iso()}, ensure_ascii=True)}
            next_heartbeat = now_mono + safe_heartbeat

        time.sleep(safe_poll)
