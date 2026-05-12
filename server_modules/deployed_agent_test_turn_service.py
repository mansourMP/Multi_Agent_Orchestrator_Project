from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from server_modules import (
    deployed_agent_config_schema,
    deployed_agent_runtime_contract_service,
    deployed_agent_service,
    deployed_agent_transparency_service,
    studio_app_boundary_service,
    transparency_event_store_service,
    security_audit_service,
)
from server_modules.schemas import DeployedAgentTestTurnRequest, DeployedAgentTestTurnResponse

ALLOWED_TEST_CHANNELS = {"telegram", "whatsapp", "web_widget", "test"}
ALLOWED_RUNTIME_MODES = {
    "text_agent",
    "cloud_computer_agent",
    "my_computer_agent",
    "self_hosted_agent",
}
TESTABLE_STATES = {"draft", "private_test", "ready_for_review"}


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _authoritative_runtime_mode(config: Any) -> str:
    configured_mode = _coerce_text(getattr(config, "studio_agent_mode", "")).lower()
    if configured_mode:
        return deployed_agent_runtime_contract_service.resolve_studio_agent_mode(
            configured_mode,
            runtime_placement=getattr(config, "runtime_placement", None),
            runtime_target=getattr(config, "runtime_target", None),
            runtime_supplier=getattr(config, "runtime_supplier", None),
        )
    return deployed_agent_runtime_contract_service.resolve_studio_agent_mode(
        "",
        runtime_placement=getattr(config, "runtime_placement", None),
        runtime_target=getattr(config, "runtime_target", None),
        runtime_supplier=getattr(config, "runtime_supplier", None),
    )


def _build_policy_decisions(
    *,
    config: Any,
    requested_mode: str,
    requested_channel: str,
) -> list[dict]:
    decisions: list[dict] = []

    actual_mode = _authoritative_runtime_mode(config)
    contract = deployed_agent_runtime_contract_service.studio_agent_mode_contract(
        actual_mode,
    )
    runtime_allowed = actual_mode == requested_mode
    decisions.append({
        "policy": "runtime_mode",
        "requested": requested_mode,
        "resolved": actual_mode,
        "configured": actual_mode,
        "allowed": runtime_allowed,
        "reason": "configured_runtime_mode" if runtime_allowed else "runtime_mode_mismatch",
        "placement": contract.get("placement"),
        "supplier": contract.get("supplier"),
        "computer_allowed": contract.get("computer_allowed"),
    })

    channel_config = (getattr(config, "channels", None) or {}).get(requested_channel)
    channel_configured = channel_config is not None and bool(
        getattr(channel_config, "enabled", True)
    )
    decisions.append({
        "policy": "channel",
        "channel": requested_channel,
        "configured": channel_configured,
        "simulated": True,
    })

    tool_policy = getattr(config, "tool_policy", None)
    if tool_policy is not None:
        decisions.append({
            "policy": "tools",
            "allowed_tools": list(getattr(tool_policy, "allowed_tool_ids", []) or []),
            "blocked_tools": list(getattr(tool_policy, "blocked_tool_ids", []) or []),
        })

    safety_policy = getattr(config, "safety_policy", None)
    if safety_policy is not None:
        decisions.append({
            "policy": "safety",
            "approval_mode": getattr(safety_policy, "approval_mode", "balanced"),
            "handoff_mode": getattr(safety_policy, "handoff_mode", "always"),
        })

    memory_policy = getattr(config, "memory_policy", None)
    if memory_policy is not None:
        decisions.append({
            "policy": "memory",
            "enabled": getattr(memory_policy, "memory_enabled", False),
            "context_budget_preset": getattr(memory_policy, "context_budget_preset", "compact"),
            "retention_preset": getattr(memory_policy, "retention_preset", "standard"),
        })

    return decisions


def _evaluate_tool_policy(
    *,
    config: Any,
    message: str,
) -> tuple[list[dict], list[str], bool]:
    tool_policy = getattr(config, "tool_policy", None)
    if tool_policy is None:
        return [], [], False

    allowed_ids = set(getattr(tool_policy, "allowed_tool_ids", []) or [])
    blocked_ids = set(getattr(tool_policy, "blocked_tool_ids", []) or [])

    considered: list[dict] = []
    used: list[str] = []
    approval_required = False

    from server_modules.skill_registry import list_skill_definitions

    all_skills = list_skill_definitions(include_disabled=False)
    lower_message = message.lower()

    for skill in all_skills:
        triggered = any(term and term in lower_message for term in skill.trigger_terms)
        if not triggered:
            continue

        entry = {
            "skill_id": skill.id,
            "label": skill.label,
            "action_class": skill.action_class,
        }

        if skill.id in blocked_ids:
            entry["allowed"] = False
            entry["reason"] = "blocked_by_policy"
        elif allowed_ids and skill.id not in allowed_ids:
            entry["allowed"] = False
            entry["reason"] = "not_in_allowlist"
        elif skill.action_class in ("write", "execute"):
            entry["allowed"] = False
            entry["reason"] = "requires_approval"
            entry["approval_required"] = True
            approval_required = True
        else:
            entry["allowed"] = True
            entry["reason"] = "read_only_safe"
            used.append(skill.id)

        considered.append(entry)

    return considered, used, approval_required


