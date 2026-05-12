from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping, Optional
from urllib.parse import urlparse

from server_modules import agent_approval_memory_service
from server_modules import secret_redaction_service
from server_modules.agent_computer_policy_service import (
    AgentComputerPolicy,
    DECISION_ALLOW,
    DECISION_APPROVAL_REQUIRED,
    DECISION_BLOCK,
    normalize_agent_computer_policy,
)
from server_modules.agent_computer_profile_service import (
    AgentComputerProfile,
    normalize_agent_computer_profile,
)
from server_modules.capability_risk_classifier_service import (
    CapabilityRiskDecision,
    classify_capability_risk,
)


@dataclass(frozen=True, slots=True)
class AgentComputerApprovalDecision:
    decision: str
    reason: str
    workspace_id: str
    actor_user_id: str
    agent_id: str
    risk_decision: CapabilityRiskDecision
    approval_card: Optional[Dict[str, Any]] = None
    remembered_approval_rule: Optional[Dict[str, Any]] = None
    audit_payload: Dict[str, Any] = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        return self.decision == DECISION_ALLOW

    @property
    def approval_required(self) -> bool:
        return self.decision == DECISION_APPROVAL_REQUIRED

    @property
    def blocked(self) -> bool:
        return self.decision == DECISION_BLOCK

    def as_dict(self) -> Dict[str, Any]:
        payload = {
            "decision": self.decision,
            "allowed": self.allowed,
            "approval_required": self.approval_required,
            "blocked": self.blocked,
            "reason": self.reason,
            "workspace_id": self.workspace_id,
            "actor_user_id": self.actor_user_id,
            "agent_id": self.agent_id,
            "risk_decision": self.risk_decision.as_dict(),
            "approval_card": self.approval_card,
            "remembered_approval_rule": self.remembered_approval_rule,
            "audit_payload": self.audit_payload,
        }
        sanitized = secret_redaction_service.sanitize_value(payload)
        secret_redaction_service.assert_secrets_free(sanitized, context="agent computer approval decision")
        return sanitized


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _domain_from_value(value: Any) -> str:
    raw = _coerce_text(value)
    if not raw:
        return ""
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return _coerce_text(parsed.hostname).lower()


def _target_scope(
    *,
    target_url: Any = None,
    target_path: Any = None,
    target_channel: Any = None,
    target_recipient: Any = None,
    payload: Any = None,
) -> Dict[str, str]:
    data = dict(payload or {}) if isinstance(payload, Mapping) else {}
    action_args = data.get("action_args") if isinstance(data.get("action_args"), Mapping) else {}
    merged = {**data, **dict(action_args)}
    domain = (
        _domain_from_value(target_url)
        or _domain_from_value(merged.get("url"))
        or _domain_from_value(merged.get("target_url"))
        or _domain_from_value(merged.get("domain"))
    )
    return {
        "target_domain": domain,
        "target_path": _coerce_text(target_path) or _coerce_text(merged.get("path") or merged.get("target_path")),
        "target_channel": _coerce_text(target_channel or merged.get("channel")).lower(),
        "target_recipient": _coerce_text(target_recipient or merged.get("recipient") or merged.get("to")).lower(),
    }


def _profile_id(profile: AgentComputerProfile | None) -> str:
    return profile.profile_id if profile else ""


def _gateway_id(profile: AgentComputerProfile | None) -> str:
    return _coerce_text(profile.gateway_id if profile else "")


def _profile_payload(profile: AgentComputerProfile | None) -> Dict[str, Any]:
    if not profile:
        return {}
    return {
        "profile_id": profile.profile_id,
        "machine_label": profile.machine_label,
        "environment_kind": profile.environment_kind,
        "dedicated_to_agent": profile.dedicated_to_agent,
        "health_state": profile.health_state,
        "recording_policy": profile.recording_policy,
    }


def _rememberable(capability: str) -> bool:
    return capability in agent_approval_memory_service.REMEMBERABLE_CAPABILITIES


def _approval_card(
    *,
    risk_decision: CapabilityRiskDecision,
    profile: AgentComputerProfile | None,
    target_scope: Mapping[str, str],
    reason: str,
) -> Dict[str, Any]:
    card = {
        "status": "approval_required",
        "action": risk_decision.capability,
        "description": f"{risk_decision.capability} requires approval for {risk_decision.target_summary}.",
        "reason": reason,
        "risk_class": risk_decision.risk_class,
        "risk_level": risk_decision.risk_level,
        "target_summary": risk_decision.target_summary,
        "target_scope": dict(target_scope),
        "computer": _profile_payload(profile),
        "rememberable": _rememberable(risk_decision.capability),
        "approval_scopes_required": list(risk_decision.approval_scopes_required),
        "recording_required": risk_decision.recording_required,
        "retention_class": risk_decision.retention_class,
    }
    sanitized = secret_redaction_service.sanitize_value(card)
    secret_redaction_service.assert_secrets_free(sanitized, context="agent computer approval card")
    return sanitized


