from __future__ import annotations

import os
import re
import sys
import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Optional

from scripts.orion_local_worker_llm import (
    SUPPORTED_PROVIDERS,
    generate_chat_reply_with_provider_fallback,
    get_claude_code_session_token,
    provider_has_key,
)
from scripts.orion_local_worker_utils import build_operator_system_prompt
from server_modules.provider_profiles import _build_provider_credential_candidates, normalize_auth_mode
try:
    from server_modules.tool_availability_truth import resolve_workspace_tool_capabilities
except Exception:
    _tool_availability_path = Path(__file__).resolve().parent / "tool_availability_truth.py"
    _tool_availability_spec = importlib.util.spec_from_file_location("operator_chat_tool_availability_truth", _tool_availability_path)
    _tool_availability_module = importlib.util.module_from_spec(_tool_availability_spec)
    sys.modules["operator_chat_tool_availability_truth"] = _tool_availability_module
    assert _tool_availability_spec and _tool_availability_spec.loader
    _tool_availability_spec.loader.exec_module(_tool_availability_module)
    resolve_workspace_tool_capabilities = _tool_availability_module.resolve_workspace_tool_capabilities

WORKFLOW_REQUEST_MARKERS = (
    "turn this into a workflow",
    "turn this into workflow",
    "make this a workflow",
    "make this workflow",
    "create a workflow",
    "create workflow",
    "build a workflow",
    "build workflow",
    "set up a workflow",
    "set this up as a workflow",
    "turn this into an automation",
    "turn this into automation",
    "set this up as automation",
    "automate this",
    "repeat this every day",
    "repeat this every week",
)
EXECUTION_MARKERS = (
    "run",
    "execute",
    "send",
    "draft",
    "check",
    "triage",
    "summarize",
    "review",
    "search",
    "find",
    "inspect",
    "pull",
    "organize",
    "schedule",
    "prepare",
    "update",
    "create",
)
QUESTION_OPENERS = ("what", "why", "how", "should", "can", "could", "would", "is", "are", "do", "does")
GOOGLE_WORKSPACE_KEYWORDS = ("email", "emails", "gmail", "inbox", "calendar", "drive", "meeting", "meetings")
TELEGRAM_KEYWORDS = ("telegram", "bot", "chat reply", "message on telegram")
DIRECT_RUN_OPENERS = (
    "summarize",
    "check",
    "search",
    "find",
    "review",
    "triage",
    "draft",
    "send",
    "schedule",
    "prepare",
    "update",
    "create",
    "organize",
    "pull",
    "inspect",
    "please",
    "can you",
    "could you",
    "would you",
)
MAX_DIRECT_CHAT_PRIOR_MESSAGES = 6
MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS = 280
MAX_CONTEXT_TOOL_CAPABILITIES = 6
MAX_CONTEXT_TOOL_ACTIONS = 6


def _compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def _normalize_tool_capabilities(availability: Any) -> List[Dict[str, Any]]:
    tools = availability.get("tool_capabilities") if isinstance(availability, dict) else []
    normalized: List[Dict[str, Any]] = []
    if not isinstance(tools, list):
        return normalized
    for item in tools:
        if not isinstance(item, dict):
            continue
        tool_id = str(item.get("id") or "").strip().lower()
        if not tool_id:
            continue
        normalized.append(
            {
                "id": tool_id,
                "label": str(item.get("label") or tool_id).strip() or tool_id,
                "connected": bool(item.get("connected")),
                "authenticated": item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None,
                "runtime_usable": item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None,
                "read_actions": [
                    str(entry or "").strip()
                    for entry in (item.get("read_actions") if isinstance(item.get("read_actions"), list) else [])
                    if str(entry or "").strip()
                ],
                "write_actions": [
                    str(entry or "").strip()
                    for entry in (item.get("write_actions") if isinstance(item.get("write_actions"), list) else [])
                    if str(entry or "").strip()
                ],
                "approval_required_actions": [
                    str(entry or "").strip()
                    for entry in (item.get("approval_required_actions") if isinstance(item.get("approval_required_actions"), list) else [])
                    if str(entry or "").strip()
                ],
            }
        )
    return normalized


