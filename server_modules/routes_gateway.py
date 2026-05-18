from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket
from fastapi.responses import JSONResponse
from starlette import status
from pydantic import BaseModel, Field

from server_modules.auth import enforce_workspace_access, workspace_tenant_id
from server_modules.kill_switch_gate import assert_not_killed, KillSwitchBlockedError
from server_modules.gateway_quota_enforcement import (
    evaluate_gateway_quota,
    GATEWAY_TOOL_EXECUTION,
    GATEWAY_BROWSER_SESSION,
    GATEWAY_APPROVAL_ACTION,
    GATEWAY_WS_CONNECTION,
)
from server_modules.safety_error_contract import (
    kill_switch_error,
    quota_exceeded_error,
    to_http_body,
    to_http_status,
)
from server_modules.agent_computer_policy_service import (
    build_default_agent_computer_policy,
    normalize_agent_computer_policy,
)
from server_modules.capability_risk_classifier_service import (
    DECISION_APPROVAL_REQUIRED,
    DECISION_BLOCK,
    CapabilityRiskClassifierError,
    classify_gateway_browser_action_risk,
    classify_gateway_tool_risk,
)
from server_modules.runtime_common import require_api_key
from server_modules import (
    agent_approval_memory_service,
    dedicated_workstation_setup_service,
    gateway_browser_service,
    gateway_execution_service,
    gateway_approval_service,
    gateway_health_service,
    gateway_pairing_service,
    gateway_protocol_service,
    gateway_registry_service,
    gateway_state_repository,
    safe_mode_service,
    security_audit_service,
)


LOGGER = logging.getLogger(__name__)


router = APIRouter()


def _enforce_gateway_safety_gates(
    *,
    gateway_id: str,
    workspace_id: str,
    quota_profile: str,
    agent_id: str = "",
    tenant_id: str = "",
    capability_id: str = "",
) -> None:
    """Centralized safety enforcement for gateway endpoints.

    Checks kill switches and quotas before any gateway operation.
    Raises HTTPException with standardized error body on block.
    """
    try:
        assert_not_killed(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            gateway_id=gateway_id,
            agent_id=agent_id,
        )
    except KillSwitchBlockedError as exc:
        error = kill_switch_error(
            scope=exc.decision.scope,
            detail=exc.decision.detail,
            trace_id=exc.decision.trace_id,
        )
        raise HTTPException(
            status_code=to_http_status(error),
            detail=to_http_body(error),
        )

    if capability_id:
        disabled_state = safe_mode_service.resolve_capability_disable_state(
            capability_id,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            machine_id=gateway_id,
        )
        if bool(disabled_state.get("disabled")) and str(disabled_state.get("type") or "") == "kill_switch":
            error = kill_switch_error(
                scope=str(disabled_state.get("scope") or "workspace"),
                detail=str(disabled_state.get("reason") or "Gateway action blocked by kill switch."),
            )
            raise HTTPException(
                status_code=to_http_status(error),
                detail=to_http_body(error),
            )

    if quota_profile:
        decision = evaluate_gateway_quota(
            profile=quota_profile,
            gateway_id=gateway_id,
        )
        if not decision.allowed:
            error = quota_exceeded_error(
                profile=quota_profile,
                retry_after_seconds=decision.retry_after_seconds,
            )
            raise HTTPException(
                status_code=to_http_status(error),
                detail=to_http_body(error),
            )


def _audit_approval_bypass(
    *,
    gateway_id: str,
    capability_id: str,
    workspace_id: str,
    tenant_id: str,
) -> None:
    try:
        security_audit_service.emit_security_audit_event(
            action="gateway.approval_bypassed",
            status="logged",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            detail=f"Gateway action executed without interactive approval for capability {capability_id}.",
            metadata={
                "gateway_id": gateway_id,
                "capability_id": capability_id,
                "interactive_approvals": False,
            },
        )
    except Exception as exc:
        LOGGER.warning("Failed to emit gateway approval bypass audit for %s: %s", gateway_id, exc)


async def _gateway_approval_required_response(
    *,
    registration: Dict[str, Any],
    gateway_id: str,
    capability_id: str,
    arguments: Dict[str, Any],
    run_id: str,
    trace_id: str,
    request_id: Optional[str],
    risk_decision,
) -> JSONResponse:
    approval = await gateway_approval_service.request_gateway_tool_approval(
        registration=registration,
        capability_id=capability_id,
        arguments=arguments,
        run_id=run_id,
        trace_id=trace_id,
        request_id=str(request_id or "").strip() or None,
    )
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "status": "approval_required",
            "gateway_id": gateway_id,
            "approval": approval,
            "normalized_approval": approval.get("normalized_approval"),
            "risk_decision": risk_decision.as_dict(),
        },
    )


def _gateway_policy_from_registration(registration: Dict[str, Any]):
    metadata = registration.get("metadata") if isinstance(registration.get("metadata"), dict) else {}
    policy_payload = (
        metadata.get("agent_computer_policy")
        or metadata.get("computer_policy")
        or metadata.get("gateway_policy")
    )
    if isinstance(policy_payload, dict):
        return normalize_agent_computer_policy(policy_payload)
    gateway_token = str(registration.get("gateway_id") or "").strip() or "default"
    return build_default_agent_computer_policy(policy_id=f"gateway:{gateway_token}")


