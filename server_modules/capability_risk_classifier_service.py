from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Mapping, Optional
from urllib.parse import urlparse

from server_modules import secret_redaction_service
from server_modules.agent_computer_policy_service import (
    AgentComputerPolicy,
    DECISION_ALLOW,
    DECISION_APPROVAL_REQUIRED,
    DECISION_BLOCK,
    evaluate_agent_computer_request,
    normalize_agent_computer_policy,
)
from server_modules.agent_computer_profile_service import AgentComputerProfile, normalize_agent_computer_profile


RISK_CLASS_LOW = "low"
RISK_CLASS_MEDIUM = "medium"
RISK_CLASS_HIGH = "high"
RISK_CLASS_CRITICAL = "critical"
RISK_LEVELS = {
    RISK_CLASS_LOW: 1,
    RISK_CLASS_MEDIUM: 2,
    RISK_CLASS_HIGH: 3,
    RISK_CLASS_CRITICAL: 4,
}

ACTION_READ = "read"
ACTION_WRITE = "write"
ACTION_EXECUTE = "execute"
ACTION_CLASSES = {ACTION_READ, ACTION_WRITE, ACTION_EXECUTE}

AUDIT_VISIBILITY_SUMMARY = "summary"
AUDIT_VISIBILITY_PAYLOAD_REDACTED = "payload_redacted"
AUDIT_VISIBILITY_SECURITY_EVENT = "security_event"

RETENTION_SHORT = "short"
RETENTION_STANDARD = "standard"
RETENTION_SECURITY = "security"

KILL_STATES = {"active", "killed", "kill", "paused", "suspended", "emergency_stop", "workspace_emergency_stop"}
UNHEALTHY_PROFILE_STATES = {"offline", "unhealthy", "revoked"}

CAPABILITY_ALIASES = {
    "browser.session.start": "browser.read",
    "browser.session.action": "browser.click",
    "browser.session.takeover": "app.control",
    "browser.session.resume": "browser.read",
    "browser.session.interrupt": "app.control",
    "computer_control.click": "browser.click",
    "computer_control.type": "browser.form_submit",
    "computer_control.key": "browser.form_submit",
    "computer_control.clipboard_write": "browser.form_submit",
    "computer_control.clipboard_read": "credential.access",
    "computer_control.list_windows": "app.control",
    "computer_control.list_apps": "app.control",
    "computer_control.notify": "notification.send",
    "computer_control.speak": "notification.send",
    "computer_control.launch": "app.control",
    "computer_control.launch_app": "app.control",
    "computer_control.applescript": "terminal.command",
    "screenshot.capture": "screen.read",
    "system.presence": "screen.read",
    "screen.read": "screen.read",
    "file.list": "file.metadata",
    "file.read": "file.read",
    "file.write": "file.write",
    "file.delete": "file.delete",
    "shell.command": "terminal.command",
    "terminal.execute": "terminal.command",
    "message.draft": "communication.draft",
    "message.send": "communication.send",
}

CRITICAL_CAPABILITIES = {
    "credential.access",
    "install.software",
    "install.extension",
    "system.change_setting",
    "system.change_permission",
    "commerce.payment",
    "production.deploy",
}
HIGH_CAPABILITIES = {
    "browser.form_submit",
    "file.delete",
    "terminal.command",
    "communication.send",
    "cloud_storage.access",
    "app.control",
}
MEDIUM_CAPABILITIES = {
    "browser.click",
    "file.read",
    "file.write",
    "terminal.approved_script",
    "memory.write",
    "scheduler.create",
}

RISKY_BROWSER_ACTIONS = {
    "click",
    "fill",
    "select",
    "upload_files",
    "execute_js",
    "download_file",
    "new_tab",
    "close_tab",
}
CRITICAL_PAYLOAD_TERMS = {
    "password",
    "secret",
    "credential",
    "token",
    "api_key",
    "private_key",
}
DESTRUCTIVE_PAYLOAD_TERMS = {
    "delete",
    "remove",
    "destroy",
    "drop table",
    "chmod",
    "chown",
    "rm -rf",
}


class CapabilityRiskClassifierError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class CapabilityRiskDecision:
    decision_id: str
    policy_version: int
    risk_level: int
    risk_class: str
    action_class: str
    capability: str
    target_summary: str
    decision: str
    approval_scopes_required: tuple[str, ...] = field(default_factory=tuple)
    blocked_reason: str = ""
    audit_visibility: str = AUDIT_VISIBILITY_SUMMARY
    recording_required: bool = False
    retention_class: str = RETENTION_STANDARD
    cacheable: bool = False

    def as_dict(self) -> Dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "policy_version": self.policy_version,
            "risk_level": self.risk_level,
            "risk_class": self.risk_class,
            "action_class": self.action_class,
            "capability": self.capability,
            "target_summary": self.target_summary,
            "decision": self.decision,
            "approval_scopes_required": list(self.approval_scopes_required),
            "blocked_reason": self.blocked_reason,
            "audit_visibility": self.audit_visibility,
            "recording_required": self.recording_required,
            "retention_class": self.retention_class,
            "cacheable": self.cacheable,
        }


