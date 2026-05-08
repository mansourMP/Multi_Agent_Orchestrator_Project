from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


RUNTIME_PLACEMENT_MANAGED_CLOUD = "managed_cloud"
RUNTIME_PLACEMENT_CUSTOMER_LOCAL = "customer_local"
RUNTIME_PLACEMENT_CUSTOMER_HOSTED = "customer_hosted"
RUNTIME_PLACEMENTS = {
    RUNTIME_PLACEMENT_MANAGED_CLOUD,
    RUNTIME_PLACEMENT_CUSTOMER_LOCAL,
    RUNTIME_PLACEMENT_CUSTOMER_HOSTED,
}

COMPUTER_AUTOMATION_CLASSES = {
    "virtual_browser",
    "virtual_desktop",
    "virtual_code_sandbox",
    "local_browser",
    "local_desktop",
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


def runtime_target_for_placement(value: Any) -> str:
    placement = normalize_runtime_placement(value)
    if placement == RUNTIME_PLACEMENT_CUSTOMER_LOCAL:
        return "local"
    if placement == RUNTIME_PLACEMENT_CUSTOMER_HOSTED:
        return "self_hosted"
    return "cloud"


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
