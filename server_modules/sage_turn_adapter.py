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

    normalized_mode = normalize_sage_mode(mode)
    normalized_surface = normalize_sage_surface(surface)

    result = await handle_sage_chat(
        workspace_id=workspace_id,
        tenant_id=tenant_id,
        message=message,
        surface=normalized_surface,
        mode=normalized_mode,
        current_user=current_user,
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
    )

    return sage_result.as_dict()
