from __future__ import annotations

import json
from typing import Any, Dict, Optional

from server_modules import (
    activity_ledger_service,
    control_plane_repository,
    deployed_agent_config_schema,
    deployed_agent_runtime_contract_service,
    session_service,
    virtual_computer_runtime,
)


DEFAULT_RECORDING_RETENTION_SECONDS = 30 * 24 * 60 * 60
DEFAULT_IDLE_TIMEOUT_SECONDS = 10 * 60
DEFAULT_MAX_RUNTIME_SECONDS = 60 * 60
DEFAULT_PROVIDER_COST_ESTIMATE = 1.0
DEFAULT_APPROVAL_ROLES = ["owner", "admin"]
PRIVACY_CONTRACT_REQUIRED_KEYS = {
    "where_it_runs",
    "model_provider_data_access",
    "screenshots_captured",
    "files_accessible",
    "terminal_accessible",
    "connectors_accessible",
    "memory_scope",
    "retention_period",
    "export_delete_policy",
    "audit_log",
}
COMPUTER_SAFETY_REQUIRED_KEYS = {
    "enabled",
    "required_for_mode",
    "studio_agent_mode",
    "isolation_boundary",
    "inherit_host_environment",
    "filesystem_default_access",
    "domain_allowlist",
    "download_install_policy",
    "terminal_command_policy",
    "sensitive_action_confirmation_required",
    "session_timeout_seconds",
    "max_runtime_seconds",
    "screenshot_session_recording",
    "emergency_stop_enabled",
    "required_owner_approval_actions",
}
DISABLED_RECORDING_POLICIES = {"disabled", "off", "none"}
COMPUTER_RUNTIME_MODES = {
    deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_CLOUD_COMPUTER,
    deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_MY_COMPUTER,
}
_RUNTIME_REGISTRY = virtual_computer_runtime.build_default_runtime_registry()
_FORBIDDEN_POLICY_OVERRIDE_KEYS = {
    "computer_automation",
    "cost_quota",
    "runtime_quota",
    "network_policy",
    "enterprise_controls",
    "runtime_kill_state",
    "session_recording",
    "policy_metadata",
    "runtime_provider_id",
    "runtime_choice",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, (list, tuple)) else []