def _tool_capability(availability: Dict[str, Any], tool_id: str) -> Optional[Dict[str, Any]]:
    token = str(tool_id or "").strip().lower()
    for item in _normalize_tool_capabilities(availability):
        if item.get("id") == token:
            return item
    return None


def _tool_connected(availability: Dict[str, Any], tool_id: str) -> bool:
    item = _tool_capability(availability, tool_id)
    return bool(item and item.get("connected"))


def _tool_runtime_usable(availability: Dict[str, Any], tool_id: str) -> Optional[bool]:
    item = _tool_capability(availability, tool_id)
    if not isinstance(item, dict):
        return None
    return item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None


def _availability_lines(workspace_id: str, availability: Dict[str, Any]) -> List[str]:
    ai_ready = bool(availability.get("ai_ready"))
    tools = _normalize_tool_capabilities(availability)
    connected_labels = [str(item.get("label") or "").strip() for item in tools if item.get("connected")]
    unavailable_labels = [str(item.get("label") or "").strip() for item in tools if item.get("connected") and item.get("runtime_usable") is False]
    unverified_labels = [str(item.get("label") or "").strip() for item in tools if item.get("connected") and item.get("runtime_usable") is None]
    return [
        f"Workspace: {workspace_id or 'default'}",
        f"AI account: {'ready' if ai_ready else 'not ready'}",
        f"Connected systems: {', '.join(connected_labels) if connected_labels else 'none'}",
        f"Unavailable now: {', '.join(unavailable_labels) if unavailable_labels else 'none'}",
        f"Not verified: {', '.join(unverified_labels) if unverified_labels else 'none'}",
    ]


def _connected_system_labels(availability: Dict[str, Any]) -> List[str]:
    return [str(item.get("label") or "").strip() for item in _normalize_tool_capabilities(availability) if item.get("connected")]


