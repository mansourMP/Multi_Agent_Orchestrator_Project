from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Dict, Optional

from server_modules import channel_lane_contract_service


_NO_TOOL_RUNTIME_CALLBACKS = (
    "build_direct_chat_tools",
    "build_local_direct_chat_tools",
    "build_builtin_direct_chat_tools",
    "_build_direct_chat_tools",
    "_build_local_direct_chat_tools",
    "_build_builtin_direct_chat_tools",
)


def _personal_channel_no_tools_availability(runtime_context: Dict[str, Any]) -> Dict[str, Any]:
    availability = dict(runtime_context["availability"])
    availability.update(
        {
            "personal_channel_tool_profile": "external_no_tools",
            "tools_allowed": False,
            "tool_capabilities": [],
            "local_gateway_online": False,
            "runtime_ok": False,
            "capability_truth": {
                "my_computer": {
                    "local_tools_available": False,
                    "local_gateway_online": False,
                    "runtime_ok": False,
                },
                "connectors": [],
                "builtin_tools": [],
            },
        }
    )
    return availability


def _personal_channel_no_tools_session_ctx(
    *,
    runtime_context: Dict[str, Any],
    guarded: Any,
) -> Dict[str, Any]:
    session_ctx = dict(runtime_context["session_ctx"])
    session_ctx.update(
        {
            "personal_channel_tool_profile": "external_no_tools",
            "tools_allowed": False,
            "external_content_guard": {
                "wrapper_id": guarded.wrapper_id,
                "suspicious_patterns": list(guarded.suspicious_patterns),
                "source": guarded.metadata.source,
                "channel": guarded.metadata.channel,
            },
        }
    )
    return session_ctx


@contextmanager
def _without_direct_chat_runtime_tools(runtime_exports: Any):
    saved = {
        name: getattr(runtime_exports, name)
        for name in _NO_TOOL_RUNTIME_CALLBACKS
        if hasattr(runtime_exports, name)
    }
    for name in saved:
        if "builtin" in name:
            setattr(runtime_exports, name, lambda: [])
        elif "local" in name:
            setattr(runtime_exports, name, lambda _availability: [])
        else:
            setattr(runtime_exports, name, lambda _tool_capabilities: [])
    try:
        yield
    finally:
        for name, value in saved.items():
            setattr(runtime_exports, name, value)


