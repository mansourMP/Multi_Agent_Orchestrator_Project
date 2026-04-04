from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass(slots=True)
class ArtifactRecord:
    artifact_id: str
    run_id: str
    kind: str
    uri: str
    label: str = ""
    mime_type: str = ""
    machine_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
