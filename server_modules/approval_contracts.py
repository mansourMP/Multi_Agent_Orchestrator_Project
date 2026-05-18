from __future__ import annotations

from typing import Any, Mapping


def _text(value: Any) -> str:
    return str(value or "").strip()


def _dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _approval_id(raw: Mapping[str, Any]) -> str:
    return (
        _text(raw.get("id"))
        or _text(raw.get("approval_id"))
        or _text(raw.get("approval_token"))
        or _text(raw.get("code"))
        or _text(raw.get("approval_code"))
    )


def _approval_action(raw: Mapping[str, Any], request_payload: Mapping[str, Any], metadata: Mapping[str, Any]) -> str:
    return (
        _text(raw.get("action"))
        or _text(raw.get("capability_id"))
        or _text(request_payload.get("action"))
        or _text(request_payload.get("capability_id"))
        or _text(metadata.get("kind"))
        or _text(metadata.get("action_class"))
        or "Approval required"
    )


def _approval_risk(raw: Mapping[str, Any], request_payload: Mapping[str, Any], metadata: Mapping[str, Any]) -> str:
    return (
        _text(raw.get("risk"))
        or _text(raw.get("risk_level"))
        or _text(request_payload.get("risk"))
        or _text(metadata.get("risk"))
        or _text(metadata.get("risk_level"))
        or "approval_required"
    )


def _approval_actor(raw: Mapping[str, Any], request_payload: Mapping[str, Any], metadata: Mapping[str, Any]) -> str | None:
    actor = (
        _text(raw.get("actor"))
        or _text(raw.get("user_id"))
        or _text(raw.get("owner_user_id"))
        or _text(raw.get("requester_actor"))
        or _text(request_payload.get("actor"))
        or _text(metadata.get("actor"))
    )
    return actor or None


def _approval_expires_at(raw: Mapping[str, Any], request_payload: Mapping[str, Any]) -> str | None:
    expires_at = _text(raw.get("expires_at")) or _text(request_payload.get("expires_at"))
    return expires_at or None


def normalize_approval_payload(
    raw_approval: Mapping[str, Any] | None,
    *,
    source: str,
    channel: str = "web",
    action: str | None = None,
    risk: str | None = None,
    run_id: str | None = None,
    actor: str | None = None,
    approve_path: str | None = None,
    deny_path: str | None = None,
) -> dict[str, Any]:
    raw = _dict(raw_approval)
    request_payload = _dict(raw.get("request_payload"))
    metadata = _dict(raw.get("metadata"))
    approval_id = _approval_id(raw)
    code = _text(raw.get("code")) or _text(raw.get("approval_code")) or approval_id
    resolved_run_id = _text(run_id) or _text(raw.get("run_id")) or _text(request_payload.get("run_id")) or None
    resolved_actor = _text(actor) or _approval_actor(raw, request_payload, metadata)
    resolved_action = _text(action) or _approval_action(raw, request_payload, metadata)
    resolved_risk = _text(risk) or _approval_risk(raw, request_payload, metadata)
    resolved_channel = _text(channel) or _text(raw.get("channel")) or "web"
    approve = _text(approve_path) or None
    deny = _text(deny_path) or approve
    return {
        "id": approval_id,
        "approval_id": approval_id,
        "code": code,
        "action": resolved_action,
        "risk": resolved_risk,
        "expires_at": _approval_expires_at(raw, request_payload),
        "channel": resolved_channel,
        "run_id": resolved_run_id,
        "actor": resolved_actor,
        "approve_path": approve,
        "deny_path": deny,
        "source": _text(source) or "approval",
        "status": _text(raw.get("status")) or "pending",
    }


def normalize_runtime_approval(raw_approval: Mapping[str, Any] | None, *, channel: str = "web") -> dict[str, Any]:
    raw = _dict(raw_approval)
    approval_id = _approval_id(raw)
    run_id = _text(raw.get("run_id"))
    path = (
        f"/api/runs/{run_id}/approvals/{approval_id}/resolve"
        if run_id and approval_id
        else f"/api/approvals/{approval_id}/resolve"
        if approval_id
        else None
    )
    return normalize_approval_payload(
        raw,
        source="runtime_run",
        channel=channel,
        approve_path=path,
        deny_path=path,
    )


def normalize_gateway_approval(raw_approval: Mapping[str, Any] | None, *, channel: str = "web") -> dict[str, Any]:
    raw = _dict(raw_approval)
    approval_id = _approval_id(raw)
    gateway_id = _text(raw.get("gateway_id"))
    path = (
        f"/api/gateway/registrations/{gateway_id}/approvals/{approval_id}/resolve"
        if gateway_id and approval_id
        else None
    )
    return normalize_approval_payload(
        raw,
        source="gateway",
        channel=channel,
        approve_path=path,
        deny_path=path,
    )


def normalize_sage_approval(raw_approval: Mapping[str, Any] | None, *, channel: str = "web") -> dict[str, Any]:
    raw = _dict(raw_approval)
    approval_id = _approval_id(raw)
    approve_path = f"/api/sage/approvals/approve" if approval_id else None
    deny_path = f"/api/sage/approvals/reject" if approval_id else None
    return normalize_approval_payload(
        raw,
        source="sage",
        channel=channel,
        approve_path=approve_path,
        deny_path=deny_path,
    )


def attach_normalized_approval(
    raw_approval: Mapping[str, Any] | None,
    normalized: Mapping[str, Any],
) -> dict[str, Any]:
    payload = _dict(raw_approval)
    normalized_payload = dict(normalized)
    payload["normalized_approval"] = normalized_payload
    for key in ("id", "approval_id", "code", "action", "risk", "channel", "approve_path", "deny_path"):
        if not _text(payload.get(key)):
            payload[key] = normalized_payload.get(key)
    return payload


def channel_approval_instruction(
    normalized_approval: Mapping[str, Any],
    *,
    channel_key: str,
) -> dict[str, Any]:
    code = _text(normalized_approval.get("code"))
    expires_at = _text(normalized_approval.get("expires_at"))
    instruction = (
        f"Reply approve {code} or deny {code}."
        if code
        else "Open Empyralis to approve or deny this action."
    )
    if expires_at:
        instruction = f"{instruction} Expires at {expires_at}."
    return {
        "channel_key": _text(channel_key),
        "approval_code": code,
        "approve_text": f"approve {code}" if code else "",
        "deny_text": f"deny {code}" if code else "",
        "instruction": instruction,
        "expires_at": expires_at or None,
        "approval": dict(normalized_approval),
    }
