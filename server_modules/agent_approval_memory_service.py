from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional
from urllib.parse import urlparse

from server_modules import rust_runtime_kernel_client
from server_modules import workspace_context
from server_modules.capability_risk_classifier_service import normalize_capability_for_risk


APPROVAL_MEMORY_RULE_PREFIX = "amr_"
APPROVAL_MEMORY_DEFAULT_TTL_SECONDS = 3600
APPROVAL_MEMORY_MAX_TTL_SECONDS = 24 * 60 * 60
APPROVAL_MEMORY_DEFAULT_MAX_USES = 10
APPROVAL_MEMORY_MAX_USES = 100

RULE_ACTIVE = "active"
RULE_REVOKED = "revoked"
RULE_EXPIRED = "expired"

REMEMBERABLE_CAPABILITIES = {
    "browser.click",
    "browser.form_submit",
    "file.read",
    "file.write",
    "terminal.approved_script",
    "communication.send",
    "memory.write",
    "scheduler.create",
    "cloud_storage.access",
}

NEVER_REMEMBER_CAPABILITIES = {
    "credential.access",
    "install.software",
    "install.extension",
    "system.change_setting",
    "system.change_permission",
    "commerce.payment",
    "production.deploy",
    "terminal.command",
    "file.delete",
}


class AgentApprovalMemoryError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class AgentApprovalMemoryRule:
    rule_id: str
    workspace_id: str
    owner_user_id: str
    capability: str
    policy_id: str = ""
    profile_id: str = ""
    gateway_id: str = ""
    target_domain: str = ""
    target_path_prefix: str = ""
    target_channel: str = ""
    target_recipient: str = ""
    reason: str = ""
    status: str = RULE_ACTIVE
    max_uses: int = APPROVAL_MEMORY_DEFAULT_MAX_USES
    use_count: int = 0
    created_at: str = ""
    updated_at: str = ""
    expires_at: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "workspace_id": self.workspace_id,
            "owner_user_id": self.owner_user_id,
            "capability": self.capability,
            "policy_id": self.policy_id,
            "profile_id": self.profile_id,
            "gateway_id": self.gateway_id,
            "target_domain": self.target_domain,
            "target_path_prefix": self.target_path_prefix,
            "target_channel": self.target_channel,
            "target_recipient": self.target_recipient,
            "reason": self.reason,
            "status": self.status,
            "max_uses": self.max_uses,
            "use_count": self.use_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "expires_at": self.expires_at,
            "metadata": dict(self.metadata),
        }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _lower(value: Any) -> str:
    return _coerce_text(value).lower()


def _generate_rule_id() -> str:
    return APPROVAL_MEMORY_RULE_PREFIX + uuid.uuid4().hex


def _enforce_approval_memory_state_decision(*, operation: str, rule: AgentApprovalMemoryRule) -> Dict[str, Any]:
    rule_payload = rule.as_dict()
    payload = {
        "operation": operation,
        "state_class": "agent_approval_memory",
        "storage_engine": "durable_postgres",
        "tenant_id": rule.workspace_id,
        "workspace_id": rule.workspace_id,
        "actor_id": rule.owner_user_id,
        "status": rule.status,
        "payload": rule_payload,
        "payload_bytes": len(json.dumps(rule_payload, sort_keys=True).encode("utf-8")),
        "workspace_access": True,
        "owner_access": True,
        "destructive_approval": True,
    }
    try:
        decision = rust_runtime_kernel_client.run_runtime_kernel_enforced(
            "runtime-state-store-decision",
            payload,
        )
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        result = getattr(exc, "result", None)
        if not isinstance(result, dict):
            result = {}
        raise RuntimeError(
            result.get("reason")
            or f"Rust runtime state store denied approval memory operation: {operation}"
        ) from exc
    expected_next_action = {
        "upsert_approval_memory_rule": "write_approval_memory_rule",
        "consume_approval_memory_rule": "consume_approval_memory_rule",
    }.get(operation, operation)
    next_action = str(decision.get("next_action") or "").strip()
    if next_action != expected_next_action:
        raise RuntimeError(
            f"Rust runtime state store returned unexpected next_action for approval memory operation {operation}: {next_action or 'missing'}"
        )
    return decision


def _state_file(workspace_id: str) -> Path:
    return workspace_context.workspace_scope_dir(workspace_id) / "agent_approval_memory.json"


def _default_state() -> Dict[str, Any]:
    return {"version": 1, "updated_at": _utc_now_iso(), "rules": {}}