def _load_memory_context_for_test(
    *,
    workspace_id: str,
    tenant_id: str,
    config: Any,
) -> dict:
    memory_policy = getattr(config, "memory_policy", None)
    if memory_policy is None or not getattr(memory_policy, "memory_enabled", False):
        return {"applied": False, "enabled": False, "prior_messages": [], "business_plan": ""}

    try:
        from server_modules.conversation_memory_policy import (
            build_external_channel_memory_profile,
        )

        profile = build_external_channel_memory_profile(
            context_budget_preset=getattr(memory_policy, "context_budget_preset", "compact"),
            retention_preset=getattr(memory_policy, "retention_preset", "standard"),
        )
        return {
            "applied": True,
            "enabled": True,
            "prior_messages": [],
            "business_plan": "",
            "context_budget_preset": profile.name if hasattr(profile, "name") else str(profile),
            "summary_present": False,
            "message_count": 0,
        }
    except Exception:
        return {"applied": False, "enabled": False, "error": "memory_load_failed"}


def _validate_test_customer_profile_boundary(customer_profile: Any) -> None:
    if customer_profile in (None, {}, []):
        return
    try:
        studio_app_boundary_service.assert_no_forbidden_owner_resource_keys(
            customer_profile,
            root_label="customer_profile",
        )
    except studio_app_boundary_service.StudioAppBoundaryError as exc:
        raise ValueError(str(exc)) from exc


async def execute_test_turn(
    *,
    deployed_agent_id: str,
    workspace_id: str,
    tenant_id: str,
    request: DeployedAgentTestTurnRequest,
    current_user: dict,
) -> DeployedAgentTestTurnResponse:
    trace_id = str(uuid.uuid4())
    actor_user_id = _coerce_text((current_user or {}).get("user_id"))
    actor_email = _coerce_text((current_user or {}).get("email"))

    normalized_message = _coerce_text(request.message)
    normalized_channel = _coerce_text(request.channel).lower() or "test"
    normalized_mode = _coerce_text(request.runtime_mode).lower() or "text_agent"

    if not normalized_message:
        raise ValueError("message must not be empty")
    if normalized_channel not in ALLOWED_TEST_CHANNELS:
        raise ValueError(f"Unsupported channel: {request.channel}. Allowed: {sorted(ALLOWED_TEST_CHANNELS)}")
    if normalized_mode not in ALLOWED_RUNTIME_MODES:
        raise ValueError(f"Unsupported runtime_mode: {request.runtime_mode}. Allowed: {sorted(ALLOWED_RUNTIME_MODES)}")
    _validate_test_customer_profile_boundary(request.customer_profile)

    agent_detail = await deployed_agent_service.get_deployed_agent_detail(
        deployed_agent_id=deployed_agent_id,
        current_user=current_user,
        owner_workspace_id=workspace_id,
    )
    if not isinstance(agent_detail, dict):
        raise ValueError("Deployed agent not found.")

    agent_record = agent_detail.get("deployed_agent") or agent_detail
    config = deployed_agent_config_schema.deployed_agent_config_from_record(agent_record)

    deployment_state = _coerce_text(agent_record.get("deployment_state") or config.deployment_state)
    if deployment_state not in TESTABLE_STATES:
        raise ValueError(
            f"Agent state '{deployment_state}' does not allow test turns. "
            f"Test turns require: {', '.join(sorted(TESTABLE_STATES))}."
        )

    policy_decisions = _build_policy_decisions(
        config=config,
        requested_mode=normalized_mode,
        requested_channel=normalized_channel,
    )
    runtime_decision = next(
        (item for item in policy_decisions if item.get("policy") == "runtime_mode"),
        {},
    )
    effective_runtime_mode = _coerce_text(runtime_decision.get("resolved")) or normalized_mode
    runtime_mode_allowed = bool(runtime_decision.get("allowed", False))

    tools_considered, tools_used, approval_required = _evaluate_tool_policy(
        config=config,
        message=normalized_message,
    )

    memory_context = _load_memory_context_for_test(
        workspace_id=workspace_id,
        tenant_id=tenant_id,
        config=config,
    )

    reply = _simulate_reply(
        message=normalized_message,
        channel=normalized_channel,
        mode=effective_runtime_mode,
        approval_required=approval_required,
        runtime_mode_allowed=runtime_mode_allowed,
        requested_mode=normalized_mode,
    )

    audit_events = _emit_test_turn_audit(
        trace_id=trace_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        deployed_agent_id=deployed_agent_id,
        actor_user_id=actor_user_id,
        actor_email=actor_email,
        channel=normalized_channel,
        mode=effective_runtime_mode,
        approval_required=approval_required,
        tools_used=tools_used,
    )

    test_result = {
        "reply": reply,
        "policy_decisions": policy_decisions,
        "tools_considered": tools_considered,
        "tools_used": tools_used,
        "memory_context": memory_context,
        "approval_required": approval_required,
        "audit_events": audit_events,
        "trace_id": trace_id,
    }
    try:
        events = deployed_agent_transparency_service.emit_deployed_agent_test_turn_events(
            trace_id=trace_id,
            workspace_id=workspace_id,
            deployed_agent_id=deployed_agent_id,
            user_message=normalized_message,
            test_result=test_result,
        )
        transparency_payloads = [e.to_user_payload() for e in events]
    except Exception:
        transparency_payloads = []

    if transparency_payloads:
        try:
            await transparency_event_store_service.persist_transparency_events(
                trace_id=trace_id,
                workspace_id=workspace_id,
                events=transparency_payloads,
                surface="studio_test",
            )
        except Exception:
            pass

    return DeployedAgentTestTurnResponse(
        reply=reply,
        policy_decisions=policy_decisions,
        tools_considered=tools_considered,
        tools_used=tools_used,
        memory_context=memory_context,
        approval_required=approval_required,
        audit_events=audit_events,
        trace_id=trace_id,
        transparency_events=transparency_payloads,
    )


