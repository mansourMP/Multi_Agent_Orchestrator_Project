from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional
import uuid

from server_modules import outbox_service


LOGGER = logging.getLogger(__name__)

_SENSITIVE_KEY_PARTS = (
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "auth_token",
    "authorization",
    "password",
    "secret",
    "credential",
    "credentials",
    "private_key",
    "pairing_token",
    "pairing_code",
    "session_cookie",
    "cookie",
)

_SENSITIVE_VALUE_PATTERNS = (
    (re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE), "Bearer [redacted]"),
    (re.compile(r"sk-[A-Za-z0-9][A-Za-z0-9_-]{8,}"), "[redacted-secret]"),
    (re.compile(r"gpair_[A-Za-z0-9_-]+"), "[redacted-token]"),
    (re.compile(r"AIza[0-9A-Za-z_-]{20,}"), "[redacted-secret]"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"), "[redacted-secret]"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9-]+"), "[redacted-secret]"),
)


def _is_sensitive_metadata_key(key: Any) -> bool:
    normalized = re.sub(r"[^a-z0-9_]+", "_", str(key or "").strip().lower())
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def _redact_sensitive_text(value: str) -> str:
    redacted = value
    for pattern, replacement in _SENSITIVE_VALUE_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def _sanitize_metadata_value(value: Any, *, depth: int = 0) -> Any:
    if depth > 8:
        return "[redacted-depth]"
    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for key, item in value.items():
            sanitized[str(key)] = "[redacted]" if _is_sensitive_metadata_key(key) else _sanitize_metadata_value(item, depth=depth + 1)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_metadata_value(item, depth=depth + 1) for item in value[:100]]
    if isinstance(value, tuple):
        return [_sanitize_metadata_value(item, depth=depth + 1) for item in list(value)[:100]]
    if isinstance(value, str):
        return _redact_sensitive_text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return str(value)


def sanitize_security_audit_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    return _sanitize_metadata_value(metadata)


def emit_security_audit_event(
    *,
    action: str,
    status: str = "success",
    tenant_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    current_user: Optional[Dict[str, Any]] = None,
    actor_user_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    actor_auth_type: Optional[str] = None,
    channel: Optional[str] = None,
    run_id: Optional[str] = None,
    machine_id: Optional[str] = None,
    trace_id: str = "",
    detail: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Optional[outbox_service.OutboxEvent]:
    action_token = str(action or "").strip()
    if not action_token:
        return None
    current_user = current_user if isinstance(current_user, dict) else {}
    resolved_tenant_id = str(
        tenant_id
        or current_user.get("tenant_id")
        or current_user.get("current_tenant_id")
        or "default"
    ).strip() or "default"
    resolved_workspace_id = str(
        workspace_id
        or current_user.get("workspace_id")
        or current_user.get("current_workspace_id")
        or "default"
    ).strip() or "default"
    payload = {
        "action": action_token,
        "status": str(status or "").strip() or "success",
        "actor_user_id": str(actor_user_id or current_user.get("user_id") or "").strip() or None,
        "actor_email": str(actor_email or current_user.get("email") or "").strip().lower() or None,
        "actor_auth_type": str(actor_auth_type or current_user.get("auth_type") or "").strip().lower() or None,
        "channel": str(channel or "").strip().lower() or None,
        "detail": str(detail or "").strip() or None,
        "metadata": sanitize_security_audit_metadata(metadata),
        "emitted_at": outbox_service._utc_now_iso(),
    }
    try:
        return outbox_service.emit_runtime_event(
            event_type="security_audit",
            tenant_id=resolved_tenant_id,
            workspace_id=resolved_workspace_id,
            run_id=str(run_id or "").strip() or None,
            machine_id=str(machine_id or "").strip() or None,
            trace_id=str(trace_id or "").strip(),
            idempotency_key=str(idempotency_key or "").strip() or f"security_audit:{action_token}:{uuid.uuid4().hex}",
            payload=payload,
        )
    except Exception as exc:
        LOGGER.warning("Failed to emit security audit event %s: %s", action_token, exc)
        return None
