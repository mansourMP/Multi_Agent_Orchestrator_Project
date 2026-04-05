from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from fastapi import HTTPException

from server_modules.agent_turn import AgentTurnRequest, bind_agent_turn_metadata
from server_modules.doctor_gate import build_doctor_run_gate_live
from server_modules.runtime_policy import apply_execution_route_metadata, decide_execution_target
from server_modules.runtime_models import RunStartRequest


RUN_STATES = (
    "queued",
    "planning",
    "waiting_approval",
    "machine_allocating",
    "executing",
    "blocked",
    "retrying",
    "completed",
    "failed",
    "canceled",
)


@dataclass(slots=True)
class RunRecord:
    run_id: str
    tenant_id: str
    workspace_id: str
    state: str = "queued"
    session_id: str = ""
    machine_target: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RunTransition:
    run_id: str
    from_state: str
    to_state: str
    reason: str = ""
    actor_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RunExecutionServices:
    stamp_request_owner: Any
    prepare_run_start_request: Any
    create_run_from_request: Any


@dataclass(slots=True)
class RunCreationServices:
    create_run_from_request: Any


@dataclass(slots=True)
class RunPreparationServices:
    engine_registry: Any
    engine_validation_errors: Any
    supported_outcome_packs: Any
    normalize_requested_max_iterations: Callable[[Any], Optional[int]]
    normalize_trust_mode: Callable[[str], str]
    trust_mode_aliases: Any
    valid_trust_modes: Any
    normalize_execution_target: Callable[[Any], str]
    valid_execution_targets: Any
    normalize_run_id_token: Callable[[Any], Optional[str]]
    normalize_agent_role: Callable[[Any], str]
    detect_agent_role: Callable[[RunStartRequest, Dict[str, Any]], tuple[str, str]]
    resolve_app_permissions: Callable[[str], Any]
    action_policy_from_app_permissions: Callable[[Any], Dict[str, Any]]
    merge_action_policies: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]
    fetch_workflow_snapshot: Callable[[Any], Any]
    postprocess_metadata: Optional[Callable[[RunStartRequest, Dict[str, Any]], Dict[str, Any]]] = None


@dataclass(slots=True)
class PreparedRunCreationServices:
    decide_execution_target: Any
    apply_execution_route_metadata: Any
    build_doctor_run_gate: Any
    agent_machine_inherited_owner_user_id: Any
    compute_tool_policy_precheck: Any
    apply_browser_execution_metadata: Any
    local_execution_block_prompt: Any
    resolve_runtime_policy_mode: Any
    agent_machine_full_trust_enabled: Any
    local_execution_requires_start_confirmation: Any
    mark_local_execution_tools_approved: Any
    precheck_human_action_labels: Any
    local_execution_confirmation_prompt: Any
    begin_run_pending_confirmation: Any
    create_run: Any
    load_created_run: Any = None
    now_iso: Any = None


def build_run_preparation_services(
    *,
    engine_registry: Any,
    engine_validation_errors: Any,
    supported_outcome_packs: Any,
    normalize_requested_max_iterations: Callable[[Any], Optional[int]],
    normalize_trust_mode: Callable[[str], str],
    trust_mode_aliases: Any,
    valid_trust_modes: Any,
    normalize_execution_target: Callable[[Any], str],
    valid_execution_targets: Any,
    normalize_run_id_token: Callable[[Any], Optional[str]],
    normalize_agent_role: Callable[[Any], str],
    detect_agent_role: Callable[[RunStartRequest, Dict[str, Any]], tuple[str, str]],
    resolve_app_permissions: Callable[[str], Any],
    action_policy_from_app_permissions: Callable[[Any], Dict[str, Any]],
    merge_action_policies: Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]],
    fetch_workflow_snapshot: Callable[[Any], Any],
    postprocess_metadata: Optional[Callable[[RunStartRequest, Dict[str, Any]], Dict[str, Any]]] = None,
) -> RunPreparationServices:
    return RunPreparationServices(
        engine_registry=engine_registry,
        engine_validation_errors=engine_validation_errors,
        supported_outcome_packs=supported_outcome_packs,
        normalize_requested_max_iterations=normalize_requested_max_iterations,
        normalize_trust_mode=normalize_trust_mode,
        trust_mode_aliases=trust_mode_aliases,
        valid_trust_modes=valid_trust_modes,
        normalize_execution_target=normalize_execution_target,
        valid_execution_targets=valid_execution_targets,
        normalize_run_id_token=normalize_run_id_token,
        normalize_agent_role=normalize_agent_role,
        detect_agent_role=detect_agent_role,
        resolve_app_permissions=resolve_app_permissions,
        action_policy_from_app_permissions=action_policy_from_app_permissions,
        merge_action_policies=merge_action_policies,
        fetch_workflow_snapshot=fetch_workflow_snapshot,
        postprocess_metadata=postprocess_metadata,
    )