def _emit_gateway_approval_memory_used(
    *,
    gateway_id: str,
    workspace_id: str,
    tenant_id: str,
    rule,
) -> None:
    payload = rule.as_dict()
    try:
        security_audit_service.emit_security_audit_event(
            action="gateway.approval_memory.used",
            status="logged",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            detail=f"Gateway reused scoped approval memory for {rule.capability}.",
            metadata={
                "gateway_id": gateway_id,
                "approval_memory_rule": payload,
            },
        )
    except Exception as exc:
        LOGGER.warning("Failed to emit gateway approval memory audit for %s: %s", gateway_id, exc)
    try:
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=None,
            direction="server",
            frame_kind="audit",
            message_type="gateway.approval_memory.used",
            payload={
                "workspace_id": workspace_id,
                "approval_memory_rule": payload,
            },
        )
    except Exception as exc:
        LOGGER.warning("Failed to record gateway approval memory event for %s: %s", gateway_id, exc)


def _consume_gateway_approval_memory(
    *,
    registration: Dict[str, Any],
    workspace_id: str,
    tenant_id: str,
    actor_user_id: str,
    policy_id: str,
    risk_decision,
    payload: Dict[str, Any],
):
    rule = agent_approval_memory_service.consume_matching_approval_memory_rule(
        workspace_id=workspace_id,
        owner_user_id=actor_user_id,
        capability=risk_decision.capability,
        policy_id=policy_id,
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        payload=payload,
    )
    if rule is not None:
        _emit_gateway_approval_memory_used(
            gateway_id=str(registration.get("gateway_id") or "").strip(),
            workspace_id=workspace_id,
            tenant_id=tenant_id,
            rule=rule,
        )
    return rule


def _emit_gateway_risk_decision(
    *,
    gateway_id: str,
    workspace_id: str,
    tenant_id: str,
    risk_decision,
) -> None:
    payload = risk_decision.as_dict()
    try:
        security_audit_service.emit_security_audit_event(
            action=f"gateway.risk_decision.{risk_decision.decision}",
            status="blocked" if risk_decision.decision == DECISION_BLOCK else "logged",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            detail=f"Gateway risk decision {risk_decision.decision} for {risk_decision.capability}.",
            metadata={
                "gateway_id": gateway_id,
                "risk_decision": payload,
            },
        )
    except Exception as exc:
        LOGGER.warning("Failed to emit gateway risk decision audit for %s: %s", gateway_id, exc)
    try:
        gateway_state_repository.record_gateway_event(
            gateway_id=gateway_id,
            session_id=None,
            direction="server",
            frame_kind="audit",
            message_type=f"gateway.risk_decision.{risk_decision.decision}",
            payload={
                "workspace_id": workspace_id,
                "risk_decision": payload,
            },
        )
    except Exception as exc:
        LOGGER.warning("Failed to record gateway risk decision event for %s: %s", gateway_id, exc)


def _block_gateway_risk_decision(*, risk_decision) -> None:
    reason = risk_decision.blocked_reason or "Gateway action blocked by risk policy."
    raise HTTPException(
        status_code=403,
        detail={
            "error": "GATEWAY_RISK_BLOCKED",
            "reason": reason,
            "risk_decision": risk_decision.as_dict(),
        },
    )


def _remember_gateway_approval_if_requested(
    *,
    registration: Dict[str, Any],
    approval: Optional[Dict[str, Any]],
    body: "GatewayApprovalResolveRequest",
    actor_user_id: str,
    policy_id: str,
) -> Optional[Dict[str, Any]]:
    if not int(body.remember_for_seconds or 0):
        return None
    if str(body.decision or "").strip().lower() != "approved":
        return None
    if not isinstance(approval, dict):
        return None
    request_payload = approval.get("request_payload") if isinstance(approval.get("request_payload"), dict) else {}
    capability = str(request_payload.get("capability_id") or approval.get("capability_id") or "").strip()
    arguments = request_payload.get("arguments") if isinstance(request_payload.get("arguments"), dict) else {}
    rule = agent_approval_memory_service.create_approval_memory_rule_from_payload(
        workspace_id=str(registration.get("workspace_id") or "").strip() or "default",
        owner_user_id=actor_user_id,
        capability=capability,
        payload=arguments,
        ttl_seconds=int(body.remember_for_seconds or 0),
        policy_id=policy_id,
        gateway_id=str(registration.get("gateway_id") or "").strip(),
        remember_scope=body.remember_scope,
        reason=str(body.note or "").strip(),
    )
    return rule.as_dict()


class GatewayPairingIntentCreateRequest(BaseModel):
    workspace_id: Optional[str] = None
    ttl_seconds: Optional[int] = Field(
        default=None,
        ge=gateway_pairing_service.MIN_GATEWAY_PAIRING_TTL_SECONDS,
        le=gateway_pairing_service.MAX_GATEWAY_PAIRING_TTL_SECONDS,
    )
    display_name: Optional[str] = None
    platform: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GatewayRegistrationRequest(BaseModel):
    pairing_token: str = Field(min_length=1)
    device_id: str = Field(min_length=1)
    gateway_id: Optional[str] = None
    display_name: Optional[str] = None
    platform: Optional[str] = None
    capabilities: list[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GatewaySessionCreateRequest(BaseModel):
    gateway_id: str = Field(min_length=1)
    gateway_token: str = Field(min_length=1)
    session_ttl_seconds: Optional[int] = Field(default=None, ge=60, le=24 * 60 * 60)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GatewayRegistrationRevokeRequest(BaseModel):
    reason: Optional[str] = None


class DedicatedWorkstationBindRequest(BaseModel):
    workspace_id: Optional[str] = Field(default=None, min_length=1)
    policy_id: str = Field(min_length=1, max_length=160)
    machine_label: Optional[str] = Field(default=None, max_length=160)
    trace_id: Optional[str] = Field(default=None, max_length=200)


class DedicatedWorkstationControlRequest(BaseModel):
    workspace_id: Optional[str] = Field(default=None, min_length=1)
    reason: Optional[str] = Field(default=None, max_length=500)
    trace_id: Optional[str] = Field(default=None, max_length=200)


class GatewayToolExecuteRequest(BaseModel):
    capability_id: str = Field(min_length=1)
    arguments: Dict[str, Any] = Field(default_factory=dict)
    run_id: str = Field(min_length=1)
    trace_id: Optional[str] = None
    workspace_id: Optional[str] = None
    request_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)
    interactive_approvals: bool = True


