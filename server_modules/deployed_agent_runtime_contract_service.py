from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


RUNTIME_PLACEMENT_MANAGED_CLOUD = "managed_cloud"
RUNTIME_PLACEMENT_HOSTED_HARDWARE_POOL = "hosted_hardware_pool"
RUNTIME_PLACEMENT_CUSTOMER_LOCAL = "customer_local"
RUNTIME_PLACEMENT_CUSTOMER_HOSTED = "customer_hosted"
RUNTIME_PLACEMENTS = {
    RUNTIME_PLACEMENT_MANAGED_CLOUD,
    RUNTIME_PLACEMENT_HOSTED_HARDWARE_POOL,
    RUNTIME_PLACEMENT_CUSTOMER_LOCAL,
    RUNTIME_PLACEMENT_CUSTOMER_HOSTED,
}

RUNTIME_SUPPLIER_EMPYRALIS = "empyralis"
RUNTIME_SUPPLIER_CUSTOMER = "customer"
RUNTIME_SUPPLIER_THIRD_PARTY_CERTIFIED = "third_party_certified"
RUNTIME_SUPPLIERS = {
    RUNTIME_SUPPLIER_EMPYRALIS,
    RUNTIME_SUPPLIER_CUSTOMER,
    RUNTIME_SUPPLIER_THIRD_PARTY_CERTIFIED,
}

COMPUTER_AUTOMATION_CLASSES = {
    "virtual_browser",
    "virtual_desktop",
    "virtual_code_sandbox",
    "local_browser",
    "local_desktop",
}

RUNTIME_PLACEMENT_TARGETS = {
    RUNTIME_PLACEMENT_MANAGED_CLOUD: "cloud",
    RUNTIME_PLACEMENT_HOSTED_HARDWARE_POOL: "cloud",
    RUNTIME_PLACEMENT_CUSTOMER_LOCAL: "local",
    RUNTIME_PLACEMENT_CUSTOMER_HOSTED: "self_hosted",
}

DEFAULT_AGENT_WORKSPACE_BASE = "~/.empyralis/agents"


def _text(value: Any, *, default: str = "") -> str:
    token = str(value or "").strip()
    return token or default


