from __future__ import annotations

from dataclasses import replace

from server_modules import healthguide_safety_service
from server_modules.channel_routing_models import ChannelExecutionResult, ChannelRoutingContext
from server_modules.channel_turn_request_service import coerce_dict, rebuild_turn_request


def apply_pre_turn_context(*, context: ChannelRoutingContext) -> ChannelRoutingContext:
    if not context.deployed_agent_id:
        return context
    health_safety_context = healthguide_safety_service.resolve_health_safety_context(
        deployed_agent=context.deployed_agent,
    )
    if not health_safety_context.get("enabled"):
        return replace(context, health_safety_context=health_safety_context)
    shared_metadata = {
        **context.shared_metadata,
        "health_safety_enabled": True,
        "health_safety_mode": "healthguide",
        "health_safety_policy_version": healthguide_safety_service.HEALTHGUIDE_SAFETY_POLICY_VERSION,
        "health_safety_assistant_name": health_safety_context.get("assistant_name"),
        "deployed_agent_name": health_safety_context.get("assistant_name"),
    }
    next_context = replace(context, health_safety_context=health_safety_context, shared_metadata=shared_metadata)
    return rebuild_turn_request(
        next_context,
        request_id=str(shared_metadata.get("request_id") or "").strip() or None,
        prior_messages=context.prior_messages,
        business_plan=context.business_plan,
        shared_metadata=shared_metadata,
    )


def apply_business_plan_overlay(*, context: ChannelRoutingContext) -> ChannelRoutingContext:
    if not context.health_safety_context.get("enabled"):
        return context
    business_plan = healthguide_safety_service.merge_health_safety_business_plan(
        context.business_plan,
        assistant_name=str(context.health_safety_context.get("assistant_name") or "").strip()
        or healthguide_safety_service.DEFAULT_ASSISTANT_NAME,
    )
    return rebuild_turn_request(
        context,
        request_id=str(context.shared_metadata.get("request_id") or "").strip() or None,
        prior_messages=context.prior_messages,
        business_plan=business_plan,
    )


def apply_post_turn_overlay(
    *,
    context: ChannelRoutingContext,
    result: ChannelExecutionResult,
) -> ChannelExecutionResult:
    if not context.health_safety_context.get("enabled") or result.event_type != "response":
        return result
    health_safety_result = healthguide_safety_service.apply_health_safety_to_reply(
        reply=result.reply,
        user_message=context.message,
        assistant_name=str(context.health_safety_context.get("assistant_name") or "").strip() or None,
        response_payload=coerce_dict(result.metadata),
    )
    return ChannelExecutionResult(
        status=result.status,
        reply=str(health_safety_result.get("reply") or result.reply or "").strip(),
        run_id=result.run_id,
        artifact=result.artifact,
        steps=result.steps,
        critic=result.critic,
        limit_reason=result.limit_reason,
        retry_after_seconds=result.retry_after_seconds,
        quota_snapshot=result.quota_snapshot,
        metadata={
            **coerce_dict(result.metadata),
            "health_safety": {
                "enabled": True,
                "policy_version": health_safety_result.get("policy_version"),
                "assistant_name": health_safety_result.get("assistant_name"),
                "red_flag_triggered": health_safety_result.get("red_flag_triggered"),
                "red_flag_matches": list(health_safety_result.get("red_flag_matches") or []),
                "citation_refs": list(health_safety_result.get("citation_refs") or []),
                "citation_mode": health_safety_result.get("citation_mode"),
            },
        },
        event_type=result.event_type,
        incident_scope=result.incident_scope,
        incident_mode=result.incident_mode,
        payload=result.payload,
        event_metadata=result.event_metadata,
        health_safety=coerce_dict(health_safety_result),
    )