class GatewayToolInterruptRequest(BaseModel):
    run_id: str = Field(min_length=1)
    trace_id: Optional[str] = None
    workspace_id: Optional[str] = None
    target_request_id: Optional[str] = None
    reason: Optional[str] = None
    request_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)


class GatewayApprovalResolveRequest(BaseModel):
    decision: str = Field(min_length=1)
    note: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)
    remember_for_seconds: Optional[int] = Field(default=None, ge=60, le=24 * 60 * 60)
    remember_scope: Dict[str, Any] = Field(default_factory=dict)


class GatewayBrowserSessionStartRequest(BaseModel):
    url: Optional[str] = None
    session_profile: Optional[str] = None
    session_mode: Optional[str] = None
    attach_endpoint_url: Optional[str] = None
    interactive_actions: list[str] = Field(default_factory=list)
    reviewed_approval_required: bool = False
    allow_cloud_fallback: bool = False
    run_id: str = Field(min_length=1)
    trace_id: Optional[str] = None
    workspace_id: Optional[str] = None
    request_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)
    interactive_approvals: bool = True


class GatewayBrowserActionRequest(BaseModel):
    action: str = Field(min_length=1)
    action_args: Dict[str, Any] = Field(default_factory=dict)
    reviewed_approval_required: Optional[bool] = None
    run_id: str = Field(min_length=1)
    trace_id: Optional[str] = None
    workspace_id: Optional[str] = None
    request_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)
    interactive_approvals: bool = True
    allow_cloud_fallback: bool = False


class GatewayBrowserSessionControlRequest(BaseModel):
    run_id: str = Field(min_length=1)
    trace_id: Optional[str] = None
    workspace_id: Optional[str] = None
    request_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=1, le=120)
    note: Optional[str] = None


def _accessible_gateway_registration(
    gateway_id: str,
    current_user,
    *,
    workspace_id: Optional[str] = None,
    minimum_role: str = "member",
) -> tuple[Dict[str, Any], str]:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        workspace_id or registration_workspace_id,
        minimum_role=minimum_role,
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    return registration, resolved_workspace_id


async def _shutdown_revoked_live_gateway_connection(gateway_id: str, *, reason: str) -> bool:
    get_connection = getattr(gateway_protocol_service, "_get_live_connection", None)
    unregister_connection = getattr(gateway_protocol_service, "_unregister_live_connection", None)
    if not callable(get_connection):
        return False
    connection = get_connection(gateway_id)
    if connection is None:
        return False
    session_id = str(getattr(connection, "session_id", "") or "").strip()
    websocket = getattr(connection, "websocket", None)
    if websocket is not None and hasattr(websocket, "close"):
        try:
            await websocket.close(code=4403, reason=reason)
        except Exception:
            pass
    if callable(unregister_connection):
        unregister_connection(gateway_id=gateway_id, session_id=session_id, reason=reason)
    return True