def _audit_payload(
    *,
    decision: str,
    reason: str,
    risk_decision: CapabilityRiskDecision,
    profile: AgentComputerProfile | None,
    remembered_rule: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "decision": decision,
        "reason": reason,
        "risk_decision": risk_decision.as_dict(),
        "computer": _profile_payload(profile),
        "remembered_approval_rule": dict(remembered_rule or {}),
    }
    sanitized = secret_redaction_service.sanitize_value(payload)
    secret_redaction_service.assert_secrets_free(sanitized, context="agent computer approval audit payload")
    return sanitized


def decide_agent_computer_action(
    *,
    workspace_id: str,
    actor_user_id: str,
    agent_id: str,
    policy: AgentComputerPolicy | Mapping[str, Any] | None,
    capability: Any,
    action_class: Any = None,
    target_url: Any = None,
    target_path: Any = None,
    target_channel: Any = None,
    target_recipient: Any = None,
    payload: Any = None,
    computer_profile: AgentComputerProfile | Mapping[str, Any] | None = None,
    current_kill_state: Any = None,
    consume_approval_memory: bool = True,
) -> AgentComputerApprovalDecision:
    workspace = _coerce_text(workspace_id)
    actor = _coerce_text(actor_user_id)
    agent = _coerce_text(agent_id)
    if not workspace:
        raise ValueError("workspace_id is required.")
    if not actor:
        raise ValueError("actor_user_id is required.")
    if not agent:
        raise ValueError("agent_id is required.")

    contract = policy if isinstance(policy, AgentComputerPolicy) else normalize_agent_computer_policy(policy)
    profile = (
        computer_profile
        if isinstance(computer_profile, AgentComputerProfile)
        else normalize_agent_computer_profile(computer_profile)
        if isinstance(computer_profile, Mapping)
        else None
    )
    scope = _target_scope(
        target_url=target_url,
        target_path=target_path,
        target_channel=target_channel,
        target_recipient=target_recipient,
        payload=payload,
    )
    risk_decision = classify_capability_risk(
        policy=contract,
        capability=capability,
        action_class=action_class,
        target_url=target_url,
        target_path=target_path,
        target_channel=target_channel,
        payload=payload,
        computer_profile=profile,
        current_kill_state=current_kill_state,
    )

    if risk_decision.decision == DECISION_BLOCK:
        reason = risk_decision.blocked_reason or "risk_policy_blocked"
        audit = _audit_payload(
            decision=DECISION_BLOCK,
            reason=reason,
            risk_decision=risk_decision,
            profile=profile,
        )
        return AgentComputerApprovalDecision(
            decision=DECISION_BLOCK,
            reason=reason,
            workspace_id=workspace,
            actor_user_id=actor,
            agent_id=agent,
            risk_decision=risk_decision,
            audit_payload=audit,
        )

    remembered_rule = None
    if risk_decision.decision == DECISION_APPROVAL_REQUIRED and consume_approval_memory:
        remembered = agent_approval_memory_service.consume_matching_approval_memory_rule(
            workspace_id=workspace,
            owner_user_id=actor,
            agent_id=agent,
            capability=risk_decision.capability,
            policy_id=contract.policy_id,
            profile_id=_profile_id(profile),
            gateway_id=_gateway_id(profile),
            target_domain=scope["target_domain"],
            target_path=scope["target_path"],
            target_channel=scope["target_channel"],
            target_recipient=scope["target_recipient"],
            payload=payload if isinstance(payload, Mapping) else None,
        )
        if remembered:
            remembered_rule = remembered.as_dict()

    if risk_decision.decision == DECISION_APPROVAL_REQUIRED and remembered_rule:
        reason = "approval_memory_matched"
        audit = _audit_payload(
            decision=DECISION_ALLOW,
            reason=reason,
            risk_decision=risk_decision,
            profile=profile,
            remembered_rule=remembered_rule,
        )
        return AgentComputerApprovalDecision(
            decision=DECISION_ALLOW,
            reason=reason,
            workspace_id=workspace,
            actor_user_id=actor,
            agent_id=agent,
            risk_decision=risk_decision,
            remembered_approval_rule=secret_redaction_service.sanitize_value(remembered_rule),
            audit_payload=audit,
        )

    if risk_decision.decision == DECISION_APPROVAL_REQUIRED:
        reason = "owner_approval_required"
        card = _approval_card(
            risk_decision=risk_decision,
            profile=profile,
            target_scope=scope,
            reason=reason,
        )
        audit = _audit_payload(
            decision=DECISION_APPROVAL_REQUIRED,
            reason=reason,
            risk_decision=risk_decision,
            profile=profile,
        )
        return AgentComputerApprovalDecision(
            decision=DECISION_APPROVAL_REQUIRED,
            reason=reason,
            workspace_id=workspace,
            actor_user_id=actor,
            agent_id=agent,
            risk_decision=risk_decision,
            approval_card=card,
            audit_payload=audit,
        )

    reason = "risk_policy_allowed"
    audit = _audit_payload(
        decision=DECISION_ALLOW,
        reason=reason,
        risk_decision=risk_decision,
        profile=profile,
    )
    return AgentComputerApprovalDecision(
        decision=DECISION_ALLOW,
        reason=reason,
        workspace_id=workspace,
        actor_user_id=actor,
        agent_id=agent,
        risk_decision=risk_decision,
        audit_payload=audit,
    )
