from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from server_modules import auth as auth_module
from server_modules import connectors_actions
from server_modules import connectors_core
from server_modules import control_plane_repository
from server_modules import platform_analytics_service
from server_modules import provider_profiles as provider_profiles_service
from server_modules import workspace_config_schema
from server_modules.runtime_models import CredentialUpsertRequest, ProviderProfileUpsertRequest
from server_modules.workspace_bootstrap_service import build_workspace_bootstrap
from server_modules.workspace_channel_operations_service import (
    build_workspace_channel_operations,
)


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _require_email(value: Any) -> str:
    email = str(value or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    return email


def _require_role(value: Any) -> str:
    role = auth_module.normalize_rbac_role(value, default="member")
    if role not in {"viewer", "member", "owner"}:
        raise HTTPException(status_code=400, detail="role must be viewer, member, or owner.")
    return role


def _enforce_owner_scope(current_user: Any, workspace_id: str) -> str:
    return auth_module.enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="owner",
    )


SAGE_TOOL_POLICY_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "web_search": {
        "label": "Web Search",
        "capability_ids": ["web_search"],
    },
    "http_request": {
        "label": "HTTP Requests",
        "capability_ids": ["http_request"],
    },
    "gmail": {
        "label": "Gmail",
        "capability_ids": ["draft_email"],
    },
    "calendar": {
        "label": "Calendar",
        "capability_ids": ["create_calendar_event"],
    },
    "file_access": {
        "label": "File Access",
        "capability_ids": ["filesystem.read_write"],
    },
    "code_execution": {
        "label": "Code Execution",
        "capability_ids": ["shell.execute"],
    },
}


def _read_string(value: Any, fallback: str = "") -> str:
    return str(value or "").strip() or fallback


def _normalize_provider_id(value: Any) -> str:
    provider_id = provider_profiles_service.normalize_provider_id(value)
    if provider_id not in provider_profiles_service.PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{value}'.")
    return provider_id


def _provider_requires_secret(provider_id: str) -> bool:
    return provider_profiles_service.provider_requires_credential(
        provider_id,
        provider_profiles_service.normalize_auth_mode(provider_id),
    )


def _provider_secret_payload(provider_id: str, secret_value: str) -> Dict[str, Any]:
    auth_mode = provider_profiles_service.normalize_auth_mode(provider_id)
    if not provider_profiles_service.provider_requires_credential(provider_id, auth_mode):
        return provider_profiles_service.secretless_provider_credentials(provider_id, auth_mode)
    if not secret_value:
        return {}
    if auth_mode in {"api_key", "oauth_token", "access_token"}:
        return {
            auth_mode: secret_value,
            "auth_mode": auth_mode,
        }
    return {
        "api_key": secret_value,
        "auth_mode": auth_mode or "api_key",
    }


def _provider_default_model(provider_id: str) -> Optional[str]:
    entry = provider_profiles_service.provider_catalog_entry(provider_id)
    model = _read_string(entry.get("default_model"))
    return model or None


def _sort_by_priority(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            int(item.get("priority") or 100),
            _read_string(item.get("created_at")),
            _read_string(item.get("id")),
        ),
    )


def _sort_by_recency(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            _read_string(item.get("updated_at") or item.get("created_at")),
            _read_string(item.get("id")),
        ),
        reverse=True,
    )


def _mask_last4(value: Any) -> Optional[str]:
    token = _read_string(value)
    if not token:
        return None
    return token[-4:] if len(token) >= 4 else token


def _credential_metadata_last4(metadata: Any) -> Optional[str]:
    payload = _coerce_dict(metadata)
    return _mask_last4(payload.get("credential_last4"))


def _filter_openai_model_ids(model_ids: List[str]) -> List[str]:
    filtered: List[str] = []
    seen: set[str] = set()
    for raw in model_ids:
        model_id = _read_string(raw)
        if not model_id:
            continue
        lowered = model_id.lower()
        if not (lowered.startswith("gpt-") or lowered.startswith("o1") or lowered.startswith("o3")):
            continue
        if model_id in seen:
            continue
        seen.add(model_id)
        filtered.append(model_id)
    return filtered