@router.post("/gateway/pairings/intents")
async def create_gateway_pairing_intent(
    body: Optional[GatewayPairingIntentCreateRequest] = None,
    current_user=Depends(require_api_key),
):
    payload = body or GatewayPairingIntentCreateRequest()
    workspace_id = enforce_workspace_access(
        current_user,
        payload.workspace_id or "default",
        minimum_role="member",
    )
    tenant_id = workspace_tenant_id(current_user, workspace_id)
    try:
        pairing = gateway_pairing_service.create_gateway_pairing_intent(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            user_id=str((current_user or {}).get("user_id") or "").strip() or "unknown-user",
            ttl_seconds=payload.ttl_seconds,
            display_name=payload.display_name,
            platform=payload.platform,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 429 if "too many pending gateway pairing requests" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return pairing


@router.post("/gateway/registrations")
async def register_gateway(body: GatewayRegistrationRequest):
    try:
        registration = gateway_pairing_service.register_gateway(
            pairing_token=body.pairing_token,
            device_id=body.device_id,
            gateway_id=body.gateway_id,
            display_name=body.display_name,
            platform=body.platform,
            capabilities=body.capabilities,
            metadata=body.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "gateway": gateway_registry_service.gateway_registration_public_payload(registration),
        "gateway_token": str(registration.get("gateway_token") or ""),
        "scope": gateway_registry_service.gateway_scope_payload(registration),
    }


@router.post("/gateway/sessions")
async def create_gateway_session(request: Request, body: GatewaySessionCreateRequest):
    try:
        return await gateway_registry_service.create_gateway_session(
            request,
            gateway_id=body.gateway_id,
            gateway_token=body.gateway_token,
            session_ttl_seconds=body.session_ttl_seconds,
            metadata=body.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/gateway/registrations")
async def list_gateway_registrations(
    workspace_id: str = Query(..., min_length=1),
    current_user=Depends(require_api_key),
):
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="viewer",
    )
    return gateway_registry_service.list_workspace_gateways(workspace_id=resolved_workspace_id)


@router.post("/gateway/registrations/{gateway_id}/rotate-token")
async def rotate_gateway_registration_token(
    gateway_id: str,
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        registration_workspace_id,
        minimum_role="owner",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        return gateway_registry_service.rotate_gateway_registration_token(
            gateway_id=gateway_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gateway/registrations/{gateway_id}/revoke")
async def revoke_gateway_registration(
    gateway_id: str,
    body: Optional[GatewayRegistrationRevokeRequest] = None,
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        registration_workspace_id,
        minimum_role="owner",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        revoked_payload = gateway_registry_service.revoke_gateway_registration(
            gateway_id=gateway_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            user_id=str((current_user or {}).get("user_id") or "").strip() or None,
            reason=str((body or GatewayRegistrationRevokeRequest()).reason or "").strip() or None,
        )
        revoked_payload["live_connection_shutdown"] = await _shutdown_revoked_live_gateway_connection(
            gateway_id,
            reason="registration revoked",
        )
        dedicated_workstation_setup_service.mark_dedicated_workstation_revoked(
            gateway_id=gateway_id,
            reason=str((body or GatewayRegistrationRevokeRequest()).reason or "").strip() or "Gateway registration revoked.",
            actor_user_id=str((current_user or {}).get("user_id") or "").strip(),
        )
        return revoked_payload
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gateway/registrations/{gateway_id}/dedicated-workstation/bind")
async def bind_dedicated_workstation(
    gateway_id: str,
    body: DedicatedWorkstationBindRequest,
    current_user=Depends(require_api_key),
):
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=body.workspace_id,
        minimum_role="owner",
    )
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        return dedicated_workstation_setup_service.bind_dedicated_workstation(
            gateway_id=gateway_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            user_id=str((current_user or {}).get("user_id") or registration.get("user_id") or "").strip(),
            policy_id=body.policy_id,
            machine_label=str(body.machine_label or "").strip(),
            trace_id=str(body.trace_id or "").strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/gateway/registrations/{gateway_id}/dedicated-workstation/readiness")
async def get_dedicated_workstation_readiness(
    gateway_id: str,
    workspace_id: Optional[str] = Query(default=None, min_length=1),
    trace_id: Optional[str] = Query(default=None, max_length=200),
    current_user=Depends(require_api_key),
):
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=workspace_id,
        minimum_role="viewer",
    )
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        return dedicated_workstation_setup_service.dedicated_workstation_readiness(
            gateway_id=gateway_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            user_id=str((current_user or {}).get("user_id") or registration.get("user_id") or "").strip(),
            trace_id=str(trace_id or "").strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gateway/registrations/{gateway_id}/dedicated-workstation/kill")
async def kill_dedicated_workstation(
    gateway_id: str,
    body: Optional[DedicatedWorkstationControlRequest] = None,
    current_user=Depends(require_api_key),
):
    payload = body or DedicatedWorkstationControlRequest()
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=payload.workspace_id,
        minimum_role="owner",
    )
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        response = dedicated_workstation_setup_service.kill_dedicated_workstation(
            gateway_id=gateway_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            user_id=str((current_user or {}).get("user_id") or registration.get("user_id") or "").strip(),
            reason=str(payload.reason or "").strip(),
            trace_id=str(payload.trace_id or "").strip(),
        )
        response["live_connection_shutdown"] = await _shutdown_revoked_live_gateway_connection(
            gateway_id,
            reason="dedicated workstation stopped",
        )
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gateway/registrations/{gateway_id}/dedicated-workstation/clear-kill")
async def clear_dedicated_workstation_kill(
    gateway_id: str,
    body: Optional[DedicatedWorkstationControlRequest] = None,
    current_user=Depends(require_api_key),
):
    payload = body or DedicatedWorkstationControlRequest()
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=payload.workspace_id,
        minimum_role="owner",
    )
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        return dedicated_workstation_setup_service.clear_dedicated_workstation_kill(
            gateway_id=gateway_id,
            tenant_id=tenant_id,
            workspace_id=resolved_workspace_id,
            user_id=str((current_user or {}).get("user_id") or registration.get("user_id") or "").strip(),
            trace_id=str(payload.trace_id or "").strip(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gateway/registrations/{gateway_id}/tools/execute")
async def execute_gateway_tool(
    gateway_id: str,
    body: GatewayToolExecuteRequest,
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        body.workspace_id or registration_workspace_id,
        minimum_role="member",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")

    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        quota_profile=GATEWAY_TOOL_EXECUTION,
        tenant_id=tenant_id,
        capability_id=body.capability_id,
    )

    try:
        gateway_policy = _gateway_policy_from_registration(registration)
        risk_decision = classify_gateway_tool_risk(
            policy=gateway_policy,
            capability_id=body.capability_id,
            arguments=body.arguments,
        )
    except CapabilityRiskClassifierError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _emit_gateway_risk_decision(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        tenant_id=tenant_id,
        risk_decision=risk_decision,
    )
    if risk_decision.decision == DECISION_BLOCK:
        _block_gateway_risk_decision(risk_decision=risk_decision)

    requires_owner_approval = gateway_approval_service.capability_requires_owner_approval(body.capability_id)
    remembered_approval_rule = None
    if risk_decision.decision == DECISION_APPROVAL_REQUIRED or requires_owner_approval:
        remembered_approval_rule = _consume_gateway_approval_memory(
            registration=registration,
            workspace_id=resolved_workspace_id,
            tenant_id=tenant_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or "user",
            policy_id=gateway_policy.policy_id,
            risk_decision=risk_decision,
            payload=body.arguments,
        )
    risk_requires_approval = risk_decision.decision == DECISION_APPROVAL_REQUIRED and remembered_approval_rule is None
    requires_owner_approval = requires_owner_approval and remembered_approval_rule is None
    if not body.interactive_approvals and not (requires_owner_approval or risk_requires_approval):
        _audit_approval_bypass(
            gateway_id=gateway_id,
            capability_id=body.capability_id,
            workspace_id=resolved_workspace_id,
            tenant_id=tenant_id,
        )

    if requires_owner_approval or risk_requires_approval:
        return await _gateway_approval_required_response(
            registration=registration,
            gateway_id=gateway_id,
            capability_id=body.capability_id,
            arguments=body.arguments,
            run_id=body.run_id,
            trace_id=str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id,
            request_id=str(body.request_id or "").strip() or None,
            risk_decision=risk_decision,
        )
    try:
        return await gateway_execution_service.execute_tool_via_gateway(
            gateway_id=gateway_id,
            capability_id=body.capability_id,
            arguments=body.arguments,
            run_id=body.run_id,
            trace_id=str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id,
            workspace_id=resolved_workspace_id,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/gateway/registrations/{gateway_id}/events")
async def list_gateway_registration_events(
    gateway_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        registration_workspace_id,
        minimum_role="viewer",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    items = gateway_state_repository.list_gateway_events(gateway_id, limit=limit)
    return {
        "gateway_id": gateway_id,
        "count": len(items),
        "items": items,
    }


@router.get("/gateway/registrations/{gateway_id}/approvals")
async def list_gateway_registration_approvals(
    gateway_id: str,
    approval_status: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        registration_workspace_id,
        minimum_role="viewer",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    return gateway_approval_service.list_gateway_tool_approvals(
        gateway_id=gateway_id,
        status=approval_status,
        limit=limit,
    )


@router.post("/gateway/registrations/{gateway_id}/approvals/{approval_id}/resolve")
async def resolve_gateway_registration_approval(
    gateway_id: str,
    approval_id: str,
    body: GatewayApprovalResolveRequest,
    current_user=Depends(require_api_key),
):
    registration, _resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        minimum_role="owner",
    )
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=_resolved_workspace_id,
        quota_profile=GATEWAY_APPROVAL_ACTION,
    )
    approval = gateway_state_repository.get_gateway_action_approval(approval_id)
    execute_fn = gateway_execution_service.execute_tool_via_gateway
    capability_id = str((approval or {}).get("capability_id") or "").strip()
    if capability_id.startswith("browser.session."):
        execute_fn = gateway_browser_service.execute_browser_capability_via_gateway
    actor_user_id = str((current_user or {}).get("user_id") or "").strip() or "user"
    gateway_policy = _gateway_policy_from_registration(registration)
    result = await gateway_approval_service.resolve_gateway_tool_approval(
        registration=registration,
        approval_id=approval_id,
        decision=body.decision,
        actor=actor_user_id,
        note=body.note,
        timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
        execute_fn=execute_fn,
    )
    if str(result.get("status") or "").strip() in {"approved", "executed"} and body.remember_for_seconds:
        try:
            remembered = _remember_gateway_approval_if_requested(
                registration=registration,
                approval=result.get("approval") if isinstance(result.get("approval"), dict) else approval,
                body=body,
                actor_user_id=actor_user_id,
                policy_id=gateway_policy.policy_id,
            )
            if remembered:
                result["approval_memory_rule"] = remembered
        except Exception as exc:
            result["approval_memory_error"] = str(exc)
    if str(result.get("status") or "").strip() == "retryable_error":
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=result)
    return result


@router.get("/gateway/registrations/{gateway_id}/browser/sessions")
async def list_gateway_browser_sessions(
    gateway_id: str,
    session_status: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    current_user=Depends(require_api_key),
):
    _registration, _resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        minimum_role="viewer",
    )
    items = gateway_state_repository.list_gateway_browser_sessions(
        gateway_id,
        status=session_status,
        limit=limit,
    )
    return {
        "gateway_id": gateway_id,
        "count": len(items),
        "items": items,
    }


@router.post("/gateway/registrations/{gateway_id}/browser/sessions")
async def start_gateway_browser_session(
    gateway_id: str,
    body: GatewayBrowserSessionStartRequest,
    current_user=Depends(require_api_key),
):
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=body.workspace_id,
        minimum_role="member",
    )
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        quota_profile=GATEWAY_BROWSER_SESSION,
    )
    trace_id = str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id
    session_mode = gateway_browser_service.normalize_browser_session_mode(body.session_mode)
    attach_endpoint_url = str(body.attach_endpoint_url or "").strip() or None
    reviewed_required = gateway_browser_service.browser_session_requires_reviewed_approval(
        session_mode=session_mode,
        attach_endpoint_url=attach_endpoint_url,
        reviewed_approval_required=bool(body.reviewed_approval_required),
    )
    plan_payload = {
        "url": str(body.url or "").strip() or None,
        "session_mode": session_mode,
        "attach_endpoint_configured": bool(attach_endpoint_url),
        "interactive_actions": list(body.interactive_actions or []),
    }
    browser_metadata = gateway_browser_service.build_gateway_browser_metadata(
        session_profile=body.session_profile,
        session_mode=session_mode,
        attach_endpoint_url=attach_endpoint_url,
        interactive_actions=body.interactive_actions,
        reviewed_approval_required=reviewed_required,
        plan_payload=plan_payload,
    )
    arguments = {
        "url": str(body.url or "").strip() or None,
        "session_profile": str(body.session_profile or "").strip() or None,
        "session_mode": session_mode,
        "attach_endpoint_url": attach_endpoint_url,
        "interactive_actions": list(body.interactive_actions or []),
        "browser_metadata": browser_metadata,
    }
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        gateway_policy = _gateway_policy_from_registration(registration)
        risk_decision = classify_gateway_browser_action_risk(
            policy=gateway_policy,
            browser_action="start",
            payload=arguments,
            reviewed_approval_required=reviewed_required,
        )
    except CapabilityRiskClassifierError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _emit_gateway_risk_decision(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        tenant_id=tenant_id,
        risk_decision=risk_decision,
    )
    if risk_decision.decision == DECISION_BLOCK:
        _block_gateway_risk_decision(risk_decision=risk_decision)
    browser_start_requires_approval = gateway_browser_service.browser_action_requires_owner_approval(
        None,
        reviewed_approval_required=reviewed_required,
    )
    remembered_approval_rule = None
    if risk_decision.decision == DECISION_APPROVAL_REQUIRED or browser_start_requires_approval:
        remembered_approval_rule = _consume_gateway_approval_memory(
            registration=registration,
            workspace_id=resolved_workspace_id,
            tenant_id=tenant_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or "user",
            policy_id=gateway_policy.policy_id,
            risk_decision=risk_decision,
            payload=arguments,
        )
    browser_start_requires_approval = browser_start_requires_approval and remembered_approval_rule is None
    risk_requires_approval = risk_decision.decision == DECISION_APPROVAL_REQUIRED and remembered_approval_rule is None
    if body.allow_cloud_fallback and not gateway_protocol_service.gateway_connection_is_live(gateway_id):
        fallback = await gateway_browser_service.build_cloud_browser_fallback_response(
            registration=registration,
            run_id=body.run_id,
            trace_id=trace_id,
            session_profile=body.session_profile,
            reason="Local gateway browser runtime is offline; cloud browser fallback prepared.",
        )
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=fallback)
    if (
        browser_start_requires_approval
        or risk_requires_approval
    ):
        return await _gateway_approval_required_response(
            registration=registration,
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_START_CAPABILITY,
            arguments=arguments,
            run_id=body.run_id,
            trace_id=trace_id,
            request_id=str(body.request_id or "").strip() or None,
            risk_decision=risk_decision,
        )
    try:
        response = await gateway_browser_service.execute_browser_capability_via_gateway(
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_START_CAPABILITY,
            arguments=arguments,
            run_id=body.run_id,
            trace_id=trace_id,
            workspace_id=resolved_workspace_id,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
        browser_status = str((response.get("browser_session") or {}).get("status") or response.get("status") or "").strip().lower()
        if browser_status in {"attach_required", "attach_failed", "not_attached"}:
            return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=response)
        return response
    except ValueError as exc:
        detail = str(exc)
        if body.allow_cloud_fallback and "not currently connected" in detail.lower():
            fallback = await gateway_browser_service.build_cloud_browser_fallback_response(
                registration=registration,
                run_id=body.run_id,
                trace_id=trace_id,
                session_profile=body.session_profile,
                reason=detail,
            )
            return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=fallback)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post("/gateway/registrations/{gateway_id}/browser/sessions/{browser_session_id}/actions")
