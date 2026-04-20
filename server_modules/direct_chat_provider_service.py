from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from server_modules.direct_chat_intervention_service import build_intervention

from scripts.orion_local_worker_llm import (
    SUPPORTED_PROVIDERS,
    get_claude_code_session_token,
    provider_has_key,
)
from server_modules import provider_profiles
from server_modules.provider_profiles import _build_provider_credential_candidates, normalize_auth_mode
from server_modules import skills_service


def credential_auth_mode(
    provider: str,
    credentials: Optional[Dict[str, Any]],
    *,
    normalize_auth_mode_fn: Callable[..., str] = normalize_auth_mode,
) -> str:
    payload = credentials if isinstance(credentials, dict) else {}
    return normalize_auth_mode_fn(provider, credentials=payload)


def supports_direct_message_native_chat(
    provider: str,
    credentials: Optional[Dict[str, Any]],
    *,
    credential_auth_mode_fn: Callable[[str, Optional[Dict[str, Any]]], str] = credential_auth_mode,
    get_claude_code_session_token_fn: Callable[[], Any] = get_claude_code_session_token,
    provider_has_key_fn: Callable[[str], bool] = provider_has_key,
) -> bool:
    payload = credentials if isinstance(credentials, dict) else {}
    auth_mode = credential_auth_mode_fn(provider, payload)
    normalized_provider = str(provider or "").strip().lower()
    credential_type = str(payload.get("credential_type") or "").strip().lower()
    bearer_token = str(payload.get("access_token") or payload.get("oauth_token") or "").strip()
    if normalized_provider == "anthropic":
        if auth_mode == "local_cli":
            return bool(get_claude_code_session_token_fn())
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key_fn("anthropic")
    if normalized_provider == "openai":
        if credential_type == "codex_token":
            return False
        return (
            bool(str(payload.get("api_key") or "").strip())
            or (auth_mode in {"oauth_token", "access_token"} and bool(bearer_token))
            or provider_has_key_fn("openai")
        )
    if normalized_provider == "gemini":
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key_fn("gemini")
    if normalized_provider in {"openai-codex", "codex_cli"}:
        return bool(payload) or provider_has_key_fn("codex_cli")
    return provider_has_key_fn(normalized_provider)


def direct_chat_credentials(
    workspace_id: str,
    provider: str,
    *,
    build_provider_credential_candidates_fn: Callable[..., list[dict[str, Any]]] = _build_provider_credential_candidates,
) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_provider = str(provider or "").strip().lower()
    candidate_provider = "openai-codex" if normalized_provider == "codex_cli" else normalized_provider
    candidates = build_provider_credential_candidates_fn(
        {"workspace_id": normalized_workspace_id},
        {"source": "chat_direct"},
        candidate_provider,
    )
    if normalized_provider == "codex_cli" and not candidates:
        openai_candidates = build_provider_credential_candidates_fn(
            {"workspace_id": normalized_workspace_id},
            {"source": "chat_direct"},
            "openai",
        )
        candidates = [
            item
            for item in openai_candidates
            if isinstance(item.get("credentials"), dict)
            and str((item.get("credentials") or {}).get("auth_mode") or "").strip().lower() == "oauth_token"
        ]
    first = candidates[0].get("credentials") if candidates else {}
    return dict(first) if isinstance(first, dict) else {}


def provider_runtime_usable(
    workspace_id: str,
    provider: str,
    *,
    build_provider_runtime_truth_fn: Callable[[str], Dict[str, Any]] = provider_profiles.build_provider_runtime_truth,
) -> bool:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_provider = str(provider or "").strip().lower()
    provider_id = "openai-codex" if normalized_provider == "codex_cli" else normalized_provider
    truth = build_provider_runtime_truth_fn(normalized_workspace_id)
    providers_by_id = truth.get("providers_by_id") if isinstance(truth, dict) else {}
    entry = providers_by_id.get(provider_id) if isinstance(providers_by_id, dict) else None
    if not isinstance(entry, dict):
        return True
    if bool(entry.get("backpressure")):
        return False
    if entry.get("usable") is False:
        return False
    return True


