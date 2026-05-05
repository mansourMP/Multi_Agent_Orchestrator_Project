from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server_modules.auth import enforce_workspace_access
from server_modules.runtime_common import require_api_key
from server_modules import (
    channel_lane_contract_service,
    gateway_state_repository,
    personal_channels_service,
    security_audit_service,
)


router = APIRouter()


class PersonalOutboundRequest(BaseModel):
    remote_jid: str = Field(min_length=1)
    text: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=1)
    reply_to_external_message_id: Optional[str] = None


class WhatsAppPersonalSetupRequest(BaseModel):
    phone_number: Optional[str] = None
    custom_pairing_code: Optional[str] = None


class TelegramPersonalSetupRequest(BaseModel):
    api_id: Optional[int] = Field(default=None, ge=1)
    api_hash: Optional[str] = None
    phone_number: Optional[str] = None
    login_code: Optional[str] = None
    password: Optional[str] = None


def _personal_channel_governance_metadata(action: str, channel_key: str) -> dict:
    normalized_action = str(action or "").strip().lower()
    if normalized_action.endswith(".configure"):
        return {
            "action_class": "credential_change",
            "risk_level": "high",
            "governance_boundary": "paired_gateway",
            "requires_approval": False,
            "external_side_effect": False,
        }
    if normalized_action.endswith(".send"):
        return {
            "action_class": "channel_send",
            "risk_level": "critical",
            "governance_boundary": "paired_gateway",
            "requires_approval": True,
            "external_side_effect": True,
        }
    return {
        "action_class": f"{channel_key}_action",
        "risk_level": "moderate",
        "governance_boundary": "paired_gateway",
        "requires_approval": False,
        "external_side_effect": False,
    }


def _require_accessible_gateway_registration(
    gateway_id: str,
    current_user,
    *,
    minimum_role: str,
) -> dict:
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    registration_workspace_id = str(registration.get("workspace_id") or "").strip() or "default"
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        registration_workspace_id,
        minimum_role=minimum_role,
    )
    if resolved_workspace_id != registration_workspace_id:
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    return registration


def _emit_personal_channel_audit(
    *,
    action: str,
    status: str,
    registration: dict,
    current_user,
    gateway_id: str,
    channel_key: str,
    detail: str,
    metadata: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
) -> None:
    security_audit_service.emit_security_audit_event(
        action=action,
        status=status,
        tenant_id=str(registration.get("tenant_id") or "").strip() or None,
        workspace_id=str(registration.get("workspace_id") or "").strip() or None,
        current_user=current_user if isinstance(current_user, dict) else None,
        channel=channel_key,
        machine_id=str(gateway_id or "").strip() or None,
        detail=detail,
        metadata={
            "gateway_id": str(gateway_id or "").strip(),
            "channel_key": channel_key,
            **_personal_channel_governance_metadata(action, channel_key),
            **dict(metadata or {}),
        },
        idempotency_key=idempotency_key,
    )


@router.get("/personal-channels/whatsapp/gateways/{gateway_id}")
async def get_whatsapp_personal_gateway_status(
    request: Request,
    gateway_id: str,
    current_user=Depends(require_api_key),
):
    channel_lane_contract_service.assert_personal_route_path(str(request.url.path))
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        str(registration.get("workspace_id") or "").strip() or "default",
        minimum_role="viewer",
    )
    if resolved_workspace_id != str(registration.get("workspace_id") or "").strip():
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    return personal_channels_service.get_whatsapp_gateway_view(gateway_id)


@router.post("/personal-channels/whatsapp/gateways/{gateway_id}/setup")
async def configure_whatsapp_personal_gateway(
    request: Request,
    gateway_id: str,
    body: WhatsAppPersonalSetupRequest,
    current_user=Depends(require_api_key),
):
    channel_lane_contract_service.assert_personal_route_path(str(request.url.path))
    registration = _require_accessible_gateway_registration(
        gateway_id,
        current_user,
        minimum_role="member",
    )
    try:
        result = await personal_channels_service.configure_whatsapp_personal_gateway(
            gateway_id=gateway_id,
            registration=registration,
            phone_number=body.phone_number,
            custom_pairing_code=body.custom_pairing_code,
        )
        _emit_personal_channel_audit(
            action="personal_channel.whatsapp.configure",
            status="success",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="whatsapp_personal",
            detail="WhatsApp personal channel setup was requested for a paired gateway.",
            metadata={
                "has_phone_number": bool(str(body.phone_number or "").strip()),
                "has_custom_pairing_code": bool(str(body.custom_pairing_code or "").strip()),
            },
        )
        return result
    except ValueError as exc:
        detail = str(exc)
        _emit_personal_channel_audit(
            action="personal_channel.whatsapp.configure",
            status="denied",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="whatsapp_personal",
            detail=detail,
            metadata={
                "has_phone_number": bool(str(body.phone_number or "").strip()),
                "has_custom_pairing_code": bool(str(body.custom_pairing_code or "").strip()),
            },
        )
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post("/personal-channels/whatsapp/gateways/{gateway_id}/messages")
async def send_whatsapp_personal_message(
    request: Request,
    gateway_id: str,
    body: PersonalOutboundRequest,
    current_user=Depends(require_api_key),
):
    channel_lane_contract_service.assert_personal_route_path(str(request.url.path))
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        str(registration.get("workspace_id") or "").strip() or "default",
        minimum_role="member",
    )
    if resolved_workspace_id != str(registration.get("workspace_id") or "").strip():
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    try:
        result = await personal_channels_service.send_whatsapp_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            remote_jid=body.remote_jid,
            text=body.text,
            idempotency_key=body.idempotency_key,
            reply_to_external_message_id=body.reply_to_external_message_id,
        )
        _emit_personal_channel_audit(
            action="personal_channel.whatsapp.send",
            status="success",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="whatsapp_personal",
            detail="A WhatsApp personal test or manual message was dispatched through the paired gateway.",
            metadata={
                "remote_jid": body.remote_jid,
                "text_length": len(body.text),
                "has_reply_target": bool(body.reply_to_external_message_id),
            },
            idempotency_key=f"personal_channel.whatsapp.send:{gateway_id}:{body.idempotency_key}",
        )
        return result
    except ValueError as exc:
        detail = str(exc)
        _emit_personal_channel_audit(
            action="personal_channel.whatsapp.send",
            status="denied",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="whatsapp_personal",
            detail=detail,
            metadata={
                "remote_jid": body.remote_jid,
                "text_length": len(body.text),
                "has_reply_target": bool(body.reply_to_external_message_id),
            },
            idempotency_key=f"personal_channel.whatsapp.send.denied:{gateway_id}:{body.idempotency_key}",
        )
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/personal-channels/telegram/gateways/{gateway_id}")
async def get_telegram_personal_gateway_status(
    request: Request,
    gateway_id: str,
    current_user=Depends(require_api_key),
):
    channel_lane_contract_service.assert_personal_route_path(str(request.url.path))
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        str(registration.get("workspace_id") or "").strip() or "default",
        minimum_role="viewer",
    )
    if resolved_workspace_id != str(registration.get("workspace_id") or "").strip():
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    return personal_channels_service.get_telegram_gateway_view(gateway_id)


