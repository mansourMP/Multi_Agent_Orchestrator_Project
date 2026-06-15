from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class NormalizedSageTurn:
    """Canonical input shape for ALL channels before handle_sage_chat()."""
    workspace_id: str
    tenant_id: str
    message: str
    surface: str                     # "chat" | "acp"
    mode: str                        # always "owner_sage" — pass through
    current_user: dict | None = None
    attachments: list[dict] = field(default_factory=list)

    # Routing metadata only — NEVER reaches the prompt
    channel_origin: str = ""         # "web" | "telegram_hosted" | "telegram_personal" |
                                     # "slack" | "discord" | "whatsapp" | "acp" | etc.
    channel_sender_id: str = ""
    channel_sender_name: str = ""
    channel_message_id: str = ""


_SILENCE_MARKERS = (
    "[SILENT]",
    "NO_REPLY",
)


def normalize_sage_inbound(
    *,
    workspace_id: str,
    message: str,
    channel_origin: str,
    surface: str = "chat",
    mode: str = "owner_sage",
    tenant_id: str = "",
    current_user: dict | None = None,
    attachments: list[dict] | None = None,
    channel_sender_id: str = "",
    channel_sender_name: str = "",
    channel_message_id: str = "",
) -> NormalizedSageTurn:
    """Normalize any channel's inbound message into canonical form.

    channel_origin is REQUIRED — no default. Every caller must declare
    which channel surface this message arrived through. The value is
    stored as routing metadata ONLY and never injected into the prompt.
    """
    if not channel_origin or not str(channel_origin).strip():
        raise ValueError("channel_origin is required for normalize_sage_inbound()")

    normalized_message = str(message or "").strip()

    return NormalizedSageTurn(
        workspace_id=str(workspace_id or "").strip(),
        tenant_id=str(tenant_id or "").strip(),
        message=normalized_message,
        surface=str(surface or "chat").strip() or "chat",
        mode=str(mode or "owner_sage").strip() or "owner_sage",
        current_user=dict(current_user) if isinstance(current_user, dict) else None,
        attachments=list(attachments) if isinstance(attachments, list) else [],
        channel_origin=str(channel_origin).strip(),
        channel_sender_id=str(channel_sender_id or "").strip(),
        channel_sender_name=str(channel_sender_name or "").strip(),
        channel_message_id=str(channel_message_id or "").strip(),
    )


def filter_outbound_reply(
    reply: str | None,
    silence_marker: str = "[SILENT]",
) -> str | None:
    """Filter outbound reply. Returns None if reply should be suppressed.

    Suppressed cases: None, empty/whitespace-only, exactly [SILENT],
    starts with [SILENT], or matches known NO_REPLY conventions.

    Single shared implementation — all channel send points call this.
    """
    if reply is None:
        return None
    text = str(reply).strip()
    if not text:
        return None
    text_upper = text.upper()
    for marker in _SILENCE_MARKERS:
        if text_upper == marker.upper() or text_upper.startswith(marker.upper()):
            return None
    return text
