from __future__ import annotations

from typing import Any, Dict, List

from server_modules.runtime_config import CONNECTOR_CATALOG


def _manifest(
    connector_id: str,
    *,
    triggers: List[Dict[str, Any]],
    actions: List[Dict[str, Any]],
    resources: List[Dict[str, Any]],
    supported_targets: List[str],
    notes: List[str] | None = None,
    future_capabilities: List[str] | None = None,
) -> Dict[str, Any]:
    catalog_entry = CONNECTOR_CATALOG.get(connector_id, {})
    return {
        "id": connector_id,
        "label": str(catalog_entry.get("label") or connector_id).strip() or connector_id,
        "auth": {
            "required_fields": list(catalog_entry.get("auth") or []),
        },
        "triggers": triggers,
        "actions": actions,
        "resources": resources,
        "runtime_constraints": {
            "supported_targets": supported_targets,
        },
        "notes": notes or [],
        "future_capabilities": future_capabilities or [],
    }


CONNECTOR_MANIFESTS: List[Dict[str, Any]] = [
    _manifest(
        "google_workspace",
        triggers=[
            {"id": "gmail_new_thread", "label": "New Gmail thread", "description": "Starts when a new Gmail thread arrives."},
            {"id": "calendar_event_created", "label": "Calendar event created", "description": "Starts when a new event is created."},
            {"id": "drive_file_changed", "label": "Drive file changed", "description": "Starts when a tracked Drive file changes."},
        ],
        actions=[
            {"id": "draft_email", "label": "Draft email"},
            {"id": "send_email", "label": "Send email"},
            {"id": "create_calendar_event", "label": "Create calendar event"},
            {"id": "create_doc", "label": "Create Google Doc"},
            {"id": "create_sheet", "label": "Create Google Sheet"},
        ],
        resources=[
            {"id": "gmail_threads", "label": "Gmail threads", "access": ["read", "write"]},
            {"id": "calendar_events", "label": "Calendar events", "access": ["read", "write"]},
            {"id": "drive_files", "label": "Drive files", "access": ["read", "write"]},
        ],
        supported_targets=["auto", "cloud", "local_companion"],
        notes=["Local Google Workspace CLI auth remains supported through connector bindings."],
    ),
    _manifest(
        "telegram_bot",
        triggers=[
            {"id": "inbound_message", "label": "Inbound message", "description": "Starts when a new inbound message arrives."},
            {"id": "command", "label": "Command", "description": "Starts when a bot command is received."},
            {"id": "callback_button", "label": "Callback button", "description": "Starts when a Telegram callback button is pressed."},
        ],
        actions=[
            {"id": "send_message", "label": "Send message"},
            {"id": "send_media", "label": "Send media"},
            {"id": "update_message", "label": "Update message"},
        ],
        resources=[
            {"id": "chats", "label": "Telegram chats", "access": ["read", "write"]},
        ],
        supported_targets=["auto", "cloud", "local_companion"],
    ),
    _manifest(
        "microsoft_365",
        triggers=[
            {"id": "mail_received", "label": "Mail received", "description": "Starts when a new mail thread arrives."},
            {"id": "calendar_event_created", "label": "Calendar event created", "description": "Starts when a new Outlook calendar event is created."},
            {"id": "drive_file_changed", "label": "OneDrive file changed", "description": "Starts when a tracked OneDrive file changes."},
        ],
        actions=[
            {"id": "draft_email", "label": "Draft email"},
            {"id": "send_email", "label": "Send email"},
            {"id": "create_calendar_event", "label": "Create calendar event"},
            {"id": "upload_drive_file", "label": "Upload OneDrive file"},
        ],
        resources=[
            {"id": "mail", "label": "Outlook mail", "access": ["read", "write"]},
            {"id": "calendar", "label": "Outlook calendar", "access": ["read", "write"]},
            {"id": "onedrive", "label": "OneDrive files", "access": ["read", "write"]},
        ],
        supported_targets=["auto", "cloud", "local_companion"],
    ),
    _manifest(
        "discord_bot",
        triggers=[
            {"id": "channel_message", "label": "Channel message", "description": "Starts when a new Discord channel message arrives."},
            {"id": "mention", "label": "Mention", "description": "Starts when the bot is mentioned."},
        ],
        actions=[
            {"id": "send_message", "label": "Send message"},
            {"id": "send_embed", "label": "Send embed"},
        ],
        resources=[
            {"id": "guild_channels", "label": "Guild channels", "access": ["read", "write"]},
        ],
        supported_targets=["auto", "cloud", "local_companion"],
    ),
    _manifest(
        "whatsapp_twilio",
        triggers=[
            {"id": "inbound_message", "label": "Inbound message", "description": "Starts when a WhatsApp message arrives through Twilio."},
        ],
        actions=[
            {"id": "send_message", "label": "Send message"},
        ],
        resources=[
            {"id": "whatsapp_conversations", "label": "WhatsApp conversations", "access": ["read", "write"]},
        ],
        supported_targets=["auto", "cloud", "local_companion"],
    ),
    _manifest(
        "wechat_work",
        triggers=[
            {"id": "webhook_event", "label": "Webhook event", "description": "Starts when a WeChat Work webhook event is received."},
        ],
        actions=[
            {"id": "send_message", "label": "Send message"},
        ],
        resources=[
            {"id": "webhook_channel", "label": "Webhook channel", "access": ["write"]},
        ],
        supported_targets=["auto", "cloud", "local_companion"],
    ),
    _manifest(
        "instagram_business",
        triggers=[
            {"id": "comment_created", "label": "Comment created", "description": "Starts when a tracked Instagram comment is created."},
            {"id": "dm_received", "label": "DM received", "description": "Starts when an Instagram DM is received."},
        ],
        actions=[
            {"id": "publish_reply", "label": "Publish reply"},
            {"id": "send_dm", "label": "Send DM"},
        ],
        resources=[
            {"id": "comments", "label": "Comments", "access": ["read", "write"]},
            {"id": "direct_messages", "label": "Direct messages", "access": ["read", "write"]},
        ],
        supported_targets=["auto", "cloud"],
        future_capabilities=["Publishing media workflows from the builder inspector."],
    ),
    {
        "id": "custom_api",
        "label": "Custom API / Webhook",
        "auth": {"required_fields": []},
        "triggers": [
            {"id": "webhook", "label": "Webhook", "description": "Starts when an inbound HTTP webhook is received."},
        ],
        "actions": [
            {"id": "http_request", "label": "HTTP request"},
            {"id": "signed_webhook", "label": "Signed webhook"},
        ],
        "resources": [
            {"id": "http_endpoints", "label": "HTTP endpoints", "access": ["read", "write"]},
        ],
        "runtime_constraints": {
            "supported_targets": ["auto", "cloud", "local_companion"],
        },
        "notes": ["Use this when no first-party connector exists yet."],
        "future_capabilities": [],
    },
]


def list_connector_manifests() -> Dict[str, Any]:
    return {"items": CONNECTOR_MANIFESTS}
