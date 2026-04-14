"""
Canonical ingress facade for turns and run starts.

Prompt 02 freezes this module as the only accepted boundary for starting work.
Routes, installed-agent APIs, connector shells, and internal automation should
normalize here before handing into `agent_turn` or durable execution internals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from server_modules.agent_turn import (
    AgentTurnRequest,
    agent_turn,
    normalize_server_owned_turn_request,
    resolve_run_start_turn_request,
)
from server_modules.api_contract import request_body_to_turn_request
from server_modules.direct_tool_config_service import run_async_tool_call


@dataclass(slots=True)
class TurnIngressResult:
    turn_request: AgentTurnRequest
    result: Any
    chat_body: Optional[dict[str, Any]] = None
    run_request: Optional[Any] = None
    legacy_direct_resolution: Optional[Any] = None


@dataclass(slots=True)
class RunStartIngressResult:
    request: Any
    turn_request: AgentTurnRequest
    result: dict[str, Any]


def looks_like_legacy_direct_chat_body(payload: dict[str, Any]) -> bool:
    if not isinstance(payload, dict):
        return False
    if any(
        key in payload
        for key in (
            "session_id",
            "actor",
            "execution_mode",
            "response_mode",
            "context_hints",
            "attachments",
            "policy_context",
            "machine_target",
        )
    ):
        return False
    if any(
        key in payload
        for key in (
            "prior_messages",
            "approved_action",
            "availability",
            "last_event_id",
        )
    ):
        return True
    if "thread_id" in payload:
        return True
    return "message" in payload and "actor" not in payload


def looks_like_legacy_run_start_body(payload: dict[str, Any]) -> bool:
    if not isinstance(payload, dict) or not payload:
        return False
    if "actor" in payload or "session_id" in payload or "thread_id" in payload:
        return False
    return any(key in payload for key in ("user_goal", "business_plan", "workflow_id", "engine"))


def _resolved_services(value: Any) -> Any:
    return value() if callable(value) else value


def _default_system_user(current_user: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return (
        dict(current_user)
        if isinstance(current_user, dict)
        else {"auth_type": "api_key", "user_id": "", "email": ""}
    )


async def _resolve_turn_ingress(
    *,
    payload: Any = None,
    compatibility_payload: Optional[dict[str, Any]] = None,
    turn_request: Optional[AgentTurnRequest] = None,
    current_user: Any,
    stamp_request_owner_fn: Optional[Callable[..., Any]] = None,
    request_signature_fn: Optional[Callable[..., Any]] = None,
    chat_body: Optional[dict[str, Any]] = None,
    run_request: Optional[Any] = None,
) -> TurnIngressResult:
    if isinstance(turn_request, AgentTurnRequest):
        resolved_turn_request = normalize_server_owned_turn_request(
            current_user=current_user,
            turn_request=turn_request,
        )
        return TurnIngressResult(
            turn_request=resolved_turn_request,
            result=None,
            chat_body=dict(chat_body or {}) if isinstance(chat_body, dict) else chat_body,
            run_request=run_request,
        )

    normalized_payload = dict(payload or {}) if isinstance(payload, dict) else payload
    detection_payload = (
        dict(compatibility_payload or {})
        if isinstance(compatibility_payload, dict)
        else dict(normalized_payload or {})
        if isinstance(normalized_payload, dict)
        else {}
    )

    if looks_like_legacy_direct_chat_body(detection_payload):
        from server_modules.agent_turn import resolve_direct_chat_turn_request

        resolution = resolve_direct_chat_turn_request(
            current_user=current_user,
            body=dict(normalized_payload or {}),
            request_signature_fn=request_signature_fn,
        )
        return TurnIngressResult(
            turn_request=resolution.turn_request,
            result=None,
            chat_body=dict(normalized_payload or {}),
            run_request=None,
            legacy_direct_resolution=resolution,
        )

    if looks_like_legacy_run_start_body(detection_payload):
        from server_modules.runtime_models import RunStartRequest

        base_request = RunStartRequest(**dict(normalized_payload or {}))
        resolution = resolve_run_start_turn_request(
            current_user=current_user,
            body=base_request,
            stamp_request_owner_fn=stamp_request_owner_fn,
        )
        return TurnIngressResult(
            turn_request=resolution.turn_request,
            result=None,
            chat_body=None,
            run_request=resolution.request,
        )

    resolved_turn_request = request_body_to_turn_request(normalized_payload)
    resolved_turn_request = normalize_server_owned_turn_request(
        current_user=current_user,
        turn_request=resolved_turn_request,
    )
    return TurnIngressResult(
        turn_request=resolved_turn_request,
        result=None,
        chat_body=chat_body,
        run_request=run_request,
    )


async def start_turn(
    payload: Any = None,
    *,
    compatibility_payload: Optional[dict[str, Any]] = None,
    turn_request: Optional[AgentTurnRequest] = None,
    current_user: Any,
    run_execution_services: Any,
    direct_chat_services: Any = None,
    stamp_request_owner_fn: Optional[Callable[..., Any]] = None,
    request_signature_fn: Optional[Callable[..., Any]] = None,
    chat_body: Optional[dict[str, Any]] = None,
    run_request: Optional[Any] = None,
    stream_response_builder: Optional[Callable[..., Any]] = None,
    stream_response_services: Any = None,
    stream_last_event_id: Any = None,
    return_result_only: bool = False,
) -> TurnIngressResult | Any:
    resolution = await _resolve_turn_ingress(
        payload=payload,
        compatibility_payload=compatibility_payload,
        turn_request=turn_request,
        current_user=current_user,
        stamp_request_owner_fn=stamp_request_owner_fn,
        request_signature_fn=request_signature_fn,
        chat_body=chat_body,
        run_request=run_request,
    )
    resolved_turn_request = resolution.turn_request

    if (
        callable(stream_response_builder)
        and str(resolved_turn_request.execution_mode or "").strip().lower() == "sync"
        and str(resolved_turn_request.response_mode or "").strip().lower() == "stream"
    ):
        legacy_resolution = resolution.legacy_direct_resolution
        result = await stream_response_builder(
            current_user=current_user,
            turn_request=resolved_turn_request,
            last_event_id=stream_last_event_id,
            services=_resolved_services(stream_response_services),
            chat_body=resolution.chat_body,
            fallback_workspace_id=legacy_resolution.workspace_id if legacy_resolution else None,
            fallback_thread_id=legacy_resolution.thread_id if legacy_resolution else None,
            fallback_client_request_id=legacy_resolution.client_request_id if legacy_resolution else None,
        )
        if return_result_only:
            return result
        resolution.result = result
        return resolution

    result = await agent_turn(
        turn_request=resolved_turn_request,
        current_user=current_user,
        run_execution_services=_resolved_services(run_execution_services),
        direct_chat_services=_resolved_services(direct_chat_services),
        chat_body=resolution.chat_body,
        run_request=resolution.run_request,
    )
    if return_result_only:
        return result
    resolution.result = result
    return resolution


async def start_run_start(
    request: Any,
    *,
    current_user: Any,
    stamp_request_owner_fn: Any,
    services: Any,
) -> dict[str, Any]:
    from server_modules.run_service import execute_durable_turn_request

    resolved_services = _resolved_services(services)
    resolution = resolve_run_start_turn_request(
        current_user=current_user,
        body=request,
        stamp_request_owner_fn=stamp_request_owner_fn,
    )
    execution = await execute_durable_turn_request(
        turn_request=resolution.turn_request,
        current_user=current_user,
        services=resolved_services,
        base_request=resolution.request,
    )
    result = execution.get("result")
    return dict(result) if isinstance(result, dict) else {"result": result}


def start_system_turn(
    payload: Any = None,
    *,
    compatibility_payload: Optional[dict[str, Any]] = None,
    turn_request: Optional[AgentTurnRequest] = None,
    run_execution_services: Any,
    direct_chat_services: Any = None,
    stamp_request_owner_fn: Optional[Callable[..., Any]] = None,
    request_signature_fn: Optional[Callable[..., Any]] = None,
    chat_body: Optional[dict[str, Any]] = None,
    run_request: Optional[Any] = None,
    current_user: Optional[dict[str, Any]] = None,
    return_result_only: bool = True,
) -> Any:
    return run_async_tool_call(
        start_turn(
            payload,
            compatibility_payload=compatibility_payload,
            turn_request=turn_request,
            current_user=_default_system_user(current_user),
            run_execution_services=run_execution_services,
            direct_chat_services=direct_chat_services,
            stamp_request_owner_fn=stamp_request_owner_fn,
            request_signature_fn=request_signature_fn,
            chat_body=chat_body,
            run_request=run_request,
            return_result_only=return_result_only,
        )
    )


def start_system_run_start(
    request: Any,
    *,
    stamp_request_owner_fn: Any,
    services: Any,
    current_user: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return run_async_tool_call(
        start_run_start(
            request,
            current_user=_default_system_user(current_user),
            stamp_request_owner_fn=stamp_request_owner_fn,
            services=services,
        )
    )
