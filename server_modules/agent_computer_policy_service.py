from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping

from server_modules.deployed_agent_runtime_contract_service import (
    COMPUTER_SAFETY_ALLOWED_TERMINAL_POLICIES,
    COMPUTER_SAFETY_SAFE_FILESYSTEM_DEFAULTS,
    STUDIO_AGENT_MODE_TEXT,
    normalize_studio_agent_mode,
)


AUTONOMY_READ_ONLY = "read_only"
AUTONOMY_ASK_EVERY_TIME = "ask_every_time"
AUTONOMY_SAFE_AUTOPILOT = "safe_autopilot"
AUTONOMY_TRUSTED_WORKSTATION = "trusted_workstation"
AUTONOMY_EMERGENCY_STOP = "emergency_stop"
AUTONOMY_MODES = {
    AUTONOMY_READ_ONLY,
    AUTONOMY_ASK_EVERY_TIME,
    AUTONOMY_SAFE_AUTOPILOT,
    AUTONOMY_TRUSTED_WORKSTATION,
    AUTONOMY_EMERGENCY_STOP,
}
AUTONOMY_ALIASES = {
    "readonly": AUTONOMY_READ_ONLY,
    "read-only": AUTONOMY_READ_ONLY,
    "ask": AUTONOMY_ASK_EVERY_TIME,
    "ask_everytime": AUTONOMY_ASK_EVERY_TIME,
    "ask-every-time": AUTONOMY_ASK_EVERY_TIME,
    "autopilot": AUTONOMY_SAFE_AUTOPILOT,
    "safe": AUTONOMY_SAFE_AUTOPILOT,
    "trusted": AUTONOMY_TRUSTED_WORKSTATION,
    "trusted_workstation_mode": AUTONOMY_TRUSTED_WORKSTATION,
    "stop": AUTONOMY_EMERGENCY_STOP,
    "killed": AUTONOMY_EMERGENCY_STOP,
}

DECISION_ALLOW = "allow"
DECISION_APPROVAL_REQUIRED = "approval_required"
DECISION_BLOCK = "block"
DECISIONS = {DECISION_ALLOW, DECISION_APPROVAL_REQUIRED, DECISION_BLOCK}

CAPABILITY_BROWSER_READ = "browser.read"
CAPABILITY_BROWSER_CLICK = "browser.click"
CAPABILITY_BROWSER_FORM_SUBMIT = "browser.form_submit"
CAPABILITY_SCREEN_READ = "screen.read"
CAPABILITY_FILE_METADATA = "file.metadata"
CAPABILITY_FILE_READ = "file.read"
CAPABILITY_FILE_WRITE = "file.write"
CAPABILITY_FILE_DELETE = "file.delete"
CAPABILITY_APP_CONTROL = "app.control"
CAPABILITY_TERMINAL_COMMAND = "terminal.command"
CAPABILITY_TERMINAL_APPROVED_SCRIPT = "terminal.approved_script"
CAPABILITY_COMMUNICATION_DRAFT = "communication.draft"
CAPABILITY_COMMUNICATION_SEND = "communication.send"
CAPABILITY_MEMORY_READ = "memory.read"
CAPABILITY_MEMORY_WRITE = "memory.write"
CAPABILITY_SCHEDULER_CREATE = "scheduler.create"
CAPABILITY_NOTIFICATION_SEND = "notification.send"
CAPABILITY_VISION_SCREEN = "vision.screen"
CAPABILITY_CREDENTIAL_ACCESS = "credential.access"
CAPABILITY_INSTALL_SOFTWARE = "install.software"
CAPABILITY_INSTALL_EXTENSION = "install.extension"
CAPABILITY_CHANGE_SYSTEM_SETTING = "system.change_setting"
CAPABILITY_CHANGE_PERMISSION = "system.change_permission"
CAPABILITY_PAYMENT = "commerce.payment"
CAPABILITY_PRODUCTION_DEPLOY = "production.deploy"
CAPABILITY_CLOUD_STORAGE_ACCESS = "cloud_storage.access"

