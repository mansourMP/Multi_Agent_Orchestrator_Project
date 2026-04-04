from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

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