def preferred_provider(
    workspace_id: str,
    requested_provider: str = "",
    *,
    supported_providers: List[str] | tuple[str, ...] = SUPPORTED_PROVIDERS,
    direct_chat_credentials_fn: Callable[[str, str], Dict[str, Any]] = direct_chat_credentials,
    supports_direct_message_native_chat_fn: Callable[[str, Optional[Dict[str, Any]]], bool] = supports_direct_message_native_chat,
    credential_auth_mode_fn: Callable[[str, Optional[Dict[str, Any]]], str] = credential_auth_mode,
    provider_runtime_usable_fn: Callable[[str, str], bool] = provider_runtime_usable,
) -> tuple[str, Dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    requested = str(requested_provider or "").strip().lower()
    normalized_requested = "codex_cli" if requested == "openai-codex" else requested
    if normalized_requested in supported_providers:
        requested_credentials = direct_chat_credentials_fn(normalized_workspace_id, normalized_requested)
        if supports_direct_message_native_chat_fn(normalized_requested, requested_credentials):
            return normalized_requested, requested_credentials
        return normalized_requested, requested_credentials
    for provider in ("anthropic", "deepseek", "openai", "gemini"):
        credentials = direct_chat_credentials_fn(normalized_workspace_id, provider)
        if provider == "openai":
            credential_type = str(credentials.get("credential_type") or "").strip().lower()
            if credential_type == "codex_token" or credential_auth_mode_fn("openai", credentials) == "oauth_token":
                codex_credentials = direct_chat_credentials_fn(normalized_workspace_id, "codex_cli")
                if provider_runtime_usable_fn(normalized_workspace_id, "codex_cli") and supports_direct_message_native_chat_fn("codex_cli", codex_credentials):
                    return "codex_cli", codex_credentials
                continue
        if supports_direct_message_native_chat_fn(provider, credentials):
            return provider, credentials
    codex_credentials = direct_chat_credentials_fn(normalized_workspace_id, "codex_cli")
    if provider_runtime_usable_fn(normalized_workspace_id, "codex_cli") and supports_direct_message_native_chat_fn("codex_cli", codex_credentials):
        return "codex_cli", codex_credentials
    fallback_provider = requested if requested in supported_providers else "openai"
    fallback_credentials = direct_chat_credentials_fn(normalized_workspace_id, fallback_provider)
    return fallback_provider, fallback_credentials


def provider_display_name(provider: str) -> str:
    normalized = str(provider or "").strip().lower()
    if normalized == "codex_cli":
        return "Codex/OpenAI"
    if normalized == "claude_code_cli":
        return "Claude Code"
    if normalized == "openai":
        return "OpenAI"
    if normalized == "anthropic":
        return "Anthropic"
    if normalized == "gemini":
        return "Gemini"
    if normalized == "ollama":
        return "Ollama"
    return normalized or "AI"


def provider_unavailable_response(
    provider: str,
    *,
    connect_action: Callable[[str, str], Dict[str, Any]],
) -> Dict[str, Any]:
    label = provider_display_name(provider)
    if provider == "codex_cli":
        return {
            "reply": "",
            "actions": [connect_action("Connect", "/connect-ai")],
            "mode": "connect",
            "interventions": [
                build_intervention(
                    "connect_required",
                    "Workspace AI account is not ready",
                    detail="Connect the workspace AI account to use model-backed chat in this workspace.",
                    severity="warning",
                    status="waiting",
                    code="provider_unavailable",
                    metadata={"provider": provider},
                )
            ],
        }
    return {
        "reply": "",
        "actions": [connect_action("Connect", "/connect-ai")],
        "mode": "connect",
        "interventions": [
            build_intervention(
                "connect_required",
                f"{label} is not available",
                detail=f"{label} is selected for chat but is not available right now.",
                severity="warning",
                status="waiting",
                code="provider_unavailable",
                metadata={"provider": provider},
            )
        ],
    }


def direct_chat_runtime_available(
    local_worker_registry: Dict[str, Any],
    *,
    is_worker_online_fn: Callable[[Any, datetime], bool],
    now: Optional[datetime] = None,
) -> bool:
    try:
        current_time = now if isinstance(now, datetime) else datetime.now(timezone.utc)
        return any(
            isinstance(record, dict) and is_worker_online_fn(record, current_time)
            for record in local_worker_registry.values()
        )
    except Exception:
        return False


def resolve_direct_chat_availability(
    workspace_id: str,
    requested_provider: str = "",
    *,
    direct_chat_runtime_available_fn: Callable[[], bool],
    preferred_provider_fn: Callable[[str, str], tuple[str, Dict[str, Any]]],
    supports_direct_message_native_chat_fn: Callable[[str, Optional[Dict[str, Any]]], bool],
    resolve_workspace_tool_capabilities_fn: Callable[[str], List[Dict[str, Any]]],
    availability_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    runtime_ok = direct_chat_runtime_available_fn()
    provider, credentials = preferred_provider_fn(normalized_workspace_id, requested_provider)
    ai_ready = supports_direct_message_native_chat_fn(provider, credentials)
    tool_capabilities = skills_service.resolve_workspace_capability_payloads(
        normalized_workspace_id,
        resolve_workspace_tool_capabilities_fn=resolve_workspace_tool_capabilities_fn,
    )
    override_payload = availability_override if isinstance(availability_override, dict) else {}
    source_channel = str(override_payload.get("surface_channel") or override_payload.get("channel") or "").strip().lower()
    source_token = str(override_payload.get("source") or override_payload.get("source_surface") or "").strip().lower()
    mobile_server_first = (
        bool(override_payload.get("mobile_server_first"))
        or source_channel == "mobile"
        or source_token in {"mobile_chat", "mobile_workspace_chat_surface"}
    )
    connection_mode = ""
    if ai_ready:
        connection_mode = "platform" if mobile_server_first else "local_companion" if runtime_ok else "byok"

    resolved: Dict[str, Any] = {
        "ai_ready": ai_ready,
        "runtime_ok": runtime_ok,
        "connection_mode": connection_mode,
        "provider": provider,
        "tool_capabilities": tool_capabilities,
    }
    if override_payload:
        resolved.update(override_payload)
        if "tool_capabilities" not in override_payload:
            resolved["tool_capabilities"] = tool_capabilities
        if "connection_mode" not in override_payload:
            resolved["connection_mode"] = connection_mode
    return resolved


def connected_provider_tokens(
    workspace_id: str,
    *,
    supported_providers: List[str] | tuple[str, ...] = SUPPORTED_PROVIDERS,
    direct_chat_credentials_fn: Callable[[str, str], Dict[str, Any]] = direct_chat_credentials,
) -> List[str]:
    connected: List[str] = []
    for provider in supported_providers:
        try:
            credentials = direct_chat_credentials_fn(workspace_id, provider)
        except Exception:
            credentials = {}
        if isinstance(credentials, dict) and credentials:
            connected.append(provider)
    return connected


def message_prefers_codex_for_direct_chat(
    message: str,
    *,
    tools_present: bool,
    compact_text_fn: Callable[[Any], str],
    mentions_any_fn: Callable[[str, tuple[str, ...] | list[str]], bool],
    message_requests_local_file_tool_fn: Callable[[str], bool],
    message_requests_local_shell_tool_fn: Callable[[str], bool],
    message_requests_local_screenshot_tool_fn: Callable[[str], bool],
    message_requests_local_computer_tool_fn: Callable[[str], bool],
    google_workspace_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
) -> bool:
    compact_message = compact_text_fn(message)
    connector_heavy = bool(tools_present) and (
        mentions_any_fn(compact_message, google_workspace_keywords)
        or mentions_any_fn(compact_message, telegram_keywords)
        or mentions_any_fn(compact_message, slack_keywords)
        or mentions_any_fn(compact_message, dropbox_keywords)
        or mentions_any_fn(compact_message, s3_keywords)
    )
    local_machine_request = (
        message_requests_local_file_tool_fn(message)
        or message_requests_local_shell_tool_fn(message)
        or message_requests_local_screenshot_tool_fn(message)
        or message_requests_local_computer_tool_fn(message)
    )
    return connector_heavy or local_machine_request


def resolve_provider_for_direct_chat_message(
    workspace_id: str,
    requested_provider: str,
    message: str,
    *,
    tools_present: bool,
    preferred_provider_fn: Callable[[str, str], tuple[str, Dict[str, Any]]],
    direct_chat_credentials_fn: Callable[[str, str], Dict[str, Any]],
    supports_direct_message_native_chat_fn: Callable[[str, Optional[Dict[str, Any]]], bool],
    provider_runtime_usable_fn: Callable[[str, str], bool] = provider_runtime_usable,
    compact_text_fn: Callable[[Any], str],
    mentions_any_fn: Callable[[str, tuple[str, ...] | list[str]], bool],
    message_requests_local_file_tool_fn: Callable[[str], bool],
    message_requests_local_shell_tool_fn: Callable[[str], bool],
    message_requests_local_screenshot_tool_fn: Callable[[str], bool],
    message_requests_local_computer_tool_fn: Callable[[str], bool],
    google_workspace_keywords: tuple[str, ...] | list[str],
    telegram_keywords: tuple[str, ...] | list[str],
    slack_keywords: tuple[str, ...] | list[str],
    dropbox_keywords: tuple[str, ...] | list[str],
    s3_keywords: tuple[str, ...] | list[str],
) -> tuple[str, Dict[str, Any]]:
    provider, credentials = preferred_provider_fn(workspace_id, requested_provider)
    explicit_provider = bool(str(requested_provider or "").strip())
    if not message_prefers_codex_for_direct_chat(
        message,
        tools_present=tools_present,
        compact_text_fn=compact_text_fn,
        mentions_any_fn=mentions_any_fn,
        message_requests_local_file_tool_fn=message_requests_local_file_tool_fn,
        message_requests_local_shell_tool_fn=message_requests_local_shell_tool_fn,
        message_requests_local_screenshot_tool_fn=message_requests_local_screenshot_tool_fn,
        message_requests_local_computer_tool_fn=message_requests_local_computer_tool_fn,
        google_workspace_keywords=google_workspace_keywords,
        telegram_keywords=telegram_keywords,
        slack_keywords=slack_keywords,
        dropbox_keywords=dropbox_keywords,
        s3_keywords=s3_keywords,
    ):
        return provider, credentials
    if explicit_provider:
        return provider, credentials
    codex_credentials = direct_chat_credentials_fn(workspace_id, "codex_cli")
    if provider_runtime_usable_fn(workspace_id, "codex_cli") and supports_direct_message_native_chat_fn("codex_cli", codex_credentials):
        return "codex_cli", codex_credentials
    return provider, credentials