async def execute_gateway_browser_action(
    gateway_id: str,
    browser_session_id: str,
    body: GatewayBrowserActionRequest,
    current_user=Depends(require_api_key),
):
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=body.workspace_id,
        minimum_role="member",
    )
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        quota_profile=GATEWAY_TOOL_EXECUTION,
    )
    browser_session = gateway_state_repository.get_gateway_browser_session(browser_session_id)
    if not browser_session or str(browser_session.get("gateway_id") or "").strip() != str(gateway_id or "").strip():
        raise HTTPException(status_code=404, detail="Gateway browser session was not found.")
    trace_id = str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id
    session_metadata = browser_session.get("metadata") if isinstance(browser_session.get("metadata"), dict) else {}
    session_mode = gateway_browser_service.normalize_browser_session_mode(session_metadata.get("browser_session_mode"))
    attach_endpoint_url = str(session_metadata.get("browser_attach_endpoint_url") or "").strip() or None
    reviewed_required = gateway_browser_service.browser_session_requires_reviewed_approval(
        session_mode=session_mode,
        attach_endpoint_url=attach_endpoint_url,
        reviewed_approval_required=(
            bool(body.reviewed_approval_required)
            if body.reviewed_approval_required is not None
            else bool(browser_session.get("reviewed_approval_required"))
        ),
    )
    browser_metadata = gateway_browser_service.build_gateway_browser_metadata(
        session_profile=browser_session.get("session_profile"),
        session_mode=session_mode,
        attach_endpoint_url=attach_endpoint_url,
        interactive_actions=[body.action],
        reviewed_approval_required=reviewed_required,
        reviewed_approved=bool(browser_session.get("reviewed_approved")),
        browser_session_id=browser_session_id,
        checkpoint=browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
        plan_payload={
            "action": str(body.action or "").strip(),
            "action_args": dict(body.action_args or {}),
        },
    )
    arguments = {
        "browser_session_id": browser_session_id,
        "session_mode": session_mode,
        "attach_endpoint_url": attach_endpoint_url,
        "action": str(body.action or "").strip(),
        "action_args": dict(body.action_args or {}),
        "browser_metadata": browser_metadata,
        "checkpoint": browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
    }
    tenant_id = workspace_tenant_id(current_user, resolved_workspace_id)
    try:
        gateway_policy = _gateway_policy_from_registration(registration)
        risk_decision = classify_gateway_browser_action_risk(
            policy=gateway_policy,
            browser_action=body.action,
            payload=arguments,
            reviewed_approval_required=reviewed_required,
        )
    except CapabilityRiskClassifierError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _emit_gateway_risk_decision(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        tenant_id=tenant_id,
        risk_decision=risk_decision,
    )
    if risk_decision.decision == DECISION_BLOCK:
        _block_gateway_risk_decision(risk_decision=risk_decision)
    browser_action_requires_approval = gateway_browser_service.browser_action_requires_owner_approval(
        body.action,
        reviewed_approval_required=reviewed_required,
    )
    remembered_approval_rule = None
    if risk_decision.decision == DECISION_APPROVAL_REQUIRED or browser_action_requires_approval:
        remembered_approval_rule = _consume_gateway_approval_memory(
            registration=registration,
            workspace_id=resolved_workspace_id,
            tenant_id=tenant_id,
            actor_user_id=str((current_user or {}).get("user_id") or "").strip() or "user",
            policy_id=gateway_policy.policy_id,
            risk_decision=risk_decision,
            payload=arguments,
        )
    browser_action_requires_approval = browser_action_requires_approval and remembered_approval_rule is None
    risk_requires_approval = risk_decision.decision == DECISION_APPROVAL_REQUIRED and remembered_approval_rule is None
    if body.allow_cloud_fallback and not gateway_protocol_service.gateway_connection_is_live(gateway_id):
        fallback = await gateway_browser_service.build_cloud_browser_fallback_response(
            registration=registration,
            run_id=body.run_id,
            trace_id=trace_id,
            session_profile=browser_session.get("session_profile"),
            reason="Local gateway browser runtime is offline; cloud browser fallback prepared.",
            checkpoint=browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
        )
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=fallback)
    if (
        browser_action_requires_approval
        or risk_requires_approval
    ):
        return await _gateway_approval_required_response(
            registration=registration,
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_ACTION_CAPABILITY,
            arguments=arguments,
            run_id=body.run_id,
            trace_id=trace_id,
            request_id=str(body.request_id or "").strip() or None,
            risk_decision=risk_decision,
        )
    try:
        response = await gateway_browser_service.execute_browser_capability_via_gateway(
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_ACTION_CAPABILITY,
            arguments=arguments,
            run_id=body.run_id,
            trace_id=trace_id,
            workspace_id=resolved_workspace_id,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
        browser_status = str((response.get("browser_session") or {}).get("status") or response.get("status") or "").strip().lower()
        if browser_status in {"attach_required", "attach_failed", "not_attached"}:
            return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=response)
        return response
    except ValueError as exc:
        detail = str(exc)
        if body.allow_cloud_fallback and "not currently connected" in detail.lower():
            fallback = await gateway_browser_service.build_cloud_browser_fallback_response(
                registration=registration,
                run_id=body.run_id,
                trace_id=trace_id,
                session_profile=browser_session.get("session_profile"),
                reason=detail,
                checkpoint=browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
            )
            return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=fallback)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post("/gateway/registrations/{gateway_id}/browser/sessions/{browser_session_id}/takeover")