def _build_personal_reply(
    *,
    surface_channel: str,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    fallback_label: str,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    normalized_text = str(text or "").strip()
    if not normalized_text:
        return None
    guarded = channel_lane_contract_service.guard_personal_gateway_inbound_message(
        surface_channel=surface_channel,
        text=normalized_text,
        sender=push_name or remote_jid,
        source_event_id=source_event_id,
        metadata={"remote_jid": str(remote_jid or "").strip()},
    )
    runtime_context = channel_lane_contract_service.build_personal_gateway_runtime_context(
        surface_channel=surface_channel,
        workspace_id=str(workspace_id or "default").strip() or "default",
        gateway_id=str(gateway_id or "").strip(),
        remote_jid=str(remote_jid or "").strip(),
    )
    try:
        from server_modules import direct_chat_runtime_exports

        with _without_direct_chat_runtime_tools(direct_chat_runtime_exports):
            result = direct_chat_runtime_exports.collect_direct_operator_reply(
                message=guarded.text,
                workspace_id=str(workspace_id or "default").strip() or "default",
                requested_model="",
                requested_provider="",
                thread_id=str(runtime_context["thread_id"]),
                prior_messages=[],
                reasoning_effort="",
                availability=_personal_channel_no_tools_availability(runtime_context),
                approved_action=None,
                max_iterations=1,
                session_ctx=_personal_channel_no_tools_session_ctx(
                    runtime_context=runtime_context,
                    guarded=guarded,
                ),
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
    return None


async def _build_unified_sage_personal_reply_async(
    *,
    surface_channel: str,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    fallback_label: str,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Route personal channel messages through the unified Sage turn adapter.

    This ensures channel-originated Sage turns use the same execution path,
    safety rules, context loading, persistence, and audit as /api/sage/chat.
    Falls back to the legacy path on any error.
    """
    from server_modules.sage_turn_adapter import execute_sage_turn_for_channel

    guarded = channel_lane_contract_service.guard_personal_gateway_inbound_message(
        surface_channel=surface_channel,
        text=str(text or "").strip(),
        sender=push_name or remote_jid,
        source_event_id=source_event_id,
        metadata={"remote_jid": str(remote_jid or "").strip()},
    )
    if not str(guarded.text or "").strip():
        return None

    try:
        result = await execute_sage_turn_for_channel(
            workspace_id=str(workspace_id or "default").strip() or "default",
            surface_channel=surface_channel,
            gateway_id=str(gateway_id or "").strip(),
            remote_jid=str(remote_jid or "").strip(),
            message=guarded.text,
            push_name=push_name,
            source_event_id=source_event_id,
        )
        reply = str((result or {}).get("message") or "").strip()
        if reply:
            return {
                "text": reply,
                "source": "sage_turn_adapter",
                "trace_id": (result or {}).get("trace_id", ""),
                "raw": dict(result or {}),
            }
    except Exception:
        pass

    return None


def _build_unified_sage_personal_reply(
    *,
    surface_channel: str,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    fallback_label: str,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    import asyncio
    import threading

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            _build_unified_sage_personal_reply_async(
                surface_channel=surface_channel,
                workspace_id=workspace_id,
                gateway_id=gateway_id,
                remote_jid=remote_jid,
                text=text,
                push_name=push_name,
                fallback_label=fallback_label,
                source_event_id=source_event_id,
            )
        )

    holder: dict[str, Any] = {"result": None, "error": None}

    def _runner() -> None:
        try:
            holder["result"] = asyncio.run(
                _build_unified_sage_personal_reply_async(
                    surface_channel=surface_channel,
                    workspace_id=workspace_id,
                    gateway_id=gateway_id,
                    remote_jid=remote_jid,
                    text=text,
                    push_name=push_name,
                    fallback_label=fallback_label,
                    source_event_id=source_event_id,
                )
            )
        except Exception as exc:
            holder["error"] = exc

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if holder["error"] is not None:
        raise holder["error"]
    return holder["result"]


async def build_whatsapp_personal_reply_async(
    *,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    unified = await _build_unified_sage_personal_reply_async(
        surface_channel="whatsapp_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="WhatsApp",
        source_event_id=source_event_id,
    )
    return unified
    return _build_personal_reply(
        surface_channel="whatsapp_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="WhatsApp",
        source_event_id=source_event_id,
    )


async def build_telegram_personal_reply_async(
    *,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    unified = await _build_unified_sage_personal_reply_async(
        surface_channel="telegram_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="Telegram",
        source_event_id=source_event_id,
    )
    return unified
    return _build_personal_reply(
        surface_channel="telegram_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="Telegram",
        source_event_id=source_event_id,
    )


async def build_personal_channel_reply_async(
    *,
    surface_channel: str,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    fallback_label: str = "channel",
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    unified = await _build_unified_sage_personal_reply_async(
        surface_channel=surface_channel,
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label=fallback_label,
        source_event_id=source_event_id,
    )
    return unified
    return _build_personal_reply(
        surface_channel=surface_channel,
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label=fallback_label,
        source_event_id=source_event_id,
    )


def build_whatsapp_personal_reply(
    *,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    unified = _build_unified_sage_personal_reply(
        surface_channel="whatsapp_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="WhatsApp",
        source_event_id=source_event_id,
    )
    return unified
    return _build_personal_reply(
        surface_channel="whatsapp_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="WhatsApp",
        source_event_id=source_event_id,
    )


def build_telegram_personal_reply(
    *,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
    text: str,
    push_name: Optional[str] = None,
    source_event_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    unified = _build_unified_sage_personal_reply(
        surface_channel="telegram_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="Telegram",
        source_event_id=source_event_id,
    )
    return unified
    return _build_personal_reply(
        surface_channel="telegram_personal",
        workspace_id=workspace_id,
        gateway_id=gateway_id,
        remote_jid=remote_jid,
        text=text,
        push_name=push_name,
        fallback_label="Telegram",
        source_event_id=source_event_id,
    )
