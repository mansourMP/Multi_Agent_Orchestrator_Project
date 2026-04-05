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


@dataclass(slots=True)
class DirectChatTurnResolution:
    turn_request: AgentTurnRequest
    workspace_id: str
    thread_id: str
    client_request_id: str
    message: str


@dataclass(slots=True)
class RunStartTurnResolution:
    request: Any
    turn_request: AgentTurnRequest


class AgentTurnRuntime(Protocol):
    def handle_turn(self, request: AgentTurnRequest) -> AgentTurnResponse: ...


def normalize_channel(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text or "web"


def _metadata_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _attachments_from_payload(items: Any) -> List[TurnAttachment]:
    if not isinstance(items, list):
        return []
    attachments: List[TurnAttachment] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri") or "").strip()
        if not uri:
            continue
        attachments.append(
            TurnAttachment(
                kind=str(item.get("kind") or "file").strip() or "file",
                uri=uri,
                name=str(item.get("name") or "").strip(),
                metadata=_metadata_dict(item.get("metadata")),
            )
        )
    return attachments


def _request_actor_id(current_user: Any, metadata: Optional[Dict[str, Any]] = None) -> str:
    metadata = metadata if isinstance(metadata, dict) else {}
    return (
        str((current_user or {}).get("user_id") or "").strip()
        or str((current_user or {}).get("email") or "").strip().lower()
        or str(metadata.get("owner_user_id") or "").strip()
        or str(metadata.get("owner_email") or "").strip().lower()
        or str((current_user or {}).get("auth_type") or "").strip()
        or "anonymous"
    )


def _request_actor_display_name(current_user: Any, actor_id: str) -> str:
    email = str((current_user or {}).get("email") or "").strip()
    if email:
        return email
    return actor_id


def serialize_turn_actor(actor: TurnActor) -> Dict[str, Any]:
    return {
        "type": str(actor.type or "").strip() or "user",
        "id": str(actor.id or "").strip(),
        "display_name": str(actor.display_name or "").strip(),
    }


def serialize_turn_attachment(attachment: TurnAttachment) -> Dict[str, Any]:
    return {
        "kind": str(attachment.kind or "").strip() or "file",
        "uri": str(attachment.uri or "").strip(),
        "name": str(attachment.name or "").strip(),
        "metadata": dict(attachment.metadata or {}),
    }


def serialize_agent_turn_request(request: AgentTurnRequest) -> Dict[str, Any]:
    return {
        "tenant_id": str(request.tenant_id or "").strip(),
        "workspace_id": str(request.workspace_id or "").strip() or "default",
        "session_id": str(request.session_id or "").strip(),
        "channel": normalize_channel(request.channel),
        "actor": serialize_turn_actor(request.actor),
        "message": str(request.message or ""),
        "attachments": [serialize_turn_attachment(item) for item in request.attachments],
        "context_hints": dict(request.context_hints or {}),
        "execution_mode": request.execution_mode,
        "response_mode": request.response_mode,
        "machine_target": str(request.machine_target or "").strip() or None,
        "policy_context": dict(request.policy_context or {}),
    }


def resolve_agent_turn_request(value: Any) -> Optional[AgentTurnRequest]:
    if isinstance(value, AgentTurnRequest):
        return value
    if isinstance(value, dict):
        return build_agent_turn_request(value)
    return None


def resolve_agent_turn_request_with_fallback(
    value: Any,
    fallback: Any = None,
) -> Optional[AgentTurnRequest]:
    resolved = resolve_agent_turn_request(value)
    if isinstance(resolved, AgentTurnRequest):
        return resolved
    return resolve_agent_turn_request(fallback)


def resolve_agent_turn_request_from_runtime_context(
    *,
    request_meta: Any = None,
    session_ctx: Any = None,
) -> Optional[AgentTurnRequest]:
    meta = request_meta if isinstance(request_meta, dict) else {}
    context = session_ctx if isinstance(session_ctx, dict) else {}
    return resolve_agent_turn_request_with_fallback(
        meta.get("agent_turn_request"),
        context.get("agent_turn_request"),
    )


def build_agent_turn_request(payload: Dict[str, Any]) -> AgentTurnRequest:
    actor_payload = payload.get("actor") if isinstance(payload.get("actor"), dict) else {}
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
        attachments=_attachments_from_payload(payload.get("attachments")),
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


def build_direct_chat_turn_request(
    *,
    current_user: Any,
    body: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    client_request_id: str,
    message: str,
) -> AgentTurnRequest:
    actor_id = _request_actor_id(current_user)
    body_metadata = _metadata_dict(body.get("metadata"))
    policy_context = _metadata_dict(body.get("policy_context"))
    runtime_hints = {
        "provider": str(body.get("provider") or "").strip() or None,
        "model": str(body.get("model") or "").strip() or None,
        "reasoning_effort": str(body.get("reasoning_effort") or "").strip() or None,
        "request_id": str(client_request_id or "").strip() or None,
        "approved_action": body.get("approved_action") if isinstance(body.get("approved_action"), dict) else None,
        "prior_messages": body.get("prior_messages") if isinstance(body.get("prior_messages"), list) else [],
        "max_iterations": body.get("max_iterations"),
        "metadata": body_metadata,
    }
    return AgentTurnRequest(
        tenant_id=str(body.get("tenant_id") or actor_id or "default").strip() or "default",
        workspace_id=str(workspace_id or "default").strip() or "default",
        session_id=str(thread_id or client_request_id or "direct-chat").strip() or "direct-chat",
        channel=normalize_channel(body.get("channel") or "web"),
        actor=TurnActor(
            type="user",
            id=actor_id,
            display_name=_request_actor_display_name(current_user, actor_id),
        ),
        message=str(message or ""),
        attachments=_attachments_from_payload(body.get("attachments")),
        context_hints={key: value for key, value in runtime_hints.items() if value not in (None, "", [], {})},
        execution_mode="sync",
        response_mode="stream",
        machine_target=str(body.get("machine_target") or "").strip() or None,
        policy_context=policy_context,
    )


def resolve_direct_chat_turn_request(
    *,
    current_user: Any,
    body: Dict[str, Any],
    request_signature_fn: Any,
) -> DirectChatTurnResolution:
    if not isinstance(body, dict):
        raise ValueError("Invalid chat payload.")
    message = str(body.get("message") or "").strip()
    if not message:
        raise ValueError("Chat message is required.")
    workspace_id = str(body.get("workspace_id") or "default").strip() or "default"
    thread_id = str(body.get("thread_id") or "").strip() or "direct-chat"
    client_request_id = (
        str(body.get("client_request_id") or "").strip()
        or str(request_signature_fn(body) if callable(request_signature_fn) else "").strip()
        or "direct-chat-request"
    )
    turn_request = build_direct_chat_turn_request(
        current_user=current_user,
        body=body,
        workspace_id=workspace_id,
        thread_id=thread_id,
        client_request_id=client_request_id,
        message=message,
    )
    return DirectChatTurnResolution(
        turn_request=turn_request,
        workspace_id=workspace_id,
        thread_id=thread_id,
        client_request_id=client_request_id,
        message=message,
    )


def ensure_direct_chat_turn_request(
    *,
    current_user: Any,
    body: Dict[str, Any],
    workspace_id: str,
    thread_id: str,
    client_request_id: str,
    message: str,
    agent_turn_request: Any = None,
) -> AgentTurnRequest:
    resolved = resolve_agent_turn_request(agent_turn_request)
    if isinstance(resolved, AgentTurnRequest):
        return resolved
    return build_direct_chat_turn_request(
        current_user=current_user,
        body=body,
        workspace_id=workspace_id,
        thread_id=thread_id,
        client_request_id=client_request_id,
        message=message,
    )


def resolve_run_start_turn_request(
    *,
    current_user: Any,
    body: Any,
    stamp_request_owner_fn: Any,
) -> RunStartTurnResolution:
    from server_modules.runtime_models import RunStartRequest

    request = body if body is not None else RunStartRequest()
    if callable(stamp_request_owner_fn):
        request = stamp_request_owner_fn(request, current_user)
    return RunStartTurnResolution(
        request=request,
        turn_request=build_run_start_turn_request(request),
    )


def build_run_start_turn_request(req: Any) -> AgentTurnRequest:
    metadata = _metadata_dict(getattr(req, "metadata", None))
    actor_id = _request_actor_id(None, metadata)
    workspace_id = str(getattr(req, "workspace_id", None) or metadata.get("workspace_id") or "default").strip() or "default"
    session_id = (
        str(metadata.get("session_id") or "").strip()
        or str(metadata.get("thread_id") or "").strip()
        or str(metadata.get("parent_run_id") or "").strip()
        or str(getattr(req, "workflow_id", None) or "").strip()
        or "run-start"
    )
    message = (
        str(getattr(req, "user_goal", None) or "").strip()
        or str(getattr(req, "business_plan", None) or "").strip()
        or str(metadata.get("summary") or "").strip()
    )
    policy_context = {
        "trust_mode": str(metadata.get("trust_mode") or "").strip() or None,
        "outcome_pack": str(metadata.get("outcome_pack") or "").strip() or None,
        "execution_target": str(metadata.get("execution_target") or "").strip() or None,
        "action_policy": metadata.get("action_policy") if isinstance(metadata.get("action_policy"), dict) else None,
    }
    context_hints = {
        "engine": str(getattr(req, "engine", None) or "orion").strip().lower() or "orion",
        "workflow_id": str(getattr(req, "workflow_id", None) or "").strip() or None,
        "provider": str(getattr(req, "provider", None) or "").strip() or None,
        "model": str(getattr(req, "model", None) or "").strip() or None,
        "credential_id": str(getattr(req, "credential_id", None) or "").strip() or None,
        "agent_role": str(getattr(req, "agent_role", None) or "").strip() or None,
        "max_iterations": getattr(req, "max_iterations", None),
        "metadata": metadata,
    }
    return AgentTurnRequest(
        tenant_id=str(metadata.get("tenant_id") or actor_id or "default").strip() or "default",
        workspace_id=workspace_id,
        session_id=session_id,
        channel=normalize_channel(metadata.get("channel") or "web"),
        actor=TurnActor(
            type="user",
            id=actor_id,
            display_name=str(metadata.get("owner_email") or actor_id).strip(),
        ),
        message=message,
        attachments=[],
        context_hints={key: value for key, value in context_hints.items() if value not in (None, "", [], {})},
        execution_mode="durable",
        response_mode="artifact",
        machine_target=(
            str(metadata.get("machine_target") or "").strip()
            or str(metadata.get("execution_target_selected") or "").strip()
            or str(metadata.get("execution_target") or "").strip()
            or None
        ),
        policy_context={key: value for key, value in policy_context.items() if value not in (None, "", [], {})},
    )


def bind_agent_turn_metadata(
    metadata: Optional[Dict[str, Any]],
    request: AgentTurnRequest,
    *,
    source: str,
) -> Dict[str, Any]:
    bound = _metadata_dict(metadata)
    bound["agent_turn_request"] = serialize_agent_turn_request(request)
    bound["agent_turn_contract_version"] = 1
    if source and not str(bound.get("source") or "").strip():
        bound["source"] = str(source).strip()
    if request.session_id and not str(bound.get("session_id") or "").strip():
        bound["session_id"] = str(request.session_id).strip()
    if request.channel and not str(bound.get("channel") or "").strip():
        bound["channel"] = normalize_channel(request.channel)
    if request.machine_target and not str(bound.get("machine_target") or "").strip():
        bound["machine_target"] = str(request.machine_target).strip()
    if request.actor.id and not str(bound.get("request_actor_id") or "").strip():
        bound["request_actor_id"] = str(request.actor.id).strip()
    return bound


def bind_agent_turn_request_meta(
    request_meta: Optional[Dict[str, Any]],
    request: Any,
) -> Dict[str, Any]:
    bound = _metadata_dict(request_meta)
    resolved = resolve_agent_turn_request(request)
    if not isinstance(resolved, AgentTurnRequest):
        return bound
    bound["agent_turn_request"] = serialize_agent_turn_request(resolved)
    if resolved.workspace_id and not str(bound.get("workspace_id") or "").strip():
        bound["workspace_id"] = str(resolved.workspace_id).strip()
    if resolved.session_id and not str(bound.get("thread_id") or "").strip():
        bound["thread_id"] = str(resolved.session_id).strip()
    return bound


def resolve_agent_turn_session_identity(
    request: Any,
    *,
    workspace_id: str = "",
    session_id: str = "",
    user_id: str = "",
) -> Dict[str, str]:
    resolved = resolve_agent_turn_request(request)
    if not isinstance(resolved, AgentTurnRequest):
        return {
            "workspace_id": str(workspace_id or "default").strip() or "default",
            "thread_id": str(session_id or "direct-chat").strip() or "direct-chat",
            "user_id": str(user_id or "").strip(),
        }
    return {
        "workspace_id": str(resolved.workspace_id or workspace_id or "default").strip() or "default",
        "thread_id": str(resolved.session_id or session_id or "direct-chat").strip() or "direct-chat",
        "user_id": str(user_id or resolved.actor.id or "").strip(),
    }


def build_agent_turn_session_context(
    request: Any,
    *,
    workspace_id: str = "",
    session_id: str = "",
    user_id: str = "",
) -> Dict[str, Any]:
    resolved = resolve_agent_turn_request(request)
    identity = resolve_agent_turn_session_identity(
        request,
        workspace_id=workspace_id,
        session_id=session_id,
        user_id=user_id,
    )
    if not isinstance(resolved, AgentTurnRequest):
        return identity
    return {
        **identity,
        "agent_turn_request": serialize_agent_turn_request(resolved),
    }
