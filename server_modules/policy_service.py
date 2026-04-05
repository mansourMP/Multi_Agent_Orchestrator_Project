from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from scripts.platform_execution import capability_metadata
from server_modules import skills_service


@dataclass(slots=True)
class PolicyDecision:
    allowed: bool
    decision: str
    reason: str = ""
    approvals_required: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


def _runtime_policy_module():
    from server_modules import runtime_policy as runtime_policy_module

    runtime_policy_module._init()
    return runtime_policy_module


def _normalize_action_id(value: Any) -> str:
    return _runtime_policy_module().normalize_action_id(value)


def normalize_execution_target(raw_value: Any) -> str:
    return _runtime_policy_module().normalize_execution_target(raw_value)


def normalize_policy_mode(raw_value: Any) -> str:
    return _runtime_policy_module().normalize_policy_mode(raw_value)


def normalize_trust_mode(raw_value: Any) -> str:
    return _runtime_policy_module().normalize_trust_mode(raw_value)


def action_policy_from_app_permissions(permissions: Optional[List[str]] = None) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    perms = {str(item).strip().lower() for item in (permissions or []) if str(item).strip()}
    allowed = set()
    approval = set()
    blocked = set(runtime_policy.ACTION_RISK_LEVELS.keys())

    for perm, mapping in runtime_policy.APP_PERMISSION_ACTION_MAP.items():
        if perm not in perms:
            continue
        tool_id = _normalize_action_id(mapping.get("tool"))
        if not tool_id:
            continue
        if mapping.get("requires_approval", True):
            approval.add(tool_id)
        else:
            allowed.add(tool_id)

    blocked = blocked.difference(approval).difference(allowed)
    return {
        "blocked_actions": sorted(blocked),
        "approval_actions": sorted(approval),
        "allow_actions": sorted(allowed),
        "block_cloud_critical": True,
        "connector_cloud_readonly": True,
    }


