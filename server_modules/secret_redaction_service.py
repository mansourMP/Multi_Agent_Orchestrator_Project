from __future__ import annotations

import re
from typing import Any, Dict, Mapping, Optional


_SENSITIVE_KEY_PARTS = (
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "auth_token",
    "authorization",
    "password",
    "secret",
    "credential",
    "credentials",
    "private_key",
    "pairing_token",
    "pairing_code",
    "session_cookie",
    "cookie",
    "set_cookie",
    "gateway_token",
    "session_token",
    "phone",
    "mobile",
)

_SENSITIVE_VALUE_PATTERNS = (
    (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+\b", re.IGNORECASE), "Bearer [redacted]"),
    (re.compile(r"(?i)\b(authorization|proxy-authorization)\s*:\s*[^\r\n]+"), r"\1: [redacted]"),
    (re.compile(r"(?i)\b(cookie|set-cookie)\s*:\s*[^\r\n]+"), r"\1: [redacted]"),
    (re.compile(r"(?i)\b(x-api-key|api-key)\s*:\s*[^\r\n]+"), r"\1: [redacted]"),
    (re.compile(r"\bsk-[A-Za-z0-9][A-Za-z0-9_-]{8,}\b"), "[redacted-secret]"),
    (re.compile(r"\bgpair_[A-Za-z0-9_-]+\b"), "[redacted-token]"),
    (re.compile(r"\bggt_[A-Za-z0-9_-]+\b"), "[redacted-token]"),
    (re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"), "[redacted-secret]"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"), "[redacted-secret]"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]+\b"), "[redacted-secret]"),
    (re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*=\s*[^\s&]+"), r"\1=[redacted-secret]"),
    (re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)"), "[redacted-phone]"),
)

_MAX_RECURSION_DEPTH = 10
_MAX_LIST_ITEMS = 100


def is_sensitive_key(key: Any) -> bool:
    normalized = re.sub(r"[^a-z0-9_]+", "_", str(key or "").strip().lower())
    if not normalized:
        return False
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def redact_text(value: Any) -> str:
    redacted = str(value or "")
    for pattern, replacement in _SENSITIVE_VALUE_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def sanitize_value(value: Any, *, key: Any = None, depth: int = 0) -> Any:
    if depth > _MAX_RECURSION_DEPTH:
        return "[redacted-depth]"
    if is_sensitive_key(key):
        return "[redacted]"
    if isinstance(value, Mapping):
        sanitized: Dict[str, Any] = {}
        for item_key, item_value in value.items():
            sanitized[str(item_key)] = sanitize_value(
                item_value,
                key=item_key,
                depth=depth + 1,
            )
        return sanitized
    if isinstance(value, list):
        return [
            sanitize_value(item, key=key, depth=depth + 1)
            for item in value[:_MAX_LIST_ITEMS]
        ]
    if isinstance(value, tuple):
        return [
            sanitize_value(item, key=key, depth=depth + 1)
            for item in list(value)[:_MAX_LIST_ITEMS]
        ]
    if isinstance(value, str):
        return redact_text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return redact_text(str(value))


def sanitize_mapping(mapping: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    if not isinstance(mapping, Mapping):
        return {}
    return sanitize_value(dict(mapping))
