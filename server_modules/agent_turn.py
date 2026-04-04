from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Protocol


ExecutionMode = Literal["sync", "durable"]
ResponseMode = Literal["stream", "artifact", "channel_reply"]


@dataclass(slots=True)
class TurnActor:
    type: str
    id: str = ""
    display_name: str = ""


@dataclass(slots=True)
class TurnAttachment:
    kind: str
    uri: str
    name: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AgentTurnRequest:
    tenant_id: str
    workspace_id: str
    session_id: str
    channel: str
    actor: TurnActor
    message: str
    attachments: List[TurnAttachment] = field(default_factory=list)
    context_hints: Dict[str, Any] = field(default_factory=dict)
    execution_mode: ExecutionMode = "sync"
    response_mode: ResponseMode = "stream"
    machine_target: Optional[str] = None
    policy_context: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AgentTurnResponse:
    status: str
    reply: str = ""
    run_id: Optional[str] = None
    session_id: Optional[str] = None
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    approvals: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class AgentTurnRuntime(Protocol):
    def handle_turn(self, request: AgentTurnRequest) -> AgentTurnResponse: ...


def normalize_channel(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text or "web"


def build_agent_turn_request(payload: Dict[str, Any]) -> AgentTurnRequest:
    actor_payload = payload.get("actor") if isinstance(payload.get("actor"), dict) else {}
    attachments_payload = payload.get("attachments") if isinstance(payload.get("attachments"), list) else []
    return AgentTurnRequest(
        tenant_id=str(payload.get("tenant_id") or "").strip(),
        workspace_id=str(payload.get("workspace_id") or "").strip(),
        session_id=str(payload.get("session_id") or "").strip(),
        channel=normalize_channel(payload.get("channel")),
        actor=TurnActor(
            type=str(actor_payload.get("type") or "user").strip() or "user",
            id=str(actor_payload.get("id") or "").strip(),
            display_name=str(actor_payload.get("display_name") or "").strip(),
        ),
        message=str(payload.get("message") or ""),
        attachments=[
            TurnAttachment(
                kind=str(item.get("kind") or "file").strip() or "file",
                uri=str(item.get("uri") or "").strip(),
                name=str(item.get("name") or "").strip(),
                metadata=item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
            )
            for item in attachments_payload
            if isinstance(item, dict) and str(item.get("uri") or "").strip()
        ],
        context_hints=payload.get("context_hints") if isinstance(payload.get("context_hints"), dict) else {},
        execution_mode="durable" if str(payload.get("execution_mode") or "").strip().lower() == "durable" else "sync",
        response_mode=(
            str(payload.get("response_mode") or "stream").strip().lower()
            if str(payload.get("response_mode") or "").strip().lower() in {"stream", "artifact", "channel_reply"}
            else "stream"
        ),
        machine_target=str(payload.get("machine_target") or "").strip() or None,
        policy_context=payload.get("policy_context") if isinstance(payload.get("policy_context"), dict) else {},
    )
