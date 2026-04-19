from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from server_modules import (
    agent_registry_repository,
    control_plane_repository,
    entitlements_service,
    execution_sandbox_service,
    hybrid_policy_service,
    memory_service,
    run_state_repository,
)


SUPPORTED_DEPLOYMENT_MODES = ("cloud_only", "local_only", "hybrid", "self_hosted_business")
SUPPORTED_ATTACHMENT_KINDS = ("managed_cloud", "local_companion", "self_hosted_business_node")
SUPPORTED_RUNTIME_MODES = {"hosted_secure", "local_secure", "privileged_device"}
SUPPORTED_RUNTIME_TARGET_IDS = ("cloud_default", "local_companion", "self_host_runtime")
_RUNTIME_ATTACHMENTS_CACHE: Dict[str, Dict[str, Any]] = {}
_RUNTIME_TARGETS_CACHE: Dict[str, Dict[str, Any]] = {}
_RUNTIME_CACHE_LIMIT = 128

TRUST_MODEL_MAP: dict[str, dict[str, Any]] = {
    "hosted_secure": {
        "trust_tier": "hosted_high",
        "execution_boundary": "sandboxed_hosted_compute",
        "host_filesystem_access": "denied_by_default",
        "local_private_memory_access": "cloud_safe_summaries_only",
        "approval_mode": "policy_bound",
    },
    "local_secure": {
        "trust_tier": "paired_local_scoped",
        "execution_boundary": "scoped_local_runtime",
        "host_filesystem_access": "approved_folders_only",
        "local_private_memory_access": "allowed_locally",
        "approval_mode": "policy_bound",
    },
    "privileged_device": {
        "trust_tier": "paired_local_privileged",
        "execution_boundary": "approved_device_runtime",
        "host_filesystem_access": "approval_gated_device_access",
        "local_private_memory_access": "allowed_locally",
        "approval_mode": "explicit_owner_approval",
    },
    "self_hosted_business_node": {
        "trust_tier": "enterprise_self_hosted",
        "execution_boundary": "customer_controlled_secure_node",
        "host_filesystem_access": "customer_policy_defined",
        "local_private_memory_access": "customer_policy_defined",
        "approval_mode": "workspace_policy_bound",
    },
}

RUNTIME_TARGET_DEFINITIONS: dict[str, dict[str, Any]] = {
    "cloud_default": {
        "label": "Cloud Default",
        "attachment_kind": "managed_cloud",
        "execution_target": "cloud",
        "connection_mode": "platform_cloud",
        "product_default": True,
        "description": "Cloud-hosted execution for the workspace. This remains the default product path when cloud is available.",
    },
    "local_companion": {
        "label": "Local Companion",
        "attachment_kind": "local_companion",
        "execution_target": "local_companion",
        "connection_mode": "platform_relay",
        "product_default": False,
        "description": "Paired local companion execution routed through the same workspace identity and policy model.",
    },
    "self_host_runtime": {
        "label": "Self-Host Runtime",
        "attachment_kind": "self_hosted_business_node",
        "execution_target": "cloud",
        "connection_mode": "workspace_hosted",
        "product_default": False,
        "description": "Customer-hosted secure execution that stays under the same account and workspace contract.",
    },
}


class RuntimeAttachmentSelectionError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        reason: str = "runtime_attachment_selection_failed",
        enforcement_state: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.reason = str(reason or "runtime_attachment_selection_failed").strip() or "runtime_attachment_selection_failed"
        self.message = str(message or "Runtime attachment selection failed.").strip() or "Runtime attachment selection failed."
        self.enforcement_state = dict(enforcement_state or {})


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _list_strings(value: Any) -> List[str]:
    out: List[str] = []
    for item in list(value or []):
        token = str(item or "").strip()
        if token:
            out.append(token)
    return out


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"), default=str)


def _clone_payload(value: Dict[str, Any]) -> Dict[str, Any]:
    return copy.deepcopy(value)


