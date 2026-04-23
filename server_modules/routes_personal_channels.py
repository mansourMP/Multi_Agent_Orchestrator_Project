from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server_modules.auth import enforce_workspace_access
from server_modules.runtime_common import require_api_key
from server_modules import channel_lane_contract_service, gateway_state_repository, personal_channels_service


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
        return await personal_channels_service.configure_whatsapp_personal_gateway(
            gateway_id=gateway_id,
            registration=registration,
            phone_number=body.phone_number,
            custom_pairing_code=body.custom_pairing_code,
        )
    except ValueError as exc:
        detail = str(exc)
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
        return await personal_channels_service.send_whatsapp_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            remote_jid=body.remote_jid,
            text=body.text,
            idempotency_key=body.idempotency_key,
            reply_to_external_message_id=body.reply_to_external_message_id,
        )
    except ValueError as exc:
        detail = str(exc)
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
        return await personal_channels_service.configure_telegram_personal_gateway(
            gateway_id=gateway_id,
            registration=registration,
            api_id=body.api_id,
            api_hash=body.api_hash,
            phone_number=body.phone_number,
            login_code=body.login_code,
            password=body.password,
        )
    except ValueError as exc:
        detail = str(exc)
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
        return await personal_channels_service.send_telegram_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            remote_jid=body.remote_jid,
            text=body.text,
            idempotency_key=body.idempotency_key,
            reply_to_external_message_id=body.reply_to_external_message_id,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "not currently connected" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
