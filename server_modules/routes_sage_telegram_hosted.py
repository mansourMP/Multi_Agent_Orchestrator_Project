from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from server_modules import auth as auth_module
from server_modules import sage_telegram_hosted_service as hosted
from server_modules.channel_adapter import normalize_sage_inbound


router = APIRouter()
get_current_user = auth_module.get_current_user


class PairingStartRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)


@router.post("/sage/telegram-hosted/pair/start")
async def start_pairing(
    body: PairingStartRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    workspace_id = auth_module.enforce_workspace_access(
        current_user,
        body.workspace_id,
        minimum_role="admin",
    )
    if not hosted.is_configured():
        raise HTTPException(status_code=503, detail="Sage Telegram hosted bot is not configured")

    existing_code = hosted.pairing_code_for_workspace(workspace_id)
    if existing_code:
        is_deep_link = len(existing_code) > hosted.PAIRING_CODE_LENGTH
        return {
            "pairing_code": existing_code,
            "deep_link": hosted.build_deep_link(existing_code) if is_deep_link else None,
            "status": "active",
        }

    # Generate both — user can type the short code or click the deep link
    deep_link_token = hosted.generate_deep_link_token(workspace_id=workspace_id)
    code = hosted.generate_pairing_code(workspace_id=workspace_id)
    return {
        "pairing_code": code,
        "deep_link": hosted.build_deep_link(deep_link_token),
        "status": "active",
    }


@router.get("/sage/telegram-hosted/pair/status")
async def pairing_status(
    workspace_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="admin",
    )
    pending_code = hosted.pairing_code_for_workspace(workspace_id)
    already_paired = hosted.is_workspace_paired(workspace_id)
    return {
        "configured": hosted.is_configured(),
        "has_pending_code": pending_code is not None,
        "paired": already_paired,
    }

@router.get("/sage/telegram-hosted/info")
async def bot_info() -> dict:
    if not hosted.is_configured():
        return {"configured": False, "username": None}
    try:
        info = await hosted.get_bot_info()
        bot_data = info.get("result", {}) if isinstance(info.get("result"), dict) else {}
        return {
            "configured": True,
            "username": bot_data.get("username", ""),
            "name": bot_data.get("first_name", ""),
        }
    except Exception:
        return {"configured": True, "username": hosted._bot_username() or None}


@router.post("/sage/telegram-hosted/webhook")
async def telegram_webhook(request: Request) -> dict:
    if not hosted.is_configured():
        raise HTTPException(status_code=503, detail="Not configured")

    body_bytes = await request.body()
    header_signature = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")

    if not hosted.verify_webhook_signature(header_signature, body_bytes):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    parsed = hosted.parse_telegram_update(body)
    if parsed is None:
        return {"ok": True}

    chat_id = await hosted.handle_inbound_message(parsed)
    if chat_id is None:
        return {"ok": True}

    workspace_id = hosted.get_workspace_for_chat(chat_id)
    if workspace_id is None:
        return {"ok": True}

    try:
        from server_modules.sage_agent_runtime_service import handle_sage_chat

        message_text = str(parsed.get("text") or "").strip()

        # Handle /compact command — trigger compaction without a full Sage turn
        if message_text.lower().startswith("/compact"):
            from server_modules.compaction_service import (
                compact_turns, build_context_from_compaction,
                find_cut_point, should_compact, load_previous_summary,
                DEFAULT_CONTEXT_WINDOW,
            )
            from server_modules import thread_service
            from server_modules.sage_agent_runtime_service import SAGE_THREAD_ID

            tenant_id = "default"
            await thread_service.ensure_master_thread(
                thread_id=SAGE_THREAD_ID,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                owner_user_id="sage",
                channel="sage",
            )
            thread_record = await thread_service.get_thread(
                SAGE_THREAD_ID,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                include_turns=True,
            )
            raw_turns = list(thread_record.get("turns") or []) if isinstance(thread_record, dict) else []
            _ctx_window = DEFAULT_CONTEXT_WINDOW
            if raw_turns and should_compact(raw_turns, context_window=_ctx_window):
                cut_idx = find_cut_point(raw_turns)
                if cut_idx > 0:
                    prev = await load_previous_summary(workspace_id=workspace_id, tenant_id=tenant_id)
                    await compact_turns(
                        turns=raw_turns[:cut_idx],
                        workspace_id=workspace_id,
                        tenant_id=tenant_id,
                        thread_id=SAGE_THREAD_ID,
                        previous_summary=prev,
                    )
                await hosted.send_sage_reply(chat_id, "Context compacted.")
            else:
                await hosted.send_sage_reply(chat_id, "Nothing to compact — context is still small.")
            return {"ok": True}

        await hosted.send_chat_action(chat_id, "typing")

        turn = normalize_sage_inbound(
            workspace_id=workspace_id,
            message=message_text,
            surface="chat",
            mode="owner_sage",
            channel_origin="telegram_hosted",
            channel_sender_id=str(chat_id),
            channel_sender_name=str(parsed.get("from_first_name", "")).strip(),
        )
        result = await handle_sage_chat(
            workspace_id=turn.workspace_id,
            message=turn.message,
            surface=turn.surface,
            mode=turn.mode,
            channel_origin=turn.channel_origin,
            sender_id=str(chat_id),
            sender_name=str(parsed.get("from_first_name", "")).strip(),
        )

        reply = str(result.get("message") or "").strip()
        if reply and not hosted._should_skip_reply(reply):
            await hosted.send_sage_reply(
                chat_id,
                reply,
                reply_to_message_id=parsed.get("message_id"),
            )
    except Exception:
        await hosted.send_sage_reply(
            chat_id,
            "Sorry, I ran into an issue processing your message. Please try again.",
            reply_to_message_id=parsed.get("message_id"),
        )

    return {"ok": True}


@router.post("/sage/telegram-hosted/dev-poll")
async def dev_poll_once() -> dict:
    """Dev-only: manually poll Telegram for updates (no webhook needed)."""
    if not hosted.is_configured():
        raise HTTPException(status_code=503, detail="Not configured")
    updates = await hosted.poll_updates(limit=5, timeout=5)
    processed = 0
    for update in updates:
        parsed = hosted.parse_telegram_update(update)
        if parsed is None:
            continue
        chat_id = await hosted.handle_inbound_message(parsed)
        if chat_id is None:
            processed += 1
            continue
        workspace_id = hosted.get_workspace_for_chat(chat_id)
        if workspace_id is None:
            processed += 1
            continue
        try:
            from server_modules.sage_agent_runtime_service import handle_sage_chat

            message_text = str(parsed.get("text") or "").strip()

            # Handle /compact in dev-poll path
            if message_text.lower().startswith("/compact"):
                from server_modules.compaction_service import (
                    compact_turns, find_cut_point, should_compact, load_previous_summary,
                    DEFAULT_CONTEXT_WINDOW,
                )
                from server_modules import thread_service
                from server_modules.sage_agent_runtime_service import SAGE_THREAD_ID

                tenant_id = "default"
                await thread_service.ensure_master_thread(
                    thread_id=SAGE_THREAD_ID,
                    tenant_id=tenant_id,
                    workspace_id=workspace_id,
                    owner_user_id="sage",
                    channel="sage",
                )
                thread_record = await thread_service.get_thread(
                    SAGE_THREAD_ID, tenant_id=tenant_id,
                    workspace_id=workspace_id, include_turns=True,
                )
                raw_turns = list(thread_record.get("turns") or []) if isinstance(thread_record, dict) else []
                _ctx_window = DEFAULT_CONTEXT_WINDOW
                if raw_turns and should_compact(raw_turns, context_window=_ctx_window):
                    cut_idx = find_cut_point(raw_turns)
                    if cut_idx > 0:
                        prev = await load_previous_summary(workspace_id=workspace_id, tenant_id=tenant_id)
                        await compact_turns(
                            turns=raw_turns[:cut_idx],
                            workspace_id=workspace_id,
                            tenant_id=tenant_id,
                            thread_id=SAGE_THREAD_ID,
                            previous_summary=prev,
                        )
                    await hosted.send_sage_reply(chat_id, "Context compacted.")
                else:
                    await hosted.send_sage_reply(chat_id, "Nothing to compact — context is still small.")
                continue

            await hosted.send_chat_action(chat_id, "typing")
            turn = normalize_sage_inbound(
                workspace_id=workspace_id,
                message=message_text,
                surface="chat",
                mode="owner_sage",
                channel_origin="telegram_hosted",
                channel_sender_id=str(chat_id),
                channel_sender_name=str(parsed.get("from_first_name", "")).strip(),
            )
            result = await handle_sage_chat(
                workspace_id=turn.workspace_id,
                message=turn.message,
                surface=turn.surface,
                mode=turn.mode,
                channel_origin=turn.channel_origin,
            )
            reply = str(result.get("message") or "").strip()
            if reply:
                await hosted.send_sage_reply(chat_id, reply, reply_to_message_id=parsed.get("message_id"))
        except Exception:
            await hosted.send_sage_reply(chat_id, "Sorry, an error occurred.", reply_to_message_id=parsed.get("message_id"))
        processed += 1
    return {"ok": True, "updates_processed": processed}


class UnpairRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)


@router.delete("/sage/telegram-hosted/pair")
async def unpair(
    workspace_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    workspace_id = auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="admin",
    )
    count = hosted.unpair_workspace(workspace_id)
    return {"unpaired": True, "removed": count}