def _cached_provider_model_metadata(
    provider_id: str,
    workspace_id: str,
    credential_id: Optional[str],
    credentials_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    try:
        credentials: Dict[str, Any]
        if credential_id:
            credentials = provider_profiles_service.resolve_vault_credential(credential_id, workspace_id)
        else:
            credentials = dict(credentials_payload or {})
        _, _, adapter = provider_profiles_service.resolve_provider_adapter(provider_id, credentials)
        model_ids = adapter.list_models(credentials)
    except Exception as exc:
        return {
            "cached_models_error": str(exc).strip() or "Provider model sync failed.",
            "cached_models_synced_at": datetime.utcnow().isoformat() + "Z",
            "cached_models_source": "provider_adapter",
        }
    filtered = _filter_openai_model_ids(model_ids) if provider_id == "openai" else [
        _read_string(model_id) for model_id in model_ids if _read_string(model_id)
    ]
    if not filtered:
        return {
            "cached_models": [],
            "cached_models_error": "Provider returned no models.",
            "cached_models_synced_at": datetime.utcnow().isoformat() + "Z",
            "cached_models_source": "provider_adapter",
        }
    return {
        "cached_models": filtered,
        "cached_models_source": "openai_models_api" if provider_id == "openai" else "provider_adapter",
        "cached_models_synced_at": datetime.utcnow().isoformat() + "Z",
        "cached_models_error": None,
    }


async def build_workspace_sage_tool_policy_payload(
    workspace_id: str,
    current_user: Any,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    policy = auth_module.load_workspace_policy(resolved_workspace_id)
    denied = {
        str(item or "").strip().lower()
        for item in (policy.get("capabilities", {}).get("deny") or [])
        if str(item or "").strip()
    }
    tools = []
    for key, definition in SAGE_TOOL_POLICY_DEFINITIONS.items():
        capability_ids = [
            str(item or "").strip().lower()
            for item in (definition.get("capability_ids") or [])
            if str(item or "").strip()
        ]
        tools.append(
            {
                "key": key,
                "label": definition.get("label"),
                "enabled": not any(capability_id in denied for capability_id in capability_ids),
                "capability_ids": capability_ids,
            }
        )
    return {
        "workspace_id": resolved_workspace_id,
        "tools": tools,
    }


async def update_workspace_sage_tool_policy_payload(
    workspace_id: str,
    current_user: Any,
    *,
    tool_key: str,
    enabled: bool,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    normalized_tool_key = _read_string(tool_key).lower()
    definition = SAGE_TOOL_POLICY_DEFINITIONS.get(normalized_tool_key)
    if not isinstance(definition, dict):
        raise HTTPException(status_code=404, detail="Unknown Sage tool.")

    existing_policy = auth_module.load_workspace_policy(resolved_workspace_id)
    denied = {
        str(item or "").strip().lower()
        for item in (existing_policy.get("capabilities", {}).get("deny") or [])
        if str(item or "").strip()
    }
    for capability_id in definition.get("capability_ids") or []:
        normalized_capability_id = _read_string(capability_id).lower()
        if not normalized_capability_id:
            continue
        if enabled:
            denied.discard(normalized_capability_id)
        else:
            denied.add(normalized_capability_id)

    auth_module.upsert_workspace_policy(
        resolved_workspace_id,
        capability_deny=sorted(denied),
    )
    return await build_workspace_sage_tool_policy_payload(
        resolved_workspace_id,
        current_user,
    )


async def upsert_workspace_provider_credential(
    workspace_id: str,
    current_user: Any,
    *,
    provider: str,
    api_key: Optional[str],
    model: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    provider_id = _normalize_provider_id(provider)
    key_value = _read_string(api_key)
    requires_secret = _provider_requires_secret(provider_id)
    credential_secret_payload = _provider_secret_payload(provider_id, key_value)

    credential_id: Optional[str] = None
    credential_payload: Optional[Dict[str, Any]] = None
    if requires_secret:
        if not key_value:
            raise HTTPException(status_code=400, detail="Provider credential is required.")
        credential_payload = await connectors_actions.create_vault_credential(
            CredentialUpsertRequest(
                label=f"Sage {provider_profiles_service.provider_catalog_entry(provider_id).get('label') or provider_id}",
                provider=provider_id,
                workspace_id=resolved_workspace_id,
                mode="byok",
                credentials=credential_secret_payload,
            )
        )
        credential_id = _read_string((credential_payload or {}).get("id")) or None

    profiles_payload = await connectors_core.list_provider_profiles(
        workspace_id=resolved_workspace_id,
        provider=provider_id,
    )
    profiles = _sort_by_priority(
        [
            dict(item)
            for item in ((profiles_payload or {}).get("items") or [])
            if isinstance(item, dict)
        ]
    )
    current_profile = profiles[0] if profiles else {}
    default_model = (
        provider_profiles_service.normalize_provider_model_id(
            provider_id,
            _read_string(model),
            fallback_to_default=True,
        )
        if _read_string(model)
        else None
    )
    next_metadata = {
        **_coerce_dict(current_profile.get("metadata")),
        **_cached_provider_model_metadata(
            provider_id,
            resolved_workspace_id,
            credential_id,
            credential_secret_payload,
        ),
    }

    profile_payload = await connectors_core.upsert_provider_profile(
        ProviderProfileUpsertRequest(
            id=_read_string(current_profile.get("id")) or None,
            provider=provider_id,
            label=_read_string(
                current_profile.get("label"),
                f"Sage {provider_profiles_service.provider_catalog_entry(provider_id).get('label') or provider_id}",
            ),
            credential_id=credential_id,
            auth_mode=provider_profiles_service.normalize_auth_mode(provider_id, credentials=credential_secret_payload),
            workspace_id=resolved_workspace_id,
            priority=int(current_profile.get("priority") or 0),
            enabled=True,
            model=default_model or None,
            metadata=next_metadata,
        )
    )

    return {
        "workspace_id": resolved_workspace_id,
        "provider": provider_id,
        "credential": credential_payload,
        "profile": (profile_payload or {}).get("item") if isinstance(profile_payload, dict) else None,
    }


async def refresh_workspace_provider_models(
    workspace_id: str,
    current_user: Any,
    *,
    provider: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    provider_id = _normalize_provider_id(provider)
    profiles_payload = await connectors_core.list_provider_profiles(
        workspace_id=resolved_workspace_id,
        provider=provider_id,
    )
    profiles = _sort_by_priority(
        [
            dict(item)
            for item in ((profiles_payload or {}).get("items") or [])
            if isinstance(item, dict)
        ]
    )
    current_profile = profiles[0] if profiles else {}
    profile_id = _read_string(current_profile.get("id")) or None
    credential_id = _read_string(current_profile.get("credential_id")) or None
    metadata = _coerce_dict(current_profile.get("metadata"))
    model_metadata = _cached_provider_model_metadata(
        provider_id,
        resolved_workspace_id,
        credential_id,
        None,
    )
    next_metadata = {
        **metadata,
        **model_metadata,
    }
    if not profile_id:
        entry = provider_profiles_service.provider_catalog_entry(provider_id)
        profile_payload = await connectors_core.upsert_provider_profile(
            ProviderProfileUpsertRequest(
                provider=provider_id,
                label=f"Sage {entry.get('label') or provider_id}",
                credential_id=credential_id,
                auth_mode=provider_profiles_service.normalize_auth_mode(provider_id),
                workspace_id=resolved_workspace_id,
                priority=0,
                enabled=True,
                model=None,
                metadata=next_metadata,
            )
        )
    else:
        profile_payload = await connectors_core.upsert_provider_profile(
            ProviderProfileUpsertRequest(
                id=profile_id,
                provider=provider_id,
                label=_read_string(
                    current_profile.get("label"),
                    f"Sage {provider_profiles_service.provider_catalog_entry(provider_id).get('label') or provider_id}",
                ),
                credential_id=credential_id,
                auth_mode=_read_string(current_profile.get("auth_mode")) or provider_profiles_service.normalize_auth_mode(provider_id),
                workspace_id=resolved_workspace_id,
                priority=int(current_profile.get("priority") or 0),
                enabled=bool(current_profile.get("enabled", True)),
                model=_read_string(current_profile.get("model")) or None,
                metadata=next_metadata,
            )
        )
    profile = (profile_payload or {}).get("item") if isinstance(profile_payload, dict) else None
    return {
        "workspace_id": resolved_workspace_id,
        "provider": provider_id,
        "models": list(next_metadata.get("cached_models") or []),
        "profile": profile,
    }


async def delete_workspace_provider_credential(
    workspace_id: str,
    current_user: Any,
    *,
    provider: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    provider_id = _normalize_provider_id(provider)
    credentials_payload = await connectors_core.list_credentials_vault(workspace_id=resolved_workspace_id)
    credentials = _sort_by_recency(
        [
            dict(item)
            for item in ((credentials_payload or {}).get("items") or [])
            if isinstance(item, dict)
            and _read_string(item.get("provider")).lower() == provider_id
        ]
    )
    profiles_payload = await connectors_core.list_provider_profiles(
        workspace_id=resolved_workspace_id,
        provider=provider_id,
    )
    profiles = _sort_by_priority(
        [
            dict(item)
            for item in ((profiles_payload or {}).get("items") or [])
            if isinstance(item, dict)
        ]
    )
    if not credentials and not profiles:
        raise HTTPException(status_code=404, detail="Provider credential not found.")

    deleted_credential_ids: List[str] = []
    for credential in credentials:
        credential_id = _read_string(credential.get("id"))
        if not credential_id:
            continue
        await connectors_actions.delete_vault_credential(
            credential_id,
            workspace_id=resolved_workspace_id,
        )
        deleted_credential_ids.append(credential_id)

    disabled_profile_ids: List[str] = []
    for profile in profiles:
        profile_id = _read_string(profile.get("id"))
        if not profile_id:
            continue
        await connectors_core.disable_provider_profile(profile_id)
        disabled_profile_ids.append(profile_id)

    return {
        "workspace_id": resolved_workspace_id,
        "provider": provider_id,
        "deleted": True,
        "credential_ids": deleted_credential_ids,
        "profile_ids": disabled_profile_ids,
    }


def _enforce_platform_admin(current_user: Any) -> Dict[str, Any]:
    if not auth_module.current_user_has_auth_admin_access(current_user if isinstance(current_user, dict) else None):
        raise HTTPException(status_code=403, detail="Admin role required.")
    return dict(current_user or {})


def _active_owner_count(members: list[Dict[str, Any]]) -> int:
    return sum(
        1
        for member in members
        if str(member.get("status") or "active").strip().lower() == "active"
        and str(member.get("role") or "member").strip().lower() == "owner"
    )


def _find_member(members: list[Dict[str, Any]], user_id: str) -> Optional[Dict[str, Any]]:
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return None
    for member in members:
        if str(member.get("user_id") or "").strip() == clean_user_id:
            return member
    return None


def _guard_last_owner(member: Dict[str, Any], members: list[Dict[str, Any]], *, next_role: Optional[str] = None) -> None:
    current_role = str(member.get("role") or "member").strip().lower()
    if current_role != "owner":
        return
    if next_role is not None and str(next_role or "").strip().lower() == "owner":
        return
    if _active_owner_count(members) <= 1:
        raise HTTPException(
            status_code=409,
            detail="Cannot remove or demote the last workspace owner.",
        )


async def build_workspace_routing_payload(workspace_id: str, current_user: Any) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    bootstrap = await build_workspace_bootstrap(
        current_user=current_user,
        workspace_id=resolved_workspace_id,
    )
    channel_operations = await build_workspace_channel_operations(
        current_user=current_user,
        workspace_id=resolved_workspace_id,
    )
    admin_defaults = workspace_config_schema.workspace_admin_defaults_from_metadata(
        _coerce_dict((workspace or {}).get("metadata"))
    )
    return {
        "workspace": bootstrap.get("workspace"),
        "membership": bootstrap.get("membership"),
        "runtime": bootstrap.get("runtime"),
        "shellHints": bootstrap.get("shellHints"),
        "workspaceTraits": bootstrap.get("workspaceTraits"),
        "channelOperations": channel_operations,
        "admin_defaults": admin_defaults.model_dump(exclude_none=True),
        "config": workspace_config_schema.workspace_admin_defaults_envelope(admin_defaults),
    }


async def update_workspace_routing_payload(
    workspace_id: str,
    current_user: Any,
    payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    existing_defaults = workspace_config_schema.workspace_admin_defaults_from_metadata(
        _coerce_dict(workspace.get("metadata"))
    )
    body = _coerce_dict(payload)
    raw_defaults = _coerce_dict(body.get("admin_defaults"))
    next_defaults = workspace_config_schema.WorkspaceAdminDefaultsConfig.model_validate(
        {
            "runtime_target": str(
                raw_defaults.get("runtime_target")
                or existing_defaults.runtime_target
            ).strip()
            or existing_defaults.runtime_target,
            "billing_plan": str(
                raw_defaults.get("billing_plan")
                or existing_defaults.billing_plan
            ).strip()
            or existing_defaults.billing_plan,
            "privacy_policy_url": str(
                raw_defaults.get("privacy_policy_url")
                or existing_defaults.privacy_policy_url
                or ""
            ).strip()
            or None,
            "public_start_cta_label": str(
                raw_defaults.get("public_start_cta_label")
                or existing_defaults.public_start_cta_label
                or ""
            ).strip()
            or None,
            "public_start_cta_url": str(
                raw_defaults.get("public_start_cta_url")
                or existing_defaults.public_start_cta_url
                or ""
            ).strip()
            or None,
            "context_budget_preset": str(
                raw_defaults.get("context_budget_preset")
                or existing_defaults.context_budget_preset
            ).strip()
            or existing_defaults.context_budget_preset,
            "retention_preset": str(
                raw_defaults.get("retention_preset")
                or existing_defaults.retention_preset
            ).strip()
            or existing_defaults.retention_preset,
            "health_safety_enabled": bool(
                raw_defaults.get("health_safety_enabled")
                if "health_safety_enabled" in raw_defaults
                else existing_defaults.health_safety_enabled
            ),
            "allowed_live_channels": [
                str(item).strip()
                for item in list(raw_defaults.get("allowed_live_channels") or existing_defaults.allowed_live_channels)
                if str(item).strip()
            ],
        }
    )
    updated = await control_plane_repository.update_workspace_admin_defaults_metadata(
        resolved_workspace_id,
        workspace_config_schema.workspace_admin_defaults_envelope(next_defaults),
    )
    if not isinstance(updated, dict):
        raise HTTPException(status_code=500, detail="Workspace routing defaults could not be updated.")
    return await build_workspace_routing_payload(
        workspace_id=resolved_workspace_id,
        current_user=current_user,
    )


async def build_platform_analytics_payload(current_user: Any) -> Dict[str, Any]:
    resolved_user = _enforce_platform_admin(current_user)
    return await platform_analytics_service.build_platform_analytics_payload(
        current_user=resolved_user,
    )


async def build_workspace_members_payload(workspace_id: str, current_user: Any) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    members = await control_plane_repository.list_workspace_members(resolved_workspace_id)
    invites = await control_plane_repository.list_workspace_invites(resolved_workspace_id)
    pending_invites = [
        invite
        for invite in invites
        if str((invite or {}).get("status") or "pending").strip().lower() == "pending"
    ]
    invite_history = [
        invite
        for invite in invites
        if str((invite or {}).get("status") or "").strip().lower() != "pending"
    ]
    return {
        "workspace": {
            "id": resolved_workspace_id,
            "tenantId": str((workspace or {}).get("tenant_id") or "").strip() or None,
            "label": str((workspace or {}).get("name") or resolved_workspace_id).strip(),
            "kind": str((workspace or {}).get("workspace_type") or (workspace or {}).get("kind") or "personal").strip() or "personal",
        },
        "members": members,
        "invites": invites,
        "pending_invites": pending_invites,
        "invite_history": invite_history,
    }


async def invite_workspace_member(
    workspace_id: str,
    current_user: Any,
    *,
    email: str,
    role: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    invite = await control_plane_repository.create_workspace_invite(
        workspace_id=resolved_workspace_id,
        email=_require_email(email),
        role=_require_role(role),
        invited_by_user_id=str((current_user or {}).get("user_id") or "").strip() or None,
        metadata={
            "source": "workspace_admin_service",
        },
    )
    if not isinstance(invite, dict):
        raise HTTPException(status_code=500, detail="Workspace invite could not be created.")
    return invite


async def update_workspace_member_role(
    workspace_id: str,
    current_user: Any,
    *,
    user_id: str,
    role: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    clean_user_id = str(user_id or "").strip()
    clean_role = _require_role(role)
    members = await control_plane_repository.list_workspace_members(resolved_workspace_id)
    member = _find_member(members, clean_user_id)
    if not isinstance(member, dict):
        raise HTTPException(status_code=404, detail="Workspace member not found.")
    _guard_last_owner(member, members, next_role=clean_role)
    return auth_module.upsert_workspace_membership(
        clean_user_id,
        resolved_workspace_id,
        clean_role,
    )


async def remove_workspace_member(
    workspace_id: str,
    current_user: Any,
    *,
    user_id: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    clean_user_id = str(user_id or "").strip()
    members = await control_plane_repository.list_workspace_members(resolved_workspace_id)
    member = _find_member(members, clean_user_id)
    if not isinstance(member, dict):
        raise HTTPException(status_code=404, detail="Workspace member not found.")
    _guard_last_owner(member, members)
    return auth_module.remove_workspace_membership(
        clean_user_id,
        resolved_workspace_id,
    )


async def revoke_workspace_invite(
    workspace_id: str,
    current_user: Any,
    *,
    invite_id: str,
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    clean_invite_id = str(invite_id or "").strip()
    if not clean_invite_id:
        raise HTTPException(status_code=400, detail="invite_id is required.")
    invite = await control_plane_repository.get_workspace_invite(
        resolved_workspace_id,
        clean_invite_id,
    )
    if not isinstance(invite, dict):
        raise HTTPException(status_code=404, detail="Workspace invite not found.")
    status = str(invite.get("status") or "pending").strip().lower()
    if status == "accepted":
        raise HTTPException(status_code=409, detail="Accepted invites cannot be revoked.")
    if status == "revoked":
        return invite
    revoked = await control_plane_repository.revoke_workspace_invite(clean_invite_id)
    if not isinstance(revoked, dict):
        raise HTTPException(status_code=500, detail="Workspace invite could not be revoked.")
    return revoked


async def build_workspace_policies_payload(workspace_id: str, current_user: Any) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    policy_config = workspace_config_schema.workspace_policy_config_from_legacy(
        auth_module.load_workspace_policy(resolved_workspace_id),
        workspace_id=resolved_workspace_id,
        tenant_id=str((workspace or {}).get("tenant_id") or "").strip() or None,
    )
    return {
        "workspace": {
            "id": resolved_workspace_id,
            "tenantId": str((workspace or {}).get("tenant_id") or "").strip() or None,
            "label": str((workspace or {}).get("name") or resolved_workspace_id).strip(),
        },
        "policy": workspace_config_schema.workspace_policy_to_legacy_payload(policy_config),
        "config": workspace_config_schema.workspace_policy_envelope(policy_config),
    }


async def update_workspace_policies_payload(
    workspace_id: str,
    current_user: Any,
    payload: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    resolved_workspace_id = _enforce_owner_scope(current_user, workspace_id)
    body = _coerce_dict(payload)
    existing = workspace_config_schema.workspace_policy_config_from_legacy(
        auth_module.load_workspace_policy(resolved_workspace_id),
        workspace_id=resolved_workspace_id,
    )

    def _token_list(value: Any, fallback: list[str]) -> list[str]:
        if not isinstance(value, list):
            return list(fallback)
        return [str(item).strip() for item in value if str(item).strip()]

    capabilities = _coerce_dict(body.get("capabilities"))
    dangerous = _coerce_dict(body.get("dangerous_action_classes"))
    connectors = _coerce_dict(body.get("connectors"))
    next_policy = auth_module.upsert_workspace_policy(
        resolved_workspace_id,
        capability_allow=_token_list(capabilities.get("allow"), list(existing.capabilities.allow)),
        capability_deny=_token_list(capabilities.get("deny"), list(existing.capabilities.deny)),
        dangerous_allow=_token_list(dangerous.get("allow"), list(existing.dangerous_action_classes.allow)),
        dangerous_deny=_token_list(dangerous.get("deny"), list(existing.dangerous_action_classes.deny)),
        connector_allow=_token_list(connectors.get("allow"), list(existing.connectors.allow)),
        connector_deny=_token_list(connectors.get("deny"), list(existing.connectors.deny)),
        machine_enrollment_scope=str(
            body.get("machine_enrollment_scope")
            or existing.machine_policy.machine_enrollment_scope
            or "workspace"
        ).strip(),
        trusted_owner_machine_ids=_token_list(
            body.get("trusted_owner_machine_ids"),
            list(existing.machine_policy.trusted_owner_machine_ids or []),
        ),
    )
    next_config = workspace_config_schema.workspace_policy_config_from_legacy(
        next_policy,
        workspace_id=resolved_workspace_id,
    )
    return {
        "workspace_id": resolved_workspace_id,
        "policy": workspace_config_schema.workspace_policy_to_legacy_payload(next_config),
        "config": workspace_config_schema.workspace_policy_envelope(next_config),
    }
