from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, Tuple

from server_modules import secret_redaction_service


_RED_MEMORY_PATTERNS: Tuple[tuple[str, re.Pattern[str]], ...] = (
    ("red_sensitivity_label", re.compile(r"(?im)^\s*(red\s*[:=-]|sensitivity\s*:\s*red\b|classification\s*:\s*red\b)")),
    ("private_memory_marker", re.compile(r"\b(RED_MEMORY|PRIVATE_MEMORY|SAGE_PRIVATE_CONTEXT|RAW_MEMORY)\b", re.I)),
    ("secret_instruction_leak", re.compile(r"\b(system prompt|developer instructions?|hidden instructions?|internal policy)\b\s*[:=-]", re.I)),
)


@dataclass(frozen=True)
class ResponseLeakGuardResult:
    text: str
    redacted: bool = False
    blocked: bool = False
    findings: Tuple[str, ...] = field(default_factory=tuple)

    def metadata(self) -> Dict[str, Any]:
        return {
            "redacted": self.redacted,
            "blocked": self.blocked,
            "findings": list(self.findings),
        }


def guard_model_response(value: Any) -> ResponseLeakGuardResult:
    raw = str(value or "")
    findings = [name for name, pattern in _RED_MEMORY_PATTERNS if pattern.search(raw)]
    redacted = secret_redaction_service.redact_text(raw)
    redacted_changed = redacted != raw
    if findings:
        guarded = raw
        for _name, pattern in _RED_MEMORY_PATTERNS:
            guarded = pattern.sub("[redacted-private-context]", guarded)
        guarded = secret_redaction_service.redact_text(guarded)
        return ResponseLeakGuardResult(
            text=guarded,
            redacted=True,
            blocked=False,
            findings=tuple(sorted(set([*findings, *([] if not redacted_changed else ["secret_pattern"])]))),
        )
    return ResponseLeakGuardResult(
        text=redacted,
        redacted=redacted_changed,
        blocked=False,
        findings=("secret_pattern",) if redacted_changed else (),
    )


def guard_stream_delta(value: Any) -> str:
    return guard_model_response(value).text
