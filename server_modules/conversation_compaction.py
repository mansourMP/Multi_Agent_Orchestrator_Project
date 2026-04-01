from __future__ import annotations

import math
import re
from typing import Any, Dict, List


DEFAULT_MAX_TOKENS = 8000
DEFAULT_PRESERVE_LAST_MESSAGES = 10
SUMMARY_MESSAGE_ROLE = "assistant"
SUMMARY_MAX_CHARS = 2200
SUMMARY_LINE_MAX_CHARS = 240


def estimate_text_tokens(text: Any) -> int:
    normalized = str(text or "").strip()
    if not normalized:
        return 0
    return max(1, int(math.ceil(len(normalized) / 4.0)))


def estimate_message_tokens(message: Dict[str, Any]) -> int:
    if not isinstance(message, dict):
        return 0
    return estimate_text_tokens(message.get("content")) + 6


def estimate_conversation_tokens(messages: List[Dict[str, Any]]) -> int:
    return sum(estimate_message_tokens(message) for message in messages if isinstance(message, dict))


def summarize_messages(messages: List[Dict[str, Any]], *, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    if not isinstance(messages, list) or not messages:
        return ""
    lines: List[str] = []
    for item in messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "message").strip().lower()
        content = re.sub(r"\s+", " ", str(item.get("content") or "").strip())
        if not content:
            continue
        label = "User" if role == "user" else "Assistant" if role == "assistant" else role.title() or "Message"
        snippet = content[:SUMMARY_LINE_MAX_CHARS].rstrip()
        lines.append(f"- {label}: {snippet}")
        if len("\n".join(lines)) >= max_chars:
            break
    if not lines:
        return ""
    summary = "Earlier conversation summary:\n" + "\n".join(lines)
    return summary[:max_chars].rstrip()


def compact_conversation_history(
    messages: List[Dict[str, Any]],
    *,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    preserve_last_messages: int = DEFAULT_PRESERVE_LAST_MESSAGES,
) -> Dict[str, Any]:
    normalized_messages = [dict(item) for item in messages if isinstance(item, dict)]
    original_tokens = estimate_conversation_tokens(normalized_messages)
    if original_tokens <= max_tokens:
        return {
            "messages": normalized_messages,
            "compacted": False,
            "original_tokens": original_tokens,
            "compacted_tokens": original_tokens,
            "summary": "",
        }

    safe_preserve_last = max(1, int(preserve_last_messages or DEFAULT_PRESERVE_LAST_MESSAGES))
    tail = normalized_messages[-safe_preserve_last:]
    head = normalized_messages[:-safe_preserve_last]
    summary = summarize_messages(head)
    compacted_messages: List[Dict[str, Any]] = []
    if summary:
        compacted_messages.append({"role": SUMMARY_MESSAGE_ROLE, "content": summary})
    compacted_messages.extend(tail)

    compacted_tokens = estimate_conversation_tokens(compacted_messages)
    if compacted_tokens > max_tokens and len(tail) > 1:
        trimmed_tail = tail[-min(len(tail), max(4, safe_preserve_last // 2)) :]
        compacted_messages = ([{"role": SUMMARY_MESSAGE_ROLE, "content": summary}] if summary else []) + trimmed_tail
        compacted_tokens = estimate_conversation_tokens(compacted_messages)

    return {
        "messages": compacted_messages,
        "compacted": True,
        "original_tokens": original_tokens,
        "compacted_tokens": compacted_tokens,
        "summary": summary,
    }
