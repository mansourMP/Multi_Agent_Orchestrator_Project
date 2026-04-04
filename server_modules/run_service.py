from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from server_modules.agent_turn import AgentTurnRequest, bind_agent_turn_metadata
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
