from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from server_modules import (
    gateway_approval_service,
    gateway_state_repository,
    personal_channels_repository,
)


def _parse_iso(value: Any) -> Optional[datetime]:
    token = str(value or "").strip()
    if not token:
        return None
    try:
        parsed = datetime.fromisoformat(token.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _age_seconds(value: Any) -> Optional[int]:
    parsed = _parse_iso(value)
    if parsed is None:
        return None
    return max(int((datetime.now(timezone.utc) - parsed).total_seconds()), 0)


def _check_status(ok: bool, *, warn: bool = False) -> str:
    if ok:
        return "pass"
    return "warn" if warn else "fail"


def gateway_doctor_payload(gateway_id: str) -> Dict[str, Any]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")
    latest_session = gateway_state_repository.get_latest_gateway_session(gateway_id)
    approvals = gateway_approval_service.list_gateway_tool_approvals(gateway_id=gateway_id, limit=50)
    browser_sessions = gateway_state_repository.list_gateway_browser_sessions(gateway_id, limit=10)
    whatsapp_state = personal_channels_repository.get_whatsapp_state(
        gateway_id,
        channel_key="whatsapp_personal",
    )
    telegram_state = personal_channels_repository.get_telegram_state(
        gateway_id,
        channel_key="telegram_personal",
    )
    recent_events = gateway_state_repository.list_gateway_events(gateway_id, limit=25)

    heartbeat_age = _age_seconds((latest_session or {}).get("last_heartbeat_at") if latest_session else registration.get("last_heartbeat_at"))
    session_status = str((latest_session or {}).get("status") or "").strip().lower()
    reported_health = str((latest_session or {}).get("metadata", {}).get("health_state") or registration.get("metadata", {}).get("health_state") or "").strip().lower()
    session_connected = session_status == "connected"
    heartbeat_fresh = heartbeat_age is not None and heartbeat_age <= 45
    registration_active = str(registration.get("status") or "").strip().lower() == "active"
    device_verified = str(registration.get("device_trust_state") or "").strip().lower() not in {"revoked", ""}
    checkpoint_drift = max(
        int(registration.get("journal_cursor") or 0) - int((latest_session or {}).get("last_ack") or 0),
        0,
    )
    resume_ready = registration_active and device_verified and int(registration.get("checkpoint_cursor") or 0) >= 0

    if not registration_active or not device_verified:
        overall_status = "blocked"
    elif not session_connected:
        overall_status = "offline"
    elif reported_health == "degraded" or not heartbeat_fresh:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    checks: List[Dict[str, Any]] = [
        {
            "id": "registration_active",
            "status": _check_status(registration_active),
            "summary": "Gateway registration is active." if registration_active else "Gateway registration is not active.",
        },
        {
            "id": "device_trust",
            "status": _check_status(device_verified),
            "summary": "Gateway device trust is valid." if device_verified else "Gateway device trust was revoked.",
        },
        {
            "id": "live_session",
            "status": _check_status(session_connected, warn=registration_active),
            "summary": "Gateway websocket session is connected." if session_connected else "Gateway websocket session is offline.",
        },
        {
            "id": "heartbeat_fresh",
            "status": _check_status(bool(heartbeat_fresh), warn=session_connected),
            "summary": "Gateway heartbeat is fresh." if heartbeat_fresh else "Gateway heartbeat is stale or missing.",
            "age_seconds": heartbeat_age,
        },
        {
            "id": "checkpoint_resume",
            "status": _check_status(resume_ready, warn=registration_active),
            "summary": "Checkpoint state is resumable." if resume_ready else "Checkpoint state is not ready for resume.",
            "drift": checkpoint_drift,
        },
        {
            "id": "pending_approvals",
            "status": "warn" if int(approvals.get("pending_count") or 0) > 0 else "pass",
            "summary": (
                f"{approvals.get('pending_count')} gateway approval(s) waiting."
                if int(approvals.get("pending_count") or 0) > 0
                else "No pending gateway approvals."
            ),
        },
    ]
    if whatsapp_state is not None:
        whatsapp_status = str(whatsapp_state.get("status") or "").strip().lower()
        checks.append(
            {
                "id": "whatsapp_personal",
                "status": "pass" if whatsapp_status == "connected" else "warn",
                "summary": (
                    "WhatsApp personal session is connected."
                    if whatsapp_status == "connected"
                    else f"WhatsApp personal session is {whatsapp_status or 'unknown'}."
                ),
            }
        )
    if telegram_state is not None:
        telegram_status = str(telegram_state.get("status") or "").strip().lower()
        checks.append(
            {
                "id": "telegram_personal",
                "status": "pass" if telegram_status == "connected" else "warn",
                "summary": (
                    "Telegram personal session is connected."
                    if telegram_status == "connected"
                    else f"Telegram personal session is {telegram_status or 'unknown'}."
                ),
            }
        )
    active_browser_sessions = [
        item
        for item in browser_sessions
        if str(item.get("status") or "").strip().lower() in {"active", "attached", "waiting_for_input", "fallback_ready"}
    ]
    attach_browser_sessions = [
        item
        for item in browser_sessions
        if str((item.get("metadata") or {}).get("browser_session_mode") or "").strip().lower() == "existing_session_attach"
    ]
    attach_ready_sessions = [
        item for item in attach_browser_sessions if str(item.get("status") or "").strip().lower() == "attached"
    ]
    if browser_sessions:
        checks.append(
            {
                "id": "browser_sessions",
                "status": "pass" if active_browser_sessions else "warn",
                "summary": (
                    f"{len(active_browser_sessions)} gateway browser session(s) available."
                    if active_browser_sessions
                    else "No active gateway browser sessions are currently available."
                ),
            }
        )
    if attach_browser_sessions:
        checks.append(
            {
                "id": "browser_attach",
                "status": "pass" if attach_ready_sessions else "warn",
                "summary": (
                    f"{len(attach_ready_sessions)} existing-session browser attach session(s) are attached."
                    if attach_ready_sessions
                    else "Existing-session browser attach is configured but not currently attached."
                ),
            }
        )

    return {
        "gateway_id": str(gateway_id or "").strip(),
        "status": overall_status,
        "registration": registration,
        "latest_session": latest_session,
        "checks": checks,
        "approvals": {
            "pending_count": int(approvals.get("pending_count") or 0),
            "retryable_count": int(approvals.get("retryable_count") or 0),
        },
        "checkpoint": {
            "journal_cursor": int(registration.get("journal_cursor") or 0),
            "checkpoint_cursor": int(registration.get("checkpoint_cursor") or 0),
            "last_session_seq": int((latest_session or {}).get("last_seq") or 0),
            "last_session_ack": int((latest_session or {}).get("last_ack") or 0),
            "resume_ready": resume_ready,
            "drift": checkpoint_drift,
        },
        "whatsapp_personal": whatsapp_state,
        "telegram_personal": telegram_state,
        "browser": {
            "count": len(browser_sessions),
            "active_count": len(active_browser_sessions),
            "items": browser_sessions,
        },
        "journal": {
            "count": len(recent_events),
            "recent": recent_events,
        },
    }
