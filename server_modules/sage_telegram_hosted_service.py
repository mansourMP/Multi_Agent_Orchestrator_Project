from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
import asyncio


LOGGER = logging.getLogger(__name__)

PAIRING_CODE_LENGTH = 6
PAIRING_TOKEN_BYTES = 24
TELEGRAM_API_BASE = "https://api.telegram.org"

_SAGE_HOSTED_PAIRS: Dict[str, Dict[str, Any]] = {}  # chat_id → {workspace_id, paired_at}
_PENDING_PAIRING_CODES: Dict[str, str] = {}  # code → workspace_id
_PENDING_DEEP_LINK_TOKENS: Dict[str, str] = {}  # token → workspace_id

# --- Persistence ---
import atexit as _atexit

_STATE_DIR = os.path.join(os.path.expanduser('~'), '.empyralis', 'state')
_STATE_FILE = os.path.join(_STATE_DIR, 'sage_telegram_hosted_pairs.json')

def _load_state() -> None:
    try:
        with open(_STATE_FILE, 'r') as f:
            data = __import__('json').load(f)
        if isinstance(data.get('pairs'), dict):
            _SAGE_HOSTED_PAIRS.update(data['pairs'])
        if isinstance(data.get('pending_codes'), dict):
            _PENDING_PAIRING_CODES.update(data['pending_codes'])
        if isinstance(data.get('pending_tokens'), dict):
            _PENDING_DEEP_LINK_TOKENS.update(data['pending_tokens'])
        LOGGER.info('Sage Telegram hosted: loaded %d pairs, %d pending codes, %d pending tokens from disk',
                     len(_SAGE_HOSTED_PAIRS), len(_PENDING_PAIRING_CODES), len(_PENDING_DEEP_LINK_TOKENS))
    except (FileNotFoundError, __import__('json').JSONDecodeError):
        pass

def _save_state() -> None:
    os.makedirs(_STATE_DIR, exist_ok=True)
    tmp = _STATE_FILE + '.tmp'
    with open(tmp, 'w') as f:
        __import__('json').dump({
            'pairs': _SAGE_HOSTED_PAIRS,
            'pending_codes': _PENDING_PAIRING_CODES,
            'pending_tokens': _PENDING_DEEP_LINK_TOKENS,
        }, f)
    os.replace(tmp, _STATE_FILE)

def _persist_after_mutation() -> None:
    try:
        _save_state()
    except Exception:
        pass

# Load persisted state on import
_load_state()


def _text(value: Any, fallback: str = "") -> str:
    token = str(value or "").strip()
    return token or fallback


def _bot_token() -> str:
    return _text(os.getenv("EMPYRALIS_TELEGRAM_HOSTED_BOT_TOKEN"))


def _webhook_secret() -> str:
    return _text(os.getenv("EMPYRALIS_TELEGRAM_HOSTED_WEBHOOK_SECRET"))


def _bot_username() -> str:
    return _text(os.getenv("EMPYRALIS_TELEGRAM_HOSTED_BOT_USERNAME"))


def is_configured() -> bool:
    return bool(_bot_token())


# --- Pairing ---

def generate_pairing_code(*, workspace_id: str) -> str:
    code = "".join(str(secrets.randbelow(10)) for _ in range(PAIRING_CODE_LENGTH))
    _PENDING_PAIRING_CODES[code] = workspace_id
    _persist_after_mutation()
    return code


def generate_deep_link_token(*, workspace_id: str) -> str:
    """Generate a secure token for one-click Telegram deep-link pairing."""
    token = secrets.token_urlsafe(PAIRING_TOKEN_BYTES)
    _PENDING_DEEP_LINK_TOKENS[token] = workspace_id
    _persist_after_mutation()
    return token


def build_deep_link(token: str) -> str:
    username = _bot_username()
    if username:
        return f"https://t.me/{username}?start={token}"
    return f"https://t.me/?start={token}"


