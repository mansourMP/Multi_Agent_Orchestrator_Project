from __future__ import annotations

from dataclasses import dataclass, field
import logging
from typing import Any, Dict, List, Literal, Optional, Protocol

from server_modules import session_service
from server_modules.telemetry import get_tracer, set_span_attributes


ExecutionMode = Literal["sync", "durable"]
ResponseMode = Literal["stream", "artifact", "channel_reply"]
SessionMode = Literal["copilot", "agent"]

LOGGER = logging.getLogger(__name__)
VALID_SESSION_MODES = {"copilot", "agent"}


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
    interventions: List[Dict[str, Any]] = field(default_factory=list)
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


def normalize_session_mode(value: Any) -> SessionMode:
    text = str(value or "").strip().lower()
    return text if text in VALID_SESSION_MODES else "copilot"


def _metadata_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _current_user_is_owner(current_user: Any) -> bool:
    if not isinstance(current_user, dict):
        return False
    if bool(current_user.get("is_admin")):
        return True
    auth_type = str(current_user.get("auth_type") or "").strip().lower()
    if auth_type in {"api_key", "disabled"}:
        return True
    return str(current_user.get("role") or "").strip().lower() == "owner"


def normalize_turn_policy_context(
    policy_context: Optional[Dict[str, Any]],
    *,
    current_user: Any,
    workspace_id: str = "",
    session_id: str = "",
    logger: Optional[logging.Logger] = None,
) -> Dict[str, Any]:
    normalized = _metadata_dict(policy_context)
    if "session_mode" not in normalized:
        return {key: value for key, value in normalized.items() if value not in (None, "", [], {})}

    requested_session_mode = normalize_session_mode(normalized.get("session_mode"))
    user_is_owner = _current_user_is_owner(current_user)
    current_user_id = str((current_user or {}).get("user_id") or "").strip()
    effective_session_mode = requested_session_mode
    downgrade_reason = ""

    full_trust_allowed = False
    if user_is_owner:
        try:
            from server_modules.runtime_config import agent_machine_full_trust_enabled

            full_trust_allowed = bool(agent_machine_full_trust_enabled(current_user_id))
        except Exception:
            full_trust_allowed = False

    if requested_session_mode == "agent":
        if not user_is_owner:
            effective_session_mode = "copilot"
            downgrade_reason = "owner_required"
        elif not full_trust_allowed:
            effective_session_mode = "copilot"
            downgrade_reason = "full_trust_disabled"

    if downgrade_reason:
        audit_logger = logger or LOGGER
        audit_logger.warning(
            "Downgraded requested agent session mode to copilot.",
            extra={
                "workspace_id": str(workspace_id or "").strip() or "default",
                "session_id": str(session_id or "").strip() or "agent-turn",
                "user_id": current_user_id,
                "email": str((current_user or {}).get("email") or "").strip().lower(),
                "requested_session_mode": requested_session_mode,
                "effective_session_mode": effective_session_mode,
                "reason": downgrade_reason,
            },
        )

    requested_trust_mode = str(normalized.get("trust_mode") or "").strip().lower()
    if effective_session_mode == "agent":
        effective_trust_mode = "auto"
    elif requested_trust_mode == "auto":
        effective_trust_mode = "guarded"
    else:
        effective_trust_mode = requested_trust_mode or None

    normalized["requested_session_mode"] = requested_session_mode
    normalized["session_mode"] = effective_session_mode
    normalized["effective_session_mode"] = effective_session_mode
    normalized["interactive_approvals"] = effective_session_mode != "agent"
    normalized["approval_ui"] = str(normalized.get("approval_ui") or "card").strip() or "card"
    if effective_trust_mode:
        normalized["trust_mode"] = effective_trust_mode
    elif "trust_mode" in normalized:
        normalized.pop("trust_mode", None)
    if downgrade_reason:
        normalized["session_mode_downgraded"] = True
        normalized["session_mode_downgrade_reason"] = downgrade_reason
    else:
        normalized.pop("session_mode_downgraded", None)
        normalized.pop("session_mode_downgrade_reason", None)

    return {key: value for key, value in normalized.items() if value not in (None, "", [], {})}


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


