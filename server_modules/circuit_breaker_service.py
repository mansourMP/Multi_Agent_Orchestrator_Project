from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass(slots=True)
class CircuitBreakerState:
    key: str
    state: str
    failure_count: int = 0
    last_error: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
