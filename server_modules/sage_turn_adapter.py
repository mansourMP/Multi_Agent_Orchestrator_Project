from __future__ import annotations

from typing import Any, Dict, Optional

from server_modules.sage_agent_runtime_contract import (
    SAGE_MODE,
    SageTurnContract,
    SageTurnResult,
    normalize_sage_mode,
    normalize_sage_surface,
)


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


async def execute_sage_turn(
    *,
    workspace_id: str,
    tenant_id: str = "",
    message: str,
    surface: str = "chat",
    mode: str = SAGE_MODE,
    current_user: Optional[dict] = None,
    channel_context: Optional[Dict[str, Any]] = None,
) -> SageTurnResult:
    """
    Unified Sage turn execution for both API and channel entry points.

    This is the single entry point for all Sage chat execution. Both
    /api/sage/chat (API path) and personal channel bridge (channel path)
    should route through this function to guarantee identical:
      - Safety rules (blocked tools, restricted memory, secret redaction)
      - Context loading (profile, memory, heartbeat, skills)
      - Response envelope (all SAGE_RESPONSE_KEYS present)
      - Persistence (conversation_memory_facade_service)
      - Audit (activity + security events)
    """
    from server_modules.sage_agent_runtime_service import handle_sage_chat
    from server_modules.channel_adapter import normalize_sage_inbound

    # Resolve tenant_id from workspace when not explicitly provided.
    # Personal channel bridges (telegram_personal, whatsapp_personal) pass
    # only workspace_id — tenant_id defaults to "" and becomes "default",
    # which fails credit debit checks for non-default workspaces.
    resolved_tenant_id = str(tenant_id or "").strip()
    if not resolved_tenant_id or resolved_tenant_id == "default":
        try:
            from server_modules.control_plane_repository import get_workspace_by_id
            ws_record = await get_workspace_by_id(workspace_id)
            if isinstance(ws_record, dict):
                resolved_tenant_id = str(ws_record.get("tenant_id") or "").strip() or resolved_tenant_id
        except Exception:
            pass

    normalized_mode = normalize_sage_mode(mode)
    normalized_surface = normalize_sage_surface(surface)

    turn = normalize_sage_inbound(
        workspace_id=workspace_id,
        tenant_id=resolved_tenant_id or tenant_id,
        message=message,
        surface=normalized_surface,
        mode=normalized_mode,
        current_user=current_user,
        channel_origin=str((channel_context or {}).get("surface_channel", "")).strip() or "personal_channel",
        channel_sender_id=str((channel_context or {}).get("remote_jid", "")).strip(),
        channel_sender_name=str((channel_context or {}).get("push_name", "")).strip(),
    )
    result = await handle_sage_chat(
        workspace_id=turn.workspace_id,
        tenant_id=turn.tenant_id,
        message=turn.message,
        surface=turn.surface,
        mode=turn.mode,
        current_user=turn.current_user,
        channel_origin=turn.channel_origin,
    )

    return SageTurnResult(
        message=result.get("message", ""),
        error=result.get("error"),
        used_context=list(result.get("used_context", [])),
        tool_calls=list(result.get("tool_calls", [])),
        available_tools=list(result.get("available_tools", [])),
        blocked_tools=list(result.get("blocked_tools", [])),
        approvals_required=list(result.get("approvals_required", [])),
        memory_updates=list(result.get("memory_updates", [])),
        trace_id=result.get("trace_id", ""),
        provider=result.get("provider", ""),
        model=result.get("model"),
    )


async def execute_sage_turn_for_channel(
    *,
    workspace_id: str,
    tenant_id: str = "",
    message: str,
    surface_channel: str = "",
    gateway_id: str = "",
    remote_jid: str = "",
    push_name: Optional[str] = None,
    source_event_id: Optional[str] = None,
    current_user: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Channel-originated Sage turn. Maps channel metadata to the unified
    Sage turn contract, executes through execute_sage_turn, and returns
    a channel-compatible result dict.

    The surface is derived from the channel: whatsapp_personal/telegram_personal
    map to "chat" surface with channel metadata preserved.
    """
    normalized_channel = _coerce_text(surface_channel)
    if "whatsapp" in normalized_channel:
        surface = "chat"
    elif "telegram" in normalized_channel:
        surface = "chat"
    else:
        surface = "chat"

    sage_result = await execute_sage_turn(
        workspace_id=workspace_id,
        tenant_id=tenant_id,
        message=message,
        surface=surface,
        mode=SAGE_MODE,
        current_user=current_user,
        channel_context={
            "surface_channel": normalized_channel,
            "gateway_id": _coerce_text(gateway_id),
            "remote_jid": _coerce_text(remote_jid),
            "push_name": _coerce_text(push_name),
            "source_event_id": _coerce_text(source_event_id),
        },
    )

    return sage_result.as_dict()
