from __future__ import annotations

from dataclasses import dataclass, field
import threading
from typing import Any, Dict, List


_UNSAFE_PREFIXES = ("computer_control", "browser_automation")
_UNSAFE_EXACT = {"shell.execute"}
_LOCK = threading.Lock()


@dataclass(slots=True)
class SafeModeState:
    enabled: bool
    reason: str = ""
    blocked_capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class KillSwitchState:
    enabled: bool
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


_GLOBAL_SAFE_MODE = SafeModeState(enabled=False)
_TENANT_SAFE_MODE: Dict[str, SafeModeState] = {}
_WORKSPACE_SAFE_MODE: Dict[str, SafeModeState] = {}
_MACHINE_SAFE_MODE: Dict[str, SafeModeState] = {}

_GLOBAL_KILL_SWITCH = KillSwitchState(enabled=False)
_TENANT_KILL_SWITCHES: Dict[str, KillSwitchState] = {}
_WORKSPACE_KILL_SWITCHES: Dict[str, KillSwitchState] = {}
_MACHINE_KILL_SWITCHES: Dict[str, KillSwitchState] = {}
_CAPABILITY_KILL_SWITCHES: Dict[str, KillSwitchState] = {}


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().lower()


def _safe_mode_blocked_capabilities() -> list[str]:
    return [
        "computer_control",
        "computer_control.*",
        "browser_automation.interactive",
        "browser_automation.*",
        "shell.execute",
    ]


def _clone_safe_mode(state: SafeModeState) -> Dict[str, Any]:
    return {
        "enabled": bool(state.enabled),
        "reason": str(state.reason or ""),
        "blocked_capabilities": list(state.blocked_capabilities or []),
        "metadata": dict(state.metadata or {}),
    }


def _clone_kill_switch(state: KillSwitchState) -> Dict[str, Any]:
    return {
        "enabled": bool(state.enabled),
        "reason": str(state.reason or ""),
        "metadata": dict(state.metadata or {}),
    }


def _is_unsafe_capability(capability_id: str) -> bool:
    token = _normalize_token(capability_id)
    if token in _UNSAFE_EXACT:
        return True
    return any(token == prefix or token.startswith(f"{prefix}.") for prefix in _UNSAFE_PREFIXES)