async def takeover_gateway_browser_session(
    gateway_id: str,
    browser_session_id: str,
    body: GatewayBrowserSessionControlRequest,
    current_user=Depends(require_api_key),
):
    _browser_session = gateway_state_repository.get_gateway_browser_session(browser_session_id)
    if not _browser_session or str(_browser_session.get("gateway_id") or "").strip() != str(gateway_id or "").strip():
        raise HTTPException(status_code=404, detail="Gateway browser session was not found.")
    _registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=body.workspace_id,
        minimum_role="member",
    )
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        quota_profile=GATEWAY_TOOL_EXECUTION,
    )
    trace_id = str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id
    try:
        return await gateway_browser_service.execute_browser_capability_via_gateway(
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_TAKEOVER_CAPABILITY,
            arguments={"browser_session_id": browser_session_id, "note": str(body.note or "").strip() or None},
            run_id=body.run_id,
            trace_id=trace_id,
            workspace_id=resolved_workspace_id,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post("/gateway/registrations/{gateway_id}/browser/sessions/{browser_session_id}/resume")
async def resume_gateway_browser_session(
    gateway_id: str,
    browser_session_id: str,
    body: GatewayBrowserSessionControlRequest,
    current_user=Depends(require_api_key),
):
    browser_session = gateway_state_repository.get_gateway_browser_session(browser_session_id)
    if not browser_session or str(browser_session.get("gateway_id") or "").strip() != str(gateway_id or "").strip():
        raise HTTPException(status_code=404, detail="Gateway browser session was not found.")
    registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=body.workspace_id,
        minimum_role="member",
    )
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        quota_profile=GATEWAY_BROWSER_SESSION,
    )
    trace_id = str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id
    session_metadata = browser_session.get("metadata") if isinstance(browser_session.get("metadata"), dict) else {}
    session_mode = gateway_browser_service.normalize_browser_session_mode(session_metadata.get("browser_session_mode"))
    attach_endpoint_url = str(session_metadata.get("browser_attach_endpoint_url") or "").strip() or None
    if not gateway_protocol_service.gateway_connection_is_live(gateway_id):
        fallback = await gateway_browser_service.build_cloud_browser_fallback_response(
            registration=registration,
            run_id=body.run_id,
            trace_id=trace_id,
            session_profile=browser_session.get("session_profile"),
            reason="Local gateway browser runtime is offline; cloud browser fallback prepared.",
            checkpoint=browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
        )
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=fallback)
    try:
        response = await gateway_browser_service.execute_browser_capability_via_gateway(
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_RESUME_CAPABILITY,
            arguments={
                "browser_session_id": browser_session_id,
                "session_mode": session_mode,
                "attach_endpoint_url": attach_endpoint_url,
                "checkpoint": browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
            },
            run_id=body.run_id,
            trace_id=trace_id,
            workspace_id=resolved_workspace_id,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
        browser_status = str((response.get("browser_session") or {}).get("status") or response.get("status") or "").strip().lower()
        if browser_status in {"attach_required", "attach_failed", "not_attached"}:
            return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=response)
        return response
    except ValueError as exc:
        detail = str(exc)
        if "not currently connected" in detail.lower():
            fallback = await gateway_browser_service.build_cloud_browser_fallback_response(
                registration=registration,
                run_id=body.run_id,
                trace_id=trace_id,
                session_profile=browser_session.get("session_profile"),
                reason=detail,
                checkpoint=browser_session.get("checkpoint") if isinstance(browser_session.get("checkpoint"), dict) else {},
            )
            return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=fallback)
        raise HTTPException(status_code=400, detail=detail) from exc


