from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional


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


def set_kill_switch(key: str, *, active: bool = True) -> None:
    _KILL_STATE[key] = active


def clear_kill_switch(key: str) -> None:
    _KILL_STATE.pop(key, None)


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


def evaluate_kill_switch(
    *,
    workspace_id: str = "",
    agent_id: str = "",
    gateway_id: str = "",
) -> KillSwitchDecision:
    if is_kill_active(GLOBAL_KILL_KEY):
        return KillSwitchDecision(
            blocked=True,
            reason="global_kill_active",
            scope="global",
            detail="The platform is in emergency stop mode. All operations are blocked.",
            trace_id="",
        )

    if agent_id and is_kill_active(f"{AGENT_KILL_PREFIX}{agent_id}"):
        return KillSwitchDecision(
            blocked=True,
            reason="agent_kill_active",
            scope="agent",
            detail=f"Agent {agent_id} has been stopped by its owner.",
            trace_id="",
        )

    if gateway_id and is_kill_active(f"{GATEWAY_KILL_PREFIX}{gateway_id}"):
        return KillSwitchDecision(
            blocked=True,
            reason="gateway_kill_active",
            scope="gateway",
            detail=f"Gateway {gateway_id} has been stopped.",
            trace_id="",
        )

    return KillSwitchDecision(blocked=False, reason="", scope="")


def assert_not_killed(
    *,
    workspace_id: str = "",
    agent_id: str = "",
    gateway_id: str = "",
) -> None:
    decision = evaluate_kill_switch(
        workspace_id=workspace_id,
        agent_id=agent_id,
        gateway_id=gateway_id,
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
