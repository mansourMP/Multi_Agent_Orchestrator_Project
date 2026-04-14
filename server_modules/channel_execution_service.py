from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from server_modules import channel_execution_quota_adapter, error_response_service, quota_policy_service, quota_response_service
from server_modules.channel_routing_models import ChannelExecutionResult, ChannelRoutingContext
from server_modules.error_contracts import INTERNAL_ERROR
from server_modules.channel_turn_request_service import normalize_canonical_channel_result


logger = logging.getLogger(__name__)


async def execute_canonical_channel_turn(
    *,
    turn_request: Any,
    current_user: dict[str, Any],
) -> dict[str, Any]:
    from server_modules.agent_turn import execute_system_agent_turn
    from server_modules import runtime_runs_api

    run_execution_services = runtime_runs_api._run_execution_services()
    return await asyncio.to_thread(
        execute_system_agent_turn,
        turn_request=turn_request,
        current_user=current_user,
        run_execution_services=run_execution_services,
    )


async def execute_prepared_channel_turn(
    *,
    context: ChannelRoutingContext,
    execute_turn: Callable[..., Awaitable[dict[str, Any]]],
    wait_for: Callable[..., Awaitable[Any]],
) -> ChannelExecutionResult:
    quota_snapshot = None
    quota_subject = quota_policy_service.QuotaSubject(
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
    )
    try:
        async with channel_execution_quota_adapter.channel_execution_slot(
            tenant_id=context.tenant_id,
            workspace_id=context.workspace_id,
            responder_install_id=context.responder_install_id,
            thread_id=context.thread_id,
            session_key=context.session_key,
            channel_key=context.channel_key,
            endpoint_key=context.endpoint_key,
            install=context.install,
            metadata=context.shared_metadata,
        ) as execution_slot:
            quota_snapshot = execution_slot.get("quota_snapshot")
            timeout_seconds = max(int(getattr(quota_snapshot, "max_runtime_seconds", 0) or 0), 1)
            try:
                execution_result = await wait_for(
                    execute_turn(
                        turn_request=context.turn_request,
                        current_user=context.execution_owner,
                    ),
                    timeout=timeout_seconds,
                )
                return normalize_canonical_channel_result(execution_result=execution_result)
            except asyncio.TimeoutError:
                decision = quota_policy_service.runtime_cap_quota_decision(
                    subject=quota_subject,
                    quota_snapshot=quota_snapshot,
                )
                return quota_response_service.channel_result_from_quota_decision(
                    decision=decision,
                    deployed_agent=context.deployed_agent,
                    shared_metadata=context.shared_metadata,
                    deployed_agent_id=context.deployed_agent_id,
                    deployed_agent_state=context.deployed_agent_state,
                )
    except channel_execution_quota_adapter.ChannelExecutionLimitError as error:
        decision = quota_policy_service.channel_limit_error_decision(
            subject=quota_subject,
            error=error,
        )
        return quota_response_service.channel_result_from_quota_decision(
            decision=decision,
            deployed_agent=context.deployed_agent,
            shared_metadata=context.shared_metadata,
            deployed_agent_id=context.deployed_agent_id,
            deployed_agent_state=context.deployed_agent_state,
        )
    except Exception as exc:
        logger.exception(
            "Channel execution failed",
            extra={
                "tenant_id": context.tenant_id,
                "workspace_id": context.workspace_id,
                "channel_key": context.channel_key,
                "deployed_agent_id": context.deployed_agent_id,
                "session_key": context.session_key,
                "thread_id": context.thread_id,
                "request_id": str(context.shared_metadata.get("request_id") or "").strip() or None,
            },
        )
        reply = "I hit an internal problem while handling this message. Please try again in a moment."
        error = error_response_service.platform_error(
            code="channel_execution_failed",
            message=reply,
            error_class=INTERNAL_ERROR,
            retryable=True,
            status_code=500,
            request_id=str(context.shared_metadata.get("request_id") or "").strip() or None,
            details={
                "channel_key": context.channel_key,
                "deployed_agent_id": context.deployed_agent_id,
            },
        )
        return ChannelExecutionResult(
            status="error",
            reply=reply,
            limit_reason="internal_error",
            metadata={
                "response_class": "internal_error",
                "deployed_agent_id": context.deployed_agent_id,
                "deployment_state": context.deployed_agent_state,
            },
            payload={
                "status": "error",
                "limit_reason": "internal_error",
                "response_class": "internal_error",
                "error": error_response_service.channel_error_payload(error),
            },
            error=error_response_service.channel_error_payload(error),
        )
