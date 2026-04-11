from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException

from server_modules import auth as auth_module
from server_modules import run_state_repository
from server_modules import runtime_config
from server_modules import shared as shared_module
from server_modules.connectors.autopilot_runtime_exports import (
    handle_telegram_autopilot_status,
    handle_whatsapp_autopilot_status,
)
from server_modules.runtime_common import _safe_read_json


CHANNEL_PROVIDERS = ("telegram", "whatsapp")
PAIRING_FAILURE_ACTIONS = {"pairing_required", "pairing_failed"}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_list(value: Any) -> List[Any]:
    return list(value) if isinstance(value, list) else []


def _normalize_workspace_token(value: Any) -> str:
    return str(value or "").strip()


def _normalize_channel_token(value: Any) -> str:
    return str(value or "").strip().lower()


def _issue_severity(issue: Dict[str, Any]) -> str:
    token = str(issue.get("severity") or "").strip().lower()
    if token in {"setup_needed", "degraded"}:
        return token
    return "degraded"


def _workspace_status_from_issues(
    *,
    base_status: str,
    connectors: List[Dict[str, Any]],
    issues: List[Dict[str, Any]],
) -> str:
    normalized_base = str(base_status or "").strip().lower()
    if normalized_base == "disabled":
        return "disabled"
    if not connectors:
        return "setup_needed"
    if any(_issue_severity(issue) == "setup_needed" for issue in issues):
        return "setup_needed"
    if issues:
        return "degraded"
    return "live"


def _workspace_channel_payload(
    *,
    provider: str,
    workspace_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    connectors = [
        _coerce_dict(item)
        for item in _coerce_list(payload.get("connectors"))
        if _normalize_workspace_token(_coerce_dict(item).get("workspace_id")) == workspace_id
    ]
    issues = [_coerce_dict(item) for item in _coerce_list(payload.get("issues")) if isinstance(item, dict)]
    if not connectors:
        issues.append(
            {
                "code": f"{provider}_workspace_connector_missing",
                "severity": "setup_needed",
                "message": f"No {provider.title()} connector is configured for this workspace.",
            }
        )
    for connector in connectors:
        profile_issue = str(connector.get("profile_issue") or "").strip()
        if profile_issue:
            issues.append(
                {
                    "code": str(connector.get("profile_issue_code") or f"{provider}_connector_profile_issue").strip(),
                    "severity": (
                        "setup_needed"
                        if str(connector.get("profile_status") or "").strip().lower() == "setup_needed"
                        else "degraded"
                    ),
                    "message": profile_issue,
                    "connector_id": str(connector.get("id") or "").strip() or None,
                }
            )
        last_error = str(connector.get("last_error") or "").strip()
        if last_error:
            issues.append(
                {
                    "code": str(connector.get("last_error_category") or f"{provider}_connector_error").strip(),
                    "severity": "degraded",
                    "message": last_error,
                    "connector_id": str(connector.get("id") or "").strip() or None,
                    "occurred_at": connector.get("last_error_at"),
                }
            )

    workspace_status = _workspace_status_from_issues(
        base_status=str(payload.get("status") or "").strip().lower(),
        connectors=connectors,
        issues=issues,
    )

    return {
        "provider": provider,
        "status": str(payload.get("status") or "").strip().lower() or "setup_needed",
        "workspace_status": workspace_status,
        "webhook": _coerce_dict(payload.get("webhook")),
        "autopilot": _coerce_dict(payload.get("autopilot")),
        "connectors": connectors,
        "issues": issues,
        "workspace_configured": bool(connectors),
        "vault_error": payload.get("vault_error"),
    }


def _filter_recent_channel_events(
    *,
    workspace_id: str,
    limit: int,
) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 0), 200))
    with shared_module.CHANNEL_EVENTS_LOCK:
        snapshot = list(shared_module.CHANNEL_EVENTS)
    items: List[Dict[str, Any]] = []
    for raw_item in snapshot:
        item = _coerce_dict(raw_item)
        if _normalize_workspace_token(item.get("workspace_id")) != workspace_id:
            continue
        if _normalize_channel_token(item.get("channel")) not in CHANNEL_PROVIDERS:
            continue
        items.append(item)
        if len(items) >= safe_limit:
            break
    return items


def _filter_pairing_failures(items: List[Dict[str, Any]], *, limit: int) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 0), 100))
    failures = [
        item
        for item in items
        if str(item.get("action") or "").strip().lower() in PAIRING_FAILURE_ACTIONS
    ]
    return failures[:safe_limit]


