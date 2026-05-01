from __future__ import annotations

from typing import Any, Dict, List


EXECUTION_MODE_POLICY_VERSION = "2026-05-01"

SUPPORTED_EXECUTION_MODES = (
    "default",
    "approval_mode",
    "autopilot",
    "full_access",
)

RUNTIME_TARGET_MODE_MATRIX: dict[str, tuple[str, ...]] = {
    "cloud_default": ("default", "approval_mode"),
    "sage_cloud_computer": ("default", "approval_mode", "autopilot"),
    "local_companion": ("default", "approval_mode", "autopilot", "full_access"),
    "self_host_runtime": ("default", "approval_mode", "autopilot"),
}

MODE_DEFINITIONS: dict[str, dict[str, Any]] = {
    "default": {
        "label": "Default",
        "description": "Sage can use obvious low-risk tools and asks before risky actions.",
        "destructive_actions_require_approval": True,
        "external_send_requires_approval": True,
        "dangerous_shell_requires_approval": True,
        "session_grant_allowed": False,
        "requires_explicit_selection": False,
        "requires_owner_approval": False,
    },
    "approval_mode": {
        "label": "Approvals",
        "description": "Sage asks before tools that touch private data, external channels, or execution surfaces.",
        "destructive_actions_require_approval": True,
        "external_send_requires_approval": True,
        "dangerous_shell_requires_approval": True,
        "session_grant_allowed": True,
        "requires_explicit_selection": True,
        "requires_owner_approval": False,
    },
    "autopilot": {
        "label": "Autopilot",
        "description": "Sage can continue a task in an isolated or policy-scoped runtime, with destructive actions still gated.",
        "destructive_actions_require_approval": True,
        "external_send_requires_approval": True,
        "dangerous_shell_requires_approval": True,
        "session_grant_allowed": True,
        "requires_explicit_selection": True,
        "requires_owner_approval": False,
    },
    "full_access": {
        "label": "Full Access",
        "description": "Sage can use the paired physical computer with elevated device capabilities for this session.",
        "destructive_actions_require_approval": True,
        "external_send_requires_approval": True,
        "dangerous_shell_requires_approval": True,
        "session_grant_allowed": True,
        "requires_explicit_selection": True,
        "requires_owner_approval": True,
    },
}


def mode_contract_for_target(target_id: str) -> List[Dict[str, Any]]:
    target = str(target_id or "").strip()
    allowed = set(RUNTIME_TARGET_MODE_MATRIX.get(target, ("default", "approval_mode")))
    contracts: List[Dict[str, Any]] = []
    for mode_id in SUPPORTED_EXECUTION_MODES:
        definition = dict(MODE_DEFINITIONS[mode_id])
        available = mode_id in allowed
        if mode_id == "full_access" and target != "local_companion":
            available = False
        if mode_id == "autopilot" and target == "local_companion":
            definition["requires_owner_approval"] = True
            definition["description"] = (
                "Sage can continue a task on the paired physical computer only after explicit owner approval."
            )
        contracts.append({
            "id": mode_id,
            **definition,
            "available": available,
            "runtime_target_id": target,
        })
    return contracts


def routing_contract_summary() -> Dict[str, Any]:
    return {
        "execution_mode_policy_version": EXECUTION_MODE_POLICY_VERSION,
        "supported_execution_modes": list(SUPPORTED_EXECUTION_MODES),
        "full_access_scope": "local_companion_only",
        "cloud_computer_mode": "autopilot_with_metering_and_policy_approvals",
        "destructive_actions_require_approval": True,
        "external_send_requires_approval": True,
    }
