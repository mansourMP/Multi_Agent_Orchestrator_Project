from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules import approval_contracts
from server_modules import rust_runtime_kernel_client
from server_modules import workspace_context

APPROVAL_TOKEN_PREFIX = "sap_"
APPROVAL_TTL_MINUTES = 15
APPROVAL_STATUSES = ("pending", "approved", "rejected", "expired", "consumed")

SUPPORTED_ACTIONS = {
    "channel_send_draft": {
        "label": "Send channel message draft",
        "description": "Sends a draft message through the connected channel",
        "required_fields": ("channel", "recipient", "message_text"),
    },
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


class SageApprovalRustGateError(RuntimeError):
    pass


def _enforce_sage_approval_state_decision(
    *,
    operation: str,
    workspace_id: str,
    payload: dict,
    status: str = "pending",
    actor_id: str = "",
    trace_id: str = "",
) -> dict:
    normalized_payload = payload if isinstance(payload, dict) else {}
    try:
        payload_bytes = len(
            json.dumps(
                normalized_payload,
                ensure_ascii=False,
                sort_keys=True,
                default=str,
            ).encode("utf-8")
        )
        decision = rust_runtime_kernel_client.runtime_state_store_decision(
            operation=operation,
            state_class="sage_approvals",
            workspace_id=_coerce_text(workspace_id),
            actor_id=_coerce_text(actor_id),
            trace_id=_coerce_text(trace_id),
            status=_coerce_text(status) or "pending",
            payload=normalized_payload,
            payload_bytes=payload_bytes,
            workspace_access=True,
            owner_access=True,
        )
        rust_runtime_kernel_client.enforce_kernel_decision(
            "runtime-state-store-decision",
            decision,
        )
        next_action = _coerce_text(decision.get("next_action"))
        if next_action != _coerce_text(operation):
            raise SageApprovalRustGateError("unexpected_next_action")
        return decision
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        raise SageApprovalRustGateError(exc.reason) from exc


@dataclass(frozen=False, slots=True)
class SageApprovalRecord:
    approval_token: str
    workspace_id: str
    tenant_id: str
    trace_id: str
    action: str
    description: str
    action_payload_snapshot: str
    action_payload: dict = field(default_factory=dict)
    requester_actor: str = ""
    status: str = "pending"
    created_at: str = ""
    expires_at: str = ""
    resolved_at: Optional[str] = None
    resolution_reason: Optional[str] = None
    resolution_actor: Optional[str] = None

    def is_pending(self) -> bool:
        return self.status == "pending"

    def is_terminal(self) -> bool:
        return self.status in ("approved", "rejected", "expired")

    def is_expired(self) -> bool:
        if self.expires_at:
            try:
                expiry = datetime.fromisoformat(self.expires_at.replace("Z", "+00:00"))
                return _utc_now() >= expiry
            except (ValueError, TypeError):
                pass
        return False

    def as_dict(self) -> dict:
        payload = {
            "approval_token": self.approval_token,
            "approval_id": self.approval_token,
            "id": self.approval_token,
            "workspace_id": self.workspace_id,
            "tenant_id": self.tenant_id,
            "trace_id": self.trace_id,
            "action": self.action,
            "description": self.description,
            "action_payload_snapshot": self.action_payload_snapshot,
            "requester_actor": self.requester_actor,
            "status": self.status,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "resolved_at": self.resolved_at,
            "resolution_reason": self.resolution_reason,
            "resolution_actor": self.resolution_actor,
        }
        return approval_contracts.attach_normalized_approval(
            payload,
            approval_contracts.normalize_sage_approval(payload),
        )


def _state_file(workspace_id: str) -> Path:
    return workspace_context.workspace_scope_dir(workspace_id) / "sage_approvals.json"


def _default_state() -> dict:
    return {"version": 1, "updated_at": _utc_now_iso(), "records": {}}


def _read_state(workspace_id: str) -> dict:
    path = _state_file(workspace_id)
    if not path.exists():
        return _default_state()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    if not isinstance(raw.get("records"), dict):
        raw["records"] = {}
    return raw


def _write_state(workspace_id: str, payload: dict) -> dict:
    path = _state_file(workspace_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = _utc_now_iso()
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def _generate_token() -> str:
    return APPROVAL_TOKEN_PREFIX + uuid.uuid4().hex


def _hash_payload(payload: dict) -> str:
    import hashlib

    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def create_approval(
    *,
    workspace_id: str,
    tenant_id: str,
    trace_id: str,
    action: str,
    description: str,
    action_payload: dict,
    requester_actor: str = "",
) -> SageApprovalRecord:
    if action not in SUPPORTED_ACTIONS:
        raise ValueError(f"Unsupported approval action: {action}")
    if not isinstance(action_payload, dict):
        raise ValueError("action_payload must be an object")
    required_fields = SUPPORTED_ACTIONS[action]["required_fields"]
    missing = [field for field in required_fields if not _coerce_text(action_payload.get(field))]
    if missing:
        raise ValueError(f"Missing required action_payload fields: {', '.join(missing)}")

    normalized_workspace_id = _coerce_text(workspace_id)
    if not normalized_workspace_id:
        raise ValueError("workspace_id is required")

    now = _utc_now()
    token = _generate_token()
    record = SageApprovalRecord(
        approval_token=token,
        workspace_id=normalized_workspace_id,
        tenant_id=_coerce_text(tenant_id),
        trace_id=_coerce_text(trace_id),
        action=action,
        description=_coerce_text(description) or SUPPORTED_ACTIONS[action]["description"],
        action_payload_snapshot=_hash_payload(action_payload),
        action_payload=dict(action_payload),
        requester_actor=_coerce_text(requester_actor),
        status="pending",
        created_at=now.isoformat().replace("+00:00", "Z"),
        expires_at=(now + timedelta(minutes=APPROVAL_TTL_MINUTES)).isoformat().replace("+00:00", "Z"),
    )

    try:
        state = _read_state(normalized_workspace_id)
        record_payload = record.as_dict()
        state["records"][token] = record_payload
        _enforce_sage_approval_state_decision(
            operation="create_sage_approval",
            workspace_id=normalized_workspace_id,
            payload=record_payload,
            status=record.status,
            actor_id=record.requester_actor,
            trace_id=record.trace_id,
        )
        _write_state(normalized_workspace_id, state)
    except SageApprovalRustGateError:
        raise
    except Exception:
        raise RuntimeError("Failed to persist approval record.")

    return record


def get_approval(*, approval_token: str, workspace_id: str) -> SageApprovalRecord | None:
    normalized_token = _coerce_text(approval_token)
    if not normalized_token or not normalized_token.startswith(APPROVAL_TOKEN_PREFIX):
        return None

    state = _read_state(_coerce_text(workspace_id))
    raw = state.get("records", {}).get(normalized_token)
    if not isinstance(raw, dict):
        return None

    record = SageApprovalRecord(
        approval_token=_coerce_text(raw.get("approval_token")),
        workspace_id=_coerce_text(raw.get("workspace_id")),
        tenant_id=_coerce_text(raw.get("tenant_id")),
        trace_id=_coerce_text(raw.get("trace_id")),
        action=_coerce_text(raw.get("action")),
        description=_coerce_text(raw.get("description")),
        action_payload_snapshot=_coerce_text(raw.get("action_payload_snapshot")),
        action_payload=raw.get("action_payload") if isinstance(raw.get("action_payload"), dict) else {},
        requester_actor=_coerce_text(raw.get("requester_actor")),
        status=_coerce_text(raw.get("status")) or "pending",
        created_at=_coerce_text(raw.get("created_at")),
        expires_at=_coerce_text(raw.get("expires_at")),
        resolved_at=_coerce_text(raw.get("resolved_at")) or None,
        resolution_reason=_coerce_text(raw.get("resolution_reason")) or None,
        resolution_actor=_coerce_text(raw.get("resolution_actor")) or None,
    )
    return record


def _update_record(*, workspace_id: str, record: SageApprovalRecord, operation: str) -> SageApprovalRecord:
    try:
        state = _read_state(workspace_id)
        record_payload = record.as_dict()
        state["records"][record.approval_token] = record_payload
        _enforce_sage_approval_state_decision(
            operation=operation,
            workspace_id=workspace_id,
            payload=record_payload,
            status=record.status,
            actor_id=record.resolution_actor or record.requester_actor,
            trace_id=record.trace_id,
        )
        _write_state(workspace_id, state)
    except SageApprovalRustGateError:
        raise
    except Exception:
        raise RuntimeError("Failed to update approval record.")
    return record


def resolve_approval(
    *,
    approval_token: str,
    workspace_id: str,
    status: str,
    resolution_actor: str = "",
    resolution_reason: str = "",
) -> SageApprovalRecord:
    if status not in ("approved", "rejected"):
        raise ValueError(f"Invalid resolution status: {status}")

    record = get_approval(approval_token=approval_token, workspace_id=workspace_id)
    if record is None:
        raise ValueError("Approval token not found.")

    if record.is_terminal():
        raise ValueError(f"Approval is already {record.status}.")

    if record.is_expired():
        record.status = "expired"
        record.resolved_at = _utc_now_iso()
        _update_record(workspace_id=workspace_id, record=record, operation="expire_sage_approvals")
        raise ValueError("Approval token has expired.")

    if _coerce_text(record.workspace_id) != _coerce_text(workspace_id):
        raise ValueError("Approval token does not belong to this workspace.")
    if _coerce_text(record.requester_actor) and _coerce_text(resolution_actor):
        if _coerce_text(record.requester_actor) != _coerce_text(resolution_actor):
            raise ValueError("Approval token requester does not match resolution actor.")

    record.status = status
    record.resolved_at = _utc_now_iso()
    record.resolution_actor = _coerce_text(resolution_actor)
    record.resolution_reason = _coerce_text(resolution_reason)
    return _update_record(workspace_id=workspace_id, record=record, operation="resolve_sage_approval")


def consume_approval(
    *,
    approval_token: str,
    workspace_id: str,
) -> SageApprovalRecord:
    """Mark an approved token as consumed after successful execution."""
    record = get_approval(approval_token=approval_token, workspace_id=workspace_id)
    if record is None:
        raise ValueError("Approval token not found.")
    if record.status != "approved":
        raise ValueError(f"Cannot consume approval in status: {record.status}")
    if record.is_expired():
        record.status = "expired"
        record.resolved_at = _utc_now_iso()
        _update_record(workspace_id=workspace_id, record=record, operation="expire_sage_approvals")
        raise ValueError("Approval token has expired.")
    if record.resolution_actor and record.requester_actor and record.resolution_actor != record.requester_actor:
        raise ValueError("Approval token actor binding is invalid.")
    record.status = "consumed"
    record.resolved_at = _utc_now_iso()
    return _update_record(workspace_id=workspace_id, record=record, operation="consume_sage_approval")


def expire_stale_approvals(*, workspace_id: str) -> int:
    state = _read_state(_coerce_text(workspace_id))
    expired_count = 0
    for token, raw in list(state.get("records", {}).items()):
        if not isinstance(raw, dict):
            continue
        if raw.get("status") != "pending":
            continue
        expires_at = _coerce_text(raw.get("expires_at"))
        if not expires_at:
            continue
        try:
            expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if _utc_now() >= expiry:
                raw["status"] = "expired"
                raw["resolved_at"] = _utc_now_iso()
                expired_count += 1
        except (ValueError, TypeError):
            pass
    if expired_count:
        _enforce_sage_approval_state_decision(
            operation="expire_sage_approvals",
            workspace_id=workspace_id,
            payload={"expired_count": expired_count, "records": state.get("records", {})},
            status="expired",
        )
        _write_state(_coerce_text(workspace_id), state)
    return expired_count


def list_pending_approvals(*, workspace_id: str) -> list[dict]:
    expire_stale_approvals(workspace_id=workspace_id)
    state = _read_state(_coerce_text(workspace_id))
    pending: list[dict] = []
    for token, raw in state.get("records", {}).items():
        if not isinstance(raw, dict):
            continue
        if raw.get("status") == "pending":
            item = {
                "approval_token": _coerce_text(raw.get("approval_token")),
                "approval_id": _coerce_text(raw.get("approval_token")),
                "id": _coerce_text(raw.get("approval_token")),
                "action": _coerce_text(raw.get("action")),
                "description": _coerce_text(raw.get("description")),
                "prompt": _coerce_text(raw.get("description")),
                "status": _coerce_text(raw.get("status")),
                "created_at": _coerce_text(raw.get("created_at")),
                "expires_at": _coerce_text(raw.get("expires_at")),
                "trace_id": _coerce_text(raw.get("trace_id")),
            }
            pending.append(approval_contracts.attach_normalized_approval(
                item,
                approval_contracts.normalize_sage_approval(item),
            ))
    return pending