@router.post("/personal-channels/telegram/gateways/{gateway_id}/setup")
async def configure_telegram_personal_gateway(
    request: Request,
    gateway_id: str,
    body: TelegramPersonalSetupRequest,
    current_user=Depends(require_api_key),
):
    channel_lane_contract_service.assert_personal_route_path(str(request.url.path))
    registration = _require_accessible_gateway_registration(
        gateway_id,
        current_user,
        minimum_role="member",
    )
    try:
        result = await personal_channels_service.configure_telegram_personal_gateway(
            gateway_id=gateway_id,
            registration=registration,
            api_id=body.api_id,
            api_hash=body.api_hash,
            phone_number=body.phone_number,
            login_code=body.login_code,
            password=body.password,
        )
        _emit_personal_channel_audit(
            action="personal_channel.telegram.configure",
            status="success",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="telegram_personal",
            detail="Telegram personal channel setup was requested for a paired gateway.",
            metadata={
                "has_api_id": body.api_id is not None,
                "has_api_hash": bool(str(body.api_hash or "").strip()),
                "has_phone_number": bool(str(body.phone_number or "").strip()),
                "has_login_code": bool(str(body.login_code or "").strip()),
                "has_password": bool(str(body.password or "").strip()),
            },
        )
        return result
    except ValueError as exc:
        detail = str(exc)
        _emit_personal_channel_audit(
            action="personal_channel.telegram.configure",
            status="denied",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="telegram_personal",
            detail=detail,
            metadata={
                "has_api_id": body.api_id is not None,
                "has_api_hash": bool(str(body.api_hash or "").strip()),
                "has_phone_number": bool(str(body.phone_number or "").strip()),
                "has_login_code": bool(str(body.login_code or "").strip()),
                "has_password": bool(str(body.password or "").strip()),
            },
        )
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post("/personal-channels/telegram/gateways/{gateway_id}/messages")
async def send_telegram_personal_message(
    request: Request,
    gateway_id: str,
    body: PersonalOutboundRequest,
    current_user=Depends(require_api_key),
):
    channel_lane_contract_service.assert_personal_route_path(str(request.url.path))
    registration = gateway_state_repository.get_gateway_registration(gateway_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Gateway registration was not found.")
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        str(registration.get("workspace_id") or "").strip() or "default",
        minimum_role="member",
    )
    if resolved_workspace_id != str(registration.get("workspace_id") or "").strip():
        raise HTTPException(status_code=403, detail="Workspace is not accessible for this user.")
    try:
        result = await personal_channels_service.send_telegram_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            remote_jid=body.remote_jid,
            text=body.text,
            idempotency_key=body.idempotency_key,
            reply_to_external_message_id=body.reply_to_external_message_id,
        )
        _emit_personal_channel_audit(
            action="personal_channel.telegram.send",
            status="success",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="telegram_personal",
            detail="A Telegram personal test or manual message was dispatched through the paired gateway.",
            metadata={
                "remote_jid": body.remote_jid,
                "text_length": len(body.text),
                "has_reply_target": bool(body.reply_to_external_message_id),
            },
            idempotency_key=f"personal_channel.telegram.send:{gateway_id}:{body.idempotency_key}",
        )
        return result
    except ValueError as exc:
        detail = str(exc)
        _emit_personal_channel_audit(
            action="personal_channel.telegram.send",
            status="denied",
            registration=registration,
            current_user=current_user,
            gateway_id=gateway_id,
            channel_key="telegram_personal",
            detail=detail,
            metadata={
                "remote_jid": body.remote_jid,
                "text_length": len(body.text),
                "has_reply_target": bool(body.reply_to_external_message_id),
            },
            idempotency_key=f"personal_channel.telegram.send.denied:{gateway_id}:{body.idempotency_key}",
        )
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