CAPABILITY_CLASSES = {
    CAPABILITY_BROWSER_READ,
    CAPABILITY_BROWSER_CLICK,
    CAPABILITY_BROWSER_FORM_SUBMIT,
    CAPABILITY_SCREEN_READ,
    CAPABILITY_FILE_METADATA,
    CAPABILITY_FILE_READ,
    CAPABILITY_FILE_WRITE,
    CAPABILITY_FILE_DELETE,
    CAPABILITY_APP_CONTROL,
    CAPABILITY_TERMINAL_COMMAND,
    CAPABILITY_TERMINAL_APPROVED_SCRIPT,
    CAPABILITY_COMMUNICATION_DRAFT,
    CAPABILITY_COMMUNICATION_SEND,
    CAPABILITY_MEMORY_READ,
    CAPABILITY_MEMORY_WRITE,
    CAPABILITY_SCHEDULER_CREATE,
    CAPABILITY_NOTIFICATION_SEND,
    CAPABILITY_VISION_SCREEN,
    CAPABILITY_CREDENTIAL_ACCESS,
    CAPABILITY_INSTALL_SOFTWARE,
    CAPABILITY_INSTALL_EXTENSION,
    CAPABILITY_CHANGE_SYSTEM_SETTING,
    CAPABILITY_CHANGE_PERMISSION,
    CAPABILITY_PAYMENT,
    CAPABILITY_PRODUCTION_DEPLOY,
    CAPABILITY_CLOUD_STORAGE_ACCESS,
}

_SAFE_READ_CAPABILITIES = {
    CAPABILITY_BROWSER_READ,
    CAPABILITY_SCREEN_READ,
    CAPABILITY_FILE_METADATA,
    CAPABILITY_MEMORY_READ,
    CAPABILITY_NOTIFICATION_SEND,
}
_MUTATING_CAPABILITIES = {
    CAPABILITY_BROWSER_CLICK,
    CAPABILITY_BROWSER_FORM_SUBMIT,
    CAPABILITY_FILE_READ,
    CAPABILITY_FILE_WRITE,
    CAPABILITY_FILE_DELETE,
    CAPABILITY_APP_CONTROL,
    CAPABILITY_TERMINAL_COMMAND,
    CAPABILITY_TERMINAL_APPROVED_SCRIPT,
    CAPABILITY_COMMUNICATION_SEND,
    CAPABILITY_MEMORY_WRITE,
    CAPABILITY_SCHEDULER_CREATE,
    CAPABILITY_CLOUD_STORAGE_ACCESS,
}
_CRITICAL_CAPABILITIES = {
    CAPABILITY_CREDENTIAL_ACCESS,
    CAPABILITY_INSTALL_SOFTWARE,
    CAPABILITY_INSTALL_EXTENSION,
    CAPABILITY_CHANGE_SYSTEM_SETTING,
    CAPABILITY_CHANGE_PERMISSION,
    CAPABILITY_PAYMENT,
    CAPABILITY_PRODUCTION_DEPLOY,
}


class AgentComputerPolicyError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class AgentComputerPolicy:
    policy_id: str
    policy_version: int
    autonomy_mode: str
    allowed_capabilities: tuple[str, ...] = field(default_factory=tuple)
    approval_required_capabilities: tuple[str, ...] = field(default_factory=tuple)
    blocked_capabilities: tuple[str, ...] = field(default_factory=tuple)
    domain_allowlist: tuple[str, ...] = field(default_factory=tuple)
    filesystem_scope: tuple[str, ...] = field(default_factory=tuple)
    terminal_policy: str = "blocked"
    external_message_policy: str = "draft_only"
    credential_policy: str = "never_expose"
    screenshot_retention: str = "off"
    cloud_storage_policy: str = "approval_required"
    approval_ttl_seconds: int = 900
    remembered_approval_rules: tuple[Dict[str, Any], ...] = field(default_factory=tuple)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "policy_id": self.policy_id,
            "policy_version": self.policy_version,
            "autonomy_mode": self.autonomy_mode,
            "allowed_capabilities": list(self.allowed_capabilities),
            "approval_required_capabilities": list(self.approval_required_capabilities),
            "blocked_capabilities": list(self.blocked_capabilities),
            "domain_allowlist": list(self.domain_allowlist),
            "filesystem_scope": list(self.filesystem_scope),
            "terminal_policy": self.terminal_policy,
            "external_message_policy": self.external_message_policy,
            "credential_policy": self.credential_policy,
            "screenshot_retention": self.screenshot_retention,
            "cloud_storage_policy": self.cloud_storage_policy,
            "approval_ttl_seconds": self.approval_ttl_seconds,
            "remembered_approval_rules": list(self.remembered_approval_rules),
        }


@dataclass(frozen=True, slots=True)
class AgentComputerPolicyDecision:
    decision: str
    capability: str
    reason: str
    approval_scope: str = ""

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
        return {
            "decision": self.decision,
            "allowed": self.allowed,
            "approval_required": self.approval_required,
            "blocked": self.blocked,
            "capability": self.capability,
            "reason": self.reason,
            "approval_scope": self.approval_scope,
        }


