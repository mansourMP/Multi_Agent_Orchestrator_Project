"""
Connector metadata helpers (public fields, identity signature, dedupe).

Extracted from server.py to reduce hotspot size.
All function signatures and behaviour are unchanged.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

_server = None  # populated by _init()


def _init():
    """Late-bind references to server.py globals. Called on first use."""
    global _server
    if _server is not None:
        return
    import server as _s
    _server = _s


def _sanitize_connector_metadata(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    metadata = dict(raw) if isinstance(raw, dict) else {}
    if "agent_role" in metadata:
        normalized_role = _server.normalize_agent_role(metadata.get("agent_role"))
        if normalized_role:
            metadata["agent_role"] = normalized_role
        else:
            metadata.pop("agent_role", None)
    if "paused" in metadata:
        paused_value = metadata.get("paused")
        if paused_value in {None, "", 0, "0", False, "false", "False", "no", "off"}:
            metadata["paused"] = False
        else:
            metadata["paused"] = True
    return metadata


def _connector_public_metadata(connector: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
    connector_id = str(connector or "").strip().lower()
    public: Dict[str, Any] = {}
    if connector_id == "telegram_bot":
        chat_id = str(credentials.get("chat_id") or "").strip()
        if chat_id:
            public["chat_id"] = chat_id
    elif connector_id == "whatsapp_twilio":
        from_number = str(credentials.get("from_number") or "").strip()
        to_number = str(credentials.get("to_number") or "").strip()
        if from_number:
            public["from_number"] = from_number
        if to_number:
            public["to_number"] = to_number
    elif connector_id == "google_workspace":
        auth_mode = str(credentials.get("auth_mode") or credentials.get("authMode") or "").strip()
        calendar_id = str(credentials.get("calendar_id") or "").strip()
        timezone_value = str(credentials.get("timezone") or "").strip()
        if auth_mode:
            public["auth_mode"] = auth_mode
        if calendar_id:
            public["calendar_id"] = calendar_id
        if timezone_value:
            public["timezone"] = timezone_value
    elif connector_id == "microsoft_365":
        for key in ("displayName", "mail", "userPrincipalName", "drive_id", "drive_type"):
            value = str(credentials.get(key) or "").strip()
            if value:
                public[key] = value
    elif connector_id == "discord_bot":
        channel_id = str(credentials.get("channel_id") or "").strip()
        guild_id = str(credentials.get("guild_id") or "").strip()
        if channel_id:
            public["channel_id"] = channel_id
        if guild_id:
            public["guild_id"] = guild_id
    elif connector_id == "instagram_business":
        instagram_account_id = str(
            credentials.get("instagram_account_id")
            or credentials.get("business_account_id")
            or credentials.get("account_id")
            or ""
        ).strip()
        page_id = str(credentials.get("page_id") or "").strip()
        if instagram_account_id:
            public["instagram_account_id"] = instagram_account_id
        if page_id:
            public["page_id"] = page_id
    return public


def _provider_public_metadata(provider: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
    provider_id = _server.normalize_provider_id(provider)
    public: Dict[str, Any] = {}
    auth_mode = str(credentials.get("auth_mode") or credentials.get("authMode") or "").strip().lower()
    if auth_mode:
        public["auth_mode"] = auth_mode
    if provider_id == "vertex":
        project_id = str(credentials.get("project_id") or "").strip()
        location = str(credentials.get("location") or "").strip()
        if project_id:
            public["project_id"] = project_id
        if location:
            public["location"] = location
    return public


def _connector_identity_signature(connector: str, credentials: Dict[str, Any]) -> Optional[str]:
    connector_id = str(connector or "").strip().lower()
    if connector_id == "telegram_bot":
        bot_token = str(credentials.get("bot_token") or "").strip()
        chat_id = str(credentials.get("chat_id") or "").strip()
        if bot_token and chat_id:
            return f"telegram_bot:{bot_token}:{chat_id}"
    if connector_id == "whatsapp_twilio":
        account_sid = str(credentials.get("account_sid") or "").strip()
        from_number = str(credentials.get("from_number") or "").strip()
        to_number = str(credentials.get("to_number") or "").strip()
        if account_sid and from_number and to_number:
            return f"whatsapp_twilio:{account_sid}:{from_number}:{to_number}"
    if connector_id == "discord_bot":
        bot_token = str(credentials.get("bot_token") or "").strip()
        channel_id = str(credentials.get("channel_id") or "").strip()
        guild_id = str(credentials.get("guild_id") or "").strip()
        if bot_token and channel_id:
            return f"discord_bot:{bot_token}:{guild_id}:{channel_id}"
    if connector_id == "google_workspace":
        auth_mode = str(credentials.get("auth_mode") or credentials.get("authMode") or "").strip().lower()
        calendar_id = str(credentials.get("calendar_id") or "").strip()
        timezone_value = str(credentials.get("timezone") or "").strip()
        config_dir = str(credentials.get("gws_config_dir") or "").strip()
        access_token = str(credentials.get("access_token") or "").strip()
        if auth_mode in {"gws_local", "local_gws", "google_workspace_cli", "gws"} or config_dir:
            return f"google_workspace:gws_local:{config_dir or '.gws-config'}:{calendar_id}:{timezone_value}"
        if access_token:
            return f"google_workspace:token:{access_token}:{calendar_id}:{timezone_value}"
    if connector_id == "microsoft_365":
        account_id = str(credentials.get("account_id") or "").strip()
        user_principal_name = str(credentials.get("userPrincipalName") or credentials.get("user_principal_name") or "").strip().lower()
        drive_id = str(credentials.get("drive_id") or "").strip()
        access_token = str(credentials.get("access_token") or "").strip()
        if account_id or user_principal_name:
            return f"microsoft_365:{account_id}:{user_principal_name}:{drive_id}"
        if access_token:
            return f"microsoft_365:token:{access_token}"
    if connector_id == "instagram_business":
        instagram_account_id = str(
            credentials.get("instagram_account_id")
            or credentials.get("business_account_id")
            or credentials.get("account_id")
            or ""
        ).strip()
        page_id = str(credentials.get("page_id") or "").strip()
        if instagram_account_id:
            return f"instagram_business:{instagram_account_id}:{page_id}"
    return None


def _find_duplicate_connector_entry(
    connector: str,
    credentials: Dict[str, Any],
    workspace_id: Optional[str],
    *,
    exclude_id: str = "",
) -> Optional[Dict[str, Any]]:
    signature = _connector_identity_signature(connector, credentials)
    if not signature:
        return None
    requested_workspace = _server._normalize_workspace_id(workspace_id)
    vault = _server.load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        return None
    for item in existing:
        if not isinstance(item, dict):
            continue
        if str(item.get("mode") or "").strip().lower() != "connector":
            continue
        if str(item.get("provider") or "").strip().lower() != str(connector or "").strip().lower():
            continue
        item_id = str(item.get("id") or "").strip()
        if exclude_id and item_id == exclude_id:
            continue
        if not _server._workspace_visible(item.get("workspace_id"), requested_workspace):
            continue
        try:
            secret = _server.resolve_vault_credential(item_id, _server._normalize_workspace_id(item.get("workspace_id")))
        except Exception:
            continue
        existing_signature = _connector_identity_signature(connector, secret if isinstance(secret, dict) else {})
        if existing_signature and existing_signature == signature:
            return item
    return None

