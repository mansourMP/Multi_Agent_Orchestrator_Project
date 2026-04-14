from __future__ import annotations

from typing import Optional

from server_modules import quota_policy_service, quota_response_service
from server_modules.channel_routing_models import ChannelExecutionResult, ChannelRoutingContext


async def check_daily_limit(
    *,
    context: ChannelRoutingContext,
    message_id: Optional[str] = None,
) -> Optional[ChannelExecutionResult]:
    if not context.deployed_agent_id:
        return None
    decision = await quota_policy_service.evaluate_channel_quota(
        profile_name=quota_policy_service.DEPLOYED_AGENT_PUBLIC_TURN_PROFILE.name,
        subject=quota_policy_service.QuotaSubject(
            tenant_id=context.tenant_id,
            workspace_id=context.workspace_id,
            surface_kind=quota_policy_service.DEPLOYED_AGENT_PUBLIC_TURN_PROFILE.surface_kind,
            channel_key=context.channel_key,
            deployed_agent_id=context.deployed_agent_id,
            external_user_id=context.actor_id,
            responder_install_id=context.responder_install_id,
            thread_id=context.thread_id,
            session_key=context.session_key,
            actor_id=context.actor_id,
        ),
        deployed_agent=context.deployed_agent,
        message_id=str(message_id or "").strip() or None,
    )
    if decision.allowed:
        return None
    return quota_response_service.channel_result_from_quota_decision(
        decision=decision,
        deployed_agent=context.deployed_agent,
        shared_metadata=context.shared_metadata,
        deployed_agent_id=context.deployed_agent_id,
        deployed_agent_state=context.deployed_agent_state,
    )
