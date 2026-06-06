from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from server_modules import (
    activity_ledger_service,
    direct_chat_runtime_exports,
    direct_chat_tool_catalog_service,
    kill_switch_gate,
    no_provider_service,
    sage_instruction_compiler_service,
    sage_heartbeat_service,
    sage_memory_service,
    sage_profile_service,
    secret_redaction_service,
    security_audit_service,
    skill_registry,
    workspace_context,
)
from server_modules.conversation_memory_facade_service import (
    DIRECT_CHAT_SURFACE,
    ConversationMemorySubject,
    ConversationMemoryPersistRequest,
    persist_interaction,
)
from server_modules.conversation_memory_policy import (
    DIRECT_CHAT_PROFILE,
    MemoryPolicyProfile,
)
from server_modules.direct_chat_runtime_exports import generate_chat_reply_with_provider_fallback
from server_modules.direct_chat_provider_service import (
    direct_chat_credentials,
    supports_direct_message_native_chat,
    credential_auth_mode,
)
from server_modules.agent_computer_approval_decision_service import decide_agent_computer_action
from server_modules.agent_computer_policy_service import (
    CAPABILITY_APP_CONTROL,
    CAPABILITY_CLOUD_STORAGE_ACCESS,
    CAPABILITY_COMMUNICATION_SEND,
    CAPABILITY_FILE_WRITE,
    CAPABILITY_MEMORY_WRITE,
    CAPABILITY_TERMINAL_COMMAND,
    AUTONOMY_ASK_EVERY_TIME,
    build_default_agent_computer_policy,
)
from server_modules.sage_agent_runtime_contract import (
    SAGE_MODE,
    normalize_sage_mode,
    normalize_sage_surface,
    SageTurnResult,
)
from server_modules.sage_approval_service import (
    create_approval,
    APPROVAL_TOKEN_PREFIX,
    APPROVAL_TTL_MINUTES,
)
from server_modules.skill_registry import list_skill_definitions
from server_modules.sage_transparency_service import emit_sage_turn_transparency_events
from server_modules.transparency_event_store_service import persist_transparency_events
from scripts.orion_local_worker_llm import resolve_requested_model

ALLOWED_MODES = {SAGE_MODE}
CLOUD_PROVIDER_IDS = ("anthropic", "deepseek", "openai", "gemini")

SAFE_ACTION_CLASSES = {"read"}
BLOCKED_ACTION_CLASSES = {"write", "execute"}
SAGE_MAIN_AGENT_ID = "sage_main_agent"
_COMMUNICATION_SCOPES = {
    "discord",
    "email",
    "gmail",
    "imessage",
    "mail",
    "slack",
    "sms",
    "telegram",
    "whatsapp",
}
_MEMORY_SCOPES = {"memory", "sage_memory", "agent_memory"}
_FILE_SCOPES = {"file", "files", "filesystem", "drive"}
_CLOUD_STORAGE_SCOPES = {"dropbox", "google_drive", "icloud", "onedrive"}
_SAGE_TOOL_RESULT_MAX_CHARS = 4000
_AGENT_COMPUTER_TOOL_PREFIXES = ("browser__", "computer__", "file__", "shell__", "screenshot__")
_AGENT_COMPUTER_TOOL_NAMES = {"hardware__action"}


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


def _load_profile_context(*, workspace_id: str) -> str:
    profile = sage_profile_service.list_sage_profile(workspace_id=workspace_id)
    profile_data = profile.get("profile") if isinstance(profile.get("profile"), dict) else {}

    user_name = _coerce_text(profile_data.get("user_name"))
    identity_summary = _coerce_text(profile_data.get("identity_summary"))
    communication_style = _coerce_text(profile_data.get("communication_style"))
    recurring = _coerce_text(profile_data.get("recurring_responsibility"))
    standing_rules = profile_data.get("standing_rules") or []

    if not any([user_name, identity_summary, communication_style, recurring, standing_rules]):
        return ""

    lines: list[str] = []
    if user_name:
        lines.append(f"User: {user_name}")
    if identity_summary:
        lines.append(f"Role: {identity_summary}")
    if communication_style:
        lines.append(f"Preferred communication: {communication_style}")
    if recurring:
        lines.append(f"Recurring responsibility: {recurring}")
    if standing_rules:
        lines.append("Standing rules:")
        for rule in standing_rules:
            lines.append(f"  - {rule}")
    return "\n".join(lines)


def _load_context_files(*, workspace_id: str) -> str:
    files = workspace_context.read_workspace_context_files(workspace_id=workspace_id)
    sections, _diagnostics = sage_instruction_compiler_service.build_root_memory_brief_sections(files)
    return "\n\n".join(sections)


def _read_context_files_payload(*, workspace_id: str) -> dict[str, Any]:
    files = workspace_context.read_workspace_context_files(workspace_id=workspace_id)
    return files if isinstance(files, dict) else {}


