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
_WORKSPACE_SAFE_MODE: Dict[str, SafeModeState] = {}
_MACHINE_SAFE_MODE: Dict[str, SafeModeState] = {}

_GLOBAL_KILL_SWITCH = KillSwitchState(enabled=False)
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
    workspace_token = _normalize_token(workspace_id)
    machine_token = _normalize_token(machine_id)
    with _LOCK:
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
    workspace_id: str | None = None,
    machine_id: str | None = None,
    capability_id: str | None = None,
    metadata: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    clean_scope = _normalize_token(scope) or "global"
    state = KillSwitchState(enabled=bool(enabled), reason=str(reason or ""), metadata=dict(metadata or {}))
    workspace_token = _normalize_token(workspace_id)
    machine_token = _normalize_token(machine_id)
    capability_token = _normalize_token(capability_id)
    with _LOCK:
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


def is_capability_disabled(
    capability_id: str,
    *,
    workspace_id: str | None = None,
    machine_id: str | None = None,
) -> bool:
    token = _normalize_token(capability_id)
    if not token:
        return False
    workspace_token = _normalize_token(workspace_id)
    machine_token = _normalize_token(machine_id)
    with _LOCK:
        if bool(_GLOBAL_KILL_SWITCH.enabled):
            return True
        if workspace_token and bool((_WORKSPACE_KILL_SWITCHES.get(workspace_token) or KillSwitchState(False)).enabled):
            return True
        if machine_token and bool((_MACHINE_KILL_SWITCHES.get(machine_token) or KillSwitchState(False)).enabled):
            return True
        if bool((_CAPABILITY_KILL_SWITCHES.get(token) or KillSwitchState(False)).enabled):
            return True
        if bool(_GLOBAL_SAFE_MODE.enabled) and _is_unsafe_capability(token):
            return True
        workspace_safe = _WORKSPACE_SAFE_MODE.get(workspace_token) if workspace_token else None
        if isinstance(workspace_safe, SafeModeState) and workspace_safe.enabled and _is_unsafe_capability(token):
            return True
        machine_safe = _MACHINE_SAFE_MODE.get(machine_token) if machine_token else None
        if isinstance(machine_safe, SafeModeState) and machine_safe.enabled and _is_unsafe_capability(token):
            return True
    return False


def state_snapshot() -> Dict[str, Any]:
    with _LOCK:
        return {
            "safe_mode": {
                "global": _clone_safe_mode(_GLOBAL_SAFE_MODE),
                "workspace": {key: _clone_safe_mode(value) for key, value in _WORKSPACE_SAFE_MODE.items()},
                "machine": {key: _clone_safe_mode(value) for key, value in _MACHINE_SAFE_MODE.items()},
            },
            "kill_switches": {
                "global": _clone_kill_switch(_GLOBAL_KILL_SWITCH),
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
        _WORKSPACE_SAFE_MODE.clear()
        _MACHINE_SAFE_MODE.clear()
        _GLOBAL_KILL_SWITCH.enabled = False
        _GLOBAL_KILL_SWITCH.reason = ""
        _GLOBAL_KILL_SWITCH.metadata = {}
        _WORKSPACE_KILL_SWITCHES.clear()
        _MACHINE_KILL_SWITCHES.clear()
        _CAPABILITY_KILL_SWITCHES.clear()