def verify_and_pair(code: str, chat_id: str) -> Optional[str]:
    workspace_id = _PENDING_PAIRING_CODES.pop(code, None)
    if workspace_id is None:
        workspace_id = _PENDING_DEEP_LINK_TOKENS.pop(code, None)
    if workspace_id is None:
        return None
    _SAGE_HOSTED_PAIRS[str(chat_id)] = {
        "workspace_id": workspace_id,
        "paired_at": datetime.now(timezone.utc).isoformat(),
    }
    _persist_after_mutation()
    return workspace_id


def get_workspace_for_chat(chat_id: str) -> Optional[str]:
    pair = _SAGE_HOSTED_PAIRS.get(str(chat_id))
    if pair is None:
        return None
    return _text(pair.get("workspace_id"))


def is_paired(chat_id: str) -> bool:
    return str(chat_id) in _SAGE_HOSTED_PAIRS

def is_workspace_paired(workspace_id: str) -> bool:
    """Check if any chat is paired to this workspace."""
    return any(p.get("workspace_id") == workspace_id for p in _SAGE_HOSTED_PAIRS.values())



def unpair_workspace(workspace_id: str) -> int:
    """Remove all pairings for a workspace. Returns count removed."""
    to_remove = [
        chat_id for chat_id, data in _SAGE_HOSTED_PAIRS.items()
        if data.get("workspace_id") == workspace_id
    ]
    for chat_id in to_remove:
        del _SAGE_HOSTED_PAIRS[chat_id]
    if to_remove:
        _persist_after_mutation()
    return len(to_remove)

def pairing_code_for_workspace(workspace_id: str) -> Optional[str]:
    for code, ws_id in list(_PENDING_PAIRING_CODES.items()):
        if ws_id == workspace_id:
            return code
    for token, ws_id in list(_PENDING_DEEP_LINK_TOKENS.items()):
        if ws_id == workspace_id:
            return token
    return None


# --- Telegram Bot API ---

async def _telegram_api(method: str, body: dict) -> dict:
    token = _bot_token()
    if not token:
        raise RuntimeError("EMPYRALIS_TELEGRAM_HOSTED_BOT_TOKEN is not configured")
    url = f"{TELEGRAM_API_BASE}/bot{token}/{method}"
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        resp = await client.post(url, json=body)
        data = resp.json()
        if not data.get("ok"):
            LOGGER.warning("Telegram API error: %s %s", method, data.get("description", "unknown"))
        return data


async def send_message(chat_id: str, text: str, *, reply_to_message_id: Optional[int] = None) -> dict:
    """Send a message via Telegram with MarkdownV2 formatting."""
    import re as _re
    import sys as _sys
    safe_text = str(text or '')
    safe_text = _re.sub(r'<[^>]*>', '', safe_text)
    safe_text = _re.sub(r'\n?memory_search\s*\n?query\s*=\s*"[^"]*"', '', safe_text, flags=_re.IGNORECASE)
    safe_text = _re.sub(r'\n?web__search\s*\n?query\s*=\s*"[^"]*"', '', safe_text, flags=_re.IGNORECASE)
    safe_text = _re.sub(r'\n?```[^`]*```', '', safe_text)
    safe_text = safe_text.strip()
    if not safe_text:
        safe_text = "I processed your request but couldn't generate a clean response. Try asking differently."
    formatted_text = _to_telegram_markdown(safe_text)
    body: dict = {
        "chat_id": chat_id,
        "text": formatted_text,
        "parse_mode": "MarkdownV2",
    }
    if reply_to_message_id is not None:
        body["reply_to_message_id"] = reply_to_message_id
    try:
        result = await _telegram_api("sendMessage", body)
        return result
    except Exception as _exc:
        import traceback as _tb
        _tb.print_exc()
        raise


