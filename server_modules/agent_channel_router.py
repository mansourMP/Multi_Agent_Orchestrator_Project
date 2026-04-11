from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, Optional

from server_modules import (
    agent_registry_repository,
    agent_specialist_repository,
    channel_concurrency_service,
    control_plane_repository,
    safe_mode_service,
)
from server_modules.agent_turn import build_inbound_agent_turn_request


SUPPORTED_CHANNEL_KEYS = frozenset({"telegram", "whatsapp", "email", "phone", "web_chat"})
SUPPORTED_FULL_SHELL_KEYS = frozenset({"mobile", "web", "desktop"})
WEB_CHAT_DEFAULT_ENDPOINT_KEY = "workspace-default"
FULL_SHELL_CLASS = "full_shell"
CHANNEL_SHELL_CLASS = "channel_shell"


class ChannelIngressValidationError(Exception):
    pass


class ChannelOwnerNotFoundError(Exception):
    pass


class ChannelSecurityDeniedError(Exception):
    pass


def full_shell_contract(shell_key: str) -> Dict[str, Any]:
    normalized = str(shell_key or "").strip().lower()
    if normalized not in SUPPORTED_FULL_SHELL_KEYS:
        raise ChannelIngressValidationError("Unsupported shell.")
    return {
        "shell_key": normalized,
        "surface_class": FULL_SHELL_CLASS,
        "control_depth": "full",
        "allowed_capabilities": [
            "conversation",
            "summaries",
            "notifications",
            "approval_center",
            "application_navigation",
            "settings_profile",
        ],
        "forbidden_capabilities": [
            "separate_product_brain",
            "separate_policy_engine",
        ],
        "shares_captain_identity": True,
        "uses_shared_run_engine": True,
    }


def channel_shell_contract(channel_key: str) -> Dict[str, Any]:
    normalized = _normalize_channel_key(channel_key)
    if normalized not in SUPPORTED_CHANNEL_KEYS:
        raise ChannelIngressValidationError("Unsupported channel.")
    lightweight_approvals = normalized in {"telegram", "whatsapp", "web_chat"}
    return {
        "channel_key": normalized,
        "surface_class": CHANNEL_SHELL_CLASS,
        "control_depth": "lightweight",
        "allowed_capabilities": [
            "conversation",
            "notifications",
            "summary_visibility",
            *(["lightweight_approvals"] if lightweight_approvals else []),
        ],
        "forbidden_capabilities": [
            "connector_management",
            "provider_management",
            "deep_application_configuration",
            "deep_admin_surface",
            "separate_product_brain",
            "separate_policy_engine",
        ],
        "shares_captain_identity": True,
        "uses_shared_run_engine": True,
        "deep_connector_control_surface": False,
    }


def shell_surface_contract(surface_key: str) -> Dict[str, Any]:
    normalized = str(surface_key or "").strip().lower()
    if normalized in SUPPORTED_FULL_SHELL_KEYS:
        return full_shell_contract(normalized)
    return channel_shell_contract(_normalize_channel_key(normalized))


def _duplicate_ignored_reply() -> str:
    return "This inbound event was already processed, so it was ignored."


def _incident_result_payload(incident: Dict[str, Any]) -> Dict[str, Any]:
    mode = str(incident.get("mode") or "active").strip().lower()
    matched_scope = str(incident.get("scope") or "workspace").strip().lower() or "workspace"
    metadata = _coerce_dict(incident.get("matched_chain", [])[-1].get("metadata") if incident.get("matched_chain") else incident.get("metadata"))
    retry_after_seconds = metadata.get("retry_after_seconds")
    if mode == "pause":
        return {
            "status": "paused",
            "reply": "This workspace is temporarily paused while the owner resolves an incident. Please try again shortly.",
            "incident_scope": matched_scope,
            "incident_mode": mode,
            "retry_after_seconds": retry_after_seconds,
        }
    if mode == "drain":
        return {
            "status": "draining",
            "reply": "This channel is temporarily draining its backlog and is not accepting new messages right now.",
            "incident_scope": matched_scope,
            "incident_mode": mode,
            "retry_after_seconds": retry_after_seconds,
        }
    if mode == "reject":
        return {
            "status": "rejected",
            "reply": "This channel is temporarily rejecting new work while the owner handles an incident.",
            "incident_scope": matched_scope,
            "incident_mode": mode,
            "retry_after_seconds": retry_after_seconds,
        }
    return {
        "status": "ok",
        "reply": "",
        "incident_scope": matched_scope,
        "incident_mode": mode,
        "retry_after_seconds": retry_after_seconds,
    }


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _normalize_channel_key(value: Any) -> str:
    token = str(value or "").strip().lower()
    aliases = {
        "web": "web_chat",
        "webchat": "web_chat",
        "chat": "web_chat",
    }
    return aliases.get(token, token)