def normalize_autonomy_mode(value: Any, *, default: str = AUTONOMY_ASK_EVERY_TIME) -> str:
    token = str(value or "").strip().lower().replace(" ", "_")
    token = AUTONOMY_ALIASES.get(token, token)
    if token in AUTONOMY_MODES:
        return token
    if default in AUTONOMY_MODES:
        return default
    return AUTONOMY_ASK_EVERY_TIME


def normalize_capability_class(value: Any) -> str:
    token = str(value or "").strip().lower().replace(" ", "_")
    aliases = {
        "browser.navigate": CAPABILITY_BROWSER_READ,
        "browser.submit": CAPABILITY_BROWSER_FORM_SUBMIT,
        "browser.form.submit": CAPABILITY_BROWSER_FORM_SUBMIT,
        "computer.screen": CAPABILITY_SCREEN_READ,
        "computer.click": CAPABILITY_BROWSER_CLICK,
        "file.list": CAPABILITY_FILE_METADATA,
        "shell.command": CAPABILITY_TERMINAL_COMMAND,
        "terminal.execute": CAPABILITY_TERMINAL_COMMAND,
        "terminal.approved.script": CAPABILITY_TERMINAL_APPROVED_SCRIPT,
        "external.message.send": CAPABILITY_COMMUNICATION_SEND,
        "send.external.message": CAPABILITY_COMMUNICATION_SEND,
        "software.install": CAPABILITY_INSTALL_SOFTWARE,
        "extension.install": CAPABILITY_INSTALL_EXTENSION,
        "permission.change": CAPABILITY_CHANGE_PERMISSION,
        "cloud.storage": CAPABILITY_CLOUD_STORAGE_ACCESS,
        "cloud.storage.access": CAPABILITY_CLOUD_STORAGE_ACCESS,
    }
    token = aliases.get(token, token)
    if token not in CAPABILITY_CLASSES:
        raise AgentComputerPolicyError(f"Unsupported agent computer capability '{value}'.")
    return token


def _ordered_capabilities(values: Iterable[Any]) -> tuple[str, ...]:
    out: List[str] = []
    for item in values:
        token = normalize_capability_class(item)
        if token not in out:
            out.append(token)
    return tuple(out)


def _ordered_strings(values: Iterable[Any]) -> tuple[str, ...]:
    out: List[str] = []
    for item in values:
        token = str(item or "").strip()
        if token and token not in out:
            out.append(token)
    return tuple(out)


def _ordered_dicts(values: Any) -> tuple[Dict[str, Any], ...]:
    if not isinstance(values, list):
        return tuple()
    out: List[Dict[str, Any]] = []
    for item in values:
        if isinstance(item, Mapping):
            out.append(dict(item))
    return tuple(out)


def _default_capability_sets(mode: str) -> tuple[set[str], set[str], set[str]]:
    if mode == AUTONOMY_EMERGENCY_STOP:
        return set(), set(), set(CAPABILITY_CLASSES)
    if mode == AUTONOMY_READ_ONLY:
        return set(_SAFE_READ_CAPABILITIES), set(), set(CAPABILITY_CLASSES - _SAFE_READ_CAPABILITIES)
    if mode == AUTONOMY_ASK_EVERY_TIME:
        return set(_SAFE_READ_CAPABILITIES), set(_MUTATING_CAPABILITIES), set(_CRITICAL_CAPABILITIES)
    if mode == AUTONOMY_SAFE_AUTOPILOT:
        allowed = set(_SAFE_READ_CAPABILITIES) | {CAPABILITY_COMMUNICATION_DRAFT}
        approval = {
            CAPABILITY_BROWSER_CLICK,
            CAPABILITY_BROWSER_FORM_SUBMIT,
            CAPABILITY_FILE_READ,
            CAPABILITY_FILE_WRITE,
            CAPABILITY_TERMINAL_COMMAND,
            CAPABILITY_COMMUNICATION_SEND,
            CAPABILITY_MEMORY_WRITE,
            CAPABILITY_SCHEDULER_CREATE,
            CAPABILITY_CLOUD_STORAGE_ACCESS,
        }
        blocked = set(_CRITICAL_CAPABILITIES) | {CAPABILITY_FILE_DELETE, CAPABILITY_APP_CONTROL}
        return allowed, approval, blocked
    if mode == AUTONOMY_TRUSTED_WORKSTATION:
        allowed = set(_SAFE_READ_CAPABILITIES) | {
            CAPABILITY_COMMUNICATION_DRAFT,
            CAPABILITY_FILE_READ,
            CAPABILITY_FILE_WRITE,
            CAPABILITY_TERMINAL_APPROVED_SCRIPT,
            CAPABILITY_MEMORY_WRITE,
            CAPABILITY_SCHEDULER_CREATE,
        }
        approval = {
            CAPABILITY_BROWSER_CLICK,
            CAPABILITY_BROWSER_FORM_SUBMIT,
            CAPABILITY_APP_CONTROL,
            CAPABILITY_COMMUNICATION_SEND,
            CAPABILITY_TERMINAL_COMMAND,
            CAPABILITY_FILE_DELETE,
            CAPABILITY_CLOUD_STORAGE_ACCESS,
            CAPABILITY_PAYMENT,
            CAPABILITY_CREDENTIAL_ACCESS,
            CAPABILITY_PRODUCTION_DEPLOY,
            CAPABILITY_CHANGE_PERMISSION,
        }
        blocked = {
            CAPABILITY_INSTALL_SOFTWARE,
            CAPABILITY_INSTALL_EXTENSION,
            CAPABILITY_CHANGE_SYSTEM_SETTING,
        }
        return allowed, approval, blocked
    return _default_capability_sets(AUTONOMY_ASK_EVERY_TIME)