def _session_ctx_payload(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _positive_float(value: Any, default: float) -> float:
    try:
        resolved = float(value)
    except Exception:
        return float(default)
    return resolved if resolved > 0 else float(default)


def _positive_int(value: Any, default: int) -> int:
    try:
        resolved = int(value)
    except Exception:
        return int(default)
    return resolved if resolved > 0 else int(default)


def _runtime_choice_for_config(config: deployed_agent_config_schema.DeployedAgentConfig) -> str:
    runtime_class = _text(config.computer_automation.runtime_class).lower()
    if runtime_class == "virtual_browser":
        return "virtual_browser"
    if runtime_class == "virtual_desktop":
        return "virtual_desktop"
    if runtime_class == "virtual_code_sandbox":
        return "virtual_code_sandbox"
    if runtime_class in {"local_browser", "local_desktop"}:
        return "local"

    mode = _text(config.studio_agent_mode).lower()
    if mode == deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_CLOUD_COMPUTER:
        return "virtual_browser"
    if mode == deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_MY_COMPUTER:
        return "local"
    if mode == deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_SELF_HOSTED:
        return "virtual_code_sandbox"
    return ""


def _recording_retention_seconds(config: deployed_agent_config_schema.DeployedAgentConfig) -> int:
    automation = config.computer_automation
    policy = _text(automation.session_recording_policy).lower()
    if not automation.enabled or policy in DISABLED_RECORDING_POLICIES:
        return 0
    return DEFAULT_RECORDING_RETENTION_SECONDS


def _session_recording_enabled(config: deployed_agent_config_schema.DeployedAgentConfig) -> bool:
    automation = config.computer_automation
    policy = _text(automation.session_recording_policy).lower()
    return bool(automation.enabled) and policy not in DISABLED_RECORDING_POLICIES


def _validate_privacy_contract_snapshot(snapshot: Any) -> bool:
    return isinstance(snapshot, dict) and PRIVACY_CONTRACT_REQUIRED_KEYS.issubset(set(snapshot.keys()))


def _validate_computer_safety_contract_snapshot(snapshot: Any, *, require_for_mode: bool) -> bool:
    if not isinstance(snapshot, dict):
        return False
    if not COMPUTER_SAFETY_REQUIRED_KEYS.issubset(set(snapshot.keys())):
        return False
    if bool(snapshot.get("inherit_host_environment")):
        return False
    filesystem_default_access = _text(snapshot.get("filesystem_default_access")).lower()
    if filesystem_default_access not in {"none", "session_scoped", "workspace_scoped"}:
        return False
    terminal_policy = _text(snapshot.get("terminal_command_policy")).lower()
    if terminal_policy not in {"blocked", "allowlist", "review_required"}:
        return False
    if not bool(snapshot.get("sensitive_action_confirmation_required")):
        return False
    if int(snapshot.get("session_timeout_seconds") or 0) <= 0:
        return False
    if int(snapshot.get("max_runtime_seconds") or 0) <= 0:
        return False
    if not bool(snapshot.get("emergency_stop_enabled")):
        return False
    if require_for_mode and not bool(snapshot.get("required_for_mode")):
        return False
    return True


def _require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def _validated_contract_snapshots(
    record: Dict[str, Any],
    config: deployed_agent_config_schema.DeployedAgentConfig,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    metadata = _coerce_dict(record.get("metadata"))
    privacy_snapshot = _coerce_dict(metadata.get("privacy_contract_snapshot"))
    computer_safety_snapshot = _coerce_dict(metadata.get("computer_safety_contract_snapshot"))
    mode = _text(config.studio_agent_mode).lower()
    requires_computer_runtime = mode in COMPUTER_RUNTIME_MODES

    _require(
        _validate_privacy_contract_snapshot(privacy_snapshot),
        "Complete privacy_contract_snapshot is required for deployed runtime policy.",
    )
    if requires_computer_runtime:
        _require(
            _validate_computer_safety_contract_snapshot(
                computer_safety_snapshot,
                require_for_mode=True,
            ),
            "Complete computer_safety_contract_snapshot is required for computer runtime policy.",
        )
    return privacy_snapshot, computer_safety_snapshot


def _validate_required_runtime_policy_fields(
    config: deployed_agent_config_schema.DeployedAgentConfig,
    computer_safety_snapshot: Dict[str, Any],
) -> None:
    mode = _text(config.studio_agent_mode).lower()
    if mode not in COMPUTER_RUNTIME_MODES:
        return

    automation = config.computer_automation
    allowed_domains = list(automation.allowed_domains or [])
    _require(len(allowed_domains) > 0, "computer_automation.allowed_domains is required for computer runtime policy.")
    _require(automation.daily_budget_usd is not None, "computer_automation.daily_budget_usd is required for computer runtime policy.")
    _require(
        automation.monthly_budget_usd is not None,
        "computer_automation.monthly_budget_usd is required for computer runtime policy.",
    )
    _require(
        config.commerce_policy.monthly_cost_cap_usd is not None,
        "commerce_policy.monthly_cost_cap_usd is required for computer runtime policy.",
    )
    recording_policy = _text(automation.session_recording_policy).lower()
    _require(
        recording_policy not in DISABLED_RECORDING_POLICIES,
        "computer_automation.session_recording_policy must enable session recording for computer runtime policy.",
    )

    snapshot_allowlist = [str(item).strip() for item in _coerce_list(computer_safety_snapshot.get("domain_allowlist")) if str(item).strip()]
    snapshot_recording = _coerce_dict(computer_safety_snapshot.get("screenshot_session_recording"))
    snapshot_recording_policy = _text(snapshot_recording.get("recording_policy")).lower()

    _require(len(snapshot_allowlist) > 0, "computer_safety_contract_snapshot.domain_allowlist is required for computer runtime policy.")
    _require(
        snapshot_recording_policy not in DISABLED_RECORDING_POLICIES,
        "computer_safety_contract_snapshot.screenshot_session_recording.recording_policy must enable session recording.",
    )
    _require(
        int(computer_safety_snapshot.get("max_runtime_seconds") or 0) > 0,
        "computer_safety_contract_snapshot.max_runtime_seconds is required for computer runtime policy.",
    )
    _require(
        int(computer_safety_snapshot.get("session_timeout_seconds") or 0) > 0,
        "computer_safety_contract_snapshot.session_timeout_seconds is required for computer runtime policy.",
    )


def _runtime_kill_state(deployed_agent: Dict[str, Any]) -> Dict[str, Any]:
    metadata = _coerce_dict(deployed_agent.get("metadata"))
    kill_switch = _coerce_dict(metadata.get("kill_switch"))
    workspace_emergency_stop = _coerce_dict(metadata.get("workspace_emergency_stop"))
    deployment_state = _text(deployed_agent.get("deployment_state")).lower() or "draft"
    return {
        "deployment_state": deployment_state,
        "kill_switch_active": bool(kill_switch.get("active")),
        "workspace_emergency_stop_active": bool(workspace_emergency_stop.get("active")),
        "kill_switch_reason": _text(kill_switch.get("reason")) or None,
        "workspace_emergency_stop_reason": _text(workspace_emergency_stop.get("reason")) or None,
    }


async def _append_cloud_runtime_audit_event(
    *,
    deployed_agent: Dict[str, Any],
    tenant_id: Any,
    workspace_id: Any,
    action: str,
    title: str,
    summary: str,
    status: str = "logged",
    event_class: str = "system_activity",
    review_required: bool = False,
    payload: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    if not isinstance(deployed_agent, dict):
        return
    deployed_agent_id = _text(deployed_agent.get("id"))
    if not deployed_agent_id:
        return
    config = deployed_agent_config_schema.deployed_agent_config_from_record(deployed_agent)
    snapshot_metadata = _coerce_dict(deployed_agent.get("metadata"))
    privacy_snapshot = _coerce_dict(snapshot_metadata.get("privacy_contract_snapshot"))
    computer_snapshot = _coerce_dict(snapshot_metadata.get("computer_safety_contract_snapshot"))
    event_metadata = {
        "deployed_agent_id": deployed_agent_id,
        "deployment_state": _text(deployed_agent.get("deployment_state")).lower() or "draft",
        "runtime_selected": {
            "studio_agent_mode": config.studio_agent_mode,
            "runtime_target": config.runtime_target,
            "runtime_placement": config.runtime_placement,
        },
        "privacy_contract_version": int(privacy_snapshot.get("schema_version") or 0) or None,
        "computer_safety_contract_version": int(computer_snapshot.get("schema_version") or 0) or None,
        "audit_version": 1,
    }
    event_metadata.update(_coerce_dict(metadata))
    await activity_ledger_service.append_activity_event(
        tenant_id=_text(tenant_id),
        workspace_id=_text(workspace_id),
        actor_type="deployed_agent",
        actor_id=deployed_agent_id,
        install_id=_text(deployed_agent.get("backing_install_id")) or None,
        event_class=event_class,
        detail_level="audit_reference",
        action=action,
        title=title,
        summary=summary,
        status=status,
        review_required=bool(review_required),
        payload=_coerce_dict(payload),
        metadata=event_metadata,
    )


def build_deployed_agent_virtual_runtime_payload(
    deployed_agent: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    record = dict(deployed_agent or {})
    config = deployed_agent_config_schema.deployed_agent_config_from_record(record)
    privacy_snapshot, computer_safety_snapshot = _validated_contract_snapshots(record, config)
    _validate_required_runtime_policy_fields(config, computer_safety_snapshot)
    automation = config.computer_automation
    runtime_choice = _runtime_choice_for_config(config)
    allowed_domains = [str(item).strip() for item in _coerce_list(computer_safety_snapshot.get("domain_allowlist")) if str(item).strip()] or list(automation.allowed_domains or [])
    concurrency_limit = _positive_int(automation.max_concurrent_sessions, 1)
    idle_timeout_seconds = _positive_int(
        computer_safety_snapshot.get("session_timeout_seconds") or automation.idle_timeout_seconds,
        DEFAULT_IDLE_TIMEOUT_SECONDS,
    )
    max_runtime_seconds = _positive_int(
        computer_safety_snapshot.get("max_runtime_seconds") or automation.max_session_runtime_seconds,
        DEFAULT_MAX_RUNTIME_SECONDS,
    )
    per_session_cost_limit = _positive_float(
        automation.daily_budget_usd
        or automation.monthly_budget_usd
        or config.commerce_policy.monthly_cost_cap_usd,
        DEFAULT_PROVIDER_COST_ESTIMATE,
    )
    workspace_monthly_budget_limit = _positive_float(
        config.commerce_policy.monthly_cost_cap_usd
        or automation.monthly_budget_usd
        or automation.daily_budget_usd,
        per_session_cost_limit,
    )
    agent_monthly_budget_limit = _positive_float(
        automation.monthly_budget_usd
        or config.commerce_policy.monthly_cost_cap_usd
        or automation.daily_budget_usd,
        per_session_cost_limit,
    )
    long_task_cost_estimate_threshold = min(
        float(agent_monthly_budget_limit),
        max(float(per_session_cost_limit) * 0.25, 1.0),
    )
    recording_policy = _text(_coerce_dict(computer_safety_snapshot.get("screenshot_session_recording")).get("recording_policy")).lower()
    recording_retention_seconds = _recording_retention_seconds(config)
    risk_policy = {
        "red_policy": "owner_approval" if automation.requires_owner_approval else "block",
        "allow_orange_without_approval": False,
        "deny_wins": True,
        "deny_classes": [],
    }
    network_policy = {
        "allowed_domains": allowed_domains,
        "denied_domains": [],
        "detect_phishing_pages": True,
        "block_auto_download_without_approval": True,
        "enforce_domain_bound_credential_injection": True,
    }
    enterprise_controls = {
        "workspace_admin_policy": {
            "require_workspace_admin_for_runtime": False,
        },
        "domain_allowlist": allowed_domains,
        "data_residency": _text(_coerce_dict(privacy_snapshot.get("where_it_runs")).get("trust_zone")) or "unspecified",
        "disable_public_internet_mode": bool(allowed_domains),
        "allow_audit_export": bool(_coerce_dict(privacy_snapshot.get("audit_log")).get("available")),
        "sso_required": False,
        "per_team_approval_roles": list(DEFAULT_APPROVAL_ROLES),
        "session_recording_retention_seconds": int(recording_retention_seconds),
    }
    session_recording = {
        "enabled": recording_policy not in DISABLED_RECORDING_POLICIES,
        "provider": "deployed_agent_runtime_policy",
        "policy": recording_policy or _text(automation.session_recording_policy).lower() or "metadata_only",
        "screenshots_enabled": bool(
            _coerce_dict(computer_safety_snapshot.get("screenshot_session_recording")).get("screenshots_enabled")
        ),
    }
    policy_metadata = {
        "source": "deployed_agent_virtual_runtime_service",
        "policy_mode": "strict",
        "deployed_agent_id": _text(record.get("id")) or None,
        "backing_install_id": _text(record.get("backing_install_id")) or None,
        "studio_agent_mode": config.studio_agent_mode,
        "runtime_target": config.runtime_target,
        "runtime_profile_id": _text(config.runtime_profile_id) or None,
        "provider": _text(config.provider) or None,
        "model": _text(config.model) or None,
        "memory_enabled": bool(config.memory_policy.memory_enabled),
        "enabled_tools": list(config.tool_policy.enabled_tools or []),
        "privacy_contract_snapshot_version": privacy_snapshot.get("schema_version"),
        "computer_safety_contract_snapshot_version": computer_safety_snapshot.get("schema_version"),
        "privacy_contract_accepted_at": privacy_snapshot.get("accepted_at"),
        "virtual_computer_risk_policy": risk_policy,
        "computer_action_policy": {
            "owner_machine_trusted": False,
            "trusted_owner_machine_ids": [],
        },
    }
    cost_quota = {
        "cost_unit": "usd",
        "per_session_cost_limit": float(per_session_cost_limit),
        "workspace_budget_limit": float(workspace_monthly_budget_limit),
        "workspace_monthly_budget_limit": float(workspace_monthly_budget_limit),
        "agent_monthly_budget_limit": float(agent_monthly_budget_limit),
        "per_session_runtime_seconds": int(max_runtime_seconds),
        "agent_runtime_budget_seconds": int(max_runtime_seconds * max(concurrency_limit, 1)),
        "provider_concurrency_limit": int(concurrency_limit),
        "workspace_concurrency_limit": int(concurrency_limit),
        "agent_concurrency_limit": int(concurrency_limit),
        "idle_timeout_seconds": int(idle_timeout_seconds),
        "estimated_create_cost": float(DEFAULT_PROVIDER_COST_ESTIMATE),
        "estimated_action_cost": float(DEFAULT_PROVIDER_COST_ESTIMATE),
        "long_task_cost_estimate_threshold": float(long_task_cost_estimate_threshold),
        "budget_threshold_ratio": 0.90,
        "budget_threshold_action": "pause",
    }
    runtime_quota = {
        "max_concurrent_sessions": int(concurrency_limit),
        "provider_concurrency_limit": int(concurrency_limit),
        "workspace_concurrency_limit": int(concurrency_limit),
        "agent_concurrency_limit": int(concurrency_limit),
        "max_session_runtime_seconds": int(max_runtime_seconds),
        "idle_timeout_seconds": int(idle_timeout_seconds),
    }
    payload = {
        "runtime_choice": runtime_choice,
        "runtime_provider_id": _text(_coerce_dict(config.runtime_supply.get("provider_binding")).get("internal_provider")) or None,
        "computer_automation": automation.model_dump(exclude_none=True),
        "cost_quota": cost_quota,
        "runtime_quota": runtime_quota,
        "network_policy": network_policy,
        "network_browser_policy": dict(network_policy),
        "enterprise_controls": enterprise_controls,
        "runtime_kill_state": _runtime_kill_state(record),
        "session_recording": session_recording,
        "session_recording_enabled": bool(session_recording["enabled"]),
        "policy_metadata": policy_metadata,
    }
    return payload


def get_runtime_registry() -> virtual_computer_runtime.VirtualComputerRuntimeRegistry:
    return _RUNTIME_REGISTRY


def _cloud_runtime_tool_action(
    *,
    connector_id: Any,
    action_id: Any,
    argument_payload: Any,
) -> tuple[str, Dict[str, Any]]:
    connector = _text(connector_id).lower()
    action = _text(action_id).lower()
    arguments = _coerce_dict(argument_payload)
    if connector == "browser":
        if action in {"navigate", "new_tab"}:
            url = _text(arguments.get("url"))
            if not url:
                raise RuntimeError(f"browser__{action} requires url.")
            return "open_url", {"url": url}
        if action == "download_file":
            url = _text(arguments.get("url"))
            if not url:
                raise RuntimeError("browser__download_file requires url.")
            return "download_artifact", {"url": url}
        if action == "screenshot":
            if _text(arguments.get("selector")):
                raise RuntimeError("Cloud Computer browser__screenshot does not support selector targeting.")
            return "screenshot", {}
        raise RuntimeError(
            f"Cloud Computer runtime does not support browser__{action}. Use runtime-safe computer/browser actions instead."
        )
    if connector == "computer":
        if action == "click":
            if arguments.get("x") is None or arguments.get("y") is None:
                raise RuntimeError("Cloud Computer computer__click requires x and y coordinates.")
            return "click", {"x": arguments.get("x"), "y": arguments.get("y")}
        if action == "type":
            text = str(arguments.get("text") or arguments.get("input") or "")
            if not text:
                raise RuntimeError("Cloud Computer computer__type requires text.")
            return "type", {"text": text}
        raise RuntimeError(
            f"Cloud Computer runtime does not support computer__{action}. Use supported runtime-safe actions only."
        )
    if connector == "shell" and action == "exec":
        command = str(arguments.get("command") or "")
        if not command.strip():
            raise RuntimeError("shell_exec requires command.")
        return "run_command", {"command": command}
    raise RuntimeError(f"Cloud Computer runtime does not support {connector}__{action}.")


def _cloud_runtime_result_text(
    *,
    connector_id: Any,
    action_id: Any,
    response: Dict[str, Any],
) -> str:
    connector = _text(connector_id).lower()
    action = _text(action_id).lower()
    if connector == "browser" and action == "screenshot":
        artifacts = response.get("artifacts") if isinstance(response.get("artifacts"), list) else []
        if artifacts:
            return json.dumps({"artifacts": artifacts, "action_result": response.get("action_result")}, ensure_ascii=False)
    return json.dumps(response, ensure_ascii=False)


def _bound_runtime_metadata_from_session_ctx(session_ctx: Any) -> Dict[str, Any]:
    payload = _session_ctx_payload(session_ctx)
    turn_request = _session_ctx_payload(payload.get("agent_turn_request"))
    turn_context_hints = _session_ctx_payload(turn_request.get("context_hints"))
    turn_metadata = _coerce_dict(turn_context_hints.get("metadata"))
    turn_session = _coerce_dict(turn_context_hints.get("session"))
    turn_session_metadata = _coerce_dict(turn_session.get("metadata"))
    merged = dict(payload)
    merged.update({key: value for key, value in turn_session_metadata.items() if value is not None})
    merged.update({key: value for key, value in turn_metadata.items() if value is not None})
    return merged


def has_cloud_runtime_session_binding(session_ctx: Any) -> bool:
    metadata = _bound_runtime_metadata_from_session_ctx(session_ctx)
    return _text(metadata.get("runtime_session_binding")).lower() == "cloud_computer_agent"


def _forbidden_policy_override_keys(argument_payload: Any) -> list[str]:
    payload = _coerce_dict(argument_payload)
    return sorted(key for key in _FORBIDDEN_POLICY_OVERRIDE_KEYS if key in payload)


async def ensure_cloud_runtime_session_binding(
    *,
    deployed_agent_id: Any,
    tenant_id: Any,
    workspace_id: Any,
    session_id: Any,
    thread_id: Any,
    channel: Any,
    actor: Any,
    session_metadata: Any = None,
    turn_metadata: Any = None,
    machine_target: Any = None,
) -> Optional[Dict[str, Any]]:
    resolved_deployed_agent_id = _text(deployed_agent_id)
    resolved_session_id = _text(session_id)
    resolved_workspace_id = _text(workspace_id)
    resolved_tenant_id = _text(tenant_id)
    if not resolved_deployed_agent_id or not resolved_session_id or not resolved_workspace_id or not resolved_tenant_id:
        return None

    current_session_metadata = _coerce_dict(session_metadata)
    current_turn_metadata = _coerce_dict(turn_metadata)
    existing_runtime_session_id = _text(
        current_session_metadata.get("runtime_session_id") or current_turn_metadata.get("runtime_session_id")
    )
    existing_runtime_binding = _text(
        current_session_metadata.get("runtime_session_binding") or current_turn_metadata.get("runtime_session_binding")
    ).lower()
    if existing_runtime_session_id and existing_runtime_binding == "cloud_computer_agent":
        return {
            "deployed_agent": None,
            "runtime_payload": None,
            "runtime_response": None,
            "metadata_updates": {
                "runtime_session_id": existing_runtime_session_id,
                "runtime_session_binding": "cloud_computer_agent",
            },
        }

    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        resolved_deployed_agent_id,
        tenant_id=resolved_tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        raise ValueError("Deployed agent not found for runtime session binding.")

    config = deployed_agent_config_schema.deployed_agent_config_from_record(deployed_agent)
    if _text(config.studio_agent_mode).lower() != deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_CLOUD_COMPUTER:
        return None

    payload = build_deployed_agent_virtual_runtime_payload(deployed_agent)
    payload.update(
        {
            "tenant_id": resolved_tenant_id,
            "workspace_id": resolved_workspace_id,
            "agent_id": resolved_deployed_agent_id,
            "run_id": resolved_session_id,
            "session_id": resolved_session_id,
            "thread_id": _text(thread_id) or resolved_session_id,
            "channel": _text(channel) or "channel",
            "actor": dict(actor) if isinstance(actor, dict) else {},
            "machine_target": _text(machine_target) or None,
            "app_title": _text(deployed_agent.get("name")) or "Cloud Computer Agent",
            "metadata": {
                "deployed_agent_id": resolved_deployed_agent_id,
                "session_id": resolved_session_id,
                "thread_id": _text(thread_id) or resolved_session_id,
                "runtime_session_binding": "cloud_computer_agent",
            },
        }
    )
    runtime = get_runtime_registry().resolve(
        payload.get("runtime_choice"),
        preferred_provider_id=payload.get("runtime_provider_id"),
    )
    response = await runtime.create_session(payload)
    browser_session = response.get("browser_session") if isinstance(response.get("browser_session"), dict) else {}
    runtime_session_id = _text(browser_session.get("browser_session_id") or response.get("session_id") or payload.get("session_id"))
    if not runtime_session_id:
        raise ValueError("Virtual runtime session did not return a session id.")

    metadata_updates = {
        "deployed_agent_id": resolved_deployed_agent_id,
        "runtime_session_id": runtime_session_id,
        "runtime_session_binding": "cloud_computer_agent",
        "runtime_choice": _text(payload.get("runtime_choice")) or None,
        "runtime_provider_id": _text(response.get("provider_id") or payload.get("runtime_provider_id")) or None,
        "runtime_provider_kind": _text(response.get("provider_kind")) or None,
        "virtual_runtime_bound": True,
    }
    await _append_cloud_runtime_audit_event(
        deployed_agent=deployed_agent,
        tenant_id=resolved_tenant_id,
        workspace_id=resolved_workspace_id,
        action="deployed_agent_cloud_runtime_session_created",
        title="Cloud Computer session created",
        summary="Cloud Computer runtime session was created for deployed agent execution.",
        payload={
            "session_id": resolved_session_id,
            "runtime_session_id": runtime_session_id,
            "runtime_choice": _text(payload.get("runtime_choice")) or None,
            "runtime_provider_id": _text(response.get("provider_id") or payload.get("runtime_provider_id")) or None,
        },
        metadata={
            "runtime_session_binding": "cloud_computer_agent",
            "runtime_provider_kind": _text(response.get("provider_kind")) or None,
        },
    )
    return {
        "deployed_agent": deployed_agent,
        "runtime_payload": payload,
        "runtime_response": response,
        "metadata_updates": {key: value for key, value in metadata_updates.items() if value is not None},
    }


async def execute_bound_cloud_runtime_tool_call(
    *,
    connector_id: Any,
    action_id: Any,
    argument_payload: Any,
    workspace_id: Any,
    thread_id: Any,
    session_ctx: Any = None,
) -> Optional[str]:
    metadata = _bound_runtime_metadata_from_session_ctx(session_ctx)
    if _text(metadata.get("runtime_session_binding")).lower() != "cloud_computer_agent":
        return None

    deployed_agent_id = _text(metadata.get("deployed_agent_id"))
    runtime_session_id = _text(metadata.get("runtime_session_id"))
    tenant_id = _text(metadata.get("tenant_id"))
    resolved_workspace_id = _text(workspace_id) or _text(metadata.get("workspace_id"))
    resolved_thread_id = _text(thread_id) or _text(metadata.get("thread_id"))
    if not deployed_agent_id:
        raise RuntimeError("Cloud Computer tool execution is missing deployed_agent_id.")
    if not runtime_session_id:
        raise RuntimeError("Cloud Computer tool execution is missing runtime_session_id.")
    if not tenant_id or not resolved_workspace_id:
        raise RuntimeError("Cloud Computer tool execution is missing runtime scope.")

    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        raise RuntimeError("Cloud Computer tool execution could not load deployed agent.")

    config = deployed_agent_config_schema.deployed_agent_config_from_record(deployed_agent)
    if _text(config.studio_agent_mode).lower() != deployed_agent_runtime_contract_service.STUDIO_AGENT_MODE_CLOUD_COMPUTER:
        return None

    rejected_override_keys = _forbidden_policy_override_keys(argument_payload)
    if rejected_override_keys:
        await _append_cloud_runtime_audit_event(
            deployed_agent=deployed_agent,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            action="deployed_agent_cloud_runtime_policy_override_rejected",
            title="Cloud Computer policy override rejected",
            summary="Raw tool-call payload attempted to override backend Cloud Computer policy.",
            status="blocked",
            event_class="blocked_action",
            review_required=True,
            payload={
                "runtime_session_id": runtime_session_id,
                "rejected_keys": list(rejected_override_keys),
                "connector_id": _text(connector_id).lower() or None,
                "action_id": _text(action_id).lower() or None,
            },
            metadata={"runtime_session_binding": "cloud_computer_agent"},
        )
        raise RuntimeError(
            f"Cloud Computer runtime rejected raw policy override payload: {', '.join(rejected_override_keys)}."
        )

    runtime_action, runtime_action_args = _cloud_runtime_tool_action(
        connector_id=connector_id,
        action_id=action_id,
        argument_payload=argument_payload,
    )
    payload = build_deployed_agent_virtual_runtime_payload(deployed_agent)
    payload.update(
        {
            "tenant_id": tenant_id,
            "workspace_id": resolved_workspace_id,
            "agent_id": deployed_agent_id,
            "run_id": _text(metadata.get("run_id")) or runtime_session_id,
            "thread_id": resolved_thread_id or runtime_session_id,
            "session_id": runtime_session_id,
            "browser_session_id": runtime_session_id,
            "runtime_session_id": runtime_session_id,
            "action": runtime_action,
            "action_args": runtime_action_args,
            "metadata": {
                "deployed_agent_id": deployed_agent_id,
                "runtime_session_binding": "cloud_computer_agent",
                "runtime_session_id": runtime_session_id,
                "thread_id": resolved_thread_id or runtime_session_id,
            },
        }
    )
    runtime = get_runtime_registry().resolve(
        payload.get("runtime_choice"),
        preferred_provider_id=payload.get("runtime_provider_id"),
    )
    try:
        response = await runtime.execute_action(payload)
    except Exception as exc:
        reason = str(exc)
        await _append_cloud_runtime_audit_event(
            deployed_agent=deployed_agent,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            action="deployed_agent_cloud_runtime_action_denied",
            title="Cloud Computer action denied",
            summary="Cloud Computer runtime denied an action before execution.",
            status="blocked",
            event_class="blocked_action",
            review_required=True,
            payload={
                "runtime_session_id": runtime_session_id,
                "runtime_action": runtime_action,
                "runtime_action_args": dict(runtime_action_args),
                "connector_id": _text(connector_id).lower() or None,
                "action_id": _text(action_id).lower() or None,
                "reason": reason,
            },
            metadata={"runtime_session_binding": "cloud_computer_agent"},
        )
        lowered_reason = reason.lower()
        if any(
            token in lowered_reason
            for token in (
                "agent_paused",
                "agent_suspended",
                "agent_archived",
                "kill_switch_active",
                "workspace_emergency_stop",
            )
        ):
            await _append_cloud_runtime_audit_event(
                deployed_agent=deployed_agent,
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                action="deployed_agent_cloud_runtime_kill_state_rejected",
                title="Cloud Computer kill-state rejected action",
                summary="Cloud Computer runtime rejected an action because the deployed agent is paused, suspended, archived, or emergency-stopped.",
                status="blocked",
                event_class="blocked_action",
                review_required=True,
                payload={
                    "runtime_session_id": runtime_session_id,
                    "runtime_action": runtime_action,
                    "reason": reason,
                },
                metadata={"runtime_session_binding": "cloud_computer_agent"},
            )
        raise
    await _append_cloud_runtime_audit_event(
        deployed_agent=deployed_agent,
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        action="deployed_agent_cloud_runtime_action_admitted",
        title="Cloud Computer action admitted",
        summary="Cloud Computer runtime admitted and executed an action.",
        status="success",
        payload={
            "runtime_session_id": runtime_session_id,
            "runtime_action": runtime_action,
            "runtime_action_args": dict(runtime_action_args),
            "connector_id": _text(connector_id).lower() or None,
            "action_id": _text(action_id).lower() or None,
        },
        metadata={"runtime_session_binding": "cloud_computer_agent"},
    )
    return _cloud_runtime_result_text(
        connector_id=connector_id,
        action_id=action_id,
        response=response,
    )


async def terminate_bound_cloud_runtime_session(
    *,
    session_id: Any,
    tenant_id: Any = None,
    workspace_id: Any = None,
) -> Optional[Dict[str, Any]]:
    token = _text(session_id)
    if not token:
        return None
    session_record = await session_service.get_session(token)
    metadata = _coerce_dict((session_record or {}).get("metadata"))
    if _text(metadata.get("runtime_session_binding")).lower() != "cloud_computer_agent":
        return None
    runtime_session_id = _text(metadata.get("runtime_session_id")) or token
    runtime_choice = _text(metadata.get("runtime_choice")) or "virtual_browser"
    runtime_provider_id = _text(metadata.get("runtime_provider_id")) or None
    runtime = get_runtime_registry().resolve(
        runtime_choice,
        preferred_provider_id=runtime_provider_id,
    )
    payload = {
        "tenant_id": _text(tenant_id) or _text((session_record or {}).get("tenant_id")),
        "workspace_id": _text(workspace_id) or _text((session_record or {}).get("workspace_id")),
        "session_id": runtime_session_id,
        "browser_session_id": runtime_session_id,
        "runtime_provider_id": runtime_provider_id,
        "manual_terminate": True,
        "metadata": {
            "deployed_agent_id": _text(metadata.get("deployed_agent_id")) or None,
            "runtime_session_binding": "cloud_computer_agent",
            "runtime_session_id": runtime_session_id,
        },
    }
    return await runtime.terminate_session({key: value for key, value in payload.items() if value is not None})