def _load_memory_context(*, workspace_id: str) -> str:
    return sage_memory_service.build_sage_memory_context_block(
        workspace_id=workspace_id,
        include_restricted=False,
    )


def _load_safe_skill_catalog(*, workspace_id: str) -> list[dict]:
    all_skills = list_skill_definitions(workspace_id=workspace_id, include_disabled=False)
    safe: list[dict] = []
    for skill in all_skills:
        if not skill.enabled or not skill.available:
            continue
        if skill.action_class in BLOCKED_ACTION_CLASSES:
            continue
        safe.append({
            "id": skill.id,
            "label": skill.label,
            "description": skill.description,
            "action_class": skill.action_class,
            "requires_approval": skill.requires_approval,
            "execution_mode": skill.execution_mode,
        })
    return safe


def _build_heartbeat_summary(snapshot: dict) -> str:
    queue = snapshot.get("queue_overview") if isinstance(snapshot.get("queue_overview"), dict) else {}
    reminders = snapshot.get("reminders") if isinstance(snapshot.get("reminders"), dict) else {}
    bootstrap = snapshot.get("bootstrap") if isinstance(snapshot.get("bootstrap"), dict) else {}

    lines: list[str] = []
    if not bootstrap.get("complete"):
        lines.append("Profile setup is not complete.")
    quiet = snapshot.get("quiet_hours") if isinstance(snapshot.get("quiet_hours"), dict) else {}
    if quiet:
        lines.append(f"Quiet hours: {_coerce_text(quiet.get('label'))}")

    running = int(queue.get("running_now_count") or 0)
    waiting = int(queue.get("queued_count") or 0)
    blocked = int(queue.get("blocked_on_approval_count") or 0)
    pending = int(queue.get("pending_wakeup_count") or 0)
    if any([running, waiting, blocked, pending]):
        parts = []
        if running:
            parts.append(f"{running} running")
        if waiting:
            parts.append(f"{waiting} waiting")
        if blocked:
            parts.append(f"{blocked} need approval")
        if pending:
            parts.append(f"{pending} pending wakeups")
        lines.append("Queue: " + ", ".join(parts))

    reminder_count = int(reminders.get("count") or 0)
    if reminder_count:
        lines.append(f"{reminder_count} scheduled reminder(s)")

    next_action = snapshot.get("next_scheduled_action")
    if isinstance(next_action, dict) and next_action.get("label"):
        lines.append(f"Next: {_coerce_text(next_action.get('label'))}")

    return "\n".join(lines) if lines else ""


def _build_prompt_envelope(
    *,
    workspace_id: str,
    message: str,
    system_prompt: str,
) -> dict:
    return {
        "system_prompt": secret_redaction_service.redact_text(system_prompt),
        "user_message": secret_redaction_service.redact_text(message),
        "context": {
            "workspace_id": workspace_id,
            "source": "sage_chat",
        },
    }


def _skill_capability(skill: Any) -> str:
    action_class = _coerce_text(getattr(skill, "action_class", "")).lower()
    scopes = {
        _coerce_text(scope).lower().replace("-", "_")
        for scope in (getattr(skill, "connector_scopes", ()) or ())
        if _coerce_text(scope)
    }
    if action_class == "execute":
        return CAPABILITY_TERMINAL_COMMAND
    if scopes & _COMMUNICATION_SCOPES:
        return CAPABILITY_COMMUNICATION_SEND
    if scopes & _MEMORY_SCOPES:
        return CAPABILITY_MEMORY_WRITE
    if scopes & _CLOUD_STORAGE_SCOPES:
        return CAPABILITY_CLOUD_STORAGE_ACCESS
    if scopes & _FILE_SCOPES:
        return CAPABILITY_FILE_WRITE
    return CAPABILITY_APP_CONTROL


def _skill_target_channel(skill: Any) -> str:
    scopes = [
        _coerce_text(scope).lower().replace("-", "_")
        for scope in (getattr(skill, "connector_scopes", ()) or ())
        if _coerce_text(scope)
    ]
    for scope in scopes:
        if scope in _COMMUNICATION_SCOPES:
            return scope
    return ""


