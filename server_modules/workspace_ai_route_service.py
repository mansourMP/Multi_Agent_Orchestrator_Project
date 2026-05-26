from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from server_modules import connectors_core
from server_modules import provider_catalog_service
from server_modules import provider_profiles
from server_modules.runtime_models import ProviderProfileUpsertRequest


AI_ROUTE_KINDS = {
    "empyralis_managed",
    "user_api_key",
    "local_model",
    "enterprise_gateway",
}
PUBLIC_MODEL_PRESETS = {"light", "pro", "max"}
LOCAL_PROVIDER_IDS = {"ollama"}
LOCAL_SUBSCRIPTION_PROVIDER_IDS = {"openai-codex", "claude_code_cli"}
ENTERPRISE_PROVIDER_IDS = {
    "azure_openai",
    "bedrock",
    "vertex",
    "litellm",
    "vercel_ai_gateway",
    "custom_openai_compatible",
}
PERSONAL_SUBSCRIPTION_ROUTE_KINDS = {
    "subscription",
    "subscription_passthrough",
    "chatgpt_subscription",
    "claude_subscription",
}


def _read_string(value: Any, default: str = "") -> str:
    return str(value if value is not None else default).strip()


def _read_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _read_list(value: Any) -> List[Any]:
    return list(value) if isinstance(value, list) else []


def _profile_metadata(profile: Any) -> Dict[str, Any]:
    if not isinstance(profile, dict):
        return {}
    return _read_dict(profile.get("metadata"))


def _profile_sort_key(profile: Dict[str, Any]) -> tuple[int, str, str]:
    try:
        priority = int(profile.get("priority") or 100)
    except Exception:
        priority = 100
    return (
        priority,
        _read_string(profile.get("provider")).lower(),
        _read_string(profile.get("label")).lower(),
    )


