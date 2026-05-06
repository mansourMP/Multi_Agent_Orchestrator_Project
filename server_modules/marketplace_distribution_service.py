from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server_modules import app_registry_api
from server_modules import mini_apps_service
from server_modules import provider_profiles
from server_modules import workspace_context


MARKETPLACE_DISTRIBUTION_VERSION = 1
PACKAGE_KINDS = {"agent_template", "app", "connector", "mini_app", "provider", "skill"}
REVIEW_STATES = {"pending", "approved", "restricted"}
VERIFICATION_STATUSES = {"unverified", "partner", "verified"}
HEALTH_STATES = {"healthy", "degraded", "setup_required"}
POLICY_POSTURES = {"governed", "restricted"}
MONETIZATION_KINDS = {"free", "metered", "subscription", "revenue_share"}
INSTALL_TARGETS = {
    "agent_template": "template_catalog",
    "app": "app_registry",
    "connector": "connector_catalog",
    "mini_app": "mini_app_registry",
    "provider": "provider_catalog",
    "skill": "skill_catalog",
}
DEFAULT_CATEGORIES = {
    "agent_template": "Specialist template",
    "app": "Applications",
    "connector": "Connectors",
    "mini_app": "Mini Apps",
    "provider": "Models",
    "skill": "Skills",
}


