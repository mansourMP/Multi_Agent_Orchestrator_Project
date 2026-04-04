from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Protocol


@dataclass(slots=True)
class InboundChannelEvent:
    channel: str
    event_id: str
    actor_id: str
    workspace_id: str
    text: str = ""
    attachments: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class OutboundChannelMessage:
    channel: str
    target_id: str
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class ChannelAdapter(Protocol):
    channel_name: str

    def normalize(self, payload: Dict[str, Any]) -> InboundChannelEvent: ...

    def format_reply(self, payload: Dict[str, Any]) -> List[OutboundChannelMessage]: ...
