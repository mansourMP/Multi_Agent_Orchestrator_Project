"""
External channel ingress adapter for deployed-agent traffic.

Prompt 01 freezes this module as the canonical ingress surface for public
deployed-agent channel messages. Channel shells normalize ingress, resolve
owner/preflight state, apply policy overlays, and build one canonical
`AgentTurnRequest` before entering the shared turn engine.

Channel shells are transport surfaces only. They must not become separate
product brains, policy engines, memory engines, or run engines.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any, Dict, Optional

from server_modules import (
    agent_registry_repository,
    agent_specialist_repository,
    channel_concurrency_service,
    control_plane_repository,
    deployed_agent_memory_service,
    deployed_agent_rate_limit_service,
    deployed_agent_service,
    healthguide_safety_service,
    safe_mode_service,
)
from server_modules.channel_activity_service import record_result as record_channel_activity
from server_modules.channel_blocking_policy_service import (
    check_deployment_pause,
    check_incident_state,
    duplicate_ignored_result,
)
from server_modules.channel_errors import (
    ChannelIngressValidationError,
    ChannelOwnerNotFoundError,
    ChannelSecurityDeniedError,
)
from server_modules.channel_event_journal_service import (
    inbound_event_id,
    is_duplicate_inbound,
    record_inbound_message,
    record_outbound_result,
)
from server_modules.channel_execution_service import (
    execute_canonical_channel_turn as _execute_canonical_channel_turn,
    execute_prepared_channel_turn as _execute_prepared_channel_turn,
)
from server_modules.channel_identity_service import (
    SUPPORTED_CHANNEL_KEYS,
    SUPPORTED_FULL_SHELL_KEYS,
    WEB_CHAT_DEFAULT_ENDPOINT_KEY,
)
from server_modules.channel_memory_overlay_service import (
    apply_memory_overlay,
    persist_snapshot,
)
from server_modules import channel_owner_resolution_service
from server_modules.channel_preflight_service import assert_inbound_allowed
from server_modules.channel_quota_policy_service import check_daily_limit
from server_modules.channel_routing_models import ChannelExecutionResult, ChannelRoutingContext
from server_modules.channel_safety_overlay_service import (
    apply_business_plan_overlay,
    apply_post_turn_overlay,
    apply_pre_turn_context,
)
from server_modules.channel_surface_contract_service import (
    CHANNEL_SHELL_CLASS,
    FULL_SHELL_CLASS,
    channel_shell_contract,
    full_shell_contract,
    shell_surface_contract,
)
from server_modules.channel_turn_request_service import (
    build_route_response,
    build_routing_context,
    context_to_compat_dict,
    coerce_dict,
)


async def resolve_public_channel_owner(**kwargs):
    channel_owner_resolution_service.agent_specialist_repository = agent_specialist_repository
    channel_owner_resolution_service.deployed_agent_service = deployed_agent_service
    channel_owner_resolution_service.agent_registry_repository = agent_registry_repository
    return await channel_owner_resolution_service.resolve_public_channel_owner(**kwargs)


def _merge_degraded_notice(
    result: Any,
    notice: Optional[Dict[str, Any]],
) -> Any:
    if not isinstance(notice, dict) or not notice:
        return result
    degraded_operations = list(getattr(result, "degraded_operations", []) or [])
    degraded_operations.append(dict(notice))
    metadata = dict(getattr(result, "metadata", {}) or {})
    metadata["degraded_operation_count"] = len(degraded_operations)
    metadata["degraded"] = True
    return replace(result, degraded_operations=degraded_operations, metadata=metadata)


def _context_from_prepared(prepared: Dict[str, Any] | ChannelRoutingContext) -> ChannelRoutingContext:
    if isinstance(prepared, ChannelRoutingContext):
        return prepared
    payload = dict(prepared or {})
    return ChannelRoutingContext(
        tenant_id=str(payload.get("tenant_id") or "").strip(),
        workspace_id=str(payload.get("workspace_id") or "").strip(),
        channel_key=str(payload.get("channel_key") or "").strip(),
        endpoint_key=str(payload.get("endpoint_key") or "").strip(),
        actor_id=str(payload.get("actor_id") or "").strip(),
        actor_display_name=str(payload.get("actor_display_name") or "").strip(),
        session_key=str(payload.get("session_key") or "").strip(),
        thread_id=str(payload.get("thread_id") or "").strip(),
        message=str(payload.get("message") or "").strip(),
        owner_type=str(payload.get("owner_type") or "").strip() or "specialist",
        install=coerce_dict(payload.get("install")),
        manifest=payload.get("manifest"),
        responder_install_id=str(payload.get("responder_install_id") or "").strip() or None,
        responder_label=str(payload.get("responder_label") or "").strip(),
        runtime_mode=str(payload.get("runtime_mode") or "").strip() or "hosted_secure",
        runtime_profile_id=str(payload.get("runtime_profile_id") or "").strip() or None,
        master_install_id=str(payload.get("master_install_id") or "").strip() or None,
        shared_metadata=coerce_dict(payload.get("shared_metadata")),
        turn_request=payload.get("turn_request"),
        execution_owner=coerce_dict(payload.get("execution_owner")),
        deployed_agent=coerce_dict(payload.get("deployed_agent")) or None,
        deployed_agent_id=str(payload.get("deployed_agent_id") or "").strip() or None,
        deployed_agent_state=str(payload.get("deployed_agent_state") or "").strip() or None,
        inbound_event=coerce_dict(payload.get("inbound_event")) or None,
        prior_messages=payload.get("prior_messages") if isinstance(payload.get("prior_messages"), list) else None,
        business_plan=str(payload.get("business_plan") or "").strip() or None,
        health_safety_context=coerce_dict(payload.get("health_safety_context")) or {"enabled": False},
        allow_master_fallback=bool(payload.get("allow_master_fallback", False)),
        privileged_runtime_approved=bool(payload.get("privileged_runtime_approved", False)),
        seed_demo_if_empty=bool(payload.get("seed_demo_if_empty", False)),
    )


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
    allow_master_fallback: bool = False,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
) -> Dict[str, Any]:
    context = build_routing_context(
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
        request_id=request_id,
        allow_master_fallback=allow_master_fallback,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    return context_to_compat_dict(context)


async def execute_canonical_channel_turn(
    *,
    turn_request: Any,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    return await _execute_canonical_channel_turn(
        turn_request=turn_request,
        current_user=current_user,
    )


async def execute_prepared_channel_turn(
    *,
    prepared: Dict[str, Any] | ChannelRoutingContext,
) -> Dict[str, Any]:
    context = _context_from_prepared(prepared)
    result = await _execute_prepared_channel_turn(
        context=context,
        execute_turn=execute_canonical_channel_turn,
        wait_for=asyncio.wait_for,
    )
    return {
        "status": result.status,
        "reply": result.reply,
        "error": result.error,
        "run_id": result.run_id,
        "artifact": result.artifact,
        "steps": result.steps,
        "critic": result.critic,
        "limit_reason": result.limit_reason,
        "retry_after_seconds": result.retry_after_seconds,
        "quota_snapshot": result.quota_snapshot,
        "metadata": result.metadata,
        "event_type": result.event_type,
        "incident_scope": result.incident_scope,
        "incident_mode": result.incident_mode,
        "payload": result.payload,
        "event_metadata": result.event_metadata,
        "health_safety": result.health_safety,
        "degraded_operations": result.degraded_operations,
    }


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
    allow_master_fallback: bool = False,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
) -> Dict[str, Any]:
    context = build_routing_context(
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
        allow_master_fallback=allow_master_fallback,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    incident_result = check_incident_state(context=context)
    if incident_result is not None:
        return build_route_response(
            context=context,
            result=incident_result,
            inbound_event_id=None,
            outbound_event_id=None,
        )
    result = await _execute_prepared_channel_turn(
        context=context,
        execute_turn=execute_canonical_channel_turn,
        wait_for=asyncio.wait_for,
    )
    return build_route_response(
        context=context,
        result=result,
        inbound_event_id=None,
        outbound_event_id=None,
    )


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
    allow_master_fallback: bool = False,
    privileged_runtime_approved: bool = False,
    seed_demo_if_empty: bool = False,
) -> Dict[str, Any]:
    resolved_channel_key, resolved_endpoint_key, resolved_message = assert_inbound_allowed(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=channel_key,
        endpoint_key=endpoint_key,
        customer_message=customer_message,
    )
    context = await resolve_public_channel_owner(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        channel_key=resolved_channel_key,
        endpoint_key=resolved_endpoint_key,
        customer_message=resolved_message,
        session_key=session_key,
        message_id=message_id,
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        metadata=metadata,
        allow_master_fallback=allow_master_fallback,
        privileged_runtime_approved=privileged_runtime_approved,
        seed_demo_if_empty=seed_demo_if_empty,
    )
    inbound_event = await record_inbound_message(
        context=context,
        message_id=message_id,
    )
    context = replace(context, inbound_event=inbound_event)
    current_inbound_event_id = inbound_event_id(inbound_event)
    if is_duplicate_inbound(inbound_event):
        result = duplicate_ignored_result()
        return build_route_response(
            context=context,
            result=result,
            inbound_event_id=current_inbound_event_id,
            outbound_event_id=None,
        )

    paused_result = check_deployment_pause(context=context)
    if paused_result is not None:
        outbound_event = await record_outbound_result(
            context=context,
            result=paused_result,
            parent_event_id=current_inbound_event_id,
        )
        outbound_id = inbound_event_id(outbound_event)
        paused_result = _merge_degraded_notice(
            paused_result,
            await record_channel_activity(
                context=context,
                result=paused_result,
                outbound_event_id=outbound_id,
            ),
        )
        return build_route_response(
            context=context,
            result=paused_result,
            inbound_event_id=current_inbound_event_id,
            outbound_event_id=outbound_id,
        )

    incident_result = check_incident_state(context=context)
    if incident_result is not None:
        outbound_event = await record_outbound_result(
            context=context,
            result=incident_result,
            parent_event_id=current_inbound_event_id,
        )
        outbound_id = inbound_event_id(outbound_event)
        incident_result = _merge_degraded_notice(
            incident_result,
            await record_channel_activity(
                context=context,
                result=incident_result,
                outbound_event_id=outbound_id,
            ),
        )
        return build_route_response(
            context=context,
            result=incident_result,
            inbound_event_id=current_inbound_event_id,
            outbound_event_id=outbound_id,
        )

    quota_check = await check_daily_limit(
        context=context,
        message_id=message_id,
    )
    quota_warning_notice = quota_check.get("warning_notice") if isinstance(quota_check, dict) else None
    quota_result = quota_check.get("blocked_result") if isinstance(quota_check, dict) else None
    if isinstance(quota_result, ChannelExecutionResult):
        outbound_event = await record_outbound_result(
            context=context,
            result=quota_result,
            parent_event_id=current_inbound_event_id,
        )
        outbound_id = inbound_event_id(outbound_event)
        quota_result = _merge_degraded_notice(
            quota_result,
            await record_channel_activity(
                context=context,
                result=quota_result,
                outbound_event_id=outbound_id,
            ),
        )
        return build_route_response(
            context=context,
            result=quota_result,
            inbound_event_id=current_inbound_event_id,
            outbound_event_id=outbound_id,
        )

    context = replace(
        context,
        shared_metadata={
            **context.shared_metadata,
            "request_id": current_inbound_event_id,
        },
    )
    context = apply_pre_turn_context(context=context)
    context = await apply_memory_overlay(
        context=context,
        inbound_event_id=current_inbound_event_id,
    )
    context = apply_business_plan_overlay(context=context)
    execution_result = await _execute_prepared_channel_turn(
        context=context,
        execute_turn=execute_canonical_channel_turn,
        wait_for=asyncio.wait_for,
    )
    result = apply_post_turn_overlay(
        context=context,
        result=execution_result,
    )
    outbound_event = await record_outbound_result(
        context=context,
        result=result,
        parent_event_id=current_inbound_event_id,
    )
    outbound_id = inbound_event_id(outbound_event)
    result = _merge_degraded_notice(
        result,
        await persist_snapshot(
            context=context,
            assistant_reply=result.reply,
        ),
    )
    result = _merge_degraded_notice(
        result,
        await record_channel_activity(
            context=context,
            result=result,
            outbound_event_id=outbound_id,
        ),
    )
    return build_route_response(
        context=context,
        result=result,
        inbound_event_id=current_inbound_event_id,
        outbound_event_id=outbound_id,
        notices=[quota_warning_notice] if isinstance(quota_warning_notice, dict) else None,
    )
