from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from server_modules import (
    artifact_service,
    direct_chat_provider_service,
    empyralis_model_tier_contract,
    empyralis_model_tier_routing_service,
    entitlements_service,
    provider_profiles,
)

TEXT_ATTACHMENT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".tsv",
    ".xml",
    ".yaml",
    ".yml",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".sh",
    ".sql",
}
MAX_ATTACHMENT_CONTEXT_CHARS = 12000
MAX_ATTACHMENT_CONTEXT_PER_FILE_CHARS = 4000


def _attachment_context_block(attachments: Any, *, workspace_id: str) -> str:
    if not isinstance(attachments, list) or not attachments:
        return ""
    blocks: List[str] = []
    consumed = 0
    normalized_workspace_id = str(workspace_id or "").strip()
    for attachment in attachments:
        uri = str(getattr(attachment, "uri", "") or "").strip()
        name = str(getattr(attachment, "name", "") or "").strip()
        metadata = getattr(attachment, "metadata", None)
        metadata = metadata if isinstance(metadata, dict) else {}
        artifact_id = (
            str(metadata.get("artifact_id") or "").strip()
            or str(artifact_service.artifact_id_from_reference(uri) or "").strip()
        )
        if not artifact_id:
            continue
        payload = artifact_service.load_artifact_metadata_by_id(artifact_id)
        if not isinstance(payload, dict):
            continue
        artifact_workspace_id = str(payload.get("workspace_id") or "").strip()
        if normalized_workspace_id and artifact_workspace_id and artifact_workspace_id != normalized_workspace_id:
            continue
        file_name = (
            name
            or str(payload.get("file_name") or "").strip()
            or str(payload.get("label") or "").strip()
            or artifact_id
        )
        content_type = artifact_service.artifact_content_type(payload, file_name)
        suffix = file_name.lower().rsplit(".", 1)
        extension = f".{suffix[-1]}" if len(suffix) > 1 else ""
        line = f"- {file_name} ({content_type or 'file'}, artifact_id={artifact_id})"
        text_preview = ""
        if content_type.startswith("text/") or extension in TEXT_ATTACHMENT_EXTENSIONS:
            path = artifact_service.resolve_artifact_content_path_by_id(artifact_id)
            if path is not None:
                try:
                    text_preview = path.read_text(encoding="utf-8", errors="replace").strip()
                except Exception:
                    text_preview = ""
        if text_preview:
            remaining = MAX_ATTACHMENT_CONTEXT_CHARS - consumed
            if remaining <= 0:
                break
            excerpt = text_preview[: min(MAX_ATTACHMENT_CONTEXT_PER_FILE_CHARS, remaining)].rstrip()
            consumed += len(excerpt)
            blocks.append(f"{line}\n```text\n{excerpt}\n```")
        else:
            blocks.append(line)
    if not blocks:
        return ""
    return "Attached files for this turn:\n" + "\n".join(blocks)
from server_modules import session_transcript_store
from server_modules.conversation_memory_policy import (
    DIRECT_CHAT_PROFILE,
    build_model_aware_memory_policy,
    get_memory_policy_profile,
)


@dataclass(slots=True)
class PreparedDirectChatRequest:
    normalized_message: str
    normalized_workspace_id: str
    normalized_thread_id: str
    session_key: str
    normalized_requested_provider: str
    normalized_requested_model: str
    normalized_reasoning_effort: Optional[str]
    compaction: Dict[str, Any]
    compacted_prior_messages: List[Dict[str, Any]]
    proactive_suggestions: List[str]
    tool_loop_session_key: str
    availability_payload: Dict[str, Any]
    connected_systems: List[str]
    tool_capabilities: List[Dict[str, Any]]
    tools: List[Dict[str, Any]]
    approved_action_payload: Optional[Dict[str, str]]
    base_context_used: Dict[str, Any]
    slash_command_name: str
    slash_remainder: str
    resolved_chat_max_iterations: int


def _highest_allowed_empyralis_tier(
    tier_policy: Dict[str, Any],
) -> Optional[str]:
    tiers = tier_policy.get("tiers") if isinstance(tier_policy.get("tiers"), dict) else {}
    for candidate in ("max", "pro", "light"):
        record = tiers.get(candidate) if isinstance(tiers, dict) else None
        if isinstance(record, dict) and bool(record.get("enabled")):
            return candidate
    return None


