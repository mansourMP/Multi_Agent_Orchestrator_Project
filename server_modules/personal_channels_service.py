from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

from server_modules import (
    channel_blocking_policy_service,
    channel_lane_contract_service,
    gateway_state_repository,
    gateway_execution_service,
    kill_switch_gate,
    personal_channel_sage_bridge_service,
    personal_channels_repository,
    rust_runtime_kernel_client,
    secret_redaction_service,
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

LOCAL_BRIDGE_PERSONAL_CHANNELS: Dict[str, Dict[str, str]] = {
    "signal_personal": {"provider": "signal_local_bridge", "label": "Signal"},
    "imessage_personal": {"provider": "bluebubbles_local_bridge", "label": "iMessage"},
    "wechat_personal": {"provider": "wechat_local_bridge", "label": "WeChat"},
}


def _enforce_personal_gateway_config_decision(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    capability_id: str,
    run_id: str,
    trace_id: str,
) -> Dict[str, Any]:
    metadata = dict(registration.get("metadata") or {})
    session_id = str(
        registration.get("active_session_id")
        or metadata.get("gateway_session_id")
        or metadata.get("session_id")
        or metadata.get("auth_session_id")
        or metadata.get("runtime_session_id")
        or ""
    ).strip()
    if not session_id:
        session_id = str(gateway_id or registration.get("gateway_id") or "").strip()
    payload = {
        "operation": "tool_execute",
        "tenant_id": str(registration.get("tenant_id") or "default").strip() or "default",
        "workspace_id": str(registration.get("workspace_id") or "default").strip() or "default",
        "actor_id": "system",
        "actor_role": "owner",
        "gateway_id": str(gateway_id or "").strip(),
        "session_id": session_id,
        "request_id": str(trace_id or "").strip() or None,
        "capability_id": str(capability_id or "").strip(),
        "run_id": str(run_id or "").strip(),
        "trace_id": str(trace_id or "").strip() or None,
        "quota_profile": "standard",
        "risk_level": "normal",
        "policy_decision": "allow",
        "device_trust_state": str(registration.get("device_trust_state") or "trusted").strip() or "trusted",
        "protocol_version": "gateway.v1",
        "approval_provided": True,
        "approval_memory_hit": False,
        "kill_switch_enabled": False,
        "quota_ok": True,
        "gateway_registered": True,
        "session_valid": bool(session_id),
        "websocket_token_present": True,
        "frame_valid": True,
        "payload_present": True,
    }
    try:
        decision = rust_runtime_kernel_client.run_runtime_kernel_enforced(
            "gateway-service-decision",
            payload,
        )
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        reason = str(getattr(exc, "reason", "") or "personal_gateway_config_denied").strip()
        raise ValueError(f"Rust gateway-service blocked tool_execute: {reason}") from exc
    next_action = str(decision.get("next_action") or "").strip()
    if next_action != "dispatch_gateway_operation":
        raise ValueError(
            "Rust gateway-service returned unexpected next_action for "
            f"tool_execute: {next_action or 'missing'}"
        )
    return decision


def _enforce_personal_channel_dispatch_decision(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    capability_id: str,
    request_id: str,
) -> Dict[str, Any]:
    metadata = dict(registration.get("metadata") or {})
    session_id = str(
        registration.get("active_session_id")
        or metadata.get("gateway_session_id")
        or metadata.get("session_id")
        or metadata.get("auth_session_id")
        or metadata.get("runtime_session_id")
        or ""
    ).strip()
    if not session_id:
        session_id = str(gateway_id or registration.get("gateway_id") or "").strip()
    payload = {
        "operation": "protocol_route",
        "tenant_id": str(registration.get("tenant_id") or "default").strip() or "default",
        "workspace_id": str(registration.get("workspace_id") or "default").strip() or "default",
        "actor_id": "system",
        "actor_role": "owner",
        "gateway_id": str(gateway_id or "").strip(),
        "session_id": session_id,
        "request_id": str(request_id or "").strip() or None,
        "capability_id": str(capability_id or "").strip(),
        "trace_id": str(request_id or "").strip() or None,
        "quota_profile": "standard",
        "risk_level": "normal",
        "policy_decision": "allow",
        "device_trust_state": str(registration.get("device_trust_state") or "trusted").strip() or "trusted",
        "protocol_version": "gateway.v1",
        "approval_provided": True,
        "approval_memory_hit": False,
        "kill_switch_enabled": False,
        "quota_ok": True,
        "gateway_registered": True,
        "session_valid": bool(session_id),
        "websocket_token_present": True,
        "frame_valid": True,
        "payload_present": True,
    }
    try:
        decision = rust_runtime_kernel_client.run_runtime_kernel_enforced(
            "gateway-service-decision",
            payload,
        )
    except rust_runtime_kernel_client.RustKernelDecisionError as exc:
        reason = str(getattr(exc, "reason", "") or "personal_channel_dispatch_denied").strip()
        raise ValueError(f"Rust gateway-service blocked protocol_route: {reason}") from exc
    next_action = str(decision.get("next_action") or "").strip()
    if next_action != "dispatch_gateway_operation":
        raise ValueError(
            "Rust gateway-service returned unexpected next_action for "
            f"protocol_route: {next_action or 'missing'}"
        )
    return decision


_LOCAL_BRIDGE_PERSONAL_CHANNEL_COPY: Dict[str, Dict[str, str]] = {
    "signal_personal": {
        "status_label": "Bridge required",
        "detail": "Signal runs through an Agent Computer local bridge.",
        "next_step": "Connect an Agent Computer with a Signal bridge to enable Sage messaging.",
    },
    "imessage_personal": {
        "status_label": "Mac bridge required",
        "detail": "iMessage runs through a user-owned Mac Agent Computer bridge.",
        "next_step": "Connect a Mac Agent Computer with an iMessage bridge to enable Sage messaging.",
    },
    "wechat_personal": {
        "status_label": "Bridge required",
        "detail": "WeChat personal runs through an Agent Computer local bridge.",
        "next_step": "Connect an Agent Computer with a WeChat bridge to enable Sage messaging.",
    },
}


# ── Handler registry ──────────────────────────────────────────────────

from server_modules.personal_channel_handler_registry import (
    PersonalChannelHandler,
    PersonalChannelHandlerRegistry,
)


class _WhatsAppPersonalChannelHandler(PersonalChannelHandler):
    """Delegates to the existing WhatsApp functions in this module."""

    @property
    def channel_key(self) -> str:
        return WHATSAPP_PERSONAL_CHANNEL_KEY

    @property
    def provider(self) -> str:
        return WHATSAPP_PERSONAL_PROVIDER

    def build_state_sync_payload(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "qr_code": str(message.get("qr_code") or "").strip() or None,
            "linked_jid": str(message.get("linked_jid") or "").strip() or None,
        }

    def audit_action_prefix(self) -> str:
        return "whatsapp"

    async def handle_inbound(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        return await _handle_whatsapp_gateway_channel_inbound(
            gateway_id=gateway_id,
            registration=registration,
            payload=payload,
        )

    async def deliver_reply(
        self,
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
        return await _deliver_whatsapp_personal_reply(
            gateway_id=gateway_id,
            registration=registration,
            inbound=inbound,
            remote_jid=remote_jid,
            external_message_id=external_message_id,
            text=text,
            push_name=push_name,
            duplicate=duplicate,
        )

    async def send_message(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        remote_jid: str,
        text: str,
        idempotency_key: str,
        reply_to_external_message_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await send_whatsapp_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            remote_jid=remote_jid,
            text=text,
            idempotency_key=idempotency_key,
            reply_to_external_message_id=reply_to_external_message_id,
        )

    def get_view(self, gateway_id: str) -> Dict[str, Any]:
        return get_whatsapp_gateway_view(gateway_id)

    async def configure(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        return await configure_whatsapp_personal_gateway(
            gateway_id=gateway_id,
            registration=registration,
            payload=kwargs,
        )


class _TelegramPersonalChannelHandler(PersonalChannelHandler):
    """Delegates to the existing Telegram functions in this module."""

    @property
    def channel_key(self) -> str:
        return TELEGRAM_PERSONAL_CHANNEL_KEY

    @property
    def provider(self) -> str:
        return TELEGRAM_PERSONAL_PROVIDER

    def build_state_sync_payload(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "login_hint": str(message.get("login_hint") or "").strip() or None,
            "linked_user_id": str(message.get("linked_user_id") or "").strip() or None,
            "linked_username": str(message.get("linked_username") or "").strip() or None,
            "linked_phone": str(message.get("linked_phone") or "").strip() or None,
        }

    def audit_action_prefix(self) -> str:
        return "telegram"

    async def handle_inbound(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        return await _handle_telegram_gateway_channel_inbound(
            gateway_id=gateway_id,
            registration=registration,
            payload=payload,
        )

    async def deliver_reply(
        self,
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
        # Telegram handler currently inlines the deliver-reply logic inside
        # _handle_telegram_gateway_channel_inbound.  For registry dispatch we
        # route through the full handler which handles delivery internally.
        return await _handle_telegram_gateway_channel_inbound(
            gateway_id=gateway_id,
            registration=registration,
            payload={
                **inbound,
                "reply_text": text,
                "duplicate": duplicate,
            },
        )

    async def send_message(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        remote_jid: str,
        text: str,
        idempotency_key: str,
        reply_to_external_message_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await send_telegram_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            remote_jid=remote_jid,
            text=text,
            idempotency_key=idempotency_key,
            reply_to_external_message_id=reply_to_external_message_id,
        )

    def get_view(self, gateway_id: str) -> Dict[str, Any]:
        return get_telegram_gateway_view(gateway_id)

    async def configure(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        return await configure_telegram_personal_gateway(
            gateway_id=gateway_id,
            registration=registration,
            payload=kwargs,
        )


class _LocalBridgePersonalChannelHandler(PersonalChannelHandler):
    """Generic Sage personal-channel handler for Agent Computer local bridges."""

    def __init__(self, channel_key: str, provider: str, label: str) -> None:
        self._channel_key = channel_key
        self._provider = provider
        self._label = label

    @property
    def channel_key(self) -> str:
        return self._channel_key

    @property
    def provider(self) -> str:
        return self._provider

    def build_state_sync_payload(self, message: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "linked_name": str(message.get("linked_name") or message.get("push_name") or "").strip() or None,
        }

    def audit_action_prefix(self) -> str:
        return self._channel_key.split("_", 1)[0]

    async def handle_inbound(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        return await _handle_local_bridge_gateway_channel_inbound(
            gateway_id=gateway_id,
            registration=registration,
            payload=payload,
            channel_key=self._channel_key,
            provider=self._provider,
            label=self._label,
        )

    async def deliver_reply(
        self,
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
        return await _deliver_local_bridge_personal_reply(
            gateway_id=gateway_id,
            registration=registration,
            inbound=inbound,
            remote_jid=remote_jid,
            external_message_id=external_message_id,
            text=text,
            push_name=push_name,
            duplicate=duplicate,
            channel_key=self._channel_key,
            provider=self._provider,
            label=self._label,
        )

    async def send_message(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        remote_jid: str,
        text: str,
        idempotency_key: str,
        reply_to_external_message_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await send_local_bridge_personal_message(
            gateway_id=gateway_id,
            registration=registration,
            channel_key=self._channel_key,
            provider=self._provider,
            remote_jid=remote_jid,
            text=text,
            idempotency_key=idempotency_key,
            reply_to_external_message_id=reply_to_external_message_id,
        )

    def get_view(self, gateway_id: str) -> Dict[str, Any]:
        return get_gateway_personal_channel_surfaces(gateway_id)

    async def configure(
        self,
        *,
        gateway_id: str,
        registration: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        raise ValueError(f"{self._label} is configured on Agent Computer through its local bridge.")


_handler_registry = PersonalChannelHandlerRegistry()
_handler_registry.register(_WhatsAppPersonalChannelHandler())
_handler_registry.register(_TelegramPersonalChannelHandler())
for _channel_key, _channel_spec in LOCAL_BRIDGE_PERSONAL_CHANNELS.items():
    _handler_registry.register(
        _LocalBridgePersonalChannelHandler(
            _channel_key,
            _channel_spec["provider"],
            _channel_spec["label"],
        )
    )


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
    trace_id: str = "",
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
        trace_id=trace_id or "",
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
    trace_id: str = "",
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
        trace_id=trace_id,
        idempotency_key=f"personal_channel.control_command.denied:{gateway_id}:{channel_key}:{external_message_id}",
    )
    return {
        "duplicate": duplicate,
        "inbound": refreshed_inbound or inbound,
        "outbound": None,
        "blocked": True,
        "policy": command_check,
    }


def _as_mapping(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_record_list(value: Any) -> list[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _manifest_channel_key(item: Dict[str, Any]) -> str:
    return str(item.get("channel_key") or item.get("channelKey") or "").strip()


def _records_by_channel(items: Any) -> Dict[str, Dict[str, Any]]:
    records: Dict[str, Dict[str, Any]] = {}
    for item in _as_record_list(items):
        channel_key = _manifest_channel_key(item)
        if channel_key:
            records[channel_key] = item
    return records


def _boolish(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    token = str(value).strip().lower()
    if token in {"true", "1", "yes", "y", "on"}:
        return True
    if token in {"false", "0", "no", "n", "off"}:
        return False
    return default


def _personal_channel_state(gateway_id: str, channel_key: str) -> Optional[Dict[str, Any]]:
    normalized_gateway_id = str(gateway_id or "").strip()
    if channel_key == WHATSAPP_PERSONAL_CHANNEL_KEY:
        return personal_channels_repository.get_whatsapp_state(
            normalized_gateway_id,
            channel_key=WHATSAPP_PERSONAL_CHANNEL_KEY,
        )
    if channel_key == TELEGRAM_PERSONAL_CHANNEL_KEY:
        return personal_channels_repository.get_telegram_state(
            normalized_gateway_id,
            channel_key=TELEGRAM_PERSONAL_CHANNEL_KEY,
        )
    return None


def _recent_message_count(gateway_id: str, channel_key: str) -> int:
    if channel_key not in {WHATSAPP_PERSONAL_CHANNEL_KEY, TELEGRAM_PERSONAL_CHANNEL_KEY}:
        return 0
    return len(
        personal_channels_repository.list_recent_gateway_messages(
            str(gateway_id or "").strip(),
            channel_key=channel_key,
        )
    )


def _safe_state_summary(state: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(state, dict):
        return None
    metadata = _as_mapping(state.get("metadata"))
    summary = {
        "status": str(state.get("status") or "").strip() or None,
        "linked_name": str(state.get("linked_name") or "").strip() or None,
        "linked_username": str(state.get("linked_username") or "").strip() or None,
        "connected_at": str(state.get("connected_at") or "").strip() or None,
        "updated_at": metadata.get("updated_at"),
        "retryable": bool(metadata.get("retryable")),
    }
    return secret_redaction_service.sanitize_mapping({key: value for key, value in summary.items() if value is not None})


def _connected_identity_label(channel_key: str, state: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(state, dict):
        return None
    for key in ("linked_name", "linked_username"):
        value = str(state.get(key) or "").strip()
        if value:
            return secret_redaction_service.redact_text(value)
    status = str(state.get("status") or "").strip().lower()
    if status == "connected":
        if channel_key == TELEGRAM_PERSONAL_CHANNEL_KEY:
            return "Linked Telegram account"
        if channel_key == WHATSAPP_PERSONAL_CHANNEL_KEY:
            return "Linked WhatsApp account"
    return None


def get_gateway_personal_channel_surfaces(gateway_id: str) -> Dict[str, Any]:
    """Return safe per-channel capability/status projection for a paired Agent Computer.

    This is intentionally broader than the WhatsApp/Telegram detail endpoints:
    it includes local-bridge personal channels such as Signal, iMessage, and
    WeChat, while keeping them scoped to Sage/Agent Computer rather than Studio
    business/customer connectors.
    """

    normalized_gateway_id = str(gateway_id or "").strip()
    registration = gateway_state_repository.get_gateway_registration(normalized_gateway_id)
    if not registration:
        raise ValueError("Gateway registration was not found.")

    metadata = _as_mapping(registration.get("metadata"))
    manifests_by_key = _records_by_channel(metadata.get("personal_channel_manifests"))
    health_by_key = _records_by_channel(metadata.get("personal_channel_health"))
    catalog_by_key = {item["channel_key"]: dict(item) for item in channel_lane_contract_service.personal_channel_catalog()}
    platform_by_key = {
        item["channel_key"]: dict(item)
        for item in channel_lane_contract_service.platform_channel_catalog("sage")
        if channel_lane_contract_service.is_personal_channel_key(str(item.get("channel_key") or ""))
    }

    items: list[Dict[str, Any]] = []
    for channel_key, catalog in catalog_by_key.items():
        spec = channel_lane_contract_service.assert_personal_gateway_channel(channel_key)
        manifest = manifests_by_key.get(channel_key, {})
        health = health_by_key.get(channel_key, {})
        platform = platform_by_key.get(channel_key, {})
        state = _personal_channel_state(normalized_gateway_id, channel_key)
        state_status = str((state or {}).get("status") or "").strip()
        health_status = str(health.get("status") or "").strip()
        manifest_status = str(manifest.get("status") or "").strip()
        status = state_status or health_status or manifest_status or str(platform.get("status") or catalog.get("stage") or "agent_computer_bridge").strip()
        live_capable = _boolish(
            manifest.get("live_capable")
            if "live_capable" in manifest
            else manifest.get("liveCapable")
            if "liveCapable" in manifest
            else platform.get("live_capable", spec.get("live_capable")),
            default=str(spec.get("live_capable") or "").strip().lower() == "true",
        )
        connected = bool(state_status == "connected" or health.get("connected") is True)
        running = bool(health.get("running") is True)
        items.append(
            {
                "channel_key": channel_key,
                "label": str(manifest.get("label") or platform.get("label") or catalog.get("label") or channel_key).strip(),
                "provider": str(manifest.get("provider") or platform.get("provider") or spec.get("provider") or "").strip(),
                "runtime_lane": str(manifest.get("runtime_lane") or manifest.get("runtimeLane") or spec.get("runtime_lane") or "").strip(),
                "stage": str(manifest.get("stage") or platform.get("stage") or catalog.get("stage") or "").strip(),
                "status": status,
                "status_label": _LOCAL_BRIDGE_PERSONAL_CHANNEL_COPY.get(channel_key, {}).get("status_label"),
                "live_capable": live_capable,
                "requires_agent_computer": _boolish(
                    manifest.get("requires_agent_computer")
                    if "requires_agent_computer" in manifest
                    else manifest.get("requiresAgentComputer")
                    if "requiresAgentComputer" in manifest
                    else platform.get("requires_agent_computer", True),
                    default=True,
                ),
                "connected": connected,
                "running": running,
                "connected_identity": _connected_identity_label(channel_key, state),
                "recent_message_count": _recent_message_count(normalized_gateway_id, channel_key),
                "capabilities": secret_redaction_service.sanitize_value(
                    manifest.get("capabilities")
                    if isinstance(manifest.get("capabilities"), list)
                    else platform.get("capabilities", []),
                ),
                "chat_types": secret_redaction_service.sanitize_value(
                    manifest.get("chat_types")
                    if isinstance(manifest.get("chat_types"), list)
                    else [],
                ),
                "media": secret_redaction_service.sanitize_mapping(_as_mapping(manifest.get("media"))),
                "safety": secret_redaction_service.sanitize_mapping(_as_mapping(manifest.get("safety"))),
                "manifest": secret_redaction_service.sanitize_mapping(manifest),
                "health": secret_redaction_service.sanitize_mapping(health),
                "state": _safe_state_summary(state),
                "detail": _LOCAL_BRIDGE_PERSONAL_CHANNEL_COPY.get(channel_key, {}).get("detail"),
                "next_step": _LOCAL_BRIDGE_PERSONAL_CHANNEL_COPY.get(channel_key, {}).get("next_step"),
            }
        )

    return {
        "gateway_id": normalized_gateway_id,
        "items": items,
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
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
    channel_key = str(payload.get("channel_key") or "").strip()
    channel_lane_contract_service.assert_personal_gateway_channel(
        channel_key,
        str(payload.get("provider") or "").strip() or None,
    )
    # Generate or preserve trace_id once at the inbound boundary
    trace_id = str(payload.get("trace_id") or "").strip() or f"channel-{channel_key}-{uuid4().hex[:16]}"
    payload["trace_id"] = trace_id
    handler = _handler_registry.get(channel_key)
    return await handler.handle_inbound(
        gateway_id=gateway_id,
        registration=registration,
        payload=payload,
    )


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
    trace_id: str = "",
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
        trace_id=trace_id,
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
        _enforce_personal_channel_dispatch_decision(
            gateway_id=str(gateway_id or "").strip(),
            registration=registration,
            capability_id="channel.whatsapp.personal.send",
            request_id=str(idempotency_key or "").strip(),
        )
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
        trace_id=trace_id,
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
        trace_id=trace_id,
        idempotency_key=f"personal_channel.whatsapp.automatic_reply.success:{gateway_id}:{idempotency_key}",
    )
    return {"duplicate": duplicate, "inbound": refreshed_inbound or inbound, "outbound": delivered}


async def _handle_whatsapp_gateway_channel_inbound(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
    channel_lane_contract_service.assert_personal_gateway_channel(
        WHATSAPP_PERSONAL_CHANNEL_KEY,
        str(payload.get("provider") or WHATSAPP_PERSONAL_PROVIDER).strip() or WHATSAPP_PERSONAL_PROVIDER,
    )
    trace_id = str(payload.get("trace_id") or "").strip()
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
        trace_id=trace_id,
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
        trace_id=trace_id,
    )


async def _handle_telegram_gateway_channel_inbound(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
    channel_lane_contract_service.assert_personal_gateway_channel(
        TELEGRAM_PERSONAL_CHANNEL_KEY,
        str(payload.get("provider") or TELEGRAM_PERSONAL_PROVIDER).strip() or TELEGRAM_PERSONAL_PROVIDER,
    )
    trace_id = str(payload.get("trace_id") or "").strip()
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
        trace_id=trace_id,
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
        trace_id=trace_id,
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
        _enforce_personal_channel_dispatch_decision(
            gateway_id=str(gateway_id or "").strip(),
            registration=registration,
            capability_id="channel.telegram.personal.send",
            request_id=str(idempotency_key or "").strip(),
        )
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
        trace_id=trace_id,
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
        trace_id=trace_id,
        idempotency_key=f"personal_channel.telegram.automatic_reply.success:{gateway_id}:{idempotency_key}",
    )
    return {"duplicate": not created, "inbound": refreshed_inbound or inbound, "outbound": delivered}


async def _deliver_local_bridge_personal_reply(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    inbound: Dict[str, Any],
    remote_jid: str,
    external_message_id: str,
    text: str,
    push_name: Optional[str],
    duplicate: bool,
    channel_key: str,
    provider: str,
    label: str,
    trace_id: str = "",
) -> Dict[str, Any]:
    no_reply_prefix = f"{channel_key}:noreply:"
    reply_idempotency_key = str(inbound.get("reply_idempotency_key") or "").strip() or None
    if reply_idempotency_key and reply_idempotency_key.startswith(no_reply_prefix):
        return {"duplicate": duplicate, "inbound": inbound, "outbound": None}

    outbound: Optional[Dict[str, Any]] = None
    idempotency_key = reply_idempotency_key or f"{channel_key}:{external_message_id}"
    if reply_idempotency_key:
        outbound = personal_channels_repository.get_outbound_message(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=channel_key,
            idempotency_key=reply_idempotency_key,
        )
    if outbound and str(outbound.get("status") or "").strip() == "delivered":
        personal_channels_repository.mark_inbound_processed(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=channel_key,
            external_message_id=external_message_id,
            reply_idempotency_key=idempotency_key,
        )
        return {"duplicate": duplicate, "inbound": inbound, "outbound": outbound}

    if outbound is None:
        reply = await personal_channel_sage_bridge_service.build_personal_channel_reply_async(
            surface_channel=channel_key,
            workspace_id=str(registration.get("workspace_id") or "").strip(),
            gateway_id=str(gateway_id or "").strip(),
            remote_jid=remote_jid,
            text=text,
            push_name=push_name,
            fallback_label=label,
        )
        if not reply or not str(reply.get("text") or "").strip():
            no_reply_idempotency_key = f"{no_reply_prefix}{external_message_id}"
            refreshed_inbound = personal_channels_repository.mark_inbound_processed(
                gateway_id=str(gateway_id or "").strip(),
                channel_key=channel_key,
                external_message_id=external_message_id,
                reply_idempotency_key=no_reply_idempotency_key,
            )
            _emit_automatic_reply_audit(
                action=f"personal_channel.{channel_key.split('_', 1)[0]}.automatic_reply",
                status="skipped",
                registration=registration,
                gateway_id=gateway_id,
                channel_key=channel_key,
                provider=provider,
                detail=f"Automatic {label} personal reply was skipped because Sage returned no reply.",
                metadata={"remote_jid": remote_jid, "inbound_external_message_id": external_message_id},
                trace_id=trace_id,
                idempotency_key=f"personal_channel.{channel_key}.automatic_reply.skipped:{gateway_id}:{external_message_id}",
            )
            return {"duplicate": duplicate, "inbound": refreshed_inbound or inbound, "outbound": None}

        outbound, _ = personal_channels_repository.create_or_get_outbound_message(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=channel_key,
            idempotency_key=idempotency_key,
            remote_jid=remote_jid,
            text=str(reply.get("text") or "").strip(),
            reply_to_external_message_id=external_message_id,
            metadata={"reply_source": str(reply.get("source") or "").strip() or None},
        )

    if str(outbound.get("status") or "").strip() == "delivered":
        personal_channels_repository.mark_inbound_processed(
            gateway_id=str(gateway_id or "").strip(),
            channel_key=channel_key,
            external_message_id=external_message_id,
            reply_idempotency_key=idempotency_key,
        )
        return {"duplicate": duplicate, "inbound": inbound, "outbound": outbound}

    from server_modules import gateway_protocol_service

    _enforce_personal_channel_dispatch_decision(
        gateway_id=str(gateway_id or "").strip(),
        registration=registration,
        capability_id=f"{str(channel_key or '').strip()}.send",
        request_id=idempotency_key,
    )
    dispatch_result = await gateway_protocol_service.dispatch_channel_outbound(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        provider=provider,
        remote_jid=str(outbound.get("remote_jid") or remote_jid).strip(),
        text=str(outbound.get("text") or "").strip(),
        idempotency_key=idempotency_key,
        reply_to_external_message_id=(
            str(outbound.get("reply_to_external_message_id") or "").strip() or external_message_id
        ),
    )
    delivered = personal_channels_repository.mark_outbound_delivered(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        idempotency_key=idempotency_key,
        external_message_id=str(dispatch_result.get("external_message_id") or "").strip() or None,
        metadata={"dispatch_result": dispatch_result},
    )
    refreshed_inbound = personal_channels_repository.mark_inbound_processed(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        external_message_id=external_message_id,
        reply_idempotency_key=idempotency_key,
    )
    _emit_automatic_reply_audit(
        action=f"personal_channel.{channel_key.split('_', 1)[0]}.automatic_reply",
        status="success",
        registration=registration,
        gateway_id=gateway_id,
        channel_key=channel_key,
        provider=provider,
        detail=f"Automatic {label} personal reply was dispatched through the paired gateway.",
        metadata={
            "remote_jid": remote_jid,
            "inbound_external_message_id": external_message_id,
            "reply_text_length": len(str(outbound.get("text") or "")),
            "outbound_external_message_id": str(dispatch_result.get("external_message_id") or "").strip() or None,
        },
        trace_id=trace_id,
        idempotency_key=f"personal_channel.{channel_key}.automatic_reply.success:{gateway_id}:{idempotency_key}",
    )
    return {"duplicate": duplicate, "inbound": refreshed_inbound or inbound, "outbound": delivered}


async def _handle_local_bridge_gateway_channel_inbound(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    payload: Dict[str, Any],
    channel_key: str,
    provider: str,
    label: str,
) -> Dict[str, Any]:
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
    channel_lane_contract_service.assert_personal_gateway_channel(
        channel_key,
        str(payload.get("provider") or provider).strip() or provider,
    )
    trace_id = str(payload.get("trace_id") or "").strip()
    message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
    external_message_id = str(message.get("external_message_id") or "").strip()
    remote_jid = str(message.get("remote_jid") or "").strip()
    text = str(message.get("text") or "").strip()
    if not external_message_id or not remote_jid or not text:
        raise ValueError("channel.inbound requires external_message_id, remote_jid, and text.")
    inbound, created = personal_channels_repository.record_inbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        external_message_id=external_message_id,
        remote_jid=remote_jid,
        sender_jid=str(message.get("sender_jid") or "").strip() or None,
        push_name=str(message.get("push_name") or "").strip() or None,
        text=text,
        metadata={
            "provider": provider,
            "received_at": str(message.get("received_at") or "").strip() or None,
            "from_me": bool(message.get("from_me")),
            "agent_computer_bridge": True,
        },
    )
    blocked_result = _control_command_block_result(
        gateway_id=gateway_id,
        registration=registration,
        inbound=inbound,
        channel_key=channel_key,
        provider=provider,
        external_message_id=external_message_id,
        remote_jid=remote_jid,
        text=text,
        sender_role=_sender_role_from_message(message),
        duplicate=not created,
        no_reply_prefix=f"{channel_key}:noreply:",
        trace_id=trace_id,
    )
    if blocked_result is not None:
        return blocked_result
    return await _deliver_local_bridge_personal_reply(
        gateway_id=gateway_id,
        registration=registration,
        inbound=inbound,
        remote_jid=remote_jid,
        external_message_id=external_message_id,
        text=text,
        push_name=str(message.get("push_name") or "").strip() or None,
        duplicate=not created,
        channel_key=channel_key,
        provider=provider,
        label=label,
        trace_id=trace_id,
    )


async def send_local_bridge_personal_message(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    channel_key: str,
    provider: str,
    remote_jid: str,
    text: str,
    idempotency_key: str,
    reply_to_external_message_id: Optional[str] = None,
) -> Dict[str, Any]:
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
    channel_lane_contract_service.assert_personal_gateway_channel(channel_key, provider)
    outbound, _ = personal_channels_repository.create_or_get_outbound_message(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        idempotency_key=str(idempotency_key or "").strip(),
        remote_jid=str(remote_jid or "").strip(),
        text=str(text or "").strip(),
        reply_to_external_message_id=str(reply_to_external_message_id or "").strip() or None,
        metadata={"source": "manual_api", "agent_computer_bridge": True},
    )
    if str(outbound.get("status") or "").strip() == "delivered":
        return outbound

    from server_modules import gateway_protocol_service

    _enforce_personal_channel_dispatch_decision(
        gateway_id=str(gateway_id or "").strip(),
        registration=registration,
        capability_id=f"{str(channel_key or '').strip()}.send",
        request_id=str(idempotency_key or "").strip(),
    )
    dispatch_result = await gateway_protocol_service.dispatch_channel_outbound(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        provider=provider,
        remote_jid=str(remote_jid or "").strip(),
        text=str(text or "").strip(),
        idempotency_key=str(idempotency_key or "").strip(),
        reply_to_external_message_id=str(reply_to_external_message_id or "").strip() or None,
    )
    delivered = personal_channels_repository.mark_outbound_delivered(
        gateway_id=str(gateway_id or "").strip(),
        channel_key=channel_key,
        idempotency_key=str(idempotency_key or "").strip(),
        external_message_id=str(dispatch_result.get("external_message_id") or "").strip() or None,
        metadata={"dispatch_result": dispatch_result},
    )
    return delivered or outbound


async def send_whatsapp_personal_message(
    *,
    gateway_id: str,
    registration: Dict[str, Any],
    remote_jid: str,
    text: str,
    idempotency_key: str,
    reply_to_external_message_id: Optional[str] = None,
) -> Dict[str, Any]:
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
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

    _enforce_personal_channel_dispatch_decision(
        gateway_id=str(gateway_id or "").strip(),
        registration=registration,
        capability_id="channel.whatsapp.personal.send",
        request_id=str(idempotency_key or "").strip(),
    )
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
    _enforce_personal_gateway_config_decision(
        gateway_id=str(gateway_id or "").strip(),
        registration=registration,
        capability_id=WHATSAPP_PERSONAL_CONFIGURE_CAPABILITY,
        run_id=run_id,
        trace_id=trace_id,
    )
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
    kill_switch_gate.assert_not_killed(gateway_id=gateway_id)
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

    _enforce_personal_channel_dispatch_decision(
        gateway_id=str(gateway_id or "").strip(),
        registration=registration,
        capability_id="channel.telegram.personal.send",
        request_id=str(idempotency_key or "").strip(),
    )
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
    _enforce_personal_gateway_config_decision(
        gateway_id=str(gateway_id or "").strip(),
        registration=registration,
        capability_id=TELEGRAM_PERSONAL_CONFIGURE_CAPABILITY,
        run_id=run_id,
        trace_id=trace_id,
    )
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
