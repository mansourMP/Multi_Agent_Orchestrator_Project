from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

from server_modules import (
    channel_blocking_policy_service,
    channel_lane_contract_service,
    gateway_execution_service,
    personal_channel_sage_bridge_service,
    personal_channels_repository,
    security_audit_service,
)


WHATSAPP_PERSONAL_CHANNEL_KEY = "whatsapp_personal"
WHATSAPP_PERSONAL_PROVIDER = channel_lane_contract_service.assert_personal_gateway_channel(
    WHATSAPP_PERSONAL_CHANNEL_KEY
)["provider"]
TELEGRAM_PERSONAL_CHANNEL_KEY = "telegram_personal"
TELEGRAM_PERSONAL_PROVIDER = channel_lane_contract_service.assert_personal_gateway_channel(
    TELEGRAM_PERSONAL_CHANNEL_KEY
)["provider"]

TELEGRAM_PERSONAL_CONFIGURE_CAPABILITY = "channel.telegram.personal.configure"
WHATSAPP_PERSONAL_CONFIGURE_CAPABILITY = "channel.whatsapp.personal.configure"
WHATSAPP_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX = "whatsapp_personal:noreply:"
TELEGRAM_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX = "telegram_personal:noreply:"


def _sender_role_from_message(message: Dict[str, Any]) -> Optional[str]:
    metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
    for candidate in (
        message.get("sender_role"),
        message.get("role"),
        metadata.get("sender_role"),
        metadata.get("role"),
    ):
        token = str(candidate or "").strip().lower()
        if token:
            return token
    return None