@router.post("/gateway/registrations/{gateway_id}/browser/sessions/{browser_session_id}/interrupt")
async def interrupt_gateway_browser_session(
    gateway_id: str,
    browser_session_id: str,
    body: GatewayBrowserSessionControlRequest,
    current_user=Depends(require_api_key),
):
    browser_session = gateway_state_repository.get_gateway_browser_session(browser_session_id)
    if not browser_session or str(browser_session.get("gateway_id") or "").strip() != str(gateway_id or "").strip():
        raise HTTPException(status_code=404, detail="Gateway browser session was not found.")
    _registration, resolved_workspace_id = _accessible_gateway_registration(
        gateway_id,
        current_user,
        workspace_id=body.workspace_id,
        minimum_role="member",
    )
    _enforce_gateway_safety_gates(
        gateway_id=gateway_id,
        workspace_id=resolved_workspace_id,
        quota_profile=GATEWAY_TOOL_EXECUTION,
    )
    trace_id = str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id
    try:
        return await gateway_browser_service.execute_browser_capability_via_gateway(
            gateway_id=gateway_id,
            capability_id=gateway_browser_service.BROWSER_SESSION_INTERRUPT_CAPABILITY,
            arguments={
                "browser_session_id": browser_session_id,
                "note": str(body.note or "").strip() or None,
            },
            run_id=body.run_id,
            trace_id=trace_id,
            workspace_id=resolved_workspace_id,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/gateway/registrations/{gateway_id}/doctor")
async def get_gateway_registration_doctor(
    gateway_id: str,
    force_provider_probe: bool = Query(False),
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        registration_workspace_id,
        minimum_role="viewer",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    try:
        return gateway_health_service.gateway_doctor_payload(
            gateway_id,
            force_provider_probe=bool(force_provider_probe),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gateway/registrations/{gateway_id}/tools/interrupt")
async def interrupt_gateway_tool(
    gateway_id: str,
    body: GatewayToolInterruptRequest,
    current_user=Depends(require_api_key),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        body.workspace_id or registration_workspace_id,
        minimum_role="member",
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    try:
        return await gateway_execution_service.interrupt_tool_via_gateway(
            gateway_id=gateway_id,
            run_id=body.run_id,
            trace_id=str(body.trace_id or body.request_id or body.run_id).strip() or body.run_id,
            workspace_id=resolved_workspace_id,
            target_request_id=str(body.target_request_id or "").strip() or None,
            reason=str(body.reason or "").strip() or None,
            timeout_seconds=int(body.timeout_seconds or gateway_protocol_service.DEFAULT_TOOL_REQUEST_TIMEOUT_SECONDS),
            request_id=str(body.request_id or "").strip() or None,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.websocket("/gateway/ws")
async def gateway_websocket(
    websocket: WebSocket,
    gateway_id: str = Query(..., min_length=1),
    session_token: str = Query(..., min_length=1),
):
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    workspace_id = str((registration or {}).get("workspace_id") or "").strip() or "default"
    try:
        _enforce_gateway_safety_gates(
            gateway_id=gateway_id,
            workspace_id=workspace_id,
            quota_profile=GATEWAY_WS_CONNECTION,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"error": {"code": "GATEWAY_BLOCKED"}}
        code = str((detail.get("error") or {}).get("code") or "GATEWAY_BLOCKED") if isinstance(detail, dict) else "GATEWAY_BLOCKED"
        await websocket.close(code=4403, reason=code[:120])
        return
    await gateway_protocol_service.handle_gateway_websocket(
        websocket,
        gateway_id=gateway_id,
        session_token=session_token,
    )