def build_prepared_run_creation_services(
    *,
    decide_execution_target: Any,
    apply_execution_route_metadata: Any,
    build_doctor_run_gate: Any,
    agent_machine_inherited_owner_user_id: Any,
    compute_tool_policy_precheck: Any,
    apply_browser_execution_metadata: Any,
    local_execution_block_prompt: Any,
    resolve_runtime_policy_mode: Any,
    agent_machine_full_trust_enabled: Any,
    local_execution_requires_start_confirmation: Any,
    mark_local_execution_tools_approved: Any,
    precheck_human_action_labels: Any,
    local_execution_confirmation_prompt: Any,
    begin_run_pending_confirmation: Any,
    create_run: Any,
    load_created_run: Any = None,
    now_iso: Any = None,
) -> PreparedRunCreationServices:
    return PreparedRunCreationServices(
        decide_execution_target=decide_execution_target,
        apply_execution_route_metadata=apply_execution_route_metadata,
        build_doctor_run_gate=build_doctor_run_gate,
        agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
        compute_tool_policy_precheck=compute_tool_policy_precheck,
        apply_browser_execution_metadata=apply_browser_execution_metadata,
        local_execution_block_prompt=local_execution_block_prompt,
        resolve_runtime_policy_mode=resolve_runtime_policy_mode,
        agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
        local_execution_requires_start_confirmation=local_execution_requires_start_confirmation,
        mark_local_execution_tools_approved=mark_local_execution_tools_approved,
        precheck_human_action_labels=precheck_human_action_labels,
        local_execution_confirmation_prompt=local_execution_confirmation_prompt,
        begin_run_pending_confirmation=begin_run_pending_confirmation,
        create_run=create_run,
        load_created_run=load_created_run,
        now_iso=now_iso,
    )


def build_runs_core_creation_result(
    req: RunStartRequest,
    *,
    created: Dict[str, Any],
) -> Dict[str, Any]:
    metadata = created["metadata"]
    created_run = created["created_run"]
    return {
        "run_id": created["run_id"],
        "engine": created["engine"],
        "status": created["status"],
        "active_profile_id": created_run.get("active_profile_id"),
        "active_profile_label": created_run.get("active_profile_label"),
        "active_profile_provider": created_run.get("active_provider"),
        "active_profile_model": created_run.get("active_model"),
        "requested_provider": str(req.provider or "").strip().lower() or None,
        "requested_model": str(req.model or "").strip() or None,
        "policy_mode": metadata.get("policy_mode"),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": created["route"],
        "doctor_preflight": created["doctor_preflight"],
        "pending_approval": created["pending_confirmation"],
    }


def build_runs_delegation_creation_result(
    *,
    created: Dict[str, Any],
) -> Dict[str, Any]:
    metadata = created["metadata"]
    return {
        "run_id": created["run_id"],
        "engine": created["engine"],
        "status": created["status"],
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": created["route"],
        "doctor_preflight": created["doctor_preflight"],
        "pending_confirmation": created["pending_confirmation"],
        "pending_approval": created["pending_confirmation"],
    }


def is_valid_run_state(value: str) -> bool:
    return value in RUN_STATES