def _to_telegram_markdown(text: str) -> str:
    """Convert common markdown to Telegram MarkdownV2 format with proper escaping."""
    import re as _re
    if not text:
        return text
    # Special chars that need escaping in MarkdownV2 inline text.
    # Structural chars (# > | -) are NOT escaped — rich messages use them for headings, quotes, tables, lists.
    # $ is NOT escaped — used for inline math.
    _ESCAPE_CHARS = r'_*[]()~`{}.!-'
    _BOLD_OPEN = '\x01'
    _BOLD_CLOSE = '\x02'
    _ITL_OPEN = '\x03'
    _ITL_CLOSE = '\x04'
    _STRK_OPEN = '\x05'
    _STRK_CLOSE = '\x06'
    _BLOCK_MARK = '\x07'
    
    # 1. Protect code blocks ```...```, inline `code`, and links [text](url)
    blocks = {}
    def _save(m):
        k = _BLOCK_MARK + str(len(blocks)) + _BLOCK_MARK
        blocks[k] = m.group(0)
        return k
    text = _re.sub(r'```[^`]+```', _save, text)
    text = _re.sub(r'`[^`]+`', _save, text)
    text = _re.sub(r'\[([^\]]+)\]\(([^)]+)\)', _save, text)
    
    # 2. Convert **bold** -> sentinel (avoids italic collision)
    text = _re.sub(r'\*\*(.+?)\*\*', _BOLD_OPEN + r'\1' + _BOLD_CLOSE, text)
    # 3. Convert *italic* -> sentinel
    text = _re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', _ITL_OPEN + r'\1' + _ITL_CLOSE, text)
    # 4. Convert ~~strikethrough~~ -> sentinel
    text = _re.sub(r'~~(.+?)~~', _STRK_OPEN + r'\1' + _STRK_CLOSE, text)
    
    # 5. Escape remaining special characters (skip sentinels and block placeholders)
    result = []
    i = 0
    while i < len(text):
        c = text[i]
        if c in '\x01\x02\x03\x04\x05\x06\x07':
            # Sentinel or block marker — look for matching close
            j = text.find(c, i+1)
            if j != -1 and j - i < 30:
                result.append(text[i:j+1])
                i = j + 1
                continue
        if c in _ESCAPE_CHARS:
            result.append('\\' + c)
        else:
            result.append(c)
        i += 1
    text = ''.join(result)
    
    # 6. Resolve sentinels to Telegram MarkdownV2
    text = text.replace(_BOLD_OPEN, '*')
    text = text.replace(_BOLD_CLOSE, '*')
    text = text.replace(_ITL_OPEN, '_')
    text = text.replace(_ITL_CLOSE, '_')
    text = text.replace(_STRK_OPEN, '~')
    text = text.replace(_STRK_CLOSE, '~')
    
    # 7. Restore code/links
    for key, value in blocks.items():
        text = text.replace(key, value)
    
    return text



async def send_chat_action(chat_id: str, action: str = "typing") -> dict:
    return await _telegram_api("sendChatAction", {"chat_id": chat_id, "action": action})


async def set_webhook(*, base_url: str) -> dict:
    secret = _webhook_secret()
    webhook_url = f"{base_url.rstrip('/')}/api/sage/telegram-hosted/webhook"
    body: dict = {"url": webhook_url}
    if secret:
        body["secret_token"] = secret
    return await _telegram_api("setWebhook", body)


async def get_webhook_info() -> dict:
    return await _telegram_api("getWebhookInfo", {})


async def get_bot_info() -> dict:
    return await _telegram_api("getMe", {})


# --- Webhook handling ---

def verify_webhook_signature(header_signature: str, body_bytes: bytes) -> bool:
    secret = _webhook_secret()
    if not secret:
        return True
    if not header_signature:
        return False
    computed = hmac.new(
        secret.encode("utf-8"),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, header_signature)


