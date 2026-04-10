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
    thread_service,
    universal_operator,
)


SUPPORTED_CHANNEL_KEYS = frozenset({"telegram", "whatsapp", "email", "phone", "web_chat"})
WEB_CHAT_DEFAULT_ENDPOINT_KEY = "workspace-default"


class ChannelIngressValidationError(Exception):
    pass


class ChannelOwnerNotFoundError(Exception):
    pass


class ChannelSecurityDeniedError(Exception):
    pass


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
    runtime_profile = _coerce_dict(install.get("runtime_profile"))
    runtime_profile_id = _runtime_profile_id(install)
    actor_payload = {
        "type": "user",
        "id": resolved_actor_id,
        "display_name": resolved_actor_display_name,
    }
    shared_metadata = {
        "source": "external_channel_ingress",
        "channel_key": resolved_channel_key,
        "endpoint_key": resolved_endpoint_key,
        "owner_type": owner_type,
        "responder_install_id": responder_install_id,
        "message_id": str(message_id or "").strip() or None,
        **_coerce_dict(metadata),
    }
    inbound_event = await control_plane_repository.append_agent_channel_event(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        session_key=resolved_session_key,
        thread_id=None,
        responder_install_id=responder_install_id,
        direction="inbound",
        event_type="message",
        message_id=str(message_id or "").strip() or None,
        actor=actor_payload,
        text=resolved_message,
        payload={"message": resolved_message},
        metadata=shared_metadata,
        status="received",
    )
    if bool(_coerce_dict(inbound_event).get("_duplicate_hit")):
        return {
            "workspace_id": workspace_id,
            "tenant_id": tenant_id,
            "channel_key": resolved_channel_key,
            "endpoint_key": resolved_endpoint_key,
            "session_key": resolved_session_key,
            "thread_id": resolved_thread_id,
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
                thread_id=resolved_thread_id,
                session_key=resolved_session_key,
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
            "session_key": resolved_session_key,
            "thread_id": resolved_thread_id,
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

    await thread_service.ensure_master_thread(
        thread_id=resolved_thread_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        owner_user_id=str(install.get("owner_user_id") or "").strip() or None,
        master_agent_install_id=master_install_id,
        channel=resolved_channel_key,
        title=responder_label,
        metadata=shared_metadata,
    )
    await control_plane_repository.upsert_agent_session(
        session_id=resolved_session_key,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        thread_id=resolved_thread_id,
        channel=resolved_channel_key,
        actor=actor_payload,
        master_agent_install_id=master_install_id,
        runtime_profile_id=runtime_profile_id,
        metadata=shared_metadata,
    )
    await thread_service.record_user_turn(
        thread_id=resolved_thread_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        session_id=resolved_session_key,
        actor=actor_payload,
        content=resolved_message,
        runtime_profile_id=runtime_profile_id,
        metadata={
            **shared_metadata,
            "request_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
            "event_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
        },
    )

    try:
        async with channel_concurrency_service.channel_execution_slot(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            responder_install_id=responder_install_id,
            thread_id=resolved_thread_id,
            session_key=resolved_session_key,
            channel_key=resolved_channel_key,
            endpoint_key=resolved_endpoint_key,
            install=install,
            metadata=shared_metadata,
        ) as execution_slot:
            quota_snapshot = execution_slot.get("quota_snapshot")
            timeout_seconds = max(
                int(getattr(quota_snapshot, "max_runtime_seconds", 0) or 0),
                1,
            )
            try:
                result = await asyncio.wait_for(
                    universal_operator.execute_customer_turn(
                        manifest=manifest,
                        tenant_id=tenant_id,
                        workspace_id=workspace_id,
                        goal=resolved_message,
                        seed_demo_if_empty=seed_demo_if_empty,
                        runtime_mode=runtime_mode,
                        runtime_profile=runtime_profile or None,
                        privileged_runtime_approved=privileged_runtime_approved,
                        active_agent_install_id=responder_install_id,
                    ),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                result = channel_concurrency_service.build_runtime_capped_result(
                    quota_snapshot=quota_snapshot,
                )
    except channel_concurrency_service.ChannelExecutionLimitError as error:
        result = channel_concurrency_service.build_limit_result(error=error)

    reply = str(result.get("reply") or "").strip()
    assistant_actor = {
        "type": "assistant",
        "id": responder_install_id or getattr(manifest, "manifest_id", "agent"),
        "display_name": responder_label,
    }
    await thread_service.record_assistant_turn(
        thread_id=resolved_thread_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        session_id=resolved_session_key,
        actor=assistant_actor,
        reply=reply,
        status=str(result.get("status") or "completed"),
        active_agent_install_id=responder_install_id,
        runtime_profile_id=runtime_profile_id,
        metadata={
            **shared_metadata,
            "request_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
            "needed_skill_id": result.get("needed_skill_id"),
            "limit_reason": result.get("limit_reason"),
            "retry_after_seconds": result.get("retry_after_seconds"),
            "quota_snapshot": result.get("quota_snapshot"),
        },
    )
    outbound_event = await control_plane_repository.append_agent_channel_event(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        session_key=resolved_session_key,
        thread_id=resolved_thread_id,
        responder_install_id=responder_install_id,
        direction="outbound",
        event_type="response",
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
            thread_id=resolved_thread_id,
            session_key=resolved_session_key,
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
                thread_id=resolved_thread_id,
                session_key=resolved_session_key,
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
        "session_key": resolved_session_key,
        "thread_id": resolved_thread_id,
        "owner": {
            "install_id": responder_install_id,
            "label": responder_label,
            "type": owner_type,
            "runtime_mode": runtime_mode,
        },
        "status": result.get("status"),
        "reply": reply,
        "artifact": result.get("artifact"),
        "steps": result.get("steps"),
        "critic": result.get("critic"),
        "limit_reason": result.get("limit_reason"),
        "retry_after_seconds": result.get("retry_after_seconds"),
        "quota_snapshot": result.get("quota_snapshot"),
        "audit": {
            "inbound_event_id": str(_coerce_dict(inbound_event).get("id") or "").strip() or None,
            "outbound_event_id": str(_coerce_dict(outbound_event).get("id") or "").strip() or None,
        },
    }
