from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass(slots=True)
class WorkerLease:
    worker_id: str
    run_id: str
    lease_id: str
    ttl_seconds: int
    note: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DispatchEnvelope:
    run_id: str
    worker_id: Optional[str]
    payload: Dict[str, Any] = field(default_factory=dict)