def parse_telegram_update(body: dict) -> Optional[Dict[str, Any]]:
    message = body.get("message") or body.get("edited_message")
    if not isinstance(message, dict):
        return None
    chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
    text = _text(message.get("text") or message.get("caption"))
    has_photo = bool(message.get("photo"))
    has_document = bool(message.get("document"))
    if not text:
        if has_photo:
            text = "[📷 Photo]"
        elif has_document:
            text = "[📄 Document]"
        else:
            return None
    return {
        "message_id": message.get("message_id"),
        "chat_id": str(chat.get("id", "")),
        "chat_type": _text(chat.get("type")),
        "text": text,
        "from_id": str((message.get("from") or {}).get("id", "")),
        "from_username": _text((message.get("from") or {}).get("username")),
        "from_first_name": _text((message.get("from") or {}).get("first_name")),
        "date": message.get("date"),
    }


async def handle_inbound_message(parsed: dict) -> Optional[str]:
    chat_id = parsed["chat_id"]
    text = parsed["text"]
    message_id = parsed.get("message_id")

    if not is_paired(chat_id):
        # Handle /start with deep-link token (e.g., "/start abc123...")
        pairing_input = text.strip()
        if pairing_input.startswith("/start"):
            parts = pairing_input.split(None, 1)
            pairing_input = parts[1] if len(parts) > 1 else ""

        workspace_id = verify_and_pair(pairing_input, chat_id)
        if workspace_id:
            await send_message(
                chat_id,
                "✅ You're now connected to Empyralis!\n\n"
                "Send me any message and I'll route it to your Sage assistant.",
                reply_to_message_id=message_id,
            )
            return None
        else:
            bot_username = _bot_username()
            bot_mention = f"@{bot_username}" if bot_username else "this bot"
            await send_message(
                chat_id,
                f"👋 Welcome to Empyralis on Telegram!\n\n"
                f"To connect your account:\n"
                f"1. Open Empyralis → Connections → Telegram → \"Sage on Telegram\"\n"
                f"2. Click the link shown there to pair instantly\n"
                f"3. Or send the 6-digit pairing code to {bot_mention}",
                reply_to_message_id=message_id,
            )
            return None

    return chat_id


async def send_sage_reply(chat_id: str, text: str, *, reply_to_message_id: Optional[int] = None) -> dict:
    return await send_message(chat_id, text, reply_to_message_id=reply_to_message_id)


async def register_webhook_if_configured(*, base_url: str) -> bool:
    if not is_configured():
        LOGGER.info("Sage Telegram hosted bot: not configured (no EMPYRALIS_TELEGRAM_HOSTED_BOT_TOKEN)")
        return False
    try:
        result = await set_webhook(base_url=base_url)
        if result.get("ok"):
            LOGGER.info("Sage Telegram hosted bot: webhook registered successfully")
            return True
        else:
            LOGGER.warning("Sage Telegram hosted bot: webhook registration failed: %s", result.get("description"))
            return False
    except Exception as exc:
        LOGGER.warning("Sage Telegram hosted bot: webhook registration error: %s", exc)
        return False


async def unregister_webhook() -> dict:
    return await _telegram_api("deleteWebhook", {"drop_pending_updates": False})

# --- Polling fallback for local dev (when no public webhook URL) ---

async def poll_updates(*, limit: int = 10, timeout: int = 30, offset: Optional[int] = None) -> list[dict]:
    """Poll for updates. Used as fallback when webhook can't reach localhost."""
    body: dict = {"limit": limit, "timeout": timeout}
    if offset is not None:
        body["offset"] = offset
    result = await _telegram_api("getUpdates", body)
    if not result.get("ok"):
        return []
    updates = result.get("result", [])
    return [dict(u) for u in updates] if isinstance(updates, list) else []

# --- Background polling (keeps processing Telegram messages after pairing) ---

_last_update_id: int = 0
_polling_task: Optional[Any] = None
_BG_POLL_INTERVAL = 2  # seconds


_SILENT_REPLY_MARKER = "[SILENT]"

def _should_skip_reply(reply: str) -> bool:
    """Return True if the agent explicitly chose not to send a visible reply."""
    if not reply:
        return True
    stripped = reply.strip()
    if stripped == _SILENT_REPLY_MARKER:
        return True
    if stripped.startswith(_SILENT_REPLY_MARKER):
        return True
    return False


