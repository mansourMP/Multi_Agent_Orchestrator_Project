from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass(slots=True)
class CapabilityDescriptor:
    capability_id: str
    label: str
    risk_level: str = "medium"
    requires_approval: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SkillDescriptor:
    skill_id: str
    label: str
    capabilities: List[CapabilityDescriptor] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


def _normalize_action_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    normalized: List[str] = []
    seen = set()
    for item in value:
        token = str(item or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized


def capability_descriptor_from_payload(item: Any) -> CapabilityDescriptor | None:
    if not isinstance(item, dict):
        return None
    capability_id = str(item.get("id") or item.get("capability_id") or "").strip().lower()
    if not capability_id:
        return None
    approval_actions = _normalize_action_list(item.get("approval_required_actions"))
    connected = bool(item.get("connected"))
    authenticated = item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None
    runtime_usable = item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None
    return CapabilityDescriptor(
        capability_id=capability_id,
        label=str(item.get("label") or capability_id).strip() or capability_id,
        requires_approval=bool(approval_actions),
        metadata={
            "connected": connected,
            "authenticated": authenticated,
            "runtime_usable": runtime_usable,
            "read_actions": _normalize_action_list(item.get("read_actions")),
            "write_actions": _normalize_action_list(item.get("write_actions")),
            "approval_required_actions": approval_actions,
        },
    )


def capability_payload_from_descriptor(descriptor: CapabilityDescriptor) -> Dict[str, Any]:
    metadata = descriptor.metadata if isinstance(descriptor.metadata, dict) else {}
    return {
        "id": descriptor.capability_id,
        "label": str(descriptor.label or descriptor.capability_id).strip() or descriptor.capability_id,
        "connected": bool(metadata.get("connected")),
        "authenticated": metadata.get("authenticated") if isinstance(metadata.get("authenticated"), bool) else None,
        "runtime_usable": metadata.get("runtime_usable") if isinstance(metadata.get("runtime_usable"), bool) else None,
        "read_actions": _normalize_action_list(metadata.get("read_actions")),
        "write_actions": _normalize_action_list(metadata.get("write_actions")),
        "approval_required_actions": _normalize_action_list(metadata.get("approval_required_actions")),
    }


def normalize_capability_payloads(items: Any) -> List[Dict[str, Any]]:
    if not isinstance(items, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in items:
        descriptor = capability_descriptor_from_payload(item)
        if descriptor is None:
            continue
        normalized.append(capability_payload_from_descriptor(descriptor))
    return normalized


def normalize_availability_capability_payloads(availability: Any) -> List[Dict[str, Any]]:
    items = availability.get("tool_capabilities") if isinstance(availability, dict) else []
    return normalize_capability_payloads(items)


def availability_capability(availability: Any, capability_id: str) -> Dict[str, Any] | None:
    token = str(capability_id or "").strip().lower()
    if not token:
        return None
    for item in normalize_availability_capability_payloads(availability):
        if str(item.get("id") or "").strip().lower() == token:
            return item
    return None


def availability_capability_connected(availability: Any, capability_id: str) -> bool:
    item = availability_capability(availability, capability_id)
    return bool(item and item.get("connected"))


def availability_capability_runtime_usable(availability: Any, capability_id: str) -> bool | None:
    item = availability_capability(availability, capability_id)
    if not isinstance(item, dict):
        return None
    return item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None


def resolve_workspace_capability_payloads(
    workspace_id: str,
    *,
    resolve_workspace_tool_capabilities_fn: Any,
) -> List[Dict[str, Any]]:
    raw_items = resolve_workspace_tool_capabilities_fn(str(workspace_id or "default").strip() or "default")
    if not isinstance(raw_items, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        descriptor = capability_descriptor_from_payload(item)
        if descriptor is None:
            continue
        payload = dict(item)
        payload["id"] = descriptor.capability_id
        if "label" in payload or descriptor.label != descriptor.capability_id:
            payload["label"] = descriptor.label
        if "read_actions" in payload:
            payload["read_actions"] = _normalize_action_list(payload.get("read_actions"))
        if "write_actions" in payload:
            payload["write_actions"] = _normalize_action_list(payload.get("write_actions"))
        if "approval_required_actions" in payload:
            payload["approval_required_actions"] = _normalize_action_list(payload.get("approval_required_actions"))
        normalized.append(payload)
    return normalized