def _decision_id() -> str:
    return "crd_" + uuid.uuid4().hex


def normalize_action_class(value: Any, *, default: str = ACTION_READ) -> str:
    token = str(value or "").strip().lower()
    if token in ACTION_CLASSES:
        return token
    return default


def normalize_capability_for_risk(capability: Any) -> str:
    token = str(capability or "").strip().lower()
    token = CAPABILITY_ALIASES.get(token, token)
    if token == "browser.read":
        return token
    try:
        normalized = evaluate_agent_computer_request(None, capability=token).capability
    except Exception as exc:
        raise CapabilityRiskClassifierError(f"Unsupported capability for risk classification: {capability}") from exc
    return normalized


def _payload_text(payload: Any) -> str:
    try:
        sanitized = secret_redaction_service.sanitize_value(payload)
        return json.dumps(sanitized, sort_keys=True, ensure_ascii=True)
    except Exception:
        return secret_redaction_service.redact_text(payload)


def _target_domain(target_url: Any = None, target: Any = None, payload: Any = None) -> str:
    candidates = [target_url, target]
    if isinstance(payload, Mapping):
        candidates.extend([payload.get("url"), payload.get("target_url"), payload.get("domain")])
    for candidate in candidates:
        raw = str(candidate or "").strip()
        if not raw:
            continue
        parsed = urlparse(raw if "://" in raw else f"https://{raw}")
        host = str(parsed.hostname or "").strip().lower()
        if host:
            return host
    return ""


def _target_summary(*, target_url: Any = None, target_path: Any = None, target_channel: Any = None, payload: Any = None) -> str:
    parts = []
    if target_url:
        parts.append(f"url={target_url}")
    if target_path:
        parts.append(f"path={target_path}")
    if target_channel:
        parts.append(f"channel={target_channel}")
    if isinstance(payload, Mapping):
        for key in ("url", "target_url", "path", "channel", "recipient", "action"):
            if key in payload:
                parts.append(f"{key}={payload.get(key)}")
    summary = "; ".join(str(part) for part in parts if str(part or "").strip()) or "unspecified"
    return secret_redaction_service.redact_text(summary)[:500]


def _risk_for_capability(capability: str, action_class: str, payload: Any) -> str:
    text = _payload_text(payload).lower()
    if capability in CRITICAL_CAPABILITIES or any(term in text for term in CRITICAL_PAYLOAD_TERMS):
        return RISK_CLASS_CRITICAL
    if capability in HIGH_CAPABILITIES or any(term in text for term in DESTRUCTIVE_PAYLOAD_TERMS):
        return RISK_CLASS_HIGH
    if capability in MEDIUM_CAPABILITIES or action_class in {ACTION_WRITE, ACTION_EXECUTE}:
        return RISK_CLASS_MEDIUM
    return RISK_CLASS_LOW


def _policy(policy: AgentComputerPolicy | Mapping[str, Any] | None) -> AgentComputerPolicy:
    return policy if isinstance(policy, AgentComputerPolicy) else normalize_agent_computer_policy(policy)


def _profile(computer_profile: AgentComputerProfile | Mapping[str, Any] | None) -> AgentComputerProfile | None:
    if computer_profile is None:
        return None
    return computer_profile if isinstance(computer_profile, AgentComputerProfile) else normalize_agent_computer_profile(computer_profile)


def _audit_visibility(risk_class: str) -> str:
    if risk_class == RISK_CLASS_CRITICAL:
        return AUDIT_VISIBILITY_SECURITY_EVENT
    if risk_class in {RISK_CLASS_HIGH, RISK_CLASS_MEDIUM}:
        return AUDIT_VISIBILITY_PAYLOAD_REDACTED
    return AUDIT_VISIBILITY_SUMMARY


def _retention_class(risk_class: str) -> str:
    if risk_class in {RISK_CLASS_CRITICAL, RISK_CLASS_HIGH}:
        return RETENTION_SECURITY
    if risk_class == RISK_CLASS_MEDIUM:
        return RETENTION_STANDARD
    return RETENTION_SHORT


def _recording_required(capability: str, risk_class: str) -> bool:
    if risk_class in {RISK_CLASS_HIGH, RISK_CLASS_CRITICAL}:
        return True
    return capability.startswith("browser.") or capability in {"screen.read", "app.control"}


