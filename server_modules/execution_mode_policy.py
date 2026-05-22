from __future__ import annotations

from typing import Any, Dict, List


EXECUTION_MODE_POLICY_VERSION = "2026-05-23"

GUARDED_RUNTIME_ACCESS_MODE = "default_guarded"
FULL_RUNTIME_ACCESS_MODE = "full_access"
FULL_RUNTIME_ACCESS_PUBLIC_LABEL = "Autonomous Agent"

SUPPORTED_EXECUTION_MODES = (
    "default",
    "approval_mode",
    "autopilot",
    "full_access",
)

RUNTIME_TARGET_MODE_MATRIX: dict[str, tuple[str, ...]] = {
    "cloud_default": ("default", "approval_mode"),
    "sage_cloud_computer": ("default", "approval_mode", "autopilot", "full_access"),
    "empyralis_cloud_computer": ("default", "approval_mode", "autopilot", "full_access"),
    "local_companion": ("default", "approval_mode", "autopilot", "full_access"),
    "user_device_gateway": ("default", "approval_mode", "autopilot", "full_access"),
    "self_host_runtime": ("default", "approval_mode", "autopilot", "full_access"),
    "self_hosted_node": ("default", "approval_mode", "autopilot", "full_access"),
}

MODE_DEFINITIONS: dict[str, dict[str, Any]] = {
    "default": {
        "label": "Default",
        "description": "Sage can use obvious low-risk tools and asks before risky actions.",
        "destructive_actions_require_approval": True,
        "external_send_requires_approval": True,
        "dangerous_shell_requires_approval": True,
        "runtime_access_mode": GUARDED_RUNTIME_ACCESS_MODE,
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
        "runtime_access_mode": GUARDED_RUNTIME_ACCESS_MODE,
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
        "runtime_access_mode": GUARDED_RUNTIME_ACCESS_MODE,
        "session_grant_allowed": True,
        "requires_explicit_selection": True,
        "requires_owner_approval": False,
    },
    "full_access": {
        "label": FULL_RUNTIME_ACCESS_PUBLIC_LABEL,
        "description": (
            "Sage can operate the selected dedicated runtime as an autonomous agent "
            "without Empyralis action-by-action approval prompts."
        ),
        "destructive_actions_require_approval": False,
        "external_send_requires_approval": False,
        "dangerous_shell_requires_approval": False,
        "runtime_access_mode": FULL_RUNTIME_ACCESS_MODE,
        "session_grant_allowed": True,
        "requires_explicit_selection": True,
        "requires_owner_approval": True,
        "setup_warning": (
            "Autonomous Agent lets the AI operate this dedicated runtime "
            "without Empyralis asking for each action. "
            "Only enable it for hardware or cloud compute you intentionally dedicate to the agent."
        ),
    },
}

EXECUTION_MODE_ACCESS_MODE: dict[str, str] = {
    mode_id: str(definition.get("runtime_access_mode") or GUARDED_RUNTIME_ACCESS_MODE)
    for mode_id, definition in MODE_DEFINITIONS.items()
}


def runtime_access_mode_for_execution_mode(execution_mode: Any) -> str:
    token = str(execution_mode or "").strip().lower()
    token = token.replace("-", "_").replace(" ", "_")
    if token in {
        FULL_RUNTIME_ACCESS_MODE,
        "autonomous_agent",
        "autonomous",
        "dedicated_agent",
        "agent_owned",
        "agent_owned_runtime",
    }:
        return FULL_RUNTIME_ACCESS_MODE
    return EXECUTION_MODE_ACCESS_MODE.get(token, GUARDED_RUNTIME_ACCESS_MODE)


def normalize_runtime_access_mode(value: Any, *, execution_mode: Any = None) -> str:
    token = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if token in {
        FULL_RUNTIME_ACCESS_MODE,
        "trusted_full_access",
        "agent_owned_full_access",
        "autonomous_agent",
        "autonomous",
        "dedicated_agent",
        "agent_owned",
        "agent_owned_runtime",
    }:
        return FULL_RUNTIME_ACCESS_MODE
    if token in {GUARDED_RUNTIME_ACCESS_MODE, "guarded", "default", "approval_mode", "autopilot"}:
        return GUARDED_RUNTIME_ACCESS_MODE
    return runtime_access_mode_for_execution_mode(execution_mode)


def public_runtime_access_label(value: Any) -> str:
    mode = normalize_runtime_access_mode(value)
    if mode == FULL_RUNTIME_ACCESS_MODE:
        return FULL_RUNTIME_ACCESS_PUBLIC_LABEL
    return "Default"


def runtime_access_setup_warning(value: Any) -> str | None:
    mode = normalize_runtime_access_mode(value)
    if mode == FULL_RUNTIME_ACCESS_MODE:
        return str(MODE_DEFINITIONS["full_access"].get("setup_warning") or "").strip() or None
    return None


def mode_contract_for_target(target_id: str) -> List[Dict[str, Any]]:
    target = str(target_id or "").strip()
    allowed = set(RUNTIME_TARGET_MODE_MATRIX.get(target, ("default", "approval_mode")))
    contracts: List[Dict[str, Any]] = []
    for mode_id in SUPPORTED_EXECUTION_MODES:
        definition = dict(MODE_DEFINITIONS[mode_id])
        available = mode_id in allowed
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
        "supported_runtime_access_modes": [
            GUARDED_RUNTIME_ACCESS_MODE,
            FULL_RUNTIME_ACCESS_MODE,
        ],
        "default_runtime_access_mode": GUARDED_RUNTIME_ACCESS_MODE,
        "full_access_public_label": FULL_RUNTIME_ACCESS_PUBLIC_LABEL,
        "autonomous_agent_runtime_access_mode": FULL_RUNTIME_ACCESS_MODE,
        "full_access_scope": "dedicated_runtime_targets",
        "cloud_computer_mode": "explicit_selection_with_metering_and_optional_autonomous_agent",
        "default_guarded_safe_actions": [
            "filesystem.read",
            "screenshot.capture",
            "browser_automation.interactive",
            "shell.execute.non_destructive",
        ],
        "full_access_empyralis_approval_prompts": False,
        "destructive_actions_require_approval": "default_guarded_only",
        "external_send_requires_approval": "default_guarded_only",
    }
