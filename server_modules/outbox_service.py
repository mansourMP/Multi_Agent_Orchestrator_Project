from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass(slots=True)
class OutboxEvent:
    event_id: str
    event_type: str
    tenant_id: str
    workspace_id: str
    run_id: Optional[str] = None
    machine_id: Optional[str] = None
    trace_id: str = ""
    idempotency_key: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