def _build_agent_computer_decision_for_skill(
    *,
    workspace_id: str,
    actor_user_id: str,
    skill: Any,
    triggered_by: str,
    message: str,
) -> dict:
    """Classify Sage's requested connected-computer action before approval.

    Sage chat is a pre-execution surface: this builds the same decision envelope
    the Gateway path uses, but does not consume remembered approvals yet.
    """
    capability = _skill_capability(skill)
    policy = build_default_agent_computer_policy(
        autonomy_mode=AUTONOMY_ASK_EVERY_TIME,
        policy_id=f"sage-chat:{workspace_id}",
    )
    decision = decide_agent_computer_action(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id or "owner",
        agent_id=SAGE_MAIN_AGENT_ID,
        policy=policy,
        capability=capability,
        action_class=_coerce_text(getattr(skill, "action_class", "")),
        target_channel=_skill_target_channel(skill),
        payload={
            "surface": "sage_chat",
            "skill_id": _coerce_text(getattr(skill, "id", "")),
            "skill_label": _coerce_text(getattr(skill, "label", "")),
            "action_class": _coerce_text(getattr(skill, "action_class", "")),
            "triggered_by": triggered_by,
            "user_message": message,
        },
        current_kill_state=(
            "active"
            if kill_switch_gate.evaluate_kill_switch(
                workspace_id=workspace_id,
                agent_id=SAGE_MAIN_AGENT_ID,
            ).blocked
            else None
        ),
        consume_approval_memory=False,
    )
    return decision.as_dict()


def _create_approval_for_blocked_action(
    *,
    workspace_id: str,
    tenant_id: str,
    trace_id: str,
    skill_id: str,
    label: str,
    action_class: str,
    requester_actor: str = "",
) -> dict | None:
    """Create a pending approval record for a blocked tool action.

    Returns the approval metadata dict for the response, or None if persistence fails.
    Fail-closed: if the write fails, the action stays blocked.
    """
    try:
        record = create_approval(
            workspace_id=workspace_id,
            tenant_id=tenant_id,
            trace_id=trace_id,
            action="channel_send_draft",
            description=f"Approve {label} ({action_class}) action",
            action_payload={
                "channel": "sage_chat",
                "recipient": requester_actor or "owner",
                "message_text": f"Approved action for {label}",
                "skill_id": skill_id,
                "label": label,
                "action_class": action_class,
            },
            requester_actor=requester_actor,
        )
        return {
            "type": "tool_action",
            "skill_id": skill_id,
            "label": label,
            "action_class": action_class,
            "reason": "Requires explicit owner approval before write/execute action.",
            "approval_token": record.approval_token,
            "status": record.status,
            "action": record.action,
            "description": record.description,
            "expires_at": record.expires_at,
        }
    except RuntimeError:
        return None


def _dedupe_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in tools:
        if not isinstance(item, dict):
            continue
        name = _coerce_text(item.get("name"))
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(item)
    return out


def _tool_requires_agent_computer(tool_name: str) -> bool:
    normalized = _coerce_text(tool_name)
    return normalized in _AGENT_COMPUTER_TOOL_NAMES or normalized.startswith(_AGENT_COMPUTER_TOOL_PREFIXES)


def _summarize_tool_output(value: Any, *, max_chars: int = _SAGE_TOOL_RESULT_MAX_CHARS) -> str:
    text = secret_redaction_service.redact_text(str(value or "").replace("\0", "")).strip()
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rstrip()}\n...[truncated]"