def classify_capability_risk(
    *,
    policy: AgentComputerPolicy | Mapping[str, Any] | None,
    capability: Any,
    action_class: Any = None,
    target_url: Any = None,
    target_path: Any = None,
    target_channel: Any = None,
    payload: Any = None,
    computer_profile: AgentComputerProfile | Mapping[str, Any] | None = None,
    current_kill_state: Any = None,
) -> CapabilityRiskDecision:
    contract = _policy(policy)
    profile = _profile(computer_profile)
    normalized_capability = normalize_capability_for_risk(capability)
    normalized_action = normalize_action_class(action_class)
    summary = _target_summary(
        target_url=target_url,
        target_path=target_path,
        target_channel=target_channel,
        payload=payload,
    )

    kill_state = str(current_kill_state or "").strip().lower()
    risk_class = _risk_for_capability(normalized_capability, normalized_action, payload)
    if kill_state in KILL_STATES:
        return CapabilityRiskDecision(
            decision_id=_decision_id(),
            policy_version=contract.policy_version,
            risk_level=RISK_LEVELS[risk_class],
            risk_class=risk_class,
            action_class=normalized_action,
            capability=normalized_capability,
            target_summary=summary,
            decision=DECISION_BLOCK,
            blocked_reason=f"kill_state:{kill_state}",
            audit_visibility=AUDIT_VISIBILITY_SECURITY_EVENT,
            recording_required=True,
            retention_class=RETENTION_SECURITY,
        )

    if profile and profile.health_state in UNHEALTHY_PROFILE_STATES:
        return CapabilityRiskDecision(
            decision_id=_decision_id(),
            policy_version=contract.policy_version,
            risk_level=RISK_LEVELS[risk_class],
            risk_class=risk_class,
            action_class=normalized_action,
            capability=normalized_capability,
            target_summary=summary,
            decision=DECISION_BLOCK,
            blocked_reason=f"profile_{profile.health_state}",
            audit_visibility=AUDIT_VISIBILITY_SECURITY_EVENT,
            recording_required=True,
            retention_class=RETENTION_SECURITY,
        )

    policy_decision = evaluate_agent_computer_request(
        contract,
        capability=normalized_capability,
        requested_domain=_target_domain(target_url=target_url, payload=payload),
        requested_path=target_path,
    )
    if policy_decision.blocked:
        return CapabilityRiskDecision(
            decision_id=_decision_id(),
            policy_version=contract.policy_version,
            risk_level=RISK_LEVELS[risk_class],
            risk_class=risk_class,
            action_class=normalized_action,
            capability=normalized_capability,
            target_summary=summary,
            decision=DECISION_BLOCK,
            blocked_reason=policy_decision.reason,
            audit_visibility=_audit_visibility(risk_class),
            recording_required=_recording_required(normalized_capability, risk_class),
            retention_class=_retention_class(risk_class),
        )

    if policy_decision.approval_required:
        return CapabilityRiskDecision(
            decision_id=_decision_id(),
            policy_version=contract.policy_version,
            risk_level=RISK_LEVELS[risk_class],
            risk_class=risk_class,
            action_class=normalized_action,
            capability=normalized_capability,
            target_summary=summary,
            decision=DECISION_APPROVAL_REQUIRED,
            approval_scopes_required=(policy_decision.approval_scope or normalized_capability,),
            audit_visibility=_audit_visibility(risk_class),
            recording_required=_recording_required(normalized_capability, risk_class),
            retention_class=_retention_class(risk_class),
        )

    return CapabilityRiskDecision(
        decision_id=_decision_id(),
        policy_version=contract.policy_version,
        risk_level=RISK_LEVELS[risk_class],
        risk_class=risk_class,
        action_class=normalized_action,
        capability=normalized_capability,
        target_summary=summary,
        decision=DECISION_ALLOW,
        audit_visibility=_audit_visibility(risk_class),
        recording_required=_recording_required(normalized_capability, risk_class),
        retention_class=_retention_class(risk_class),
    )


def classify_gateway_tool_risk(
    *,
    policy: AgentComputerPolicy | Mapping[str, Any] | None,
    capability_id: Any,
    arguments: Optional[Mapping[str, Any]] = None,
    computer_profile: AgentComputerProfile | Mapping[str, Any] | None = None,
    current_kill_state: Any = None,
) -> CapabilityRiskDecision:
    args = dict(arguments or {})
    return classify_capability_risk(
        policy=policy,
        capability=capability_id,
        action_class=args.get("action_class"),
        target_url=args.get("url") or args.get("target_url"),
        target_path=args.get("path"),
        target_channel=args.get("channel"),
        payload=args,
        computer_profile=computer_profile,
        current_kill_state=current_kill_state,
    )


def classify_gateway_browser_action_risk(
    *,
    policy: AgentComputerPolicy | Mapping[str, Any] | None,
    browser_action: Any,
    payload: Optional[Mapping[str, Any]] = None,
    computer_profile: AgentComputerProfile | Mapping[str, Any] | None = None,
    reviewed_approval_required: bool = False,
    current_kill_state: Any = None,
) -> CapabilityRiskDecision:
    action = str(browser_action or "").strip().lower()
    if reviewed_approval_required:
        capability = "browser.form_submit"
        action_class = ACTION_WRITE
    elif action in RISKY_BROWSER_ACTIONS:
        capability = "browser.click" if action in {"click", "new_tab", "close_tab"} else "browser.form_submit"
        action_class = ACTION_WRITE
    else:
        capability = "browser.read"
        action_class = ACTION_READ
    args = dict(payload or {})
    args["action"] = action
    return classify_capability_risk(
        policy=policy,
        capability=capability,
        action_class=action_class,
        target_url=args.get("url") or args.get("target_url"),
        payload=args,
        computer_profile=computer_profile,
        current_kill_state=current_kill_state,
    )
