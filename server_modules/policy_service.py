from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass(slots=True)
class PolicyDecision:
    allowed: bool
    decision: str
    reason: str = ""
    approvals_required: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