def _context_tool_capabilities(availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    trimmed: List[Dict[str, Any]] = []
    for item in _normalize_tool_capabilities(availability):
        if not item.get("connected"):
            continue
        trimmed.append(
            {
                "id": item.get("id"),
                "label": item.get("label"),
                "connected": True,
                "authenticated": item.get("authenticated") if isinstance(item.get("authenticated"), bool) else None,
                "runtime_usable": item.get("runtime_usable") if isinstance(item.get("runtime_usable"), bool) else None,
                "read_actions": (item.get("read_actions") or [])[:MAX_CONTEXT_TOOL_ACTIONS],
                "write_actions": (item.get("write_actions") or [])[:MAX_CONTEXT_TOOL_ACTIONS],
                "approval_required_actions": (item.get("approval_required_actions") or [])[:MAX_CONTEXT_TOOL_ACTIONS],
            }
        )
        if len(trimmed) >= MAX_CONTEXT_TOOL_CAPABILITIES:
            break
    return trimmed


def _normalize_prior_messages(prior_messages: Any) -> List[Dict[str, str]]:
    if not isinstance(prior_messages, list):
        return []
    normalized: List[Dict[str, str]] = []
    for item in prior_messages:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue
        content = re.sub(r"\s+", " ", str(item.get("content") or "").strip())
        if not content:
            continue
        if len(content) > MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS:
            content = content[: MAX_DIRECT_CHAT_PRIOR_MESSAGE_CHARS - 1].rstrip() + "…"
        normalized.append({"role": role, "content": content})
    return normalized[-MAX_DIRECT_CHAT_PRIOR_MESSAGES:]


def _build_context_used(
    *,
    workspace_id: str,
    requested_provider: str,
    effective_provider: Optional[str],
    requested_model: str,
    effective_model: Optional[str],
    reasoning_effort: Optional[str],
    connected_systems: List[str],
    tool_capabilities: List[Dict[str, Any]],
    prior_messages_used: bool,
    history_mode: str,
    run_created: bool,
    fallback_used: bool = False,
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    provider_overridden = bool(
        requested_provider and effective_provider and requested_provider != effective_provider
    )
    model_overridden = bool(
        requested_model and effective_model and requested_model != effective_model
    )
    payload = {
        "workspace": workspace_id or "default",
        "requested_provider": requested_provider or None,
        "effective_provider": effective_provider or None,
        "requested_model": requested_model or None,
        "effective_model": effective_model or None,
        "provider_overridden": provider_overridden,
        "model_overridden": model_overridden,
        "fallback_used": bool(fallback_used),
        "reasoning_effort": reasoning_effort or None,
        "connected_systems": connected_systems,
        "tool_capabilities": tool_capabilities,
        "prior_messages_used": bool(prior_messages_used),
        "history_mode": history_mode if history_mode in {"none", "raw_messages", "summary"} else "none",
        "run_created": bool(run_created),
    }
    if fallback_reason:
        payload["fallback_reason"] = fallback_reason
    return payload


def _with_context_used(payload: Dict[str, Any], context_used: Dict[str, Any]) -> Dict[str, Any]:
    next_payload = dict(payload)
    next_payload["context_used"] = context_used
    return next_payload


def _connect_action(label: str, href: str) -> Dict[str, Any]:
    return {
        "id": f"connect:{href}",
        "kind": "connect",
        "label": label,
        "href": href,
        "variant": "primary",
    }


def _google_repair_action() -> Dict[str, Any]:
    return _connect_action("Reconnect Google Workspace", "/credentials?connector=google_workspace")


def _run_action(message: str) -> Dict[str, Any]:
    return {
        "id": "run:this",
        "kind": "run",
        "label": "Run this",
        "goal": str(message or "").strip(),
        "variant": "primary",
    }


def _workflow_action(message: str) -> Dict[str, Any]:
    return {
        "id": "workflow:create",
        "kind": "workflow",
        "label": "Turn into workflow",
        "goal": str(message or "").strip(),
        "href": "/builder/new",
        "variant": "secondary",
    }


def _question_like(compact_message: str) -> bool:
    return compact_message.startswith(tuple(f"{token} " for token in QUESTION_OPENERS))


def _mentions_any(compact_message: str, markers: tuple[str, ...]) -> bool:
    return any(marker in compact_message for marker in markers)


def _starts_like_direct_run(compact_message: str) -> bool:
    return compact_message.startswith(tuple(f"{token} " for token in DIRECT_RUN_OPENERS))


def _is_obvious_telegram_write_request(compact_message: str) -> bool:
    if not compact_message or _question_like(compact_message):
        return False
    return _mentions_any(compact_message, TELEGRAM_KEYWORDS) and _starts_like_direct_run(compact_message)


def _is_obvious_google_write_request(compact_message: str) -> bool:
    if not compact_message or _question_like(compact_message):
        return False
    if "send an email" in compact_message or "draft an email" in compact_message:
        return True
    if "send email" in compact_message or "draft email" in compact_message:
        return True
    if "calendar event" in compact_message and _starts_like_direct_run(compact_message):
        return True
    if "meeting invite" in compact_message and _starts_like_direct_run(compact_message):
        return True
    return False


def _connector_write_preview_allowed(message: str, availability: Dict[str, Any]) -> bool:
    compact = _compact_text(message)
    if _is_obvious_telegram_write_request(compact):
        return _tool_runtime_usable(availability, "telegram_bot") is True
    if _is_obvious_google_write_request(compact):
        return _tool_runtime_usable(availability, "google_workspace") is True
    return False


def _is_explicit_workflow_request(message: str) -> bool:
    compact = _compact_text(message)
    if not compact:
        return False
    return _mentions_any(compact, WORKFLOW_REQUEST_MARKERS)


def _no_ai_chat_response(availability: Dict[str, Any]) -> Dict[str, Any]:
    capabilities = _normalize_tool_capabilities(availability)
    connected_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected")]
    usable_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("runtime_usable") is True]
    unavailable_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected") and item.get("runtime_usable") is False]
    unverified_labels = [str(item.get("label") or "").strip() for item in capabilities if item.get("connected") and item.get("runtime_usable") is None]
    connected_line = ", ".join(connected_labels) if connected_labels else "none"
    usable_line = ", ".join(usable_labels) if usable_labels else "none verified"
    unavailable_line = ", ".join(unavailable_labels) if unavailable_labels else "none"
    unverified_line = ", ".join(unverified_labels) if unverified_labels else "none"
    reply = (
        "AI chat is not available right now because the workspace AI account is not ready. "
        f"Connected here right now: {connected_line}. "
        f"Usable now: {usable_line}. "
        f"Unavailable now: {unavailable_line}. "
        f"Not verified: {unverified_line}. "
        "Connect the workspace AI account to use normal chat and reasoning."
    )
    return {
        "reply": reply,
        "actions": [_connect_action("Connect", "/connect-ai")],
        "mode": "connect",
    }


def _tool_gate_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    compact = _compact_text(message)
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and not _tool_connected(availability, "google_workspace"):
        return {
            "reply": "Google Workspace is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=google_workspace")],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is False:
        return {
            "reply": "Google Workspace is connected here, but is not usable right now.",
            "actions": [_google_repair_action()],
            "mode": "connect",
        }
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is not True:
        return {
            "reply": "Google Workspace is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and not _tool_connected(availability, "telegram_bot"):
        return {
            "reply": "Telegram is not connected in this workspace.",
            "actions": [_connect_action("Connect", "/credentials?connector=telegram_bot")],
            "mode": "connect",
        }
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is False:
        return {
            "reply": "Telegram is connected here, but is not usable right now.",
            "actions": [],
            "mode": "connect",
        }
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is not True:
        return {
            "reply": "Telegram is connected here, but its capability state is not verified right now.",
            "actions": [],
            "mode": "connect",
        }
    return None


def _suggest_actions(message: str, availability: Dict[str, Any]) -> List[Dict[str, Any]]:
    compact = _compact_text(message)
    actions: List[Dict[str, Any]] = []
    if _is_explicit_workflow_request(message):
        actions.append(_workflow_action(message))
        return actions
    if _mentions_any(compact, GOOGLE_WORKSPACE_KEYWORDS) and _tool_runtime_usable(availability, "google_workspace") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, TELEGRAM_KEYWORDS) and _tool_runtime_usable(availability, "telegram_bot") is True:
        actions.append(_run_action(message))
        return actions
    if _mentions_any(compact, EXECUTION_MARKERS) and not _question_like(compact):
        actions.append(_run_action(message))
    return actions


