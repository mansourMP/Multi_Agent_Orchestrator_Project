from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from server_modules.channel_routing_models import ChannelExecutionResult
from server_modules import error_response_service
from server_modules.error_contracts import EXECUTION_TIMEOUT, RATE_LIMIT
from server_modules.quota_policy_service import QuotaDecision


_HTTP_DETAIL_BY_REASON = {
    "auth_login_rate_limited": "Rate limit exceeded.",
    "auth_public_rate_limited": "Rate limit exceeded.",
    "authenticated_api_rate_limited": "Rate limit exceeded.",
    "service_api_rate_limited": "Rate limit exceeded.",
    "control_plane_rate_limited": "Control plane rate limit exceeded.",
}

_CHANNEL_REPLY_BY_REASON = {
    "thread_busy": "I’m still finishing the previous message in this conversation. One moment.",
    "agent_limit_exceeded": "This specialist is helping other customers right now. Please try again in a moment.",
    "workspace_limit_exceeded": "The workspace is helping other customers right now. Please try again in a moment.",
    "workspace_rate_limited": "I’m receiving too many requests right now. Please try again in a moment.",
    "runtime_cap_exceeded": "I’m taking longer than the current service window allows. Please try again in a moment.",
}

_CHANNEL_STATUS_BY_REASON = {
    "deployed_agent_daily_limit_exceeded": "rate_limited",
    "thread_busy": "thread_busy",
    "agent_limit_exceeded": "agent_busy",
    "workspace_limit_exceeded": "workspace_busy",
    "workspace_rate_limited": "rate_limited",
    "runtime_cap_exceeded": "runtime_capped",
}


def _channel_failure_class_for_reason(reason: Optional[str]) -> str:
    normalized = str(reason or "").strip()
    if normalized == "runtime_cap_exceeded":
        return EXECUTION_TIMEOUT
    return RATE_LIMIT


def http_detail_for_reason(reason: Optional[str]) -> str:
    return _HTTP_DETAIL_BY_REASON.get(str(reason or "").strip(), "Rate limit exceeded.")