def build_inbound_agent_turn_request(
    *,
    tenant_id: str = "",
    workspace_id: str,
    session_id: str,
    channel: str,
    actor_type: str,
    actor_id: str,
    actor_display_name: str = "",
    message: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
    context_hints: Optional[Dict[str, Any]] = None,
    execution_mode: ExecutionMode = "sync",
    response_mode: ResponseMode = "stream",
    machine_target: Optional[str] = None,
    policy_context: Optional[Dict[str, Any]] = None,
) -> AgentTurnRequest:
    return AgentTurnRequest(
        tenant_id=str(tenant_id or actor_id or "default").strip() or "default",
        workspace_id=str(workspace_id or "default").strip() or "default",
        session_id=str(session_id or "agent-turn").strip() or "agent-turn",
        channel=normalize_channel(channel),
        actor=TurnActor(
            type=str(actor_type or "user").strip() or "user",
            id=str(actor_id or "").strip(),
            display_name=str(actor_display_name or actor_id or "").strip(),
        ),
        message=str(message or ""),
        attachments=_attachments_from_payload(attachments or []),
        context_hints=dict(context_hints or {}),
        execution_mode=execution_mode,
        response_mode=response_mode,
        machine_target=str(machine_target or "").strip() or None,
        policy_context=dict(policy_context or {}),
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


def build_local_worker_turn_request(
    *,
    worker_id: str,
    run: Optional[Dict[str, Any]],
    context: Optional[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]],
    goal: str,
) -> AgentTurnRequest:
    run_payload = run if isinstance(run, dict) else {}
    context_payload = context if isinstance(context, dict) else {}
    metadata_payload = metadata if isinstance(metadata, dict) else {}
    run_id = str(run_payload.get("id") or "").strip()
    machine_target = (
        str(metadata_payload.get("machine_target") or "").strip()
        or str(metadata_payload.get("execution_target_selected") or "").strip()
        or str(metadata_payload.get("execution_target") or "").strip()
        or None
    )
    return build_inbound_agent_turn_request(
        tenant_id=str(metadata_payload.get("tenant_id") or worker_id or "default").strip(),
        workspace_id=str(context_payload.get("workspace_id") or metadata_payload.get("workspace_id") or "default").strip() or "default",
        session_id=(
            str(metadata_payload.get("session_id") or "").strip()
            or str(metadata_payload.get("thread_id") or "").strip()
            or run_id
            or str(worker_id or "local-worker").strip()
        ),
        channel=str(metadata_payload.get("channel") or "local_worker").strip() or "local_worker",
        actor_type="worker",
        actor_id=str(worker_id or "").strip(),
        actor_display_name=str(worker_id or "local-worker").strip(),
        message=str(goal or ""),
        context_hints={
            "run_id": run_id or None,
            "metadata": metadata_payload,
        },
        execution_mode="sync",
        response_mode="artifact",
        machine_target=machine_target,
        policy_context={
            "execution_target": str(metadata_payload.get("execution_target") or "").strip() or None,
            "trust_mode": str(metadata_payload.get("trust_mode") or "").strip() or None,
        },
    )


def build_discord_turn_request(
    *,
    parsed: Dict[str, Any],
    connector_entry: Dict[str, Any],
    goal: str,
    trace_id: str,
) -> AgentTurnRequest:
    metadata = connector_entry.get("metadata") if isinstance(connector_entry.get("metadata"), dict) else {}
    workspace_id = str(connector_entry.get("workspace_id") or metadata.get("workspace_id") or "default").strip() or "default"
    session_id = (
        str(parsed.get("channel_id") or "").strip()
        or str(parsed.get("guild_id") or "").strip()
        or "discord"
    )
    return build_inbound_agent_turn_request(
        tenant_id=str(metadata.get("tenant_id") or "default").strip() or "default",
        workspace_id=workspace_id,
        session_id=session_id,
        channel="discord",
        actor_type="user",
        actor_id=str(parsed.get("user_id") or "").strip() or "discord-user",
        actor_display_name=str(parsed.get("username") or parsed.get("user_id") or "discord-user").strip(),
        message=str(goal or ""),
        context_hints={
            "trace_id": f"discord:{trace_id}",
            "source": "discord_connector",
            "discord": {
                "channel_id": str(parsed.get("channel_id") or "").strip() or None,
                "guild_id": str(parsed.get("guild_id") or "").strip() or None,
                "message_id": str(parsed.get("message_id") or "").strip() or None,
                "interaction_id": str(parsed.get("interaction_id") or "").strip() or None,
                "event_type": str(parsed.get("event_type") or "").strip() or None,
            },
            "metadata": metadata,
        },
        execution_mode="durable",
        response_mode="artifact",
        machine_target=str(metadata.get("machine_target") or "").strip() or None,
        policy_context={
            "execution_target": str(metadata.get("execution_target") or "").strip() or None,
            "trust_mode": str(metadata.get("trust_mode") or "").strip() or None,
        },
    )


