from __future__ import annotations

from typing import Any, Dict, List, Optional

from server_modules import marketplace_distribution_service
from server_modules import model_router
from server_modules import provider_profiles

ANTHROPIC_MODEL_ALIASES = {
    "claude-3-7-sonnet-latest": "claude-3-7-sonnet-20250219",
}

def _cached_model_records(provider_id: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
    cached = metadata.get("cached_models")
    if not isinstance(cached, list):
        return []
    known_by_id = {
        str(item.get("id") or "").strip(): dict(item)
        for item in provider_profiles.provider_model_catalog(provider_id)
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    }
    items: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for raw in cached:
        model_id = str(raw or "").strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        record = dict(known_by_id.get(model_id) or {})
        record["id"] = model_id
        record["label"] = str(record.get("label") or model_id)
        record["provider"] = provider_id
        record["source"] = "workspace_cached_models"
        items.append(record)
    return items


def cached_provider_model_ids(*, workspace_id: Any = None, provider: Any = None) -> List[str]:
    provider_id = provider_profiles.normalize_provider_id(provider)
    if not provider_id:
        return []
    try:
        connection_truth = provider_profiles.build_workspace_provider_connection_truth(workspace_id)
    except Exception:
        return []
    for item in connection_truth.get("providers", []):
        if not isinstance(item, dict):
            continue
        if provider_profiles.normalize_provider_id(item.get("id")) != provider_id:
            continue
        metadata = dict(item.get("profile_metadata") or {}) if isinstance(item.get("profile_metadata"), dict) else {}
        return [
            record["id"]
            for record in _cached_model_records(provider_id, metadata)
            if str(record.get("id") or "").strip()
        ]
    return []


def _normalize_model_token(provider_id: str, model_id: Any) -> str:
    token = str(model_id or "").strip()
    if not token:
        return ""
    if provider_id == "anthropic" and token.startswith("anthropic/"):
        token = token.split("/", 1)[1]
    if provider_id == "anthropic":
        return ANTHROPIC_MODEL_ALIASES.get(token, token)
    if provider_id == "gemini" and token.startswith("gemini/"):
        return token.split("/", 1)[1]
    if provider_id == "vertex" and token.startswith("vertex_ai/"):
        return token.split("/", 1)[1]
    if provider_id in {"qwen", "deepseek", "mistral", "ollama"} and "/" in token:
        provider_token, model_token = token.split("/", 1)
        if provider_profiles.normalize_provider_id(provider_token) == provider_id:
            return model_token.strip()
    return token


def resolve_provider_model_selection(
    *,
    provider: Any = None,
    model: Any = None,
    existing_provider: Any = None,
    existing_model: Any = None,
    cached_models: Any = None,
) -> Dict[str, Optional[str]]:
    raw_provider = provider_profiles.normalize_provider_id(provider) if str(provider or "").strip() else ""
    raw_model = str(model or "").strip()
    normalized_existing_provider = (
        provider_profiles.normalize_provider_id(existing_provider)
        if str(existing_provider or "").strip()
        else ""
    )
    normalized_existing_model = str(existing_model or "").strip()

    if not raw_provider and raw_model:
        raw_provider = provider_profiles.normalize_provider_id(model_router.infer_provider(raw_model))
    if not raw_provider:
        raw_provider = normalized_existing_provider
    if not raw_provider:
        return {"provider": None, "model": None}

    provider_entry = provider_profiles.provider_catalog_entry(raw_provider)
    if not provider_entry or bool(provider_entry.get("hidden")):
        raise ValueError(f"Unsupported provider '{provider}'.")

    normalized_model = _normalize_model_token(raw_provider, raw_model)
    if not normalized_model:
        if raw_provider == normalized_existing_provider:
            normalized_model = _normalize_model_token(raw_provider, normalized_existing_model)
        if not normalized_model:
            normalized_model = str(provider_entry.get("default_model") or "").strip()

    model_catalog = provider_profiles.provider_model_catalog(raw_provider)
    supported_models = {str(item.get("id") or "").strip() for item in model_catalog if str(item.get("id") or "").strip()}
    if isinstance(cached_models, list):
        supported_models.update(
            _normalize_model_token(raw_provider, cached_model)
            for cached_model in cached_models
            if _normalize_model_token(raw_provider, cached_model)
        )
    if normalized_model and supported_models and normalized_model not in supported_models:
        raise ValueError(f"Model '{normalized_model}' is not supported for provider '{raw_provider}'.")

    return {
        "provider": raw_provider or None,
        "model": normalized_model or None,
    }


def _provider_catalog_projection(item: Dict[str, Any]) -> Dict[str, Any]:
    provider_id = str(item.get("id") or "").strip()
    governance = provider_profiles.provider_governance_entry(provider_id)
    catalog_entry = provider_profiles.provider_catalog_entry(provider_id)
    profile_metadata = dict(item.get("profile_metadata") or {}) if isinstance(item.get("profile_metadata"), dict) else {}
    cached_models = _cached_model_records(provider_id, profile_metadata)
    models = cached_models or provider_profiles.provider_model_catalog(provider_id)
    return {
        **dict(item),
        "hidden": bool(catalog_entry.get("hidden")),
        "privacy_posture": governance.get("privacy_posture"),
        "privacy_posture_summary": governance.get("privacy_posture"),
        "jurisdiction": governance.get("jurisdiction"),
        "residency": governance.get("residency"),
        "residency_caveat": governance.get("residency"),
        "enterprise_risk_note": governance.get("enterprise_risk_note"),
        "capability_labels": list(governance.get("capability_labels") or []),
        "local_self_hosted_compatible": bool(governance.get("local_self_hosted_compatible")),
        "models": models,
        "models_source": "workspace_cached_models" if cached_models else "static_catalog",
        "models_synced_at": profile_metadata.get("cached_models_synced_at"),
        "models_error": profile_metadata.get("cached_models_error"),
    }


def _merge_runtime_truth(
    connection_item: Dict[str, Any],
    runtime_item: Dict[str, Any] | None,
) -> Dict[str, Any]:
    if not isinstance(runtime_item, dict):
        return dict(connection_item)
    merged = {
        **dict(connection_item),
        "state": runtime_item.get("state"),
        "usable": bool(runtime_item.get("usable")),
        "configured": bool(runtime_item.get("configured")),
        "active": bool(runtime_item.get("active")),
        "issues": list(runtime_item.get("issues") or []) if isinstance(runtime_item.get("issues"), list) else [],
        "credential_sources": list(runtime_item.get("credential_sources") or []) if isinstance(runtime_item.get("credential_sources"), list) else [],
        "backpressure": bool(runtime_item.get("backpressure")),
        "retry_after_seconds": runtime_item.get("retry_after_seconds"),
        "failure_class": runtime_item.get("failure_class"),
        "issue_code": runtime_item.get("issue_code"),
        "issue": runtime_item.get("issue"),
        "state_detail": runtime_item.get("state_detail"),
        "active_source": runtime_item.get("active_source"),
        "profile_metadata": (
            dict(runtime_item.get("profile_metadata"))
            if isinstance(runtime_item.get("profile_metadata"), dict)
            else dict(connection_item.get("profile_metadata") or {})
            if isinstance(connection_item.get("profile_metadata"), dict)
            else {}
        ),
    }
    runtime_identity_source = str(runtime_item.get("active_source") or "").strip().lower()
    if runtime_identity_source and runtime_identity_source not in {"profile", "workspace_profile"}:
        for key in ("identity_owner", "identity_owner_label", "identity_boundary_note", "machine_bound"):
            if key in runtime_item:
                merged[key] = runtime_item.get(key)
    if runtime_item.get("default_model"):
        merged["default_model"] = runtime_item.get("default_model")
    return merged


def _marketplace_provider_catalog_projection(item: Dict[str, Any]) -> Dict[str, Any]:
    package = item.get("package") if isinstance(item.get("package"), dict) else {}
    publisher = item.get("publisher") if isinstance(item.get("publisher"), dict) else {}
    billing = item.get("billing") if isinstance(item.get("billing"), dict) else {}
    runtime_truth = item.get("runtime_truth") if isinstance(item.get("runtime_truth"), dict) else {}
    analytics = item.get("analytics") if isinstance(item.get("analytics"), dict) else {}
    models = package.get("models") if isinstance(package.get("models"), list) else []
    return {
        "id": str(package.get("provider_id") or item.get("package_id") or "").strip(),
        "label": str(item.get("label") or package.get("provider_id") or item.get("package_id") or "").strip(),
        "state": str(runtime_truth.get("health_state") or item.get("health_state") or "setup_required").strip() or "setup_required",
        "usable": False,
        "active": False,
        "configured": False,
        "default_model": str(package.get("default_model") or "").strip() or None,
        "privacy_posture": str(package.get("privacy_posture") or "").strip() or None,
        "privacy_posture_summary": str(package.get("privacy_posture") or "").strip() or None,
        "jurisdiction": str(package.get("jurisdiction") or "").strip() or None,
        "residency": str(package.get("residency") or "").strip() or None,
        "residency_caveat": str(package.get("residency") or "").strip() or None,
        "enterprise_risk_note": str(package.get("enterprise_risk_note") or "").strip() or None,
        "capability_labels": [
            *[str(label).strip() for label in package.get("capability_labels", []) if str(label).strip()],
            "Marketplace provider",
        ],
        "local_self_hosted_compatible": False,
        "models": models,
        "distribution_origin": "third_party_marketplace",
        "verification_status": str(item.get("verification_status") or "unverified").strip() or "unverified",
        "review_state": str(item.get("review_state") or "pending").strip() or "pending",
        "health_state": str(item.get("health_state") or "setup_required").strip() or "setup_required",
        "publisher": {
            "publisher_id": str(publisher.get("publisher_id") or "").strip() or None,
            "label": str(publisher.get("label") or "").strip() or None,
            "website": str(publisher.get("website") or "").strip() or None,
        },
        "billing_hooks": {
            "monetization_kind": str(billing.get("monetization_kind") or "free").strip() or "free",
            "revenue_share_bps": int(billing.get("revenue_share_bps") or 0),
            "billing_product_id": str(billing.get("billing_product_id") or "").strip() or None,
            "accounting_hook": billing.get("accounting_hook") if isinstance(billing.get("accounting_hook"), dict) else {},
        },
        "analytics": {
            "install_count": int(analytics.get("install_count") or 0),
            "runtime_event_count": int(analytics.get("runtime_event_count") or 0),
            "last_install_at": analytics.get("last_install_at"),
            "last_runtime_at": analytics.get("last_runtime_at"),
        },
    }


async def list_workspace_provider_catalog(
    *,
    workspace_id: Optional[str],
) -> Dict[str, Any]:
    connection_truth = provider_profiles.build_workspace_provider_connection_truth(workspace_id)
    runtime_truth = provider_profiles.build_provider_runtime_truth(workspace_id)
    runtime_by_id = {
        str(item.get("id") or "").strip(): item
        for item in runtime_truth.get("providers", [])
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    }
    providers = [
        _provider_catalog_projection(_merge_runtime_truth(item, runtime_by_id.get(str(item.get("id") or "").strip())))
        for item in connection_truth.get("providers", [])
        if isinstance(item, dict)
    ]
    normalized_workspace_id = str(connection_truth.get("workspace_id") or workspace_id or "default").strip() or "default"
    for item in marketplace_distribution_service.installed_provider_marketplace_packages(normalized_workspace_id):
        providers.append(_marketplace_provider_catalog_projection(item))
    summary = dict(runtime_truth.get("summary") or {}) if isinstance(runtime_truth.get("summary"), dict) else {}
    summary["provider_total"] = len(providers)
    return {
        "workspace_id": normalized_workspace_id,
        "summary": summary,
        "providers": providers,
    }