def _direct_tool_bundle(*, workspace_id: str, provider: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    try:
        tool_capabilities = direct_chat_runtime_exports.resolve_workspace_tool_capabilities(workspace_id)
    except Exception:
        tool_capabilities = []
    try:
        availability = direct_chat_runtime_exports._resolve_direct_chat_availability(
            workspace_id,
            requested_provider=provider,
        )
    except Exception:
        availability = {}

    tools: list[dict[str, Any]] = []
    try:
        tools.extend(direct_chat_runtime_exports._build_direct_chat_tools(tool_capabilities))
    except Exception:
        pass
    try:
        tools.extend(direct_chat_runtime_exports._build_local_direct_chat_tools(availability))
    except Exception:
        pass
    try:
        tools.extend(direct_chat_runtime_exports._build_builtin_direct_chat_tools())
    except Exception:
        pass

    runtime_ready = bool(
        availability.get("runtime_ok")
        or availability.get("local_gateway_online")
        or availability.get("local_worker_online")
    )
    if not runtime_ready:
        tools = [tool for tool in tools if not _tool_requires_agent_computer(_coerce_text(tool.get("name")))]
    return _dedupe_tools(tools), tool_capabilities, availability


def _plan_sage_direct_tool_calls(
    *,
    message: str,
    tools: list[dict[str, Any]],
    services: no_provider_service.NoProviderExecutionServices,
) -> list[dict[str, Any]]:
    compact = services.compact_text(message)
    tool_names = {_coerce_text(item.get("name")) for item in tools if isinstance(item, dict)}
    url = services.extract_first_url(message)
    browser_requested = bool(
        url
        and any(
            token in compact
            for token in (
                "browser",
                "go to",
                "open",
                "visit",
                "click",
                "fill",
                "page title",
                "main heading",
                "screenshot",
                "screen shot",
            )
        )
    )
    if url and not browser_requested and "web__fetch" in tool_names and (
        "fetch" in compact or "read" in compact or "summarize" in compact or "check" in compact
    ):
        return [{"name": "web__fetch", "arguments": {"url": url}}]

    planned = no_provider_service.plan_tool_calls(
        message,
        tools,
        compact_text=services.compact_text,
        extract_first_path_reference=services.extract_first_path_reference,
        extract_first_url=services.extract_first_url,
    )
    return [item for item in planned if isinstance(item, dict) and _coerce_text(item.get("name")) in tool_names]


def _blocked_agent_computer_tool_for_message(message: str, availability: dict[str, Any]) -> dict[str, Any] | None:
    if availability.get("runtime_ok") or availability.get("local_gateway_online") or availability.get("local_worker_online"):
        return None
    compact = " ".join(str(message or "").lower().split())
    if direct_chat_tool_catalog_service.message_has_browser_automation_intent(message):
        return {"name": "browser__navigate", "reason": "agent_computer_unavailable", "status": "blocked"}
    if any(
        token in compact
        for token in (
            "shell command",
            "terminal command",
            "run command",
            "execute command",
            "screenshot",
            "screen shot",
            "read file",
            "write file",
        )
    ):
        return {"name": "hardware__action", "reason": "agent_computer_unavailable", "status": "blocked"}
    return None


def _matching_mcp_skill(*, workspace_id: str, message: str) -> Any | None:
    compact = " ".join(str(message or "").lower().split())
    if not compact:
        return None
    candidates = [
        skill
        for skill in list_skill_definitions(workspace_id=workspace_id, include_disabled=False)
        if _coerce_text(getattr(skill, "execution_adapter", "")).lower() == "mcp_tool"
    ]
    if not candidates:
        return None
    for skill in candidates:
        terms = {
            _coerce_text(getattr(skill, "id", "")).lower(),
            _coerce_text(getattr(skill, "label", "")).lower(),
            *[
                _coerce_text(term).lower()
                for term in (getattr(skill, "trigger_terms", ()) or ())
                if _coerce_text(term)
            ],
        }
        if any(term and term in compact for term in terms):
            return skill
    if len(candidates) == 1 and "mcp" in compact:
        return candidates[0]
    return None


def _message_might_need_sage_action_loop(message: str) -> bool:
    compact = " ".join(str(message or "").lower().split())
    if not compact:
        return False
    if "mcp" in compact:
        return True
    if direct_chat_tool_catalog_service.message_has_web_lookup_intent(message):
        return True
    if direct_chat_tool_catalog_service.message_has_browser_automation_intent(message):
        return True
    if any(
        token in compact
        for token in (
            "fetch http",
            "fetch https",
            "read http",
            "read https",
            "summarize http",
            "summarize https",
            "shell command",
            "terminal command",
            "run command",
            "execute command",
            "screenshot",
            "screen shot",
            "read file",
            "write file",
            "current working directory",
            "current directory",
            "cwd",
        )
    ):
        return True
    return False


async def _run_sage_action_loop_v1(
    *,
    workspace_id: str,
    tenant_id: str,
    message: str,
    provider: str,
    model: str,
    credentials: dict[str, Any],
    trace_id: str,
    actor_user_id: str,
    normalized_channel_context: dict[str, str],
) -> dict[str, Any] | None:
    tools, tool_capabilities, availability = _direct_tool_bundle(workspace_id=workspace_id, provider=provider)
    try:
        services = direct_chat_runtime_exports._no_provider_execution_services()
    except Exception:
        services = None
    blocked_tools: list[dict[str, Any]] = []
    tool_calls: list[dict[str, Any]] = []
    outputs: list[str] = []
    session_ctx = {
        "tenant_id": tenant_id or "default",
        "workspace_id": workspace_id,
        "thread_id": trace_id,
        "metadata": {
            "source": "sage_chat",
            "surface": "sage",
            "trace_id": trace_id,
            "agent_scope": "sage",
            "sage_agent_id": SAGE_MAIN_AGENT_ID,
            "channel_context": normalized_channel_context or None,
        },
        "agent_turn_request": {
            "tenant_id": tenant_id or "default",
            "workspace_id": workspace_id,
            "thread_id": trace_id,
            "session_id": trace_id,
            "policy_context": {
                "agent_scope": "sage",
                "agent_id": SAGE_MAIN_AGENT_ID,
            },
            "context_hints": {
                "metadata": {
                    "source": "sage_chat",
                    "trace_id": trace_id,
                    "user_id": actor_user_id or None,
                }
            },
        },
    }

    direct_tool_calls: list[dict[str, Any]] = []
    if services is not None:
        direct_tool_calls = _plan_sage_direct_tool_calls(
            message=message,
            tools=tools,
            services=services,
        )
        if not direct_tool_calls:
            blocked = _blocked_agent_computer_tool_for_message(message, availability)
            if blocked is not None:
                blocked_tools.append(blocked)

    mcp_skill = _matching_mcp_skill(workspace_id=workspace_id, message=message)
    if not direct_tool_calls and mcp_skill is None and not blocked_tools:
        return None

    if direct_tool_calls and services is not None:
        approval_payload = direct_chat_runtime_exports._build_direct_tool_approval_response(
            tool_calls=direct_tool_calls,
            tool_capabilities=tool_capabilities,
            session_ctx=session_ctx,
        )
        if approval_payload is not None:
            approvals = list(approval_payload.get("approvals") or [])
            return {
                "message": "Approval is required before Sage can run that action.",
                "tool_calls": [
                    {
                        "name": _coerce_text(call.get("name")),
                        "arguments": call.get("arguments") if isinstance(call.get("arguments"), dict) else {},
                        "status": "approval_required",
                    }
                    for call in direct_tool_calls
                ],
                "blocked_tools": [],
                "approvals_required": approvals,
                "action_execution_mode": "approval_required",
                "available_tools": tools,
            }
        for index, call in enumerate(direct_tool_calls, start=1):
            tool_name = _coerce_text(call.get("name"))
            arguments = call.get("arguments") if isinstance(call.get("arguments"), dict) else {}
            try:
                output = direct_chat_runtime_exports._execute_single_direct_tool_call(
                    tool_call=call,
                    workspace_id=workspace_id,
                    thread_id=trace_id,
                    index=index,
                    provider=provider,
                    model=model,
                    credentials=credentials,
                    reasoning_effort="",
                    session_ctx=session_ctx,
                )
                summary = _summarize_tool_output(output)
                tool_calls.append({
                    "name": tool_name,
                    "arguments": arguments,
                    "status": "completed",
                    "output": summary,
                })
                if summary:
                    outputs.append(summary)
            except Exception as exc:
                error = _summarize_tool_output(str(exc), max_chars=800)
                blocked_tools.append({"name": tool_name, "reason": error or type(exc).__name__, "status": "blocked"})
                tool_calls.append({
                    "name": tool_name,
                    "arguments": arguments,
                    "status": "failed",
                    "error": error,
                })

    if mcp_skill is not None:
        skill_id = _coerce_text(getattr(mcp_skill, "id", ""))
        try:
            result = await skill_registry.execute_skill(
                skill_id=skill_id,
                tenant_id=tenant_id or "default",
                workspace_id=workspace_id,
                goal=message,
                agent_label="Sage",
                hard_context="Main Sage action loop v1.",
                operational_policy="Use approved MCP tools only; preserve Sage approval and audit policy.",
            )
            reply = _summarize_tool_output((result or {}).get("reply") or result)
            tool_calls.append({
                "name": skill_id,
                "tool_name": skill_id,
                "arguments": {"goal": message},
                "status": "completed" if str((result or {}).get("status") or "ok").lower() not in {"blocked", "failed", "error"} else "failed",
                "output": reply,
            })
            if reply:
                outputs.append(reply)
        except Exception as exc:
            error = _summarize_tool_output(str(exc), max_chars=800)
            blocked_tools.append({"name": skill_id, "reason": error or type(exc).__name__, "status": "blocked"})
            tool_calls.append({
                "name": skill_id,
                "tool_name": skill_id,
                "arguments": {"goal": message},
                "status": "failed",
                "error": error,
            })

    mode = "tools_executed" if tool_calls and not blocked_tools else "tool_blocked" if blocked_tools else "text_only"
    return {
        "message": "\n\n".join(output for output in outputs if output).strip()
        or ("Sage could not run that action because the required runtime is unavailable." if blocked_tools else "Tool execution completed."),
        "tool_calls": tool_calls,
        "blocked_tools": blocked_tools,
        "approvals_required": [],
        "action_execution_mode": mode,
        "available_tools": tools,
    }


def _emit_failed_audit_event(
    *,
    tenant_id: str,
    workspace_id: str,
    actor_user_id: str,
    actor_email: str,
    actor_auth_type: str,
    trace_id: str,
    surface: str,
    error: str,
) -> None:
    try:
        security_audit_service.emit_security_audit_event(
            action="sage_chat.failed",
            status="failed",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id or None,
            actor_email=actor_email or None,
            actor_auth_type=actor_auth_type or None,
            trace_id=trace_id,
            detail=error,
            metadata={"surface": surface, "error": error},
            idempotency_key=f"sage_chat:failed:{trace_id}",
        )
    except Exception:
        pass


async def handle_sage_chat(
    *,
    workspace_id: str,
    tenant_id: str = "",
    message: str,
    surface: str = "chat",
    mode: str = "owner_sage",
    current_user: dict | None = None,
    channel_context: dict | None = None,
) -> dict:
    normalized_workspace_id = _coerce_text(workspace_id)
    normalized_message = _coerce_text(message)
    normalized_mode = normalize_sage_mode(mode)
    normalized_surface = normalize_sage_surface(surface)
    normalized_tenant_id = _coerce_text(tenant_id)

    if not normalized_workspace_id:
        raise ValueError("workspace_id is required")
    if not normalized_message:
        raise ValueError("message must not be empty")

    trace_id = str(uuid.uuid4())
    actor_user_id = _coerce_text((current_user or {}).get("user_id"))
    actor_email = _coerce_text((current_user or {}).get("email"))
    actor_auth_type = _coerce_text((current_user or {}).get("auth_type"))

    used_context: list[str] = []
    action_execution_mode = "text_only"
    normalized_channel_context = {
        str(key): _coerce_text(value)
        for key, value in dict(channel_context or {}).items()
        if _coerce_text(key) and _coerce_text(value)
    }
    if normalized_channel_context:
        used_context.append("channel_context")

    # --- Load context ---
    profile_context = _load_profile_context(workspace_id=normalized_workspace_id)
    if profile_context:
        used_context.append("sage_profile")

    context_files_payload = _read_context_files_payload(workspace_id=normalized_workspace_id)

    memory_context = _load_memory_context(workspace_id=normalized_workspace_id)
    if memory_context:
        used_context.append("sage_memory")

    try:
        heartbeat_snapshot = await sage_heartbeat_service.build_sage_heartbeat_snapshot(
            tenant_id=normalized_tenant_id,
            workspace_id=normalized_workspace_id,
        )
    except Exception:
        heartbeat_snapshot = {}
    heartbeat_context = _build_heartbeat_summary(heartbeat_snapshot)
    if heartbeat_context:
        used_context.append("sage_heartbeat")

    safe_skills = _load_safe_skill_catalog(workspace_id=normalized_workspace_id)
    if safe_skills:
        used_context.append("sage_skills")

    # --- Call provider ---
    provider, credentials = _resolve_cloud_provider(normalized_workspace_id)

    context: dict = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "source": "sage_chat",
        "surface": normalized_surface,
        "disable_provider_fallback": True,
    }
    if normalized_channel_context:
        context["channel_context"] = normalized_channel_context
    metadata: dict = {
        "workspace_id": normalized_workspace_id,
        "provider": provider,
        "source": "sage_chat",
        "surface": normalized_surface,
        "credentials": credentials,
        "trace_id": trace_id,
    }
    if normalized_channel_context:
        metadata["channel_context"] = normalized_channel_context
    requested_model = resolve_requested_model(context, metadata, provider)

    action_result = None
    if _message_might_need_sage_action_loop(normalized_message):
        action_result = await _run_sage_action_loop_v1(
            workspace_id=normalized_workspace_id,
            tenant_id=normalized_tenant_id,
            message=normalized_message,
            provider=provider,
            model=requested_model,
            credentials=credentials,
            trace_id=trace_id,
            actor_user_id=actor_user_id,
            normalized_channel_context=normalized_channel_context,
        )
    if action_result is not None:
        if "sage_action_loop" not in used_context:
            used_context.append("sage_action_loop")
        reply = _coerce_text(action_result.get("message"))
        tool_calls = list(action_result.get("tool_calls") or [])
        blocked_tools = list(action_result.get("blocked_tools") or [])
        approvals_required = list(action_result.get("approvals_required") or [])
        action_execution_mode = _coerce_text(action_result.get("action_execution_mode")) or "tools_executed"
        prompt_diagnostics = {
            "action_loop_v1": True,
            "tool_call_count": len(tool_calls),
            "blocked_tool_count": len(blocked_tools),
            "approval_required_count": len(approvals_required),
        }

        try:
            persist_interaction(
                subject=ConversationMemorySubject(
                    workspace_id=normalized_workspace_id,
                    tenant_id=normalized_tenant_id,
                    surface_kind=DIRECT_CHAT_SURFACE,
                ),
                policy_profile=DIRECT_CHAT_PROFILE,
                user_message=normalized_message,
                assistant_reply=reply or "",
                metadata={"trace_id": trace_id, "source": "sage_chat", "channel_context": normalized_channel_context or None},
            )
        except Exception:
            pass

        try:
            await activity_ledger_service.append_activity_event(
                tenant_id=normalized_tenant_id,
                workspace_id=normalized_workspace_id,
                actor_type="user",
                actor_id=actor_user_id or "unknown",
                event_class="sage_activity",
                action="sage_chat.completed",
                trace_id=trace_id,
                title="Sage chat completed",
                summary=(normalized_message[:120] + "..." if len(normalized_message) > 120 else normalized_message),
                status="logged",
                detail_level="timeline_detail",
                metadata={
                    "used_context": used_context,
                    "provider": provider,
                    "model": requested_model or None,
                    "surface": normalized_surface,
                    "blocked_action_count": len(blocked_tools),
                    "action_execution_mode": action_execution_mode,
                    "prompt_diagnostics": prompt_diagnostics,
                    "channel_context": normalized_channel_context or None,
                },
            )
        except Exception:
            pass

        try:
            security_audit_service.emit_security_audit_event(
                action="sage_chat.completed",
                status="success" if not blocked_tools else "blocked",
                tenant_id=normalized_tenant_id,
                workspace_id=normalized_workspace_id,
                actor_user_id=actor_user_id or None,
                actor_email=actor_email or None,
                actor_auth_type=actor_auth_type or None,
                trace_id=trace_id,
                detail=f"Sage action loop completed via {action_execution_mode}",
                metadata={
                    "used_context": used_context,
                    "provider": provider,
                    "model": requested_model or None,
                    "surface": normalized_surface,
                    "tool_calls": tool_calls,
                    "blocked_tools": blocked_tools,
                    "approval_required_count": len(approvals_required),
                    "action_execution_mode": action_execution_mode,
                    "channel_context": normalized_channel_context or None,
                },
                idempotency_key=f"sage_chat:{trace_id}",
            )
        except Exception:
            pass

        try:
            transparency_events = emit_sage_turn_transparency_events(
                trace_id=trace_id,
                workspace_id=normalized_workspace_id,
                user_message=normalized_message,
                sage_result={
                    "message": reply or "",
                    "used_context": [{"name": ctx_label} for ctx_label in used_context],
                    "tool_calls": tool_calls,
                    "blocked_tools": blocked_tools,
                    "approvals_required": approvals_required,
                    "error": None,
                },
                surface=normalized_surface,
            )
        except Exception:
            transparency_events = []

        if transparency_events:
            try:
                await persist_transparency_events(
                    trace_id=trace_id,
                    tenant_id=normalized_tenant_id,
                    workspace_id=normalized_workspace_id,
                    events=[e.to_user_payload() for e in transparency_events],
                    surface=normalized_surface,
                )
            except Exception:
                pass

        return {
            "message": reply or "",
            "error": None,
            "used_context": used_context,
            "tool_calls": tool_calls,
            "available_tools": list(action_result.get("available_tools") or []) or safe_skills,
            "blocked_tools": blocked_tools,
            "approvals_required": approvals_required,
            "memory_updates": [],
            "action_execution_mode": action_execution_mode,
            "trace_id": trace_id,
            "provider": provider,
            "model": requested_model or None,
            "transparency_events": transparency_events,
        }

    # --- Build prompt ---
    instruction_bundle = sage_instruction_compiler_service.build_sage_instruction_bundle(
        workspace_id=normalized_workspace_id,
        tenant_id=normalized_tenant_id,
        user_id=actor_user_id,
        message=normalized_message,
        provider=provider,
        model=requested_model,
        root_context_files=context_files_payload,
        profile_context=profile_context,
        memory_context=memory_context,
        heartbeat_context=heartbeat_context,
    )
    prompt_diagnostics = instruction_bundle.diagnostics
    if prompt_diagnostics.get("included_root_files") or prompt_diagnostics.get("available_memory_file_count"):
        used_context.append("workspace_context_files")
    if int(prompt_diagnostics.get("capability_count") or 0) > 0:
        used_context.append("sage_capabilities")

    sage_surface_guardrails = (
        "\n\n## Sage surface boundary\n"
        "You are Sage, the user's main AI assistant inside Empyralis. "
        "Stay inside the Sage surface boundary: answer as the main agent, "
        "use only available tools, and do not claim unavailable capabilities. "
        "When the user asks a broad identity or help question like 'what can you do', "
        "explain Sage's role in the current workspace in plain language. Do not dump a "
        "tool inventory, Agent Studio agent list, or provider/runtime details unless the "
        "user explicitly asks for tools, capabilities, agents, or diagnostics.\n"
        "Follow-through rule: do not end a turn by saying you will check, inspect, look "
        "into it, or get back later. If the user asks you to check, inspect, search, read, "
        "or verify something and an available tool can do it, use that tool in this turn. "
        "If no available tool or permission can do it, say exactly what is missing and "
        "answer from current context.\n"
        "Approval rule: require explicit approval before sending messages, "
        "changing files, spending credits, controlling a computer, publishing "
        "apps, or making external changes when policy requires approval."
    )
    channel_context_prompt = ""
    if normalized_channel_context:
        channel_context_prompt = (
            "\n\n## Personal channel context\n"
            f"Surface channel: {normalized_channel_context.get('surface_channel', 'personal_channel')}\n"
            f"Sender: {normalized_channel_context.get('push_name') or normalized_channel_context.get('remote_jid') or 'unknown'}\n"
            f"Gateway: {normalized_channel_context.get('gateway_id', 'unknown')}\n"
            "This message came from a user-owned personal channel through Agent Computer. "
            "Reply naturally as Sage, but do not claim a message was sent unless the approval and dispatch layer confirms it."
        )
    envelope = _build_prompt_envelope(
        workspace_id=normalized_workspace_id,
        message=normalized_message,
        system_prompt=f"{instruction_bundle.system_prompt.rstrip()}{sage_surface_guardrails}{channel_context_prompt}",
    )

    try:
        reply, usage, attempted_providers, last_error = generate_chat_reply_with_provider_fallback(
            context,
            metadata,
            envelope["user_message"],
            envelope["system_prompt"],
            prior_messages=instruction_bundle.prior_messages or None,
        )
    except Exception as exc:
        _emit_failed_audit_event(
            tenant_id=normalized_tenant_id,
            workspace_id=normalized_workspace_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_auth_type=actor_auth_type,
            trace_id=trace_id,
            surface=normalized_surface,
            error=str(exc),
        )
        raise

    if not reply and last_error:
        _emit_failed_audit_event(
            tenant_id=normalized_tenant_id,
            workspace_id=normalized_workspace_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            actor_auth_type=actor_auth_type,
            trace_id=trace_id,
            surface=normalized_surface,
            error=last_error,
        )
        raise RuntimeError(last_error)

    attempted = [p.strip() for p in _coerce_text(attempted_providers).split(",") if p.strip()]
    effective_provider = attempted[-1] if attempted else provider
    effective_model = _coerce_text((usage or {}).get("model")) or requested_model

    # --- Persist interaction ---
    memory_subject = ConversationMemorySubject(
        workspace_id=normalized_workspace_id,
        tenant_id=normalized_tenant_id,
        surface_kind=DIRECT_CHAT_SURFACE,
    )
    try:
        persist_interaction(
            subject=memory_subject,
            policy_profile=DIRECT_CHAT_PROFILE,
            user_message=normalized_message,
            assistant_reply=reply or "",
            metadata={"trace_id": trace_id, "source": "sage_chat", "channel_context": normalized_channel_context or None},
        )
    except Exception:
        pass

    # --- Emit activity ---
    try:
        await activity_ledger_service.append_activity_event(
            tenant_id=normalized_tenant_id,
            workspace_id=normalized_workspace_id,
            actor_type="user",
            actor_id=actor_user_id or "unknown",
            event_class="sage_activity",
            action="sage_chat.completed",
            trace_id=trace_id,
            title="Sage chat completed",
            summary=(normalized_message[:120] + "..." if len(normalized_message) > 120 else normalized_message),
            status="logged",
            detail_level="timeline_detail",
            metadata={
                "used_context": used_context,
                "provider": effective_provider,
                "model": effective_model or None,
                "surface": normalized_surface,
                "blocked_action_count": 0,
                "action_execution_mode": action_execution_mode,
                "prompt_diagnostics": prompt_diagnostics,
                "channel_context": normalized_channel_context or None,
            },
        )
    except Exception:
        pass

    # --- Emit security audit ---
    try:
        security_audit_service.emit_security_audit_event(
            action="sage_chat.completed",
            status="success",
            tenant_id=normalized_tenant_id,
            workspace_id=normalized_workspace_id,
            actor_user_id=actor_user_id or None,
            actor_email=actor_email or None,
            actor_auth_type=actor_auth_type or None,
            trace_id=trace_id,
            detail=f"Sage chat turn completed via {effective_provider}",
            metadata={
                "used_context": used_context,
                "provider": effective_provider,
                "model": effective_model or None,
                "surface": normalized_surface,
                "blocked_action_count": 0,
                "action_execution_mode": action_execution_mode,
                "prompt_diagnostics": prompt_diagnostics,
                "channel_context": normalized_channel_context or None,
            },
            idempotency_key=f"sage_chat:{trace_id}",
        )
    except Exception:
        pass

    # ── Emit transparency events ──────────────────────────────────
    try:
        transparency_events = emit_sage_turn_transparency_events(
            trace_id=trace_id,
            workspace_id=normalized_workspace_id,
            user_message=normalized_message,
            sage_result={
                "message": reply or "",
                "used_context": [
                    {"name": ctx_label} for ctx_label in used_context
                ],
                "tool_calls": [],
                "blocked_tools": [],
                "approvals_required": [],
                "error": None,
            },
            surface=normalized_surface,
        )
    except Exception:
        transparency_events = []

    # Best-effort persistence — failure never breaks the response
    if transparency_events:
        try:
            payloads = [e.to_user_payload() for e in transparency_events]
            await persist_transparency_events(
                trace_id=trace_id,
                tenant_id=normalized_tenant_id,
                workspace_id=normalized_workspace_id,
                events=payloads,
                surface=normalized_surface,
            )
        except Exception:
            pass

    return {
        "message": reply or "",
        "error": None,
        "used_context": used_context,
        "tool_calls": [],
        "available_tools": safe_skills,
        "blocked_tools": [],
        "approvals_required": [],
        "memory_updates": [],
        "action_execution_mode": action_execution_mode,
        "trace_id": trace_id,
        "provider": effective_provider,
        "model": effective_model or None,
        "transparency_events": transparency_events,
    }