def _workspace_dead_letters(*, workspace_id: str, limit: int) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 0), 200))
    payload = _safe_read_json(runtime_config.ORION_CHANNEL_DEAD_LETTER_FILE, {"version": 1, "items": []})
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    filtered: List[Dict[str, Any]] = []
    for raw_item in items:
        item = _coerce_dict(raw_item)
        if _normalize_workspace_token(item.get("workspace_id")) != workspace_id:
            continue
        if _normalize_channel_token(item.get("channel")) not in CHANNEL_PROVIDERS:
            continue
        filtered.append(item)
        if len(filtered) >= safe_limit:
            break
    return filtered


def _workspace_pending_delivery_summary(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_channel: Dict[str, int] = {}
    last_delivery_error: Dict[str, Any] | None = None
    retry_total = 0
    max_retry = 0
    for item in items:
        payload = _coerce_dict(item.get("payload"))
        channel = _normalize_channel_token(payload.get("channel")) or "unknown"
        by_channel[channel] = by_channel.get(channel, 0) + 1
        retry_count = int(item.get("retry_count") or 0)
        retry_total += retry_count
        max_retry = max(max_retry, retry_count)
        if not last_delivery_error and str(item.get("last_delivery_error") or "").strip():
            last_delivery_error = {
                "event_id": str(item.get("event_id") or "").strip(),
                "message": str(item.get("last_delivery_error") or "").strip(),
                "last_attempted_at": item.get("last_attempted_at"),
                "retry_count": retry_count,
            }
    return {
        "pending_count": len(items),
        "retry_count_total": retry_total,
        "max_retry_count": max_retry,
        "pending_by_channel": by_channel,
        "last_delivery_error": last_delivery_error,
    }


def _enforce_workspace_operator_access(
    *,
    current_user: Dict[str, Any] | None,
    workspace_id: str,
) -> str:
    resolved_workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="viewer",
    )
    raw_workspace_access = _coerce_dict((current_user or {}).get("workspace_access"))
    workspace_access = auth_module.workspace_access_map(current_user)
    workspace_entry = _coerce_dict(raw_workspace_access.get(resolved_workspace_id)) or _coerce_dict(
        workspace_access.get(resolved_workspace_id)
    )
    workspace_role = str(
        workspace_entry.get("role")
        or auth_module.workspace_role(current_user, resolved_workspace_id)
        or ""
    ).strip().lower()
    if workspace_role in {"owner", "admin"}:
        return resolved_workspace_id
    if bool((current_user or {}).get("is_admin")):
        return resolved_workspace_id
    raise HTTPException(
        status_code=403,
        detail=f"Admin or owner role required for workspace '{resolved_workspace_id}'.",
    )


async def build_workspace_channel_operations(
    *,
    current_user: Dict[str, Any] | None,
    workspace_id: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_workspace_operator_access(
        current_user=current_user,
        workspace_id=workspace_id,
    )

    telegram_status_payload, whatsapp_status_payload = await handle_telegram_autopilot_status(), await handle_whatsapp_autopilot_status()
    recent_events = _filter_recent_channel_events(workspace_id=resolved_workspace_id, limit=40)
    pairing_failures = _filter_pairing_failures(recent_events, limit=20)
    dead_letters = _workspace_dead_letters(workspace_id=resolved_workspace_id, limit=20)

    runtime_outbox_summary = await run_state_repository.get_outbox_delivery_status()
    pending_outbox_items = await run_state_repository.list_undelivered_outbox_events(
        older_than_seconds=0,
        limit=200,
    )
    workspace_pending_deliveries = [
        item
        for item in pending_outbox_items
        if _normalize_workspace_token(item.get("workspace_id")) == resolved_workspace_id
        and str(item.get("event_type") or "").strip() == "channel_run_delivery"
        and _normalize_channel_token(_coerce_dict(item.get("payload")).get("channel")) in CHANNEL_PROVIDERS
    ]

    return {
        "ok": True,
        "workspace_id": resolved_workspace_id,
        "generated_at": _utc_now_iso(),
        "channels": {
            "telegram": _workspace_channel_payload(
                provider="telegram",
                workspace_id=resolved_workspace_id,
                payload=_coerce_dict(telegram_status_payload),
            ),
            "whatsapp": _workspace_channel_payload(
                provider="whatsapp",
                workspace_id=resolved_workspace_id,
                payload=_coerce_dict(whatsapp_status_payload),
            ),
        },
        "delivery": {
            "runtime_summary": _coerce_dict(runtime_outbox_summary),
            "workspace_summary": _workspace_pending_delivery_summary(workspace_pending_deliveries),
            "pending": workspace_pending_deliveries,
            "dead_letters": dead_letters,
        },
        "events": {
            "recent": recent_events,
            "pairing_failures": pairing_failures,
        },
    }