def _cache_store(cache: Dict[str, Dict[str, Any]], key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if len(cache) >= _RUNTIME_CACHE_LIMIT and key not in cache:
        cache.clear()
    cache[key] = _clone_payload(payload)
    return _clone_payload(payload)


def _runtime_profile_snapshot_value(profile: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(profile.get("id") or "").strip(),
        "slug": str(profile.get("slug") or "").strip(),
        "status": str(profile.get("status") or "").strip(),
        "runtime_class": str(profile.get("runtime_class") or "").strip(),
        "runtime_id": str(profile.get("runtime_id") or "").strip(),
        "machine_id": str(profile.get("machine_id") or "").strip(),
        "supported_capabilities": list(profile.get("supported_capabilities") or []),
        "updated_at": profile.get("updated_at"),
        "last_seen_at": profile.get("last_seen_at"),
    }


def _fleet_worker_snapshot_value(worker: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "worker_id": str(worker.get("worker_id") or worker.get("runtime_id") or "").strip(),
        "runtime_id": str(worker.get("runtime_id") or "").strip(),
        "machine_id": str(worker.get("machine_id") or "").strip(),
        "runtime_type": str(worker.get("runtime_type") or "").strip(),
        "status": str(worker.get("status") or "").strip(),
        "control_state": str(worker.get("control_state") or "").strip(),
        "online": bool(worker.get("online")),
        "last_seen_at": worker.get("last_seen_at") or worker.get("last_heartbeat_at"),
        "capabilities": list(worker.get("capabilities") or []),
        "execution_targets": list(worker.get("execution_targets") or []),
    }


def _runtime_inventory_snapshot_version(
    *,
    tenant_id: str,
    workspace_id: str,
    runtime_profiles: List[Dict[str, Any]],
    fleet_workers: List[Dict[str, Any]],
) -> str:
    return _stable_json(
        {
            "tenant_id": str(tenant_id or "").strip(),
            "workspace_id": str(workspace_id or "").strip(),
            "runtime_profiles": [
                _runtime_profile_snapshot_value(profile)
                for profile in runtime_profiles
                if isinstance(profile, dict)
            ],
            "fleet_workers": [
                _fleet_worker_snapshot_value(worker)
                for worker in fleet_workers
                if isinstance(worker, dict)
            ],
        }
    )


def _inventory_snapshot_version(inventory: Dict[str, Any]) -> str:
    if str(inventory.get("_snapshot_version") or "").strip():
        return str(inventory.get("_snapshot_version") or "").strip()
    return _stable_json(
        {
            "tenant_id": str(inventory.get("tenant_id") or "").strip(),
            "workspace_id": str(inventory.get("workspace_id") or "").strip(),
            "deployment_mode": str(inventory.get("deployment_mode") or "").strip(),
            "attachments": [
                {
                    "attachment_id": str(item.get("attachment_id") or "").strip(),
                    "attachment_kind": str(item.get("attachment_kind") or "").strip(),
                    "runtime_profile_id": str(item.get("runtime_profile_id") or "").strip(),
                    "runtime_id": str(item.get("runtime_id") or "").strip(),
                    "machine_id": str(item.get("machine_id") or "").strip(),
                    "status": str(item.get("status") or "").strip(),
                    "control_state": str(item.get("control_state") or "").strip(),
                    "online": bool(item.get("online")),
                    "healthy": bool(item.get("healthy")),
                }
                for item in list(inventory.get("attachments") or [])
                if isinstance(item, dict)
            ],
        }
    )


def _attachment_capability_match(attachment: Dict[str, Any], required_capabilities: List[str]) -> bool:
    required = {str(item or "").strip().lower() for item in list(required_capabilities or []) if str(item or "").strip()}
    if not required:
        return True
    available = {str(item or "").strip().lower() for item in list(attachment.get("capabilities") or []) if str(item or "").strip()}
    if not available:
        return str(attachment.get("attachment_kind") or "").strip() in {"managed_cloud", "self_hosted_business_node"}
    return required.issubset(available)


def _attachment_connector_match(attachment: Dict[str, Any], required_connectors: List[str]) -> bool:
    required = {str(item or "").strip().lower() for item in list(required_connectors or []) if str(item or "").strip()}
    if not required:
        return True
    available = {str(item or "").strip().lower() for item in list(attachment.get("connectors") or []) if str(item or "").strip()}
    if not available:
        return str(attachment.get("attachment_kind") or "").strip() in {"managed_cloud", "self_hosted_business_node"}
    return required.issubset(available)


def _preferred_attachment_kind_rank(attachment: Dict[str, Any], preferred_kinds: List[str]) -> int:
    attachment_kind = str(attachment.get("attachment_kind") or "").strip()
    try:
        return list(preferred_kinds).index(attachment_kind)
    except ValueError:
        return len(list(preferred_kinds)) + 1


def _normalize_runtime_mode(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in SUPPORTED_RUNTIME_MODES else "hosted_secure"


def _normalize_runtime_class(value: Any) -> str:
    token = str(value or "").strip().lower()
    if token in {"cloud_worker", "desktop_companion", "mobile_runtime", "self_hosted_business_node", "self_hosted_worker", "enterprise_node"}:
        return token
    return token or "cloud_worker"


def _attachment_kind_for_profile(runtime_profile: Dict[str, Any], worker: Optional[Dict[str, Any]] = None) -> str:
    payload = _coerce_dict(worker)
    runtime_class = _normalize_runtime_class(runtime_profile.get("runtime_class") or payload.get("runtime_class"))
    runtime_type = str(payload.get("runtime_type") or "").strip().lower()
    execution_targets = {
        str(item or "").strip().lower()
        for item in list(payload.get("execution_targets") or [])
        if str(item or "").strip()
    }
    capabilities = {
        str(item or "").strip().lower()
        for item in list(payload.get("capabilities") or [])
        if str(item or "").strip()
    }
    if runtime_class in {"self_hosted_business_node", "self_hosted_worker", "enterprise_node"}:
        return "self_hosted_business_node"
    if runtime_class in {"desktop_companion", "mobile_runtime"}:
        return "local_companion"
    if runtime_type in {"local", "local_companion"}:
        return "local_companion"
    if "local" in execution_targets or "local.worker" in capabilities:
        return "local_companion"
    return "managed_cloud"


def _attachment_support(runtime_kind: str) -> List[str]:
    if runtime_kind == "managed_cloud":
        return ["hosted_secure"]
    if runtime_kind == "local_companion":
        return ["local_secure", "privileged_device"]
    return ["hosted_secure"]


def _attachment_trust(runtime_kind: str) -> Dict[str, Any]:
    if runtime_kind == "managed_cloud":
        return dict(TRUST_MODEL_MAP["hosted_secure"])
    if runtime_kind == "local_companion":
        return {
            "local_secure": dict(TRUST_MODEL_MAP["local_secure"]),
            "privileged_device": dict(TRUST_MODEL_MAP["privileged_device"]),
        }
    return dict(TRUST_MODEL_MAP["self_hosted_business_node"])


def _parse_utc_ts(value: Any) -> Optional[datetime]:
    token = str(value or "").strip()
    if not token:
        return None
    if token.endswith("Z"):
        token = f"{token[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(token)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _worker_online_window_seconds(lease_seconds: Optional[int] = None) -> int:
    return max(20, int(lease_seconds or 30) * 2)


def _infer_attachment_online(payload: Dict[str, Any], control_state: str, status: str) -> bool:
    if bool(payload.get("online")):
        return True
    if control_state != "active" or status in {"offline", "failed", "stopped", "revoked"}:
        return False
    seen_at = _parse_utc_ts(payload.get("last_seen_at") or payload.get("last_heartbeat_at"))
    if seen_at is None:
        return False
    delta = (datetime.now(timezone.utc) - seen_at).total_seconds()
    lease_seconds = int(payload.get("lease_seconds") or 30)
    return delta <= _worker_online_window_seconds(lease_seconds)


def _attachment_health(worker: Optional[Dict[str, Any]], runtime_kind: str) -> Dict[str, Any]:
    if runtime_kind == "managed_cloud":
        return {"online": True, "healthy": True, "control_state": "active", "status": "ready"}
    payload = _coerce_dict(worker)
    control_state = str(payload.get("control_state") or "active").strip().lower() or "active"
    status = str(payload.get("status") or "offline").strip().lower() or "offline"
    online = _infer_attachment_online(payload, control_state, status)
    healthy = bool(online and control_state == "active" and status not in {"offline", "failed"})
    return {
        "online": online,
        "healthy": healthy,
        "control_state": control_state,
        "status": status,
    }


def _attachment_lifecycle(runtime_kind: str, worker: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if runtime_kind == "managed_cloud":
        return {
            "pairable": False,
            "registered": True,
            "health_tracked": True,
            "revocable": True,
            "detachable": False,
            "migratable": True,
        }
    payload = _coerce_dict(worker)
    return {
        "pairable": runtime_kind == "local_companion",
        "registered": bool(payload),
        "health_tracked": True,
        "revocable": True,
        "detachable": True,
        "migratable": True,
    }


def _deployment_mode(attachments: Iterable[Dict[str, Any]]) -> str:
    items = [dict(item) for item in attachments if isinstance(item, dict)]
    has_cloud = any(str(item.get("attachment_kind") or "").strip() == "managed_cloud" for item in items)
    has_local = any(str(item.get("attachment_kind") or "").strip() == "local_companion" for item in items)
    has_self_hosted = any(str(item.get("attachment_kind") or "").strip() == "self_hosted_business_node" for item in items)
    if has_self_hosted:
        return "self_hosted_business"
    if has_cloud and has_local:
        return "hybrid"
    if has_local:
        return "local_only"
    return "cloud_only"


def _attachments_for_kind(attachments: Iterable[Dict[str, Any]], attachment_kind: str) -> List[Dict[str, Any]]:
    token = str(attachment_kind or "").strip()
    return [
        dict(item)
        for item in attachments
        if isinstance(item, dict) and str(item.get("attachment_kind") or "").strip() == token
    ]


def _runtime_target_status(attachments: List[Dict[str, Any]]) -> str:
    if not attachments:
        return "unavailable"
    online = any(bool(item.get("online")) for item in attachments)
    healthy = any(bool(item.get("healthy")) for item in attachments)
    if healthy and online:
        return "live"
    if online:
        return "degraded"
    return "offline"


def _default_runtime_target_id(*, deployment_mode: str, attachments: List[Dict[str, Any]]) -> str:
    mode = str(deployment_mode or "").strip().lower()
    if mode == "self_hosted_business" and _attachments_for_kind(attachments, "self_hosted_business_node"):
        return "self_host_runtime"
    if mode == "local_only" and _attachments_for_kind(attachments, "local_companion"):
        return "local_companion"
    if _attachments_for_kind(attachments, "managed_cloud"):
        return "cloud_default"
    if _attachments_for_kind(attachments, "self_hosted_business_node"):
        return "self_host_runtime"
    if _attachments_for_kind(attachments, "local_companion"):
        return "local_companion"
    return "cloud_default"


def build_workspace_runtime_targets(
    *,
    tenant_id: str,
    workspace_id: str,
    inventory: Dict[str, Any],
) -> Dict[str, Any]:
    attachments = [dict(item) for item in list(inventory.get("attachments") or []) if isinstance(item, dict)]
    deployment_mode = str(inventory.get("deployment_mode") or _deployment_mode(attachments)).strip() or "cloud_only"
    default_target_id = _default_runtime_target_id(
        deployment_mode=deployment_mode,
        attachments=attachments,
    )
    targets: List[Dict[str, Any]] = []

    for target_id in SUPPORTED_RUNTIME_TARGET_IDS:
        definition = dict(RUNTIME_TARGET_DEFINITIONS[target_id])
        matching = _attachments_for_kind(attachments, str(definition.get("attachment_kind") or ""))
        supports_runtime_modes = sorted(
            {
                str(mode or "").strip()
                for item in matching
                for mode in list(item.get("supports_runtime_modes") or [])
                if str(mode or "").strip()
            }
        )
        target_payload = {
            "target_id": target_id,
            "label": definition["label"],
            "description": definition["description"],
            "attachment_kind": definition["attachment_kind"],
            "execution_target": definition["execution_target"],
            "connection_mode": definition["connection_mode"],
            "available": bool(matching),
            "online": any(bool(item.get("online")) for item in matching),
            "healthy": any(bool(item.get("healthy")) for item in matching),
            "status": _runtime_target_status(matching),
            "attachment_count": len(matching),
            "attachment_ids": [
                str(item.get("attachment_id") or "").strip()
                for item in matching
                if str(item.get("attachment_id") or "").strip()
            ],
            "default_for_workspace": target_id == default_target_id,
            "product_default": bool(definition.get("product_default")),
            "routed_through_platform": True,
            "direct_mobile_connection_required": False,
            "workspace_scoped_identity": True,
            "supports_runtime_modes": supports_runtime_modes,
        }
        if matching:
            target_payload["sample_attachment_label"] = str(matching[0].get("label") or "").strip() or None
        targets.append(target_payload)

    return {
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "deployment_mode": deployment_mode,
        "default_target_id": default_target_id,
        "targets": targets,
        "routing_contract": {
            "product_default_target_id": "cloud_default",
            "mobile_entry_mode": "platform_first",
            "direct_mobile_lan_default": False,
            "workspace_scoped_identity": True,
            "supports_self_host_without_identity_fork": True,
        },
    }


def _placement_manifest(install: Dict[str, Any]) -> Dict[str, Any]:
    version = install.get("agent_definition_version") if isinstance(install.get("agent_definition_version"), dict) else {}
    return _coerce_dict(version.get("placement_manifest"))


def _allowed_runtime_classes(install: Dict[str, Any], runtime_mode: str) -> List[str]:
    placement_manifest = _placement_manifest(install)
    values = [str(item or "").strip().lower() for item in list(placement_manifest.get("allowed_runtime_classes") or []) if str(item or "").strip()]
    if values:
        return values
    if runtime_mode == "hosted_secure":
        return ["cloud_worker", "self_hosted_business_node", "self_hosted_worker", "enterprise_node"]
    return ["desktop_companion", "mobile_runtime"]


def _matches_requested_machine(attachment: Dict[str, Any], requested_machine_target: str) -> bool:
    token = str(requested_machine_target or "").strip()
    if not token:
        return True
    return token in {
        str(attachment.get("machine_id") or "").strip(),
        str(attachment.get("runtime_id") or "").strip(),
        str(attachment.get("attachment_id") or "").strip(),
    }


def _matching_attachment_score(attachment: Dict[str, Any], runtime_profile: Dict[str, Any], preferred_slug: str) -> int:
    score = 0
    if str(runtime_profile.get("id") or "").strip() and str(attachment.get("runtime_profile_id") or "").strip() == str(runtime_profile.get("id") or "").strip():
        score += 50
    runtime_profile_runtime_id = str(runtime_profile.get("runtime_id") or "").strip()
    runtime_profile_machine_id = str(runtime_profile.get("machine_id") or "").strip()
    if runtime_profile_runtime_id and str(attachment.get("runtime_id") or "").strip() == runtime_profile_runtime_id:
        score += 40
    if runtime_profile_machine_id and str(attachment.get("machine_id") or "").strip() == runtime_profile_machine_id:
        score += 35
    runtime_profile_slug = str(runtime_profile.get("slug") or "").strip()
    if runtime_profile_slug and str(attachment.get("runtime_profile_slug") or "").strip() == runtime_profile_slug:
        score += 30
    if preferred_slug and str(attachment.get("runtime_profile_slug") or "").strip() == preferred_slug:
        score += 20
    if bool(attachment.get("healthy")):
        score += 10
    if bool(attachment.get("online")):
        score += 5
    return score


def _attachment_from_profile(
    *,
    tenant_id: str,
    workspace_id: str,
    runtime_profile: Dict[str, Any],
    worker: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    profile = dict(runtime_profile or {})
    payload = _coerce_dict(worker)
    runtime_kind = _attachment_kind_for_profile(profile, worker=payload)
    runtime_class = _normalize_runtime_class(profile.get("runtime_class") or payload.get("runtime_class"))
    if runtime_kind == "local_companion" and runtime_class not in {"desktop_companion", "mobile_runtime"}:
        runtime_class = "desktop_companion"
    elif runtime_kind == "managed_cloud" and runtime_class in {"desktop_companion", "mobile_runtime"}:
        runtime_class = "cloud_worker"
    runtime_id = str(profile.get("runtime_id") or payload.get("runtime_id") or payload.get("worker_id") or "").strip() or None
    machine_id = str(profile.get("machine_id") or payload.get("machine_id") or runtime_id or "").strip() or None
    health = _attachment_health(payload, runtime_kind)
    label = (
        str(profile.get("label") or "").strip()
        or str(payload.get("display_name") or "").strip()
        or machine_id
        or runtime_id
        or runtime_kind
    )
    return {
        "attachment_id": f"{runtime_kind}:{str(profile.get('id') or runtime_id or machine_id or label).strip()}",
        "attachment_kind": runtime_kind,
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "runtime_class": runtime_class,
        "runtime_profile_id": str(profile.get("id") or "").strip() or None,
        "runtime_profile_slug": str(profile.get("slug") or "").strip() or None,
        "runtime_profile_label": str(profile.get("label") or "").strip() or None,
        "runtime_id": runtime_id,
        "machine_id": machine_id,
        "runtime_type": str(payload.get("runtime_type") or runtime_kind).strip() or runtime_kind,
        "label": label,
        "online": health["online"],
        "healthy": health["healthy"],
        "control_state": health["control_state"],
        "status": health["status"],
        "capabilities": _list_strings(payload.get("capabilities") or profile.get("supported_capabilities")),
        "connectors": _list_strings(payload.get("connectors") or payload.get("available_connectors") or profile.get("supported_connectors")),
        "execution_targets": _list_strings(payload.get("execution_targets")),
        "supports_runtime_modes": _attachment_support(runtime_kind),
        "trust_model": _attachment_trust(runtime_kind),
        "privacy_posture": {
            "local_private_memory_supported": runtime_kind == "local_companion",
            "cloud_safe_summary_bridge": True,
            "cloud_sync_required": runtime_kind == "managed_cloud",
        },
        "lifecycle": _attachment_lifecycle(runtime_kind, payload),
        "current_run_id": str(payload.get("current_run_id") or "").strip() or None,
        "last_seen_at": payload.get("last_seen_at") or payload.get("last_heartbeat_at"),
        "instance_id": str(payload.get("instance_id") or "").strip() or None,
        "note": str(payload.get("note") or "").strip() or None,
    }


def _managed_cloud_attachment(*, tenant_id: str, workspace_id: str, runtime_profiles: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    cloud_profiles = [
        dict(item)
        for item in runtime_profiles
        if isinstance(item, dict)
        and str(item.get("status") or "active").strip().lower() == "active"
        and _attachment_kind_for_profile(item) == "managed_cloud"
    ]
    if not cloud_profiles:
        return None
    return _attachment_from_profile(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        runtime_profile=cloud_profiles[0],
        worker=None,
    )


async def list_workspace_runtime_attachments(
    *,
    tenant_id: str,
    workspace_id: str,
    runtime_profiles: Optional[List[Dict[str, Any]]] = None,
    fleet_workers: Optional[List[Dict[str, Any]]] = None,
    include_snapshot_version: bool = False,
) -> Dict[str, Any]:
    profiles = (
        [dict(item) for item in runtime_profiles if isinstance(item, dict)]
        if runtime_profiles is not None
        else await agent_registry_repository.list_runtime_profiles(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            seed_if_missing=False,
        )
    )
    workers = (
        [dict(item) for item in fleet_workers if isinstance(item, dict)]
        if fleet_workers is not None
        else await run_state_repository.list_fleet_workers(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
        )
    )
    if fleet_workers is None and not workers:
        # Local dev often runs without durable fleet tables; fall back to the
        # in-memory local queue view so the shell can still discover a healthy
        # paired local companion.
        try:
            from server_modules import local_queue

            local_workers_payload = local_queue.handle_get_local_workers_status()
            local_workers = local_workers_payload.get("items") if isinstance(local_workers_payload, dict) else []
            workers = [
                dict(item)
                for item in list(local_workers or [])
                if isinstance(item, dict)
                and str(item.get("tenant_id") or tenant_id).strip() == tenant_id
                and str(item.get("workspace_id") or "").strip() == workspace_id
            ]
        except Exception:
            workers = []
    snapshot_version = _runtime_inventory_snapshot_version(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        runtime_profiles=profiles,
        fleet_workers=workers,
    )
    cached_inventory = _RUNTIME_ATTACHMENTS_CACHE.get(snapshot_version)
    if cached_inventory is not None:
        payload = _clone_payload(cached_inventory)
        if include_snapshot_version:
            payload["_snapshot_version"] = snapshot_version
        return payload
    attachments: List[Dict[str, Any]] = []
    matched_worker_ids: set[str] = set()

    cloud_attachment = _managed_cloud_attachment(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        runtime_profiles=profiles,
    )
    if cloud_attachment is not None:
        attachments.append(cloud_attachment)

    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        if str(profile.get("status") or "active").strip().lower() != "active":
            continue
        kind = _attachment_kind_for_profile(profile)
        if kind == "managed_cloud":
            continue
        runtime_id = str(profile.get("runtime_id") or "").strip()
        machine_id = str(profile.get("machine_id") or "").strip()
        matched_worker = None
        for worker in workers:
            if not isinstance(worker, dict):
                continue
            worker_id = str(worker.get("worker_id") or worker.get("runtime_id") or "").strip()
            if runtime_id and str(worker.get("runtime_id") or worker.get("worker_id") or "").strip() == runtime_id:
                matched_worker = worker
            elif machine_id and str(worker.get("machine_id") or "").strip() == machine_id:
                matched_worker = worker
            if matched_worker is not None:
                if worker_id:
                    matched_worker_ids.add(worker_id)
                break
        attachments.append(
            _attachment_from_profile(
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                runtime_profile=profile,
                worker=matched_worker,
            )
        )

    for worker in workers:
        if not isinstance(worker, dict):
            continue
        worker_id = str(worker.get("worker_id") or worker.get("runtime_id") or "").strip()
        if worker_id and worker_id in matched_worker_ids:
            continue
        attachments.append(
            _attachment_from_profile(
                tenant_id=tenant_id,
                workspace_id=workspace_id,
                runtime_profile={},
                worker=worker,
            )
        )

    attachments.sort(
        key=lambda item: (
            0 if str(item.get("attachment_kind") or "") == "managed_cloud" else 1,
            0 if bool(item.get("healthy")) else 1,
            str(item.get("label") or ""),
        )
    )
    deployment_mode = _deployment_mode(attachments)
    payload = {
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "deployment_mode": deployment_mode,
        "supported_deployment_modes": list(SUPPORTED_DEPLOYMENT_MODES),
        "attachments": attachments,
        "selection_policy": {
            "hosted_secure_prefers": ["managed_cloud", "self_hosted_business_node"],
            "local_secure_prefers": ["local_companion"],
            "privileged_device_requires": ["local_companion"],
            "shared_sage_identity": True,
            "specialist_scope_required": True,
        },
    }
    cached_payload = _cache_store(_RUNTIME_ATTACHMENTS_CACHE, snapshot_version, payload)
    if include_snapshot_version:
        cached_payload["_snapshot_version"] = snapshot_version
    return cached_payload


async def list_workspace_runtime_targets(
    *,
    tenant_id: str,
    workspace_id: str,
    runtime_profiles: Optional[List[Dict[str, Any]]] = None,
    fleet_workers: Optional[List[Dict[str, Any]]] = None,
    inventory: Optional[Dict[str, Any]] = None,
    include_snapshot_version: bool = False,
) -> Dict[str, Any]:
    resolved_inventory = dict(inventory) if isinstance(inventory, dict) else await list_workspace_runtime_attachments(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        runtime_profiles=runtime_profiles,
        fleet_workers=fleet_workers,
        include_snapshot_version=True,
    )
    snapshot_version = _inventory_snapshot_version(resolved_inventory)
    cached_targets = _RUNTIME_TARGETS_CACHE.get(snapshot_version)
    if cached_targets is not None:
        payload = _clone_payload(cached_targets)
        if include_snapshot_version:
            payload["_snapshot_version"] = snapshot_version
        return payload
    payload = build_workspace_runtime_targets(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        inventory=resolved_inventory,
    )
    cached_payload = _cache_store(_RUNTIME_TARGETS_CACHE, snapshot_version, payload)
    if include_snapshot_version:
        cached_payload["_snapshot_version"] = snapshot_version
    return cached_payload


async def resolve_install_runtime_plan(
    *,
    tenant_id: str,
    workspace_id: str,
    install: Dict[str, Any],
    requested_attachment_id: Optional[str] = None,
    requested_machine_target: Optional[str] = None,
    policy_context: Optional[Dict[str, Any]] = None,
    inventory: Optional[Dict[str, Any]] = None,
    workspace: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    runtime_inventory = inventory or await list_workspace_runtime_attachments(
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    attachments = [dict(item) for item in list(runtime_inventory.get("attachments") or []) if isinstance(item, dict)]
    runtime_mode = _normalize_runtime_mode(install.get("runtime_mode"))
    runtime_profile = install.get("runtime_profile") if isinstance(install.get("runtime_profile"), dict) else {}
    preferred_slug = str(_placement_manifest(install).get("preferred_runtime_slug") or "").strip()
    allowed_runtime_classes = _allowed_runtime_classes(install, runtime_mode=runtime_mode)
    policy = {
        **_coerce_dict(install.get("policy_context_overrides")),
        **_coerce_dict(policy_context),
    }
    requested_summary_payload_classes = hybrid_policy_service.normalize_summary_bridge_payload_classes(
        policy.get("summary_bridge_payloads")
        if isinstance(policy.get("summary_bridge_payloads"), (list, tuple, set))
        else policy.get("summary_payload_classes")
        if isinstance(policy.get("summary_payload_classes"), (list, tuple, set))
        else []
    )
    summary_bridge_status = memory_service.hybrid_summary_bridge_status(
        workspace_id,
        payload_classes=requested_summary_payload_classes or None,
        agent_install_id=str(install.get("id") or "").strip() or None,
    )
    if "last_safe_summary_available" not in policy:
        policy["last_safe_summary_available"] = bool(summary_bridge_status.get("last_safe_summary_available"))
    policy["summary_bridge_status"] = dict(summary_bridge_status)
    try:
        hybrid_policy = hybrid_policy_service.evaluate_hybrid_runtime_policy(
            runtime_mode=runtime_mode,
            policy_context=policy,
            attachments=attachments,
        )
    except hybrid_policy_service.HybridPolicyError as error:
        raise RuntimeAttachmentSelectionError(
            error.message,
            reason=error.reason,
            enforcement_state=error.policy_state,
        ) from error
    summary_bridge_policy = hybrid_policy.get("summary_bridge") if isinstance(hybrid_policy.get("summary_bridge"), dict) else {}
    hybrid_policy["summary_bridge"] = {
        **dict(summary_bridge_policy),
        "status": dict(summary_bridge_status),
    }
    placement_enforcement = hybrid_policy.get("placement") if isinstance(hybrid_policy.get("placement"), dict) else {}
    required_attachment_kinds = [
        str(item or "").strip()
        for item in list(placement_enforcement.get("required_attachment_kinds") or [])
        if str(item or "").strip()
    ]
    preferred_attachment_kinds = [
        str(item or "").strip()
        for item in list(placement_enforcement.get("preferred_attachment_kinds") or [])
        if str(item or "").strip()
    ]
    required_capabilities = _list_strings(placement_enforcement.get("required_capabilities"))
    required_connectors = _list_strings(placement_enforcement.get("required_connectors"))
    state_layer_policy = execution_sandbox_service.state_layer_policy(runtime_mode=runtime_mode)

    filtered: List[Dict[str, Any]] = []
    requested_attachment_token = str(requested_attachment_id or "").strip()
    requested_machine_token = str(requested_machine_target or "").strip()
    for attachment in attachments:
        attachment_kind = str(attachment.get("attachment_kind") or "").strip()
        runtime_class = _normalize_runtime_class(attachment.get("runtime_class"))
        if requested_attachment_token and str(attachment.get("attachment_id") or "").strip() != requested_attachment_token:
            continue
        if requested_machine_token and not _matches_requested_machine(attachment, requested_machine_token):
            continue
        if allowed_runtime_classes and runtime_class not in allowed_runtime_classes:
            continue
        if required_attachment_kinds and attachment_kind not in required_attachment_kinds:
            continue
        if runtime_mode == "hosted_secure" and attachment_kind not in {"managed_cloud", "self_hosted_business_node"}:
            continue
        if runtime_mode in {"local_secure", "privileged_device"} and attachment_kind != "local_companion":
            continue
        if not _attachment_capability_match(attachment, required_capabilities):
            continue
        if not _attachment_connector_match(attachment, required_connectors):
            continue
        filtered.append(attachment)

    filtered.sort(
        key=lambda item: (
            _preferred_attachment_kind_rank(item, preferred_attachment_kinds),
            -_matching_attachment_score(item, runtime_profile, preferred_slug),
            0 if bool(item.get("healthy")) else 1,
            0 if bool(item.get("online")) else 1,
            str(item.get("label") or ""),
        )
    )
    selected = filtered[0] if filtered else None

    if runtime_mode == "hosted_secure":
        runtime_class = _normalize_runtime_class(runtime_profile.get("runtime_class"))
        if runtime_class in {"desktop_companion", "mobile_runtime"}:
            raise RuntimeAttachmentSelectionError(
                "Hosted Secure requires a cloud or self-hosted secure runtime profile.",
                reason="invalid_hosted_runtime_profile",
                enforcement_state=hybrid_policy,
            )
        if selected is None:
            raise RuntimeAttachmentSelectionError(
                "No hosted runtime attachment is available for this workspace.",
                reason="no_hosted_runtime_attachment_available",
                enforcement_state=hybrid_policy,
            )
        workspace_record = dict(workspace) if isinstance(workspace, dict) else await control_plane_repository.get_workspace_by_id(workspace_id) or {}
        entitlement_state = entitlements_service.enforce_hosted_runtime_access(
            workspace=workspace_record,
            install=install,
            workspace_id=workspace_id,
            selected_attachment=selected,
        )
        return {
            "runtime_mode": runtime_mode,
            "deployment_mode": str(runtime_inventory.get("deployment_mode") or "cloud_only"),
            "selected_attachment": selected,
            "runtime_attachment_kind": str(selected.get("attachment_kind") or "").strip() or None,
            "machine_target": None,
            "execution_target_selected": "cloud",
            "selection_reason": "Hosted execution selected a secure cloud/self-hosted runtime attachment.",
            "privacy_split": {
                "local_private_memory_stays_local": True,
                "cloud_safe_summaries_only": True,
            },
            "entitlements": entitlement_state,
            "hybrid_rules": {
                "shared_sage_identity": True,
                "local_power_not_leaked_to_hosted_specialists": True,
                "specialists_keep_scoped_runtime_policy": True,
            },
            "hybrid_policy": hybrid_policy,
            "sync_enforcement": {
                "effective_sync_class": hybrid_policy.get("effective_sync_class"),
                "requested_memory_layers": list(hybrid_policy.get("requested_memory_layers") or []),
                "layer_sync_classes": dict(hybrid_policy.get("layer_sync_classes") or {}),
                "summary_bridge": dict(hybrid_policy.get("summary_bridge") or {}),
                "summary_bridge_status": dict(summary_bridge_status),
            },
            "placement_enforcement": {
                "priority_order": list(placement_enforcement.get("priority_order") or []),
                "required_attachment_kinds": required_attachment_kinds,
                "preferred_attachment_kinds": preferred_attachment_kinds,
                "required_capabilities": required_capabilities,
                "required_connectors": required_connectors,
            },
            "degraded_mode": dict(hybrid_policy.get("degraded_mode") or {}),
            "state_layer_policy": state_layer_policy,
        }

    if selected is None:
        raise RuntimeAttachmentSelectionError(
            "No active local runtime attachment matches this specialist runtime profile.",
            reason="no_local_runtime_attachment_available",
            enforcement_state=hybrid_policy,
        )
    if str(selected.get("control_state") or "active").strip().lower() != "active":
        raise RuntimeAttachmentSelectionError(
            "Selected runtime attachment is not active.",
            reason="runtime_attachment_inactive",
            enforcement_state=hybrid_policy,
        )
    if not bool(selected.get("online")):
        raise RuntimeAttachmentSelectionError(
            "Selected runtime attachment is offline.",
            reason="runtime_attachment_offline",
            enforcement_state=hybrid_policy,
        )
    if runtime_mode == "privileged_device" and not bool(policy.get("privileged_runtime_approved")):
        raise RuntimeAttachmentSelectionError(
            "Privileged device execution requires explicit owner approval.",
            reason="privileged_runtime_approval_required",
            enforcement_state=hybrid_policy,
        )
    return {
        "runtime_mode": runtime_mode,
        "deployment_mode": str(runtime_inventory.get("deployment_mode") or "local_only"),
        "selected_attachment": selected,
        "runtime_attachment_kind": str(selected.get("attachment_kind") or "").strip() or None,
        "machine_target": str(selected.get("machine_id") or selected.get("runtime_id") or "").strip() or None,
        "execution_target_selected": "local_companion",
        "selection_reason": "Local execution selected the paired local runtime attachment for scoped device work.",
        "privacy_split": {
            "local_private_memory_stays_local": True,
            "cloud_safe_summaries_only": False,
        },
        "hybrid_rules": {
            "shared_sage_identity": True,
            "local_power_not_leaked_to_hosted_specialists": True,
            "specialists_keep_scoped_runtime_policy": True,
        },
        "hybrid_policy": hybrid_policy,
        "sync_enforcement": {
            "effective_sync_class": hybrid_policy.get("effective_sync_class"),
            "requested_memory_layers": list(hybrid_policy.get("requested_memory_layers") or []),
            "layer_sync_classes": dict(hybrid_policy.get("layer_sync_classes") or {}),
            "summary_bridge": dict(hybrid_policy.get("summary_bridge") or {}),
            "summary_bridge_status": dict(summary_bridge_status),
        },
        "placement_enforcement": {
            "priority_order": list(placement_enforcement.get("priority_order") or []),
            "required_attachment_kinds": required_attachment_kinds,
            "preferred_attachment_kinds": preferred_attachment_kinds,
            "required_capabilities": required_capabilities,
            "required_connectors": required_connectors,
        },
        "degraded_mode": dict(hybrid_policy.get("degraded_mode") or {}),
        "state_layer_policy": state_layer_policy,
    }
