from __future__ import annotations

from math import ceil
from typing import Any, Dict, Optional

from server_modules import control_plane_repository, quota_policy_service, quota_response_service
from server_modules.channel_routing_models import ChannelExecutionResult, ChannelRoutingContext


async def check_daily_limit(
    *,
    context: ChannelRoutingContext,
    message_id: Optional[str] = None,
) -> Dict[str, Optional[Dict[str, Any] | ChannelExecutionResult]]:
    if not context.deployed_agent_id:
        return {
            "blocked_result": None,
            "warning_notice": None,
        }
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
    if not decision.allowed:
        return {
            "blocked_result": quota_response_service.channel_result_from_quota_decision(
                decision=decision,
                deployed_agent=context.deployed_agent,
                shared_metadata=context.shared_metadata,
                deployed_agent_id=context.deployed_agent_id,
                deployed_agent_state=context.deployed_agent_state,
            ),
            "warning_notice": None,
        }
    details = dict(decision.metadata or {})
    daily_limit = int(details.get("daily_message_limit") or 0)
    message_count = int(details.get("message_count") or 0)
    remaining = max(int(details.get("remaining") or 0), 0)
    warning_sent = bool(details.get("warning_sent"))
    usage_day = str(details.get("usage_day") or "").strip() or None
    threshold = ceil(daily_limit * 0.8) if daily_limit > 0 else 0
    warning_notice: Optional[Dict[str, Any]] = None
    if (
        daily_limit > 0
        and threshold > 0
        and message_count >= threshold
        and not warning_sent
        and usage_day
        and context.deployed_agent_id
    ):
        updated_row = await control_plane_repository.mark_deployed_agent_daily_message_warning_sent(
            tenant_id=context.tenant_id,
            workspace_id=context.workspace_id,
            deployed_agent_id=context.deployed_agent_id,
            channel_key=context.channel_key,
            external_user_id=context.actor_id,
            usage_day=usage_day,
        )
        if isinstance(updated_row, dict):
            specialist_name = str((context.deployed_agent or {}).get("name") or "").strip() or "this specialist"
            warning_notice = {
                "text": f"You have {remaining} messages left today with {specialist_name}.",
            }
    return {
        "blocked_result": None,
        "warning_notice": warning_notice,
    }
