from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from server_modules import runtime_attachment_service


AGENT_COMPUTER_GROUP_LABEL = "Agent Computer"


@dataclass(frozen=True)
class HardwareRuntimeTarget:
    runtime_target: str
    canonical_runtime_target: str
    runtime_fabric_target: str
    hardware_edge: str
    group_label: str
    source_label: str
    pill_label: str


def runtime_edge(canonical_runtime_target: str) -> str:
    token = str(canonical_runtime_target or "").strip()
    if token == "user_device_gateway":
        return "empyralis_gateway"
    if token == "empyralis_cloud_computer":
        return "empyralis_cloud_computer"
    if token == "self_hosted_node":
        return "self_hosted_node"
    return "managed_cloud"


def agent_computer_source_label(canonical_runtime_target: str) -> str:
    token = str(canonical_runtime_target or "").strip()
    if token == "user_device_gateway":
        return "This Device"
    if token == "empyralis_cloud_computer":
        return "Cloud Computer"
    if token == "self_hosted_node":
        return "Server/VPS"
    return "Cloud"


def resolve_runtime_target(runtime_target: Any = None) -> HardwareRuntimeTarget:
    legacy_target = runtime_attachment_service.normalize_runtime_target_id(runtime_target or "cloud_default")
    canonical_target = runtime_attachment_service.canonical_runtime_target_id(legacy_target)
    resolved_legacy = legacy_target or "cloud_default"
    resolved_canonical = canonical_target or "cloud_default"
    if resolved_canonical == "cloud_default":
        group_label = "Cloud"
        source_label = "Cloud"
        pill_label = "Cloud"
    else:
        group_label = AGENT_COMPUTER_GROUP_LABEL
        source_label = agent_computer_source_label(resolved_canonical)
        pill_label = f"{group_label} · {source_label}"
    return HardwareRuntimeTarget(
        runtime_target=resolved_legacy,
        canonical_runtime_target=resolved_canonical,
        runtime_fabric_target=resolved_canonical,
        hardware_edge=runtime_edge(resolved_canonical),
        group_label=group_label,
        source_label=source_label,
        pill_label=pill_label,
    )


def runtime_target_ids(runtime_target: Any = None) -> Dict[str, str]:
    resolved = resolve_runtime_target(runtime_target)
    return {
        "runtime_target": resolved.runtime_target,
        "canonical_runtime_target": resolved.canonical_runtime_target,
    }
