from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from server_modules import sage_memory_service
from server_modules import sage_profile_service
from server_modules import workspace_context
from server_modules.direct_chat_runtime_exports import generate_chat_reply_with_provider_fallback
from server_modules.direct_chat_provider_service import (
    direct_chat_credentials,
    supports_direct_message_native_chat,
    credential_auth_mode,
)

ALLOWED_MODES = {"owner_sage"}
CLOUD_PROVIDER_IDS = ("anthropic", "deepseek", "openai", "gemini")


def _coerce_text(value: Any) -> str:
    return str(value or "").strip()


def _resolve_cloud_provider(workspace_id: str) -> tuple[str, dict]:
    for provider in CLOUD_PROVIDER_IDS:
        credentials = direct_chat_credentials(workspace_id, provider)
        if provider == "openai":
            credential_type = _coerce_text(credentials.get("credential_type")).lower()
            auth_mode = credential_auth_mode("openai", credentials)
            if credential_type == "codex_token" or auth_mode == "oauth_token":
                continue
        if supports_direct_message_native_chat(provider, credentials):
            return provider, credentials
    raise RuntimeError("No cloud provider is configured for Sage.")


def _build_sage_system_prompt(*, workspace_id: str) -> str:
    profile = sage_profile_service.list_sage_profile(workspace_id=workspace_id)
    profile_data = profile.get("profile") if isinstance(profile.get("profile"), dict) else {}

    user_name = _coerce_text(profile_data.get("user_name"))
    identity_summary = _coerce_text(profile_data.get("identity_summary"))
    communication_style = _coerce_text(profile_data.get("communication_style"))
    recurring = _coerce_text(profile_data.get("recurring_responsibility"))
    standing_rules = profile_data.get("standing_rules") or []

    context_files = workspace_context.read_workspace_context_files(workspace_id=workspace_id)
    soul_md = _coerce_text(context_files.get("SOUL.md"))

    lines: list[str] = []
    if soul_md:
        lines.append(soul_md)
    else:
        lines.append("You are Sage, a calm personal assistant inside the Empyralis platform.")
        lines.append("Your job is to help the user with clear, useful, and thoughtful replies.")

    if user_name:
        lines.append(f"\nThe user you are assisting is named {user_name}.")
    if identity_summary:
        lines.append(f"Their role and focus: {identity_summary}.")
    if communication_style:
        lines.append(f"\nCommunication style the user prefers: {communication_style}")
    if recurring:
        lines.append(f"\nRecurring responsibility to track: {recurring}")
    if standing_rules:
        lines.append("\nStanding rules:")
        for rule in standing_rules:
            lines.append(f"- {rule}")

    lines.append(
        "\nYou have access to Sage Memory (durable facts the user has saved) and workspace context files. "
        "Use them when relevant but do not announce that you are loading them. "
        "Stay within your role as a personal assistant. You are not a Studio agent and you do not serve "
        "external customers."
    )
    return "\n".join(lines).strip()


def _build_context_blocks(*, workspace_id: str) -> list[str]:
    used: list[str] = []
    try:
        memory_block = sage_memory_service.build_sage_memory_context_block(
            workspace_id=workspace_id,
        )
    except Exception:
        memory_block = ""
    if memory_block:
        used.append("sage_memory")
    used.append("workspace_context_files")
    return used


def run_sage_chat_turn(
    *,
    workspace_id: str,
    message: str,
    surface: str = "chat",
    mode: str = "owner_sage",
) -> dict:
    normalized_workspace_id = _coerce_text(workspace_id)
    normalized_message = _coerce_text(message)
    normalized_mode = _coerce_text(mode)

    if not normalized_workspace_id:
        raise ValueError("workspace_id is required")
    if not normalized_message:
        raise ValueError("message must not be empty")
    if normalized_mode not in ALLOWED_MODES:
        raise ValueError(f"Unsupported mode: {normalized_mode}")

    trace_id = str(uuid.uuid4())
    used_context = _build_context_blocks(workspace_id=normalized_workspace_id)

    system_prompt = _build_sage_system_prompt(workspace_id=normalized_workspace_id)

    provider, credentials = _resolve_cloud_provider(normalized_workspace_id)

    context: dict = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "source": "sage_chat",
        "surface": _coerce_text(surface),
        "disable_provider_fallback": False,
    }
    metadata: dict = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "source": "sage_chat",
        "surface": _coerce_text(surface),
        "credentials": credentials,
        "trace_id": trace_id,
    }

    reply, usage, attempted_providers, last_error = generate_chat_reply_with_provider_fallback(
        context,
        metadata,
        normalized_message,
        system_prompt,
        prior_messages=None,
    )

    if not reply and last_error:
        raise RuntimeError(last_error)

    attempted = [p.strip() for p in _coerce_text(attempted_providers).split(",") if p.strip()]
    effective_provider = attempted[-1] if attempted else provider
    effective_model = _coerce_text((usage or {}).get("model"))

    return {
        "message": reply or "",
        "used_context": used_context,
        "tool_calls": [],
        "memory_updates": [],
        "trace_id": trace_id,
        "provider": effective_provider,
        "model": effective_model or None,
    }