def build_default_agent_computer_policy(
    *,
    autonomy_mode: str = AUTONOMY_ASK_EVERY_TIME,
    policy_id: str = "default",
    domain_allowlist: Iterable[Any] = (),
    filesystem_scope: Iterable[Any] = (),
) -> AgentComputerPolicy:
    mode = normalize_autonomy_mode(autonomy_mode)
    allowed, approval, blocked = _default_capability_sets(mode)
    return AgentComputerPolicy(
        policy_id=str(policy_id or f"default:{mode}").strip() or f"default:{mode}",
        policy_version=1,
        autonomy_mode=mode,
        allowed_capabilities=tuple(sorted(allowed)),
        approval_required_capabilities=tuple(sorted(approval - blocked - allowed)),
        blocked_capabilities=tuple(sorted(blocked - allowed)),
        domain_allowlist=_ordered_strings(domain_allowlist),
        filesystem_scope=_ordered_strings(filesystem_scope),
        terminal_policy=(
            "allowlist"
            if mode == AUTONOMY_TRUSTED_WORKSTATION
            else "blocked"
            if mode in {AUTONOMY_READ_ONLY, AUTONOMY_EMERGENCY_STOP}
            else "review_required"
        ),
        external_message_policy="approved_contacts" if mode == AUTONOMY_TRUSTED_WORKSTATION else "draft_only",
        screenshot_retention="session_only" if mode in {AUTONOMY_SAFE_AUTOPILOT, AUTONOMY_TRUSTED_WORKSTATION} else "off",
        cloud_storage_policy="approval_required",
    )


def normalize_agent_computer_policy(payload: Mapping[str, Any] | None) -> AgentComputerPolicy:
    data = dict(payload or {})
    base = build_default_agent_computer_policy(
        autonomy_mode=data.get("autonomy_mode") or AUTONOMY_ASK_EVERY_TIME,
        policy_id=str(data.get("policy_id") or "custom").strip() or "custom",
        domain_allowlist=list(data.get("domain_allowlist") or []),
        filesystem_scope=list(data.get("filesystem_scope") or []),
    )
    allowed = _ordered_capabilities(data.get("allowed_capabilities") or base.allowed_capabilities)
    approval = _ordered_capabilities(data.get("approval_required_capabilities") or base.approval_required_capabilities)
    blocked = _ordered_capabilities(data.get("blocked_capabilities") or base.blocked_capabilities)
    overlap = set(allowed) & set(blocked)
    if overlap:
        raise AgentComputerPolicyError(f"Capabilities cannot be both allowed and blocked: {sorted(overlap)}")
    return AgentComputerPolicy(
        policy_id=base.policy_id,
        policy_version=max(int(data.get("policy_version") or base.policy_version), 1),
        autonomy_mode=base.autonomy_mode,
        allowed_capabilities=allowed,
        approval_required_capabilities=tuple(item for item in approval if item not in set(blocked) and item not in set(allowed)),
        blocked_capabilities=blocked,
        domain_allowlist=base.domain_allowlist,
        filesystem_scope=base.filesystem_scope,
        terminal_policy=str(data.get("terminal_policy") or base.terminal_policy).strip() or base.terminal_policy,
        external_message_policy=str(data.get("external_message_policy") or base.external_message_policy).strip() or base.external_message_policy,
        credential_policy=str(data.get("credential_policy") or base.credential_policy).strip() or base.credential_policy,
        screenshot_retention=str(data.get("screenshot_retention") or base.screenshot_retention).strip() or base.screenshot_retention,
        cloud_storage_policy=str(data.get("cloud_storage_policy") or base.cloud_storage_policy).strip() or base.cloud_storage_policy,
        approval_ttl_seconds=max(int(data.get("approval_ttl_seconds") or base.approval_ttl_seconds), 60),
        remembered_approval_rules=_ordered_dicts(data.get("remembered_approval_rules")),
    )


