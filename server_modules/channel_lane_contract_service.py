from __future__ import annotations

from typing import Any, Dict


PERSONAL_GATEWAY_RUNTIME_LANE = "personal_gateway"
STUDIO_CONNECTOR_RUNTIME_LANE = "studio_business_connector"
DIRECT_CHAT_MEMORY_SURFACE = "direct_chat"

PERSONAL_ROUTE_PREFIX = "/personal-channels/"

PERSONAL_CHANNEL_SPECS: Dict[str, Dict[str, str]] = {
    "whatsapp_personal": {
        "provider": "whatsapp_baileys",
        "runtime_lane": PERSONAL_GATEWAY_RUNTIME_LANE,
        "memory_surface": DIRECT_CHAT_MEMORY_SURFACE,
    },
    "telegram_personal": {
        "provider": "telegram_gramjs",
        "runtime_lane": PERSONAL_GATEWAY_RUNTIME_LANE,
        "memory_surface": DIRECT_CHAT_MEMORY_SURFACE,
    },
}

PUBLIC_STUDIO_WEBHOOK_ROUTES: Dict[str, Dict[str, str]] = {
    "/channels/whatsapp/twilio/webhook": {
        "provider": "twilio_whatsapp",
        "runtime_lane": STUDIO_CONNECTOR_RUNTIME_LANE,
    },
    "/channels/telegram/webhook": {
        "provider": "telegram_bot_api",
        "runtime_lane": STUDIO_CONNECTOR_RUNTIME_LANE,
    },
    "/channels/slack/events": {
        "provider": "slack_events",
        "runtime_lane": STUDIO_CONNECTOR_RUNTIME_LANE,
    },
    "/channels/github/webhook": {
        "provider": "github_webhook",
        "runtime_lane": STUDIO_CONNECTOR_RUNTIME_LANE,
    },
    "/connectors/discord/webhook": {
        "provider": "discord_webhook",
        "runtime_lane": STUDIO_CONNECTOR_RUNTIME_LANE,
    },
}

_PERSONAL_FORBIDDEN_SESSION_KEYS = frozenset(
    {
        "responder_install_id",
        "master_install_id",
        "deployed_agent_id",
        "deployed_agent",
        "deployment_id",
        "connector_id",
        "session_key",
        "channel_key",
        "external_user_id",
    }
)


def _normalize_route_path(path: str) -> str:
    normalized_path = str(path or "").strip()
    if normalized_path == "/api":
        return "/"
    if normalized_path.startswith("/api/"):
        return normalized_path[4:]
    return normalized_path


def is_personal_channel_key(channel_key: str) -> bool:
    return str(channel_key or "").strip() in PERSONAL_CHANNEL_SPECS


def is_personal_route_path(path: str) -> bool:
    return _normalize_route_path(path).startswith(PERSONAL_ROUTE_PREFIX)


def is_public_studio_webhook_path(path: str) -> bool:
    candidate = _normalize_route_path(path)
    return candidate in PUBLIC_STUDIO_WEBHOOK_ROUTES


def assert_personal_gateway_channel(channel_key: str, provider: str | None = None) -> Dict[str, str]:
    normalized_channel_key = str(channel_key or "").strip()
    spec = PERSONAL_CHANNEL_SPECS.get(normalized_channel_key)
    if not spec:
        raise ValueError(f"Channel lane contract rejected non-personal channel: {normalized_channel_key or 'unknown'}.")
    normalized_provider = str(provider or "").strip()
    expected_provider = spec["provider"]
    if normalized_provider and normalized_provider != expected_provider:
        raise ValueError(
            "Channel lane contract rejected mismatched personal provider "
            f"{normalized_provider!r} for {normalized_channel_key!r}."
        )
    payload = dict(spec)
    payload["channel_key"] = normalized_channel_key
    payload["provider"] = expected_provider
    return payload


def assert_personal_route_path(path: str) -> str:
    normalized_path = _normalize_route_path(path)
    if not is_personal_route_path(normalized_path):
        raise ValueError(f"Channel lane contract rejected non-personal route path: {normalized_path or 'unknown'}.")
    return normalized_path


def assert_public_studio_webhook_path(path: str) -> Dict[str, str]:
    normalized_path = _normalize_route_path(path)
    spec = PUBLIC_STUDIO_WEBHOOK_ROUTES.get(normalized_path)
    if not spec:
        raise ValueError(
            f"Channel lane contract rejected webhook route outside the Studio connector lane: {normalized_path or 'unknown'}."
        )
    payload = dict(spec)
    payload["path"] = normalized_path
    return payload


def build_personal_gateway_runtime_context(
    *,
    surface_channel: str,
    workspace_id: str,
    gateway_id: str,
    remote_jid: str,
) -> Dict[str, Any]:
    spec = assert_personal_gateway_channel(surface_channel)
    thread_id = f"{surface_channel}:{str(gateway_id or '').strip()}:{str(remote_jid or '').strip()}"
    session_ctx = {
        "workspace_id": str(workspace_id or "default").strip() or "default",
        "thread_id": thread_id,
        "surface_channel": surface_channel,
        "source": surface_channel,
        "runtime_lane": spec["runtime_lane"],
        "memory_surface": spec["memory_surface"],
    }
    assert_personal_runtime_session_ctx(session_ctx)
    return {
        "thread_id": thread_id,
        "availability": {
            "surface_channel": surface_channel,
            "source": surface_channel,
            "runtime_lane": spec["runtime_lane"],
            "memory_surface": spec["memory_surface"],
        },
        "session_ctx": session_ctx,
    }


def assert_personal_runtime_session_ctx(session_ctx: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(session_ctx or {})
    for forbidden_key in _PERSONAL_FORBIDDEN_SESSION_KEYS:
        if payload.get(forbidden_key):
            raise ValueError(
                "Channel lane contract rejected Studio deployment state in the personal runtime lane "
                f"via {forbidden_key!r}."
            )
    surface_channel = str(payload.get("surface_channel") or "").strip()
    if not is_personal_channel_key(surface_channel):
        raise ValueError(
            f"Channel lane contract rejected non-personal surface channel in personal session context: {surface_channel or 'unknown'}."
        )
    if str(payload.get("runtime_lane") or "").strip() != PERSONAL_GATEWAY_RUNTIME_LANE:
        raise ValueError("Channel lane contract rejected personal session context without the personal gateway runtime lane.")
    if str(payload.get("memory_surface") or "").strip() != DIRECT_CHAT_MEMORY_SURFACE:
        raise ValueError("Channel lane contract rejected personal session context without direct-chat memory isolation.")
    return payload
