from __future__ import annotations

import json
import mimetypes
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error, parse, request

from mcp.server.fastmcp import FastMCP


SERVER_NAME = "telegram"
TOKEN_ENV_VAR = "TELEGRAM_BOT_TOKEN"
API_ROOT = "https://api.telegram.org"

telegram_mcp = FastMCP(SERVER_NAME)


def _read_token() -> str:
    token = os.getenv(TOKEN_ENV_VAR, "").strip()
    if not token:
        raise RuntimeError(
            f"{TOKEN_ENV_VAR} is not set. Add it to the MCP environment variables before starting this server."
        )
    return token


def _api_url(method: str) -> str:
    return f"{API_ROOT}/bot{_read_token()}/{method}"


def _decode_json(payload: bytes) -> Dict[str, Any]:
    parsed = json.loads(payload.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("Telegram returned a non-object response.")
    return parsed


def _read_response(response: request.addinfourl) -> Dict[str, Any]:
    payload = _decode_json(response.read())
    if payload.get("ok") is not True:
        raise RuntimeError(str(payload.get("description") or "Telegram request failed."))
    return payload


def _post_json(method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        _api_url(method),
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            return _read_response(response)
    except error.HTTPError as exc:
        body = exc.read()
        try:
            payload = _decode_json(body)
            raise RuntimeError(str(payload.get("description") or f"Telegram HTTP {exc.code}")) from exc
        except Exception:
            raise RuntimeError(f"Telegram HTTP {exc.code}") from exc


def _get_json(method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    query = parse.urlencode({key: value for key, value in (params or {}).items() if value is not None})
    url = _api_url(method)
    if query:
        url = f"{url}?{query}"
    req = request.Request(url, headers={"Accept": "application/json"}, method="GET")
    try:
        with request.urlopen(req, timeout=30) as response:
            return _read_response(response)
    except error.HTTPError as exc:
        body = exc.read()
        try:
            payload = _decode_json(body)
            raise RuntimeError(str(payload.get("description") or f"Telegram HTTP {exc.code}")) from exc
        except Exception:
            raise RuntimeError(f"Telegram HTTP {exc.code}") from exc


def _multipart_body(fields: Dict[str, str], file_field: str, file_path: Path) -> tuple[bytes, str]:
    boundary = f"----codex-telegram-{uuid.uuid4().hex}"
    chunks: List[bytes] = []
    for key, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                str(value).encode("utf-8"),
                b"\r\n",
            ]
        )

    mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    chunks.extend(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            (
                f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'
            ).encode("utf-8"),
            f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    return b"".join(chunks), boundary


def _post_multipart(method: str, fields: Dict[str, str], file_field: str, file_path: Path) -> Dict[str, Any]:
    body, boundary = _multipart_body(fields, file_field, file_path)
    req = request.Request(
        _api_url(method),
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            return _read_response(response)
    except error.HTTPError as exc:
        body = exc.read()
        try:
            payload = _decode_json(body)
            raise RuntimeError(str(payload.get("description") or f"Telegram HTTP {exc.code}")) from exc
        except Exception:
            raise RuntimeError(f"Telegram HTTP {exc.code}") from exc


def _message_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    message = payload.get("result")
    if not isinstance(message, dict):
        return {"ok": True}
    chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
    return {
        "ok": True,
        "message_id": message.get("message_id"),
        "chat_id": chat.get("id"),
        "chat_title": chat.get("title") or chat.get("username") or chat.get("first_name"),
        "date": message.get("date"),
    }


@telegram_mcp.tool()
def get_me() -> Dict[str, Any]:
    """Return the Telegram bot profile for the configured TELEGRAM_BOT_TOKEN."""
    payload = _get_json("getMe")
    result = payload.get("result")
    return result if isinstance(result, dict) else {}


@telegram_mcp.tool()
def get_recent_updates(limit: int = 10) -> List[Dict[str, Any]]:
    """Return recent Telegram updates so you can discover the correct chat_id after messaging the bot."""
    safe_limit = max(1, min(int(limit), 50))
    payload = _get_json("getUpdates", {"limit": safe_limit, "timeout": 1})
    updates = payload.get("result")
    if not isinstance(updates, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in updates[-safe_limit:]:
        if not isinstance(item, dict):
            continue
        message = item.get("message") if isinstance(item.get("message"), dict) else {}
        chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
        from_user = message.get("from") if isinstance(message.get("from"), dict) else {}
        normalized.append(
            {
                "update_id": item.get("update_id"),
                "chat_id": chat.get("id"),
                "chat_type": chat.get("type"),
                "chat_title": chat.get("title") or chat.get("username") or chat.get("first_name"),
                "from_username": from_user.get("username"),
                "from_name": from_user.get("first_name"),
                "text": message.get("text"),
                "date": message.get("date"),
            }
        )
    return normalized


@telegram_mcp.tool()
def send_message(chat_id: str, text: str, parse_mode: Optional[str] = None) -> Dict[str, Any]:
    """Send a Telegram text message to a chat_id."""
    payload = _post_json(
        "sendMessage",
        {
            "chat_id": str(chat_id).strip(),
            "text": str(text),
            "parse_mode": str(parse_mode).strip() if parse_mode else None,
            "disable_web_page_preview": True,
        },
    )
    return _message_summary(payload)


@telegram_mcp.tool()
def send_photo(chat_id: str, file_path: str, caption: Optional[str] = None) -> Dict[str, Any]:
    """Send a local image file to Telegram."""
    path = Path(file_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Photo file was not found: {path}")
    payload = _post_multipart(
        "sendPhoto",
        {
            "chat_id": str(chat_id).strip(),
            "caption": str(caption or "").strip(),
        },
        "photo",
        path,
    )
    return _message_summary(payload)


if __name__ == "__main__":
    telegram_mcp.run()