def build_telegram_turn_request(
    *,
    workspace_id: str,
    connector_entry: Optional[Dict[str, Any]],
    goal: str,
    chat_id: str,
    sender_id: str,
    update_id: int,
    message_id: Optional[str] = None,
    trace_id: str = "",
    source_event_id: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> AgentTurnRequest:
    connector_metadata = connector_entry.get("metadata") if isinstance((connector_entry or {}).get("metadata"), dict) else {}
    merged_metadata = dict(connector_metadata)
    if isinstance(metadata, dict):
        merged_metadata.update(metadata)
    resolved_workspace_id = str(workspace_id or connector_entry.get("workspace_id") or merged_metadata.get("workspace_id") or "default").strip() or "default"
    return build_inbound_agent_turn_request(
        tenant_id=str(merged_metadata.get("tenant_id") or "default").strip() or "default",
        workspace_id=resolved_workspace_id,
        session_id=str(chat_id or "telegram").strip() or "telegram",
        channel="telegram",
        actor_type="user",
        actor_id=str(sender_id or chat_id or "telegram-user").strip() or "telegram-user",
        actor_display_name=str(sender_id or chat_id or "telegram-user").strip() or "telegram-user",
        message=str(goal or ""),
        context_hints={
            "trace_id": str(trace_id or "").strip() or None,
            "source": "telegram_connector",
            "telegram": {
                "chat_id": str(chat_id or "").strip() or None,
                "sender_id": str(sender_id or "").strip() or None,
                "update_id": int(update_id or 0),
                "message_id": str(message_id or "").strip() or None,
                "source_event_id": str(source_event_id or "").strip() or None,
            },
            "metadata": merged_metadata,
        },
        execution_mode="durable",
        response_mode="artifact",
        machine_target=str(merged_metadata.get("machine_target") or "").strip() or None,
        policy_context={
            "execution_target": str(merged_metadata.get("execution_target") or "").strip() or None,
            "trust_mode": str(merged_metadata.get("trust_mode") or "").strip() or None,
        },
    )


def build_whatsapp_turn_request(
    *,
    workspace_id: str,
    connector_entry: Optional[Dict[str, Any]],
    goal: str,
    from_number: str,
    to_number: str,
    message_sid: str,
    account_sid: str,
    session_id: str,
    trace_id: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> AgentTurnRequest:
    connector_metadata = connector_entry.get("metadata") if isinstance((connector_entry or {}).get("metadata"), dict) else {}
    merged_metadata = dict(connector_metadata)
    if isinstance(metadata, dict):
        merged_metadata.update(metadata)
    resolved_workspace_id = str(workspace_id or connector_entry.get("workspace_id") or merged_metadata.get("workspace_id") or "default").strip() or "default"
    return build_inbound_agent_turn_request(
        tenant_id=str(merged_metadata.get("tenant_id") or "default").strip() or "default",
        workspace_id=resolved_workspace_id,
        session_id=str(session_id or "whatsapp").strip() or "whatsapp",
        channel="whatsapp",
        actor_type="user",
        actor_id=str(from_number or "whatsapp-user").strip() or "whatsapp-user",
        actor_display_name=str(from_number or "whatsapp-user").strip() or "whatsapp-user",
        message=str(goal or ""),
        context_hints={
            "trace_id": str(trace_id or "").strip() or None,
            "source": "whatsapp_connector",
            "whatsapp": {
                "from": str(from_number or "").strip() or None,
                "to": str(to_number or "").strip() or None,
                "message_sid": str(message_sid or "").strip() or None,
                "account_sid": str(account_sid or "").strip() or None,
            },
            "metadata": merged_metadata,
        },
        execution_mode="durable",
        response_mode="artifact",
        machine_target=str(merged_metadata.get("machine_target") or "").strip() or None,
        policy_context={
            "execution_target": str(merged_metadata.get("execution_target") or "").strip() or None,
            "trust_mode": str(merged_metadata.get("trust_mode") or "").strip() or None,
        },
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


def _build_noop_direct_chat_execution_services():
    from server_modules.direct_chat_service import build_direct_chat_execution_services

    def _unreachable(*args: Any, **kwargs: Any):
        raise RuntimeError("Direct chat services are unavailable for this agent_turn dispatch.")

    return build_direct_chat_execution_services(
        chat_stream_key=_unreachable,
        session_manager_enabled=lambda: False,
        session_manager_factory=_unreachable,
        build_direct_operator_reply=_unreachable,
        build_chat_turn_event_stream=_unreachable,
    )


def execute_system_agent_turn(
    *,
    turn_request: AgentTurnRequest,
    run_execution_services: Any,
    direct_chat_services: Any = None,
    chat_body: Optional[Dict[str, Any]] = None,
    run_request: Optional[Any] = None,
    current_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    from server_modules.direct_tool_config_service import run_async_tool_call

    system_user = (
        dict(current_user)
        if isinstance(current_user, dict)
        else {"auth_type": "api_key", "user_id": "", "email": ""}
    )
    return run_async_tool_call(
        agent_turn(
            turn_request=turn_request,
            current_user=system_user,
            run_execution_services=run_execution_services,
            direct_chat_services=direct_chat_services,
            chat_body=chat_body,
            run_request=run_request,
        )
    )


async def agent_turn(
    *,
    turn_request: AgentTurnRequest,
    current_user: Any,
    run_execution_services: Any,
    direct_chat_services: Any = None,
    chat_body: Optional[Dict[str, Any]] = None,
    run_request: Optional[Any] = None,
) -> Dict[str, Any]:
    from server_modules.turn_runtime import (
        build_turn_execution_services,
        execute_agent_turn_request,
    )

    tracer = get_tracer("server_modules.agent_turn")
    resolved_turn_request = turn_request
    resolved_turn_request.policy_context = normalize_turn_policy_context(
        resolved_turn_request.policy_context,
        current_user=current_user,
        workspace_id=resolved_turn_request.workspace_id,
        session_id=resolved_turn_request.session_id,
    )
    preferred_session_id = str(turn_request.session_id or "").strip()
    session_record = None
    if preferred_session_id:
        session_record = await session_service.get_session(preferred_session_id)
        if isinstance(session_record, dict) and str(session_record.get("status") or "").strip().lower() != "expired":
            await session_service.extend_session(preferred_session_id)
        else:
            resolved_turn_request.session_id = await session_service.create_session(
                workspace_id=turn_request.workspace_id,
                tenant_id=turn_request.tenant_id,
                actor=serialize_turn_actor(turn_request.actor),
                channel=turn_request.channel,
                metadata={
                    "source": "agent_turn",
                    "machine_target": turn_request.machine_target,
                },
                session_id=preferred_session_id,
            )
            session_record = await session_service.get_session(resolved_turn_request.session_id)
    else:
        resolved_turn_request.session_id = await session_service.create_session(
            workspace_id=turn_request.workspace_id,
            tenant_id=turn_request.tenant_id,
            actor=serialize_turn_actor(turn_request.actor),
            channel=turn_request.channel,
            metadata={
                "source": "agent_turn",
                "machine_target": turn_request.machine_target,
            },
        )
        session_record = await session_service.get_session(resolved_turn_request.session_id)
    if isinstance(session_record, dict):
        context_hints = dict(resolved_turn_request.context_hints or {})
        if not isinstance(context_hints.get("session"), dict):
            context_hints["session"] = dict(session_record)
        resolved_turn_request.context_hints = context_hints
    with tracer.start_as_current_span("agent_turn.handle") as span:
        set_span_attributes(
            span,
            {
                "workspace_id": str(resolved_turn_request.workspace_id or "").strip() or "default",
                "session_id": str(resolved_turn_request.session_id or "").strip() or "agent-turn",
                "channel": normalize_channel(resolved_turn_request.channel),
                "tenant_id": str(resolved_turn_request.tenant_id or "").strip() or "default",
                "actor_type": str(resolved_turn_request.actor.type or "").strip() or "user",
                "run_id": (
                    str(getattr(run_request, "run_id", None) or "").strip()
                    or str((chat_body or {}).get("run_id") or "").strip()
                    or None
                ),
                "execution_mode": str(resolved_turn_request.execution_mode or "").strip() or "sync",
                "response_mode": str(resolved_turn_request.response_mode or "").strip() or "stream",
                "requested_session_mode": str(resolved_turn_request.policy_context.get("requested_session_mode") or "").strip() or None,
                "effective_session_mode": (
                    str(resolved_turn_request.policy_context.get("effective_session_mode") or "").strip()
                    or str(resolved_turn_request.policy_context.get("session_mode") or "").strip()
                    or None
                ),
            },
        )
        try:
            services = build_turn_execution_services(
                run_execution=run_execution_services,
                direct_chat=direct_chat_services or _build_noop_direct_chat_execution_services(),
            )
            result = await execute_agent_turn_request(
                turn_request=resolved_turn_request,
                current_user=current_user,
                services=services,
                chat_body=chat_body,
                run_request=run_request,
            )
            if isinstance(result, dict):
                set_span_attributes(
                    span,
                    {
                        "run_id": str(result.get("run_id") or "").strip() or None,
                        "turn_status": str(result.get("status") or "").strip() or None,
                    },
                )
            return result
        except Exception as exc:
            try:
                span.record_exception(exc)
            except Exception:
                pass
            raise


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
    policy_context = dict(resolved.policy_context or {})
    return {
        **identity,
        "session_mode": str(policy_context.get("session_mode") or "").strip() or None,
        "effective_session_mode": str(policy_context.get("effective_session_mode") or "").strip() or None,
        "interactive_approvals": (
            policy_context.get("interactive_approvals")
            if isinstance(policy_context.get("interactive_approvals"), bool)
            else None
        ),
        "agent_turn_request": serialize_agent_turn_request(resolved),
    }
