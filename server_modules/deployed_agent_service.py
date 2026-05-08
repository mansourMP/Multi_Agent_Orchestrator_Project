from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import HTTPException

from server_modules import agent_specialist_repository
from server_modules import auth as auth_module
from server_modules import config_defaults_service
from server_modules import control_plane_repository
from server_modules import deployed_agent_config_schema
from server_modules import deployed_agent_runtime_contract_service
from server_modules import deployed_agent_analytics_service
from server_modules import entitlements_service
from server_modules import external_user_privacy_service
from server_modules import provider_catalog_service
from server_modules import run_state_repository
from server_modules import session_service
from server_modules import workspace_config_schema
from server_modules.connectors.autopilot_runtime_exports import _autopilot_connector_shell_service
from server_modules.connectors.autopilot_status_service import AutopilotStatusService
from server_modules.agent_manifest import (
    AgentManifest,
    AgentManifestBible,
    AgentManifestChannels,
    AgentManifestIdentity,
    AgentManifestRuntime,
    AgentManifestVoiceProfile,
)


DEPLOYED_AGENT_ALLOWED_STATES = frozenset({"draft", "staging", "live", "paused"})
DEPLOYED_AGENT_LIVE_CHANNELS = config_defaults_service.live_deployment_channels()
DEPLOYED_AGENT_PUBLIC_FIELDS = (
    "id",
    "owner_workspace_id",
    "name",
    "avatar",
    "persona",
    "system_prompt",
    "deployment_state",
    "channels",
    "knowledge_sources",
    "runtime_target",
    "billing_plan",
    "is_public",
    "quality_stars",
    "cost_tier",
    "category",
    "created_at",
    "updated_at",
)
DEPLOYED_AGENT_INTERNAL_FIELDS = (
    "tenant_id",
    "backing_install_id",
    "created_by_user_id",
    "last_deployed_at",
    "last_paused_at",
    "metadata",
)
_INLINE_KNOWLEDGE_KEYS = frozenset({"content", "text", "body", "raw_text", "raw_content", "data", "bytes"})
_REFERENCE_KEYS = frozenset({"id", "source_id", "uri", "path", "connector_key", "document_id", "record_id", "external_id"})
_MANIFEST_CHANNEL_KEYS = tuple(AgentManifestChannels.model_fields.keys())
_ESCALATION_PRESET_TRIGGERS = {
    "standard": "low confidence\nexplicit human request\npolicy conflict",
    "conservative": "low confidence\nexplicit human request\nhealth or safety concern\npolicy conflict",
    "high_touch": "low confidence\nexplicit human request\nrefund or billing exception\npolicy conflict",
}
_STUDIO_WHATSAPP_STATUS = {
    "available": False,
    "status": "out_of_scope",
    "label": "Not in scope",
    "detail": "Studio launches Telegram specialists only in this beta. WhatsApp remains intentionally unavailable.",
}
_STUDIO_TOOL_SCOPE_CATALOG = (
    {
        "id": "web_search",
        "label": "Web search",
        "description": "Search the web for current facts and public references.",
    },
    {
        "id": "http_request",
        "label": "HTTP request",
        "description": "Call approved APIs and webhooks inside the deployment boundary.",
    },
    {
        "id": "spreadsheet_read",
        "label": "Spreadsheet read",
        "description": "Read menu, availability, and daily-special data from connected spreadsheets.",
    },
    {
        "id": "spreadsheet_append",
        "label": "Spreadsheet append",
        "description": "Append confirmed orders or handoff notes into a connected order log sheet.",
    },
    {
        "id": "gmail_send",
        "label": "Send email",
        "description": "Draft or send Gmail replies when the workspace has a connected mailbox.",
    },
    {
        "id": "calendar_write",
        "label": "Calendar write",
        "description": "Create or update calendar events for customer-facing scheduling flows.",
    },
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_text(value: Any, *, default: str = "") -> str:
    token = str(value or "").strip()
    return token or default


def _normalize_optional_text(value: Any) -> Optional[str]:
    token = str(value or "").strip()
    return token or None


def _normalize_optional_positive_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("daily_message_limit must be a positive integer.")
    token = str(value).strip()
    if not token:
        return None
    try:
        parsed = int(token)
    except (TypeError, ValueError) as error:
        raise ValueError("daily_message_limit must be a positive integer.") from error
    if parsed <= 0:
        return None
    return parsed


def _normalize_optional_positive_usd(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("monthly_cost_cap_usd must be a positive USD amount.")
    token = str(value).strip()
    if not token:
        return None
    try:
        parsed = round(float(token), 6)
    except (TypeError, ValueError) as error:
        raise ValueError("monthly_cost_cap_usd must be a positive USD amount.") from error
    if parsed <= 0:
        return None
    return parsed


def _normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    token = str(value or "").strip().lower()
    return token in {"1", "true", "yes", "on", "enabled"}


def _normalize_runtime_target(value: Any) -> str:
    token = str(value or "").strip().lower()
    if token in {"cloud", "cloud_default", "hosted_secure", "cloud_only"}:
        return "cloud"
    if token in {"local", "local_secure", "local_only", "local_companion"}:
        return "local"
    if token in {"self_hosted", "self_hosted_business", "self_hosted_business_node", "customer_hosted"}:
        return "self_hosted"
    if token in {"device", "desktop", "privileged_device"}:
        return "device"
    return token or config_defaults_service.default_deployed_agent_runtime_target()


def _runtime_target_to_specialist_mode(runtime_target: Any) -> str:
    token = _normalize_runtime_target(runtime_target)
    if token == "local":
        return "local_secure"
    if token == "device":
        return "privileged_device"
    return "hosted_secure"


def _deployed_agent_workspace_contract(deployed_agent: Dict[str, Any]) -> Dict[str, Any]:
    return deployed_agent_runtime_contract_service.build_deployed_agent_workspace_contract(
        tenant_id=deployed_agent.get("tenant_id"),
        workspace_id=deployed_agent.get("owner_workspace_id"),
        deployed_agent_id=deployed_agent.get("id"),
    )


def _normalize_deployment_state(value: Any, *, default: str = "draft") -> str:
    token = str(value or "").strip().lower()
    return token if token in DEPLOYED_AGENT_ALLOWED_STATES else default


def _normalize_channels(value: Any) -> Dict[str, Dict[str, Any]]:
    return deployed_agent_config_schema.normalize_deployed_agent_channels(value)


def _normalize_knowledge_sources(value: Any) -> List[Dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("knowledge_sources must be a list of structured references.")
    normalized: List[Dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("knowledge_sources entries must be objects.")
        payload = {str(key): val for key, val in item.items() if str(key or "").strip()}
        if any(payload.get(key) for key in _INLINE_KNOWLEDGE_KEYS):
            raise ValueError("knowledge_sources must store references only, not raw inline content.")
        if not any(payload.get(key) for key in _REFERENCE_KEYS):
            raise ValueError("knowledge_sources entries must contain a reference identifier.")
        normalized.append(payload)
    return normalized


def _channel_enabled(config: Any) -> bool:
    if isinstance(config, dict):
        return bool(config.get("enabled"))
    return bool(config)


def _live_channel_keys(channels: Dict[str, Any]) -> set[str]:
    return {
        str(channel_key or "").strip().lower()
        for channel_key, config in dict(channels or {}).items()
        if str(channel_key or "").strip() and _channel_enabled(config)
    }


def _channel_config_matches_endpoint(
    *,
    deployed_agent: Dict[str, Any],
    channel_key: str,
    endpoint_key: Any,
) -> bool:
    normalized_channel_key = _normalize_text(channel_key).lower()
    normalized_channels = _normalize_channels(deployed_agent.get("channels") or {})
    channel_config = normalized_channels.get(normalized_channel_key)
    if not _channel_enabled(channel_config):
        return False
    if isinstance(channel_config, dict):
        configured_endpoint = _normalize_optional_text(channel_config.get("endpoint_key"))
        requested_endpoint = _normalize_optional_text(endpoint_key)
        if configured_endpoint and requested_endpoint:
            return configured_endpoint.lower() == requested_endpoint.lower()
        if configured_endpoint and not requested_endpoint:
            return False
    return True


def _http_bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def _http_conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=409, detail=detail)


def _coerce_dict(value: Any) -> Dict[str, Any]:
    return dict(value or {}) if isinstance(value, dict) else {}


def _coerce_list(value: Any) -> List[Any]:
    return list(value) if isinstance(value, list) else []


def _tool_toggles_from_config(
    config: deployed_agent_config_schema.DeployedAgentConfig,
) -> Dict[str, bool]:
    enabled = {
        str(item or "").strip().lower()
        for item in list(config.tool_policy.enabled_tools or [])
        if str(item or "").strip()
    }
    return {
        str(item.get("id") or "").strip().lower(): str(item.get("id") or "").strip().lower() in enabled
        for item in _STUDIO_TOOL_SCOPE_CATALOG
        if str(item.get("id") or "").strip()
    }


def _clean_mapping(value: Any) -> Dict[str, Any]:
    payload = _coerce_dict(value)
    return {
        key: item
        for key, item in payload.items()
        if item not in (None, "", [], {})
    }


def _knowledge_reference_summary(item: Any) -> Optional[Dict[str, Any]]:
    payload = _coerce_dict(item)
    if not payload:
        return None
    reference_id = (
        _normalize_optional_text(payload.get("id"))
        or _normalize_optional_text(payload.get("uri"))
        or _normalize_optional_text(payload.get("path"))
        or _normalize_optional_text(payload.get("document_id"))
    )
    label = (
        _normalize_optional_text(payload.get("label"))
        or _normalize_optional_text(payload.get("title"))
        or _normalize_optional_text(payload.get("name"))
        or reference_id
    )
    source_kind = (
        _normalize_optional_text(payload.get("source_kind"))
        or _normalize_optional_text(payload.get("kind"))
        or ("google_sheet" if "sheet" in _normalize_text(payload.get("uri")).lower() else "document")
    )
    if not label and not source_kind:
        return None
    summary = {
        "id": reference_id,
        "label": label,
        "source_kind": source_kind,
        "uri": _normalize_optional_text(payload.get("uri")),
        "path": _normalize_optional_text(payload.get("path")),
    }
    return {
        key: value
        for key, value in summary.items()
        if value is not None
    }


def _derive_studio_specialist_profile(
    *,
    deployed_agent: Optional[Dict[str, Any]],
    config: deployed_agent_config_schema.DeployedAgentConfig,
) -> Dict[str, Any]:
    metadata = _coerce_dict((deployed_agent or {}).get("metadata"))
    stored_profile = _coerce_dict(metadata.get("specialist_profile"))
    tool_ids = {
        _normalize_text(item).lower()
        for item in list(config.tool_policy.enabled_tools or [])
        if _normalize_text(item)
    }
    has_sheet_read = "spreadsheet_read" in tool_ids
    has_sheet_append = "spreadsheet_append" in tool_ids
    knowledge_sources = [
        item
        for item in (
            _knowledge_reference_summary(item)
            for item in list(config.knowledge_sources or [])
        )
        if isinstance(item, dict)
    ]
    channel_payload = _coerce_dict(_channels_payload_from_config(config).get("telegram"))
    knowledge_defaults = {
        "title": "Knowledge",
        "mode": "menu_reference",
        "accepted_sources": ["pdf_upload", "google_sheet"],
        "source_count": len(knowledge_sources),
        "sources": knowledge_sources,
        "summary": (
            f"{len(knowledge_sources)} menu source{'s' if len(knowledge_sources) != 1 else ''} connected."
            if knowledge_sources
            else "Add a menu PDF or Google Sheet so the specialist can answer menu questions accurately."
        ),
    }
    live_data_defaults = {
        "title": "Live data",
        "mode": "daily_specials_and_availability",
        "connector_family": "google_workspace" if has_sheet_read else "manual_or_future_connector",
        "sheet_sync_enabled": has_sheet_read,
        "summary": (
            "Reads daily specials and item availability from a connected spreadsheet."
            if has_sheet_read
            else "Enable spreadsheet read to keep specials and availability live."
        ),
    }
    memory_defaults = {
        "title": "Memory",
        "mode": "per_customer_order_history",
        "memory_enabled": bool(config.memory_policy.memory_enabled),
        "context_budget_preset": config.memory_policy.context_budget_preset,
        "retention_preset": config.memory_policy.retention_preset,
        "summary": (
            "Keeps per-customer order context and repeat preferences."
            if config.memory_policy.memory_enabled
            else "Memory is disabled; repeat customers will not retain order history yet."
        ),
    }
    actions_defaults = {
        "title": "Actions",
        "enabled": ["place_order", "confirm_order", "escalate_to_human"],
        "order_capture_mode": "spreadsheet_append" if has_sheet_append else "manual_confirmation",
        "summary": (
            "Can confirm and log orders to a connected sheet, then escalate edge cases to a human."
            if has_sheet_append
            else "Can place and confirm orders in chat; enable spreadsheet append to log confirmed orders automatically."
        ),
    }
    channel_defaults = {
        "title": "Channel",
        "primary": "telegram_bot",
        "secondary": "whatsapp_business",
        "telegram_enabled": bool(channel_payload.get("enabled")),
        "endpoint_key": _normalize_optional_text(channel_payload.get("endpoint_key")),
        "bot_username": _normalize_optional_text(channel_payload.get("bot_username")),
        "summary": (
            "Primary customer traffic enters through Telegram bot; WhatsApp Business stays optional and out of scope by default."
        ),
    }

    profile = {
        "knowledge": {**knowledge_defaults, **_clean_mapping(stored_profile.get("knowledge"))},
        "live_data": {**live_data_defaults, **_clean_mapping(stored_profile.get("live_data"))},
        "memory": {**memory_defaults, **_clean_mapping(stored_profile.get("memory"))},
        "actions": {**actions_defaults, **_clean_mapping(stored_profile.get("actions"))},
        "channel": {**channel_defaults, **_clean_mapping(stored_profile.get("channel"))},
    }
    return profile


def build_deployed_agent_customer_entry(
    *,
    deployed_agent: Optional[Dict[str, Any]],
    bot_username: Optional[str] = None,
    endpoint_key: Optional[str] = None,
) -> Dict[str, Any]:
    config = _config_from_record(deployed_agent)
    deployed_agent_id = _normalize_optional_text((deployed_agent or {}).get("id"))
    resolved_bot_username = _normalize_optional_text(bot_username)
    resolved_telegram_url = (
        f"https://t.me/{resolved_bot_username}?start={quote(deployed_agent_id, safe='')}"
        if resolved_bot_username and deployed_agent_id
        else None
    )
    entry_url = _normalize_optional_text(config.customer_policy.public_start_cta_url) or resolved_telegram_url
    if not entry_url:
        entry_url = (
            f"https://t.me/{quote(endpoint_key or '', safe='')}"
            if _normalize_optional_text(endpoint_key)
            else None
        )
    qr_image_url = (
        f"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={quote(entry_url, safe='')}"
        if entry_url
        else None
    )
    return {
        "entry_url": entry_url,
        "cta_label": _normalize_optional_text(config.customer_policy.public_start_cta_label) or "Open menu",
        "telegram_deep_link": resolved_telegram_url,
        "bot_username": resolved_bot_username,
        "qr_image_url": qr_image_url,
        "qr_target": "web" if _normalize_optional_text(config.customer_policy.public_start_cta_url) else "telegram",
    }


def _studio_issue(
    *,
    code: str,
    message: str,
    guidance: Optional[str] = None,
    severity: str = "blocker",
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "code": _normalize_text(code, default="studio_issue"),
        "message": _normalize_text(message, default="Studio issue"),
        "severity": _normalize_text(severity, default="blocker").lower(),
    }
    guidance_text = _normalize_optional_text(guidance)
    if guidance_text:
        payload["guidance"] = guidance_text
    return payload


def _telegram_connector_endpoint_key(entry: Dict[str, Any]) -> Optional[str]:
    metadata = _coerce_dict(entry.get("metadata"))
    registry_bindings = _coerce_dict(metadata.get("channel_registry_bindings"))
    telegram_binding = _coerce_dict(registry_bindings.get("telegram"))
    return _normalize_optional_text(
        telegram_binding.get("endpoint_key")
        or metadata.get("telegram_endpoint_key")
        or entry.get("id")
    )


def _telegram_connector_projection(
    entry: Dict[str, Any],
    status_item: Dict[str, Any],
) -> Dict[str, Any]:
    metadata = _coerce_dict(entry.get("metadata"))
    connector_id = _normalize_text(status_item.get("id") or entry.get("id"))
    return {
        "id": connector_id,
        "label": _normalize_text(status_item.get("label") or entry.get("label"), default=connector_id),
        "workspace_id": _normalize_optional_text(status_item.get("workspace_id") or entry.get("workspace_id")),
        "connector_id": connector_id,
        "credential_id": connector_id,
        "endpoint_key": _telegram_connector_endpoint_key(entry),
        "bot_username": _normalize_optional_text(metadata.get("bot_username")),
        "webhook_path": _normalize_optional_text(status_item.get("webhook_path")),
        "webhook_url": _normalize_optional_text(status_item.get("webhook_url")),
        "profile_id": _normalize_optional_text(status_item.get("profile_id")),
        "profile_status": _normalize_optional_text(status_item.get("profile_status")) or "live",
        "profile_issue_code": _normalize_optional_text(status_item.get("profile_issue_code")),
        "profile_issue": _normalize_optional_text(status_item.get("profile_issue")),
        "last_error": _normalize_optional_text(status_item.get("last_error")),
        "last_error_category": _normalize_optional_text(status_item.get("last_error_category")),
        "last_error_at": _normalize_optional_text(status_item.get("last_error_at")),
    }


def _studio_next_action(
    *,
    telegram_enabled: bool,
    blockers: List[Dict[str, Any]],
    connector_options: List[Dict[str, Any]],
) -> str:
    if not telegram_enabled:
        return "Enable Telegram when the specialist is ready for live customer traffic."
    if not connector_options:
        return "Create or unpause a Telegram bot connector for this workspace before launching Studio."
    if blockers:
        first = blockers[0]
        return _normalize_optional_text(first.get("guidance")) or _normalize_text(
            first.get("message"),
            default="Resolve the Telegram launch blockers before deploying.",
        )
    return "Telegram is ready. Review the scoped memory and tools, then deploy the specialist."


def _workspace_telegram_status_payload(owner_workspace_id: str) -> Dict[str, Any]:
    shell = _autopilot_connector_shell_service()
    shell.runtime_facade_service().init_runtime()
    state_service = shell.telegram_service_registry().telegram_autopilot_state_service()
    status_service = AutopilotStatusService(
        normalize_workspace_id=lambda value: str(value or "").strip(),
        telegram_snapshot=lambda: state_service.snapshot(include_connectors=True),
        telegram_list_entries=lambda: state_service.list_connector_entries(owner_workspace_id),
        resolve_telegram_profile=lambda entry: shell.profile_service().resolve_telegram_profile(entry),
        telegram_webhook_path="/channels/telegram/webhook/{connector_id}",
        telegram_public_base_url=shell.bridge_facade_service().telegram_public_base_url_getter(),
        telegram_webhook_secret_configured=bool(shell.bridge_facade_service().telegram_configured_webhook_secret_getter()),
        telegram_delivery_mode=shell.bridge_facade_service().telegram_delivery_mode_getter(),
        whatsapp_snapshot=lambda: {"enabled": False, "connectors": {}},
        whatsapp_list_entries=lambda: [],
        resolve_whatsapp_profile=lambda _entry: {"id": "disabled", "status": "disabled"},
        whatsapp_webhook_path="/channels/whatsapp/twilio/webhook",
        whatsapp_public_base_url="",
        whatsapp_webhook_secret_configured=False,
    )
    return status_service.telegram_status_payload()


def _workspace_telegram_connector_options(owner_workspace_id: str) -> List[Dict[str, Any]]:
    shell = _autopilot_connector_shell_service()
    shell.runtime_facade_service().init_runtime()
    state_service = shell.telegram_service_registry().telegram_autopilot_state_service()
    raw_entries = state_service.list_connector_entries(owner_workspace_id)
    raw_by_id = {
        _normalize_text(item.get("id")): item
        for item in raw_entries
        if _normalize_text(item.get("id"))
    }
    status_payload = _workspace_telegram_status_payload(owner_workspace_id)
    options: List[Dict[str, Any]] = []
    for item in _coerce_list(status_payload.get("connectors")):
        status_item = _coerce_dict(item)
        connector_id = _normalize_text(status_item.get("id"))
        if not connector_id:
            continue
        options.append(_telegram_connector_projection(raw_by_id.get(connector_id, {}), status_item))
    return options


def _config_from_record(
    record: Optional[Dict[str, Any]],
    *,
    runtime_profile_id: Any = None,
) -> deployed_agent_config_schema.DeployedAgentConfig:
    return deployed_agent_config_schema.deployed_agent_config_from_record(
        record,
        runtime_profile_id=runtime_profile_id,
    )


def _operational_state_from_record(
    record: Optional[Dict[str, Any]],
) -> deployed_agent_config_schema.DeployedAgentOperationalState:
    return deployed_agent_config_schema.deployed_agent_operational_state_from_record(record)


def _metadata_from_config(
    config: deployed_agent_config_schema.DeployedAgentConfig,
    *,
    existing_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return deployed_agent_config_schema.metadata_from_deployed_agent_config(
        config,
        existing_metadata=existing_metadata,
    )


def _serialized_operational_state(
    state: deployed_agent_config_schema.DeployedAgentOperationalState,
) -> Dict[str, Any]:
    return deployed_agent_config_schema.operational_state_payload(state)


def _config_payload(
    config: deployed_agent_config_schema.DeployedAgentConfig,
) -> Dict[str, Any]:
    return config.model_dump(exclude_none=True)


def _operational_state_payload(
    state: deployed_agent_config_schema.DeployedAgentOperationalState,
) -> Dict[str, Any]:
    return state.model_dump(exclude_none=True)


def _channels_payload_from_config(
    config: deployed_agent_config_schema.DeployedAgentConfig,
) -> Dict[str, Dict[str, Any]]:
    payload = _config_payload(config)
    return dict(payload.get("channels") or {})


def _workspace_admin_defaults(
    workspace_record: Optional[Dict[str, Any]],
) -> workspace_config_schema.WorkspaceAdminDefaultsConfig:
    metadata = _coerce_dict((workspace_record or {}).get("metadata"))
    return workspace_config_schema.workspace_admin_defaults_from_metadata(metadata)


def _config_field_present(config_payload: Optional[Dict[str, Any]], *path: str) -> bool:
    current: Any = config_payload if isinstance(config_payload, dict) else {}
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return False
        current = current.get(key)
    return True


def _apply_workspace_admin_defaults_to_config(
    config: deployed_agent_config_schema.DeployedAgentConfig,
    *,
    workspace_defaults: workspace_config_schema.WorkspaceAdminDefaultsConfig,
    runtime_target_supplied: bool = False,
    billing_plan_supplied: bool = False,
    config_payload: Optional[Dict[str, Any]] = None,
    legacy_metadata: Optional[Dict[str, Any]] = None,
) -> deployed_agent_config_schema.DeployedAgentConfig:
    owner_metadata = _coerce_dict(legacy_metadata)
    payload = config.model_dump(exclude_none=True)
    if (
        not runtime_target_supplied
        and not _config_field_present(config_payload, "runtime_target")
        and _config_field_present(config_payload, "runtime_placement")
    ):
        payload["runtime_target"] = deployed_agent_runtime_contract_service.runtime_target_for_placement(
            payload.get("runtime_placement")
        )
    elif not runtime_target_supplied and not _config_field_present(config_payload, "runtime_target"):
        payload["runtime_target"] = str(workspace_defaults.runtime_target or config.runtime_target).strip() or config.runtime_target
    if not billing_plan_supplied and not _config_field_present(config_payload, "billing_plan"):
        payload["billing_plan"] = str(workspace_defaults.billing_plan or config.billing_plan).strip() or config.billing_plan

    customer_policy = dict(payload.get("customer_policy") or {})
    if not _config_field_present(config_payload, "customer_policy", "public_start_cta_label"):
        if not str(customer_policy.get("public_start_cta_label") or "").strip():
            customer_policy["public_start_cta_label"] = workspace_defaults.public_start_cta_label
    if not _config_field_present(config_payload, "customer_policy", "public_start_cta_url"):
        if not str(customer_policy.get("public_start_cta_url") or "").strip():
            customer_policy["public_start_cta_url"] = workspace_defaults.public_start_cta_url
    payload["customer_policy"] = customer_policy

    memory_policy = dict(payload.get("memory_policy") or {})
    if (
        not _config_field_present(config_payload, "memory_policy", "context_budget_preset")
        and "context_budget_preset" not in owner_metadata
    ):
        memory_policy["context_budget_preset"] = workspace_defaults.context_budget_preset
    if (
        not _config_field_present(config_payload, "memory_policy", "retention_preset")
        and "retention_preset" not in owner_metadata
    ):
        memory_policy["retention_preset"] = workspace_defaults.retention_preset
    payload["memory_policy"] = memory_policy

    safety_policy = dict(payload.get("safety_policy") or {})
    if (
        not _config_field_present(config_payload, "safety_policy", "health_safety_enabled")
        and "health_safety_enabled" not in owner_metadata
    ):
        safety_policy["health_safety_enabled"] = bool(workspace_defaults.health_safety_enabled)
    payload["safety_policy"] = safety_policy
    return deployed_agent_config_schema.DeployedAgentConfig.model_validate(payload)


def _allowed_live_channels_for_workspace(workspace_record: Optional[Dict[str, Any]]) -> frozenset[str]:
    defaults = _workspace_admin_defaults(workspace_record)
    tokens = [str(item or "").strip().lower() for item in defaults.allowed_live_channels]
    normalized = frozenset(token for token in tokens if token)
    return normalized or DEPLOYED_AGENT_LIVE_CHANNELS


def _escalation_triggers_for_config(
    config: deployed_agent_config_schema.DeployedAgentConfig,
) -> str:
    preset = _normalize_text(
        config.escalation_policy.preset,
        default=config_defaults_service.default_deployed_agent_escalation_preset(),
    ).lower()
    return _ESCALATION_PRESET_TRIGGERS.get(
        preset,
        _ESCALATION_PRESET_TRIGGERS[config_defaults_service.default_deployed_agent_escalation_preset()],
    )


def _apply_provider_model_selection_to_config(
    config: deployed_agent_config_schema.DeployedAgentConfig,
    *,
    provider: Any = None,
    model: Any = None,
    owner_workspace_id: Any = None,
) -> deployed_agent_config_schema.DeployedAgentConfig:
    requested_provider = provider if provider is not None else config.provider
    resolved = provider_catalog_service.resolve_provider_model_selection(
        provider=requested_provider,
        model=model if model is not None else config.model,
        existing_provider=config.provider,
        existing_model=config.model,
        cached_models=provider_catalog_service.cached_provider_model_ids(
            workspace_id=owner_workspace_id,
            provider=requested_provider,
        ),
    )
    next_payload = config.model_dump(exclude_none=True)
    next_payload["provider"] = resolved.get("provider")
    next_payload["model"] = resolved.get("model")
    return deployed_agent_config_schema.DeployedAgentConfig.model_validate(next_payload)


def _normalize_deployed_agent_metadata(
    value: Any,
    *,
    existing: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if value is not None and not isinstance(value, dict):
        raise ValueError("metadata must be an object.")
    config = _config_from_record(
        {
            "name": "Draft deployed agent",
            "metadata": {
                **_coerce_dict(existing),
                **_coerce_dict(value),
            },
        }
    )
    return _metadata_from_config(config, existing_metadata=existing)


def _selected_provider(value: Any) -> Optional[str]:
    config = _config_from_record({"name": "Draft deployed agent", "metadata": _coerce_dict(value)})
    return config.provider


def _selected_model(value: Any) -> Optional[str]:
    config = _config_from_record({"name": "Draft deployed agent", "metadata": _coerce_dict(value)})
    return config.model


def _apply_provider_model_selection(
    metadata: Dict[str, Any],
    *,
    provider: Any = None,
    model: Any = None,
    owner_workspace_id: Any = None,
) -> Dict[str, Any]:
    config = _config_from_record({"name": "Draft deployed agent", "metadata": metadata})
    return _metadata_from_config(
        _apply_provider_model_selection_to_config(
            config,
            provider=provider,
            model=model,
            owner_workspace_id=owner_workspace_id,
        ),
        existing_metadata=metadata,
    )


def _compact_text(value: Any, *, limit: int = 220) -> Optional[str]:
    text = " ".join(str(value or "").strip().split())
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _normalize_pagination(limit: Any, offset: Any) -> tuple[int, int]:
    return max(1, min(int(limit or 50), 100)), max(0, int(offset or 0))


def _timestamp_token(value: Any) -> str:
    return str(value or "").strip()


def _actor_summary(actor: Any) -> Dict[str, Any]:
    payload = _coerce_dict(actor)
    actor_id = (
        _normalize_optional_text(payload.get("id"))
        or _normalize_optional_text(payload.get("user_id"))
        or _normalize_optional_text(payload.get("external_id"))
        or _normalize_optional_text(payload.get("username"))
        or _normalize_optional_text(payload.get("handle"))
    )
    label = (
        _normalize_optional_text(payload.get("display_name"))
        or _normalize_optional_text(payload.get("name"))
        or _normalize_optional_text(payload.get("username"))
        or _normalize_optional_text(payload.get("handle"))
        or actor_id
    )
    summary = {
        "id": actor_id,
        "label": label,
        "type": _normalize_optional_text(payload.get("type")) or "customer",
        "username": _normalize_optional_text(payload.get("username")),
        "handle": _normalize_optional_text(payload.get("handle")),
    }
    return {key: value for key, value in summary.items() if value is not None}


def _result_connector_action(result_data: Any) -> Optional[Dict[str, Any]]:
    payload = _coerce_dict(result_data)
    connector_action = payload.get("connector_action")
    if isinstance(connector_action, dict):
        return dict(connector_action)
    last_node_data = payload.get("last_node_data")
    if isinstance(last_node_data, dict) and isinstance(last_node_data.get("connector_action"), dict):
        return dict(last_node_data.get("connector_action") or {})
    return None


def _approval_id_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    candidates = [
        payload,
        _coerce_dict(payload.get("metadata")),
        _coerce_dict(payload.get("decision_payload")),
        _coerce_dict(payload.get("request_payload")),
        _coerce_dict(payload.get("outbox_payload")),
        _coerce_dict(payload.get("notification")),
        _coerce_dict(payload.get("pending_approval")),
        _coerce_dict(payload.get("pending_confirmation")),
    ]
    for candidate in candidates:
        approval_id = _normalize_optional_text(candidate.get("approval_id"))
        if approval_id:
            return approval_id
    return None


def _is_approval_activity(row: Dict[str, Any]) -> bool:
    action = _normalize_text(row.get("action")).lower()
    event_class = _normalize_text(row.get("event_class")).lower()
    payload = _coerce_dict(row.get("payload"))
    metadata = _coerce_dict(row.get("metadata"))
    return (
        event_class == "approval"
        or "approval" in action
        or _approval_id_from_payload(payload) is not None
        or _approval_id_from_payload(metadata) is not None
    )


def _is_escalation_activity(row: Dict[str, Any]) -> bool:
    action = _normalize_text(row.get("action")).lower()
    event_class = _normalize_text(row.get("event_class")).lower()
    summary_blob = " ".join(
        [
            _normalize_text(row.get("title")),
            _normalize_text(row.get("summary")),
        ]
    ).lower()
    payload = _coerce_dict(row.get("payload"))
    metadata = _coerce_dict(row.get("metadata"))
    resolution = _normalize_text(payload.get("resolution") or metadata.get("resolution")).lower()
    return (
        event_class == "blocked_action"
        or action in {"escalate", "escalated"}
        or resolution == "escalated"
        or bool(payload.get("escalated"))
        or bool(metadata.get("escalated"))
        or "escalat" in summary_blob
    )


def _tool_call_entry_from_activity(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = _coerce_dict(row.get("payload"))
    metadata = _coerce_dict(row.get("metadata"))
    connector_action = None
    for candidate in (
        payload.get("connector_action"),
        metadata.get("connector_action"),
        _coerce_dict(payload.get("result_data")).get("connector_action"),
    ):
        if isinstance(candidate, dict):
            connector_action = dict(candidate)
            break
    tool_name = (
        _normalize_optional_text(metadata.get("tool_name"))
        or _normalize_optional_text(payload.get("tool_name"))
        or (
            f"{_normalize_text(connector_action.get('connector')).lower()}.{_normalize_text(connector_action.get('action_id')).lower()}"
            if isinstance(connector_action, dict)
            and _normalize_optional_text(connector_action.get("connector"))
            and _normalize_optional_text(connector_action.get("action_id"))
            else None
        )
    )
    if not tool_name and not isinstance(connector_action, dict):
        return None
    return {
        "id": str(row.get("id") or "").strip() or None,
        "kind": "tool_call",
        "ts": str(row.get("created_at") or "").strip() or None,
        "run_id": _normalize_optional_text(row.get("run_id")),
        "thread_id": _normalize_optional_text(row.get("thread_id")),
        "tool_name": tool_name,
        "status": _normalize_optional_text(row.get("status")) or "logged",
        "summary": _compact_text(row.get("summary") or row.get("title") or tool_name),
        "details": connector_action or payload or metadata,
    }


def _tool_call_entry_from_run(run_id: str, run_snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    connector_action = _result_connector_action(run_snapshot.get("result_data"))
    if not isinstance(connector_action, dict):
        return None
    connector_id = _normalize_optional_text(connector_action.get("connector"))
    action_id = _normalize_optional_text(connector_action.get("action_id"))
    tool_name = (
        f"{connector_id}.{action_id}".lower()
        if connector_id and action_id
        else connector_id
        or action_id
    )
    return {
        "id": f"run-tool:{run_id}",
        "kind": "tool_call",
        "ts": (
            _normalize_optional_text(run_snapshot.get("completed_at"))
            or _normalize_optional_text(run_snapshot.get("updated_at"))
            or _normalize_optional_text(run_snapshot.get("started_at"))
            or _normalize_optional_text(run_snapshot.get("created_at"))
        ),
        "run_id": run_id,
        "thread_id": _normalize_optional_text(run_snapshot.get("thread_id")),
        "tool_name": tool_name,
        "status": _normalize_optional_text(run_snapshot.get("status")) or "completed",
        "summary": _compact_text(
            run_snapshot.get("summary")
            or _coerce_dict(run_snapshot.get("result_data")).get("summary")
            or f"Connector action completed: {tool_name or 'tool'}."
        ),
        "details": connector_action,
    }


def _run_step_number(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    text = _normalize_optional_text(value)
    if not text:
        return None
    try:
        return int(text)
    except (TypeError, ValueError):
        return None


def _run_step_entry_from_activity(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    run_id = _normalize_optional_text(row.get("run_id"))
    if not run_id or _is_approval_activity(row) or _is_escalation_activity(row):
        return None
    payload = _coerce_dict(row.get("payload"))
    metadata = _coerce_dict(row.get("metadata"))
    event_class = _normalize_optional_text(row.get("event_class")) or "activity"
    action = (
        _normalize_optional_text(row.get("action"))
        or _normalize_optional_text(payload.get("event"))
        or _normalize_optional_text(metadata.get("event"))
        or "step"
    )
    step_id = (
        _normalize_optional_text(payload.get("step_id"))
        or _normalize_optional_text(metadata.get("step_id"))
        or _normalize_optional_text(payload.get("id"))
        or _normalize_optional_text(metadata.get("id"))
    )
    step_index = _run_step_number(payload.get("step_index"))
    if step_index is None:
        step_index = _run_step_number(metadata.get("step_index"))
    step_number = _run_step_number(payload.get("step_number"))
    if step_number is None:
        step_number = _run_step_number(metadata.get("step_number"))
    summary = _compact_text(
        row.get("summary")
        or row.get("title")
        or payload.get("message")
        or metadata.get("message")
        or action
    )
    return {
        "id": str(row.get("id") or "").strip() or f"run-step:{run_id}:{action}:{_timestamp_token(row.get('created_at'))}",
        "kind": "run_step",
        "source": "activity",
        "ts": _normalize_optional_text(row.get("created_at")),
        "run_id": run_id,
        "thread_id": _normalize_optional_text(row.get("thread_id")),
        "event_class": event_class,
        "action": action,
        "status": _normalize_optional_text(row.get("status")) or "logged",
        "step_id": step_id,
        "step_index": step_index,
        "step_number": step_number,
        "summary": summary,
        "details": payload or metadata or {"summary": summary, "event_class": event_class, "action": action},
    }


def _run_step_entries_from_run(run_id: str, run_snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    thread_id = _normalize_optional_text(run_snapshot.get("thread_id"))
    snapshot_events = run_snapshot.get("events") if isinstance(run_snapshot.get("events"), list) else []
    for index, event in enumerate(snapshot_events):
        if not isinstance(event, dict):
            continue
        action = (
            _normalize_optional_text(event.get("event"))
            or _normalize_optional_text(event.get("type"))
            or "step"
        )
        step_id = _normalize_optional_text(event.get("step_id")) or _normalize_optional_text(event.get("id"))
        step_index = _run_step_number(event.get("step_index"))
        step_number = _run_step_number(event.get("step_number"))
        ts = (
            _normalize_optional_text(event.get("ts"))
            or _normalize_optional_text(event.get("created_at"))
            or _normalize_optional_text(event.get("updated_at"))
            or _normalize_optional_text(run_snapshot.get("completed_at"))
            or _normalize_optional_text(run_snapshot.get("updated_at"))
            or _normalize_optional_text(run_snapshot.get("started_at"))
            or _normalize_optional_text(run_snapshot.get("created_at"))
        )
        summary = _compact_text(
            event.get("message")
            or event.get("label")
            or event.get("summary")
            or action
        )
        entries.append(
            {
                "id": step_id or f"run-step:{run_id}:event:{index}",
                "kind": "run_step",
                "source": "run_snapshot",
                "ts": ts,
                "run_id": run_id,
                "thread_id": thread_id,
                "event_class": "run_event",
                "action": action,
                "status": _normalize_optional_text(event.get("status"))
                or _normalize_optional_text(event.get("level"))
                or _normalize_optional_text(run_snapshot.get("status"))
                or "logged",
                "step_id": step_id,
                "step_index": step_index,
                "step_number": step_number,
                "summary": summary,
                "details": dict(event),
            }
        )
    if entries:
        return entries
    status = _normalize_optional_text(run_snapshot.get("status")) or _normalize_optional_text(run_snapshot.get("state"))
    if not status:
        return []
    summary = _compact_text(
        run_snapshot.get("summary")
        or _coerce_dict(run_snapshot.get("result_data")).get("summary")
        or f"Run {status}."
    )
    return [
        {
            "id": f"run-step:{run_id}:status",
            "kind": "run_step",
            "source": "run_snapshot",
            "ts": (
                _normalize_optional_text(run_snapshot.get("completed_at"))
                or _normalize_optional_text(run_snapshot.get("updated_at"))
                or _normalize_optional_text(run_snapshot.get("started_at"))
                or _normalize_optional_text(run_snapshot.get("created_at"))
            ),
            "run_id": run_id,
            "thread_id": thread_id,
            "event_class": "run_status",
            "action": status,
            "status": status,
            "step_id": None,
            "step_index": None,
            "step_number": None,
            "summary": summary,
            "details": {
                "status": status,
                "summary": summary,
                "result_data": _coerce_dict(run_snapshot.get("result_data")),
            },
        }
    ]


def _message_entry_from_channel_event(event: Dict[str, Any]) -> Dict[str, Any]:
    payload = _coerce_dict(event.get("payload"))
    text = _normalize_text(
        event.get("text")
        or payload.get("text")
        or payload.get("summary")
        or payload.get("message")
    )
    return {
        "id": str(event.get("id") or "").strip() or None,
        "kind": "message",
        "ts": _normalize_optional_text(event.get("created_at")),
        "direction": _normalize_optional_text(event.get("direction")) or "system",
        "event_type": _normalize_optional_text(event.get("event_type")) or "message",
        "run_id": _normalize_optional_text(event.get("run_id")),
        "thread_id": _normalize_optional_text(event.get("thread_id")),
        "channel": _normalize_optional_text(event.get("channel_key")),
        "status": _normalize_optional_text(event.get("status")) or "logged",
        "text": text,
        "actor": _coerce_dict(event.get("actor")),
        "payload": payload,
    }


def _approval_entry_from_activity(
    row: Dict[str, Any],
    *,
    approval_record: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = _coerce_dict(row.get("payload"))
    metadata = _coerce_dict(row.get("metadata"))
    record = approval_record if isinstance(approval_record, dict) else {}
    resolution = (
        _normalize_optional_text(record.get("resolution"))
        or _normalize_optional_text(payload.get("resolution"))
        or _normalize_optional_text(metadata.get("resolution"))
        or (
            "requested"
            if _normalize_text(row.get("action")).lower() == "approval_requested"
            else None
        )
    )
    return {
        "id": str(row.get("id") or "").strip() or None,
        "kind": "approval",
        "ts": _normalize_optional_text(row.get("created_at")),
        "run_id": _normalize_optional_text(row.get("run_id")) or _normalize_optional_text(record.get("run_id")),
        "thread_id": _normalize_optional_text(row.get("thread_id")),
        "approval_id": _approval_id_from_payload(payload) or _approval_id_from_payload(metadata) or _normalize_optional_text(record.get("approval_id")),
        "action": _normalize_optional_text(row.get("action")) or "approval",
        "status": _normalize_optional_text(record.get("status")) or _normalize_optional_text(row.get("status")) or "logged",
        "resolution": resolution,
        "summary": _compact_text(row.get("summary") or row.get("title") or resolution or "Approval event"),
        "details": record or payload or metadata,
    }


def _escalation_entry_from_activity(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = _coerce_dict(row.get("payload"))
    metadata = _coerce_dict(row.get("metadata"))
    return {
        "id": str(row.get("id") or "").strip() or None,
        "kind": "escalation",
        "ts": _normalize_optional_text(row.get("created_at")),
        "run_id": _normalize_optional_text(row.get("run_id")),
        "thread_id": _normalize_optional_text(row.get("thread_id")),
        "action": _normalize_optional_text(row.get("action")) or "escalated",
        "status": _normalize_optional_text(row.get("status")) or "logged",
        "summary": _compact_text(row.get("summary") or row.get("title") or "Escalation triggered."),
        "details": payload or metadata,
    }


def _entry_sort_key(entry: Dict[str, Any]) -> tuple[str, int, str]:
    order = {"message": 0, "run_step": 1, "tool_call": 2, "approval": 3, "escalation": 4}
    return (
        _timestamp_token(entry.get("ts")),
        order.get(str(entry.get("kind") or ""), 9),
        str(entry.get("id") or ""),
    )


def _derive_escalation_state(activity_rows: List[Dict[str, Any]]) -> str:
    latest_state = "clear"
    for row in sorted(activity_rows, key=lambda item: (_timestamp_token(item.get("created_at")), str(item.get("id") or ""))):
        if _is_escalation_activity(row):
            latest_state = "escalated"
            continue
        if _is_approval_activity(row):
            action = _normalize_text(row.get("action")).lower()
            payload = _coerce_dict(row.get("payload"))
            metadata = _coerce_dict(row.get("metadata"))
            resolution = _normalize_text(payload.get("resolution") or metadata.get("resolution")).lower()
            if action == "approval_requested":
                latest_state = "approval_requested"
            elif resolution:
                latest_state = resolution
    return latest_state


def _derive_outcome(
    *,
    activity_rows: List[Dict[str, Any]],
    run_snapshots: Dict[str, Dict[str, Any]],
) -> Optional[str]:
    ordered_activity = sorted(
        activity_rows,
        key=lambda item: (_timestamp_token(item.get("created_at")), str(item.get("id") or "")),
    )
    for row in reversed(ordered_activity):
        event_class = _normalize_text(row.get("event_class")).lower()
        action = _normalize_text(row.get("action")).lower()
        status = _normalize_text(row.get("status")).lower()
        payload = _coerce_dict(row.get("payload"))
        metadata = _coerce_dict(row.get("metadata"))
        resolution = _normalize_text(payload.get("resolution") or metadata.get("resolution")).lower()
        if event_class == "run_status" and action:
            return action
        if resolution:
            return resolution
        if status in {"completed", "failed", "timeout", "rejected", "approved", "escalated"}:
            return status
    for run_snapshot in run_snapshots.values():
        status = _normalize_optional_text(run_snapshot.get("status")) or _normalize_optional_text(run_snapshot.get("state"))
        if status:
            return status.lower()
    return None


async def _get_run_snapshot(run_id: str) -> Optional[Dict[str, Any]]:
    token = _normalize_optional_text(run_id)
    if not token:
        return None
    live_run = await run_state_repository.get_live_run(token)
    if isinstance(live_run, dict):
        return {"source": "live", "payload": live_run}
    archived_run = await run_state_repository.get_archived_run(token)
    if isinstance(archived_run, dict):
        return {"source": "archive", "payload": archived_run}
    return None


async def _load_conversation_activity(
    *,
    tenant_id: str,
    workspace_id: str,
    backing_install_id: str,
    session_id: str,
    thread_id: Optional[str],
    run_ids: List[str],
) -> List[Dict[str, Any]]:
    rows_by_id: Dict[str, Dict[str, Any]] = {}

    async def _merge(**filters: Any) -> None:
        rows = await control_plane_repository.list_activity_ledger_events(
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            install_id=backing_install_id,
            limit=300,
            **filters,
        )
        for row in rows:
            row_id = str((row or {}).get("id") or "").strip()
            if row_id and row_id not in rows_by_id:
                rows_by_id[row_id] = dict(row)

    await _merge(session_key=session_id)
    if thread_id:
        await _merge(thread_id=thread_id)
    for run_id in run_ids:
        await _merge(run_id=run_id)
    return sorted(
        rows_by_id.values(),
        key=lambda item: (_timestamp_token(item.get("created_at")), str(item.get("id") or "")),
    )


async def resolve_deployed_agent_for_channel_owner(
    *,
    tenant_id: str,
    owner_workspace_id: str,
    backing_install_id: str,
    channel_key: str,
    endpoint_key: Any,
) -> Optional[Dict[str, Any]]:
    deployed_agent = await control_plane_repository.get_deployed_agent_by_backing_install_id(
        backing_install_id,
        tenant_id=tenant_id,
        owner_workspace_id=owner_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    if not _channel_config_matches_endpoint(
        deployed_agent=deployed_agent,
        channel_key=channel_key,
        endpoint_key=endpoint_key,
    ):
        return None
    return deployed_agent


def paused_channel_reply(
    *,
    deployed_agent: Optional[Dict[str, Any]],
) -> str:
    config = _config_from_record(deployed_agent)
    configured = _normalize_optional_text(config.customer_policy.paused_message)
    if configured:
        return configured
    name = _normalize_optional_text((deployed_agent or {}).get("name")) or "This assistant"
    return f"{name} is temporarily paused. Please try again shortly."


def daily_limit_channel_reply(
    *,
    deployed_agent: Optional[Dict[str, Any]],
    upgrade_cta_url: Optional[str] = None,
    upgrade_cta_label: Optional[str] = None,
) -> str:
    config = _config_from_record(deployed_agent)
    name = _normalize_optional_text((deployed_agent or {}).get("name")) or "This assistant"
    resolved_url = _normalize_optional_text(upgrade_cta_url) or _normalize_optional_text(
        config.customer_policy.upgrade_cta_url
    )
    resolved_label = _normalize_optional_text(upgrade_cta_label) or _normalize_optional_text(
        config.customer_policy.upgrade_cta_label
    )
    reply = f"{name} has reached today's free message limit."
    if resolved_url and resolved_label:
        reply = f"{reply} {resolved_label}: {resolved_url}"
    elif resolved_url:
        reply = f"{reply} Continue here: {resolved_url}"
    else:
        reply = f"{reply} Please come back tomorrow."
    return external_user_privacy_service.get_external_user_privacy_service().append_privacy_policy_line(
        reply,
        workspace_id=_normalize_optional_text((deployed_agent or {}).get("owner_workspace_id")),
    )


def _require_live_channel_configuration(
    channels: Dict[str, Any],
    *,
    allowed_live_channels: Optional[set[str] | frozenset[str]] = None,
) -> None:
    resolved_allowed = frozenset(
        str(channel or "").strip().lower()
        for channel in (allowed_live_channels or DEPLOYED_AGENT_LIVE_CHANNELS)
        if str(channel or "").strip()
    ) or DEPLOYED_AGENT_LIVE_CHANNELS
    live_channels = _live_channel_keys(channels)
    if not live_channels:
        raise ValueError("A Telegram inbound binding is required before a deployed agent can go live.")
    unsupported = sorted(live_channels - resolved_allowed)
    if unsupported:
        allowed_label = ", ".join(channel.title() for channel in sorted(resolved_allowed))
        raise ValueError(f"Only {allowed_label} may be activated for live deployment in Phase 2.")
    telegram_binding = dict(channels.get("telegram") or {})
    if "telegram" in resolved_allowed and not bool(telegram_binding.get("enabled")):
        raise ValueError("Telegram must be enabled before a deployed agent can go live.")
    if "telegram" in resolved_allowed and not bool(telegram_binding.get("is_inbound_owner")):
        raise ValueError("Telegram live deployments must claim inbound ownership.")
    if "telegram" in resolved_allowed and not _normalize_optional_text(telegram_binding.get("endpoint_key")):
        raise ValueError("Telegram live deployments require an endpoint_key.")


def _base_manifest(
    *,
    name: str,
    persona: str,
    system_prompt: str,
    runtime_target: str,
    channels: Dict[str, Any],
    escalation_triggers: Optional[str] = None,
) -> AgentManifest:
    manifest_channels = {
        channel_key: bool(_channel_enabled(channels.get(channel_key)))
        for channel_key in _MANIFEST_CHANNEL_KEYS
    }
    summary = persona or system_prompt[:240] or f"{name} customer-facing specialist"
    return AgentManifest(
        manifest_id=f"deployed-agent-{name.lower().replace(' ', '-')}",
        identity=AgentManifestIdentity(
            name=name,
            role="Customer-facing service specialist",
            archetype="support_specialist",
            summary=summary,
            owner_mode_enabled=True,
            customer_mode_enabled=True,
        ),
        voice=AgentManifestVoiceProfile(
            tone=persona,
            response_style="Answer clearly, stay within configured boundaries, and escalate when uncertain.",
            service_boundaries="Never imply access beyond configured knowledge, connectors, and approvals.",
        ),
        bible=AgentManifestBible(
            mission=f"Serve as {name} for customer-facing conversations and execution requests.",
            hard_context=system_prompt,
            operational_policy="Use configured knowledge and tools, respect approval boundaries, and escalate when uncertain.",
            core_responsibilities="Answer requests, retrieve allowed data, and keep customer-facing interactions legible.",
            guardrails="Do not expose owner-only context. Do not exceed configured connector, memory, or tool scope.",
            escalation_triggers=_normalize_text(
                escalation_triggers,
                default=_ESCALATION_PRESET_TRIGGERS[config_defaults_service.default_deployed_agent_escalation_preset()],
            ),
        ),
        channels=AgentManifestChannels.model_validate(manifest_channels),
        runtime=AgentManifestRuntime(mode=_runtime_target_to_specialist_mode(runtime_target)),
    )


def require_deployed_agent_admin_access(
    *,
    current_user: Optional[Dict[str, Any]],
    workspace_id: str,
) -> str:
    resolved_workspace_id = str(workspace_id or "").strip()
    if not resolved_workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if auth_module.current_user_has_auth_admin_access(current_user):
        return resolved_workspace_id
    return auth_module.enforce_workspace_access(
        current_user,
        resolved_workspace_id,
        minimum_role="owner",
    )


def project_deployed_agent(
    deployed_agent: Optional[Dict[str, Any]],
    *,
    include_internal: bool = False,
) -> Optional[Dict[str, Any]]:
    if not isinstance(deployed_agent, dict):
        return None
    config = _config_from_record(deployed_agent)
    operational_state = _operational_state_from_record(deployed_agent)
    projected = {
        field: deployed_agent.get(field)
        for field in DEPLOYED_AGENT_PUBLIC_FIELDS
    }
    projected["provider"] = _normalize_optional_text(config.provider)
    projected["model"] = _normalize_optional_text(config.model)
    config_payload = _config_payload(config)
    config_payload["specialist_profile"] = _derive_studio_specialist_profile(
        deployed_agent=deployed_agent,
        config=config,
    )
    config_payload["agent_workspace"] = _deployed_agent_workspace_contract(deployed_agent)
    projected["config"] = config_payload
    projected["operational_state"] = _operational_state_payload(operational_state)
    if include_internal:
        for field in DEPLOYED_AGENT_INTERNAL_FIELDS:
            if field == "metadata":
                projected[field] = _metadata_from_config(
                    config,
                    existing_metadata=_coerce_dict(deployed_agent.get("metadata")),
                )
            else:
                projected[field] = deployed_agent.get(field)
    return projected


def validate_state_transition(current_state: Any, next_state: Any) -> str:
    resolved_current = _normalize_deployment_state(current_state)
    resolved_next = _normalize_deployment_state(next_state)
    allowed_transitions = {
        "draft": {"draft", "staging", "live", "paused"},
        "staging": {"staging", "live", "paused"},
        "live": {"live", "paused"},
        "paused": {"paused", "staging", "live"},
    }
    if resolved_next not in allowed_transitions.get(resolved_current, set()):
        raise ValueError(f"Unsupported deployed-agent state transition: {resolved_current} -> {resolved_next}.")
    return resolved_next


def validate_can_deploy(
    *,
    deployed_agent: Optional[Dict[str, Any]],
    backing_install: Optional[Dict[str, Any]],
    allowed_live_channels: Optional[set[str] | frozenset[str]] = None,
) -> bool:
    if not isinstance(deployed_agent, dict):
        raise ValueError("Deployed agent is required.")
    if not isinstance(backing_install, dict):
        raise ValueError("Backing specialist install is required.")
    if str(deployed_agent.get("backing_install_id") or "").strip() != str(backing_install.get("id") or "").strip():
        raise ValueError("Deployed agent backing install does not match the specialist install.")
    if str(deployed_agent.get("tenant_id") or "").strip() != str(backing_install.get("tenant_id") or "").strip():
        raise ValueError("Deployed agent and backing specialist tenant scope must match.")
    if str(deployed_agent.get("owner_workspace_id") or "").strip() != str(backing_install.get("workspace_id") or "").strip():
        raise ValueError("Deployed agent and backing specialist workspace scope must match.")
    live_channels = _live_channel_keys(deployed_agent.get("channels") or {})
    resolved_allowed = frozenset(
        str(channel or "").strip().lower()
        for channel in (allowed_live_channels or DEPLOYED_AGENT_LIVE_CHANNELS)
        if str(channel or "").strip()
    ) or DEPLOYED_AGENT_LIVE_CHANNELS
    unsupported = sorted(live_channels - resolved_allowed)
    if unsupported:
        allowed_label = ", ".join(channel.title() for channel in sorted(resolved_allowed))
        raise ValueError(f"Only {allowed_label} may be activated for live deployment in Phase 1.")
    specialist_mode = str(
        backing_install.get("specialist_mode")
        or (backing_install.get("metadata") or {}).get("specialist_mode")
        or ""
    ).strip().lower()
    if specialist_mode != "customer_live":
        raise ValueError("Backing specialist must be in customer_live mode before deployment can go live.")
    return True


async def mirror_deployed_agent_to_backing_specialist(
    *,
    deployed_agent: Dict[str, Any],
    backing_install: Optional[Dict[str, Any]] = None,
    updated_by_user_id: Optional[str] = None,
    specialist_mode_override: Optional[str] = None,
    deployment_state_override: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(deployed_agent, dict):
        return None
    tenant_id = _normalize_text(deployed_agent.get("tenant_id"))
    workspace_id = _normalize_text(deployed_agent.get("owner_workspace_id"))
    backing_install_id = _normalize_text(deployed_agent.get("backing_install_id"))
    if not tenant_id or not workspace_id or not backing_install_id:
        raise ValueError("Deployed agent is missing required backing specialist linkage.")
    install = backing_install or await agent_specialist_repository.get_workspace_specialist(
        backing_install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
    )
    if not isinstance(install, dict):
        raise ValueError("Backing specialist install is unavailable.")
    config = _config_from_record(
        deployed_agent,
        runtime_profile_id=install.get("runtime_profile_id"),
    )
    manifest = agent_specialist_repository.manifest_from_install_bundle(install) or _base_manifest(
        name=config.name,
        persona=config.persona,
        system_prompt=config.system_prompt,
        runtime_target=config.runtime_target,
        channels=_channels_payload_from_config(config),
        escalation_triggers=_escalation_triggers_for_config(config),
    )
    channels = _channels_payload_from_config(config)
    runtime_target = config.runtime_target
    selected_provider = _normalize_optional_text(config.provider)
    selected_model = _normalize_optional_text(config.model)
    manifest.identity.name = _normalize_text(config.name, default=manifest.identity.name)
    manifest.identity.summary = _normalize_text(
        config.persona,
        default=manifest.identity.summary or manifest.identity.name,
    )
    manifest.voice.tone = _normalize_text(config.persona, default=manifest.voice.tone)
    manifest.bible.hard_context = _normalize_text(
        config.system_prompt,
        default=manifest.bible.hard_context,
    )
    manifest.bible.escalation_triggers = _escalation_triggers_for_config(config)
    manifest.runtime = AgentManifestRuntime(
        mode=_runtime_target_to_specialist_mode(runtime_target),
        profile_id=str(install.get("runtime_profile_id") or manifest.runtime.profile_id or "").strip() or None,
    )
    manifest.channels = AgentManifestChannels.model_validate(
        {
            channel_key: bool(_channel_enabled(channels.get(channel_key)))
            for channel_key in _MANIFEST_CHANNEL_KEYS
        }
    )
    specialist_mode = str(specialist_mode_override or install.get("specialist_mode") or "owner_edit").strip().lower() or "owner_edit"
    if _normalize_deployment_state(
        deployment_state_override if deployment_state_override is not None else deployed_agent.get("deployment_state")
    ) == "live":
        specialist_mode = "customer_live"
    install_status = "active" if specialist_mode == "customer_live" else (
        str(install.get("status") or "").strip().lower() or "draft"
    )
    metadata = {
        "source": "deployed_agent",
        "visibility": "private",
        "status": install_status,
        "specialist_mode": specialist_mode,
        "deployed_agent": {
            "id": deployed_agent.get("id"),
            "owner_workspace_id": workspace_id,
            "runtime_target": runtime_target,
            "runtime_placement": config.runtime_placement,
            "computer_automation": config.computer_automation.model_dump(exclude_none=True),
            "provider": selected_provider,
            "model": selected_model,
        },
        "provider": selected_provider,
        "model": selected_model,
        "deployed_agent_knowledge_sources": deployed_agent.get("knowledge_sources") or [],
        "public_intro": config.customer_policy.public_intro,
        "public_core_value": config.customer_policy.public_core_value,
        "platform_cta_label": config.customer_policy.public_start_cta_label,
        "platform_cta_url": config.customer_policy.public_start_cta_url,
        "public_source": "deployed_agent_owner",
        "health_safety_enabled": bool(config.safety_policy.health_safety_enabled),
        "health_safety_assistant_name": config.safety_policy.assistant_name,
        "context_budget_preset": config.memory_policy.context_budget_preset,
        "retention_preset": config.memory_policy.retention_preset,
        "selected_tool_ids": list(config.tool_policy.enabled_tools or []),
        "escalation_preset": config.escalation_policy.preset,
        "handoff_mode": config.escalation_policy.handoff_mode,
        "owner_notification_destination": config.escalation_policy.owner_notification_destination,
    }
    return await agent_specialist_repository.update_workspace_specialist_manifest(
        backing_install_id,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        manifest=manifest,
        updated_by_user_id=updated_by_user_id,
        runtime_profile_id=str(install.get("runtime_profile_id") or "").strip() or None,
        runtime_mode=_runtime_target_to_specialist_mode(runtime_target),
        tool_toggles=_tool_toggles_from_config(config),
        connector_bindings=dict(install.get("connector_bindings") or {}),
        channel_bindings=channels,
        metadata=metadata,
        write_bible_version=True,
    )


async def create_draft_deployed_agent(
    *,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    name: str,
    avatar: Optional[str] = None,
    persona: str = "",
    system_prompt: str = "",
    channels: Optional[Dict[str, Any]] = None,
    knowledge_sources: Optional[List[Dict[str, Any]]] = None,
    runtime_target: Optional[str] = None,
    billing_plan: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None,
    runtime_profile_id: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise ValueError("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    if not tenant_id:
        raise ValueError("Workspace is missing a tenant binding.")
    existing_deployed_agents = await control_plane_repository.list_deployed_agents_for_workspace(
        resolved_workspace_id,
        tenant_id=tenant_id,
    )
    entitlements_service.enforce_specialist_slot_access(
        workspace=workspace,
        current_specialist_count=len(list(existing_deployed_agents or [])),
    )
    normalized_name = _normalize_text(name)
    if not normalized_name:
        raise ValueError("name is required.")
    workspace_defaults = _workspace_admin_defaults(workspace)
    normalized_channels = await _enrich_deployed_agent_channels(
        owner_workspace_id=resolved_workspace_id,
        channels=channels,
    )
    draft_config = _apply_provider_model_selection_to_config(
        _apply_workspace_admin_defaults_to_config(
            _config_from_record(
                {
                    "name": normalized_name,
                    "avatar": avatar,
                    "persona": persona,
                    "system_prompt": system_prompt,
                    "channels": normalized_channels,
                    "knowledge_sources": _normalize_knowledge_sources(knowledge_sources),
                    "runtime_target": runtime_target,
                    "billing_plan": billing_plan,
                    "metadata": _normalize_deployed_agent_metadata(metadata),
                    "config": _coerce_dict(config),
                },
                runtime_profile_id=runtime_profile_id,
            ),
            workspace_defaults=workspace_defaults,
            runtime_target_supplied=runtime_target is not None,
            billing_plan_supplied=billing_plan is not None,
            config_payload=_coerce_dict(config),
            legacy_metadata=_coerce_dict(metadata),
        ),
        provider=provider,
        model=model,
        owner_workspace_id=resolved_workspace_id,
    )
    operational_state = _operational_state_from_record({"deployment_state": "draft"})
    manifest = _base_manifest(
        name=draft_config.name,
        persona=draft_config.persona,
        system_prompt=draft_config.system_prompt,
        runtime_target=draft_config.runtime_target,
        channels=_channels_payload_from_config(draft_config),
        escalation_triggers=_escalation_triggers_for_config(draft_config),
    )
    backing_install = await agent_specialist_repository.create_workspace_specialist(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        manifest=manifest,
        created_by_user_id=_normalize_optional_text((current_user or {}).get("user_id")),
        label=draft_config.name,
        runtime_profile_id=_normalize_optional_text(runtime_profile_id),
        runtime_mode=_runtime_target_to_specialist_mode(draft_config.runtime_target),
        tool_toggles=_tool_toggles_from_config(draft_config),
        channel_bindings=_channels_payload_from_config(draft_config),
        metadata={
            **_metadata_from_config(draft_config),
            "source": "deployed_agent",
            "visibility": "private",
            "specialist_mode": "owner_edit",
            "public_intro": draft_config.customer_policy.public_intro,
            "public_core_value": draft_config.customer_policy.public_core_value,
            "platform_cta_label": draft_config.customer_policy.public_start_cta_label,
            "platform_cta_url": draft_config.customer_policy.public_start_cta_url,
            "health_safety_assistant_name": draft_config.safety_policy.assistant_name,
            "context_budget_preset": draft_config.memory_policy.context_budget_preset,
            "retention_preset": draft_config.memory_policy.retention_preset,
            "escalation_preset": draft_config.escalation_policy.preset,
            "handoff_mode": draft_config.escalation_policy.handoff_mode,
            "owner_notification_destination": draft_config.escalation_policy.owner_notification_destination,
        },
    )
    if not isinstance(backing_install, dict):
        raise ValueError("Failed to create backing specialist install.")
    deployed_agent = await control_plane_repository.create_deployed_agent(
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
        backing_install_id=_normalize_text(backing_install.get("id")),
        created_by_user_id=_normalize_optional_text((current_user or {}).get("user_id")),
        name=draft_config.name,
        avatar=draft_config.avatar,
        persona=draft_config.persona,
        system_prompt=draft_config.system_prompt,
        deployment_state="draft",
        channels=_channels_payload_from_config(draft_config),
        knowledge_sources=draft_config.knowledge_sources,
        runtime_target=draft_config.runtime_target,
        billing_plan=draft_config.billing_plan,
        metadata=_metadata_from_config(draft_config),
        operational_state=_serialized_operational_state(operational_state),
    )
    if not isinstance(deployed_agent, dict):
        raise ValueError("Failed to persist deployed agent.")
    await mirror_deployed_agent_to_backing_specialist(
        deployed_agent=deployed_agent,
        backing_install=backing_install,
        updated_by_user_id=_normalize_optional_text((current_user or {}).get("user_id")),
    )
    return project_deployed_agent(deployed_agent, include_internal=True)


async def list_deployed_agents(
    *,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    deployment_state: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    items = await control_plane_repository.list_deployed_agents_for_workspace(
        resolved_workspace_id,
        tenant_id=tenant_id,
        deployment_state=_normalize_deployment_state(deployment_state, default="") if deployment_state else None,
    )
    return {
        "items": [
            project_deployed_agent(item, include_internal=True)
            for item in items
            if isinstance(item, dict)
        ]
    }


async def get_deployed_agent_detail(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    backing_install = await agent_specialist_repository.get_workspace_specialist(
        _normalize_text(deployed_agent.get("backing_install_id")),
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
    )
    return {
        **dict(project_deployed_agent(deployed_agent, include_internal=True) or {}),
        "backing_install": backing_install,
    }


async def get_deployed_agent_telegram_readiness(
    *,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    deployed_agent_id: Optional[str] = None,
) -> Dict[str, Any]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent: Optional[Dict[str, Any]] = None
    if _normalize_optional_text(deployed_agent_id):
        deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
            _normalize_text(deployed_agent_id),
            tenant_id=tenant_id,
            owner_workspace_id=resolved_workspace_id,
        )
        if not isinstance(deployed_agent, dict):
            raise _http_bad_request("Deployed agent is unavailable.")

    status_payload = _workspace_telegram_status_payload(resolved_workspace_id)
    connector_options = _workspace_telegram_connector_options(resolved_workspace_id)
    connectors_by_id = {
        _normalize_text(item.get("id")): item
        for item in connector_options
        if _normalize_text(item.get("id"))
    }
    config = _config_from_record(deployed_agent or {})
    channels = _normalize_channels((deployed_agent or {}).get("channels") or {})
    telegram_binding = _coerce_dict(channels.get("telegram"))
    telegram_enabled = bool(telegram_binding.get("enabled"))
    selected_connector_id = _normalize_optional_text(
        telegram_binding.get("connector_id")
        or telegram_binding.get("credential_id")
    )
    selected_connector = connectors_by_id.get(selected_connector_id or "") if selected_connector_id else None
    webhook = _coerce_dict(status_payload.get("webhook"))

    blockers: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    webhook_status = _normalize_text(webhook.get("status")).lower()
    if webhook_status and webhook_status != "live":
        blockers.append(
            _studio_issue(
                code=_normalize_text(webhook.get("issue_code"), default="telegram_webhook_not_ready"),
                message=_normalize_text(webhook.get("issue"), default="Telegram webhook delivery is not ready."),
                guidance=_normalize_optional_text(webhook.get("guidance")),
            )
        )

    for issue in _coerce_list(status_payload.get("issues")):
        payload = _coerce_dict(issue)
        severity = _normalize_text(payload.get("severity")).lower()
        target = blockers if severity == "setup_needed" else warnings
        target.append(
            _studio_issue(
                code=_normalize_text(payload.get("code"), default="telegram_status_issue"),
                message=_normalize_text(payload.get("message"), default="Telegram status issue"),
                severity="blocker" if severity == "setup_needed" else "warning",
            )
        )

    if telegram_enabled:
        if len(config.tool_policy.enabled_tools or []) == 0:
            blockers.append(
                _studio_issue(
                    code="studio_tool_scope_required",
                    message="Select at least one allowed tool before deploying this Telegram specialist.",
                    guidance="Open the Launch step and choose the smallest tool scope this specialist needs.",
                )
            )
        if not selected_connector_id:
            blockers.append(
                _studio_issue(
                    code="telegram_connector_required",
                    message="Select a Telegram bot connector before deploying this specialist.",
                    guidance="Open the Channels step and bind one of the workspace-visible Telegram connectors.",
                )
            )
        elif not isinstance(selected_connector, dict):
            blockers.append(
                _studio_issue(
                    code="telegram_connector_unavailable",
                    message="The selected Telegram connector is not available for this workspace.",
                    guidance="Choose a different connector or recreate the missing Telegram bot connector.",
                )
            )
        if selected_connector_id and not bool(telegram_binding.get("is_inbound_owner")):
            blockers.append(
                _studio_issue(
                    code="telegram_inbound_owner_missing",
                    message="Telegram inbound ownership is not bound to this specialist yet.",
                    guidance="Save the deployment again after choosing a Telegram connector so Studio can claim inbound ownership automatically.",
                )
            )
        if selected_connector_id and not _normalize_optional_text(telegram_binding.get("endpoint_key")):
            blockers.append(
                _studio_issue(
                    code="telegram_endpoint_key_missing",
                    message="Telegram routing is missing the inbound endpoint key for this specialist.",
                    guidance="Re-save the deployment after choosing a Telegram connector so Studio can derive the inbound endpoint key.",
                )
            )
    elif deployed_agent is not None:
        warnings.append(
            _studio_issue(
                code="telegram_disabled",
                message="Telegram is disabled for this specialist, so deploy will stay unavailable.",
                guidance="Enable Telegram in the Channels step when the specialist is ready for customer traffic.",
                severity="warning",
            )
        )

    if isinstance(selected_connector, dict):
        if _normalize_text(selected_connector.get("profile_status")).lower() == "setup_needed":
            blockers.append(
                _studio_issue(
                    code=_normalize_text(selected_connector.get("profile_issue_code"), default="telegram_connector_profile_setup_needed"),
                    message=_normalize_text(selected_connector.get("profile_issue"), default="The selected Telegram connector profile needs setup."),
                )
            )
        elif _normalize_optional_text(selected_connector.get("profile_issue")):
            warnings.append(
                _studio_issue(
                    code=_normalize_text(selected_connector.get("profile_issue_code"), default="telegram_connector_profile_warning"),
                    message=_normalize_text(selected_connector.get("profile_issue"), default="The selected Telegram connector profile is degraded."),
                    severity="warning",
                )
            )
        if _normalize_optional_text(selected_connector.get("last_error")):
            warnings.append(
                _studio_issue(
                    code=_normalize_text(selected_connector.get("last_error_category"), default="telegram_connector_last_error"),
                    message=_normalize_text(selected_connector.get("last_error"), default="The selected Telegram connector reported a recent runtime error."),
                    severity="warning",
                )
            )

    configured_binding = {
        "enabled": telegram_enabled,
        "connector_id": selected_connector_id,
        "credential_id": _normalize_optional_text(telegram_binding.get("credential_id")),
        "endpoint_key": _normalize_optional_text(telegram_binding.get("endpoint_key")),
        "is_inbound_owner": bool(telegram_binding.get("is_inbound_owner")),
        "bot_username": _normalize_optional_text(telegram_binding.get("bot_username"))
        or _normalize_optional_text((selected_connector or {}).get("bot_username")),
        "webhook_path": _normalize_optional_text(telegram_binding.get("webhook_path"))
        or _normalize_optional_text((selected_connector or {}).get("webhook_path")),
        "webhook_url": _normalize_optional_text((selected_connector or {}).get("webhook_url")),
        "label": _normalize_optional_text((selected_connector or {}).get("label")),
    }
    ready_for_live = telegram_enabled and len(blockers) == 0 and isinstance(selected_connector, dict)
    status = "ready" if ready_for_live else ("setup_needed" if blockers else "draft")
    return {
        "channel": "telegram",
        "workspace_id": resolved_workspace_id,
        "deployed_agent_id": _normalize_optional_text((deployed_agent or {}).get("id")),
        "ready_for_live": ready_for_live,
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "next_action": _studio_next_action(
            telegram_enabled=telegram_enabled,
            blockers=blockers,
            connector_options=connector_options,
        ),
        "configured_binding": configured_binding,
        "tool_scope": {
            "selected_tool_ids": list(config.tool_policy.enabled_tools or []),
            "catalog": [dict(item) for item in _STUDIO_TOOL_SCOPE_CATALOG],
        },
        "connectors": connector_options,
        "webhook": webhook,
        "autopilot": _coerce_dict(status_payload.get("autopilot")),
        "whatsapp": dict(_STUDIO_WHATSAPP_STATUS),
    }


async def _enrich_deployed_agent_channels(
    *,
    owner_workspace_id: str,
    channels: Any,
) -> Dict[str, Dict[str, Any]]:
    normalized = _normalize_channels(channels)
    telegram_binding = _coerce_dict(normalized.get("telegram"))
    if not bool(telegram_binding.get("enabled")):
        return normalized
    connector_id = _normalize_optional_text(
        telegram_binding.get("connector_id")
        or telegram_binding.get("credential_id")
    )
    if not connector_id:
        return normalized
    connector_options = _workspace_telegram_connector_options(owner_workspace_id)
    selected = next((item for item in connector_options if _normalize_text(item.get("id")) == connector_id), None)
    if not isinstance(selected, dict):
        raise ValueError("The selected Telegram connector is not available for this workspace.")
    webhook = _coerce_dict(_workspace_telegram_status_payload(owner_workspace_id).get("webhook"))
    normalized["telegram"] = {
        **telegram_binding,
        "enabled": True,
        "connector_id": connector_id,
        "credential_id": _normalize_optional_text(selected.get("credential_id")) or connector_id,
        "endpoint_key": _normalize_optional_text(selected.get("endpoint_key")),
        "is_inbound_owner": True,
        "webhook_path": _normalize_optional_text(selected.get("webhook_path")),
        "bot_username": _normalize_optional_text(selected.get("bot_username")),
        "delivery_mode": _normalize_optional_text(webhook.get("delivery_mode")),
    }
    return normalized


async def list_deployed_agent_analytics(
    *,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
) -> Dict[str, Any]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agents = await control_plane_repository.list_deployed_agents_for_workspace(
        resolved_workspace_id,
        tenant_id=tenant_id,
    )
    return await deployed_agent_analytics_service.summarize_workspace_deployed_agent_analytics(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        deployed_agents=deployed_agents,
    )


async def get_deployed_agent_analytics(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    return await deployed_agent_analytics_service.summarize_deployed_agent_analytics(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        deployed_agent=deployed_agent,
    )


async def update_deployed_agent(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    existing = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(existing, dict):
        return None
    normalized_updates: Dict[str, Any] = {}
    candidate_record: Dict[str, Any] = dict(existing)
    if "name" in updates:
        clean_name = _normalize_text(updates.get("name"))
        if not clean_name:
            raise _http_bad_request("name cannot be empty.")
        candidate_record["name"] = clean_name
    if "avatar" in updates:
        candidate_record["avatar"] = _normalize_optional_text(updates.get("avatar"))
    if "persona" in updates:
        candidate_record["persona"] = _normalize_text(updates.get("persona"))
    if "system_prompt" in updates:
        candidate_record["system_prompt"] = _normalize_text(updates.get("system_prompt"))
    if "channels" in updates:
        try:
            candidate_record["channels"] = await _enrich_deployed_agent_channels(
                owner_workspace_id=resolved_workspace_id,
                channels=updates.get("channels"),
            )
        except ValueError as error:
            raise _http_bad_request(str(error)) from error
    if "knowledge_sources" in updates:
        try:
            candidate_record["knowledge_sources"] = _normalize_knowledge_sources(updates.get("knowledge_sources"))
        except ValueError as error:
            raise _http_bad_request(str(error)) from error
    if "runtime_target" in updates:
        candidate_record["runtime_target"] = _normalize_runtime_target(updates.get("runtime_target"))
    if "billing_plan" in updates:
        candidate_record["billing_plan"] = _normalize_text(
            updates.get("billing_plan"),
            default=config_defaults_service.default_deployed_agent_billing_plan(),
        )
    if "is_public" in updates:
        candidate_record["is_public"] = bool(updates.get("is_public"))
    if "category" in updates:
        normalized_category = _normalize_optional_text(updates.get("category"))
        candidate_record["category"] = normalized_category.lower() if normalized_category else None
    operator_fields_requested = {
        key for key in ("quality_stars", "cost_tier")
        if key in updates
    }
    if operator_fields_requested and not auth_module.current_user_has_auth_admin_access(current_user):
        raise HTTPException(
            status_code=403,
            detail="Only platform operators may update marketplace ratings and cost tiers.",
        )
    if "quality_stars" in updates:
        raw_quality_stars = updates.get("quality_stars")
        if raw_quality_stars is None:
            candidate_record["quality_stars"] = None
        else:
            try:
                parsed_quality_stars = int(raw_quality_stars)
            except (TypeError, ValueError) as error:
                raise _http_bad_request("quality_stars must be an integer between 1 and 5.") from error
            if parsed_quality_stars < 1 or parsed_quality_stars > 5:
                raise _http_bad_request("quality_stars must be between 1 and 5.")
            candidate_record["quality_stars"] = parsed_quality_stars
    if "cost_tier" in updates:
        raw_cost_tier = _normalize_optional_text(updates.get("cost_tier"))
        if raw_cost_tier is None:
            candidate_record["cost_tier"] = None
        else:
            normalized_cost_tier = raw_cost_tier.lower()
            if normalized_cost_tier not in {"free", "standard", "premium"}:
                raise _http_bad_request("cost_tier must be one of free, standard, or premium.")
            candidate_record["cost_tier"] = normalized_cost_tier
    if "metadata" in updates:
        try:
            candidate_record["metadata"] = _normalize_deployed_agent_metadata(
                updates.get("metadata"),
                existing=_coerce_dict(existing.get("metadata")),
            )
        except ValueError as error:
            raise _http_bad_request(str(error)) from error
    if "config" in updates:
        if updates.get("config") is not None and not isinstance(updates.get("config"), dict):
            raise _http_bad_request("config must be an object.")
        candidate_record["config"] = _coerce_dict(updates.get("config"))
    if "deployment_state" in updates and updates.get("deployment_state") is not None:
        next_state = str(updates.get("deployment_state") or "").strip().lower()
        try:
            validated_state = validate_state_transition(existing.get("deployment_state"), next_state)
        except ValueError as error:
            raise _http_conflict(str(error)) from error
        if validated_state in {"live", "paused"}:
            raise _http_conflict("Use the dedicated deploy or pause endpoint for live and paused transitions.")
        candidate_record["deployment_state"] = validated_state
    if candidate_record == existing and "provider" not in updates and "model" not in updates:
        raise _http_bad_request("At least one deployed-agent field must be supplied.")
    try:
        next_config = _apply_provider_model_selection_to_config(
            _config_from_record(candidate_record),
            provider=updates.get("provider") if "provider" in updates else None,
            model=updates.get("model") if "model" in updates else None,
            owner_workspace_id=resolved_workspace_id,
        )
    except ValueError as error:
        raise _http_bad_request(str(error)) from error
    next_state = _operational_state_from_record(
        {
            **existing,
            "deployment_state": candidate_record.get(
                "deployment_state",
                existing.get("deployment_state"),
            ),
        }
    )
    normalized_updates = {
        "name": next_config.name,
        "avatar": next_config.avatar,
        "persona": next_config.persona,
        "system_prompt": next_config.system_prompt,
        "channels": _channels_payload_from_config(next_config),
        "knowledge_sources": next_config.knowledge_sources,
        "runtime_target": next_config.runtime_target,
        "billing_plan": next_config.billing_plan,
        "is_public": bool(candidate_record.get("is_public")),
        "quality_stars": candidate_record.get("quality_stars"),
        "cost_tier": candidate_record.get("cost_tier"),
        "category": _normalize_optional_text(candidate_record.get("category")),
        "metadata": _metadata_from_config(
            next_config,
            existing_metadata=_coerce_dict(existing.get("metadata")),
        ),
        "operational_state": _serialized_operational_state(next_state),
    }
    if "deployment_state" in candidate_record:
        normalized_updates["deployment_state"] = candidate_record["deployment_state"]
    next_record = {**existing, **normalized_updates}
    updated_install = await mirror_deployed_agent_to_backing_specialist(
        deployed_agent=next_record,
        updated_by_user_id=_normalize_optional_text((current_user or {}).get("user_id")),
    )
    persisted = await control_plane_repository.update_deployed_agent(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
        updates=normalized_updates,
    )
    if not isinstance(persisted, dict):
        return None
    return {
        **dict(project_deployed_agent(persisted, include_internal=True) or {}),
        "backing_install": updated_install,
    }


async def deploy_deployed_agent(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    existing = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(existing, dict):
        return None
    try:
        validate_state_transition(existing.get("deployment_state"), "live")
    except ValueError as error:
        raise _http_conflict(str(error)) from error
    channels = _normalize_channels(existing.get("channels") or {})
    allowed_live_channels = _allowed_live_channels_for_workspace(workspace)
    readiness = await get_deployed_agent_telegram_readiness(
        current_user=current_user,
        owner_workspace_id=resolved_workspace_id,
        deployed_agent_id=deployed_agent_id,
    )
    if readiness.get("ready_for_live") is not True:
        blockers = _coerce_list(readiness.get("blockers"))
        next_action = _normalize_optional_text(readiness.get("next_action"))
        first = _coerce_dict(blockers[0]) if blockers else {}
        detail = _normalize_optional_text(first.get("message")) or "Telegram launch readiness is incomplete."
        if next_action:
            detail = f"{detail} {next_action}"
        raise _http_conflict(detail)
    try:
        _require_live_channel_configuration(
            channels,
            allowed_live_channels=allowed_live_channels,
        )
    except ValueError as error:
        raise _http_conflict(str(error)) from error
    next_record = {
        **existing,
        "deployment_state": "live",
    }
    updated_install = await mirror_deployed_agent_to_backing_specialist(
        deployed_agent=next_record,
        updated_by_user_id=_normalize_optional_text((current_user or {}).get("user_id")),
        specialist_mode_override="customer_live",
        deployment_state_override="live",
    )
    try:
        validate_can_deploy(
            deployed_agent=next_record,
            backing_install=updated_install,
            allowed_live_channels=allowed_live_channels,
        )
    except ValueError as error:
        raise _http_conflict(str(error)) from error
    next_state = _operational_state_from_record(
        {
            **existing,
            "deployment_state": "live",
            "last_deployed_at": _utc_now_iso(),
        }
    )
    persisted = await control_plane_repository.set_deployed_agent_state(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
        deployment_state="live",
        last_deployed_at=next_state.last_deployed_at,
        operational_state=_serialized_operational_state(next_state),
    )
    if not isinstance(persisted, dict):
        return None
    return {
        **dict(project_deployed_agent(persisted, include_internal=True) or {}),
        "backing_install": updated_install,
    }


async def pause_deployed_agent(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise ValueError("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    try:
        validate_state_transition(deployed_agent.get("deployment_state"), "paused")
    except ValueError as error:
        raise _http_conflict(str(error)) from error
    next_state = _operational_state_from_record(
        {
            **deployed_agent,
            "deployment_state": "paused",
            "last_paused_at": _utc_now_iso(),
        }
    )
    paused = await control_plane_repository.set_deployed_agent_state(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
        deployment_state="paused",
        last_paused_at=next_state.last_paused_at,
        operational_state=_serialized_operational_state(next_state),
    )
    backing_install = await agent_specialist_repository.get_workspace_specialist(
        _normalize_text(deployed_agent.get("backing_install_id")),
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
    )
    return {
        **dict(project_deployed_agent(paused, include_internal=True) or {}),
        "backing_install": backing_install,
    }


async def list_deployed_agent_conversations(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    limit: int = 50,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    safe_limit, safe_offset = _normalize_pagination(limit, offset)
    session_rows = await control_plane_repository.list_deployed_agent_conversation_sessions(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        deployed_agent_id=_normalize_text(deployed_agent.get("id")),
        backing_install_id=_normalize_text(deployed_agent.get("backing_install_id")),
        limit=safe_limit + 1,
        offset=safe_offset,
    )
    has_more = len(session_rows) > safe_limit
    trimmed_rows = session_rows[:safe_limit]
    items: List[Dict[str, Any]] = []
    for row in trimmed_rows:
        latest_run_id = _normalize_optional_text(row.get("latest_run_id"))
        activity_rows: List[Dict[str, Any]] = []
        if _normalize_optional_text(row.get("session_id")):
            activity_rows = await _load_conversation_activity(
                tenant_id=tenant_id,
                workspace_id=resolved_workspace_id,
                backing_install_id=_normalize_text(deployed_agent.get("backing_install_id")),
                session_id=_normalize_text(row.get("session_id")),
                thread_id=_normalize_optional_text(row.get("thread_id")),
                run_ids=[latest_run_id] if latest_run_id else [],
            )
        items.append(
            {
                "session_id": row.get("session_id"),
                "channel": row.get("channel"),
                "last_message": _compact_text(row.get("last_message"), limit=160),
                "last_message_at": row.get("last_message_at"),
                "customer": _actor_summary(row.get("customer_actor")),
                "customer_actor": _coerce_dict(row.get("customer_actor")),
                "thread_id": row.get("thread_id"),
                "latest_run_id": latest_run_id,
                "escalation_state": _derive_escalation_state(activity_rows),
                "outcome": _derive_outcome(activity_rows=activity_rows, run_snapshots={}),
            }
        )
    return {
        "deployed_agent_id": _normalize_text(deployed_agent.get("id")),
        "items": items,
        "offset": safe_offset,
        "limit": safe_limit,
        "has_more": has_more,
    }


async def list_deployed_agent_memory_entries(
    *,
    deployed_agent_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    limit: int = 50,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    safe_limit, safe_offset = _normalize_pagination(limit, offset)
    memory_rows = await control_plane_repository.list_deployed_agent_conversation_memory(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        deployed_agent_id=_normalize_text(deployed_agent.get("id")),
        limit=safe_limit + 1,
        offset=safe_offset,
    )
    has_more = len(memory_rows) > safe_limit
    trimmed_rows = memory_rows[:safe_limit]
    items = [
        {
            "id": row.get("id"),
            "channel": row.get("channel_key"),
            "external_user_id": row.get("external_user_id"),
            "session_id": row.get("session_key"),
            "summary_text": _compact_text(row.get("summary_text"), limit=280) or "",
            "recent_message_count": row.get("recent_message_count"),
            "source_message_count": row.get("source_message_count"),
            "updated_at": row.get("updated_at"),
        }
        for row in trimmed_rows
        if isinstance(row, dict)
    ]
    return {
        "deployed_agent_id": _normalize_text(deployed_agent.get("id")),
        "items": items,
        "offset": safe_offset,
        "limit": safe_limit,
        "has_more": has_more,
    }


async def get_deployed_agent_conversation_detail(
    *,
    deployed_agent_id: str,
    session_id: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    channel_events = await control_plane_repository.list_deployed_agent_conversation_events(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        deployed_agent_id=_normalize_text(deployed_agent.get("id")),
        backing_install_id=_normalize_text(deployed_agent.get("backing_install_id")),
        session_id=session_id,
        limit=500,
    )
    if not channel_events:
        return None
    ordered_events = sorted(
        channel_events,
        key=lambda item: (_timestamp_token(item.get("created_at")), str(item.get("id") or "")),
    )
    run_ids: List[str] = []
    for event in ordered_events:
        run_id = _normalize_optional_text(event.get("run_id"))
        if run_id and run_id not in run_ids:
            run_ids.append(run_id)
    thread_id = next(
        (
            _normalize_optional_text(event.get("thread_id"))
            for event in reversed(ordered_events)
            if _normalize_optional_text(event.get("thread_id"))
        ),
        None,
    )
    activity_rows = await _load_conversation_activity(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        backing_install_id=_normalize_text(deployed_agent.get("backing_install_id")),
        session_id=_normalize_text(session_id),
        thread_id=thread_id,
        run_ids=run_ids,
    )
    run_snapshots: Dict[str, Dict[str, Any]] = {}
    for run_id in run_ids:
        snapshot = await _get_run_snapshot(run_id)
        if isinstance(snapshot, dict) and isinstance(snapshot.get("payload"), dict):
            run_snapshots[run_id] = dict(snapshot.get("payload") or {})
    message_entries = [_message_entry_from_channel_event(item) for item in ordered_events]
    run_step_entries: List[Dict[str, Any]] = []
    seen_run_step_ids: set[str] = set()
    run_steps_per_run: Dict[str, int] = {}
    for row in activity_rows:
        entry = _run_step_entry_from_activity(row)
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        if entry_id and entry_id in seen_run_step_ids:
            continue
        if entry_id:
            seen_run_step_ids.add(entry_id)
        run_id = _normalize_optional_text(entry.get("run_id")) or ""
        if run_id:
            run_steps_per_run[run_id] = int(run_steps_per_run.get(run_id, 0)) + 1
        run_step_entries.append(entry)
    for run_id, snapshot in run_snapshots.items():
        snapshot_entries = _run_step_entries_from_run(run_id, snapshot)
        if run_steps_per_run.get(run_id):
            snapshot_entries = [
                entry
                for entry in snapshot_entries
                if _normalize_text(entry.get("event_class")).lower() != "run_status"
            ]
        for entry in snapshot_entries:
            entry_id = str(entry.get("id") or "").strip()
            if entry_id and entry_id in seen_run_step_ids:
                continue
            if entry_id:
                seen_run_step_ids.add(entry_id)
            run_step_entries.append(entry)
    tool_call_entries: List[Dict[str, Any]] = []
    seen_tool_ids: set[str] = set()
    for row in activity_rows:
        entry = _tool_call_entry_from_activity(row)
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        if entry_id and entry_id not in seen_tool_ids:
            seen_tool_ids.add(entry_id)
            tool_call_entries.append(entry)
    for run_id, snapshot in run_snapshots.items():
        entry = _tool_call_entry_from_run(run_id, snapshot)
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "").strip()
        if entry_id and entry_id not in seen_tool_ids:
            seen_tool_ids.add(entry_id)
            tool_call_entries.append(entry)
    approval_entries: List[Dict[str, Any]] = []
    escalation_entries: List[Dict[str, Any]] = []
    approval_cache: Dict[str, Dict[str, Any]] = {}
    for row in activity_rows:
        if _is_approval_activity(row):
            approval_payload = _coerce_dict(row.get("payload"))
            approval_metadata = _coerce_dict(row.get("metadata"))
            approval_id = _approval_id_from_payload(approval_payload) or _approval_id_from_payload(approval_metadata)
            approval_record = None
            if approval_id:
                approval_record = approval_cache.get(approval_id)
                if approval_record is None:
                    fetched = await run_state_repository.get_approval_record(approval_id)
                    approval_record = dict(fetched or {}) if isinstance(fetched, dict) else {}
                    approval_cache[approval_id] = approval_record
            approval_entries.append(
                _approval_entry_from_activity(
                    row,
                    approval_record=approval_record,
                )
            )
        if _is_escalation_activity(row):
            escalation_entries.append(_escalation_entry_from_activity(row))
    transcript_entries = sorted(
        [
            *message_entries,
            *run_step_entries,
            *tool_call_entries,
            *approval_entries,
            *escalation_entries,
        ],
        key=_entry_sort_key,
    )
    return {
        "deployed_agent_id": _normalize_text(deployed_agent.get("id")),
        "session_id": _normalize_text(session_id),
        "channel": _normalize_optional_text(ordered_events[-1].get("channel_key")) or _normalize_optional_text(ordered_events[0].get("channel_key")),
        "thread_id": thread_id,
        "run_ids": run_ids,
        "messages": message_entries,
        "run_steps": sorted(run_step_entries, key=_entry_sort_key),
        "tool_calls": sorted(tool_call_entries, key=_entry_sort_key),
        "approval_events": sorted(approval_entries, key=_entry_sort_key),
        "escalation_events": sorted(escalation_entries, key=_entry_sort_key),
        "entries": transcript_entries,
        "outcome": _derive_outcome(activity_rows=activity_rows, run_snapshots=run_snapshots),
        "customer": _actor_summary(
            next(
                (
                    event.get("actor")
                    for event in ordered_events
                    if _normalize_text(event.get("direction")).lower() == "inbound"
                ),
                {},
            )
        ),
    }


async def delete_deployed_agent_external_user_data(
    *,
    deployed_agent_id: str,
    external_user_id: str,
    channel_key: str,
    current_user: Optional[Dict[str, Any]],
    owner_workspace_id: str,
    note: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    resolved_workspace_id = require_deployed_agent_admin_access(
        current_user=current_user,
        workspace_id=owner_workspace_id,
    )
    workspace = await control_plane_repository.get_workspace_by_id(resolved_workspace_id)
    if not isinstance(workspace, dict):
        raise _http_bad_request("Workspace is unavailable.")
    tenant_id = _normalize_text(workspace.get("tenant_id"))
    deployed_agent = await control_plane_repository.get_deployed_agent_by_id(
        deployed_agent_id,
        tenant_id=tenant_id,
        owner_workspace_id=resolved_workspace_id,
    )
    if not isinstance(deployed_agent, dict):
        return None
    resolved_channel_key = _normalize_text(channel_key).lower()
    if not resolved_channel_key:
        raise _http_bad_request("channel is required.")
    resolved_external_user_id = _normalize_text(external_user_id)
    if not resolved_external_user_id:
        raise _http_bad_request("external_user_id is required.")
    purge_result = await external_user_privacy_service.get_external_user_privacy_service().purge_deployed_agent_external_user_data(
        tenant_id=tenant_id,
        workspace_id=resolved_workspace_id,
        deployed_agent_id=_normalize_text(deployed_agent.get("id")),
        channel_key=resolved_channel_key,
        external_user_id=resolved_external_user_id,
        actor_user_id=_normalize_text(_coerce_dict(current_user).get("user_id")) or None,
        note=_normalize_text(note) or None,
        metadata={
            "session_id": _normalize_text(session_id) or None,
            "deployed_agent_name": _normalize_text(deployed_agent.get("name")) or None,
        },
    )
    terminated_session_ids = {
        token
        for token in (
            _normalize_text(session_id),
            _normalize_text(_coerce_dict(purge_result.get("request")).get("session_key")),
        )
        if token
    }
    for token in terminated_session_ids:
        await session_service.terminate_session(token)
    return {
        "deployed_agent_id": _normalize_text(deployed_agent.get("id")),
        "channel": resolved_channel_key,
        "external_user_id": resolved_external_user_id,
        "deleted_counts": _coerce_dict(purge_result.get("deleted_counts")),
        "request": _coerce_dict(purge_result.get("request")),
        "audit": _coerce_dict(purge_result.get("audit")),
    }