PREVIEW_MARKETPLACE_PACKAGES: List[Dict[str, Any]] = [
    {
        "package_id": "preview-restaurant-orders",
        "kind": "app",
        "label": "Restaurant Orders",
        "description": "Telegram ordering template with menu lookup, order confirmation, and human escalation.",
        "category": "Specialist template",
        "publisher": {"publisher_id": "empyralis", "label": "Empyralis", "website": "https://empyralis.dev"},
        "onboarding": {"docs_url": "/docs/studio-marketplace-ux-boundary-2026-04-30.md"},
        "verification_status": "verified",
        "review_state": "approved",
        "health_state": "healthy",
        "policy_posture": "governed",
        "billing": {
            "monetization_kind": "free",
            "accounting_hook": {"ledger_key": "studio.restaurant_orders", "hook_kind": "template_install"},
        },
        "app": {
            "app_id": "studio.restaurant_orders",
            "hosted_url": "/w/{workspace_id}/studio?template=restaurant_orders",
            "version": "0.1.0",
            "release_channel": "preview",
            "permissions": ["telegram:send", "spreadsheet:read"],
            "bridge_contracts": {"messages": ["read", "write"], "catalog": ["read"]},
        },
    },
    {
        "package_id": "preview-auto-parts-sales",
        "kind": "app",
        "label": "Auto Parts Sales",
        "description": "Qualifies car model, requested part, catalog availability, and next customer action.",
        "category": "Specialist template",
        "publisher": {"publisher_id": "empyralis", "label": "Empyralis", "website": "https://empyralis.dev"},
        "onboarding": {"docs_url": "/docs/studio-marketplace-ux-boundary-2026-04-30.md"},
        "verification_status": "verified",
        "review_state": "approved",
        "health_state": "healthy",
        "policy_posture": "governed",
        "billing": {
            "monetization_kind": "free",
            "accounting_hook": {"ledger_key": "studio.auto_parts_sales", "hook_kind": "template_install"},
        },
        "app": {
            "app_id": "studio.auto_parts_sales",
            "hosted_url": "/w/{workspace_id}/studio?template=auto_parts_sales",
            "version": "0.1.0",
            "release_channel": "preview",
            "permissions": ["telegram:send", "spreadsheet:read"],
            "bridge_contracts": {"messages": ["read", "write"], "catalog": ["read"]},
        },
    },
    {
        "package_id": "preview-spreadsheet-catalog",
        "kind": "app",
        "label": "Spreadsheet Catalog",
        "description": "Answers product, SKU, menu, or inventory questions from a trusted spreadsheet.",
        "category": "Data",
        "publisher": {"publisher_id": "empyralis", "label": "Empyralis", "website": "https://empyralis.dev"},
        "onboarding": {"docs_url": "/docs/studio-marketplace-ux-boundary-2026-04-30.md"},
        "verification_status": "verified",
        "review_state": "approved",
        "health_state": "healthy",
        "policy_posture": "governed",
        "billing": {
            "monetization_kind": "free",
            "accounting_hook": {"ledger_key": "tool.spreadsheet_catalog", "hook_kind": "package_install"},
        },
        "app": {
            "app_id": "tool.spreadsheet_catalog",
            "hosted_url": "/w/{workspace_id}/studio?template=spreadsheet_catalog",
            "version": "0.1.0",
            "release_channel": "preview",
            "permissions": ["spreadsheet:read", "spreadsheet:append"],
            "bridge_contracts": {"spreadsheet": ["read", "write"]},
        },
    },
    {
        "package_id": "preview-web-search",
        "kind": "app",
        "label": "Web Search",
        "description": "Lets Sage search the web with audit-visible tool calls and governed usage.",
        "category": "Tool",
        "publisher": {"publisher_id": "empyralis", "label": "Empyralis", "website": "https://empyralis.dev"},
        "onboarding": {"docs_url": "/docs/studio-marketplace-ux-boundary-2026-04-30.md"},
        "verification_status": "verified",
        "review_state": "approved",
        "health_state": "healthy",
        "policy_posture": "governed",
        "billing": {
            "monetization_kind": "metered",
            "accounting_hook": {"ledger_key": "tool.web_search", "hook_kind": "tool_usage"},
        },
        "app": {
            "app_id": "tool.web_search",
            "hosted_url": "/tools/web-search",
            "version": "0.1.0",
            "release_channel": "preview",
            "permissions": ["web:search"],
            "bridge_contracts": {"web": ["search"]},
        },
    },
    {
        "package_id": "preview-image-generation",
        "kind": "app",
        "label": "Image Generation",
        "description": "Image generation package using configured BYOK or hosted media credits.",
        "category": "Media",
        "publisher": {"publisher_id": "empyralis", "label": "Empyralis", "website": "https://empyralis.dev"},
        "onboarding": {"docs_url": "/docs/ai-os-five-phase-execution-plan-2026-04-30.md"},
        "verification_status": "partner",
        "review_state": "approved",
        "health_state": "setup_required",
        "policy_posture": "governed",
        "billing": {
            "monetization_kind": "metered",
            "accounting_hook": {"ledger_key": "tool.generate_image", "hook_kind": "tool_usage"},
        },
        "app": {
            "app_id": "tool.generate_image",
            "hosted_url": "/tools/generate-image",
            "version": "0.1.0",
            "release_channel": "preview",
            "permissions": ["media:image_generate"],
            "bridge_contracts": {"media": ["image_generate"]},
        },
    },
    {
        "package_id": "preview-deepseek-provider",
        "kind": "provider",
        "label": "DeepSeek Provider",
        "description": "BYOK model provider package for DeepSeek chat and tool-capable generation.",
        "category": "Models",
        "publisher": {"publisher_id": "deepseek", "label": "DeepSeek", "website": "https://platform.deepseek.com"},
        "onboarding": {"docs_url": "https://platform.deepseek.com"},
        "verification_status": "partner",
        "review_state": "approved",
        "health_state": "setup_required",
        "policy_posture": "governed",
        "billing": {
            "monetization_kind": "free",
            "accounting_hook": {"ledger_key": "provider.deepseek", "hook_kind": "provider_usage"},
        },
        "provider": {
            "provider_id": "marketplace_deepseek_preview",
            "default_model": "deepseek-chat",
            "auth_modes": ["api_key"],
            "privacy_posture": "Cloud provider. User supplies key or uses platform-hosted credits where available.",
            "capability_labels": ["chat", "tools"],
            "models": [{"id": "deepseek-chat", "label": "DeepSeek Chat", "supports_tools": True}],
        },
    },
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _distribution_state_path(workspace_id: str) -> Path:
    return workspace_context.workspace_scope_dir(workspace_id) / "marketplace_distribution.json"


def _normalize_workspace_id(workspace_id: Any) -> str:
    return str(workspace_id or "default").strip() or "default"


def _slug_token(value: Any, *, allow_dot: bool = False) -> str:
    pattern = r"[^a-z0-9_.-]+" if allow_dot else r"[^a-z0-9_-]+"
    token = re.sub(pattern, "-", str(value or "").strip().lower())
    token = re.sub(r"-{2,}", "-", token).strip("-")
    return token


def _compact_text(value: Any, *, limit: int = 600) -> str:
    token = " ".join(str(value or "").split()).strip()
    if len(token) <= limit:
        return token
    return f"{token[: max(0, limit - 1)].rstrip()}…"


def _normalize_list_of_strings(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    normalized: List[str] = []
    seen: set[str] = set()
    for item in value:
        token = str(item or "").strip()
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _default_state() -> Dict[str, Any]:
    return {
        "version": MARKETPLACE_DISTRIBUTION_VERSION,
        "updated_at": _utc_now_iso(),
        "packages": {},
        "installs": {},
    }


def _safe_read_state(workspace_id: str) -> Dict[str, Any]:
    path = _distribution_state_path(workspace_id)
    if not path.exists():
        payload = _default_state()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        return payload
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    packages = raw.get("packages") if isinstance(raw.get("packages"), dict) else {}
    installs = raw.get("installs") if isinstance(raw.get("installs"), dict) else {}
    return {
        "version": int(raw.get("version") or MARKETPLACE_DISTRIBUTION_VERSION),
        "updated_at": str(raw.get("updated_at") or _utc_now_iso()).strip() or _utc_now_iso(),
        "packages": packages,
        "installs": installs,
    }


def _read_state_if_exists(workspace_id: str) -> Dict[str, Any]:
    path = _distribution_state_path(workspace_id)
    if not path.exists():
        return _default_state()
    return _safe_read_state(workspace_id)


def _save_state(workspace_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    path = _distribution_state_path(workspace_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = {
        "version": MARKETPLACE_DISTRIBUTION_VERSION,
        "updated_at": _utc_now_iso(),
        "packages": dict(payload.get("packages") or {}),
        "installs": dict(payload.get("installs") or {}),
    }
    path.write_text(json.dumps(normalized, indent=2, sort_keys=True), encoding="utf-8")
    return normalized


def _normalize_review_state(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in REVIEW_STATES else "pending"


def _normalize_verification_status(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in VERIFICATION_STATUSES else "unverified"


def _normalize_health_state(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in HEALTH_STATES else "setup_required"


def _normalize_policy_posture(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in POLICY_POSTURES else "governed"


def _normalize_monetization_kind(value: Any) -> str:
    token = str(value or "").strip().lower()
    return token if token in MONETIZATION_KINDS else "free"


def _normalize_publisher(value: Any, *, package_id: str) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    publisher_id = _slug_token(payload.get("publisher_id") or payload.get("id") or package_id, allow_dot=True)
    label = _compact_text(payload.get("label") or payload.get("name") or publisher_id or "Unknown publisher", limit=160)
    return {
        "publisher_id": publisher_id or package_id,
        "label": label or package_id,
        "website": str(payload.get("website") or "").strip() or None,
        "support_url": str(payload.get("support_url") or "").strip() or None,
        "docs_url": str(payload.get("docs_url") or "").strip() or None,
        "contact_email": str(payload.get("contact_email") or "").strip().lower() or None,
    }


def _normalize_billing(value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    revenue_share_bps = int(payload.get("revenue_share_bps") or 0) if str(payload.get("revenue_share_bps") or "").strip() else 0
    revenue_share_bps = max(0, min(revenue_share_bps, 10000))
    return {
        "monetization_kind": _normalize_monetization_kind(payload.get("monetization_kind")),
        "billing_product_id": str(payload.get("billing_product_id") or "").strip() or None,
        "settlement_provider": str(payload.get("settlement_provider") or "").strip() or None,
        "revenue_share_bps": revenue_share_bps,
        "currency": str(payload.get("currency") or "usd").strip().lower() or "usd",
        "accounting_hook": {
            "ledger_key": str(_coerce_dict(payload.get("accounting_hook")).get("ledger_key") or "").strip() or None,
            "hook_kind": str(_coerce_dict(payload.get("accounting_hook")).get("hook_kind") or "distribution_install").strip() or "distribution_install",
        },
    }


def _normalize_onboarding(value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    return {
        "docs_url": str(payload.get("docs_url") or "").strip() or None,
        "terms_url": str(payload.get("terms_url") or "").strip() or None,
        "privacy_url": str(payload.get("privacy_url") or "").strip() or None,
        "support_url": str(payload.get("support_url") or "").strip() or None,
        "contact_email": str(payload.get("contact_email") or "").strip().lower() or None,
        "installation_notes": _compact_text(payload.get("installation_notes"), limit=500) or None,
    }


def _normalize_model_entry(provider_id: str, raw: Any) -> Dict[str, Any]:
    payload = _coerce_dict(raw)
    model_id = str(payload.get("id") or payload.get("model_id") or "").strip()
    if not model_id:
        raise ValueError("Marketplace provider models require an id.")
    reasoning_levels = [
        str(level).strip().lower()
        for level in payload.get("reasoning_levels", [])
        if str(level).strip()
    ] if isinstance(payload.get("reasoning_levels"), list) else []
    return {
        "id": model_id,
        "label": str(payload.get("label") or model_id).strip() or model_id,
        "provider": provider_id,
        "context_window_tokens": int(payload.get("context_window_tokens") or 0) or None,
        "input_cost_per_1k_usd": float(payload.get("input_cost_per_1k_usd") or 0.0),
        "output_cost_per_1k_usd": float(payload.get("output_cost_per_1k_usd") or 0.0),
        "supports_tools": bool(payload.get("supports_tools")),
        "supports_reasoning": bool(payload.get("supports_reasoning")),
        "reasoning_levels": reasoning_levels,
        "capability_labels": _normalize_list_of_strings(payload.get("capability_labels")),
    }


def _normalize_provider_payload(package_id: str, value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    provider_id = _slug_token(payload.get("provider_id") or package_id, allow_dot=False)
    if not provider_id:
        raise ValueError("Marketplace provider packages require a provider_id.")
    if provider_profiles.provider_catalog_entry(provider_id):
        raise ValueError(f"Provider '{provider_id}' already exists in the built-in provider catalog.")
    raw_models = payload.get("models") if isinstance(payload.get("models"), list) else []
    if not raw_models:
        raise ValueError("Marketplace provider packages require at least one model.")
    models = [_normalize_model_entry(provider_id, item) for item in raw_models]
    return {
        "provider_id": provider_id,
        "default_model": str(payload.get("default_model") or models[0]["id"]).strip() or models[0]["id"],
        "auth_modes": _normalize_list_of_strings(payload.get("auth_modes")) or ["api_key"],
        "privacy_posture": _compact_text(payload.get("privacy_posture"), limit=220) or "Third-party marketplace provider.",
        "jurisdiction": str(payload.get("jurisdiction") or "").strip() or None,
        "residency": str(payload.get("residency") or "").strip() or None,
        "enterprise_risk_note": _compact_text(payload.get("enterprise_risk_note"), limit=260) or None,
        "capability_labels": _normalize_list_of_strings(payload.get("capability_labels")),
        "models": models,
    }


def _normalize_agent_template_payload(package_id: str, value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    template_id = _slug_token(payload.get("template_id") or package_id)
    if not template_id:
        raise ValueError("Marketplace agent template packages require a template_id.")
    return {
        "template_id": template_id,
        "version": str(payload.get("version") or "1.0.0").strip() or "1.0.0",
        "specialist_kind": str(payload.get("specialist_kind") or "custom").strip().lower() or "custom",
        "required_connectors": _normalize_list_of_strings(payload.get("required_connectors")),
        "suggested_tools": _normalize_list_of_strings(payload.get("suggested_tools")),
        "setup_schema": _coerce_dict(payload.get("setup_schema")),
        "launch_checklist": _normalize_list_of_strings(payload.get("launch_checklist")),
        "context_envelope": _coerce_dict(payload.get("context_envelope")),
    }


def _normalize_app_payload(package_id: str, value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    app_id = _slug_token(payload.get("app_id") or package_id)
    if not app_id:
        raise ValueError("Marketplace app packages require an app_id.")
    hosted_url = str(payload.get("hosted_url") or "").strip()
    if not hosted_url:
        raise ValueError("Marketplace app packages require a hosted_url.")
    release_channel = str(payload.get("release_channel") or "stable").strip().lower() or "stable"
    return {
        "app_id": app_id,
        "version": str(payload.get("version") or "1.0.0").strip() or "1.0.0",
        "latest_version": str(payload.get("latest_version") or payload.get("version") or "1.0.0").strip() or "1.0.0",
        "release_channel": release_channel,
        "hosted_url": hosted_url,
        "embed_kind": str(payload.get("embed_kind") or "iframe").strip().lower() or "iframe",
        "entry_route": str(payload.get("entry_route") or f"/applications/{app_id}").strip() or f"/applications/{app_id}",
        "icon": str(payload.get("icon") or "apps").strip() or "apps",
        "permissions": _normalize_list_of_strings(payload.get("permissions")),
        "allowed_origins": _normalize_list_of_strings(payload.get("allowed_origins")),
        "bridge_contracts": {
            str(key).strip(): _normalize_list_of_strings(item)
            for key, item in _coerce_dict(payload.get("bridge_contracts")).items()
            if str(key).strip()
        },
        "context_envelope": _coerce_dict(payload.get("context_envelope")),
    }


def _normalize_connector_payload(package_id: str, value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    connector_id = _slug_token(payload.get("connector_id") or package_id)
    if not connector_id:
        raise ValueError("Marketplace connector packages require a connector_id.")
    connector_class = str(payload.get("connector_class") or "api_connector").strip().lower() or "api_connector"
    return {
        "connector_id": connector_id,
        "version": str(payload.get("version") or "1.0.0").strip() or "1.0.0",
        "connector_class": connector_class,
        "auth_modes": _normalize_list_of_strings(payload.get("auth_modes")) or ["oauth"],
        "scopes": _normalize_list_of_strings(payload.get("scopes")),
        "actions": _normalize_list_of_strings(payload.get("actions")),
        "egress_domains": _normalize_list_of_strings(payload.get("egress_domains")),
        "data_classes": _normalize_list_of_strings(payload.get("data_classes")),
    }


def _normalize_skill_payload(package_id: str, value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    skill_id = _slug_token(payload.get("skill_id") or package_id)
    if not skill_id:
        raise ValueError("Marketplace skill packages require a skill_id.")
    return {
        "skill_id": skill_id,
        "version": str(payload.get("version") or "1.0.0").strip() or "1.0.0",
        "runtime": str(payload.get("runtime") or "hosted").strip().lower() or "hosted",
        "permissions": _normalize_list_of_strings(payload.get("permissions")),
        "tool_contracts": {
            str(key).strip(): _normalize_list_of_strings(item)
            for key, item in _coerce_dict(payload.get("tool_contracts")).items()
            if str(key).strip()
        },
        "required_connectors": _normalize_list_of_strings(payload.get("required_connectors")),
    }


def _normalize_package_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    package_kind = str(payload.get("kind") or "").strip().lower()
    if package_kind not in PACKAGE_KINDS:
        raise ValueError("Marketplace package kind must be one of: agent_template, app, connector, mini_app, provider, skill.")
    inferred_package_id = payload.get("package_id") or payload.get("id") or payload.get("slug")
    if not inferred_package_id and package_kind == "app":
        inferred_package_id = _coerce_dict(payload.get("app")).get("app_id")
    if not inferred_package_id and package_kind == "agent_template":
        inferred_package_id = _coerce_dict(payload.get("agent_template")).get("template_id")
    if not inferred_package_id and package_kind == "connector":
        inferred_package_id = _coerce_dict(payload.get("connector")).get("connector_id")
    if not inferred_package_id and package_kind == "mini_app":
        inferred_package_id = _coerce_dict(payload.get("mini_app")).get("app_id")
    if not inferred_package_id and package_kind == "provider":
        inferred_package_id = _coerce_dict(payload.get("provider")).get("provider_id")
    if not inferred_package_id and package_kind == "skill":
        inferred_package_id = _coerce_dict(payload.get("skill")).get("skill_id")
    if not inferred_package_id:
        inferred_package_id = payload.get("label")
    package_id = _slug_token(inferred_package_id, allow_dot=True)
    if not package_id:
        raise ValueError("Marketplace package_id is required.")
    label = _compact_text(payload.get("label"), limit=160)
    if not label:
        raise ValueError("Marketplace package label is required.")
    description = _compact_text(payload.get("description"), limit=600)
    if not description:
        raise ValueError("Marketplace package description is required.")
    if package_kind == "agent_template":
        package_payload = _normalize_agent_template_payload(package_id, payload.get("agent_template"))
    elif package_kind == "app":
        package_payload = _normalize_app_payload(package_id, payload.get("app"))
    elif package_kind == "connector":
        package_payload = _normalize_connector_payload(package_id, payload.get("connector"))
    elif package_kind == "mini_app":
        package_payload = _normalize_app_payload(package_id, payload.get("mini_app"))
    elif package_kind == "skill":
        package_payload = _normalize_skill_payload(package_id, payload.get("skill"))
    else:
        package_payload = _normalize_provider_payload(package_id, payload.get("provider"))
    install_target = INSTALL_TARGETS[package_kind]
    return {
        "package_id": package_id,
        "kind": package_kind,
        "label": label,
        "description": description,
        "category": str(payload.get("category") or DEFAULT_CATEGORIES[package_kind]).strip() or DEFAULT_CATEGORIES[package_kind],
        "publisher": _normalize_publisher(payload.get("publisher"), package_id=package_id),
        "onboarding": _normalize_onboarding(payload.get("onboarding")),
        "verification_status": _normalize_verification_status(payload.get("verification_status")),
        "review_state": _normalize_review_state(payload.get("review_state")),
        "health_state": _normalize_health_state(payload.get("health_state")),
        "policy_posture": _normalize_policy_posture(payload.get("policy_posture")),
        "approval_required": bool(payload.get("approval_required")),
        "install_target": install_target,
        "billing": _normalize_billing(payload.get("billing")),
        "analytics": {
            "install_count": 0,
            "runtime_event_count": 0,
            "last_install_at": None,
            "last_runtime_at": None,
        },
        package_kind: package_payload,
        "updated_at": _utc_now_iso(),
    }


def _preview_marketplace_packages() -> Dict[str, Dict[str, Any]]:
    packages: Dict[str, Dict[str, Any]] = {}
    seed_packages: List[Dict[str, Any]] = []
    try:
        from server_modules import studio_proof_agent_seed_service

        seed_packages = studio_proof_agent_seed_service.build_studio_proof_agent_marketplace_package_contracts()
    except Exception:
        seed_packages = []
    for payload in [*PREVIEW_MARKETPLACE_PACKAGES, *seed_packages]:
        try:
            package = _normalize_package_payload(payload)
        except ValueError:
            continue
        package["preview_only"] = True
        package["install_target"] = "preview"
        package["analytics"] = {
            "install_count": 0,
            "runtime_event_count": 0,
            "last_install_at": None,
            "last_runtime_at": None,
        }
        package["updated_at"] = "preview"
        packages[str(package.get("package_id") or "").strip()] = package
    return packages


def _ensure_app_registry_exports() -> None:
    required = ("ORION_APP_REGISTRY_FILE", "_safe_read_json", "_safe_write_json", "_utc_now_iso")
    if all(hasattr(app_registry_api, name) for name in required):
        return
    import server as _server  # local import to avoid startup cycles

    for name in required:
        setattr(app_registry_api, name, getattr(_server, name))


def _upsert_marketplace_app_registry_item(package: Dict[str, Any], *, installed: bool) -> Dict[str, Any]:
    _ensure_app_registry_exports()
    app_payload = _coerce_dict(package.get("app"))
    app_id = str(app_payload.get("app_id") or "").strip()
    if not app_id:
        raise ValueError("Marketplace app payload is missing app_id.")
    with app_registry_api.APP_REGISTRY_LOCK:
        data = app_registry_api._load_app_registry()
        app_item = app_registry_api._find_app(data, app_id)
        if app_item is None:
            app_item = {
                "id": app_id,
                "name": str(package.get("label") or app_id).strip() or app_id,
                "description": str(package.get("description") or "").strip(),
                "icon": str(app_payload.get("icon") or "apps").strip() or "apps",
                "category": str(package.get("category") or "Marketplace").strip() or "Marketplace",
                "status": "available",
                "version": str(app_payload.get("version") or "1.0.0").strip() or "1.0.0",
                "latest_version": str(app_payload.get("latest_version") or app_payload.get("version") or "1.0.0").strip() or "1.0.0",
                "publisher": str(_coerce_dict(package.get("publisher")).get("label") or "marketplace").strip() or "marketplace",
                "entry_route": str(app_payload.get("entry_route") or f"/applications/{app_id}").strip() or f"/applications/{app_id}",
                "permissions": list(app_payload.get("permissions") or []),
                "source": "third_party_marketplace",
            }
            data.setdefault("apps", []).append(app_item)
        app_item.update(
            {
                "name": str(package.get("label") or app_item.get("name") or app_id).strip() or app_id,
                "description": str(package.get("description") or app_item.get("description") or "").strip(),
                "category": str(package.get("category") or app_item.get("category") or "Marketplace").strip() or "Marketplace",
                "version": str(app_payload.get("version") or app_item.get("version") or "1.0.0").strip() or "1.0.0",
                "latest_version": str(app_payload.get("latest_version") or app_payload.get("version") or app_item.get("latest_version") or "1.0.0").strip() or "1.0.0",
                "publisher": str(_coerce_dict(package.get("publisher")).get("label") or app_item.get("publisher") or "marketplace").strip() or "marketplace",
                "entry_route": str(app_payload.get("entry_route") or app_item.get("entry_route") or f"/applications/{app_id}").strip() or f"/applications/{app_id}",
                "permissions": list(app_payload.get("permissions") or []),
                "source": "third_party_marketplace",
                "package_id": str(package.get("package_id") or "").strip() or None,
                "install_source": "marketplace_distribution",
                "release_channel": str(app_payload.get("release_channel") or "stable").strip() or "stable",
                "distribution_metadata": {
                    "verification_status": package.get("verification_status"),
                    "review_state": package.get("review_state"),
                    "health_state": package.get("health_state"),
                    "policy_posture": package.get("policy_posture"),
                    "billing": _coerce_dict(package.get("billing")),
                },
            }
        )
        if installed:
            app_item["status"] = "installed"
            app_item["installed_at"] = _utc_now_iso()
        app_registry_api._save_app_registry(data)
    return dict(app_item)


def _existing_app_registry_item(app_id: str) -> Dict[str, Any]:
    _ensure_app_registry_exports()
    with app_registry_api.APP_REGISTRY_LOCK:
        data = app_registry_api._load_app_registry()
        return dict(app_registry_api._find_app(data, app_id) or {})


def _sync_marketplace_app_to_mini_apps(workspace_id: str, package: Dict[str, Any]) -> Dict[str, Any]:
    app_payload = _coerce_dict(package.get("mini_app") if package.get("kind") == "mini_app" else package.get("app"))
    return mini_apps_service.upsert_mini_app_contract(
        workspace_id,
        str(app_payload.get("app_id") or "").strip(),
        label=package.get("label"),
        description=package.get("description"),
        delivery_mode="hosted",
        hosted_url=app_payload.get("hosted_url"),
        embed_kind=app_payload.get("embed_kind"),
        allowed_origins=app_payload.get("allowed_origins"),
        bridge_contracts=app_payload.get("bridge_contracts"),
        permissions=app_payload.get("permissions"),
        context_envelope=app_payload.get("context_envelope"),
    )


def _package_open_href(workspace_id: str, package: Dict[str, Any]) -> Optional[str]:
    package_kind = str(package.get("kind") or "").strip()
    if package_kind == "agent_template":
        template_id = str(_coerce_dict(package.get("agent_template")).get("template_id") or "").strip()
        if template_id:
            return f"/w/{workspace_id}/studio?proof_agent={template_id}"
    if package_kind == "app":
        app_id = str(_coerce_dict(package.get("app")).get("app_id") or "").strip()
        if app_id:
            return f"/w/{workspace_id}/applications/{app_id}"
    if package_kind == "mini_app":
        app_id = str(_coerce_dict(package.get("mini_app")).get("app_id") or "").strip()
        if app_id:
            return f"/w/{workspace_id}/mini-apps/{app_id}"
    if package_kind == "provider":
        return f"/w/{workspace_id}/integrations"
    return None


def _runtime_truth_projection(workspace_id: str, package: Dict[str, Any], install: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    kind = str(package.get("kind") or "").strip()
    install_state = "installed" if isinstance(install, dict) else "available"
    surface = INSTALL_TARGETS.get(kind, "marketplace_contract")
    runtime_state = str(package.get("health_state") or "setup_required").strip() or "setup_required"
    if kind == "provider" and install_state == "installed" and runtime_state == "healthy":
        runtime_state = "setup_required"
    return {
        "surface": surface,
        "install_state": install_state,
        "health_state": runtime_state,
        "verification_status": str(package.get("verification_status") or "unverified").strip() or "unverified",
        "review_state": str(package.get("review_state") or "pending").strip() or "pending",
        "policy_posture": str(package.get("policy_posture") or "governed").strip() or "governed",
        "open_href": _package_open_href(workspace_id, package),
    }


def _install_blockers(package: Dict[str, Any]) -> List[str]:
    blockers: List[str] = []
    if bool(package.get("preview_only")):
        blockers.append("preview_only")
    if str(package.get("review_state") or "").strip() != "approved":
        blockers.append("review_not_approved")
    if str(package.get("verification_status") or "").strip() == "unverified":
        blockers.append("verification_required")
    if str(package.get("policy_posture") or "").strip() != "governed":
        blockers.append("policy_restricted")
    if bool(package.get("approval_required")):
        blockers.append("manual_approval_required")
    return blockers


def _public_package_payload(workspace_id: str, package: Dict[str, Any], install: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    analytics = _coerce_dict(package.get("analytics"))
    install_blockers = _install_blockers(package)
    return {
        "package_id": str(package.get("package_id") or "").strip(),
        "kind": str(package.get("kind") or "").strip(),
        "label": str(package.get("label") or "").strip(),
        "description": str(package.get("description") or "").strip(),
        "category": str(package.get("category") or "").strip(),
        "publisher": _coerce_dict(package.get("publisher")),
        "onboarding": _coerce_dict(package.get("onboarding")),
        "verification_status": str(package.get("verification_status") or "").strip(),
        "review_state": str(package.get("review_state") or "").strip(),
        "health_state": str(package.get("health_state") or "").strip(),
        "policy_posture": str(package.get("policy_posture") or "").strip(),
        "approval_required": bool(package.get("approval_required")),
        "preview_only": bool(package.get("preview_only")),
        "install_target": str(package.get("install_target") or "").strip(),
        "install_eligible": not install_blockers,
        "install_blockers": install_blockers,
        "billing": _coerce_dict(package.get("billing")),
        "analytics": {
            "install_count": int(analytics.get("install_count") or 0),
            "runtime_event_count": int(analytics.get("runtime_event_count") or 0),
            "last_install_at": analytics.get("last_install_at"),
            "last_runtime_at": analytics.get("last_runtime_at"),
        },
        "installed": isinstance(install, dict),
        "install": dict(install) if isinstance(install, dict) else None,
        "runtime_truth": _runtime_truth_projection(workspace_id, package, install),
        "package": _coerce_dict(package.get(str(package.get("kind") or "").strip())),
        "updated_at": package.get("updated_at"),
    }


def list_marketplace_packages(workspace_id: str, *, kind: Optional[str] = None) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    state = _safe_read_state(normalized_workspace_id)
    requested_kind = str(kind or "").strip().lower()
    source_packages = state.get("packages", {})
    if not source_packages:
        source_packages = _preview_marketplace_packages()
    items: List[Dict[str, Any]] = []
    for package_id, entry in sorted(source_packages.items()):
        if not isinstance(entry, dict):
            continue
        if requested_kind and str(entry.get("kind") or "").strip().lower() != requested_kind:
            continue
        install = _coerce_dict(state.get("installs", {}).get(package_id))
        items.append(_public_package_payload(normalized_workspace_id, entry, install if install else None))
    return {
        "workspace_id": normalized_workspace_id,
        "version": MARKETPLACE_DISTRIBUTION_VERSION,
        "count": len(items),
        "items": items,
        "updated_at": state.get("updated_at"),
    }


def get_marketplace_package(workspace_id: str, package_id: str) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_package_id = _slug_token(package_id, allow_dot=True)
    state = _safe_read_state(normalized_workspace_id)
    entry = _coerce_dict(state.get("packages", {}).get(normalized_package_id))
    if not entry:
        raise KeyError(f"Marketplace package '{normalized_package_id}' was not found.")
    install = _coerce_dict(state.get("installs", {}).get(normalized_package_id))
    return _public_package_payload(normalized_workspace_id, entry, install if install else None)


def register_marketplace_package(
    workspace_id: str,
    *,
    actor_user_id: Optional[str],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_payload = _normalize_package_payload(payload)
    state = _safe_read_state(normalized_workspace_id)
    packages = dict(state.get("packages") or {})
    existing = _coerce_dict(packages.get(normalized_payload["package_id"]))
    if normalized_payload["kind"] == "app":
        app_id = str(_coerce_dict(normalized_payload.get("app")).get("app_id") or "").strip()
        registry_item = _existing_app_registry_item(app_id) if app_id else {}
        registry_source = str(registry_item.get("source") or "").strip().lower()
        registry_package_id = str(registry_item.get("package_id") or "").strip()
        if registry_item and registry_source != "third_party_marketplace":
            raise ValueError(f"App id '{app_id}' is already reserved by the platform.")
        if registry_item and registry_source == "third_party_marketplace" and registry_package_id and registry_package_id != normalized_payload["package_id"]:
            raise ValueError(f"App id '{app_id}' is already claimed by marketplace package '{registry_package_id}'.")
    if normalized_payload["kind"] == "provider":
        provider_id = str(_coerce_dict(normalized_payload.get("provider")).get("provider_id") or "").strip()
        for existing_package_id, existing_package in packages.items():
            current = _coerce_dict(existing_package)
            if existing_package_id == normalized_payload["package_id"] or str(current.get("kind") or "").strip() != "provider":
                continue
            current_provider_id = str(_coerce_dict(current.get("provider")).get("provider_id") or "").strip()
            if provider_id and current_provider_id == provider_id:
                raise ValueError(f"Provider id '{provider_id}' is already claimed by marketplace package '{existing_package_id}'.")
    if existing:
        normalized_payload["analytics"] = _coerce_dict(existing.get("analytics")) or normalized_payload["analytics"]
    packages[normalized_payload["package_id"]] = normalized_payload
    state["packages"] = packages
    state = _save_state(normalized_workspace_id, state)
    registered = _public_package_payload(
        normalized_workspace_id,
        normalized_payload,
        _coerce_dict(state.get("installs", {}).get(normalized_payload["package_id"])) or None,
    )
    registered["registered_by_user_id"] = actor_user_id
    return registered


def install_marketplace_package(
    workspace_id: str,
    *,
    package_id: str,
    actor_user_id: Optional[str],
) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_package_id = _slug_token(package_id, allow_dot=True)
    state = _safe_read_state(normalized_workspace_id)
    packages = dict(state.get("packages") or {})
    installs = dict(state.get("installs") or {})
    entry = _coerce_dict(packages.get(normalized_package_id))
    if not entry:
        raise KeyError(f"Marketplace package '{normalized_package_id}' was not found.")
    install_blockers = _install_blockers(entry)
    if install_blockers:
        raise ValueError(f"Marketplace package is not installable: {', '.join(install_blockers)}.")
    installed_at = _utc_now_iso()
    package_analytics = _coerce_dict(entry.get("analytics"))
    package_analytics["install_count"] = int(package_analytics.get("install_count") or 0) + 1
    package_analytics["last_install_at"] = installed_at
    entry["analytics"] = package_analytics

    target_payload: Dict[str, Any] = {}
    if str(entry.get("kind") or "").strip() == "app":
        target_payload["app_registry"] = _upsert_marketplace_app_registry_item(entry, installed=True)
        target_payload["mini_app_contract"] = _sync_marketplace_app_to_mini_apps(normalized_workspace_id, entry)
    if str(entry.get("kind") or "").strip() == "mini_app":
        target_payload["mini_app_contract"] = _sync_marketplace_app_to_mini_apps(normalized_workspace_id, entry)

    install_record = {
        "package_id": normalized_package_id,
        "workspace_id": normalized_workspace_id,
        "installed_at": installed_at,
        "installed_by_user_id": str(actor_user_id or "").strip() or None,
        "status": "installed",
        "open_href": _package_open_href(normalized_workspace_id, entry),
        "billing": _coerce_dict(entry.get("billing")),
        "runtime_truth": _runtime_truth_projection(normalized_workspace_id, entry, {"status": "installed"}),
        "target_payload": target_payload,
    }
    installs[normalized_package_id] = install_record
    packages[normalized_package_id] = entry
    state["packages"] = packages
    state["installs"] = installs
    _save_state(normalized_workspace_id, state)
    return _public_package_payload(normalized_workspace_id, entry, install_record)


def record_marketplace_runtime_event(
    workspace_id: str,
    *,
    package_id: str,
    event_type: str,
    health_state: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    normalized_package_id = _slug_token(package_id, allow_dot=True)
    state = _safe_read_state(normalized_workspace_id)
    packages = dict(state.get("packages") or {})
    installs = dict(state.get("installs") or {})
    entry = _coerce_dict(packages.get(normalized_package_id))
    if not entry:
        raise KeyError(f"Marketplace package '{normalized_package_id}' was not found.")
    install = _coerce_dict(installs.get(normalized_package_id))
    if not install:
        raise ValueError("Marketplace package must be installed before runtime events can be recorded.")
    event_at = _utc_now_iso()
    analytics = _coerce_dict(entry.get("analytics"))
    analytics["runtime_event_count"] = int(analytics.get("runtime_event_count") or 0) + 1
    analytics["last_runtime_at"] = event_at
    entry["analytics"] = analytics
    if health_state is not None:
        entry["health_state"] = _normalize_health_state(health_state)
    install["runtime_event"] = {
        "event_type": str(event_type or "runtime").strip() or "runtime",
        "recorded_at": event_at,
        "metadata": _coerce_dict(metadata),
    }
    install["runtime_truth"] = _runtime_truth_projection(normalized_workspace_id, entry, install)
    packages[normalized_package_id] = entry
    installs[normalized_package_id] = install
    state["packages"] = packages
    state["installs"] = installs
    _save_state(normalized_workspace_id, state)
    return _public_package_payload(normalized_workspace_id, entry, install)


def installed_provider_marketplace_packages(workspace_id: str) -> List[Dict[str, Any]]:
    normalized_workspace_id = _normalize_workspace_id(workspace_id)
    state = _read_state_if_exists(normalized_workspace_id)
    items: List[Dict[str, Any]] = []
    for package_id, install in sorted(state.get("installs", {}).items()):
        install_payload = _coerce_dict(install)
        package = _coerce_dict(state.get("packages", {}).get(package_id))
        if not package or str(package.get("kind") or "").strip() != "provider":
            continue
        items.append(_public_package_payload(normalized_workspace_id, package, install_payload))
    return items
