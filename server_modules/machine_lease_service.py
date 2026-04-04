from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass(slots=True)
class MachineRecord:
    machine_id: str
    owner_id: str
    platform: str
    capabilities: List[str] = field(default_factory=list)
    permission_probe: Dict[str, bool] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MachineLease:
    lease_id: str
    machine_id: str
    run_id: str
    workspace_id: str
    actor_id: str
    ttl_seconds: int
    capabilities_requested: List[str] = field(default_factory=list)
    capabilities_granted: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