def merge_action_policies(base: Optional[Dict[str, Any]], enforced: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    base_policy = runtime_policy._action_policy_from_metadata(base or {})
    enforced_policy = runtime_policy._action_policy_from_metadata(enforced or {})

    blocked = set(base_policy.get("blocked_actions", set())) | set(enforced_policy.get("blocked_actions", set()))
    approval = set(base_policy.get("approval_actions", set())) | set(enforced_policy.get("approval_actions", set()))
    allow = set(base_policy.get("allow_actions", set())).difference(blocked)

    return {
        "blocked_actions": sorted(blocked),
        "approval_actions": sorted(approval),
        "allow_actions": sorted(allow),
        "block_cloud_critical": bool(
            enforced_policy.get(
                "block_cloud_critical",
                base_policy.get("block_cloud_critical", True),
            )
        ),
        "connector_cloud_readonly": bool(
            enforced_policy.get(
                "connector_cloud_readonly",
                base_policy.get("connector_cloud_readonly", True),
            )
        ),
    }


def resolve_runtime_policy_mode(
    metadata: Optional[Dict[str, Any]] = None,
    *,
    selected_target: Optional[str] = None,
) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    clean_metadata = metadata if isinstance(metadata, dict) else {}
    target = normalize_execution_target(
        selected_target
        or clean_metadata.get("execution_target_selected")
        or clean_metadata.get("execution_target")
    )
    runtime_ids: List[str] = []
    seen: set[str] = set()
    explicit_runtime_id = str(
        clean_metadata.get("runtime_id")
        or clean_metadata.get("execution_runtime_id")
        or clean_metadata.get("execution_target_runtime_id")
        or clean_metadata.get("execution_target_preferred_runtime_id")
        or ""
    ).strip()
    if explicit_runtime_id:
        runtime_ids.append(explicit_runtime_id)
        seen.add(explicit_runtime_id)
    for raw in clean_metadata.get("execution_target_matching_runtime_ids") or []:
        token = str(raw or "").strip()
        if token and token not in seen:
            seen.add(token)
            runtime_ids.append(token)

    resolved_modes: List[str] = []
    resolved_runtime_id: Optional[str] = None
    for runtime_id in runtime_ids:
        record = (
            runtime_policy.LOCAL_WORKER_REGISTRY.get(runtime_id)
            if isinstance(runtime_policy.LOCAL_WORKER_REGISTRY.get(runtime_id), dict)
            else None
        )
        if not isinstance(record, dict):
            continue
        resolved_mode = normalize_policy_mode(record.get("policy_mode"))
        if resolved_runtime_id is None:
            resolved_runtime_id = runtime_id
        resolved_modes.append(resolved_mode)

    if resolved_modes:
        unique_modes = sorted(set(resolved_modes))
        policy_mode = (
            unique_modes[0]
            if len(unique_modes) == 1
            else runtime_policy.POLICY_MODE_LOCAL_DEFAULT
        )
        source = (
            "runtime_registration"
            if len(unique_modes) == 1
            else "runtime_registration_mixed"
        )
        return {
            "policy_mode": policy_mode,
            "runtime_id": resolved_runtime_id,
            "candidate_runtime_ids": runtime_ids,
            "source": source,
            "target": target,
        }

    explicit_policy_mode = clean_metadata.get("policy_mode")
    if explicit_policy_mode is not None:
        return {
            "policy_mode": normalize_policy_mode(explicit_policy_mode),
            "runtime_id": resolved_runtime_id,
            "candidate_runtime_ids": runtime_ids,
            "source": "metadata_fallback",
            "target": target,
        }

    return {
        "policy_mode": runtime_policy.ORION_RUNTIME_POLICY_MODE_DEFAULT,
        "runtime_id": resolved_runtime_id,
        "candidate_runtime_ids": runtime_ids,
        "source": "runtime_default",
        "target": target,
    }


def apply_execution_route_metadata(metadata: Dict[str, Any], route: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        return metadata

    metadata["execution_target_requested"] = route.get("requested")
    metadata["execution_target_selected"] = route.get("selected")
    metadata["execution_target_reason"] = route.get("reason")
    if route.get("fallback"):
        metadata["execution_target_fallback"] = route.get("fallback")
    else:
        metadata.pop("execution_target_fallback", None)

    for route_key, metadata_key in (
        ("required_capabilities", "execution_target_required_capabilities"),
        ("missing_capabilities", "execution_target_missing_capabilities"),
        ("matching_runtime_ids", "execution_target_matching_runtime_ids"),
        ("available_runtime_ids", "execution_target_available_runtime_ids"),
        ("busy_matching_runtime_ids", "execution_target_busy_runtime_ids"),
        ("busy_runtime_labels", "execution_target_busy_runtime_labels"),
    ):
        if route.get(route_key):
            metadata[metadata_key] = list(route.get(route_key) or [])
        else:
            metadata.pop(metadata_key, None)

    for route_key, metadata_key in (
        ("preferred_runtime_id", "execution_target_preferred_runtime_id"),
        ("preferred_runtime_label", "execution_target_preferred_runtime_label"),
        ("preferred_runtime_reason", "execution_target_preferred_runtime_reason"),
    ):
        if route.get(route_key):
            metadata[metadata_key] = route.get(route_key)
        else:
            metadata.pop(metadata_key, None)

    metadata["execution_target_queued_ahead_count"] = int(route.get("queued_ahead_count") or 0)
    metadata["execution_target_estimated_wait_band"] = str(route.get("estimated_wait_band") or "unknown")
    metadata["execution_target_waiting_for_runtime"] = bool(route.get("waiting_for_runtime"))
    metadata["execution_target_waiting_for_capacity"] = bool(route.get("waiting_for_capacity"))
    return metadata


def decide_execution_target(metadata: Dict[str, Any], schedule_id: Optional[str] = None) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    requested = normalize_execution_target(metadata.get("execution_target"))
    if requested == runtime_policy.EXECUTION_TARGET_AUTO:
        connection_mode = str(metadata.get("connection_mode") or "").strip().lower()
        if connection_mode in {"local_companion", "local"}:
            requested = runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION

    capability_state = runtime_policy._local_runtime_capability_state(
        runtime_policy._predict_required_capabilities_from_metadata(metadata)
    )
    required_capabilities = list(capability_state.get("required_capabilities") or [])
    missing_capabilities = list(capability_state.get("missing_capabilities") or [])
    matching_runtime_ids = list(capability_state.get("matching_runtime_ids") or [])
    available_runtime_ids = list(capability_state.get("available_runtime_ids") or [])
    busy_matching_runtime_ids = list(capability_state.get("busy_matching_runtime_ids") or [])
    waiting_for_runtime = bool(capability_state.get("waiting_for_runtime"))
    waiting_for_capacity = bool(capability_state.get("waiting_for_capacity"))
    preferred_runtime_id = str(capability_state.get("preferred_runtime_id") or "").strip() or None
    preferred_runtime_label = str(capability_state.get("preferred_runtime_label") or "").strip() or None
    preferred_runtime_reason = str(capability_state.get("preferred_runtime_reason") or "").strip() or None
    busy_runtime_labels = list(capability_state.get("busy_runtime_labels") or [])
    queued_ahead_count = int(capability_state.get("queued_ahead_count") or 0)
    estimated_wait_band = str(capability_state.get("estimated_wait_band") or "unknown")
    local_pool = runtime_policy._local_runtime_pool_state() if not required_capabilities else {}

    selected = requested
    reason = ""
    fallback = None

    if required_capabilities:
        capability_text = ", ".join(required_capabilities)
        selected = runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
        if available_runtime_ids:
            preferred_text = preferred_runtime_label or "a capable local runtime"
            reason = f"Run requires local machine capabilities ({capability_text}) and will use {preferred_text}."
            if requested == runtime_policy.EXECUTION_TARGET_CLOUD:
                fallback = "Cloud runtime cannot satisfy these local capabilities; using local machine instead."
        elif matching_runtime_ids:
            preferred_text = preferred_runtime_label or "a capable local runtime"
            if schedule_id:
                reason = (
                    f"Scheduled run requires local machine capabilities ({capability_text}) "
                    f"and is waiting for machine capacity on {preferred_text}."
                )
            else:
                reason = (
                    f"Run requires local machine capabilities ({capability_text}) "
                    f"and is waiting for machine capacity on {preferred_text}."
                )
            fallback = "Capable local machines are online, but they are currently busy."
            if queued_ahead_count > 0:
                fallback = (
                    f"{fallback} {queued_ahead_count} similar local run"
                    f"{'s are' if queued_ahead_count != 1 else ' is'} ahead in the queue."
                )
        else:
            missing_text = ", ".join(missing_capabilities or required_capabilities)
            if schedule_id:
                reason = (
                    f"Scheduled run requires local machine capabilities ({capability_text}) "
                    "and is waiting for a capable machine."
                )
            else:
                reason = (
                    f"Run requires local machine capabilities ({capability_text}) "
                    "and is waiting for a capable machine."
                )
            fallback = f"No online local runtime currently exposes: {missing_text}."
    elif requested == runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION:
        selected = runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
        if bool(local_pool.get("online_count")):
            reason = "Run is pinned to local companion execution."
        else:
            reason = "Run is pinned to local companion execution and no local runtime is online yet."
            waiting_for_runtime = True
            fallback = "Start or reconnect a local runtime to continue."
    elif requested == runtime_policy.EXECUTION_TARGET_CLOUD:
        selected = runtime_policy.EXECUTION_TARGET_CLOUD
        reason = "Run is pinned to cloud execution."
    else:
        online_count = int(local_pool.get("online_count") or 0)
        idle_count = int(local_pool.get("idle_count") or 0)
        if idle_count > 0:
            selected = runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
            reason = "Automatic route selected local companion because local capacity is available."
        elif online_count > 0:
            allowed, fallback_reason = runtime_policy._auto_cloud_capacity_fallback_allowed(metadata)
            if allowed:
                selected = runtime_policy.EXECUTION_TARGET_CLOUD
                reason = fallback_reason
                fallback = "Auto route used cloud because local capacity was busy."
            else:
                selected = runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
                waiting_for_capacity = True
                reason = "Automatic route is holding for local capacity."
                fallback = fallback_reason
        else:
            selected = runtime_policy.EXECUTION_TARGET_CLOUD
            reason = "Automatic route selected cloud because no local runtime is online."

    return {
        "requested": requested,
        "selected": selected,
        "reason": reason,
        "fallback": fallback,
        "required_capabilities": required_capabilities,
        "missing_capabilities": missing_capabilities,
        "matching_runtime_ids": matching_runtime_ids,
        "available_runtime_ids": available_runtime_ids,
        "busy_matching_runtime_ids": busy_matching_runtime_ids,
        "waiting_for_runtime": waiting_for_runtime,
        "waiting_for_capacity": waiting_for_capacity,
        "preferred_runtime_id": preferred_runtime_id,
        "preferred_runtime_label": preferred_runtime_label,
        "preferred_runtime_reason": preferred_runtime_reason,
        "busy_runtime_labels": busy_runtime_labels,
        "queued_ahead_count": queued_ahead_count,
        "estimated_wait_band": estimated_wait_band,
    }


def evaluate_action_policy(
    action_counts: Dict[str, int],
    policy_mode: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    selected_target: Optional[str] = None,
) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    metadata = metadata if isinstance(metadata, dict) else {}
    policy = runtime_policy._action_policy_from_metadata(metadata)
    blocked_actions = set(policy.get("blocked_actions", set()))
    allow_actions = set(policy.get("allow_actions", set()))
    block_cloud_critical = bool(policy.get("block_cloud_critical", True))

    target = normalize_execution_target(
        selected_target
        or metadata.get("execution_target_selected")
        or metadata.get("execution_target")
    )
    runtime_mode = resolve_runtime_policy_mode(metadata, selected_target=target)
    effective_policy_mode = normalize_policy_mode(policy_mode or runtime_mode.get("policy_mode"))

    evaluated: List[Dict[str, Any]] = []
    denied_actions: List[str] = []
    confirmation_required_actions: List[str] = []

    for action, count in sorted(action_counts.items()):
        if count <= 0:
            continue
        normalized = _normalize_action_id(action)
        if not normalized:
            continue
        classification = runtime_policy.classify_runtime_action(normalized, count=count, target=target)
        execution_decision = "allow"
        reasons: List[str] = []

        if normalized in blocked_actions and normalized not in allow_actions:
            execution_decision = "deny"
            reasons.append("Blocked by action policy.")

        if (
            execution_decision != "deny"
            and block_cloud_critical
            and target == runtime_policy.EXECUTION_TARGET_CLOUD
            and bool(classification.get("destructive_risk"))
            and normalized not in allow_actions
        ):
            execution_decision = "deny"
            reasons.append("Critical action is blocked in cloud runtime.")

        if execution_decision != "deny":
            action_type = str(classification.get("action_type") or runtime_policy.ACTION_TYPE_REVERSIBLE_WRITE)
            external_visibility = bool(classification.get("external_visibility"))
            destructive_risk = bool(classification.get("destructive_risk"))
            if destructive_risk:
                execution_decision = "deny"
                reasons.append("Destructive actions stay blocked by runtime policy.")
            elif effective_policy_mode == runtime_policy.POLICY_MODE_TRUSTED_FULL_ACCESS:
                if action_type == runtime_policy.ACTION_TYPE_PUBLIC_PUBLISH:
                    execution_decision = "require_confirmation"
                    reasons.append("Public publishing still requires one-time confirmation.")
            else:
                if action_type in {runtime_policy.ACTION_TYPE_READ, runtime_policy.ACTION_TYPE_DRAFT}:
                    execution_decision = "allow"
                elif action_type == runtime_policy.ACTION_TYPE_REVERSIBLE_WRITE and not external_visibility:
                    execution_decision = "allow"
                else:
                    execution_decision = "require_confirmation"
                    reasons.append("This action requires one-time confirmation in local default mode.")

        if execution_decision == "deny":
            denied_actions.append(normalized)
        elif execution_decision == "require_confirmation":
            confirmation_required_actions.append(normalized)

        evaluated.append(
            {
                "action": normalized,
                "count": count,
                "risk": runtime_policy.ACTION_RISK_LEVELS.get(normalized, "medium"),
                "policy_mode": effective_policy_mode,
                "classification": classification,
                "execution_decision": execution_decision,
                "decision": runtime_policy._legacy_decision_label(execution_decision),
                "reason": " ".join(reasons).strip() or None,
            }
        )

    confirmation_reason = ""
    if confirmation_required_actions:
        uniq = sorted(set(confirmation_required_actions))
        confirmation_reason = f"Runtime policy requires one-time confirmation for: {', '.join(uniq)}."
    return {
        "evaluated": evaluated,
        "policy_mode": effective_policy_mode,
        "denied_actions": sorted(set(denied_actions)),
        "confirmation_required_actions": sorted(set(confirmation_required_actions)),
        "requires_confirmation": bool(confirmation_required_actions),
        "confirmation_reason": confirmation_reason,
        "blocked_actions": sorted(set(denied_actions)),
        "approval_actions": sorted(set(confirmation_required_actions)),
        "requires_approval": bool(confirmation_required_actions),
        "approval_reason": confirmation_reason,
        "target": target,
    }


def summarize_action_policy_eval(eval_data: Dict[str, Any]) -> str:
    evaluated = eval_data.get("evaluated") if isinstance(eval_data.get("evaluated"), list) else []
    blocked = eval_data.get("denied_actions") if isinstance(eval_data.get("denied_actions"), list) else []
    approval = (
        eval_data.get("confirmation_required_actions")
        if isinstance(eval_data.get("confirmation_required_actions"), list)
        else []
    )
    if not evaluated:
        return "Action policy: no actionable operations detected."
    return (
        f"Action policy: evaluated={len(evaluated)} "
        f"confirmation_required={len(approval)} denied={len(blocked)}."
    )


def evaluate_tool_policy_decision(
    tool_id: str,
    trust_mode: str,
    target: str,
    metadata: Optional[Dict[str, Any]] = None,
    capability_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    clean_tool_id = _normalize_action_id(tool_id) or str(tool_id or "").strip().lower()
    effective_target = normalize_execution_target(target)
    metadata = metadata if isinstance(metadata, dict) else {}
    runtime_mode = resolve_runtime_policy_mode(metadata, selected_target=effective_target)
    effective_policy_mode = runtime_mode.get("policy_mode")
    policy = runtime_policy._action_policy_from_metadata(metadata)

    blocked_actions = policy.get("blocked_actions", set())
    block_cloud_critical = bool(policy.get("block_cloud_critical", True))

    browser_policy = (
        metadata.get("browser_automation_policy")
        if isinstance(metadata.get("browser_automation_policy"), dict)
        else {}
    )
    browser_requires_approval = (
        bool(browser_policy.get("requires_approval"))
        if clean_tool_id == "browser_automation"
        else False
    )
    browser_profile = (
        str(browser_policy.get("profile") or "").strip().lower()
        if clean_tool_id == "browser_automation"
        else ""
    )
    browser_privileged_actions = (
        list(browser_policy.get("privileged_actions") or [])
        if clean_tool_id == "browser_automation"
        else []
    )
    capability_ids = [str(item).strip().lower() for item in (capability_ids or []) if str(item).strip()]
    capability_details = [
        detail
        for detail in (
            capability_metadata(capability_id, Path(__file__).resolve().parents[1])
            for capability_id in capability_ids
        )
        if isinstance(detail, dict)
    ]
    uses_capability_path = clean_tool_id == "execute_shell_command" and bool(capability_details)
    uses_raw_command_path = clean_tool_id == "execute_shell_command" and not uses_capability_path
    unsupported_capability = next(
        (
            detail
            for detail in capability_details
            if not bool(detail.get("platform_supported"))
        ),
        None,
    )

    safe_raw_shell_command = uses_raw_command_path and runtime_policy._metadata_allows_safe_raw_shell(metadata)
    classification = runtime_policy.classify_runtime_action(clean_tool_id, count=1, target=effective_target)
    if clean_tool_id == "execute_shell_command" and safe_raw_shell_command:
        classification = {
            **classification,
            "action_type": runtime_policy.ACTION_TYPE_REVERSIBLE_WRITE,
            "target_system": "local_device",
            "reversibility": True,
            "external_visibility": False,
            "destructive_risk": False,
            "safe_raw_shell_command": True,
        }

    execution_decision = "allow"
    reason = "policy_allow_default"

    if clean_tool_id in runtime_policy.TOOL_CONTRACTS and not runtime_policy.is_tool_enabled(clean_tool_id):
        execution_decision = "deny"
        reason = "tool_disabled"
    elif unsupported_capability:
        execution_decision = "deny"
        reason = "blocked_unsupported_capability"
    elif uses_raw_command_path and not safe_raw_shell_command:
        execution_decision = "deny"
        reason = "blocked_raw_shell_command"
    elif clean_tool_id in blocked_actions and not uses_capability_path and not safe_raw_shell_command:
        execution_decision = "deny"
        reason = "blocked_by_action_policy"
    elif (
        effective_target == runtime_policy.EXECUTION_TARGET_CLOUD
        and runtime_policy.TOOL_POLICY.is_critical(clean_tool_id)
        and block_cloud_critical
    ):
        execution_decision = "deny"
        reason = "blocked_cloud_critical"
    elif bool(classification.get("destructive_risk")):
        execution_decision = "deny"
        reason = "runtime_policy_deny_destructive"
    elif effective_policy_mode == runtime_policy.POLICY_MODE_TRUSTED_FULL_ACCESS:
        if str(classification.get("action_type") or "") == runtime_policy.ACTION_TYPE_PUBLIC_PUBLISH:
            execution_decision = "require_confirmation"
            reason = "trusted_full_access_public_publish_requires_confirmation"
    else:
        action_type = str(classification.get("action_type") or runtime_policy.ACTION_TYPE_REVERSIBLE_WRITE)
        external_visibility = bool(classification.get("external_visibility"))
        if action_type in {runtime_policy.ACTION_TYPE_READ, runtime_policy.ACTION_TYPE_DRAFT}:
            execution_decision = "allow"
            reason = "local_default_allow_safe"
        elif action_type == runtime_policy.ACTION_TYPE_REVERSIBLE_WRITE and not external_visibility:
            execution_decision = "allow"
            reason = "local_default_allow_local_reversible"
        else:
            execution_decision = "require_confirmation"
            reason = "local_default_requires_confirmation"

    if (
        execution_decision != "deny"
        and clean_tool_id == "browser_automation"
        and effective_target == runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
        and browser_profile in {"authenticated_interactive", "authenticated_privileged"}
    ):
        execution_decision = "require_confirmation"
        reason = (
            "browser_authenticated_privileged_requires_reviewed_approval"
            if browser_privileged_actions
            else "browser_authenticated_interactive_requires_reviewed_approval"
        )

    if (
        execution_decision != "deny"
        and clean_tool_id == "browser_automation"
        and browser_requires_approval
        and not (
            effective_target == runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
            and browser_profile in {"authenticated_interactive", "authenticated_privileged"}
        )
    ):
        if effective_policy_mode == runtime_policy.POLICY_MODE_LOCAL_DEFAULT:
            execution_decision = "require_confirmation"
            reason = (
                "browser_authenticated_privileged_requires_approval"
                if browser_privileged_actions
                else "browser_authenticated_requires_approval"
            )

    return {
        "tool_id": clean_tool_id,
        "capability_ids": capability_ids or None,
        "capabilities": capability_details or None,
        "execution_decision": execution_decision,
        "decision": runtime_policy._legacy_decision_label(execution_decision),
        "reason": reason,
        "policy_mode": effective_policy_mode,
        "runtime_policy_source": runtime_mode.get("source"),
        "target": effective_target,
        "is_sensitive": runtime_policy.TOOL_POLICY.is_sensitive(clean_tool_id) or browser_requires_approval,
        "is_critical": runtime_policy.TOOL_POLICY.is_critical(clean_tool_id),
        "classification": classification,
        "uses_capability_path": uses_capability_path,
        "uses_raw_command_path": uses_raw_command_path,
        "safe_raw_shell_command": safe_raw_shell_command,
        "unsupported_capability": unsupported_capability.get("id") if isinstance(unsupported_capability, dict) else None,
        "browser_security_profile": browser_profile or None,
        "browser_requires_approval": browser_requires_approval,
        "browser_privileged_actions": browser_privileged_actions or None,
        "reviewed_approval_required": bool(
            clean_tool_id == "browser_automation"
            and effective_target == runtime_policy.EXECUTION_TARGET_LOCAL_COMPANION
            and browser_profile in {"authenticated_interactive", "authenticated_privileged"}
        ),
    }


def compute_tool_policy_precheck(
    context: Dict[str, Any],
    *,
    derive_browser_automation_policy_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
    predict_tool_ids_for_context_fn: Callable[[Dict[str, Any]], List[str]],
    build_skill_contract_from_metadata_fn: Callable[[Dict[str, Any], List[str], str, str], Dict[str, Any]],
    predict_capability_ids_for_context_fn: Callable[[Dict[str, Any]], List[str]],
    apply_agent_machine_bypass_to_tool_policy_evaluation_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
    capability_metadata_root: Optional[Path] = None,
) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    target = normalize_execution_target(
        metadata.get("execution_target_selected") or metadata.get("execution_target")
    )
    runtime_mode = resolve_runtime_policy_mode(metadata, selected_target=target)
    policy_mode = str(runtime_mode.get("policy_mode") or runtime_policy.POLICY_MODE_LOCAL_DEFAULT)
    tool_ids = predict_tool_ids_for_context_fn(context)
    skill_contract = build_skill_contract_from_metadata_fn(metadata, tool_ids, policy_mode, target)
    enforced_undeclared = (
        set(skill_contract.get("undeclared_tools") or [])
        if skill_contract.get("policy_mode") == "enforce"
        else set()
    )
    items: List[Dict[str, Any]] = []
    denied: List[str] = []
    require_confirmation: List[str] = []
    allowed: List[str] = []

    browser_policy = derive_browser_automation_policy_fn(context)
    evaluation_metadata = dict(metadata)
    if browser_policy:
        evaluation_metadata["browser_automation_policy"] = browser_policy

    capability_ids = predict_capability_ids_for_context_fn(context)
    capability_details = [
        detail
        for detail in (
            capability_metadata(capability_id, capability_metadata_root or Path(__file__).resolve().parent)
            for capability_id in capability_ids
        )
        if isinstance(detail, dict)
    ]
    capabilities_by_tool: Dict[str, List[str]] = {}
    for detail in capability_details:
        tool_for_capability = _normalize_action_id(detail.get("tool_id"))
        capability_id = str(detail.get("id") or "").strip().lower()
        if not tool_for_capability or not capability_id:
            continue
        capabilities_by_tool.setdefault(tool_for_capability, []).append(capability_id)

    for tool_id in tool_ids:
        item = evaluate_tool_policy_decision(
            tool_id=tool_id,
            trust_mode=policy_mode,
            target=target,
            metadata=evaluation_metadata,
            capability_ids=capabilities_by_tool.get(_normalize_action_id(tool_id), []),
        )
        if tool_id in enforced_undeclared:
            item = dict(item)
            item["execution_decision"] = "deny"
            item["decision"] = "blocked"
            item["reason"] = "skill_contract_missing_runtime_tool"
        elif skill_contract.get("declared_runtime_tools"):
            item = dict(item)
            item["skill_declared"] = tool_id in set(skill_contract.get("declared_runtime_tools") or [])

        item = apply_agent_machine_bypass_to_tool_policy_evaluation_fn(item)
        items.append(item)
        execution_decision = str(item.get("execution_decision") or "").strip().lower()
        clean_tool = str(item.get("tool_id") or tool_id).strip().lower()
        if execution_decision == "deny":
            denied.append(clean_tool)
        elif execution_decision == "require_confirmation":
            require_confirmation.append(clean_tool)
        else:
            allowed.append(clean_tool)

    return {
        "policy_mode": policy_mode,
        "target": target,
        "tool_ids": tool_ids,
        "capability_ids": capability_ids,
        "capabilities": capability_details,
        "denied": denied,
        "require_confirmation": require_confirmation,
        "allowed": allowed,
        "denied_count": len(denied),
        "require_confirmation_count": len(require_confirmation),
        "allow_count": len(allowed),
        "blocked": denied,
        "approval_required": require_confirmation,
        "blocked_count": len(denied),
        "approval_required_count": len(require_confirmation),
        "items": items,
        "skill_contract": skill_contract,
        "browser_automation_policy": browser_policy or None,
    }


def shell_command_requires_approval(command: str, *, compact_text: Callable[[Any], str]) -> bool:
    compact = compact_text(command)
    if not compact:
        return False
    destructive_markers = (
        "rm -rf",
        "rm -r ",
        "rm -f ",
        "sudo rm",
        "del /f",
        "del /q",
        "rmdir /s",
        "format ",
        "mkfs",
        "diskutil erase",
        "shred ",
        "dd if=",
    )
    return any(marker in compact for marker in destructive_markers)


def file_write_requires_approval(arguments: Dict[str, Any]) -> bool:
    path = str(arguments.get("path") or arguments.get("file_path") or "").strip().lower()
    if not path:
        return False
    protected_markers = (
        "/etc/",
        "/bin/",
        "/usr/",
        "/system/",
        "/library/",
        ".ssh/",
        ".gnupg/",
        ".env",
        ".git/config",
    )
    return any(marker in path for marker in protected_markers)


def local_direct_tool_requires_approval(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    *,
    compact_text: Callable[[Any], str],
) -> bool:
    normalized_connector = str(connector_id or "").strip().lower()
    normalized_action = str(action_id or "").strip().lower()
    if normalized_connector == "shell" and normalized_action == "exec":
        return shell_command_requires_approval(str(arguments.get("command") or ""), compact_text=compact_text)
    if normalized_connector == "file" and normalized_action == "write":
        return file_write_requires_approval(arguments)
    if normalized_connector == "computer":
        return True
    return False


def browser_direct_tool_requires_approval(action_id: str) -> bool:
    normalized_action = str(action_id or "").strip().lower()
    return normalized_action in {"click", "fill", "execute_js", "download_file"}


def approval_required_for_direct_tool(
    connector_id: str,
    action_id: str,
    arguments: Dict[str, Any],
    tool_capabilities: List[Dict[str, Any]],
    *,
    compact_text: Callable[[Any], str],
    http_request_requires_approval: Optional[Callable[[Any, Any], bool]] = None,
) -> bool:
    normalized_connector_id = str(connector_id or "").strip().lower()
    normalized_action_id = str(action_id or "").strip()
    if http_request_requires_approval is None:
        from server_modules.tools_http import (
            http_request_requires_approval as http_request_requires_approval_fn,
        )

        http_request_requires_approval = http_request_requires_approval_fn
    if normalized_connector_id == "http" and normalized_action_id == "request":
        return http_request_requires_approval(arguments.get("method") or "GET", arguments.get("url") or "")
    if normalized_connector_id == "browser":
        return browser_direct_tool_requires_approval(normalized_action_id)
    if normalized_connector_id in {"file", "shell", "screenshot", "computer"}:
        return local_direct_tool_requires_approval(
            normalized_connector_id,
            normalized_action_id,
            arguments,
            compact_text=compact_text,
        )
    return skills_service.tool_action_requires_approval(
        normalized_connector_id,
        normalized_action_id,
        tool_capabilities,
    )


def tool_policy_snapshot(metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    runtime_policy = _runtime_policy_module()
    metadata = metadata if isinstance(metadata, dict) else {}
    policy = runtime_policy._action_policy_from_metadata(metadata)
    runtime_mode = resolve_runtime_policy_mode(metadata)
    return {
        "policy_mode": runtime_mode.get("policy_mode"),
        "blocked_actions": sorted(policy.get("blocked_actions", set())),
        "approval_actions": sorted(policy.get("approval_actions", set())),
        "allow_actions": sorted(policy.get("allow_actions", set())),
        "block_cloud_critical": bool(policy.get("block_cloud_critical", True)),
        "connector_cloud_readonly": bool(policy.get("connector_cloud_readonly", True)),
        "sensitive_tools": runtime_policy.TOOL_POLICY.sensitive_tools(),
        "critical_tools": runtime_policy.TOOL_POLICY.critical_tools(),
    }


def enforce_tool_policy(
    tool_id: str,
    trust_mode: str,
    target: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    evaluation = evaluate_tool_policy_decision(
        tool_id=tool_id,
        trust_mode=trust_mode,
        target=target,
        metadata=metadata,
    )
    return str(evaluation.get("decision") or "allow")
