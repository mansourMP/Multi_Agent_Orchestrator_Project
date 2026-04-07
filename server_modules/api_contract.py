from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from server_modules.agent_turn import (
    AgentTurnRequest,
    AgentTurnResponse,
    build_agent_turn_request,
    serialize_turn_attachment,
    serialize_agent_turn_request,
)


class ApiTurnActor(BaseModel):
    type: str = "user"
    id: str = ""
    display_name: str = ""


class ApiTurnAttachment(BaseModel):
    kind: str = "file"
    uri: str
    name: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ApiAgentTurnRequest(BaseModel):
    tenant_id: str = "default"
    workspace_id: str = "default"
    session_id: str
    channel: str = "web"
    actor: ApiTurnActor
    message: str
    attachments: List[ApiTurnAttachment] = Field(default_factory=list)
    context_hints: Dict[str, Any] = Field(default_factory=dict)
    execution_mode: Literal["sync", "durable"] = "sync"
    response_mode: Literal["stream", "artifact", "channel_reply"] = "stream"
    machine_target: Optional[str] = None
    policy_context: Dict[str, Any] = Field(default_factory=dict)


class ApiAgentTurnResponse(BaseModel):
    ok: bool = True
    status: str
    reply: str = ""
    run_id: Optional[str] = None
    session_id: Optional[str] = None
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)
    approvals: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ApiRunListItem(BaseModel):
    run_id: Optional[str] = None
    engine: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    workspace_id: Optional[str] = None
    owner_user_id: Optional[str] = None
    owner_email: Optional[str] = None
    workflow_id: Optional[str] = None
    pack_id: Optional[str] = None
    agent_role: Optional[str] = None
    parent_run_id: Optional[str] = None
    execution_target_selected: Optional[str] = None
    result_summary: Optional[str] = None
    source: Optional[Literal["live", "history"]] = None
    raw: Dict[str, Any] = Field(default_factory=dict)


class ApiRunListResponse(BaseModel):
    items: List[Dict[str, Any]] = Field(default_factory=list)
    count: int = 0
    total: int = 0
    limit: int = 50
    offset: int = 0
    next_offset: Optional[int] = None


class ApiNotificationItem(BaseModel):
    id: Optional[str] = None
    ts: Optional[str] = None
    channel: Optional[str] = None
    direction: Optional[str] = None
    event_type: Optional[str] = None
    workspace_id: Optional[str] = None
    session_key: Optional[str] = None
    session_id: Optional[str] = None
    message_id: Optional[str] = None
    parent_id: Optional[str] = None
    run_id: Optional[str] = None
    trace_id: Optional[str] = None
    action: Optional[str] = None
    text: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ApiNotificationListResponse(BaseModel):
    items: List[Dict[str, Any]] = Field(default_factory=list)
    count: int = 0
    total: int = 0
    sessions: List[Dict[str, Any]] = Field(default_factory=list)
    session_count: int = 0
    stream: bool = False


class ApiArtifactListResponse(BaseModel):
    ok: bool = True
    workspace_id: str = "default"
    updated_at: Optional[str] = None
    summary: Dict[str, Any] = Field(default_factory=dict)
    items: List[Dict[str, Any]] = Field(default_factory=list)


class ApiArtifactPreviewResponse(BaseModel):
    ok: bool = True
    path: str
    kind: str
    media_type: str
    byte_size: Optional[int] = None
    text_preview: Optional[str] = None
    file_url: Optional[str] = None
    download_url: Optional[str] = None
    file_name: Optional[str] = None
    note: Optional[str] = None


class ApiSessionRequest(BaseModel):
    tenant_id: str = "default"
    workspace_id: str = "default"
    channel: str = "web"
    actor: ApiTurnActor = Field(default_factory=ApiTurnActor)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    session_id: Optional[str] = None


class ApiSessionResponse(BaseModel):
    ok: bool = True
    session_id: str
    workspace_id: str = "default"
    tenant_id: str = "default"
    channel: str = "web"
    actor: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    expires_at: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    status: str = "active"


class ApiApprovalResolveRequest(BaseModel):
    approval_id: Optional[str] = None
    resolution: Literal["approved", "rejected"]
    actor: str = "user"
    reason: Optional[str] = None


class ApiApprovalResolveResponse(BaseModel):
    status: str = "ok"
    approval_id: str
    run_id: Optional[str] = None
    resolution: Literal["approved", "rejected"]
    actor: str = "user"
    reason: str = ""
    outbox_event: Dict[str, Any] = Field(default_factory=dict)