def _catalog_provider_by_id(catalog_payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    providers = {}
    for item in _read_list(catalog_payload.get("providers")):
        if not isinstance(item, dict):
            continue
        provider_id = provider_profiles.normalize_provider_id(item.get("id") or item.get("provider"))
        if provider_id:
            providers[provider_id] = dict(item)
    return providers


def _provider_route_kind(provider_id: str, provider_record: Optional[Dict[str, Any]] = None) -> str:
    record = provider_record or {}
    scopes = {
        _read_string(scope).lower()
        for scope in _read_list(record.get("provider_scopes"))
        if _read_string(scope)
    }
    credential_plane = _read_string(record.get("credential_plane")).lower()
    if (
        provider_id in LOCAL_PROVIDER_IDS
        or bool(record.get("local_only"))
        or bool(record.get("machine_bound"))
        or "local_only" in scopes
    ):
        return "local_model"
    if provider_id in ENTERPRISE_PROVIDER_IDS or "enterprise" in scopes or "gateway" in scopes:
        return "enterprise_gateway"
    return "user_api_key"


def _is_personal_subscription_passthrough(provider_id: str, provider_record: Optional[Dict[str, Any]] = None) -> bool:
    record = provider_record or {}
    scopes = {
        _read_string(scope).lower()
        for scope in _read_list(record.get("provider_scopes"))
        if _read_string(scope)
    }
    credential_plane = _read_string(record.get("credential_plane")).lower()
    auth_mode = _read_string(record.get("auth_mode") or record.get("default_auth_mode")).lower()
    active_source = _read_string(record.get("active_source") or record.get("runtime_active_source")).lower()
    state_detail = _read_string(record.get("state_detail") or record.get("runtime_state_detail")).lower()
    if provider_id in LOCAL_SUBSCRIPTION_PROVIDER_IDS:
        return True
    if "claude-cli" in active_source or "codex" in active_source:
        return True
    if "subscription" in state_detail and provider_id not in LOCAL_PROVIDER_IDS:
        return True
    return (
        credential_plane == "local_runtime"
        and provider_id not in LOCAL_PROVIDER_IDS
        and not bool(record.get("local_only"))
        and not bool(record.get("machine_bound"))
        and (
            auth_mode in {"local_cli", "local_subscription"}
            or active_source.endswith("cli")
            or "subscription" in scopes
        )
    )


def _billing_source_for_kind(kind: str, provider_record: Optional[Dict[str, Any]] = None) -> str:
    if kind == "empyralis_managed":
        return "empyralis_credits"
    if kind == "local_model":
        return "local_runtime"
    if kind == "enterprise_gateway":
        return "enterprise_gateway"
    record = provider_record or {}
    credential_plane = _read_string(record.get("credential_plane")).lower()
    if credential_plane == "workspace_connection":
        return "workspace_api_key"
    return "provider_api_key"


def _runtime_target_for_kind(kind: str, provider_record: Optional[Dict[str, Any]] = None) -> str:
    record = provider_record or {}
    if kind == "local_model":
        if _read_string(record.get("machine_label")):
            return _read_string(record.get("machine_label"))
        return "This Device"
    if kind == "enterprise_gateway":
        return "Enterprise gateway"
    if kind == "empyralis_managed":
        return "Cloud worker"
    return "Workspace provider"


def _public_tier_label(model_preset: Optional[str]) -> str:
    token = _read_string(model_preset or "light").lower()
    if token not in PUBLIC_MODEL_PRESETS:
        token = "light"
    return token.capitalize()


def _hosted_route(
    *,
    preset: str = "light",
    enabled: bool = True,
    status: str = "available",
    description: Optional[str] = None,
) -> Dict[str, Any]:
    public_label = _public_tier_label(preset)
    return {
        "id": f"empyralis_managed:{preset}",
        "kind": "empyralis_managed",
        "label": f"{public_label} · Workspace AI",
        "publicLabel": public_label,
        "description": description or "Managed by Empyralis credits through the workspace default route.",
        "providerId": None,
        "modelId": None,
        "modelPreset": preset,
        "billingSource": "empyralis_credits",
        "runtimeTarget": "Cloud worker",
        "enabled": bool(enabled),
        "status": status,
    }


def _provider_route(
    provider_id: str,
    provider_record: Dict[str, Any],
    *,
    explicit_profile: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    kind = _provider_route_kind(provider_id, provider_record)
    label = _read_string(provider_record.get("label")) or _read_string(explicit_profile.get("label") if explicit_profile else None) or provider_id
    default_model = (
        _read_string(explicit_profile.get("model") if explicit_profile else None)
        or _read_string(provider_record.get("default_model"))
        or None
    )
    enabled = bool(provider_record.get("usable") or provider_record.get("active") or provider_record.get("configured"))
    status = _read_string(provider_record.get("state")) or ("connected" if enabled else "setup_required")
    suffix = "API key" if kind == "user_api_key" else "route"
    if kind == "local_model":
        suffix = "local model"
    elif kind == "enterprise_gateway":
        suffix = "gateway"
    return {
        "id": f"provider:{provider_id}",
        "kind": kind,
        "label": f"{label} {suffix}",
        "publicLabel": label,
        "description": _read_string(provider_record.get("state_detail")) or "Workspace provider route.",
        "providerId": provider_id,
        "modelId": default_model,
        "modelPreset": None,
        "billingSource": _billing_source_for_kind(kind, provider_record),
        "runtimeTarget": _runtime_target_for_kind(kind, provider_record),
        "enabled": enabled,
        "status": status,
    }


def _build_used_by() -> List[Dict[str, Any]]:
    return [
        {
            "surface": "sage",
            "label": "Sage",
            "scope": "workspace_default",
            "detail": "Workspace default",
            "override": False,
        },
        {
            "surface": "studio_agents",
            "label": "Studio agents",
            "scope": "workspace_default",
            "detail": "Workspace default unless an agent overrides inside setup.",
            "override": False,
        },
        {
            "surface": "mini_apps",
            "label": "Mini-apps",
            "scope": "workspace_default",
            "detail": "Workspace default unless an app policy requires otherwise.",
            "override": False,
        },
    ]


def _build_budgets(catalog_payload: Dict[str, Any]) -> Dict[str, Any]:
    hosted = _read_dict(catalog_payload.get("hosted_sage_ai"))
    monthly_cap = hosted.get("monthly_cap_usd")
    monthly_remaining = hosted.get("monthly_remaining_usd")
    monthly_cost = hosted.get("monthly_cost_usd")
    return {
        "workspaceMonthlyCapUsd": monthly_cap,
        "workspaceMonthlyRemainingUsd": monthly_remaining,
        "workspaceMonthlyCostUsd": monthly_cost,
        "remainingCredits": hosted.get("remaining_credits") or hosted.get("credits_remaining"),
        "fallbackAllowed": bool(catalog_payload.get("hosted_ai_enabled")),
        "perAgentCap": None,
        "perAppCap": None,
    }


def _explicit_workspace_profile(profiles: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for profile in sorted(profiles, key=_profile_sort_key):
        metadata = _profile_metadata(profile)
        if _read_string(metadata.get("chat_model_selection")).lower() == "explicit":
            return profile
    return None


def _resolve_workspace_default(
    *,
    catalog_payload: Dict[str, Any],
    providers_by_id: Dict[str, Dict[str, Any]],
    profiles: List[Dict[str, Any]],
) -> Dict[str, Any]:
    explicit_profile = _explicit_workspace_profile(profiles)
    if explicit_profile:
        metadata = _profile_metadata(explicit_profile)
        provider_id = provider_profiles.normalize_provider_id(explicit_profile.get("provider"))
        provider_record = providers_by_id.get(provider_id) or {
            "id": provider_id,
            "label": _read_string(explicit_profile.get("label")) or provider_id,
            "default_model": explicit_profile.get("model"),
            "configured": True,
            "usable": bool(explicit_profile.get("enabled", True)),
            "state": "connected",
        }
        if _is_personal_subscription_passthrough(provider_id, provider_record):
            return _hosted_route(
                preset="light",
                enabled=bool(catalog_payload.get("hosted_ai_enabled")),
                status="available" if bool(catalog_payload.get("hosted_ai_enabled")) else "setup_required",
                description="Personal AI subscriptions are not workspace AI routes. Use Empyralis credits, a provider API key, or a true local model.",
            )
        model_preset = _read_string(metadata.get("chat_model_tier")).lower()
        if model_preset in PUBLIC_MODEL_PRESETS:
            route = _hosted_route(preset=model_preset, enabled=True, status="connected")
            route["providerId"] = provider_id or None
            route["modelId"] = _read_string(explicit_profile.get("model")) or None
            return route
        route = _provider_route(provider_id, provider_record, explicit_profile=explicit_profile)
        route["enabled"] = bool(explicit_profile.get("enabled", True))
        route["status"] = "connected" if route["enabled"] else "disabled"
        return route

    hosted_enabled = bool(catalog_payload.get("hosted_ai_enabled"))
    if hosted_enabled:
        return _hosted_route(preset="light", enabled=True, status="available")

    return {
        "id": "setup_required",
        "kind": "empyralis_managed",
        "label": "Set up AI route",
        "publicLabel": "Setup required",
        "description": "Connect Empyralis credits, a provider API key, or a local model.",
        "providerId": None,
        "modelId": None,
        "modelPreset": None,
        "billingSource": None,
        "runtimeTarget": None,
        "enabled": False,
        "status": "setup_required",
    }


async def build_workspace_ai_route_payload(workspace_id: str) -> Dict[str, Any]:
    normalized_workspace_id = _read_string(workspace_id) or "default"
    catalog_payload = await provider_catalog_service.list_workspace_provider_catalog(
        workspace_id=normalized_workspace_id,
    )
    profiles_payload = await connectors_core.list_provider_profiles(workspace_id=normalized_workspace_id)
    profiles = [
        dict(item)
        for item in _read_list(_read_dict(profiles_payload).get("items"))
        if isinstance(item, dict)
    ]
    providers_by_id = _catalog_provider_by_id(_read_dict(catalog_payload))

    available_routes = [
        _hosted_route(
            preset=preset,
            enabled=bool(catalog_payload.get("hosted_ai_enabled")),
            status="available" if bool(catalog_payload.get("hosted_ai_enabled")) else "setup_required",
        )
        for preset in ("light", "pro", "max")
    ]
    for provider_id, provider_record in sorted(providers_by_id.items()):
        if _is_personal_subscription_passthrough(provider_id, provider_record):
            continue
        route = _provider_route(provider_id, provider_record)
        if route["kind"] in PERSONAL_SUBSCRIPTION_ROUTE_KINDS:
            continue
        available_routes.append(route)

    workspace_default = _resolve_workspace_default(
        catalog_payload=_read_dict(catalog_payload),
        providers_by_id=providers_by_id,
        profiles=profiles,
    )

    return {
        "workspaceId": normalized_workspace_id,
        "workspaceDefault": workspace_default,
        "availableRoutes": available_routes,
        "usedBy": _build_used_by(),
        "budgets": _build_budgets(_read_dict(catalog_payload)),
        "unsupportedRoutes": [
            {
                "kind": "subscription_passthrough",
                "label": "Personal ChatGPT or Claude subscriptions",
                "reason": "Personal web subscriptions are browser/session automation, not stable backend AI routes.",
            }
        ],
    }


def _resolve_update_selection(
    *,
    route_id: Optional[str],
    kind: Optional[str],
    provider: Optional[str],
    model_preset: Optional[str],
) -> Dict[str, Optional[str]]:
    route_token = _read_string(route_id)
    next_kind = _read_string(kind).lower() or None
    next_provider = provider_profiles.normalize_provider_id(provider) if _read_string(provider) else None
    next_preset = _read_string(model_preset).lower() or None

    if route_token:
        route_kind, _, route_value = route_token.partition(":")
        if route_kind in PERSONAL_SUBSCRIPTION_ROUTE_KINDS:
            raise HTTPException(status_code=400, detail="Personal AI subscriptions are not workspace AI routes.")
        if route_kind == "provider":
            next_provider = provider_profiles.normalize_provider_id(route_value)
        elif route_kind == "empyralis_managed":
            next_kind = "empyralis_managed"
            if route_value in PUBLIC_MODEL_PRESETS:
                next_preset = route_value
        elif route_kind:
            next_kind = route_kind

    if next_kind in PERSONAL_SUBSCRIPTION_ROUTE_KINDS:
        raise HTTPException(status_code=400, detail="Personal AI subscriptions are not workspace AI routes.")
    if next_kind and next_kind not in AI_ROUTE_KINDS:
        raise HTTPException(status_code=400, detail=f"Unsupported AI route kind '{next_kind}'.")
    if next_preset and next_preset not in PUBLIC_MODEL_PRESETS:
        raise HTTPException(status_code=400, detail="model_preset must be light, pro, or max.")
    if not next_kind and next_provider:
        next_kind = None
    if not next_kind:
        next_kind = "empyralis_managed" if not next_provider else "user_api_key"
    return {
        "kind": next_kind,
        "provider": next_provider,
        "model_preset": next_preset,
    }


def _existing_profile_for_provider(profiles: List[Dict[str, Any]], provider_id: str) -> Optional[Dict[str, Any]]:
    for profile in sorted(profiles, key=_profile_sort_key):
        if provider_profiles.normalize_provider_id(profile.get("provider")) == provider_id:
            return profile
    return None


async def update_workspace_default_ai_route(
    *,
    workspace_id: str,
    route_id: Optional[str] = None,
    kind: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    model_preset: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_workspace_id = _read_string(workspace_id) or "default"
    selection = _resolve_update_selection(
        route_id=route_id,
        kind=kind,
        provider=provider,
        model_preset=model_preset,
    )
    selected_kind = selection["kind"] or "empyralis_managed"
    selected_provider = selection["provider"]
    selected_model_preset = selection["model_preset"]

    profiles_payload = await connectors_core.list_provider_profiles(workspace_id=normalized_workspace_id)
    profiles = [
        dict(item)
        for item in _read_list(_read_dict(profiles_payload).get("items"))
        if isinstance(item, dict)
    ]

    if selected_provider:
        catalog_entry = provider_profiles.provider_catalog_entry(selected_provider)
        if not catalog_entry:
            raise HTTPException(status_code=400, detail=f"Unsupported provider '{selected_provider}'.")
        target_profile = _existing_profile_for_provider(profiles, selected_provider)
        auth_mode = _read_string(target_profile.get("auth_mode") if target_profile else None) or _read_string(catalog_entry.get("default_auth_mode")) or None
        credential_id = _read_string(target_profile.get("credential_id") if target_profile else None) or None
        if provider_profiles.provider_requires_credential(selected_provider, auth_mode) and not credential_id:
            raise HTTPException(
                status_code=400,
                detail="Provider profile must be connected before it can become the workspace AI route.",
            )
        if target_profile is None:
            target_profile = {
                "id": None,
                "provider": selected_provider,
                "label": _read_string(catalog_entry.get("label")) or selected_provider,
                "credential_id": credential_id,
                "auth_mode": auth_mode,
                "priority": 10,
                "enabled": True,
                "model": model or catalog_entry.get("default_model"),
                "metadata": {},
            }
            profiles.append(target_profile)

    for profile in sorted(profiles, key=_profile_sort_key):
        provider_id = provider_profiles.normalize_provider_id(profile.get("provider"))
        if not provider_id:
            continue
        is_selected = bool(selected_provider and provider_id == selected_provider)
        metadata = {
            **_profile_metadata(profile),
            "chat_model_selection": "explicit" if is_selected else "default",
        }
        if is_selected and selected_model_preset:
            metadata["chat_model_tier"] = selected_model_preset
        elif is_selected:
            metadata.pop("chat_model_tier", None)

        selected_model = _read_string(model) if is_selected and _read_string(model) else _read_string(profile.get("model")) or None
        if is_selected and not selected_model:
            selected_model = _read_string(provider_profiles.provider_catalog_entry(provider_id).get("default_model")) or None

        await connectors_core.upsert_provider_profile(
            ProviderProfileUpsertRequest(
                id=_read_string(profile.get("id")) or None,
                provider=provider_id,
                label=_read_string(profile.get("label")) or provider_id,
                credential_id=_read_string(profile.get("credential_id")) or None,
                auth_mode=_read_string(profile.get("auth_mode")) or None,
                workspace_id=normalized_workspace_id,
                priority=int(profile.get("priority") or (10 if is_selected else 100)),
                enabled=bool(profile.get("enabled", True)),
                model=selected_model,
                metadata=metadata,
            )
        )

    if selected_kind == "empyralis_managed" and selected_provider is None:
        # No provider profile should be explicitly selected when the workspace uses
        # the managed default route. The read model falls back to Light/Workspace AI.
        pass

    return await build_workspace_ai_route_payload(normalized_workspace_id)