def decision_for_capability(policy: AgentComputerPolicy, capability: Any) -> str:
    token = normalize_capability_class(capability)
    if token in policy.blocked_capabilities:
        return DECISION_BLOCK
    if token in policy.approval_required_capabilities:
        return DECISION_APPROVAL_REQUIRED
    if token in policy.allowed_capabilities:
        return DECISION_ALLOW
    return DECISION_BLOCK if policy.autonomy_mode == AUTONOMY_EMERGENCY_STOP else DECISION_APPROVAL_REQUIRED


def _domain_allowed(policy: AgentComputerPolicy, requested_domain: Any) -> bool:
    domain = str(requested_domain or "").strip().lower()
    if not domain or not policy.domain_allowlist:
        return True
    for allowed in policy.domain_allowlist:
        allowed_domain = str(allowed or "").strip().lower()
        if domain == allowed_domain or domain.endswith(f".{allowed_domain}"):
            return True
    return False


def evaluate_agent_computer_request(
    policy: AgentComputerPolicy | Mapping[str, Any] | None,
    *,
    capability: Any,
    requested_domain: Any = None,
) -> AgentComputerPolicyDecision:
    contract = policy if isinstance(policy, AgentComputerPolicy) else normalize_agent_computer_policy(policy)
    token = normalize_capability_class(capability)
    if not _domain_allowed(contract, requested_domain):
        return AgentComputerPolicyDecision(
            decision=DECISION_BLOCK,
            capability=token,
            reason="domain_not_allowed",
        )
    decision = decision_for_capability(contract, token)
    if decision == DECISION_ALLOW:
        return AgentComputerPolicyDecision(decision=decision, capability=token, reason="policy_allowed")
    if decision == DECISION_APPROVAL_REQUIRED:
        return AgentComputerPolicyDecision(
            decision=decision,
            capability=token,
            reason="owner_approval_required",
            approval_scope=token,
        )
    return AgentComputerPolicyDecision(decision=decision, capability=token, reason="policy_blocked")


def validate_agent_computer_policy(
    policy: AgentComputerPolicy | Mapping[str, Any] | None,
    *,
    studio_agent_mode: Any = None,
) -> AgentComputerPolicy:
    contract = policy if isinstance(policy, AgentComputerPolicy) else normalize_agent_computer_policy(policy)
    if contract.terminal_policy not in COMPUTER_SAFETY_ALLOWED_TERMINAL_POLICIES:
        raise AgentComputerPolicyError(f"Unsupported terminal policy '{contract.terminal_policy}'.")
    for scope in contract.filesystem_scope:
        if scope in COMPUTER_SAFETY_SAFE_FILESYSTEM_DEFAULTS:
            continue
        if not str(scope).startswith(("/", "~")):
            raise AgentComputerPolicyError(f"Filesystem scope must be explicit, received '{scope}'.")
    if studio_agent_mode is not None:
        mode = normalize_studio_agent_mode(studio_agent_mode, strict=True)
        if mode == STUDIO_AGENT_MODE_TEXT:
            non_read = set(contract.allowed_capabilities) - _SAFE_READ_CAPABILITIES
            non_read |= set(contract.approval_required_capabilities)
            if non_read:
                raise AgentComputerPolicyError("text_agent cannot attach computer automation policy.")
    return contract


def agent_computer_policy_from_deployed_agent_record(record: Mapping[str, Any] | None) -> AgentComputerPolicy:
    data = dict(record or {})
    config = data.get("config") if isinstance(data.get("config"), Mapping) else {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), Mapping) else {}
    candidate = (
        config.get("agent_computer_policy")
        or metadata.get("agent_computer_policy")
        or config.get("computer_policy")
        or metadata.get("computer_policy")
    )
    if candidate:
        return normalize_agent_computer_policy(candidate)

    automation = config.get("computer_automation") if isinstance(config.get("computer_automation"), Mapping) else {}
    return build_default_agent_computer_policy(
        autonomy_mode=automation.get("autonomy_mode") or AUTONOMY_ASK_EVERY_TIME,
        policy_id=f"deployed-agent:{data.get('id') or data.get('deployed_agent_id') or 'unknown'}",
        domain_allowlist=automation.get("allowed_domains") or (),
        filesystem_scope=automation.get("filesystem_scope") or (),
    )
