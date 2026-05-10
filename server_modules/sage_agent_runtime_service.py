from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from server_modules import (
    activity_ledger_service,
    sage_heartbeat_service,
    sage_memory_service,
    sage_profile_service,
    secret_redaction_service,
    security_audit_service,
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
from server_modules.skill_registry import list_skill_definitions

ALLOWED_MODES = {"owner_sage"}
CLOUD_PROVIDER_IDS = ("anthropic", "deepseek", "openai", "gemini")

SAFE_ACTION_CLASSES = {"read"}
BLOCKED_ACTION_CLASSES = {"write", "execute"}


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
    ordered = ("SOUL.md", "USER.md", "IDENTITY.md", "HEARTBEAT.md", "MEMORY.md")
    sections: list[str] = []
    for filename in ordered:
        content = _coerce_text(files.get(filename))
        if content:
            sections.append(content)
    return "\n\n".join(sections)


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


def _build_system_prompt(
    *,
    workspace_id: str,
    profile_context: str,
    context_files: str,
    memory_context: str,
    heartbeat_context: str,
    safe_skills: list[dict],
) -> str:
    parts: list[str] = []

    if context_files:
        parts.append(context_files)
    else:
        parts.append(
            "You are Sage, a calm personal assistant inside the Empyralis platform. "
            "Your job is to help the user with clear, useful, and thoughtful replies."
        )

    if profile_context:
        parts.append("## User Profile\n" + profile_context)

    if memory_context:
        parts.append("## Sage Memory\n" + memory_context)

    if heartbeat_context:
        parts.append("## Current State\n" + heartbeat_context)

    if safe_skills:
        skill_lines = ["## Available Capabilities"]
        for skill in safe_skills:
            skill_lines.append(f"- {skill['label']}: {skill['description']}")
        parts.append("\n".join(skill_lines))

    parts.append(
        "\nYou are a personal assistant (Sage), not a Studio agent. "
        "You do not serve external customers. "
        "You cannot send messages, edit files, execute shell commands, mutate browser state, "
        "or write to external connectors on your own. "
        "If the user asks for an action that requires write or execute permissions, "
        "tell them it requires explicit approval and explain what you would do."
    )

    return "\n\n".join(parts).strip()


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


async def handle_sage_chat(
    *,
    workspace_id: str,
    tenant_id: str = "",
    message: str,
    surface: str = "chat",
    mode: str = "owner_sage",
    current_user: dict | None = None,
) -> dict:
    normalized_workspace_id = _coerce_text(workspace_id)
    normalized_message = _coerce_text(message)
    normalized_mode = _coerce_text(mode)
    normalized_tenant_id = _coerce_text(tenant_id)

    if not normalized_workspace_id:
        raise ValueError("workspace_id is required")
    if not normalized_message:
        raise ValueError("message must not be empty")
    if normalized_mode not in ALLOWED_MODES:
        raise ValueError(f"Unsupported mode: {normalized_mode}")

    trace_id = str(uuid.uuid4())
    actor_user_id = _coerce_text((current_user or {}).get("user_id"))
    actor_email = _coerce_text((current_user or {}).get("email"))
    actor_auth_type = _coerce_text((current_user or {}).get("auth_type"))

    used_context: list[str] = []
    blocked_actions: list[dict] = []
    approvals_required: list[dict] = []

    # --- Load context ---
    profile_context = _load_profile_context(workspace_id=normalized_workspace_id)
    if profile_context:
        used_context.append("sage_profile")

    context_files = _load_context_files(workspace_id=normalized_workspace_id)
    if context_files:
        used_context.append("workspace_context_files")

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

    # --- Safety: redact secrets, check for blocked tool requests ---
    all_skills = list_skill_definitions(workspace_id=normalized_workspace_id, include_disabled=False)
    for skill in all_skills:
        if not skill.enabled or not skill.available:
            continue
        if skill.action_class in BLOCKED_ACTION_CLASSES:
            for term in skill.trigger_terms:
                if term and term in normalized_message.lower():
                    blocked = {
                        "skill_id": skill.id,
                        "label": skill.label,
                        "action_class": skill.action_class,
                        "triggered_by": term,
                    }
                    blocked_actions.append(blocked)
                    approvals_required.append({
                        "type": "tool_action",
                        "skill_id": skill.id,
                        "label": skill.label,
                        "action_class": skill.action_class,
                        "reason": "Requires explicit owner approval before write/execute action.",
                    })
                    break

    # --- Build prompt ---
    system_prompt = _build_system_prompt(
        workspace_id=normalized_workspace_id,
        profile_context=profile_context,
        context_files=context_files,
        memory_context=memory_context,
        heartbeat_context=heartbeat_context,
        safe_skills=safe_skills,
    )

    envelope = _build_prompt_envelope(
        workspace_id=normalized_workspace_id,
        message=normalized_message,
        system_prompt=system_prompt,
    )

    # --- Call provider ---
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
        envelope["user_message"],
        envelope["system_prompt"],
        prior_messages=None,
    )

    if not reply and last_error:
        raise RuntimeError(last_error)

    attempted = [p.strip() for p in _coerce_text(attempted_providers).split(",") if p.strip()]
    effective_provider = attempted[-1] if attempted else provider
    effective_model = _coerce_text((usage or {}).get("model"))

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
            metadata={"trace_id": trace_id, "source": "sage_chat"},
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
                "surface": _coerce_text(surface),
                "blocked_action_count": len(blocked_actions),
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
                "surface": _coerce_text(surface),
                "blocked_action_count": len(blocked_actions),
            },
            idempotency_key=f"sage_chat:{trace_id}",
        )
    except Exception:
        pass

    # --- Emit audit for blocked actions ---
    for blocked in blocked_actions:
        try:
            security_audit_service.emit_security_audit_event(
                action="sage_chat.tool_blocked",
                status="blocked",
                tenant_id=normalized_tenant_id,
                workspace_id=normalized_workspace_id,
                actor_user_id=actor_user_id or None,
                trace_id=trace_id,
                detail=f"Blocked {blocked['action_class']} skill: {blocked['label']}",
                metadata=blocked,
            )
        except Exception:
            pass

    return {
        "message": reply or "",
        "used_context": used_context,
        "tool_calls": [],
        "available_tools": safe_skills,
        "blocked_tools": blocked_actions,
        "approvals_required": approvals_required,
        "memory_updates": [],
        "trace_id": trace_id,
        "provider": effective_provider,
        "model": effective_model or None,
    }