def _read_state(workspace_id: str) -> Dict[str, Any]:
    path = _state_file(workspace_id)
    if not path.exists():
        payload = _default_state()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Failed to read approval memory state.") from exc
    if not isinstance(raw, dict):
        raise RuntimeError("Approval memory state must be an object.")
    if not isinstance(raw.get("rules"), dict):
        raw["rules"] = {}
    return raw


def _write_state(workspace_id: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
    path = _state_file(workspace_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    next_payload = dict(payload)
    next_payload["updated_at"] = _utc_now_iso()
    path.write_text(json.dumps(next_payload, indent=2), encoding="utf-8")
    return next_payload


def _parse_time(value: Any) -> Optional[datetime]:
    token = _coerce_text(value)
    if not token:
        return None
    try:
        return datetime.fromisoformat(token.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _domain_from_url(value: Any) -> str:
    raw = _coerce_text(value)
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return _lower(parsed.hostname)


def _normalize_domain(value: Any) -> str:
    return _domain_from_url(value) or _lower(value)


def _derive_scope_from_payload(payload: Mapping[str, Any] | None) -> Dict[str, str]:
    data = dict(payload or {})
    action_args = data.get("action_args") if isinstance(data.get("action_args"), Mapping) else {}
    merged = {**data, **dict(action_args)}
    return {
        "target_domain": _normalize_domain(merged.get("url") or merged.get("target_url") or merged.get("domain")),
        "target_path_prefix": _coerce_text(merged.get("path") or merged.get("target_path") or merged.get("path_prefix")),
        "target_channel": _lower(merged.get("channel")),
        "target_recipient": _lower(merged.get("recipient") or merged.get("to")),
    }


def _normalize_rule(payload: Mapping[str, Any]) -> AgentApprovalMemoryRule:
    data = dict(payload or {})
    workspace_id = _coerce_text(data.get("workspace_id"))
    owner_user_id = _coerce_text(data.get("owner_user_id"))
    capability = normalize_capability_for_risk(data.get("capability"))
    if not workspace_id:
        raise AgentApprovalMemoryError("workspace_id is required.")
    if not owner_user_id:
        raise AgentApprovalMemoryError("owner_user_id is required.")
    if capability in NEVER_REMEMBER_CAPABILITIES or capability not in REMEMBERABLE_CAPABILITIES:
        raise AgentApprovalMemoryError(f"Capability cannot be remembered: {capability}")

    ttl_seconds = int(data.get("ttl_seconds") or APPROVAL_MEMORY_DEFAULT_TTL_SECONDS)
    ttl_seconds = max(60, min(ttl_seconds, APPROVAL_MEMORY_MAX_TTL_SECONDS))
    now = _utc_now()
    created_at = _coerce_text(data.get("created_at")) or now.isoformat().replace("+00:00", "Z")
    expires_at = _coerce_text(data.get("expires_at")) or (now + timedelta(seconds=ttl_seconds)).isoformat().replace("+00:00", "Z")
    expires = _parse_time(expires_at)
    if expires is None or expires <= now:
        raise AgentApprovalMemoryError("Approval memory rule must expire in the future.")
    if (expires - now).total_seconds() > APPROVAL_MEMORY_MAX_TTL_SECONDS + 1:
        raise AgentApprovalMemoryError("Approval memory TTL exceeds maximum allowed duration.")

    target_domain = _normalize_domain(data.get("target_domain") or data.get("domain"))
    target_path_prefix = _coerce_text(data.get("target_path_prefix") or data.get("path_prefix"))
    target_channel = _lower(data.get("target_channel") or data.get("channel"))
    target_recipient = _lower(data.get("target_recipient") or data.get("recipient"))
    if capability.startswith("browser.") and not target_domain:
        raise AgentApprovalMemoryError("Browser approval memory requires target_domain.")
    if capability.startswith("file.") and not target_path_prefix:
        raise AgentApprovalMemoryError("File approval memory requires target_path_prefix.")
    if capability == "communication.send" and not (target_channel and target_recipient):
        raise AgentApprovalMemoryError("Communication approval memory requires target_channel and target_recipient.")
    if not any([target_domain, target_path_prefix, target_channel and target_recipient]):
        raise AgentApprovalMemoryError("Approval memory requires a narrow target scope.")

    max_uses = int(data.get("max_uses") or APPROVAL_MEMORY_DEFAULT_MAX_USES)
    max_uses = max(1, min(max_uses, APPROVAL_MEMORY_MAX_USES))
    return AgentApprovalMemoryRule(
        rule_id=_coerce_text(data.get("rule_id")) or _generate_rule_id(),
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        capability=capability,
        policy_id=_coerce_text(data.get("policy_id")),
        profile_id=_coerce_text(data.get("profile_id")),
        gateway_id=_coerce_text(data.get("gateway_id")),
        target_domain=target_domain,
        target_path_prefix=target_path_prefix,
        target_channel=target_channel,
        target_recipient=target_recipient,
        reason=_coerce_text(data.get("reason")),
        status=_coerce_text(data.get("status")) or RULE_ACTIVE,
        max_uses=max_uses,
        use_count=max(int(data.get("use_count") or 0), 0),
        created_at=created_at,
        updated_at=_coerce_text(data.get("updated_at")) or created_at,
        expires_at=expires_at,
        metadata=dict(data.get("metadata") or {}) if isinstance(data.get("metadata"), Mapping) else {},
    )


def create_approval_memory_rule(
    *,
    workspace_id: str,
    owner_user_id: str,
    capability: Any,
    ttl_seconds: int = APPROVAL_MEMORY_DEFAULT_TTL_SECONDS,
    policy_id: str = "",
    profile_id: str = "",
    gateway_id: str = "",
    target_domain: str = "",
    target_path_prefix: str = "",
    target_channel: str = "",
    target_recipient: str = "",
    reason: str = "",
    max_uses: int = APPROVAL_MEMORY_DEFAULT_MAX_USES,
    metadata: Optional[Mapping[str, Any]] = None,
) -> AgentApprovalMemoryRule:
    rule = _normalize_rule(
        {
            "workspace_id": workspace_id,
            "owner_user_id": owner_user_id,
            "capability": capability,
            "ttl_seconds": ttl_seconds,
            "policy_id": policy_id,
            "profile_id": profile_id,
            "gateway_id": gateway_id,
            "target_domain": target_domain,
            "target_path_prefix": target_path_prefix,
            "target_channel": target_channel,
            "target_recipient": target_recipient,
            "reason": reason,
            "max_uses": max_uses,
            "metadata": dict(metadata or {}),
        }
    )
    try:
        state = _read_state(rule.workspace_id)
        state.setdefault("rules", {})[rule.rule_id] = rule.as_dict()
        _enforce_approval_memory_state_decision(operation="upsert_approval_memory_rule", rule=rule)
        _write_state(rule.workspace_id, state)
    except Exception as exc:
        raise RuntimeError("Failed to persist approval memory rule.") from exc
    return rule


def create_approval_memory_rule_from_payload(
    *,
    workspace_id: str,
    owner_user_id: str,
    capability: Any,
    payload: Mapping[str, Any] | None,
    ttl_seconds: int,
    policy_id: str = "",
    profile_id: str = "",
    gateway_id: str = "",
    remember_scope: Optional[Mapping[str, Any]] = None,
    reason: str = "",
) -> AgentApprovalMemoryRule:
    derived = _derive_scope_from_payload(payload)
    scope = {**derived, **dict(remember_scope or {})}
    return create_approval_memory_rule(
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        capability=capability,
        ttl_seconds=ttl_seconds,
        policy_id=policy_id,
        profile_id=profile_id,
        gateway_id=gateway_id,
        target_domain=_coerce_text(scope.get("target_domain") or scope.get("domain")),
        target_path_prefix=_coerce_text(scope.get("target_path_prefix") or scope.get("path_prefix")),
        target_channel=_coerce_text(scope.get("target_channel") or scope.get("channel")),
        target_recipient=_coerce_text(scope.get("target_recipient") or scope.get("recipient")),
        reason=reason,
        metadata={"source": "gateway_approval_resolution"},
    )


def _rule_matches(
    rule: AgentApprovalMemoryRule,
    *,
    owner_user_id: str,
    agent_id: str = "",
    capability: str,
    policy_id: str = "",
    profile_id: str = "",
    gateway_id: str = "",
    target_domain: str = "",
    target_path: str = "",
    target_channel: str = "",
    target_recipient: str = "",
) -> bool:
    if rule.status != RULE_ACTIVE:
        return False
    expires = _parse_time(rule.expires_at)
    if expires is None or expires <= _utc_now():
        return False
    if rule.use_count >= rule.max_uses:
        return False
    if rule.owner_user_id != _coerce_text(owner_user_id):
        return False
    requested_agent_id = _coerce_text(agent_id)
    rule_agent_id = _coerce_text(rule.metadata.get("agent_id") if isinstance(rule.metadata, Mapping) else "")
    if requested_agent_id and rule_agent_id != requested_agent_id:
        return False
    if rule.capability != capability:
        return False
    if rule.policy_id and rule.policy_id != _coerce_text(policy_id):
        return False
    if rule.profile_id and rule.profile_id != _coerce_text(profile_id):
        return False
    if rule.gateway_id and rule.gateway_id != _coerce_text(gateway_id):
        return False
    domain = _normalize_domain(target_domain)
    if rule.target_domain and not (domain == rule.target_domain or domain.endswith(f".{rule.target_domain}")):
        return False
    path = _coerce_text(target_path)
    if rule.target_path_prefix and not path.startswith(rule.target_path_prefix):
        return False
    if rule.target_channel and rule.target_channel != _lower(target_channel):
        return False
    if rule.target_recipient and rule.target_recipient != _lower(target_recipient):
        return False
    return True


def find_matching_approval_memory_rule(
    *,
    workspace_id: str,
    owner_user_id: str,
    agent_id: str = "",
    capability: Any,
    policy_id: str = "",
    profile_id: str = "",
    gateway_id: str = "",
    target_domain: str = "",
    target_path: str = "",
    target_channel: str = "",
    target_recipient: str = "",
    payload: Optional[Mapping[str, Any]] = None,
) -> AgentApprovalMemoryRule | None:
    workspace = _coerce_text(workspace_id)
    normalized_capability = normalize_capability_for_risk(capability)
    derived = _derive_scope_from_payload(payload)
    domain = _coerce_text(target_domain) or derived["target_domain"]
    path = _coerce_text(target_path) or derived["target_path_prefix"]
    channel = _coerce_text(target_channel) or derived["target_channel"]
    recipient = _coerce_text(target_recipient) or derived["target_recipient"]
    for raw in _read_state(workspace).get("rules", {}).values():
        if not isinstance(raw, Mapping):
            continue
        try:
            rule = _normalize_rule(raw)
        except AgentApprovalMemoryError:
            continue
        if rule.workspace_id != workspace:
            continue
        if _rule_matches(
            rule,
            owner_user_id=owner_user_id,
            agent_id=agent_id,
            capability=normalized_capability,
            policy_id=policy_id,
            profile_id=profile_id,
            gateway_id=gateway_id,
            target_domain=domain,
            target_path=path,
            target_channel=channel,
            target_recipient=recipient,
        ):
            return rule
    return None


def consume_matching_approval_memory_rule(
    *,
    workspace_id: str,
    owner_user_id: str,
    agent_id: str = "",
    capability: Any,
    policy_id: str = "",
    profile_id: str = "",
    gateway_id: str = "",
    target_domain: str = "",
    target_path: str = "",
    target_channel: str = "",
    target_recipient: str = "",
    payload: Optional[Mapping[str, Any]] = None,
) -> AgentApprovalMemoryRule | None:
    rule = find_matching_approval_memory_rule(
        workspace_id=workspace_id,
        owner_user_id=owner_user_id,
        agent_id=agent_id,
        capability=capability,
        policy_id=policy_id,
        profile_id=profile_id,
        gateway_id=gateway_id,
        target_domain=target_domain,
        target_path=target_path,
        target_channel=target_channel,
        target_recipient=target_recipient,
        payload=payload,
    )
    if rule is None:
        return None
    state = _read_state(rule.workspace_id)
    current = state.get("rules", {}).get(rule.rule_id)
    if not isinstance(current, Mapping):
        return None
    updated = _normalize_rule({**dict(current), "use_count": rule.use_count + 1, "updated_at": _utc_now_iso()})
    state["rules"][updated.rule_id] = updated.as_dict()
    try:
        _enforce_approval_memory_state_decision(operation="consume_approval_memory_rule", rule=updated)
        _write_state(updated.workspace_id, state)
    except Exception as exc:
        raise RuntimeError("Failed to consume approval memory rule.") from exc
    return updated


def list_approval_memory_rules(*, workspace_id: str) -> List[Dict[str, Any]]:
    workspace = _coerce_text(workspace_id)
    if not workspace:
        return []
    items: List[Dict[str, Any]] = []
    for raw in _read_state(workspace).get("rules", {}).values():
        if not isinstance(raw, Mapping):
            continue
        try:
            rule = _normalize_rule(raw)
        except AgentApprovalMemoryError:
            continue
        if rule.workspace_id == workspace:
            items.append(rule.as_dict())
    return sorted(items, key=lambda item: (str(item.get("created_at") or ""), str(item.get("rule_id") or "")))