def validate_transition(transition: RunTransition) -> None:
    if not is_valid_run_state(transition.from_state):
        raise ValueError(f"Unknown from_state '{transition.from_state}'.")
    if not is_valid_run_state(transition.to_state):
        raise ValueError(f"Unknown to_state '{transition.to_state}'.")


def initial_run_record(run_id: str, tenant_id: str, workspace_id: str, **metadata: Any) -> RunRecord:
    return RunRecord(run_id=run_id, tenant_id=tenant_id, workspace_id=workspace_id, metadata=dict(metadata))


def _metadata_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _hint_text(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    return text or None


def _hint_list(value: Any) -> Optional[List[dict]]:
    return list(value) if isinstance(value, list) else None


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def normalize_requested_max_iterations(value: Any) -> Optional[int]:
    if value in {None, ""}:
        return None
    parsed = safe_int(value, 0)
    if parsed <= 0:
        raise HTTPException(status_code=400, detail="max_iterations must be greater than zero.")
    return parsed


def local_execution_requires_start_confirmation(
    metadata: Dict[str, Any],
    precheck: Dict[str, Any],
    *,
    local_execution_target: str,
    local_execution_pack_id: str,
) -> bool:
    target = str(metadata.get("execution_target_selected") or metadata.get("execution_target") or "").strip().lower()
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if target != local_execution_target:
        return False
    if outcome_pack != local_execution_pack_id:
        return False
    return bool(precheck.get("require_confirmation_count") or precheck.get("approval_required_count"))


def precheck_human_action_labels(precheck: Dict[str, Any], decision: str = "require_confirmation") -> List[str]:
    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    labels: List[str] = []
    seen: set[str] = set()
    accepted = {str(decision or "").strip().lower()}
    if "require_confirmation" in accepted:
        accepted.add("approval_required")
    if "deny" in accepted:
        accepted.add("blocked")
    for item in items:
        if not isinstance(item, dict):
            continue
        item_decision = str(item.get("execution_decision") or item.get("decision") or "").strip().lower()
        if item_decision not in accepted:
            continue
        capabilities = item.get("capabilities") if isinstance(item.get("capabilities"), list) else []
        capability_labels = [
            str(cap.get("title") or "").strip()
            for cap in capabilities
            if isinstance(cap, dict) and str(cap.get("title") or "").strip()
        ]
        raw_label = capability_labels[0] if capability_labels else str(item.get("tool_id") or "").strip().replace("_", " ")
        clean = raw_label.strip()
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            labels.append(clean)
    return labels


def local_execution_confirmation_prompt(precheck: Dict[str, Any]) -> str:
    labels = precheck_human_action_labels(precheck, decision="require_confirmation")
    if labels:
        return f"Confirmation required before local companion execution: {', '.join(labels)}."
    return "Confirmation required before local companion execution."


def local_execution_block_prompt(precheck: Dict[str, Any]) -> str:
    labels = precheck_human_action_labels(precheck, decision="deny")
    if labels:
        return f"Run blocked by local execution policy: {', '.join(labels)}."
    return "Run blocked by local execution policy."


def mark_local_execution_tools_approved(metadata: Dict[str, Any]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else None
    if not isinstance(precheck, dict):
        return

    approved_tools = [
        str(item).strip().lower()
        for item in (precheck.get("require_confirmation") or precheck.get("approval_required") or [])
        if str(item).strip()
    ]
    if not approved_tools:
        return

    allowed = [
        str(item).strip().lower()
        for item in (precheck.get("allowed") or [])
        if str(item).strip()
    ]
    allowed_set = set(allowed)
    for tool in approved_tools:
        allowed_set.add(tool)

    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    rewritten_items: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        next_item = dict(item)
        tool_id = str(next_item.get("tool_id") or "").strip().lower()
        if tool_id in approved_tools:
            next_item["execution_decision"] = "allow"
            next_item["decision"] = "allow"
            next_item["reason"] = "confirmed_for_local_execution"
        rewritten_items.append(next_item)

    precheck["require_confirmation"] = []
    precheck["require_confirmation_count"] = 0
    precheck["approval_required"] = []
    precheck["approval_required_count"] = 0
    precheck["allowed"] = sorted(allowed_set)
    precheck["allow_count"] = len(precheck["allowed"])
    precheck["items"] = rewritten_items
    metadata["tool_policy_precheck"] = precheck


def apply_browser_execution_metadata(metadata: Dict[str, Any]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else {}
    browser_policy = precheck.get("browser_automation_policy") if isinstance(precheck.get("browser_automation_policy"), dict) else {}
    session_profiles = list(browser_policy.get("session_profiles") or []) if isinstance(browser_policy, dict) else []
    immutable_plan_hash = str(browser_policy.get("immutable_plan_hash") or "").strip() if isinstance(browser_policy, dict) else ""
    if session_profiles:
        metadata["browser_session_profile"] = session_profiles[0]
    if immutable_plan_hash:
        metadata["browser_immutable_plan_hash"] = immutable_plan_hash
    if bool(browser_policy.get("reviewed_approval_required")):
        metadata["browser_reviewed_approval_required"] = True
    elif "browser_reviewed_approval_required" in metadata:
        metadata.pop("browser_reviewed_approval_required", None)


def build_run_start_request_from_turn(
    turn_request: AgentTurnRequest,
    *,
    base_request: Optional[Any] = None,
) -> RunStartRequest:
    base = base_request if isinstance(base_request, RunStartRequest) else RunStartRequest()
    base_metadata = _metadata_dict(getattr(base, "metadata", None))
    hint_metadata = _metadata_dict(turn_request.context_hints.get("metadata"))
    metadata = {**hint_metadata, **base_metadata}
    metadata = bind_agent_turn_metadata(metadata, turn_request, source="runs/start")
    if turn_request.policy_context:
        metadata["policy_context"] = dict(turn_request.policy_context)
    if turn_request.machine_target and not _hint_text(metadata.get("machine_target")):
        metadata["machine_target"] = str(turn_request.machine_target).strip()
    if not _hint_text(metadata.get("channel")):
        metadata["channel"] = str(turn_request.channel or "").strip() or "web"
    if not _hint_text(metadata.get("session_id")):
        metadata["session_id"] = str(turn_request.session_id or "").strip()

    return RunStartRequest(
        engine=_hint_text(getattr(base, "engine", None)) or _hint_text(turn_request.context_hints.get("engine")) or "orion",
        workflow_id=_hint_text(getattr(base, "workflow_id", None)) or _hint_text(turn_request.context_hints.get("workflow_id")),
        workspace_id=str(turn_request.workspace_id or getattr(base, "workspace_id", None) or "default").strip() or "default",
        user_goal=_hint_text(turn_request.message) or _hint_text(getattr(base, "user_goal", None)),
        business_plan=_hint_text(getattr(base, "business_plan", None)),
        max_iterations=(
            getattr(base, "max_iterations", None)
            if getattr(base, "max_iterations", None) is not None
            else turn_request.context_hints.get("max_iterations")
        ),
        agent_role=_hint_text(getattr(base, "agent_role", None)) or _hint_text(turn_request.context_hints.get("agent_role")),
        parent_run_id=_hint_text(getattr(base, "parent_run_id", None)) or _hint_text(metadata.get("parent_run_id")),
        provider=_hint_text(getattr(base, "provider", None)) or _hint_text(turn_request.context_hints.get("provider")),
        model=_hint_text(getattr(base, "model", None)) or _hint_text(turn_request.context_hints.get("model")),
        credential_id=_hint_text(getattr(base, "credential_id", None)) or _hint_text(turn_request.context_hints.get("credential_id")),
        agents=_hint_list(getattr(base, "agents", None)),
        metadata=metadata,
    )


def prepare_run_start_request(
    req: RunStartRequest,
    *,
    services: RunPreparationServices,
) -> Dict[str, Any]:
    engine = (req.engine or "orion").lower().strip()
    metadata = dict(req.metadata) if isinstance(req.metadata, dict) else {}
    normalized_max_iterations = services.normalize_requested_max_iterations(getattr(req, "max_iterations", None))
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if engine not in services.engine_registry:
        raise HTTPException(status_code=400, detail=f"Unsupported engine '{engine}'")
    if engine == "orion" and services.engine_validation_errors:
        raise HTTPException(status_code=503, detail="Empyralis runtime validation failed.")
    if engine == "orion" and outcome_pack and outcome_pack not in services.supported_outcome_packs:
        raise HTTPException(status_code=400, detail=f"Unsupported outcome pack '{outcome_pack}'")

    if engine == "orion":
        raw_trust_mode = str(metadata.get("trust_mode") or "").strip().lower()
        normalized_trust_mode = services.normalize_trust_mode(raw_trust_mode)
        if (
            raw_trust_mode
            and raw_trust_mode not in services.trust_mode_aliases
            and raw_trust_mode not in services.valid_trust_modes
        ):
            raise HTTPException(
                status_code=400,
                detail="Unsupported trust_mode. Use one of: auto, guarded, strict, cost_guard, sensitive_guard.",
            )
        metadata["trust_mode"] = normalized_trust_mode

        if "pack_inputs" in metadata and not isinstance(metadata.get("pack_inputs"), dict):
            raise HTTPException(status_code=400, detail="metadata.pack_inputs must be an object.")
        if "outcome_scope" in metadata and not isinstance(metadata.get("outcome_scope"), list):
            raise HTTPException(status_code=400, detail="metadata.outcome_scope must be a list.")
        if "connector_credential_id" in metadata and metadata.get("connector_credential_id") is not None:
            if not isinstance(metadata.get("connector_credential_id"), str):
                raise HTTPException(status_code=400, detail="metadata.connector_credential_id must be a string.")
        if "approval_rules" in metadata and not isinstance(metadata.get("approval_rules"), dict):
            raise HTTPException(status_code=400, detail="metadata.approval_rules must be an object.")
        if "schedule" in metadata and not isinstance(metadata.get("schedule"), dict):
            raise HTTPException(status_code=400, detail="metadata.schedule must be an object.")
        if "execution_target" in metadata:
            normalized_target = services.normalize_execution_target(metadata.get("execution_target"))
            if normalized_target not in services.valid_execution_targets:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported execution_target. Use one of: auto, cloud, local_companion.",
                )
            metadata["execution_target"] = normalized_target

    if normalized_max_iterations is not None:
        metadata["max_iterations"] = normalized_max_iterations
    else:
        metadata.pop("max_iterations", None)

    parent_run_id = services.normalize_run_id_token(req.parent_run_id or metadata.get("parent_run_id"))
    if parent_run_id:
        metadata["parent_run_id"] = parent_run_id
    elif "parent_run_id" in metadata:
        metadata.pop("parent_run_id", None)

    delegation_root_run_id = services.normalize_run_id_token(metadata.get("delegation_root_run_id"))
    if delegation_root_run_id:
        metadata["delegation_root_run_id"] = delegation_root_run_id
    elif "delegation_root_run_id" in metadata:
        metadata.pop("delegation_root_run_id", None)

    delegated_by_run_id = services.normalize_run_id_token(metadata.get("delegated_by_run_id"))
    if delegated_by_run_id:
        metadata["delegated_by_run_id"] = delegated_by_run_id
    elif "delegated_by_run_id" in metadata:
        metadata.pop("delegated_by_run_id", None)

    delegated_by_role = services.normalize_agent_role(metadata.get("delegated_by_role"))
    if delegated_by_role:
        metadata["delegated_by_role"] = delegated_by_role
    elif "delegated_by_role" in metadata:
        metadata.pop("delegated_by_role", None)

    agent_role, agent_role_source = services.detect_agent_role(req, metadata)
    metadata["agent_role"] = agent_role
    metadata["agent_role_source"] = agent_role_source

    app_id = str(metadata.get("app_id") or "").strip()
    if app_id:
        app_permissions = services.resolve_app_permissions(app_id)
        metadata["app_id"] = app_id
        metadata["app_permissions"] = app_permissions
        app_policy = services.action_policy_from_app_permissions(app_permissions)
        existing_policy = metadata.get("action_policy") if isinstance(metadata.get("action_policy"), dict) else {}
        metadata["action_policy"] = services.merge_action_policies(
            {"action_policy": existing_policy},
            {"action_policy": app_policy},
        )

    workflow_snapshot = None
    if str(req.workflow_id or "").strip():
        workflow_snapshot = services.fetch_workflow_snapshot(req.workflow_id)
        if isinstance(workflow_snapshot, dict):
            metadata["workflow_schema_version"] = str(
                workflow_snapshot.get("definition", {}).get("version") or ""
            ).strip() or None
            if workflow_snapshot.get("name") and "workflow_name" not in metadata:
                metadata["workflow_name"] = workflow_snapshot.get("name")
            if workflow_snapshot.get("status"):
                metadata["workflow_status"] = workflow_snapshot.get("status")

    if callable(services.postprocess_metadata):
        metadata = services.postprocess_metadata(req, metadata)

    return {
        "engine": engine,
        "metadata": metadata,
        "workflow_snapshot": workflow_snapshot,
    }


def create_run_result_from_request(
    request: RunStartRequest,
    *,
    services: RunCreationServices,
    schedule_id: Optional[str] = None,
) -> Dict[str, Any]:
    if schedule_id is not None:
        result = services.create_run_from_request(request, schedule_id=schedule_id)
    else:
        result = services.create_run_from_request(request)
    return dict(result) if isinstance(result, dict) else {"result": result}


def create_run_from_prepared_request(
    req: RunStartRequest,
    *,
    prepared: Dict[str, Any],
    services: PreparedRunCreationServices,
    schedule_id: Optional[str] = None,
) -> Dict[str, Any]:
    engine = prepared["engine"]
    metadata = dict(prepared["metadata"])
    workflow_snapshot = prepared.get("workflow_snapshot") if isinstance(prepared.get("workflow_snapshot"), dict) else None
    route = services.decide_execution_target(metadata, schedule_id=schedule_id)
    metadata = services.apply_execution_route_metadata(metadata, route)
    doctor_preflight = services.build_doctor_run_gate(
        execution_target=route["selected"],
        metadata=metadata,
        provider=req.provider,
        credential_id=req.credential_id,
    )
    if bool(doctor_preflight.get("blocking")):
        raise HTTPException(
            status_code=409,
            detail=str(
                doctor_preflight.get("detail")
                or doctor_preflight.get("title")
                or "Run blocked by doctor policy."
            ),
        )
    metadata["doctor_preflight"] = doctor_preflight

    if schedule_id:
        metadata["schedule_id"] = schedule_id
        metadata["scheduled"] = True
    preview_context = {
        "workflow_id": req.workflow_id,
        "workspace_id": req.workspace_id,
        "user_goal": req.user_goal,
        "business_plan": req.business_plan,
        "max_iterations": getattr(req, "max_iterations", None),
        "agent_role": req.agent_role,
        "provider": req.provider,
        "model": req.model,
        "credential_id": req.credential_id,
        "agents": req.agents or [],
        "metadata": metadata,
        "workflow_definition": workflow_snapshot.get("definition") if isinstance(workflow_snapshot, dict) else None,
        "workflow_name": workflow_snapshot.get("name") if isinstance(workflow_snapshot, dict) else None,
        "workflow_status": workflow_snapshot.get("status") if isinstance(workflow_snapshot, dict) else None,
    }
    owner_user_id = services.agent_machine_inherited_owner_user_id(str(metadata.get("owner_user_id") or "").strip())
    if owner_user_id:
        metadata["owner_user_id"] = owner_user_id
    metadata["tool_policy_precheck"] = services.compute_tool_policy_precheck(preview_context)
    services.apply_browser_execution_metadata(metadata)
    if metadata["tool_policy_precheck"].get("blocked_count"):
        raise HTTPException(
            status_code=409,
            detail=services.local_execution_block_prompt(metadata["tool_policy_precheck"]),
        )
    runtime_policy = services.resolve_runtime_policy_mode(
        metadata,
        selected_target=metadata.get("execution_target_selected") or metadata.get("execution_target"),
    )
    metadata["policy_mode"] = runtime_policy.get("policy_mode")
    agent_machine_full_trust = services.agent_machine_full_trust_enabled(str(metadata.get("owner_user_id") or "").strip())
    browser_policy = (
        metadata["tool_policy_precheck"].get("browser_automation_policy")
        if isinstance(metadata.get("tool_policy_precheck"), dict)
        else {}
    )
    if agent_machine_full_trust and isinstance(browser_policy, dict) and bool(browser_policy.get("reviewed_approval_required")):
        metadata["browser_reviewed_approved"] = True
        if callable(services.now_iso):
            metadata["browser_reviewed_approved_at"] = services.now_iso()
    needs_local_confirmation = services.local_execution_requires_start_confirmation(
        metadata,
        metadata["tool_policy_precheck"],
    )
    if needs_local_confirmation and agent_machine_full_trust:
        services.mark_local_execution_tools_approved(metadata)
        metadata.pop("local_execution_waiting_confirmation", None)
        metadata.pop("local_execution_waiting_approval", None)
        needs_local_confirmation = False
    if needs_local_confirmation:
        metadata["local_execution_waiting_confirmation"] = True
        metadata["local_execution_waiting_approval"] = True
        preview_context["metadata"] = metadata
    run_id = services.create_run(
        engine=engine,
        context=preview_context,
        defer_local_enqueue=needs_local_confirmation,
    )
    created_run = services.load_created_run(run_id) if callable(services.load_created_run) else {}
    if not isinstance(created_run, dict):
        created_run = {}
    status = "starting"
    if needs_local_confirmation:
        approval_labels = services.precheck_human_action_labels(
            metadata["tool_policy_precheck"],
            decision="require_confirmation",
        )
        pending = services.begin_run_pending_confirmation(
            run_id,
            services.local_execution_confirmation_prompt(metadata["tool_policy_precheck"]),
            source="local_execution_start",
            metadata={
                "target": metadata.get("execution_target_selected"),
                "policy_mode": metadata.get("policy_mode"),
                "approval_actions": list(metadata["tool_policy_precheck"].get("require_confirmation") or []),
                "approval_labels": approval_labels,
                "approval_capabilities": list(metadata["tool_policy_precheck"].get("capability_ids") or []),
                "outcome_pack": metadata.get("outcome_pack"),
            },
        )
        status = "waiting_for_input"
    else:
        pending = None
    return {
        "run_id": run_id,
        "engine": engine,
        "status": status,
        "metadata": metadata,
        "route": route,
        "doctor_preflight": doctor_preflight,
        "pending_confirmation": pending,
        "created_run": created_run,
    }


async def execute_durable_turn_request(
    *,
    turn_request: AgentTurnRequest,
    current_user: Any,
    services: RunExecutionServices,
    base_request: Optional[Any] = None,
) -> Dict[str, Any]:
    req = build_run_start_request_from_turn(turn_request, base_request=base_request)
    req = services.stamp_request_owner(req, current_user)
    prepared = services.prepare_run_start_request(req)
    metadata = dict(prepared["metadata"])
    route = decide_execution_target(metadata)
    metadata = apply_execution_route_metadata(metadata, route)
    doctor_preflight = await build_doctor_run_gate_live(
        execution_target=route["selected"],
        metadata=metadata,
        provider=req.provider,
        credential_id=req.credential_id,
    )
    if bool(doctor_preflight.get("blocking")):
        raise HTTPException(
            status_code=409,
            detail=str(
                doctor_preflight.get("detail")
                or doctor_preflight.get("title")
                or "Run blocked by doctor policy."
            ),
        )
    result = services.create_run_from_request(req)
    if isinstance(result, dict):
        result["doctor_preflight"] = doctor_preflight
    return {
        "kind": "durable_run",
        "result": result,
        "turn_request": turn_request,
    }
