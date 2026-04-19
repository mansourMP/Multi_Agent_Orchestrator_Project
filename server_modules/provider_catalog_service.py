from __future__ import annotations

from typing import Any, Dict, List, Optional

from server_modules import model_router
from server_modules import provider_profiles

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
        items.append(record)
    return items


def _normalize_model_token(provider_id: str, model_id: Any) -> str:
    token = str(model_id or "").strip()
    if not token:
        return ""
    if provider_id == "anthropic" and token.startswith("anthropic/"):
        return token.split("/", 1)[1]
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
    if normalized_model and supported_models and normalized_model not in supported_models:
        raise ValueError(f"Model '{normalized_model}' is not supported for provider '{raw_provider}'.")

    return {
        "provider": raw_provider or None,
        "model": normalized_model or None,
    }


def _provider_catalog_projection(item: Dict[str, Any]) -> Dict[str, Any]:
    provider_id = str(item.get("id") or "").strip()
    governance = provider_profiles.provider_governance_entry(provider_id)
    profile_metadata = dict(item.get("profile_metadata") or {}) if isinstance(item.get("profile_metadata"), dict) else {}
    models = _cached_model_records(provider_id, profile_metadata) or provider_profiles.provider_model_catalog(provider_id)
    return {
        **dict(item),
        "privacy_posture": governance.get("privacy_posture"),
        "privacy_posture_summary": governance.get("privacy_posture"),
        "jurisdiction": governance.get("jurisdiction"),
        "residency": governance.get("residency"),
        "residency_caveat": governance.get("residency"),
        "enterprise_risk_note": governance.get("enterprise_risk_note"),
        "capability_labels": list(governance.get("capability_labels") or []),
        "local_self_hosted_compatible": bool(governance.get("local_self_hosted_compatible")),
        "models": models,
    }


async def list_workspace_provider_catalog(
    *,
    workspace_id: Optional[str],
) -> Dict[str, Any]:
    runtime_truth = provider_profiles.build_provider_runtime_truth(workspace_id)
    providers = [
        _provider_catalog_projection(item)
        for item in runtime_truth.get("providers", [])
        if isinstance(item, dict)
    ]
    return {
        "workspace_id": runtime_truth.get("workspace_id"),
        "summary": runtime_truth.get("summary"),
        "providers": providers,
    }