def _bool(value: Any, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    token = str(value or "").strip().lower()
    if not token:
        return default
    return token in {"1", "true", "yes", "on", "enabled"}


def _positive_int(value: Any, *, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    token = _text(value)
    if not token:
        return default
    try:
        parsed = int(token)
    except (TypeError, ValueError):
        return default
    return max(0, parsed)


def _positive_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    token = _text(value)
    if not token:
        return None
    try:
        parsed = round(float(token), 6)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _list_text(value: Any) -> List[str]:
    values = value if isinstance(value, list) else []
    result: List[str] = []
    seen: set[str] = set()
    for item in values:
        token = _text(item).lower()
        if not token or token in seen:
            continue
        seen.add(token)
        result.append(token)
    return result


def _safe_component(value: Any, *, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_.-]+", "_", _text(value))
    token = token.strip("._-")
    return token[:96] or fallback


def _hash_scope(value: Any) -> str:
    token = _text(value)
    if not token:
        return ""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:20]


def normalize_runtime_placement(value: Any, *, runtime_target: Any = None) -> str:
    token = _text(value).lower().replace("-", "_")
    if token in {"managed_cloud", "cloud", "cloud_default", "cloud_worker", "hosted_secure", "cloud_only"}:
        return RUNTIME_PLACEMENT_MANAGED_CLOUD
    if token in {
        "hosted_hardware_pool",
        "empyralis_hosted",
        "empyralis_hosted_device",
        "empyralis_hardware_pool",
        "owned_hardware_pool",
    }:
        return RUNTIME_PLACEMENT_HOSTED_HARDWARE_POOL
    if token in {
        "customer_local",
        "local",
        "local_secure",
        "local_only",
        "local_computer",
        "local_companion",
        "this_computer",
    }:
        return RUNTIME_PLACEMENT_CUSTOMER_LOCAL
    if token in {
        "customer_hosted",
        "self_hosted",
        "self_hosted_business",
        "self_host_runtime",
        "self_hosted_business_node",
        "enterprise_node",
    }:
        return RUNTIME_PLACEMENT_CUSTOMER_HOSTED
    if runtime_target is not None:
        return normalize_runtime_placement(runtime_target)
    return RUNTIME_PLACEMENT_MANAGED_CLOUD


def normalize_runtime_supplier(value: Any, *, runtime_placement: Any = None) -> str:
    token = _text(value).lower().replace("-", "_")
    if token in {"empyralis", "platform", "platform_owned", "empyralis_owned"}:
        return RUNTIME_SUPPLIER_EMPYRALIS
    if token in {"customer", "owner", "workspace_owner", "bring_your_own_runtime", "byor"}:
        return RUNTIME_SUPPLIER_CUSTOMER
    if token in {"third_party_certified", "certified_third_party", "marketplace_runtime_provider"}:
        return RUNTIME_SUPPLIER_THIRD_PARTY_CERTIFIED
    placement = normalize_runtime_placement(runtime_placement)
    if placement in {RUNTIME_PLACEMENT_CUSTOMER_LOCAL, RUNTIME_PLACEMENT_CUSTOMER_HOSTED}:
        return RUNTIME_SUPPLIER_CUSTOMER
    return RUNTIME_SUPPLIER_EMPYRALIS


def runtime_target_for_placement(value: Any) -> str:
    placement = normalize_runtime_placement(value)
    return RUNTIME_PLACEMENT_TARGETS.get(placement, "cloud")


def _runtime_trust_zone(supplier: str, placement: str) -> str:
    if supplier == RUNTIME_SUPPLIER_CUSTOMER:
        return "customer_owned"
    if supplier == RUNTIME_SUPPLIER_THIRD_PARTY_CERTIFIED:
        return "certified_third_party"
    if placement == RUNTIME_PLACEMENT_HOSTED_HARDWARE_POOL:
        return "empyralis_owned_hardware"
    return "empyralis_managed_cloud"


def normalize_computer_automation_config(value: Any) -> Dict[str, Any]:
    payload = dict(value or {}) if isinstance(value, dict) else {}
    enabled = _bool(payload.get("enabled"), default=False)
    runtime_class = _text(payload.get("runtime_class")).lower().replace("-", "_") or None
    if runtime_class not in COMPUTER_AUTOMATION_CLASSES:
        runtime_class = None
    allowed_domains = _list_text(payload.get("allowed_domains"))
    max_concurrent_sessions = _positive_int(payload.get("max_concurrent_sessions"), default=1 if enabled else 0)
    if not enabled:
        max_concurrent_sessions = 0
    daily_budget_usd = _positive_float(payload.get("daily_budget_usd"))
    monthly_budget_usd = _positive_float(payload.get("monthly_budget_usd"))
    return {
        "enabled": enabled,
        "runtime_class": runtime_class if enabled else None,
        "allowed_domains": allowed_domains if enabled else [],
        "max_concurrent_sessions": max_concurrent_sessions,
        "daily_budget_usd": daily_budget_usd if enabled else None,
        "monthly_budget_usd": monthly_budget_usd if enabled else None,
        "requires_owner_approval": _bool(payload.get("requires_owner_approval"), default=True),
        "idle_timeout_seconds": _positive_int(payload.get("idle_timeout_seconds"), default=300 if enabled else 0),
        "max_session_runtime_seconds": _positive_int(
            payload.get("max_session_runtime_seconds"),
            default=1800 if enabled else 0,
        ),
    }


def normalize_runtime_supply_contract(
    value: Any = None,
    *,
    runtime_supplier: Any = None,
    runtime_placement: Any = None,
    runtime_target: Any = None,
    computer_automation: Any = None,
    public_tier: Any = None,
    billing_source: Any = None,
    provider: Any = None,
    model: Any = None,
) -> Dict[str, Any]:
    payload = dict(value or {}) if isinstance(value, dict) else {}
    supplier_payload = payload.get("supplier") if isinstance(payload.get("supplier"), dict) else {}
    placement_payload = payload.get("placement") if isinstance(payload.get("placement"), dict) else {}
    marketplace_payload = payload.get("marketplace_policy") if isinstance(payload.get("marketplace_policy"), dict) else {}
    model_tier_payload = payload.get("model_tier") if isinstance(payload.get("model_tier"), dict) else {}
    provider_binding_payload = payload.get("provider_binding") if isinstance(payload.get("provider_binding"), dict) else {}

    placement = normalize_runtime_placement(
        runtime_placement if runtime_placement is not None else placement_payload.get("kind"),
        runtime_target=runtime_target or placement_payload.get("runtime_target"),
    )
    supplier_kind = normalize_runtime_supplier(
        runtime_supplier if runtime_supplier is not None else supplier_payload.get("kind"),
        runtime_placement=placement,
    )
    automation = normalize_computer_automation_config(
        computer_automation if computer_automation is not None else payload.get("computer_automation")
        if "computer_automation" in payload
        else payload.get("automation")
    )
    tier = _text(public_tier or model_tier_payload.get("public_tier") or payload.get("public_tier") or "pro").lower()
    if tier not in {"light", "pro", "max", "local_ai", "my_api_key", "my_ai_account"}:
        tier = "pro"
    resolved_billing_source = _text(billing_source or model_tier_payload.get("billing_source") or "empyralis_credits")
    third_party_runtime_allowed = _bool(marketplace_payload.get("third_party_runtime_allowed"), default=False)
    visibility = _text(marketplace_payload.get("visibility"), default="private").lower()
    install_blockers: List[str] = [
        _text(item)
        for item in list(marketplace_payload.get("install_blockers") or [])
        if _text(item)
    ]
    if supplier_kind == RUNTIME_SUPPLIER_CUSTOMER and visibility == "marketplace":
        install_blockers.append("customer_runtime_requires_installer_opt_in")
    if supplier_kind == RUNTIME_SUPPLIER_THIRD_PARTY_CERTIFIED and not third_party_runtime_allowed:
        install_blockers.append("third_party_runtime_not_allowed")

    return {
        "schema_version": 1,
        "supplier": {
            "kind": supplier_kind,
            "id": _text(supplier_payload.get("id"), default=supplier_kind),
            "label": _text(supplier_payload.get("label"), default="Empyralis" if supplier_kind == RUNTIME_SUPPLIER_EMPYRALIS else "Customer runtime"),
            "owner_workspace_id": _text(supplier_payload.get("owner_workspace_id")) or None,
        },
        "placement": {
            "kind": placement,
            "runtime_target": runtime_target_for_placement(placement),
            "trust_zone": _runtime_trust_zone(supplier_kind, placement),
        },
        "computer_automation": automation,
        "marketplace_policy": {
            "visibility": visibility,
            "third_party_runtime_allowed": third_party_runtime_allowed,
            "review_state": _text(marketplace_payload.get("review_state"), default="not_submitted"),
            "verification_status": _text(marketplace_payload.get("verification_status"), default="unverified"),
            "install_eligible": not install_blockers,
            "install_blockers": sorted(set(install_blockers)),
        },
        "model_tier": {
            "public_tier": tier,
            "public_label": _text(model_tier_payload.get("public_label"), default=tier.replace("_", " ").title()),
            "billing_source": resolved_billing_source,
        },
        "provider_binding": {
            "internal_provider": _text(provider or provider_binding_payload.get("internal_provider")) or None,
            "internal_model": _text(model or provider_binding_payload.get("internal_model")) or None,
            "expose_provider_model_to_ordinary_ui": _bool(
                provider_binding_payload.get("expose_provider_model_to_ordinary_ui"),
                default=tier in {"local_ai", "my_api_key", "my_ai_account"},
            ),
        },
    }


def build_runtime_provider_spec(
    *,
    provider_id: Any,
    supplier_kind: Any,
    placement: Any,
    label: Any = None,
    capabilities: Any = None,
    available_slots: Any = 0,
    max_concurrency: Any = 0,
    estimated_unit_cost: Any = 0,
    trust_tier: Any = "standard",
    supports_checkpoint: Any = False,
    preemptible: Any = False,
    region: Any = None,
) -> Dict[str, Any]:
    placement_kind = normalize_runtime_placement(placement)
    supplier = normalize_runtime_supplier(supplier_kind, runtime_placement=placement_kind)
    slots = _positive_int(available_slots, default=0)
    max_slots = _positive_int(max_concurrency, default=slots)
    return {
        "provider_id": _text(provider_id, default=f"{supplier}:{placement_kind}"),
        "supplier_kind": supplier,
        "placement": placement_kind,
        "runtime_target": runtime_target_for_placement(placement_kind),
        "label": _text(label, default=f"{supplier} {placement_kind}".replace("_", " ").title()),
        "capabilities": _list_text(capabilities),
        "available_slots": slots,
        "max_concurrency": max_slots,
        "estimated_unit_cost": float(_positive_float(estimated_unit_cost) or 0.0),
        "trust_tier": _text(trust_tier, default="standard"),
        "supports_checkpoint": _bool(supports_checkpoint),
        "preemptible": _bool(preemptible),
        "region": _text(region) or None,
    }


def choose_runtime_provider_for_job(
    providers: Any,
    *,
    required_placement: Any = None,
    required_capabilities: Any = None,
    max_estimated_unit_cost: Any = None,
    allow_preemptible: bool = False,
) -> Dict[str, Any]:
    required = normalize_runtime_placement(required_placement) if required_placement else None
    capabilities = set(_list_text(required_capabilities))
    budget = _positive_float(max_estimated_unit_cost)
    candidates: List[Dict[str, Any]] = []
    for raw_provider in list(providers or []):
        provider = build_runtime_provider_spec(**raw_provider) if isinstance(raw_provider, dict) else None
        if not provider:
            continue
        if required and provider["placement"] != required:
            continue
        if capabilities and not capabilities.issubset(set(provider["capabilities"])):
            continue
        if not allow_preemptible and provider["preemptible"]:
            continue
        if budget is not None and float(provider["estimated_unit_cost"]) > budget:
            continue
        if int(provider["available_slots"]) <= 0:
            continue
        candidates.append(provider)
    if not candidates:
        return {
            "status": "queued",
            "reason": "waiting_for_capacity",
            "provider": None,
        }
    candidates.sort(
        key=lambda item: (
            float(item["estimated_unit_cost"]),
            1 if item["preemptible"] else 0,
            -int(item["available_slots"]),
            item["provider_id"],
        )
    )
    selected = candidates[0]
    return {
        "status": "selected",
        "reason": "capacity_available",
        "provider": selected,
        "estimated_unit_cost": selected["estimated_unit_cost"],
    }


def build_hardware_pool_job_contract(
    *,
    job_id: Any,
    supplier_id: Any,
    hardware_pool_id: Any,
    checkpoint_uri: Any = None,
    checkpoint_generation: Any = 0,
    preemptible: Any = False,
    preemption_deadline_at: Any = None,
    resume_target: Any = None,
) -> Dict[str, Any]:
    return {
        "job_id": _text(job_id, default="job"),
        "supplier_id": _text(supplier_id, default=RUNTIME_SUPPLIER_EMPYRALIS),
        "hardware_pool_id": _text(hardware_pool_id, default="default"),
        "checkpoint": {
            "enabled": bool(_text(checkpoint_uri)),
            "uri": _text(checkpoint_uri) or None,
            "generation": _positive_int(checkpoint_generation, default=0),
        },
        "preemption": {
            "preemptible": _bool(preemptible),
            "deadline_at": _text(preemption_deadline_at) or None,
            "resume_target": _text(resume_target) or None,
            "safe_resume_required": True,
        },
    }


def _domain_from_value(value: Any) -> str:
    token = _text(value).lower()
    if not token:
        return ""
    parsed = urlparse(token if "://" in token else f"https://{token}")
    return (parsed.hostname or token).strip(".").lower()


def computer_automation_guardrail_state(
    config: Any,
    *,
    requested_domain: Any = None,
    estimated_cost_usd: Optional[float] = None,
    active_sessions: int = 0,
) -> Dict[str, Any]:
    policy = normalize_computer_automation_config(config)
    reasons: List[str] = []
    if not policy["enabled"]:
        reasons.append("computer_automation_disabled")
    domain = _domain_from_value(requested_domain)
    allowed_domains = [_domain_from_value(item) for item in policy["allowed_domains"]]
    if policy["enabled"] and domain:
        if not any(domain == allowed or domain.endswith(f".{allowed}") for allowed in allowed_domains if allowed):
            reasons.append("domain_not_allowed")
    if policy["enabled"] and not allowed_domains:
        reasons.append("allowed_domain_required")
    if policy["enabled"] and int(active_sessions or 0) >= int(policy["max_concurrent_sessions"] or 0):
        reasons.append("concurrency_limit_reached")
    cost = float(estimated_cost_usd or 0)
    daily_budget = policy.get("daily_budget_usd")
    monthly_budget = policy.get("monthly_budget_usd")
    if policy["enabled"] and cost > 0:
        if daily_budget is not None and cost > float(daily_budget):
            reasons.append("daily_budget_exceeded")
        if monthly_budget is not None and cost > float(monthly_budget):
            reasons.append("monthly_budget_exceeded")
    return {
        "allowed": not reasons,
        "reasons": reasons,
        "policy": policy,
        "requested_domain": domain or None,
    }


def build_deployed_agent_workspace_contract(
    *,
    tenant_id: Any,
    workspace_id: Any,
    deployed_agent_id: Any,
    external_user_id: Any = None,
    session_id: Any = None,
    base_dir: Any = DEFAULT_AGENT_WORKSPACE_BASE,
) -> Dict[str, Any]:
    tenant = _safe_component(tenant_id, fallback="tenant")
    workspace = _safe_component(workspace_id, fallback="workspace")
    agent = _safe_component(deployed_agent_id, fallback="agent")
    root = Path(_text(base_dir, default=DEFAULT_AGENT_WORKSPACE_BASE)).expanduser() / tenant / workspace / agent
    customer_hash = _hash_scope(external_user_id)
    session_hash = _hash_scope(session_id)
    customer_root = root / "customers" / customer_hash if customer_hash else None
    session_root = customer_root / "sessions" / session_hash if customer_root is not None and session_hash else None
    return {
        "schema_version": 1,
        "workspace_root": str(root),
        "files_root": str(root / "files"),
        "artifacts_root": str(root / "artifacts"),
        "browser_profile_root": str(root / "browser_profile"),
        "logs_root": str(root / "logs"),
        "state_root": str(root / "state"),
        "customer_scope_key": customer_hash or None,
        "customer_root": str(customer_root) if customer_root is not None else None,
        "session_scope_key": session_hash or None,
        "session_root": str(session_root) if session_root is not None else None,
        "isolation": {
            "scope": "deployed_agent",
            "cross_agent_read": False,
            "cross_customer_read": False,
            "host_filesystem_default": "workspace_root_only",
            "sage_memory_access": False,
        },
    }