def _preview_run_response(message: str, availability: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    compact = _compact_text(message)
    if _is_explicit_workflow_request(message):
        return {
            "reply": "I can help turn that into a workflow.",
            "actions": [_workflow_action(message)],
            "mode": "answer_with_action",
        }
    if _mentions_any(compact, EXECUTION_MARKERS) and _starts_like_direct_run(compact) and not _question_like(compact):
        return {
            "reply": "I can run that here.",
            "actions": [_run_action(message)],
            "mode": "answer_with_action",
        }
    return None


def _credential_auth_mode(provider: str, credentials: Optional[Dict[str, Any]]) -> str:
    payload = credentials if isinstance(credentials, dict) else {}
    return normalize_auth_mode(provider, credentials=payload)


def _supports_direct_message_native_chat(provider: str, credentials: Optional[Dict[str, Any]]) -> bool:
    payload = credentials if isinstance(credentials, dict) else {}
    auth_mode = _credential_auth_mode(provider, payload)
    normalized_provider = str(provider or "").strip().lower()
    if normalized_provider == "anthropic":
        if auth_mode == "local_cli":
            return bool(get_claude_code_session_token())
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("anthropic")
    if normalized_provider == "openai":
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("openai")
    if normalized_provider == "gemini":
        return bool(str(payload.get("api_key") or "").strip()) or provider_has_key("gemini")
    if normalized_provider == "codex_cli":
        return bool(payload) or provider_has_key("codex_cli")
    return provider_has_key(normalized_provider)


def _preferred_provider(workspace_id: str, requested_provider: str = "") -> tuple[str, Dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    prioritized_message_native = ("anthropic", "openai", "gemini")
    for provider in prioritized_message_native:
        credentials = _direct_chat_credentials(normalized_workspace_id, provider)
        if _supports_direct_message_native_chat(provider, credentials):
            return provider, credentials
    codex_credentials = _direct_chat_credentials(normalized_workspace_id, "codex_cli")
    if _supports_direct_message_native_chat("codex_cli", codex_credentials):
        return "codex_cli", codex_credentials
    requested = str(requested_provider or "").strip().lower()
    fallback_provider = requested if requested in SUPPORTED_PROVIDERS else "openai"
    fallback_credentials = _direct_chat_credentials(normalized_workspace_id, fallback_provider)
    return fallback_provider, fallback_credentials


def _provider_display_name(provider: str) -> str:
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


def _provider_unavailable_response(provider: str) -> Dict[str, Any]:
    label = _provider_display_name(provider)
    if provider == "codex_cli":
        return {
            "reply": "The workspace AI account is not ready to answer chat right now.",
            "actions": [_connect_action("Connect", "/connect-ai")],
            "mode": "connect",
        }
    return {
        "reply": f"{label} is selected for chat but is not available right now.",
        "actions": [_connect_action("Connect", "/connect-ai")],
        "mode": "connect",
    }


def _direct_chat_credentials(workspace_id: str, provider: str) -> Dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_provider = str(provider or "").strip().lower()
    candidate_provider = "openai-codex" if normalized_provider == "codex_cli" else normalized_provider
    candidates = _build_provider_credential_candidates(
        {"workspace_id": normalized_workspace_id},
        {"source": "chat_direct"},
        candidate_provider,
    )
    if normalized_provider == "codex_cli" and not candidates:
        openai_candidates = _build_provider_credential_candidates(
            {"workspace_id": normalized_workspace_id},
            {"source": "chat_direct"},
            "openai",
        )
        candidates = [
            item for item in openai_candidates
            if isinstance(item.get("credentials"), dict)
            and str((item.get("credentials") or {}).get("auth_mode") or "").strip().lower() == "oauth_token"
        ]
    first = candidates[0].get("credentials") if candidates else {}
    return dict(first) if isinstance(first, dict) else {}


def _normalize_reasoning_effort(value: str = "") -> Optional[str]:
    normalized = str(value or "").strip().lower()
    if normalized in {"low", "medium", "high"}:
        return normalized
    return None


def build_direct_operator_reply(
    *,
    message: str,
    workspace_id: str,
    requested_model: str,
    requested_provider: str,
    thread_id: str = "",
    prior_messages: Optional[List[Dict[str, Any]]] = None,
    reasoning_effort: str = "",
    availability: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_message = str(message or "").strip()
    normalized_workspace_id = str(workspace_id or "default").strip() or "default"
    normalized_thread_id = str(thread_id or "").strip()
    availability_payload = availability if isinstance(availability, dict) else {}
    normalized_requested_provider = str(requested_provider or "").strip().lower()
    normalized_requested_model = str(requested_model or "").strip()
    normalized_reasoning_effort = _normalize_reasoning_effort(reasoning_effort)
    normalized_prior_messages = _normalize_prior_messages(prior_messages)
    availability_payload = {
        **availability_payload,
        "tool_capabilities": resolve_workspace_tool_capabilities(normalized_workspace_id),
    }
    connected_systems = _connected_system_labels(availability_payload)
    tool_capabilities = _context_tool_capabilities(availability_payload)
    base_context_used = _build_context_used(
        workspace_id=normalized_workspace_id,
        requested_provider=normalized_requested_provider,
        effective_provider=None,
        requested_model=normalized_requested_model,
        effective_model=None,
        reasoning_effort=normalized_reasoning_effort,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        prior_messages_used=False,
        history_mode="none",
        run_created=False,
    )

    if not normalized_message:
        return _with_context_used({
            "reply": "Tell me the outcome you want and I’ll help you move it forward.",
            "actions": [],
            "mode": "answer",
        }, base_context_used)

    gated = _tool_gate_response(normalized_message, availability_payload)
    if gated is not None:
        return _with_context_used(gated, base_context_used)

    if not bool(availability_payload.get("ai_ready")) and not _connector_write_preview_allowed(normalized_message, availability_payload):
        return _with_context_used(_no_ai_chat_response(availability_payload), base_context_used)

    preview = _preview_run_response(normalized_message, availability_payload)
    if preview is not None:
        return _with_context_used(preview, base_context_used)

    provider, direct_chat_credentials = _preferred_provider(normalized_workspace_id, normalized_requested_provider)
    fallback_reason = None
    if provider not in SUPPORTED_PROVIDERS or not _supports_direct_message_native_chat(provider, direct_chat_credentials):
        return _with_context_used(
            _provider_unavailable_response(provider),
            _build_context_used(
                workspace_id=normalized_workspace_id,
                requested_provider=normalized_requested_provider,
                effective_provider=provider,
                requested_model=normalized_requested_model,
                effective_model=None,
                reasoning_effort=normalized_reasoning_effort,
                connected_systems=connected_systems,
                tool_capabilities=tool_capabilities,
                prior_messages_used=False,
                history_mode="none",
                run_created=False,
                fallback_used=False,
                fallback_reason=fallback_reason,
            ),
        )
    selected_model = normalized_requested_model if provider == normalized_requested_provider else ""
    context = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
    }
    metadata = {
        "provider": provider,
        "model": selected_model or None,
        "source": "chat_direct",
        "reasoning_effort": normalized_reasoning_effort,
        "thread_id": normalized_thread_id or None,
    }
    if direct_chat_credentials:
        metadata["credentials"] = direct_chat_credentials
    raw_system_prompt = build_operator_system_prompt(
        _availability_lines(normalized_workspace_id, availability_payload),
    )
    system_prompt = raw_system_prompt or None
    history_mode = "raw_messages" if normalized_prior_messages else "none"
    prior_messages_used = bool(normalized_prior_messages)
    reply = ""
    usage_masked: Dict[str, Any] = {}
    attempted_providers = ""
    llm_error = ""
    for _ in range(2):
        reply, usage_masked, attempted_providers, llm_error = generate_chat_reply_with_provider_fallback(
            context=context,
            metadata=metadata,
            user_goal=normalized_message,
            system_prompt=system_prompt,
            prior_messages=normalized_prior_messages or None,
        )
        if reply:
            break
    if not reply:
        reply = "I couldn’t get a clean model reply right now. Retry in a moment."
        if "no provider credentials available" in _compact_text(llm_error):
            reply = "No active AI credential is available right now. Connect the workspace AI account, then retry."
        elif "direct_chat_transport_unavailable" in _compact_text(llm_error):
            reply = "Direct chat is unavailable on the current provider path. Use a message-native AI account, then retry."
        elif "missing scopes" in _compact_text(llm_error) or "api.responses.write" in _compact_text(llm_error):
            reply = "The current Codex/OpenAI auth cannot answer chat right now. Reconnect the account, then retry."

    actual_provider = usage_masked.get("provider") if isinstance(usage_masked, dict) else provider
    actual_model = usage_masked.get("model") if isinstance(usage_masked, dict) else (normalized_requested_model or None)

    actions = _suggest_actions(normalized_message, availability_payload)
    return {
        "reply": reply,
        "actions": actions,
        "mode": "answer_with_action" if actions else "answer",
        "usage_masked": usage_masked,
        "provider": actual_provider,
        "model": actual_model,
        "attempted_providers": attempted_providers,
        "error": llm_error,
        "context_used": _build_context_used(
            workspace_id=normalized_workspace_id,
            requested_provider=normalized_requested_provider,
            effective_provider=str(actual_provider or provider or "").strip() or None,
            requested_model=normalized_requested_model,
            effective_model=str(actual_model or "").strip() or None,
            reasoning_effort=normalized_reasoning_effort,
            connected_systems=connected_systems,
            tool_capabilities=tool_capabilities,
            prior_messages_used=prior_messages_used,
            history_mode=history_mode,
            run_created=False,
            fallback_used=False,
            fallback_reason=fallback_reason,
        ),
    }