def channel_reply_for_reason(
    reason: Optional[str],
    *,
    deployed_agent: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    normalized_reason = str(reason or "").strip()
    details = dict(metadata or {})
    if normalized_reason == "deployed_agent_daily_limit_exceeded":
        from server_modules import deployed_agent_service

        return deployed_agent_service.daily_limit_channel_reply(
            deployed_agent=deployed_agent,
            upgrade_cta_url=str(details.get("upgrade_cta_url") or "").strip() or None,
            upgrade_cta_label=str(details.get("upgrade_cta_label") or "").strip() or None,
        )
    return _CHANNEL_REPLY_BY_REASON.get(normalized_reason, "The system is busy. Please try again in a moment.")


def http_exception_from_quota_decision(decision: QuotaDecision) -> HTTPException:
    headers: Dict[str, str] = {}
    if decision.retry_after_seconds:
        headers["Retry-After"] = str(decision.retry_after_seconds)
    return HTTPException(
        status_code=int(decision.http_status or 429),
        detail={
            "code": str(decision.reason or "").strip() or "rate_limit_exceeded",
            "message": http_detail_for_reason(decision.reason),
            "class": RATE_LIMIT,
            "retryable": True,
            "details": {
                "response_class": decision.response_class,
                **{key: value for key, value in dict(decision.metadata or {}).items() if value is not None},
            },
        },
        headers=headers or None,
    )


def json_response_from_quota_decision(decision: QuotaDecision) -> JSONResponse:
    headers: Dict[str, str] = {}
    if decision.retry_after_seconds:
        headers["Retry-After"] = str(decision.retry_after_seconds)
    error = error_response_service.platform_error(
        code=str(decision.reason or "").strip() or "rate_limit_exceeded",
        message=http_detail_for_reason(decision.reason),
        error_class=RATE_LIMIT,
        retryable=True,
        status_code=int(decision.http_status or 429),
        details={
            "response_class": decision.response_class,
            **{key: value for key, value in dict(decision.metadata or {}).items() if value is not None},
        },
    )
    content = error_response_service.serialize_http_error_envelope(
        error_response_service.build_http_error_envelope(error)
    )
    if decision.retry_after_seconds:
        content["retry_after_seconds"] = decision.retry_after_seconds
    return JSONResponse(status_code=int(decision.http_status or 429), content=content, headers=headers or None)


def channel_result_from_quota_decision(
    *,
    decision: QuotaDecision,
    deployed_agent: Optional[Dict[str, Any]] = None,
    shared_metadata: Optional[Dict[str, Any]] = None,
    deployed_agent_id: Optional[str] = None,
    deployed_agent_state: Optional[str] = None,
) -> ChannelExecutionResult:
    details = dict(decision.metadata or {})
    status = _CHANNEL_STATUS_BY_REASON.get(str(decision.reason or "").strip(), "rate_limited")
    reply = channel_reply_for_reason(
        decision.reason,
        deployed_agent=deployed_agent,
        metadata=details,
    )
    error = error_response_service.platform_error(
        code=str(decision.reason or "").strip() or "rate_limit_exceeded",
        message=reply,
        error_class=_channel_failure_class_for_reason(decision.reason),
        retryable=True,
        status_code=int(decision.http_status or 429),
        details={
            "response_class": decision.response_class,
            "scope": decision.scope,
            **{key: value for key, value in details.items() if value is not None},
        },
    )
    payload: Dict[str, Any] = {
        "status": status,
        "limit_reason": decision.reason,
        "response_class": decision.response_class,
        "error": error_response_service.channel_error_payload(error),
    }
    payload.update({key: value for key, value in details.items() if value is not None})
    event_metadata: Dict[str, Any] = dict(shared_metadata or {})
    event_metadata.update({key: value for key, value in details.items() if value is not None})
    if decision.reason:
        event_metadata["limit_reason"] = decision.reason
    if decision.scope:
        event_metadata["rate_limit_scope"] = decision.scope
    metadata: Dict[str, Any] = {
        "response_class": decision.response_class,
        **{key: value for key, value in details.items() if value is not None},
    }
    if deployed_agent_id:
        metadata["deployed_agent_id"] = deployed_agent_id
    if deployed_agent_state:
        metadata["deployment_state"] = deployed_agent_state
    return ChannelExecutionResult(
        status=status,
        reply=reply,
        limit_reason=decision.reason,
        retry_after_seconds=decision.retry_after_seconds,
        quota_snapshot=dict(decision.quota_snapshot or {}) or None,
        metadata=metadata,
        payload=payload,
        event_metadata=event_metadata,
        error=error_response_service.channel_error_payload(error),
    )


def channel_payload_from_quota_decision(
    *,
    decision: QuotaDecision,
    deployed_agent: Optional[Dict[str, Any]] = None,
    shared_metadata: Optional[Dict[str, Any]] = None,
    deployed_agent_id: Optional[str] = None,
    deployed_agent_state: Optional[str] = None,
) -> Dict[str, Any]:
    result = channel_result_from_quota_decision(
        decision=decision,
        deployed_agent=deployed_agent,
        shared_metadata=shared_metadata,
        deployed_agent_id=deployed_agent_id,
        deployed_agent_state=deployed_agent_state,
    )
    return {
        "status": result.status,
        "reply": result.reply,
        "error": result.error,
        "artifact": result.artifact,
        "steps": result.steps,
        "critic": result.critic,
        "quota_snapshot": result.quota_snapshot,
        "retry_after_seconds": result.retry_after_seconds,
        "limit_reason": result.limit_reason,
        "metadata": result.metadata,
        "event_type": result.event_type,
        "incident_scope": result.incident_scope,
        "incident_mode": result.incident_mode,
        "payload": result.payload,
        "event_metadata": result.event_metadata,
        "health_safety": result.health_safety,
        "degraded_operations": result.degraded_operations,
    }