CANONICAL_API_ENDPOINTS: Dict[str, Dict[str, Any]] = {
    "turn": {
        "method": "POST",
        "path": "/turn",
        "request_model": "ApiAgentTurnRequest",
        "response_model": "ApiAgentTurnResponse",
        "notes": "Canonical turn entry for web, mobile, and desktop shells.",
    },
    "runs_list": {
        "method": "GET",
        "path": "/runs",
        "response_model": "ApiRunListResponse",
        "notes": "Canonical run listing endpoint; /runs/{run_id} remains the canonical detail endpoint.",
    },
    "notifications": {
        "method": "GET",
        "path": "/notifications",
        "response_model": "ApiNotificationListResponse",
        "notes": "Canonical notification feed. `stream=true` returns SSE.",
    },
    "approvals_resolve": {
        "method": "POST",
        "path": "/approvals/{approval_id}/resolve",
        "request_model": "ApiApprovalResolveRequest",
        "response_model": "ApiApprovalResolveResponse",
        "notes": "Canonical approval resolution endpoint with durable approval audit and outbox emission.",
    },
    "artifacts_list": {
        "method": "GET",
        "path": "/artifacts",
        "response_model": "ApiArtifactListResponse",
        "notes": "Canonical artifact listing endpoint; legacy alias /artifacts/workspace remains supported.",
    },
    "artifacts_preview": {
        "method": "GET",
        "path": "/artifacts/preview",
        "response_model": "ApiArtifactPreviewResponse",
        "notes": "Canonical artifact preview endpoint.",
    },
    "artifacts_content": {
        "method": "GET",
        "path": "/artifacts/content",
        "response_model": "binary",
        "notes": "Canonical artifact download endpoint; legacy alias /artifacts/file remains supported.",
    },
    "sessions": {
        "method": "POST/GET/DELETE",
        "path": "/sessions and /sessions/{session_id}",
        "request_model": "ApiSessionRequest",
        "response_model": "ApiSessionResponse",
        "notes": "Canonical runtime session bootstrap and lookup surface.",
    },
    "machines": {
        "method": "GET",
        "path": "/runtime/runtimes/status and /local/workers/status",
        "response_model": "varies",
        "notes": "Machine/runtime endpoints still exist but are not yet unified into one canonical runtime surface.",
    },
}


def model_to_dict(model: Any) -> Dict[str, Any]:
    if is_dataclass(model):
        return dict(asdict(model))
    if hasattr(model, "model_dump"):
        return dict(model.model_dump())
    if hasattr(model, "dict"):
        return dict(model.dict())
    return dict(model or {})


def request_body_to_turn_request(body: ApiAgentTurnRequest | AgentTurnRequest | Dict[str, Any]) -> AgentTurnRequest:
    if isinstance(body, AgentTurnRequest):
        return body
    if isinstance(body, ApiAgentTurnRequest):
        payload = model_to_dict(body)
    else:
        payload = dict(body or {})
    return build_agent_turn_request(payload)


def build_turn_chat_body(turn_request: AgentTurnRequest) -> Dict[str, Any]:
    hints = dict(turn_request.context_hints or {})
    return {
        "workspace_id": turn_request.workspace_id,
        "thread_id": turn_request.session_id,
        "channel": turn_request.channel,
        "message": turn_request.message,
        "attachments": [serialize_turn_attachment(item) for item in turn_request.attachments],
        "machine_target": turn_request.machine_target,
        "policy_context": dict(turn_request.policy_context or {}),
        "provider": hints.get("provider"),
        "model": hints.get("model"),
        "reasoning_effort": hints.get("reasoning_effort"),
        "approved_action": hints.get("approved_action") if isinstance(hints.get("approved_action"), dict) else None,
        "prior_messages": hints.get("prior_messages") if isinstance(hints.get("prior_messages"), list) else [],
        "max_iterations": hints.get("max_iterations"),
        "metadata": hints.get("metadata") if isinstance(hints.get("metadata"), dict) else {},
    }


def normalize_agent_turn_result(
    result: Dict[str, Any],
    *,
    turn_request: AgentTurnRequest,
) -> ApiAgentTurnResponse:
    kind = str(result.get("kind") or "").strip()
    if kind == "durable_run":
        durable = result.get("result") if isinstance(result.get("result"), dict) else {}
        return ApiAgentTurnResponse(
            status=str(durable.get("status") or "accepted"),
            run_id=str(durable.get("run_id") or "").strip() or None,
            session_id=turn_request.session_id,
            metadata={
                "kind": "durable_run",
                "engine": durable.get("engine"),
                "route": durable.get("route"),
                "doctor_preflight": durable.get("doctor_preflight"),
                "created_run": durable.get("created_run"),
                "turn_request": serialize_agent_turn_request(turn_request),
            },
        )
    if kind == "direct_chat_stream":
        return ApiAgentTurnResponse(
            status="stream_ready",
            session_id=str(result.get("thread_id") or turn_request.session_id or "").strip() or None,
            metadata={
                "kind": "direct_chat_stream",
                "workspace_id": result.get("workspace_id"),
                "session_key": result.get("session_key"),
                "thread_id": result.get("thread_id"),
                "client_request_id": result.get("client_request_id"),
                "turn_request": serialize_agent_turn_request(turn_request),
            },
        )
    normalized = AgentTurnResponse(
        status=str(result.get("status") or "ok"),
        reply=str(result.get("reply") or ""),
        run_id=str(result.get("run_id") or "").strip() or None,
        session_id=str(result.get("session_id") or turn_request.session_id or "").strip() or None,
        artifacts=list(result.get("artifacts") or []),
        approvals=list(result.get("approvals") or []),
        metadata=dict(result.get("metadata") or {}),
    )
    return ApiAgentTurnResponse(**model_to_dict(normalized))


def normalize_session_record(record: Dict[str, Any]) -> ApiSessionResponse:
    payload = dict(record or {})
    return ApiSessionResponse(
        session_id=str(payload.get("session_id") or "").strip(),
        workspace_id=str(payload.get("workspace_id") or "default").strip() or "default",
        tenant_id=str(payload.get("tenant_id") or "default").strip() or "default",
        channel=str(payload.get("channel") or "web").strip() or "web",
        actor=dict(payload.get("actor") or {}),
        created_at=str(payload.get("created_at") or "").strip() or None,
        expires_at=str(payload.get("expires_at") or "").strip() or None,
        metadata=dict(payload.get("metadata") or {}),
        status=str(payload.get("status") or "active").strip() or "active",
    )
