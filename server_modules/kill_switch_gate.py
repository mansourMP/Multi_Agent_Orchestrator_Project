from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Dict, Optional

_log = logging.getLogger(__name__)

_last_restart_time: float = time.time()

_EMPYRALIS_STATE_HOME = Path(
    os.getenv("EMPYRALIS_STATE_HOME", str(Path.home() / ".empyralis" / "state"))
).expanduser()
_KILL_SWITCH_FILE = _EMPYRALIS_STATE_HOME / "kill_switches.json"
_KILL_SWITCH_FILE_LOCK = Lock()


@dataclass(frozen=True, slots=True)
class KillSwitchDecision:
    blocked: bool
    reason: str
    scope: str
    detail: str = ""
    trace_id: str = ""


GLOBAL_KILL_KEY = "global_pilot"
AGENT_KILL_PREFIX = "agent:"
GATEWAY_KILL_PREFIX = "gateway:"


_KILL_STATE: Dict[str, bool] = {}
_RESOLVERS: list[Callable[[], Dict[str, bool]]] = []


def _read_kill_switches_from_file() -> Dict[str, bool]:
    try:
        _KILL_SWITCH_FILE.parent.mkdir(parents=True, exist_ok=True)
        if _KILL_SWITCH_FILE.exists():
            raw = json.loads(_KILL_SWITCH_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {str(k): bool(v) for k, v in raw.items()}
    except Exception:
        _log.warning("Failed to read kill switches from %s", _KILL_SWITCH_FILE, exc_info=True)
    return {}


def _write_kill_switches_to_file(state: Dict[str, bool]) -> None:
    try:
        _KILL_SWITCH_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = {str(k): bool(v) for k, v in state.items() if v}
        _KILL_SWITCH_FILE.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    except Exception:
        _log.warning("Failed to write kill switches to %s", _KILL_SWITCH_FILE, exc_info=True)


def _reload_kill_switches() -> None:
    """Restore persisted kill switches into in-memory state on startup."""
    persisted = _read_kill_switches_from_file()
    if persisted:
        _KILL_STATE.update(persisted)
        _log.warning(
            "Reloaded %d persisted kill switch(es) from %s after restart at %s: %s",
            len(persisted),
            _KILL_SWITCH_FILE,
            _last_restart_time,
            list(persisted.keys()),
        )
    else:
        _log.info("No persisted kill switches found at %s. State initialized empty.", _KILL_SWITCH_FILE)


def _file_resolver() -> Dict[str, bool]:
    return _read_kill_switches_from_file()


def set_kill_switch(key: str, *, active: bool = True) -> None:
    _KILL_STATE[key] = active
    with _KILL_SWITCH_FILE_LOCK:
        _write_kill_switches_to_file(_KILL_STATE)
    _log.error("Kill switch SET: key=%s active=%s", key, active)


def clear_kill_switch(key: str) -> None:
    _KILL_STATE.pop(key, None)
    with _KILL_SWITCH_FILE_LOCK:
        _write_kill_switches_to_file(_KILL_STATE)
    _log.error("Kill switch CLEARED: key=%s", key)


def is_kill_active(key: str) -> bool:
    if key in _KILL_STATE:
        return _KILL_STATE[key]
    for resolver in _RESOLVERS:
        try:
            external = resolver()
            if key in external:
                return external[key]
        except Exception:
            pass
    return False


def register_kill_resolver(resolver: Callable[[], Dict[str, bool]]) -> None:
    if resolver not in _RESOLVERS:
        _RESOLVERS.append(resolver)


def get_kill_switch_restart_info() -> dict:
    """Return restart metadata so operators can detect kill-switch state changes."""
    return {
        "last_restart_time": _last_restart_time,
        "persisted_file": str(_KILL_SWITCH_FILE),
        "active_keys": [k for k, v in _KILL_STATE.items() if v],
    }


def evaluate_kill_switch(
    *,
    workspace_id: str = "",
    agent_id: str = "",
    gateway_id: str = "",
    trace_id: str = "",
) -> KillSwitchDecision:
    if is_kill_active(GLOBAL_KILL_KEY):
        return KillSwitchDecision(
            blocked=True,
            reason="global_kill_active",
            scope="global",
            detail="The platform is in emergency stop mode. All operations are blocked.",
            trace_id=trace_id,
        )

    if agent_id and is_kill_active(f"{AGENT_KILL_PREFIX}{agent_id}"):
        return KillSwitchDecision(
            blocked=True,
            reason="agent_kill_active",
            scope="agent",
            detail=f"Agent {agent_id} has been stopped by its owner.",
            trace_id=trace_id,
        )

    if gateway_id and is_kill_active(f"{GATEWAY_KILL_PREFIX}{gateway_id}"):
        return KillSwitchDecision(
            blocked=True,
            reason="gateway_kill_active",
            scope="gateway",
            detail=f"Gateway {gateway_id} has been stopped.",
            trace_id=trace_id,
        )

    return KillSwitchDecision(blocked=False, reason="", scope="", trace_id=trace_id)


def assert_not_killed(
    *,
    workspace_id: str = "",
    agent_id: str = "",
    gateway_id: str = "",
    trace_id: str = "",
) -> None:
    decision = evaluate_kill_switch(
        workspace_id=workspace_id,
        agent_id=agent_id,
        gateway_id=gateway_id,
        trace_id=trace_id,
    )
    if decision.blocked:
        from server_modules import security_audit_service

        try:
            security_audit_service.emit_security_audit_event(
                action="kill_switch.denied",
                status="blocked",
                tenant_id="",
                workspace_id=workspace_id,
                detail=decision.detail,
                metadata={
                    "reason": decision.reason,
                    "scope": decision.scope,
                    "agent_id": agent_id or None,
                    "gateway_id": gateway_id or None,
                },
            )
        except Exception:
            pass
        raise KillSwitchBlockedError(decision)


class KillSwitchBlockedError(Exception):
    def __init__(self, decision: KillSwitchDecision):
        self.decision = decision
        super().__init__(decision.detail)


_reload_kill_switches()
register_kill_resolver(_file_resolver)
