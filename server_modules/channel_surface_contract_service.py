from __future__ import annotations

from typing import Any, Dict

from server_modules.channel_errors import ChannelIngressValidationError
from server_modules.channel_identity_service import (
    SUPPORTED_CHANNEL_KEYS,
    SUPPORTED_FULL_SHELL_KEYS,
    normalize_channel_key,
)


FULL_SHELL_CLASS = "full_shell"
CHANNEL_SHELL_CLASS = "channel_shell"


def full_shell_contract(shell_key: str) -> Dict[str, Any]:
    normalized = str(shell_key or "").strip().lower()
    if normalized not in SUPPORTED_FULL_SHELL_KEYS:
        raise ChannelIngressValidationError("Unsupported shell.")
    return {
        "shell_key": normalized,
        "surface_class": FULL_SHELL_CLASS,
        "control_depth": "full",
        "allowed_capabilities": [
            "conversation",
            "summaries",
            "notifications",
            "approval_center",
            "application_navigation",
            "settings_profile",
        ],
        "forbidden_capabilities": [
            "separate_product_brain",
            "separate_policy_engine",
        ],
        "shares_captain_identity": True,
        "uses_shared_run_engine": True,
    }


def channel_shell_contract(channel_key: str) -> Dict[str, Any]:
    normalized = normalize_channel_key(channel_key)
    if normalized not in SUPPORTED_CHANNEL_KEYS:
        raise ChannelIngressValidationError("Unsupported channel.")
    lightweight_approvals = normalized in {"telegram", "whatsapp", "web_chat"}
    return {
        "channel_key": normalized,
        "surface_class": CHANNEL_SHELL_CLASS,
        "control_depth": "lightweight",
        "allowed_capabilities": [
            "conversation",
            "notifications",
            "summary_visibility",
            *(["lightweight_approvals"] if lightweight_approvals else []),
        ],
        "forbidden_capabilities": [
            "connector_management",
            "provider_management",
            "deep_application_configuration",
            "deep_admin_surface",
            "separate_product_brain",
            "separate_policy_engine",
        ],
        "shares_captain_identity": True,
        "uses_shared_run_engine": True,
        "deep_connector_control_surface": False,
    }


def shell_surface_contract(surface_key: str) -> Dict[str, Any]:
    normalized = str(surface_key or "").strip().lower()
    if normalized in SUPPORTED_FULL_SHELL_KEYS:
        return full_shell_contract(normalized)
    return channel_shell_contract(normalize_channel_key(normalized))