def _emit_automatic_reply_audit(
    *,
    action: str,
    status: str,
    registration: Dict[str, Any],
    gateway_id: str,
    channel_key: str,
    provider: str,
    detail: str,
    metadata: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> None:
    security_audit_service.emit_security_audit_event(
        action=action,
        status=status,
        tenant_id=str(registration.get("tenant_id") or "").strip() or None,
        workspace_id=str(registration.get("workspace_id") or "").strip() or None,
        actor_user_id=str(registration.get("user_id") or "").strip() or None,
        actor_auth_type="paired_gateway",
        channel=channel_key,
        machine_id=str(gateway_id or "").strip() or None,
        detail=detail,
        metadata={
            "gateway_id": str(gateway_id or "").strip(),
            "channel_key": channel_key,
            "provider": provider,
            "action_class": "automatic_inbound_reply",
            "risk_level": "critical",
            "governance_boundary": "paired_gateway",
            "requires_approval": False,
            "external_side_effect": True,
            **dict(metadata or {}),
        },
        idempotency_key=idempotency_key,
    )


def _control_command_block_result(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    inbound: Dict[str, Any],
    channel_key: str,
    provider: str,
    external_message_id: str,
    remote_jid: str,
    text: str,
    sender_role: Optional[str],
    duplicate: bool,
    no_reply_prefix: str,
) -> Optional[Dict[str, Any]]:
    command_check = channel_blocking_policy_service.check_personal_channel_control_command(
        text=text,
        sender_role=sender_role,
    )
    if not command_check or not bool(command_check.get("blocked")):
        return None
    no_reply_idempotency_key = f"{no_reply_prefix}command_blocked:{external_message_id}"
    refreshed_inbound = personal_channels_repository.mark_inbound_processed(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        external_message_id=external_message_id,
        reply_idempotency_key=no_reply_idempotency_key,
    )
    _emit_automatic_reply_audit(
        action=f"personal_channel.{channel_key.split('_', 1)[0]}.control_command",
        status="denied",
        registration=registration,
        gateway_id=gateway_id,
        channel_key=channel_key,
        provider=provider,
        detail="Personal-channel control command was blocked before reaching the model.",
        metadata={
            "remote_jid": remote_jid,
            "inbound_external_message_id": external_message_id,
            "command": command_check.get("command"),
            "sender_role": sender_role,
            "policy_reason": command_check.get("reason"),
        },
        idempotency_key=f"personal_channel.control_command.denied:{gateway_id}:{channel_key}:{external_message_id}",
    )
    return {
        "duplicate": duplicate,
        "inbound": refreshed_inbound or inbound,
        "outbound": None,
        "blocked": True,
        "policy": command_check,
    }


def sync_gateway_personal_channel_state(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    personal_channels = payload.get("personal_channels") if isinstance(payload.get("personal_channels"), dict) else {}
    synced_state: Optional[Dict[str, Any]] = None
    whatsapp_state = (
        personal_channels.get(WHATSAPP_PERSONAL_CHANNEL_KEY)
        if isinstance(personal_channels.get(WHATSAPP_PERSONAL_CHANNEL_KEY), dict)
        else {}
    )
    if whatsapp_state:
        whatsapp_spec = channel_lane_contract_service.assert_personal_gateway_channel(
            WHATSAPP_PERSONAL_CHANNEL_KEY,
            str(whatsapp_state.get("provider") or WHATSAPP_PERSONAL_PROVIDER).strip() or WHATSAPP_PERSONAL_PROVIDER,
        )
        synced_state = personal_channels_repository.upsert_whatsapp_state(
            gateway_id=str(gateway_id or "").strip(),
            tenant_id=str(registration.get("tenant_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            user_id=str(registration.get("user_id") or "").strip(),
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            provider=whatsapp_spec["provider"],
            status=str(whatsapp_state.get("status") or "idle").strip() or "idle",
            qr_code=str(whatsapp_state.get("qr_code") or "").strip() or None,
            linked_jid=str(whatsapp_state.get("linked_jid") or "").strip() or None,
            linked_name=str(whatsapp_state.get("linked_name") or "").strip() or None,
            connected_at=str(whatsapp_state.get("connected_at") or "").strip() or None,
            metadata={
                "retryable": bool(whatsapp_state.get("retryable")),
                "login_hint": str(whatsapp_state.get("login_hint") or "").strip() or None,
                "pairing_code": str(whatsapp_state.get("pairing_code") or "").strip() or None,
                "pairing_code_generated_at": str(
                    whatsapp_state.get("pairing_code_generated_at") or ""
                ).strip()
                or None,
                "last_disconnect_reason": str(whatsapp_state.get("last_disconnect_reason") or "").strip() or None,
                "last_disconnect_code": whatsapp_state.get("last_disconnect_code"),
                "updated_at": whatsapp_state.get("updated_at"),
            },
        )
    telegram_state = (
        personal_channels.get(TELEGRAM_PERSONAL_CHANNEL_KEY)
        if isinstance(personal_channels.get(TELEGRAM_PERSONAL_CHANNEL_KEY), dict)
        else {}
    )
    if telegram_state:
        telegram_spec = channel_lane_contract_service.assert_personal_gateway_channel(
            TELEGRAM_PERSONAL_CHANNEL_KEY,
            str(telegram_state.get("provider") or TELEGRAM_PERSONAL_PROVIDER).strip() or TELEGRAM_PERSONAL_PROVIDER,
        )
        synced_state = personal_channels_repository.upsert_telegram_state(
            gateway_id=str(gateway_id or "").strip(),
            tenant_id=str(registration.get("tenant_id") or "").strip(),
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            user_id=str(registration.get("user_id") or "").strip(),
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            provider=telegram_spec["provider"],
            status=str(telegram_state.get("status") or "idle").strip() or "idle",
            login_hint=str(telegram_state.get("login_hint") or "").strip() or None,
            linked_user_id=str(telegram_state.get("linked_user_id") or "").strip() or None,
            linked_username=str(telegram_state.get("linked_username") or "").strip() or None,
            linked_phone=str(telegram_state.get("linked_phone") or "").strip() or None,
            linked_name=str(telegram_state.get("linked_name") or "").strip() or None,
            connected_at=str(telegram_state.get("connected_at") or "").strip() or None,
            metadata={
                "retryable": bool(telegram_state.get("retryable")),
                "last_disconnect_reason": str(telegram_state.get("last_disconnect_reason") or "").strip() or None,
                "last_disconnect_code": telegram_state.get("last_disconnect_code"),
                "updated_at": telegram_state.get("updated_at"),
            },
        )
    return synced_state


def sync_gateway_channel_outbound_result(
    *,
    gateway_id: str,
    payload: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    channel_key = str(payload.get("channel_key") or "").strip()
    if not channel_key:
        return None
    channel_lane_contract_service.assert_personal_gateway_channel(
        channel_key,
        str(payload.get("provider") or "").strip() or None,
    )
    idempotency_key = str(payload.get("idempotency_key") or "").strip()
    if not idempotency_key:
        return None
    if bool(payload.get("delivered")):
        return personal_channels_repository.mark_outbound_delivered(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=channel_key,
            idempotency_key=idempotency_key,
            external_message_id=str(payload.get("external_message_id") or "").strip() or None,
            metadata={"dispatch_result": dict(payload or {})},
        )
    return personal_channels_repository.get_outbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        idempotency_key=idempotency_key,
    )


async def handle_gateway_channel_inbound(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    channel_key = str(payload.get("channel_key") or "").strip()
    channel_lane_contract_service.assert_personal_gateway_channel(
        channel_key,
        str(payload.get("provider") or "").strip() or None,
    )
    if channel_key == WHATSAPP_PERSONAL_CHANNEL_KEY:
        return await _handle_whatsapp_gateway_channel_inbound(
            gateway_id=gateway_id,
            registration=registration,
            payload=payload,
        )
    if channel_key == TELEGRAM_PERSONAL_CHANNEL_KEY:
        return await _handle_telegram_gateway_channel_inbound(
            gateway_id=gateway_id,
            registration=registration,
            payload=payload,
        )
    raise ValueError(f"Unsupported personal channel key: {channel_key}")


async def _deliver_whatsapp_personal_reply(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    inbound: Dict[str, Any],
    remote_jid: str,
    external_message_id: str,
    text: str,
    push_name: Optional[str],
    duplicate: bool,
) -> Dict[str, Any]:
    reply_idempotency_key = str(inbound.get("reply_idempotency_key") or "").strip() or None
    if reply_idempotency_key and reply_idempotency_key.startswith(WHATSAPP_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX):
        return {"duplicate": duplicate, "inbound": inbound, "outbound": None}

    outbound: Optional[Dict[str, Any]] = None
    idempotency_key = reply_idempotency_key or f"whatsapp_personal:{external_message_id}"
    if reply_idempotency_key:
        outbound = personal_channels_repository.get_outbound_message(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            idempotency_key=reply_idempotency_key,
        )
    if outbound and str(outbound.get("status") or "").strip() == "delivered":
        personal_channels_repository.mark_inbound_processed(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            external_message_id=external_message_id,
            reply_idempotency_key=idempotency_key,
        )
        return {"duplicate": duplicate, "inbound": inbound, "outbound": outbound}

    if outbound is None:
        reply = personal_channel_sage_bridge_service.build_whatsapp_personal_reply(
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            gateway_id=str(gateway_id or "").strip(),
            remote_jid=remote_jid,
            text=text,
            push_name=push_name,
        )
        if not reply or not str(reply.get("text") or "").strip():
            no_reply_idempotency_key = f"{WHATSAPP_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX}{external_message_id}"
            refreshed_inbound = personal_channels_repository.mark_inbound_processed(
                gateway_id=str(gateway_id or "").strip(),
                channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
                external_message_id=external_message_id,
                reply_idempotency_key=no_reply_idempotency_key,
            )
            _emit_automatic_reply_audit(
                action="personal_channel.whatsapp.automatic_reply",
                status="skipped",
                registration=registration,
                gateway_id=gateway_id,
                channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
                provider=WHATSAPP_PERSONAL_PROVIDER,
                detail="Automatic WhatsApp personal reply was skipped because Sage returned no reply.",
                metadata={"remote_jid": remote_jid, "inbound_external_message_id": external_message_id},
                idempotency_key=f"personal_channel.whatsapp.automatic_reply.skipped:{gateway_id}:{external_message_id}",
            )
            return {"duplicate": duplicate, "inbound": refreshed_inbound or inbound, "outbound": None}

        outbound, _ = personal_channels_repository.create_or_get_outbound_message(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            idempotency_key=idempotency_key,
            remote_jid=remote_jid,
            text=str(reply.get("text") or "").strip(),
            reply_to_external_message_id=external_message_id,
            metadata={"reply_source": str(reply.get("source") or "").strip() or None},
        )

    if str(outbound.get("status") or "").strip() == "delivered":
        personal_channels_repository.mark_inbound_processed(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            external_message_id=external_message_id,
            reply_idempotency_key=idempotency_key,
        )
        return {"duplicate": duplicate, "inbound": inbound, "outbound": outbound}

    from server_modules import gateway_protocol_service

    try:
        dispatch_result = await gateway_protocol_service.dispatch_channel_outbound(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            provider=WHATSAPP_PERSONAL_PROVIDER,
            remote_jid=str(outbound.get("remote_jid") or remote_jid).strip(),
            text=str(outbound.get("text") or "").strip(),
            idempotency_key=idempotency_key,
            reply_to_external_message_id=(
                str(outbound.get("reply_to_external_message_id") or "").strip() or external_message_id
            ),
        )
    except Exception as exc:
        _emit_automatic_reply_audit(
            action="personal_channel.whatsapp.automatic_reply",
            status="denied",
            registration=registration,
            gateway_id=gateway_id,
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
            provider=WHATSAPP_PERSONAL_PROVIDER,
            detail=str(exc),
            metadata={
                "remote_jid": remote_jid,
                "inbound_external_message_id": external_message_id,
                "reply_text_length": len(str(outbound.get("text") or "")),
            },
            idempotency_key=f"personal_channel.whatsapp.automatic_reply.denied:{gateway_id}:{idempotency_key}",
        )
        raise
    delivered = personal_channels_repository.mark_outbound_delivered(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        idempotency_key=idempotency_key,
        external_message_id=str(dispatch_result.get("external_message_id") or "").strip() or None,
        metadata={"dispatch_result": dispatch_result},
    )
    refreshed_inbound = personal_channels_repository.mark_inbound_processed(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        external_message_id=external_message_id,
        reply_idempotency_key=idempotency_key,
    )
    _emit_automatic_reply_audit(
        action="personal_channel.whatsapp.automatic_reply",
        status="success",
        registration=registration,
        gateway_id=gateway_id,
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        provider=WHATSAPP_PERSONAL_PROVIDER,
        detail="Automatic WhatsApp personal reply was dispatched through the paired gateway.",
        metadata={
            "remote_jid": remote_jid,
            "inbound_external_message_id": external_message_id,
            "reply_text_length": len(str(outbound.get("text") or "")),
            "outbound_external_message_id": str(dispatch_result.get("external_message_id") or "").strip() or None,
        },
        idempotency_key=f"personal_channel.whatsapp.automatic_reply.success:{gateway_id}:{idempotency_key}",
    )
    return {"duplicate": duplicate, "inbound": refreshed_inbound or inbound, "outbound": delivered}


async def _handle_whatsapp_gateway_channel_inbound(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    channel_lane_contract_service.assert_personal_gateway_channel(
        WHATSAPP_PERSONAL_CHANNEL_KEY,
        str(payload.get("provider") or WHATSAPP_PERSONAL_PROVIDER).strip() or WHATSAPP_PERSONAL_PROVIDER,
    )
    message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
    external_message_id = str(message.get("external_message_id") or "").strip()
    remote_jid = str(message.get("remote_jid") or "").strip()
    text = str(message.get("text") or "").strip()
    if not external_message_id or not remote_jid or not text:
        raise ValueError("channel.inbound requires external_message_id, remote_jid, and text.")
    sync_gateway_personal_channel_state(
        gateway_id=gateway_id,
        registration=registration,
        payload={
            "personal_channels": {
                WHATSAPP_PERSONAL_CHANNEL_KEY: {
                    "provider": str(payload.get("provider") or WHATSAPP_PERSONAL_PROVIDER).strip() or WHATSAPP_PERSONAL_PROVIDER,
                    "status": "connected",
                    "linked_jid": str(message.get("sender_jid") or "").strip() or None,
                }
            }
        },
    )
    inbound, created = personal_channels_repository.record_inbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        external_message_id=external_message_id,
        remote_jid=remote_jid,
        sender_jid=str(message.get("sender_jid") or "").strip() or None,
        push_name=str(message.get("push_name") or "").strip() or None,
        text=text,
        metadata={
            "provider": str(payload.get("provider") or WHATSAPP_PERSONAL_PROVIDER).strip() or WHATSAPP_PERSONAL_PROVIDER,
            "received_at": str(message.get("received_at") or "").strip() or None,
            "from_me": bool(message.get("from_me")),
        },
    )
    blocked_result = _control_command_block_result(
        gateway_id=gateway_id,
        registration=registration,
        inbound=inbound,
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        provider=WHATSAPP_PERSONAL_PROVIDER,
        external_message_id=external_message_id,
        remote_jid=remote_jid,
        text=text,
        sender_role=_sender_role_from_message(message),
        duplicate=not created,
        no_reply_prefix=WHATSAPP_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX,
    )
    if blocked_result is not None:
        return blocked_result
    return await _deliver_whatsapp_personal_reply(
        gateway_id=gateway_id,
        registration=registration,
        inbound=inbound,
        remote_jid=remote_jid,
        external_message_id=external_message_id,
        text=text,
        push_name=str(message.get("push_name") or "").strip() or None,
        duplicate=not created,
    )


async def _handle_telegram_gateway_channel_inbound(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    channel_lane_contract_service.assert_personal_gateway_channel(
        TELEGRAM_PERSONAL_CHANNEL_KEY,
        str(payload.get("provider") or TELEGRAM_PERSONAL_PROVIDER).strip() or TELEGRAM_PERSONAL_PROVIDER,
    )
    message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
    external_message_id = str(message.get("external_message_id") or "").strip()
    remote_jid = str(message.get("remote_jid") or "").strip()
    text = str(message.get("text") or "").strip()
    if not external_message_id or not remote_jid or not text:
        raise ValueError("channel.inbound requires external_message_id, remote_jid, and text.")
    sync_gateway_personal_channel_state(
        gateway_id=gateway_id,
        registration=registration,
        payload={
            "personal_channels": {
                TELEGRAM_PERSONAL_CHANNEL_KEY: {
                    "provider": str(payload.get("provider") or TELEGRAM_PERSONAL_PROVIDER).strip() or TELEGRAM_PERSONAL_PROVIDER,
                    "status": "connected",
                    "linked_user_id": str(message.get("sender_jid") or "").strip() or None,
                    "linked_name": str(message.get("push_name") or "").strip() or None,
                }
            }
        },
    )
    inbound, created = personal_channels_repository.record_inbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        external_message_id=external_message_id,
        remote_jid=remote_jid,
        sender_jid=str(message.get("sender_jid") or "").strip() or None,
        push_name=str(message.get("push_name") or "").strip() or None,
        text=text,
        metadata={
            "provider": str(payload.get("provider") or TELEGRAM_PERSONAL_PROVIDER).strip() or TELEGRAM_PERSONAL_PROVIDER,
            "received_at": str(message.get("received_at") or "").strip() or None,
            "from_me": bool(message.get("from_me")),
        },
    )
    blocked_result = _control_command_block_result(
        gateway_id=gateway_id,
        registration=registration,
        inbound=inbound,
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        provider=TELEGRAM_PERSONAL_PROVIDER,
        external_message_id=external_message_id,
        remote_jid=remote_jid,
        text=text,
        sender_role=_sender_role_from_message(message),
        duplicate=not created,
        no_reply_prefix=TELEGRAM_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX,
    )
    if blocked_result is not None:
        return blocked_result
    reply_idempotency_key = str(inbound.get("reply_idempotency_key") or "").strip() or None
    if reply_idempotency_key and reply_idempotency_key.startswith(TELEGRAM_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX):
        return {"duplicate": not created, "inbound": inbound, "outbound": None}

    outbound: Optional[Dict[str, Any]] = None
    idempotency_key = reply_idempotency_key or f"telegram_personal:{external_message_id}"
    if reply_idempotency_key:
        outbound = personal_channels_repository.get_outbound_message(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            idempotency_key=reply_idempotency_key,
        )
    if outbound and str(outbound.get("status") or "").strip() == "delivered":
        personal_channels_repository.mark_inbound_processed(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            external_message_id=external_message_id,
            reply_idempotency_key=idempotency_key,
        )
        return {"duplicate": not created, "inbound": inbound, "outbound": outbound}

    if outbound is None:
        reply = personal_channel_sage_bridge_service.build_telegram_personal_reply(
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            gateway_id=str(gateway_id or "").strip(),
            remote_jid=remote_jid,
            text=text,
            push_name=str(message.get("push_name") or "").strip() or None,
        )
        if not reply or not str(reply.get("text") or "").strip():
            no_reply_idempotency_key = f"{TELEGRAM_PERSONAL_NO_REPLY_IDEMPOTENCY_PREFIX}{external_message_id}"
            refreshed_inbound = personal_channels_repository.mark_inbound_processed(
                gateway_id=str(gateway_id or "").strip(),
                channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
                external_message_id=external_message_id,
                reply_idempotency_key=no_reply_idempotency_key,
            )
            _emit_automatic_reply_audit(
                action="personal_channel.telegram.automatic_reply",
                status="skipped",
                registration=registration,
                gateway_id=gateway_id,
                channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
                provider=TELEGRAM_PERSONAL_PROVIDER,
                detail="Automatic Telegram personal reply was skipped because Sage returned no reply.",
                metadata={"remote_jid": remote_jid, "inbound_external_message_id": external_message_id},
                idempotency_key=f"personal_channel.telegram.automatic_reply.skipped:{gateway_id}:{external_message_id}",
            )
            return {"duplicate": not created, "inbound": refreshed_inbound or inbound, "outbound": None}

        outbound, _ = personal_channels_repository.create_or_get_outbound_message(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            idempotency_key=idempotency_key,
            remote_jid=remote_jid,
            text=str(reply.get("text") or "").strip(),
            reply_to_external_message_id=external_message_id,
            metadata={"reply_source": str(reply.get("source") or "").strip() or None},
        )

    if str(outbound.get("status") or "").strip() == "delivered":
        personal_channels_repository.mark_inbound_processed(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            external_message_id=external_message_id,
            reply_idempotency_key=idempotency_key,
        )
        return {"duplicate": not created, "inbound": inbound, "outbound": outbound}

    from server_modules import gateway_protocol_service

    try:
        dispatch_result = await gateway_protocol_service.dispatch_channel_outbound(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            provider=TELEGRAM_PERSONAL_PROVIDER,
            remote_jid=str(outbound.get("remote_jid") or remote_jid).strip(),
            text=str(outbound.get("text") or "").strip(),
            idempotency_key=idempotency_key,
            reply_to_external_message_id=(
                str(outbound.get("reply_to_external_message_id") or "").strip() or external_message_id
            ),
        )
    except Exception as exc:
        _emit_automatic_reply_audit(
            action="personal_channel.telegram.automatic_reply",
            status="denied",
            registration=registration,
            gateway_id=gateway_id,
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
            provider=TELEGRAM_PERSONAL_PROVIDER,
            detail=str(exc),
            metadata={
                "remote_jid": remote_jid,
                "inbound_external_message_id": external_message_id,
                "reply_text_length": len(str(outbound.get("text") or "")),
            },
            idempotency_key=f"personal_channel.telegram.automatic_reply.denied:{gateway_id}:{idempotency_key}",
        )
        raise
    delivered = personal_channels_repository.mark_outbound_delivered(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        idempotency_key=idempotency_key,
        external_message_id=str(dispatch_result.get("external_message_id") or "").strip() or None,
        metadata={"dispatch_result": dispatch_result},
    )
    refreshed_inbound = personal_channels_repository.mark_inbound_processed(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        external_message_id=external_message_id,
        reply_idempotency_key=idempotency_key,
    )
    _emit_automatic_reply_audit(
        action="personal_channel.telegram.automatic_reply",
        status="success",
        registration=registration,
        gateway_id=gateway_id,
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        provider=TELEGRAM_PERSONAL_PROVIDER,
        detail="Automatic Telegram personal reply was dispatched through the paired gateway.",
        metadata={
            "remote_jid": remote_jid,
            "inbound_external_message_id": external_message_id,
            "reply_text_length": len(str(outbound.get("text") or "")),
            "outbound_external_message_id": str(dispatch_result.get("external_message_id") or "").strip() or None,
        },
        idempotency_key=f"personal_channel.telegram.automatic_reply.success:{gateway_id}:{idempotency_key}",
    )
    return {"duplicate": not created, "inbound": refreshed_inbound or inbound, "outbound": delivered}


async def send_whatsapp_personal_message(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    remote_jid: str,
    text: str,
    idempotency_key: str,
    reply_to_external_message_id: Optional[str] = None,
) -> Dict[str, Any]:
    channel_lane_contract_service.assert_personal_gateway_channel(
        WHATSAPP_PERSONAL_CHANNEL_KEY,
        WHATSAPP_PERSONAL_PROVIDER,
    )
    outbound, _ = personal_channels_repository.create_or_get_outbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        idempotency_key=str(idempotency_key or "").strip(),
        remote_jid=str(remote_jid or "").strip(),
        text=str(text or "").strip(),
        reply_to_external_message_id=str(reply_to_external_message_id or "").strip() or None,
        metadata={"source": "manual_api"},
    )
    if str(outbound.get("status") or "").strip() == "delivered":
        return outbound

    from server_modules import gateway_protocol_service

    dispatch_result = await gateway_protocol_service.dispatch_channel_outbound(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        provider=WHATSAPP_PERSONAL_PROVIDER,
        remote_jid=str(remote_jid or "").strip(),
        text=str(text or "").strip(),
        idempotency_key=str(idempotency_key or "").strip(),
        reply_to_external_message_id=str(reply_to_external_message_id or "").strip() or None,
    )
    delivered = personal_channels_repository.mark_outbound_delivered(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        idempotency_key=str(idempotency_key or "").strip(),
        external_message_id=str(dispatch_result.get("external_message_id") or "").strip() or None,
        metadata={"dispatch_result": dispatch_result},
    )
    return delivered or outbound


def get_whatsapp_gateway_view(gateway_id: str) -> Dict[str, Any]:
    state = personal_channels_repository.get_whatsapp_state(
        str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
    )
    recent = personal_channels_repository.list_recent_gateway_messages(
        str(gateway_id or "").strip(),
        channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
    )
    return {
        "gateway_id": str(gateway_id or "").strip(),
        "channel_key": WHATSAPP_PERSONAL_CHANNEL_KEY,
        "state": state,
        "recent_messages": recent,
    }


async def configure_whatsapp_personal_gateway(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    phone_number: Optional[str] = None,
    custom_pairing_code: Optional[str] = None,
) -> Dict[str, Any]:
    channel_lane_contract_service.assert_personal_gateway_channel(
        WHATSAPP_PERSONAL_CHANNEL_KEY,
        WHATSAPP_PERSONAL_PROVIDER,
    )
    arguments: Dict[str, Any] = {}
    if str(phone_number or "").strip():
        arguments["phone_number"] = str(phone_number).strip()
    if str(custom_pairing_code or "").strip():
        arguments["custom_pairing_code"] = str(custom_pairing_code).strip()
    if not arguments:
        raise ValueError("At least one WhatsApp personal setup field is required.")
    run_id = f"gateway-whatsapp-setup-{uuid4().hex[:12]}"
    trace_id = f"gateway-whatsapp-setup-{uuid4().hex[:12]}"
    execution = await gateway_execution_service.execute_tool_via_gateway(
        gateway_id=str(gateway_id or "").strip(),
        capability_id=WHATSAPP_PERSONAL_CONFIGURE_CAPABILITY,
        arguments=arguments,
        run_id=run_id,
        trace_id=trace_id,
        workspace_id=str(registration.get("workspace_id") or "").strip(),
    )
    result = execution.get("result") if isinstance(execution.get("result"), dict) else {}
    return {
        "gateway_id": str(gateway_id or "").strip(),
        "channel_key": WHATSAPP_PERSONAL_CHANNEL_KEY,
        **result,
    }


async def send_telegram_personal_message(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    remote_jid: str,
    text: str,
    idempotency_key: str,
    reply_to_external_message_id: Optional[str] = None,
) -> Dict[str, Any]:
    channel_lane_contract_service.assert_personal_gateway_channel(
        TELEGRAM_PERSONAL_CHANNEL_KEY,
        TELEGRAM_PERSONAL_PROVIDER,
    )
    outbound, _ = personal_channels_repository.create_or_get_outbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        idempotency_key=str(idempotency_key or "").strip(),
        remote_jid=str(remote_jid or "").strip(),
        text=str(text or "").strip(),
        reply_to_external_message_id=str(reply_to_external_message_id or "").strip() or None,
        metadata={"source": "manual_api"},
    )
    if str(outbound.get("status") or "").strip() == "delivered":
        return outbound

    from server_modules import gateway_protocol_service

    dispatch_result = await gateway_protocol_service.dispatch_channel_outbound(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        provider=TELEGRAM_PERSONAL_PROVIDER,
        remote_jid=str(remote_jid or "").strip(),
        text=str(text or "").strip(),
        idempotency_key=str(idempotency_key or "").strip(),
        reply_to_external_message_id=str(reply_to_external_message_id or "").strip() or None,
    )
    delivered = personal_channels_repository.mark_outbound_delivered(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        idempotency_key=str(idempotency_key or "").strip(),
        external_message_id=str(dispatch_result.get("external_message_id") or "").strip() or None,
        metadata={"dispatch_result": dispatch_result},
    )
    return delivered or outbound


def get_telegram_gateway_view(gateway_id: str) -> Dict[str, Any]:
    state = personal_channels_repository.get_telegram_state(
        str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
    )
    recent = personal_channels_repository.list_recent_gateway_messages(
        str(gateway_id or "").strip(),
        channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
    )
    return {
        "gateway_id": str(gateway_id or "").strip(),
        "channel_key": TELEGRAM_PERSONAL_CHANNEL_KEY,
        "state": state,
        "recent_messages": recent,
    }


async def configure_telegram_personal_gateway(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    api_id: Optional[int] = None,
    api_hash: Optional[str] = None,
    phone_number: Optional[str] = None,
    login_code: Optional[str] = None,
    password: Optional[str] = None,
) -> Dict[str, Any]:
    channel_lane_contract_service.assert_personal_gateway_channel(
        TELEGRAM_PERSONAL_CHANNEL_KEY,
        TELEGRAM_PERSONAL_PROVIDER,
    )
    arguments: Dict[str, Any] = {}
    if api_id is not None:
        arguments["api_id"] = int(api_id)
    if str(api_hash or "").strip():
        arguments["api_hash"] = str(api_hash).strip()
    if str(phone_number or "").strip():
        arguments["phone_number"] = str(phone_number).strip()
    if str(login_code or "").strip():
        arguments["login_code"] = str(login_code).strip()
    if str(password or "").strip():
        arguments["password"] = str(password).strip()
    if not arguments:
        raise ValueError("At least one Telegram personal setup field is required.")
    run_id = f"gateway-telegram-setup-{uuid4().hex[:12]}"
    trace_id = f"gateway-telegram-setup-{uuid4().hex[:12]}"
    execution = await gateway_execution_service.execute_tool_via_gateway(
        gateway_id=str(gateway_id or "").strip(),
        capability_id=TELEGRAM_PERSONAL_CONFIGURE_CAPABILITY,
        arguments=arguments,
        run_id=run_id,
        trace_id=trace_id,
        workspace_id=str(registration.get("workspace_id") or "").strip(),
    )
    result = execution.get("result") if isinstance(execution.get("result"), dict) else {}
    return {
        "gateway_id": str(gateway_id or "").strip(),
        "channel_key": TELEGRAM_PERSONAL_CHANNEL_KEY,
        **result,
    }