def _simulate_reply(
    *,
    message: str,
    channel: str,
    mode: str,
    approval_required: bool,
    runtime_mode_allowed: bool,
    requested_mode: str,
) -> str:
    if not runtime_mode_allowed:
        return (
            f"[TEST MODE] The requested runtime mode is not allowed for this agent:\n"
            f"'{message[:200]}'\n\n"
            f"Channel: {channel} | Configured mode: {mode} | Requested mode: {requested_mode}\n"
            f"Status: runtime_mode_mismatch\n"
            f"This is a test turn — no real actions were executed."
        )
    if approval_required:
        return (
            f"[TEST MODE] Your request triggers actions that require approval:\n"
            f"'{message[:200]}'\n\n"
            f"Channel: {channel} | Mode: {mode}\n"
            f"Status: approval_required=true\n"
            f"This is a test turn — no real actions were executed."
        )
    return (
        f"[TEST MODE] Simulated reply for:\n"
        f"'{message[:200]}'\n\n"
        f"Channel: {channel} | Mode: {mode}\n"
        f"Status: safe — all triggered tools are read-only.\n"
        f"This is a test turn — no real actions were executed."
    )


def _emit_test_turn_audit(
    *,
    trace_id: str,
    tenant_id: str,
    workspace_id: str,
    deployed_agent_id: str,
    actor_user_id: str,
    actor_email: str,
    channel: str,
    mode: str,
    approval_required: bool,
    tools_used: list[str],
) -> list[dict]:
    events: list[dict] = []

    status = "approval_required" if approval_required else "success"
    detail = (
        f"Test turn for agent {deployed_agent_id} via {channel}/{mode}"
    )

    try:
        security_audit_service.emit_security_audit_event(
            action="deployed_agent.test_turn",
            status=status,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id or None,
            actor_email=actor_email or None,
            trace_id=trace_id,
            detail=detail,
            metadata={
                "deployed_agent_id": deployed_agent_id,
                "channel": channel,
                "runtime_mode": mode,
                "approval_required": approval_required,
                "tools_used": tools_used,
            },
            idempotency_key=f"test_turn:{trace_id}",
        )
        events.append({
            "action": "deployed_agent.test_turn",
            "status": status,
            "trace_id": trace_id,
        })
    except Exception:
        events.append({
            "action": "deployed_agent.test_turn",
            "status": "audit_emission_failed",
            "trace_id": trace_id,
        })

    return events