def _normalize_endpoint_key(channel_key: str, endpoint_key: Any) -> Optional[str]:
    token = str(endpoint_key or "").strip().lower()
    if not token and channel_key == "web_chat":
        return WEB_CHAT_DEFAULT_ENDPOINT_KEY
    return token or None


def _safe_slug(value: Any, *, fallback: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")
    return token or fallback


def _build_session_key(
    *,
    channel_key: str,
    endpoint_key: str,
    session_key: Optional[str],
    actor_id: Optional[str],
    message_id: Optional[str],
) -> str:
    explicit = str(session_key or "").strip()
    if explicit:
        return explicit
    actor_token = _safe_slug(actor_id or message_id or "customer", fallback="customer")
    endpoint_token = _safe_slug(endpoint_key, fallback="endpoint")
    return f"{channel_key}:{endpoint_token}:{actor_token}"


def _build_thread_id(
    *,
    workspace_id: str,
    channel_key: str,
    endpoint_key: str,
    session_key: str,
) -> str:
    workspace_token = _safe_slug(workspace_id, fallback="workspace")
    channel_token = _safe_slug(channel_key, fallback="channel")
    endpoint_token = _safe_slug(endpoint_key, fallback="endpoint")
    session_token = _safe_slug(session_key, fallback="session")
    return f"thread-{workspace_token}-{channel_token}-{endpoint_token}-{session_token}"[:180]


def _runtime_profile_id(install: Dict[str, Any]) -> Optional[str]:
    runtime_profile = _coerce_dict(install.get("runtime_profile"))
    token = str(runtime_profile.get("id") or install.get("runtime_profile_id") or "").strip()
    return token or None


def _agent_role_token(*, install: Dict[str, Any], manifest: Any) -> Optional[str]:
    install_metadata = _coerce_dict(install.get("metadata"))
    install_agent = _coerce_dict(install.get("agent_definition"))
    candidates = (
        install_metadata.get("agent_role"),
        install_agent.get("slug"),
        getattr(getattr(manifest, "identity", None), "role", None),
        install.get("label"),
    )
    for candidate in candidates:
        token = _safe_slug(candidate, fallback="").replace("-", "_").strip("_")
        if token:
            return token
    return None


def _channel_turn_owner_user(*, install: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "auth_type": "api_key",
        "role": "owner",
        "is_admin": True,
        "user_id": str(install.get("owner_user_id") or "").strip(),
        "email": str(install.get("owner_email") or "").strip().lower(),
    }


def _build_channel_turn_request(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: str,
    actor_id: str,
    actor_display_name: str,
    message: str,
    thread_id: str,
    session_id: str,
    install: Dict[str, Any],
    manifest: Any,
    shared_metadata: Dict[str, Any],
    master_install_id: Optional[str],
    runtime_mode: str,
    runtime_profile_id: Optional[str],
    request_id: Optional[str],
    privileged_runtime_approved: bool,
    seed_demo_if_empty: bool,
) -> Any:
    runtime_profile = _coerce_dict(install.get("runtime_profile"))
    metadata = {
        **shared_metadata,
        "workspace_agent_install_id": str(install.get("id") or "").strip() or None,
        "active_agent_install_id": str(install.get("id") or "").strip() or None,
        "master_agent_install_id": str(master_install_id or install.get("id") or "").strip() or None,
        "runtime_mode": str(runtime_mode or "").strip().lower() or None,
        "runtime_profile_id": runtime_profile_id,
        "runtime_profile_label": str(runtime_profile.get("label") or "").strip() or None,
        "runtime_id": str(runtime_profile.get("runtime_id") or "").strip() or None,
        "machine_id": str(runtime_profile.get("machine_id") or "").strip() or None,
        "agent_role": _agent_role_token(install=install, manifest=manifest),
        "agent_role_source": "channel_owner_binding",
        "seed_demo_if_empty": bool(seed_demo_if_empty),
    }
    return build_inbound_agent_turn_request(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        session_id=session_id,
        thread_id=thread_id,
        channel=channel_key,
        actor_type="user",
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        message=message,
        context_hints={
            "source": "external_channel_ingress",
            "request_id": request_id,
            "metadata": {key: value for key, value in metadata.items() if value not in (None, "", [], {})},
        },
        execution_mode="durable",
        response_mode="channel_reply",
        machine_target=str(shared_metadata.get("machine_target") or "").strip() or None,
        policy_context={
            "execution_target": str(shared_metadata.get("execution_target") or "").strip() or None,
            "trust_mode": str(shared_metadata.get("trust_mode") or "").strip() or None,
            "privileged_runtime_approved": bool(privileged_runtime_approved),
        },
    )


async def execute_canonical_channel_turn(
    *,
    turn_request: Any,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    from server_modules.agent_turn import execute_system_agent_turn
    import server as _server

    run_execution_services = _server._run_execution_services()
    return await asyncio.to_thread(
        execute_system_agent_turn,
        turn_request=turn_request,
        current_user=current_user,
        run_execution_services=run_execution_services,
    )


def _canonical_run_reply(*, status: str, run_id: Optional[str]) -> str:
    normalized = str(status or "").strip().lower()
    base = {
        "accepted": "Run accepted.",
        "queued": "Run queued.",
        "queued_local": "Run queued for local companion.",
        "running": "Run started.",
        "running_local": "Run started on local companion.",
        "waiting_for_input": "Run is waiting for required input.",
    }.get(normalized, "")
    if not base and normalized:
        base = f"Run {normalized}."
    if not base:
        base = "Run accepted."
    if str(run_id or "").strip():
        return f"{base} run_id: {run_id}"
    return base


def _normalize_canonical_channel_result(
    *,
    execution_result: Dict[str, Any],
) -> Dict[str, Any]:
    if str(execution_result.get("kind") or "").strip() == "durable_run":
        durable = _coerce_dict(execution_result.get("result"))
        run_id = str(durable.get("run_id") or "").strip() or None
        status = str(durable.get("status") or "accepted").strip().lower() or "accepted"
        reply = _canonical_run_reply(status=status, run_id=run_id)
        return {
            "status": status,
            "reply": reply,
            "run_id": run_id,
            "artifact": None,
            "steps": [],
            "critic": None,
            "limit_reason": None,
            "retry_after_seconds": None,
            "quota_snapshot": None,
            "metadata": {
                "kind": "durable_run",
                "engine": durable.get("engine"),
                "route": durable.get("route"),
                "doctor_preflight": durable.get("doctor_preflight"),
                "created_run": durable.get("created_run"),
            },
            "event_type": "run_started",
        }
    reply = str(execution_result.get("reply") or "").strip()
    return {
        "status": str(execution_result.get("status") or "completed").strip().lower() or "completed",
        "reply": reply,
        "run_id": str(execution_result.get("run_id") or "").strip() or None,
        "artifact": execution_result.get("artifact"),
        "steps": list(execution_result.get("steps") or []),
        "critic": execution_result.get("critic"),
        "limit_reason": execution_result.get("limit_reason"),
        "retry_after_seconds": execution_result.get("retry_after_seconds"),
        "quota_snapshot": execution_result.get("quota_snapshot"),
        "metadata": _coerce_dict(execution_result.get("metadata")),
        "event_type": "response",
    }


def prepare_canonical_channel_turn(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: str,
    endpoint_key: Any,
    customer_message: str,
    install: Dict[str, Any],
    manifest: Any = None,
    owner_type: str = "specialist",
    session_key: Optional[str] = None,
    message_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_display_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    master_install_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    request_id: Optional[str] = None,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
) -> Dict[str, Any]:
    resolved_channel_key = _normalize_channel_key(channel_key)
    if resolved_channel_key not in SUPPORTED_CHANNEL_KEYS:
        raise ChannelIngressValidationError("Unsupported channel.")

    resolved_endpoint_key = _normalize_endpoint_key(resolved_channel_key, endpoint_key)
    if not resolved_endpoint_key:
        raise ChannelIngressValidationError("endpoint_key is required.")

    resolved_message = str(customer_message or "").strip()
    if not resolved_message:
        raise ChannelIngressValidationError("customer_message is required.")

    workspace_policy = safe_mode_service.resolve_machine_policy_status(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    if bool((workspace_policy.get("kill_switch") or {}).get("active")):
        raise ChannelSecurityDeniedError("This workspace is temporarily disabled by a security kill switch.")
    if safe_mode_service.is_channel_disabled(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
    ):
        raise ChannelSecurityDeniedError("This channel is temporarily disabled by a security control.")

    install_payload = _coerce_dict(install)
    resolved_actor_id = str(actor_id or "").strip() or f"{resolved_channel_key}-customer"
    resolved_actor_display_name = str(actor_display_name or "").strip() or resolved_actor_id
    resolved_session_key = _build_session_key(
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        session_key=session_key,
        actor_id=resolved_actor_id,
        message_id=message_id,
    )
    resolved_thread_id = _build_thread_id(
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        session_key=resolved_session_key,
    )
    responder_install_id = str(install_payload.get("id") or "").strip() or None
    if responder_install_id and safe_mode_service.is_agent_disabled(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        agent_install_id=responder_install_id,
    ):
        raise ChannelSecurityDeniedError("This agent is temporarily disabled by a security control.")

    resolved_runtime_mode = (
        str(runtime_mode or install_payload.get("runtime_mode") or getattr(getattr(manifest, "runtime", None), "mode", "hosted_secure") or "hosted_secure")
        .strip()
        .lower()
        or "hosted_secure"
    )
    resolved_runtime_profile_id = str(runtime_profile_id or _runtime_profile_id(install_payload) or "").strip() or None
    resolved_owner_type = str(owner_type or "specialist").strip() or "specialist"
    responder_label = str(install_payload.get("label") or "").strip() or getattr(getattr(manifest, "identity", None), "name", "Agent")
    shared_metadata = {
        "source": "external_channel_ingress",
        "channel_key": resolved_channel_key,
        "endpoint_key": resolved_endpoint_key,
        "owner_type": resolved_owner_type,
        "responder_install_id": responder_install_id,
        "message_id": str(message_id or "").strip() or None,
        **_coerce_dict(metadata),
    }
    turn_request = _build_channel_turn_request(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        actor_id=resolved_actor_id,
        actor_display_name=resolved_actor_display_name,
        message=resolved_message,
        thread_id=resolved_thread_id,
        session_id=resolved_session_key,
        install=install_payload,
        manifest=manifest,
        shared_metadata=shared_metadata,
        master_install_id=master_install_id,
        runtime_mode=resolved_runtime_mode,
        runtime_profile_id=resolved_runtime_profile_id,
        request_id=request_id,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    return {
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "channel_key": resolved_channel_key,
        "endpoint_key": resolved_endpoint_key,
        "session_key": resolved_session_key,
        "thread_id": resolved_thread_id,
        "message": resolved_message,
        "actor_id": resolved_actor_id,
        "actor_display_name": resolved_actor_display_name,
        "install": install_payload,
        "manifest": manifest,
        "owner_type": resolved_owner_type,
        "responder_install_id": responder_install_id,
        "responder_label": responder_label,
        "runtime_mode": resolved_runtime_mode,
        "runtime_profile_id": resolved_runtime_profile_id,
        "shared_metadata": shared_metadata,
        "turn_request": turn_request,
        "execution_owner": _channel_turn_owner_user(install=install_payload),
    }


async def execute_prepared_channel_turn(
    *,
    prepared: Dict[str, Any],
) -> Dict[str, Any]:
    quota_snapshot = None
    try:
        async with channel_concurrency_service.channel_execution_slot(
            tenant_id=str(prepared.get("tenant_id") or "").strip(),
            workspace_id=str(prepared.get("workspace_id") or "").strip(),
            responder_install_id=str(prepared.get("responder_install_id") or "").strip() or None,
            thread_id=str(prepared.get("thread_id") or "").strip() or None,
            session_key=str(prepared.get("session_key") or "").strip() or None,
            channel_key=str(prepared.get("channel_key") or "").strip() or None,
            endpoint_key=str(prepared.get("endpoint_key") or "").strip() or None,
            install=_coerce_dict(prepared.get("install")),
            metadata=_coerce_dict(prepared.get("shared_metadata")),
        ) as execution_slot:
            quota_snapshot = execution_slot.get("quota_snapshot")
            timeout_seconds = max(
                int(getattr(quota_snapshot, "max_runtime_seconds", 0) or 0),
                1,
            )
            try:
                execution_result = await asyncio.wait_for(
                    execute_canonical_channel_turn(
                        turn_request=prepared["turn_request"],
                        current_user=_coerce_dict(prepared.get("execution_owner")),
                    ),
                    timeout=timeout_seconds,
                )
                return _normalize_canonical_channel_result(execution_result=execution_result)
            except asyncio.TimeoutError:
                return channel_concurrency_service.build_runtime_capped_result(
                    quota_snapshot=quota_snapshot,
                )
    except channel_concurrency_service.ChannelExecutionLimitError as error:
        return channel_concurrency_service.build_limit_result(error=error)


async def route_transport_channel_message(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: str,
    endpoint_key: Any,
    customer_message: str,
    install: Dict[str, Any],
    manifest: Any = None,
    owner_type: str = "specialist",
    session_key: Optional[str] = None,
    message_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_display_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    master_install_id: Optional[str] = None,
    runtime_mode: Optional[str] = None,
    runtime_profile_id: Optional[str] = None,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
) -> Dict[str, Any]:
    prepared = prepare_canonical_channel_turn(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=channel_key,
        endpoint_key=endpoint_key,
        customer_message=customer_message,
        install=install,
        manifest=manifest,
        owner_type=owner_type,
        session_key=session_key,
        message_id=message_id,
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        metadata=metadata,
        master_install_id=master_install_id,
        runtime_mode=runtime_mode,
        runtime_profile_id=runtime_profile_id,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    incident_state = safe_mode_service.resolve_channel_incident_state(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=str(prepared.get("channel_key") or "").strip(),
        endpoint_key=str(prepared.get("endpoint_key") or "").strip(),
    )
    if bool(incident_state.get("active")):
        incident_result = _incident_result_payload(incident_state)
        return {
            "workspace_id": workspace_id,
            "tenant_id": tenant_id,
            "channel_key": prepared["channel_key"],
            "endpoint_key": prepared["endpoint_key"],
            "session_key": prepared["session_key"],
            "thread_id": prepared["thread_id"],
            "owner": {
                "install_id": prepared["responder_install_id"],
                "label": prepared["responder_label"],
                "type": prepared["owner_type"],
                "runtime_mode": prepared["runtime_mode"],
            },
            "status": incident_result.get("status"),
            "reply": incident_result.get("reply"),
            "artifact": None,
            "steps": [],
            "critic": None,
            "limit_reason": f"incident_{incident_result.get('incident_mode')}",
            "retry_after_seconds": incident_result.get("retry_after_seconds"),
            "quota_snapshot": None,
            "incident_scope": incident_result.get("incident_scope"),
            "incident_mode": incident_result.get("incident_mode"),
            "metadata": {},
            "audit": {"inbound_event_id": None, "outbound_event_id": None},
        }
    result = await execute_prepared_channel_turn(prepared=prepared)
    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "channel_key": prepared["channel_key"],
        "endpoint_key": prepared["endpoint_key"],
        "session_key": prepared["session_key"],
        "thread_id": prepared["thread_id"],
        "owner": {
            "install_id": prepared["responder_install_id"],
            "label": prepared["responder_label"],
            "type": prepared["owner_type"],
            "runtime_mode": prepared["runtime_mode"],
        },
        "status": result.get("status"),
        "reply": str(result.get("reply") or "").strip(),
        "run_id": result.get("run_id"),
        "artifact": result.get("artifact"),
        "steps": result.get("steps"),
        "critic": result.get("critic"),
        "limit_reason": result.get("limit_reason"),
        "retry_after_seconds": result.get("retry_after_seconds"),
        "quota_snapshot": result.get("quota_snapshot"),
        "metadata": result.get("metadata"),
        "audit": {"inbound_event_id": None, "outbound_event_id": None},
    }


def route_transport_channel_message_sync(**kwargs: Any) -> Dict[str, Any]:
    from server_modules.direct_tool_config_service import run_async_tool_call

    return run_async_tool_call(route_transport_channel_message(**kwargs))


async def route_inbound_channel_message(
    *,
    tenant_id: str,
    workspace_id: str,
    channel_key: str,
    endpoint_key: Any,
    customer_message: str,
    session_key: Optional[str] = None,
    message_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_display_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    allow_master_fallback: bool = True,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
) -> Dict[str, Any]:
    resolved_channel_key = _normalize_channel_key(channel_key)
    if resolved_channel_key not in SUPPORTED_CHANNEL_KEYS:
        raise ChannelIngressValidationError("Unsupported channel.")
    resolved_endpoint_key = _normalize_endpoint_key(resolved_channel_key, endpoint_key)
    if not resolved_endpoint_key:
        raise ChannelIngressValidationError("endpoint_key is required.")
    if not str(customer_message or "").strip():
        raise ChannelIngressValidationError("customer_message is required.")
    workspace_policy = safe_mode_service.resolve_machine_policy_status(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    if bool((workspace_policy.get("kill_switch") or {}).get("active")):
        raise ChannelSecurityDeniedError("This workspace is temporarily disabled by a security kill switch.")
    if safe_mode_service.is_channel_disabled(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
    ):
        raise ChannelSecurityDeniedError("This channel is temporarily disabled by a security control.")

    owner_route = await agent_specialist_repository.resolve_active_inbound_channel_owner(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        allow_master_fallback=allow_master_fallback,
    )
    if not isinstance(owner_route, dict):
        raise ChannelOwnerNotFoundError("No active channel owner is configured for this endpoint.")

    install = _coerce_dict(owner_route.get("install"))
    manifest = owner_route.get("manifest")
    owner_type = str(owner_route.get("owner_type") or "specialist").strip() or "specialist"
    if not install or manifest is None:
        raise ChannelOwnerNotFoundError("The configured channel owner could not be resolved.")
    responder_install_id = str(install.get("id") or "").strip() or None
    if responder_install_id and safe_mode_service.is_agent_disabled(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        agent_install_id=responder_install_id,
    ):
        raise ChannelSecurityDeniedError("This agent is temporarily disabled by a security control.")

    master_install = install if owner_type == "master" else await agent_registry_repository.get_workspace_master_agent_install(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    master_install_id = str(_coerce_dict(master_install).get("id") or install.get("id") or "").strip() or None
    responder_label = str(install.get("label") or "").strip() or getattr(manifest.identity, "name", "Agent")
    runtime_mode = str(install.get("runtime_mode") or getattr(manifest.runtime, "mode", "hosted_secure") or "hosted_secure").strip().lower()
    runtime_profile_id = _runtime_profile_id(install)
    prepared = prepare_canonical_channel_turn(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        customer_message=customer_message,
        install=install,
        manifest=manifest,
        owner_type=owner_type,
        session_key=session_key,
        message_id=message_id,
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        metadata=metadata,
        master_install_id=master_install_id,
        runtime_mode=runtime_mode,
        runtime_profile_id=runtime_profile_id,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    actor_payload = {
        "type": "user",
        "id": prepared["actor_id"],
        "display_name": prepared["actor_display_name"],
    }
    shared_metadata = prepared["shared_metadata"]
    inbound_event = await control_plane_repository.append_agent_channel_event(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        session_key=prepared["session_key"],
        thread_id=None,
        responder_install_id=responder_install_id,
        direction="inbound",
        event_type="message",
        message_id=str(message_id or "").strip() or None,
        actor=actor_payload,
        text=prepared["message"],
        payload={"message": prepared["message"]},
        metadata=shared_metadata,
        status="received",
    )
    if bool(_coerce_dict(inbound_event).get("_duplicate_hit")):
        return {
            "workspace_id": workspace_id,
            "tenant_id": tenant_id,
            "channel_key": resolved_channel_key,
            "endpoint_key": resolved_endpoint_key,
            "session_key": prepared["session_key"],
            "thread_id": prepared["thread_id"],
            "owner": {
                "install_id": responder_install_id,
                "label": responder_label,
                "type": owner_type,
                "runtime_mode": runtime_mode,
            },
            "status": "duplicate_ignored",
            "reply": _duplicate_ignored_reply(),
            "artifact": None,
            "steps": [],
            "critic": None,
            "limit_reason": "duplicate_inbound_event",
            "retry_after_seconds": None,
            "quota_snapshot": None,
            "audit": {
                "inbound_event_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
                "outbound_event_id": None,
            },
        }
    incident_state = safe_mode_service.resolve_channel_incident_state(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
    )
    if bool(incident_state.get("active")):
        incident_result = _incident_result_payload(incident_state)
        assistant_actor = {
            "type": "assistant",
            "id": responder_install_id or getattr(manifest, "manifest_id", "agent"),
            "display_name": responder_label,
        }
        outbound_event = await control_plane_repository.append_agent_channel_event(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            channel_key=resolved_channel_key,
            endpoint_key=resolved_endpoint_key,
            session_key=resolved_session_key,
            thread_id=None,
            responder_install_id=responder_install_id,
            direction="outbound",
            event_type="response",
            parent_event_id=str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
            actor=assistant_actor,
            text=str(incident_result.get("reply") or ""),
            payload={
                "status": incident_result.get("status"),
                "incident_scope": incident_result.get("incident_scope"),
                "incident_mode": incident_result.get("incident_mode"),
                "retry_after_seconds": incident_result.get("retry_after_seconds"),
            },
            metadata=shared_metadata,
            status=str(incident_result.get("status") or "paused"),
        )
        try:
            from server_modules import activity_ledger_service

            await activity_ledger_service.append_activity_event(
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                actor_type="sage" if owner_type == "master" else "specialist",
                actor_id=responder_install_id or getattr(manifest, "manifest_id", "agent"),
                install_id=responder_install_id,
                thread_id=prepared["thread_id"],
                session_key=prepared["session_key"],
                channel=resolved_channel_key,
                direction="outbound",
                event_class="blocked_action",
                detail_level="timeline_detail",
                action=str(incident_result.get("incident_mode") or "blocked").strip().lower() or "blocked",
                title=f"{responder_label} action blocked",
                summary=str(incident_result.get("reply") or incident_result.get("status") or "Action blocked.").strip(),
                status=str(incident_result.get("status") or "paused").strip().lower() or "paused",
                payload={
                    "incident_scope": incident_result.get("incident_scope"),
                    "retry_after_seconds": incident_result.get("retry_after_seconds"),
                },
                metadata={
                    **shared_metadata,
                    "channel_event_id": str(_coerce_dict(outbound_event).get("id") or "").strip() or None,
                    "owner_type": owner_type,
                },
            )
        except Exception:
            pass
        return {
            "workspace_id": workspace_id,
            "tenant_id": tenant_id,
            "channel_key": resolved_channel_key,
            "endpoint_key": resolved_endpoint_key,
            "session_key": prepared["session_key"],
            "thread_id": prepared["thread_id"],
            "owner": {
                "install_id": responder_install_id,
                "label": responder_label,
                "type": owner_type,
                "runtime_mode": runtime_mode,
            },
            "status": incident_result.get("status"),
            "reply": incident_result.get("reply"),
            "artifact": None,
            "steps": [],
            "critic": None,
            "limit_reason": f"incident_{incident_result.get('incident_mode')}",
            "retry_after_seconds": incident_result.get("retry_after_seconds"),
            "quota_snapshot": None,
            "incident_scope": incident_result.get("incident_scope"),
            "incident_mode": incident_result.get("incident_mode"),
            "audit": {
                "inbound_event_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
                "outbound_event_id": str(_coerce_dict(outbound_event).get("id") or "").strip() or None,
            },
        }
    prepared["shared_metadata"] = {
        **_coerce_dict(prepared.get("shared_metadata")),
        "request_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
    }
    prepared["turn_request"] = _build_channel_turn_request(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        actor_id=prepared["actor_id"],
        actor_display_name=prepared["actor_display_name"],
        message=prepared["message"],
        thread_id=prepared["thread_id"],
        session_id=prepared["session_key"],
        install=install,
        manifest=manifest,
        shared_metadata=prepared["shared_metadata"],
        master_install_id=master_install_id,
        runtime_mode=runtime_mode,
        runtime_profile_id=runtime_profile_id,
        request_id=str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    result = await execute_prepared_channel_turn(prepared=prepared)

    reply = str(result.get("reply") or "").strip()
    assistant_actor = {
        "type": "assistant",
        "id": responder_install_id or getattr(manifest, "manifest_id", "agent"),
        "display_name": responder_label,
    }
    outbound_event = await control_plane_repository.append_agent_channel_event(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        session_key=prepared["session_key"],
        thread_id=prepared["thread_id"],
        responder_install_id=responder_install_id,
        direction="outbound",
        event_type=str(result.get("event_type") or "response").strip() or "response",
        message_id=None,
        parent_event_id=str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
        actor=assistant_actor,
        text=reply,
        payload={
            "artifact": result.get("artifact"),
            "steps": result.get("steps"),
            "critic": result.get("critic"),
            "status": result.get("status"),
            "limit_reason": result.get("limit_reason"),
            "retry_after_seconds": result.get("retry_after_seconds"),
            "quota_snapshot": result.get("quota_snapshot"),
            "run_id": result.get("run_id"),
            "metadata": result.get("metadata"),
        },
        metadata=shared_metadata,
        status=str(result.get("status") or "completed").strip().lower() or "completed",
    )
    try:
        from server_modules import activity_ledger_service

        artifact_value = result.get("artifact")
        artifacts = artifact_value if isinstance(artifact_value, list) else [artifact_value] if isinstance(artifact_value, dict) else []
        actor_type = "sage" if owner_type == "master" else "specialist"
        actor_id = responder_install_id or getattr(manifest, "manifest_id", "agent")
        await activity_ledger_service.append_activity_event(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            actor_type=actor_type,
            actor_id=actor_id,
            install_id=responder_install_id,
            run_id=str(result.get("run_id") or "").strip() or None,
            thread_id=prepared["thread_id"],
            session_key=prepared["session_key"],
            channel=resolved_channel_key,
            direction="outbound",
            event_class="sage_activity" if owner_type == "master" else "specialist_activity",
            detail_level="timeline_detail",
            action=str(result.get("status") or "completed").strip().lower() or "completed",
            title=f"{responder_label} responded",
            summary=reply,
            status=str(result.get("status") or "completed").strip().lower() or "completed",
            review_required=bool(artifacts),
            artifacts=artifacts,
            payload={
                "limit_reason": result.get("limit_reason"),
                "retry_after_seconds": result.get("retry_after_seconds"),
                "quota_snapshot": result.get("quota_snapshot"),
            },
            metadata={
                **shared_metadata,
                "channel_event_id": str(_coerce_dict(outbound_event).get("id") or "").strip() or None,
                "owner_type": owner_type,
            },
        )
        if artifacts:
            await activity_ledger_service.append_activity_event(
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                actor_type=actor_type,
                actor_id=actor_id,
                install_id=responder_install_id,
                run_id=str(result.get("run_id") or "").strip() or None,
                thread_id=prepared["thread_id"],
                session_key=prepared["session_key"],
                channel=resolved_channel_key,
                direction="outbound",
                event_class="artifact_created",
                detail_level="timeline_detail",
                action="artifact_created",
                title=f"{responder_label} created artifacts",
                summary=f"Created {len(artifacts)} artifact(s).",
                status="completed",
                review_required=True,
                artifacts=artifacts,
                payload={"artifact_count": len(artifacts)},
                metadata={
                    **shared_metadata,
                    "channel_event_id": str(_coerce_dict(outbound_event).get("id") or "").strip() or None,
                    "owner_type": owner_type,
                },
            )
    except Exception:
        pass

    return {
        "workspace_id": workspace_id,
        "tenant_id": tenant_id,
        "channel_key": resolved_channel_key,
        "endpoint_key": resolved_endpoint_key,
        "session_key": prepared["session_key"],
        "thread_id": prepared["thread_id"],
        "owner": {
            "install_id": responder_install_id,
            "label": responder_label,
            "type": owner_type,
            "runtime_mode": runtime_mode,
        },
        "status": result.get("status"),
        "reply": reply,
        "run_id": result.get("run_id"),
        "artifact": result.get("artifact"),
        "steps": result.get("steps"),
        "critic": result.get("critic"),
        "limit_reason": result.get("limit_reason"),
        "retry_after_seconds": result.get("retry_after_seconds"),
        "quota_snapshot": result.get("quota_snapshot"),
        "metadata": result.get("metadata"),
        "audit": {
            "inbound_event_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
            "outbound_event_id": str(_coerce_dict(outbound_event).get("id") or "").strip() or None,
        },
    }