async def _process_update(update: dict) -> bool:
    """Process a single Telegram update. Returns True if a Sage reply was sent."""
    parsed = parse_telegram_update(update)
    if parsed is None:
        return False
    # Skip messages from the bot itself to prevent echo loops.
    # The bot's user ID equals the numeric part of the bot token.
    _bot_own_id = str(os.getenv("SAGE_TELEGRAM_HOSTED_BOT_USER_ID", "8870032163")).strip()
    from_id = str(parsed.get("from_id", "")).strip()
    LOGGER.info("Sage Telegram hosted: from_id=%s bot_id=%s match=%s text=%s",
                from_id, _bot_own_id, from_id == _bot_own_id,
                (parsed.get("text") or "")[:60])
    if _bot_own_id and from_id == _bot_own_id:
        LOGGER.info("Sage Telegram hosted: skipping own message (fromMe)")
        return False
    chat_id = await handle_inbound_message(parsed)
    if chat_id is None:
        return False
    workspace_id = get_workspace_for_chat(chat_id)
    if workspace_id is None:
        return False
    try:
        from server_modules.sage_agent_runtime_service import handle_sage_chat
        from server_modules.channel_adapter import normalize_sage_inbound, filter_outbound_reply

        message_text = str(parsed.get("text") or "").strip()

        # Handle /compact command — trigger compaction without a full Sage turn
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
                    prev = await load_previous_summary(
                        workspace_id=workspace_id, tenant_id=tenant_id,
                        thread_id=SAGE_THREAD_ID,
                    )
                    await compact_turns(
                        turns=raw_turns[:cut_idx],
                        workspace_id=workspace_id,
                        tenant_id=tenant_id,
                        thread_id=SAGE_THREAD_ID,
                        previous_summary=prev,
                    )
                await send_sage_reply(chat_id, "Context compacted.")
            else:
                await send_sage_reply(chat_id, "Nothing to compact — context is still small.")
            return True

        await send_chat_action(chat_id, "typing")
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
        filtered = filter_outbound_reply(reply)
        if filtered:
            await send_sage_reply(chat_id, filtered, reply_to_message_id=parsed.get("message_id"))
            return True
        else:
            LOGGER.info("Sage Telegram hosted: reply suppressed (silent/empty)")
            return False
    except Exception as exc:
        LOGGER.warning("Sage Telegram hosted: error processing update: %s", exc)
        try:
            await send_sage_reply(chat_id, "Sorry, I ran into an issue. Please try again.", reply_to_message_id=parsed.get("message_id"))
        except Exception:
            pass
    return False


async def _background_polling_loop() -> None:
    """Continuously poll Telegram for updates when at least one workspace is paired."""
    global _last_update_id
    LOGGER.info("Sage Telegram hosted: background polling started")
    while True:
        try:
            if not _SAGE_HOSTED_PAIRS:
                await asyncio.sleep(_BG_POLL_INTERVAL)
                continue
            offset = _last_update_id + 1 if _last_update_id > 0 else None
            updates = await poll_updates(limit=10, timeout=5, offset=offset)
            for update in updates:
                uid = int(update.get("update_id", 0))
                if uid > _last_update_id:
                    _last_update_id = uid
                await _process_update(update)
        except Exception as exc:
            LOGGER.warning("Sage Telegram hosted: polling loop error: %s", exc)
        await asyncio.sleep(_BG_POLL_INTERVAL)


def start_background_polling() -> None:
    """Start the background Telegram polling loop if not already running.
    Uses a module-level guard to prevent duplicate loops even when
    called multiple times (e.g. from startup hooks and module init).
    """
    global _polling_task
    if _polling_task is not None and not _polling_task.done():
        LOGGER.info("Sage Telegram hosted: background polling already running (skipping duplicate start)")
        return
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    _polling_task = loop.create_task(_background_polling_loop())
    LOGGER.info("Sage Telegram hosted: background polling started")