def _availability_local_tools_available(availability: Dict[str, Any]) -> bool:
    if not isinstance(availability, dict):
        return False
    capability_truth = availability.get("capability_truth")
    if isinstance(capability_truth, dict):
        my_computer = capability_truth.get("my_computer")
        if isinstance(my_computer, dict) and "local_tools_available" in my_computer:
            return bool(my_computer.get("local_tools_available"))
    return (
        str(availability.get("connection_mode") or "").strip().lower() == "local_companion"
        and bool(availability.get("local_gateway_online"))
    )


def _filter_builtin_tools_for_availability(
    tools: List[Dict[str, Any]],
    availability: Dict[str, Any],
) -> List[Dict[str, Any]]:
    if _availability_local_tools_available(availability):
        return tools
    return [
        tool
        for tool in tools
        if str(tool.get("name") or "").strip() != "hardware__action"
    ]


def prepare_direct_chat_request(
    *,
    resolved_turn_request: Optional[Any],
    session_ctx: Optional[Dict[str, Any]],
    message: str,
    workspace_id: str,
    thread_id: str,
    requested_model: str,
    requested_provider: str,
    prior_messages: Optional[List[Dict[str, Any]]],
    reasoning_effort: str,
    availability: Optional[Dict[str, Any]],
    approved_action: Optional[Dict[str, Any]],
    max_iterations: Optional[int],
    direct_chat_session_key_fn: Callable[[str, str], str],
    resolved_chat_iteration_limit_fn: Callable[[Any], int],
    session_model_preference_fn: Callable[[str], Dict[str, Optional[str]]],
    normalize_reasoning_effort_fn: Callable[[str], Optional[str]],
    parse_slash_command_fn: Callable[[str], Dict[str, str]],
    set_session_model_preference_fn: Callable[..., None],
    mark_thread_cleared_fn: Callable[[str], None],
    normalize_prior_messages_fn: Callable[[Optional[List[Dict[str, Any]]]], List[Dict[str, Any]]],
    consume_thread_cleared_fn: Callable[[str], bool],
    compact_conversation_history_fn: Callable[..., Dict[str, Any]],
    build_proactive_suggestions_fn: Callable[[str], List[str]],
    direct_tool_session_key_fn: Callable[[str, str], str],
    resolve_direct_chat_availability_fn: Callable[[str, str, Optional[Dict[str, Any]]], Dict[str, Any]],
    connected_system_labels_fn: Callable[[Dict[str, Any]], List[str]],
    context_tool_capabilities_fn: Callable[[Dict[str, Any]], List[Dict[str, Any]]],
    build_direct_chat_tools_fn: Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]],
    build_local_direct_chat_tools_fn: Callable[[Dict[str, Any]], List[Dict[str, Any]]],
    build_builtin_direct_chat_tools_fn: Callable[[], List[Dict[str, Any]]],
    normalize_direct_approved_action_fn: Callable[[Any], Optional[Dict[str, str]]],
    build_context_used_fn: Callable[..., Dict[str, Any]],
    direct_chat_compaction_token_limit: int,
) -> PreparedDirectChatRequest:
    resolved_turn_metadata = (
        resolved_turn_request.context_hints.get("metadata")
        if resolved_turn_request is not None and isinstance(getattr(resolved_turn_request, "context_hints", None), dict)
        and isinstance(resolved_turn_request.context_hints.get("metadata"), dict)
        else {}
    )
    normalized_message = (
        str(resolved_turn_request.message or "").strip()
        if resolved_turn_request is not None
        else str(message or "").strip()
    )
    normalized_workspace_id = (
        str(resolved_turn_request.workspace_id or "default").strip() or "default"
        if resolved_turn_request is not None
        else str(workspace_id or "default").strip() or "default"
    )
    normalized_thread_id = (
        str(resolved_turn_request.session_id or "").strip()
        if resolved_turn_request is not None
        else str(thread_id or "").strip()
    )
    if resolved_turn_request is not None:
        attachment_context = _attachment_context_block(
            list(resolved_turn_request.attachments or []),
            workspace_id=normalized_workspace_id,
        )
        if attachment_context:
            normalized_message = f"{normalized_message}\n\n{attachment_context}".strip()
    session_key = direct_chat_session_key_fn(normalized_workspace_id, normalized_thread_id)
    normalized_requested_provider = str(requested_provider or "").strip().lower()
    normalized_requested_model = str(requested_model or "").strip()
    current_turn_requested_provider = bool(normalized_requested_provider)
    current_turn_requested_model = bool(normalized_requested_model)
    resolved_chat_max_iterations = resolved_chat_iteration_limit_fn(max_iterations)

    session_model_preference = session_model_preference_fn(session_key)
    if not current_turn_requested_provider and session_model_preference.get("provider"):
        normalized_requested_provider = str(session_model_preference.get("provider") or "").strip().lower()
    if not current_turn_requested_model and session_model_preference.get("model"):
        normalized_requested_model = str(session_model_preference.get("model") or "").strip()

    normalized_reasoning_effort = normalize_reasoning_effort_fn(reasoning_effort)
    slash_command = parse_slash_command_fn(normalized_message)
    slash_command_name = str(slash_command.get("command") or "").strip().lower()
    slash_remainder = str(slash_command.get("remainder") or "").strip()
    if slash_command_name == "model":
        model_parts = slash_remainder.split(None, 1) if slash_remainder else []
        selected_model_token = str(model_parts[0] or "").strip() if model_parts else ""
        trailing_content = str(model_parts[1] or "").strip() if len(model_parts) > 1 else ""
        selected_provider = normalized_requested_provider or None
        selected_model = selected_model_token
        if ":" in selected_model_token:
            provider_token, model_token = selected_model_token.split(":", 1)
            selected_provider = str(provider_token or "").strip().lower() or selected_provider
            selected_model = str(model_token or "").strip()
        if selected_provider:
            normalized_requested_provider = selected_provider
        if selected_model:
            normalized_requested_model = selected_model
        if selected_provider or selected_model:
            set_session_model_preference_fn(
                session_key,
                provider=normalized_requested_provider or None,
                model=normalized_requested_model or None,
            )
        if trailing_content:
            normalized_message = trailing_content
            slash_command_name = ""
            slash_remainder = ""
    elif slash_command_name == "clear" and slash_remainder:
        mark_thread_cleared_fn(session_key)
        normalized_message = slash_remainder
        slash_command_name = ""
        slash_remainder = ""

    selected_model_unavailable_tier = ""
    selected_model_unavailable_model = ""
    selected_model_unavailable_reason = ""
    migrated_public_tier = empyralis_model_tier_routing_service.infer_migrated_public_tier_from_legacy_selection(
        requested_provider=normalized_requested_provider,
        requested_model=normalized_requested_model,
        metadata=resolved_turn_metadata,
    )
    empyralis_tier_route = empyralis_model_tier_routing_service.resolve_requested_empyralis_tier(
        requested_provider=normalized_requested_provider,
        requested_model=normalized_requested_model,
        metadata={
            **resolved_turn_metadata,
            **(
                {"public_tier": migrated_public_tier}
                if migrated_public_tier
                else {}
            ),
        },
    )
    if empyralis_tier_route:
        requested_public_tier = empyralis_model_tier_contract.normalize_model_tier(
            empyralis_tier_route.get("public_tier") or normalized_requested_model or "pro",
            fallback="pro",
        )
        requested_tier_contract = empyralis_model_tier_contract.model_tier_contract(requested_public_tier)
        if requested_tier_contract.user_owned:
            if requested_public_tier == "local_ai":
                normalized_requested_provider = "ollama"
                normalized_requested_model = (
                    normalized_requested_model
                    or str(provider_profiles.provider_catalog_entry("ollama").get("default_model") or "").strip()
                )
            if requested_public_tier == "my_ai_account" and not normalized_requested_provider:
                normalized_requested_provider = "openai-codex"
            if not normalized_requested_provider and requested_public_tier == "my_api_key":
                normalized_requested_provider = "openai"
            if not normalized_requested_model and normalized_requested_provider:
                normalized_requested_model = str(
                    provider_profiles.provider_catalog_entry(normalized_requested_provider).get("default_model") or ""
                ).strip()
            if not normalized_reasoning_effort:
                normalized_reasoning_effort = normalize_reasoning_effort_fn(
                    str(requested_tier_contract.reasoning_effort or "")
                )
        else:
            normalized_requested_provider = str(empyralis_tier_route.get("provider") or "").strip().lower()
            normalized_requested_model = str(empyralis_tier_route.get("model") or "").strip()
            if not normalized_reasoning_effort:
                normalized_reasoning_effort = normalize_reasoning_effort_fn(
                    str(empyralis_tier_route.get("reasoning_effort") or "")
                )
        try:
            tier_policy = entitlements_service.chat_model_tier_policy_for_workspace_id(
                workspace_id=normalized_workspace_id,
            )
        except Exception:
            tier_policy = {
                "tiers": {
                    "light": {"enabled": True},
                    "pro": {"enabled": True},
                    "max": {"enabled": True},
                }
            }

        requested_tier_record = (
            tier_policy.get("tiers", {}).get(requested_public_tier)
            if isinstance(tier_policy.get("tiers"), dict)
            else None
        )
        requested_tier_enabled = bool(
            isinstance(requested_tier_record, dict)
            and requested_tier_record.get("enabled")
        )
        if (
            requested_public_tier in empyralis_model_tier_contract.EMPYRALIS_HOSTED_TIERS
            and not requested_tier_enabled
        ):
            selected_model_unavailable_tier = requested_public_tier
            resolved_turn_metadata = {
                **resolved_turn_metadata,
                "selected_model_unavailable": True,
                "selected_model_unavailable_reason": "tier_disabled",
                "selected_model_unavailable_tier": requested_public_tier,
            }

    if not normalized_requested_provider and normalized_requested_model:
        inferred_provider = direct_chat_provider_service.provider_for_model(normalized_requested_model)
        if inferred_provider:
            normalized_requested_provider = inferred_provider
            if "/" in normalized_requested_model:
                model_provider_prefix, model_id = normalized_requested_model.split("/", 1)
                normalized_prefix = model_provider_prefix.strip().lower()
                if (
                    normalized_prefix == inferred_provider
                    or (normalized_prefix == "openai-codex" and inferred_provider == "codex_cli")
                ):
                    normalized_requested_model = model_id.strip()
        else:
            selected_model_unavailable_model = normalized_requested_model
            selected_model_unavailable_reason = "unknown_provider_for_selected_model"
            resolved_turn_metadata = {
                **resolved_turn_metadata,
                "selected_model_unavailable": True,
                "selected_model_unavailable_reason": selected_model_unavailable_reason,
                "selected_model_unavailable_model": selected_model_unavailable_model,
            }

    base_direct_chat_policy = get_memory_policy_profile(DIRECT_CHAT_PROFILE)
    context_window_tokens = provider_profiles.context_window_for_model(
        normalized_requested_provider,
        normalized_requested_model,
    )
    if context_window_tokens is None:
        model_aware_direct_chat_policy = base_direct_chat_policy
    else:
        model_aware_direct_chat_policy = build_model_aware_memory_policy(
            base_direct_chat_policy,
            context_window_tokens=context_window_tokens,
            runtime_lane="direct_chat",
            trust_zone=str(
                (
                    session_ctx.get("meta", {}).get("trust_zone")
                    if isinstance(session_ctx, dict) and isinstance(session_ctx.get("meta"), dict)
                    else ""
                )
                or resolved_turn_metadata.get("trust_zone")
                or "shared_cloud"
            ),
        )

    normalized_prior_messages = normalize_prior_messages_fn(prior_messages)
    if not normalized_prior_messages and normalized_thread_id:
        transcript_prior_messages = session_transcript_store.load_latest_session_transcript_messages(
            workspace_id=normalized_workspace_id,
            thread_id=normalized_thread_id,
            limit=model_aware_direct_chat_policy.max_transcript_items,
        )
        normalized_prior_messages = normalize_prior_messages_fn(transcript_prior_messages)
    if consume_thread_cleared_fn(session_key):
        normalized_prior_messages = []
    compaction = compact_conversation_history_fn(
        normalized_prior_messages,
        max_tokens=model_aware_direct_chat_policy.max_prompt_tokens or direct_chat_compaction_token_limit,
        preserve_last_messages=model_aware_direct_chat_policy.preserve_last_messages,
        recent_message_budget_tokens=model_aware_direct_chat_policy.recent_message_budget_tokens,
        summary_max_chars=model_aware_direct_chat_policy.max_summary_chars,
    )
    compacted_prior_messages = [
        item
        for item in (compaction.get("messages") if isinstance(compaction, dict) else [])
        if isinstance(item, dict)
    ]
    proactive_suggestions = build_proactive_suggestions_fn(normalized_workspace_id) if not normalized_prior_messages else []
    tool_loop_session_key = direct_tool_session_key_fn(normalized_workspace_id, normalized_thread_id)
    availability_override = dict(availability) if isinstance(availability, dict) else {}
    if selected_model_unavailable_tier:
        availability_override["selected_model_unavailable"] = True
        availability_override["selected_model_unavailable_reason"] = "tier_disabled"
        availability_override["selected_model_unavailable_tier"] = selected_model_unavailable_tier
    if selected_model_unavailable_model:
        availability_override["selected_model_unavailable"] = True
        availability_override["selected_model_unavailable_reason"] = selected_model_unavailable_reason or "selected_model_unavailable"
        availability_override["selected_model_unavailable_model"] = selected_model_unavailable_model
    if resolved_turn_request is not None:
        source_token = str(
            resolved_turn_metadata.get("source")
            or resolved_turn_request.context_hints.get("source")
            or ""
        ).strip().lower()
        availability_override.setdefault(
            "surface_channel",
            str(resolved_turn_request.channel or "").strip().lower() or None,
        )
        availability_override.setdefault("source", source_token or None)
        if str(resolved_turn_request.channel or "").strip().lower() == "mobile" or source_token == "mobile_chat":
            availability_override.setdefault("mobile_server_first", True)
    availability_payload = resolve_direct_chat_availability_fn(
        normalized_workspace_id,
        normalized_requested_provider,
        availability_override or None,
    )
    connected_systems = connected_system_labels_fn(availability_payload)
    tool_capabilities = context_tool_capabilities_fn(availability_payload)
    tools = build_direct_chat_tools_fn(tool_capabilities)
    tools.extend(build_local_direct_chat_tools_fn(availability_payload))
    tools.extend(
        _filter_builtin_tools_for_availability(
            build_builtin_direct_chat_tools_fn(),
            availability_payload,
        )
    )
    deduped_tools: List[Dict[str, Any]] = []
    seen_tool_names: set[str] = set()
    for tool in tools:
        if not isinstance(tool, dict):
            continue
        tool_name = str(tool.get("name") or "").strip()
        if not tool_name or tool_name in seen_tool_names:
            continue
        seen_tool_names.add(tool_name)
        deduped_tools.append(tool)
    tools = deduped_tools
    approved_action_payload = normalize_direct_approved_action_fn(approved_action)
    base_context_used = build_context_used_fn(
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
    return PreparedDirectChatRequest(
        normalized_message=normalized_message,
        normalized_workspace_id=normalized_workspace_id,
        normalized_thread_id=normalized_thread_id,
        session_key=session_key,
        normalized_requested_provider=normalized_requested_provider,
        normalized_requested_model=normalized_requested_model,
        normalized_reasoning_effort=normalized_reasoning_effort,
        compaction=compaction if isinstance(compaction, dict) else {},
        compacted_prior_messages=compacted_prior_messages,
        proactive_suggestions=proactive_suggestions,
        tool_loop_session_key=tool_loop_session_key,
        availability_payload=availability_payload,
        connected_systems=connected_systems,
        tool_capabilities=tool_capabilities,
        tools=tools,
        approved_action_payload=approved_action_payload,
        base_context_used=base_context_used,
        slash_command_name=slash_command_name,
        slash_remainder=slash_remainder,
        resolved_chat_max_iterations=resolved_chat_max_iterations,
    )