def set_safe_mode(
    *,
    enabled: bool,
    reason: str = "",
    tenant_id: str | None = None,
    workspace_id: str | None = None,
    machine_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    state = SafeModeState(
        enabled=bool(enabled),
        reason=str(reason or ""),
        blocked_capabilities=_safe_mode_blocked_capabilities() if enabled else [],
        metadata=dict(metadata or {}),
    )
    tenant_token = _normalize_token(tenant_id)
    workspace_token = _normalize_token(workspace_id)
    machine_token = _normalize_token(machine_id)
    with _LOCK:
        if tenant_token:
            if state.enabled:
                _TENANT_SAFE_MODE[tenant_token] = state
            else:
                _TENANT_SAFE_MODE.pop(tenant_token, None)
            return {"scope": "tenant", "tenant_id": tenant_token, "state": _clone_safe_mode(state)}
        if workspace_token:
            if state.enabled:
                _WORKSPACE_SAFE_MODE[workspace_token] = state
            else:
                _WORKSPACE_SAFE_MODE.pop(workspace_token, None)
            return {"scope": "workspace", "workspace_id": workspace_token, "state": _clone_safe_mode(state)}
        if machine_token:
            if state.enabled:
                _MACHINE_SAFE_MODE[machine_token] = state
            else:
                _MACHINE_SAFE_MODE.pop(machine_token, None)
            return {"scope": "machine", "machine_id": machine_token, "state": _clone_safe_mode(state)}
        _GLOBAL_SAFE_MODE.enabled = state.enabled
        _GLOBAL_SAFE_MODE.reason = state.reason
        _GLOBAL_SAFE_MODE.blocked_capabilities = list(state.blocked_capabilities)
        _GLOBAL_SAFE_MODE.metadata = dict(state.metadata)
        return {"scope": "global", "state": _clone_safe_mode(_GLOBAL_SAFE_MODE)}


def set_kill_switch(
    *,
    scope: str,
    enabled: bool,
    reason: str = "",
    tenant_id: str | None = None,
    workspace_id: str | None = None,
    machine_id: str | None = None,
    capability_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    clean_scope = _normalize_token(scope) or "global"
    state = KillSwitchState(enabled=bool(enabled), reason=str(reason or ""), metadata=dict(metadata or {}))
    tenant_token = _normalize_token(tenant_id)
    workspace_token = _normalize_token(workspace_id)
    machine_token = _normalize_token(machine_id)
    capability_token = _normalize_token(capability_id)
    with _LOCK:
        if clean_scope == "tenant":
            if not tenant_token:
                raise ValueError("tenant_id is required for tenant kill switches.")
            if state.enabled:
                _TENANT_KILL_SWITCHES[tenant_token] = state
            else:
                _TENANT_KILL_SWITCHES.pop(tenant_token, None)
            return {"scope": "tenant", "tenant_id": tenant_token, "state": _clone_kill_switch(state)}
        if clean_scope == "workspace":
            if not workspace_token:
                raise ValueError("workspace_id is required for workspace kill switches.")
            if state.enabled:
                _WORKSPACE_KILL_SWITCHES[workspace_token] = state
            else:
                _WORKSPACE_KILL_SWITCHES.pop(workspace_token, None)
            return {"scope": "workspace", "workspace_id": workspace_token, "state": _clone_kill_switch(state)}
        if clean_scope == "machine":
            if not machine_token:
                raise ValueError("machine_id is required for machine kill switches.")
            if state.enabled:
                _MACHINE_KILL_SWITCHES[machine_token] = state
            else:
                _MACHINE_KILL_SWITCHES.pop(machine_token, None)
            return {"scope": "machine", "machine_id": machine_token, "state": _clone_kill_switch(state)}
        if clean_scope == "capability":
            if not capability_token:
                raise ValueError("capability_id is required for capability kill switches.")
            if state.enabled:
                _CAPABILITY_KILL_SWITCHES[capability_token] = state
            else:
                _CAPABILITY_KILL_SWITCHES.pop(capability_token, None)
            return {"scope": "capability", "capability_id": capability_token, "state": _clone_kill_switch(state)}
        _GLOBAL_KILL_SWITCH.enabled = state.enabled
        _GLOBAL_KILL_SWITCH.reason = state.reason
        _GLOBAL_KILL_SWITCH.metadata = dict(state.metadata)
        return {"scope": "global", "state": _clone_kill_switch(_GLOBAL_KILL_SWITCH)}


def resolve_capability_disable_state(
    capability_id: str,
    *,
    tenant_id: str | None = None,
    workspace_id: str | None = None,
    machine_id: str | None = None,
) -> Dict[str, Any]:
    token = _normalize_token(capability_id)
    if not token:
        return {"disabled": False, "reason": "", "scope": None, "matched_chain": []}
    tenant_token = _normalize_token(tenant_id)
    workspace_token = _normalize_token(workspace_id)
    machine_token = _normalize_token(machine_id)
    matched_chain: list[dict[str, Any]] = []

    def _record(source_type: str, scope: str, state: Any, *, extra: Dict[str, Any] | None = None) -> None:
        entry = {
            "type": source_type,
            "scope": scope,
            "reason": str(getattr(state, "reason", "") or ""),
            "metadata": dict(getattr(state, "metadata", {}) or {}),
        }
        if extra:
            entry.update(extra)
        matched_chain.append(entry)

    with _LOCK:
        if bool(_GLOBAL_KILL_SWITCH.enabled):
            _record("kill_switch", "global", _GLOBAL_KILL_SWITCH)
        if bool(_GLOBAL_SAFE_MODE.enabled) and _is_unsafe_capability(token):
            _record("safe_mode", "global", _GLOBAL_SAFE_MODE, extra={"capability_id": token})
        tenant_switch = _TENANT_KILL_SWITCHES.get(tenant_token) if tenant_token else None
        if isinstance(tenant_switch, KillSwitchState) and tenant_switch.enabled:
            _record("kill_switch", "tenant", tenant_switch, extra={"tenant_id": tenant_token})
        tenant_safe = _TENANT_SAFE_MODE.get(tenant_token) if tenant_token else None
        if isinstance(tenant_safe, SafeModeState) and tenant_safe.enabled and _is_unsafe_capability(token):
            _record("safe_mode", "tenant", tenant_safe, extra={"tenant_id": tenant_token, "capability_id": token})
        workspace_switch = _WORKSPACE_KILL_SWITCHES.get(workspace_token) if workspace_token else None
        if isinstance(workspace_switch, KillSwitchState) and workspace_switch.enabled:
            _record("kill_switch", "workspace", workspace_switch, extra={"workspace_id": workspace_token})
        workspace_safe = _WORKSPACE_SAFE_MODE.get(workspace_token) if workspace_token else None
        if isinstance(workspace_safe, SafeModeState) and workspace_safe.enabled and _is_unsafe_capability(token):
            _record("safe_mode", "workspace", workspace_safe, extra={"workspace_id": workspace_token, "capability_id": token})
        machine_switch = _MACHINE_KILL_SWITCHES.get(machine_token) if machine_token else None
        if isinstance(machine_switch, KillSwitchState) and machine_switch.enabled:
            _record("kill_switch", "machine", machine_switch, extra={"machine_id": machine_token})
        machine_safe = _MACHINE_SAFE_MODE.get(machine_token) if machine_token else None
        if isinstance(machine_safe, SafeModeState) and machine_safe.enabled and _is_unsafe_capability(token):
            _record("safe_mode", "machine", machine_safe, extra={"machine_id": machine_token, "capability_id": token})
        capability_switch = _CAPABILITY_KILL_SWITCHES.get(token)
        if isinstance(capability_switch, KillSwitchState) and capability_switch.enabled:
            _record("kill_switch", "capability", capability_switch, extra={"capability_id": token})
    if not matched_chain:
        return {"disabled": False, "reason": "", "scope": None, "matched_chain": []}
    matched = matched_chain[-1]
    return {
        "disabled": True,
        "reason": str(matched.get("reason") or ""),
        "scope": matched.get("scope"),
        "type": matched.get("type"),
        "matched_chain": matched_chain,
    }


def is_capability_disabled(
    capability_id: str,
    *,
    tenant_id: str | None = None,
    workspace_id: str | None = None,
    machine_id: str | None = None,
) -> bool:
    return bool(
        resolve_capability_disable_state(
            capability_id,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            machine_id=machine_id,
        ).get("disabled")
    )


def state_snapshot() -> Dict[str, Any]:
    with _LOCK:
        return {
            "safe_mode": {
                "global": _clone_safe_mode(_GLOBAL_SAFE_MODE),
                "tenant": {key: _clone_safe_mode(value) for key, value in _TENANT_SAFE_MODE.items()},
                "workspace": {key: _clone_safe_mode(value) for key, value in _WORKSPACE_SAFE_MODE.items()},
                "machine": {key: _clone_safe_mode(value) for key, value in _MACHINE_SAFE_MODE.items()},
            },
            "kill_switches": {
                "global": _clone_kill_switch(_GLOBAL_KILL_SWITCH),
                "tenant": {key: _clone_kill_switch(value) for key, value in _TENANT_KILL_SWITCHES.items()},
                "workspace": {key: _clone_kill_switch(value) for key, value in _WORKSPACE_KILL_SWITCHES.items()},
                "machine": {key: _clone_kill_switch(value) for key, value in _MACHINE_KILL_SWITCHES.items()},
                "capability": {key: _clone_kill_switch(value) for key, value in _CAPABILITY_KILL_SWITCHES.items()},
            },
        }


def reset_state_for_tests() -> None:
    with _LOCK:
        _GLOBAL_SAFE_MODE.enabled = False
        _GLOBAL_SAFE_MODE.reason = ""
        _GLOBAL_SAFE_MODE.blocked_capabilities = []
        _GLOBAL_SAFE_MODE.metadata = {}
        _TENANT_SAFE_MODE.clear()
        _WORKSPACE_SAFE_MODE.clear()
        _MACHINE_SAFE_MODE.clear()
        _GLOBAL_KILL_SWITCH.enabled = False
        _GLOBAL_KILL_SWITCH.reason = ""
        _GLOBAL_KILL_SWITCH.metadata = {}
        _TENANT_KILL_SWITCHES.clear()
        _WORKSPACE_KILL_SWITCHES.clear()
        _MACHINE_KILL_SWITCHES.clear()
        _CAPABILITY_KILL_SWITCHES.clear()
