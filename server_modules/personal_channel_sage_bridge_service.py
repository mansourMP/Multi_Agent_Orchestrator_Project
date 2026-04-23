from __future__ import annotations

from typing import Any, Dict, Optional

from server_modules import channel_lane_contract_service


def _build_personal_reply(
    *,
    surface_channel: str,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    fallback_label: str,
) -> Optional[Dict[str, Any]]:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        return None
    runtime_context = channel_lane_contract_service.build_personal_gateway_runtime_context(
        surface_channel=surface_channel,
        workspace_id=str(workspace_id or "default").strip() or "default",
        gateway_id=str(gateway_id or "").strip(),
        remote_jid=str(remote_jid or "").strip(),
    )
    try:
        from server_modules import direct_chat_runtime_exports

        result = direct_chat_runtime_exports.collect_direct_operator_reply(
            message=normalized_text,
            workspace_id=str(workspace_id or "default").strip() or "default",
            requested_model="",
            requested_provider="",
            thread_id=str(runtime_context["thread_id"]),
            prior_messages=[],
            reasoning_effort="",
            availability=dict(runtime_context["availability"]),
            approved_action=None,
            max_iterations=1,
            session_ctx=dict(runtime_context["session_ctx"]),
        )
        reply = str((result or {}).get("reply") or "").strip()
        if reply:
            return {
                "text": reply,
                "source": "direct_chat_runtime_exports",
                "raw": dict(result or {}),
            }
    except Exception:
        pass
    fallback_name = str(push_name or "").strip()
    prefix = f"{fallback_name}, " if fallback_name else ""
    return {
        "text": f"{prefix}Sage received your {fallback_label} message: {normalized_text}",
        "source": "personal_channel_fallback",
        "raw": {},
    }


def build_whatsapp_personal_reply(
    *,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    return _build_personal_reply(
        surface_channel="whatsapp_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="WhatsApp",
    )


def build_telegram_personal_reply(
    *,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    return _build_personal_reply(
        surface_channel="telegram_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="Telegram",
    )
