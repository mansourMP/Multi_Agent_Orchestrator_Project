from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict

if TYPE_CHECKING:
    from server_modules.outbox_service import OutboxEvent


def _require_token(value: Any, *, label: str) -> str:
    token = str(value or "").strip()
    if not token:
        raise RuntimeError(f"Channel delivery outbox event is missing {label}.")
    return token


def _payload(event: "OutboxEvent") -> Dict[str, Any]:
    return dict(event.payload or {}) if isinstance(event.payload, dict) else {}


def _connector_shell() -> Any:
    from server_modules.connectors.autopilot_runtime_exports import _autopilot_connector_shell_service

    shell = _autopilot_connector_shell_service()
    shell.runtime_facade_service().init_runtime()
    return shell


def _defer_until_terminal(event: "OutboxEvent", *, status: str) -> None:
    from server_modules.outbox_service import OutboxRetryLater

    run_id = str(event.run_id or "").strip() or "unknown"
    raise OutboxRetryLater(
        f"channel delivery pending terminal run state for {run_id} (status={status or 'starting'})",
        retry_delay_seconds=3,
    )


def _deliver_telegram(event: "OutboxEvent") -> bool:
    payload = _payload(event)
    connector_id = _require_token(payload.get("connector_id"), label="connector_id")
    chat_id = _require_token(payload.get("chat_id"), label="chat_id")
    run_id = _require_token(event.run_id, label="run_id")
    shell = _connector_shell()
    registry = shell.telegram_service_registry()
    dispatch = registry.telegram_run_dispatch_service()
    result = dispatch.poll_run_terminal_result(run_id, max_reply_chars=registry.max_reply_chars)
    if not bool(result.get("ready")):
        _defer_until_terminal(event, status=str(result.get("status") or "starting"))
    entry = registry.telegram_autopilot_state_service().get_connector_entry(connector_id)
    secret = registry.resolve_secret(entry)
    profile = registry.resolve_profile(entry)
    dispatch.deliver_final_response(
        bot_token=_require_token(secret.get("bot_token"), label="bot_token"),
        chat_id=chat_id,
        workspace_id=event.workspace_id,
        connector_id=connector_id,
        session_key=registry.session_key_builder(chat_id),
        profile=profile,
        run_id=run_id,
        pending_message_id=str(payload.get("pending_message_id") or "").strip() or None,
        inbound_message_id=str(payload.get("parent_message_id") or "").strip() or None,
        action=str(payload.get("action") or "run").strip().lower() or "run",
        trace_id=str(event.trace_id or "").strip(),
        source_event_id=str(payload.get("source_event_id") or "").strip(),
        status=str(result.get("status") or ""),
        summary=str(result.get("summary") or ""),
        record_channel_event=registry.record_channel_event,
        send_message=registry.send_message,
        edit_message=registry.edit_message,
    )
    return True


def _deliver_whatsapp(event: "OutboxEvent") -> bool:
    payload = _payload(event)
    connector_id = _require_token(payload.get("connector_id"), label="connector_id")
    reply_to_number = _require_token(payload.get("reply_to_number"), label="reply_to_number")
    run_id = _require_token(event.run_id, label="run_id")
    shell = _connector_shell()
    registry = shell.whatsapp_service_registry()
    dispatch = registry.whatsapp_run_dispatch_service()
    result = dispatch.poll_run_terminal_result(run_id, max_reply_chars=registry.max_reply_chars)
    if not bool(result.get("ready")):
        _defer_until_terminal(event, status=str(result.get("status") or "starting"))
    entry = registry.whatsapp_autopilot_state_service().get_connector_entry(connector_id)
    secret = registry.resolve_vault_credential(connector_id, event.workspace_id)
    profile = registry.resolve_profile(entry)
    dispatch.deliver_final_response(
        run_id=run_id,
        connector_id=connector_id,
        workspace_id=event.workspace_id,
        profile=profile,
        secret=secret,
        reply_to_number=reply_to_number,
        status=str(result.get("status") or ""),
        summary=str(result.get("summary") or ""),
    )
    return True


def deliver_channel_run_delivery_outbox_event(event: "OutboxEvent") -> bool:
    payload = _payload(event)
    channel = str(payload.get("channel") or "").strip().lower()
    if channel == "telegram":
        return _deliver_telegram(event)
    if channel == "whatsapp":
        return _deliver_whatsapp(event)
    raise RuntimeError(f"Unsupported channel delivery outbox channel: {channel or 'unknown'}")
