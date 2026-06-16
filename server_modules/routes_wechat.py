"""WeChat inbound message handler — Gateway-only channel.

WeChat messages arrive through the Gateway (local bridge). This route
is the backend entry point. Commands are handled by the shared dispatcher.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from server_modules import auth as auth_module

router = APIRouter()


@router.post("/sage/wechat/inbound")
async def wechat_inbound(
    request: Request,
    current_user=Depends(auth_module.require_api_key),
) -> dict:
    """Receive inbound WeChat messages and route through Sage."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    text = str(body.get("text") or "").strip()
    sender_id = str(body.get("sender_id") or "").strip()
    workspace_id = str(body.get("workspace_id") or "default").strip()

    if not text:
        return {"ok": True}

    # ── Shared command dispatcher ──
    from server_modules.sage_command_dispatcher import dispatch_command
    cmd_reply = await dispatch_command(
        command=text,
        workspace_id=workspace_id,
        thread_id="sage-main",
        channel_origin="wechat_personal",
        sender_id=sender_id or None,
    )
    if cmd_reply is not None:
        return {"ok": True, "command_handled": True, "reply": cmd_reply}

    # ── Normal message: route to Sage ──
    from server_modules.sage_agent_runtime_service import handle_sage_chat
    from server_modules.channel_adapter import normalize_sage_inbound

    turn = normalize_sage_inbound(
        workspace_id=workspace_id,
        message=text,
        surface="chat",
        mode="owner_sage",
        channel_origin="wechat_personal",
        channel_sender_id=sender_id,
        channel_sender_name=str(body.get("sender_name") or "").strip(),
    )
    from server_modules.sage_command_dispatcher import get_active_thread as _gat_wc
    _active_thread_wc = await _gat_wc(turn.workspace_id, "wechat_personal")
    result = await handle_sage_chat(
        workspace_id=turn.workspace_id,
        message=turn.message,
        surface=turn.surface,
        mode=turn.mode,
        channel_origin=turn.channel_origin,
        sender_id=sender_id or None,
        sender_name=str(body.get("sender_name") or "").strip() or None,
        thread_id=_active_thread_wc,
    )

    return {"ok": True, "sage_replied": bool(result.get("message"))}
