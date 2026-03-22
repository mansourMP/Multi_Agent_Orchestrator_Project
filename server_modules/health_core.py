from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules import runs_core as runs_core

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(runs_core).items() if not key.startswith("__")})

def _sanitize_skill_card(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    skill_id = str(item.get("id") or "").strip().lower()
    title = str(item.get("title") or "").strip()
    intent = str(item.get("intent") or "").strip()
    if not skill_id or not title or not intent:
        return None
    tools_raw = item.get("tools")
    tools: List[str] = []
    if isinstance(tools_raw, list):
        for entry in tools_raw:
            token = str(entry or "").strip().lower()
            if token and token not in tools:
                tools.append(token[:120])
    runtime_tools_raw = item.get("runtime_tools")
    runtime_tools: List[str] = []
    if isinstance(runtime_tools_raw, list):
        for entry in runtime_tools_raw:
            token = normalize_action_id(entry)
            if token and token in TOOL_CONTRACTS and token not in runtime_tools:
                runtime_tools.append(token)
    guardrail = str(item.get("guardrail") or "").strip()
    preferred_target = ""
    raw_target = str(item.get("preferred_target") or "").strip().lower()
    if raw_target in VALID_EXECUTION_TARGETS:
        preferred_target = raw_target
    preferred_trust_mode = ""
    raw_trust_mode = str(item.get("preferred_trust_mode") or "").strip().lower()
    if raw_trust_mode:
        normalized_trust_mode = normalize_trust_mode(raw_trust_mode)
        if normalized_trust_mode in VALID_TRUST_MODES:
            preferred_trust_mode = normalized_trust_mode
    policy_mode = "warn"
    raw_policy_mode = str(item.get("policy_mode") or item.get("skill_policy_mode") or "").strip().lower()
    if raw_policy_mode in {"off", "warn", "enforce"}:
        policy_mode = raw_policy_mode
    version = str(item.get("version") or "").strip()
    author = str(item.get("author") or "").strip()
    category = str(item.get("category") or "").strip()
    card = {
        "id": skill_id[:80],
        "title": title[:120],
        "intent": intent[:1000],
        "tools": tools[:30],
        "guardrail": guardrail[:1000],
        "policy_mode": policy_mode,
    }
    if runtime_tools:
        card["runtime_tools"] = runtime_tools[:30]
    if preferred_target:
        card["preferred_target"] = preferred_target
    if preferred_trust_mode:
        card["preferred_trust_mode"] = preferred_trust_mode
    if version:
        card["version"] = version[:40]
    if author:
        card["author"] = author[:80]
    if category:
        card["category"] = category[:80]
    return card


def _sanitize_skill_id_list(raw_items: Any) -> List[str]:
    if not isinstance(raw_items, list):
        return []
    out: List[str] = []
    for raw in raw_items:
        token = str(raw or "").strip().lower()
        if not token or token in out:
            continue
        out.append(token[:80])
    return out[:50]


def _compose_skill_prompt_append(skills: List[Dict[str, Any]]) -> str:
    if not skills:
        return ""
    lines = ["Active skill directives (follow unless user overrides explicitly):"]
    for skill in skills:
        title = str(skill.get("title") or "").strip()
        intent = str(skill.get("intent") or "").strip()
        guardrail = str(skill.get("guardrail") or "").strip()
        tools = skill.get("tools") if isinstance(skill.get("tools"), list) else []
        tools_text = ", ".join(str(item).strip() for item in tools if str(item).strip()) or "none"
        runtime_tools = skill.get("runtime_tools") if isinstance(skill.get("runtime_tools"), list) else []
        runtime_tools_text = ", ".join(str(item).strip() for item in runtime_tools if str(item).strip()) or "none"
        preferred_target = str(skill.get("preferred_target") or "").strip()
        preferred_trust_mode = str(skill.get("preferred_trust_mode") or "").strip()
        policy_mode = str(skill.get("policy_mode") or "").strip()
        extra_parts: List[str] = []
        if preferred_target:
            extra_parts.append(f"Preferred target: {preferred_target}.")
        if preferred_trust_mode:
            extra_parts.append(f"Preferred trust mode: {preferred_trust_mode}.")
        if policy_mode:
            extra_parts.append(f"Policy mode: {policy_mode}.")
        extra_suffix = f" {' '.join(extra_parts)}" if extra_parts else ""
        lines.append(f"- {title}: {intent} Guardrail: {guardrail or 'none'}. Tools: {tools_text}. Runtime tools: {runtime_tools_text}.{extra_suffix}")
    return "\n".join(lines).strip()


def _build_skill_contract_from_metadata(
    metadata: Dict[str, Any],
    predicted_tool_ids: List[str],
    trust_mode: str,
    target: str,
) -> Dict[str, Any]:
    bundle = metadata.get("skill_bundle") if isinstance(metadata.get("skill_bundle"), dict) else {}
    skills = bundle.get("skills") if isinstance(bundle.get("skills"), list) else []
    skill_ids = _sanitize_skill_id_list(bundle.get("skill_ids"))
    declared_runtime_tools: List[str] = []
    seen_runtime_tools: Set[str] = set()
    preferred_targets: List[str] = []
    preferred_trust_modes: List[str] = []
    skill_policy_modes: List[str] = []

    for raw in skills:
        if not isinstance(raw, dict):
            continue
        for entry in raw.get("runtime_tools") if isinstance(raw.get("runtime_tools"), list) else []:
            tool_id = normalize_action_id(entry)
            if tool_id and tool_id in TOOL_CONTRACTS and tool_id not in seen_runtime_tools:
                seen_runtime_tools.add(tool_id)
                declared_runtime_tools.append(tool_id)
        target_hint = str(raw.get("preferred_target") or "").strip().lower()
        if target_hint in VALID_EXECUTION_TARGETS and target_hint not in preferred_targets:
            preferred_targets.append(target_hint)
        trust_hint = str(raw.get("preferred_trust_mode") or "").strip().lower()
        if trust_hint:
            normalized_trust = normalize_trust_mode(trust_hint)
            if normalized_trust in VALID_TRUST_MODES and normalized_trust not in preferred_trust_modes:
                preferred_trust_modes.append(normalized_trust)
        policy_hint = str(raw.get("policy_mode") or raw.get("skill_policy_mode") or "").strip().lower()
        if policy_hint in {"off", "warn", "enforce"} and policy_hint not in skill_policy_modes:
            skill_policy_modes.append(policy_hint)

    undeclared_tools = [
        tool_id for tool_id in predicted_tool_ids if declared_runtime_tools and tool_id not in seen_runtime_tools
    ]
    mode = str(metadata.get("skill_policy_mode") or "").strip().lower() or "warn"
    if mode not in {"off", "warn", "enforce"}:
        if "enforce" in skill_policy_modes:
            mode = "enforce"
        elif "warn" in skill_policy_modes:
            mode = "warn"
        elif "off" in skill_policy_modes:
            mode = "off"
        else:
            mode = "warn"

    return {
        "scope": str(metadata.get("skill_scope") or "").strip() or None,
        "skill_ids": skill_ids,
        "declared_runtime_tools": declared_runtime_tools,
        "preferred_targets": preferred_targets,
        "preferred_trust_modes": preferred_trust_modes,
        "skill_policy_modes": skill_policy_modes,
        "undeclared_tools": undeclared_tools,
        "policy_mode": mode,
        "target_conflict": bool(preferred_targets and target not in preferred_targets),
        "trust_conflict": bool(preferred_trust_modes and trust_mode not in preferred_trust_modes),
    }


def _runtime_skill_catalog_map(custom_skills: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    merged.extend(RUNTIME_BUILTIN_SKILLS)
    merged.extend(custom_skills)
    out: Dict[str, Dict[str, Any]] = {}
    for raw in merged:
        card = _sanitize_skill_card(raw)
        if not card:
            continue
        out[card["id"]] = card
    return out


def _runtime_skill_bundle_for_scope(scope: str) -> Dict[str, Any]:
    scope_key = str(scope or "").strip().lower()
    if scope_key not in {"assistant_defaults", "automation_defaults"}:
        scope_key = "assistant_defaults"
    with RUNTIME_SKILLS_LOCK:
        state = dict(RUNTIME_SKILLS_STATE)
        bindings = dict(state.get("bindings") or {})
        custom_skills = list(state.get("custom_skills") or [])
    selected_ids = _sanitize_skill_id_list(bindings.get(scope_key))
    if not selected_ids:
        return {"scope": scope_key, "skill_ids": [], "skills": [], "prompt_append": ""}
    skill_map = _runtime_skill_catalog_map(custom_skills)
    active: List[Dict[str, Any]] = []
    for skill_id in selected_ids:
        skill = skill_map.get(skill_id)
        if skill:
            active.append(skill)
    prompt_append = _compose_skill_prompt_append(active)
    return {
        "scope": scope_key,
        "skill_ids": [str(item.get("id") or "") for item in active],
        "skills": active,
        "prompt_append": prompt_append,
    }


def _inject_runtime_skill_defaults(context: Dict[str, Any]) -> None:
    if not isinstance(context, dict):
        return
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    if not metadata.get("skill_bundle") and not metadata.get("skill_prompt_append"):
        scope_key = "assistant_defaults"
        if str(metadata.get("source") or "").strip().lower() in {"weekly_scheduler", "scheduled"}:
            scope_key = "automation_defaults"
        if str(metadata.get("outcome_pack") or "").strip():
            scope_key = "automation_defaults"
        bundle = _runtime_skill_bundle_for_scope(scope_key)
        if bundle.get("skills"):
            metadata["skill_scope"] = bundle.get("scope")
            metadata["skill_bundle"] = {
                "skill_ids": bundle.get("skill_ids"),
                "skills": bundle.get("skills"),
            }
            metadata["skill_prompt_append"] = bundle.get("prompt_append")
    installed_prompt = build_active_skill_prompt_append()
    if installed_prompt:
        metadata["installed_skill_ids"] = active_installed_skill_ids()
        metadata["skill_prompt_append"] = merge_skill_prompt_append(
            str(metadata.get("skill_prompt_append") or "").strip(),
            installed_prompt,
        )
    context["metadata"] = metadata


def _persist_runtime_skills_state() -> None:
    with RUNTIME_SKILLS_LOCK:
        payload = {
            "version": 1,
            "custom_skills": list(RUNTIME_SKILLS_STATE.get("custom_skills") or []),
            "bindings": dict(RUNTIME_SKILLS_STATE.get("bindings") or {}),
            "updated_at": RUNTIME_SKILLS_STATE.get("updated_at"),
        }
    _safe_write_json(ORION_RUNTIME_SKILLS_FILE, payload)


def _load_runtime_skills_state() -> None:
    payload = _safe_read_json(
        ORION_RUNTIME_SKILLS_FILE,
        {
            "version": 1,
            "custom_skills": [],
            "bindings": {"assistant_defaults": [], "automation_defaults": []},
            "updated_at": None,
        },
    )
    custom_raw = payload.get("custom_skills") if isinstance(payload.get("custom_skills"), list) else []
    custom_skills: List[Dict[str, Any]] = []
    for item in custom_raw:
        card = _sanitize_skill_card(item)
        if card:
            custom_skills.append(card)
    bindings_raw = payload.get("bindings") if isinstance(payload.get("bindings"), dict) else {}
    bindings = {
        "assistant_defaults": _sanitize_skill_id_list(bindings_raw.get("assistant_defaults")),
        "automation_defaults": _sanitize_skill_id_list(bindings_raw.get("automation_defaults")),
    }
    with RUNTIME_SKILLS_LOCK:
        RUNTIME_SKILLS_STATE["version"] = 1
        RUNTIME_SKILLS_STATE["custom_skills"] = custom_skills
        RUNTIME_SKILLS_STATE["bindings"] = bindings
        RUNTIME_SKILLS_STATE["updated_at"] = str(payload.get("updated_at") or "").strip() or None


def _runtime_skills_snapshot() -> Dict[str, Any]:
    with RUNTIME_SKILLS_LOCK:
        custom = list(RUNTIME_SKILLS_STATE.get("custom_skills") or [])
        bindings = dict(RUNTIME_SKILLS_STATE.get("bindings") or {})
        updated_at = RUNTIME_SKILLS_STATE.get("updated_at")
    return {
        "version": 1,
        "custom_skills": custom,
        "bindings": {
            "assistant_defaults": _sanitize_skill_id_list(bindings.get("assistant_defaults")),
            "automation_defaults": _sanitize_skill_id_list(bindings.get("automation_defaults")),
        },
        "registry": {
            "builtin_count": len(_runtime_skill_catalog_map([])),
            "custom_count": len(custom),
            "installed_count": len(_runtime_skill_catalog_map(custom)),
            "assistant_bundle_count": len(_runtime_skill_bundle_for_scope("assistant_defaults").get("skill_ids") or []),
            "automation_bundle_count": len(_runtime_skill_bundle_for_scope("automation_defaults").get("skill_ids") or []),
        },
        "updated_at": updated_at,
    }

def _env_truthy(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return bool(default)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_operator_risk_levels(raw_value: Optional[str], fallback: List[str]) -> List[str]:
    allowed = {"low", "medium", "high"}
    if raw_value is None:
        base = list(fallback)
    else:
        base = [part.strip().lower() for part in str(raw_value).split(",") if part.strip()]
        if not base:
            base = list(fallback)
    seen: Set[str] = set()
    normalized: List[str] = []
    for level in base:
        if level not in allowed or level in seen:
            continue
        normalized.append(level)
        seen.add(level)
    return normalized


def _build_cognitive_operator_policy() -> Dict[str, Any]:
    enabled = _env_truthy(os.getenv("ORION_COGNITIVE_OPERATOR_ENABLED"), default=True)
    trust_mode_default = (str(os.getenv("ORION_COGNITIVE_OPERATOR_TRUST_MODE") or "guarded").strip().lower() or "guarded")
    if trust_mode_default not in {"auto", "guarded", "strict"}:
        trust_mode_default = "guarded"

    timeout_seconds = 60
    timeout_raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_TIMEOUT_SECONDS") or "60").strip()
    if timeout_raw.isdigit():
        timeout_seconds = max(1, int(timeout_raw))

    max_output_chars = 1600
    max_output_raw = str(os.getenv("ORION_COGNITIVE_OPERATOR_MAX_OUTPUT_CHARS") or "1600").strip()
    if max_output_raw.isdigit():
        max_output_chars = max(200, int(max_output_raw))

    root = str(os.getenv("ORION_COGNITIVE_OPERATOR_ROOT") or "").strip() or str(Path.cwd())
    allow_shell_fallback = _env_truthy(os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_SHELL_FALLBACK"), default=False)
    allow_prefixes_raw = (
        str(os.getenv("ORION_LOCAL_COMPANION_COMMAND_ALLOW_PREFIXES") or "").strip()
        or str(os.getenv("ORION_COGNITIVE_OPERATOR_ALLOW_PREFIXES") or "").strip()
    )
    if allow_prefixes_raw:
        allow_prefixes = [part.strip() for part in allow_prefixes_raw.split(",") if part.strip()]
    else:
        allow_prefixes = list(DEFAULT_LOCAL_COMPANION_ALLOW_PREFIXES)
    strict_approval_all = _env_truthy(os.getenv("ORION_COGNITIVE_OPERATOR_STRICT_APPROVAL_ALL"), default=False)
    strict_default = ["low", "medium", "high"] if strict_approval_all else ["medium", "high"]
    approval_levels_by_trust = {
        "auto": _normalize_operator_risk_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_AUTO"),
            [],
        ),
        "guarded": _normalize_operator_risk_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_GUARDED"),
            ["medium", "high"],
        ),
        "strict": _normalize_operator_risk_levels(
            os.getenv("ORION_COGNITIVE_OPERATOR_APPROVAL_LEVELS_STRICT"),
            strict_default,
        ),
    }
    return {
        "enabled": enabled,
        "trust_mode_default": trust_mode_default,
        "approval_levels_by_trust_mode": approval_levels_by_trust,
        "strict_approval_all": strict_approval_all,
        "allow_prefixes": allow_prefixes,
        "capabilities": supported_capability_catalog(Path(__file__).resolve().parent),
        "root": root,
        "timeout_seconds": timeout_seconds,
        "max_output_chars": max_output_chars,
        "allow_shell_fallback": allow_shell_fallback,
        "command_allowlist_enforced": True,
    }

def _runtime_contract_payload() -> Dict[str, Any]:
    return build_runtime_contract_payload(
        contract_schema_version=ORION_RUNTIME_CONTRACT_SCHEMA_VERSION,
        runtime_api_version=ORION_RUNTIME_API_VERSION,
        runtime_api_min_cli_version=ORION_RUNTIME_API_MIN_CLI_VERSION,
        auth_mode=ORION_AUTH_MODE,
        openai_api_key_allowed=not ORION_DISABLE_OPENAI_API_KEY,
        supported_engines=list(ENGINE_REGISTRY.keys()),
        supported_providers=list(PROVIDER_ADAPTERS.keys()),
        supported_execution_targets=sorted(list(VALID_EXECUTION_TARGETS)),
        codex_oauth_interactive_supported=False,
        codex_token_credential_supported=True,
        openai_supported_credential_fields=["api_key", "access_token", "oauth_token"],
        cognitive_operator_policy=_build_cognitive_operator_policy(),
        local_execution_capabilities=supported_capability_catalog(Path(__file__).resolve().parent),
    )

async def runtime_contract():
    return {
        "ok": True,
        "contract": _runtime_contract_payload(),
    }

async def memory_health():
    snapshot = _memory_health_snapshot()
    return {
        "ok": bool(snapshot.get("enabled")) and bool(snapshot.get("manager_ready")),
        **snapshot,
    }

async def memory_search(body: MemorySearchRequest):
    body.validate_fields()
    _memory_manager_or_503()
    bucket = _normalize_memory_bucket(body.bucket, required=False)
    workspace_id = _normalize_workspace_id(body.workspace_id) or "default"
    items = _memory_search_scoped(
        query=body.query.strip(),
        bucket=bucket,
        workspace_id=workspace_id,
        profile_id=str(body.profile_id or "").strip() or None,
        project_id=str(body.project_id or "").strip() or None,
        session_key=str(body.session_key or "").strip() or None,
        k=int(body.k),
    )
    return {
        "ok": True,
        "query": body.query.strip(),
        "bucket": bucket,
        "workspace_id": workspace_id,
        "count": len(items),
        "items": items,
    }

async def memory_upsert(body: MemoryUpsertRequest):
    body.validate_fields()
    manager = _memory_manager_or_503()
    bucket = _normalize_memory_bucket(body.bucket, required=True) or "session"
    workspace_id = _normalize_workspace_id(body.workspace_id) or "default"
    retention_days = int(body.retention_days or ORION_MEMORY_RETENTION_DAYS_DEFAULT)
    expires_at = (_utc_now() + timedelta(days=retention_days)).isoformat().replace("+00:00", "Z")
    metadata = dict(body.metadata) if isinstance(body.metadata, dict) else {}
    metadata.update(
        {
            "bucket": bucket,
            "workspace_id": workspace_id,
            "profile_id": str(body.profile_id or "").strip(),
            "project_id": str(body.project_id or "").strip(),
            "session_key": str(body.session_key or "").strip(),
            "source": str(body.source or "api").strip().lower() or "api",
            "retention_days": retention_days,
            "expires_at": expires_at,
        }
    )
    if isinstance(body.id, str) and body.id.strip():
        metadata["id"] = body.id.strip()
    memory_id = manager.upsert_memory(body.text.strip(), metadata)
    return {
        "ok": True,
        "id": memory_id,
        "bucket": bucket,
        "workspace_id": workspace_id,
        "retention_days": retention_days,
        "expires_at": expires_at,
    }

async def health():
    runtime_contract = _runtime_contract_payload()
    openai_key, openai_env_source = _openai_env_bearer_with_source()
    openai_probe = probe_openai_credential(
        openai_key=openai_key,
        openai_env_source=openai_env_source,
        openai_healthcheck=OPENAI_HEALTHCHECK,
        openai_api_url=OPENAI_API_URL,
        openai_org_id=OPENAI_ORG_ID,
        openai_project_id=OPENAI_PROJECT_ID,
        resolve_default_vault_credential=resolve_default_vault_credential,
        provider_adapters=PROVIDER_ADAPTERS,
    )

    runtime_valid = not ORION_ENGINE_VALIDATION_ERRORS
    runtime_counts = collect_runtime_counts(
        weekly_schedules=WEEKLY_SCHEDULES,
        schedules_lock=SCHEDULES_LOCK,
        setup_sessions=SETUP_SESSIONS,
        setup_sessions_lock=SETUP_SESSIONS_LOCK,
        cleanup_setup_sessions_locked=_cleanup_setup_sessions_locked,
        provider_profiles=PROVIDER_PROFILES,
        profiles_lock=PROFILES_LOCK,
        idempotency_records=IDEMPOTENCY_RECORDS,
        idempotency_lock=IDEMPOTENCY_LOCK,
        prune_idempotency_locked=_prune_idempotency_locked,
    )
    telegram_autopilot = _telegram_autopilot_snapshot()
    whatsapp_autopilot = _whatsapp_autopilot_snapshot()
    default_tool_policy = tool_policy_snapshot()
    memory_snapshot = _memory_health_snapshot()
    runtime_skills = _runtime_skills_snapshot()
    ok = bool(openai_probe["openai_key_valid"]) and runtime_valid
    return {
        "ok": ok,
        "runtime_api_version": ORION_RUNTIME_API_VERSION,
        "runtime_api_min_cli_version": ORION_RUNTIME_API_MIN_CLI_VERSION,
        "runtime_contract_schema_version": runtime_contract.get("contract_schema_version"),
        "runtime_contract_endpoint": "/contract",
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_insecure_dev_override": bool(ORION_DEV_INSECURE_NO_AUTH),
        "orion_api_key_configured": bool(ORION_API_KEY),
        "auth_mode": ORION_AUTH_MODE,
        "openai_api_key_allowed": not ORION_DISABLE_OPENAI_API_KEY,
        "openai_key_present": openai_probe["openai_key_present"],
        "openai_vault_present": openai_probe["openai_vault_present"],
        "openai_key_valid": openai_probe["openai_key_valid"],
        "openai_credential_source": openai_probe["openai_credential_source"],
        "openai_status": openai_probe["openai_status"],
        "openai_error": openai_probe["openai_error"],
        "engines": list(ENGINE_REGISTRY.keys()),
        "providers": list(PROVIDER_ADAPTERS.keys()),
        "codex_model": CODEX_MODEL,
        "codex_oauth_interactive_supported": False,
        "codex_token_credential_supported": True,
        "openai_supported_credential_fields": ["api_key", "access_token", "oauth_token"],
        "run_timeout_seconds": ORION_RUN_TIMEOUT_SECONDS,
        "max_retries": ORION_MAX_RETRIES,
        "retry_backoff_seconds": ORION_RETRY_BACKOFF_SECONDS,
        "tool_policy_blocked_actions": default_tool_policy.get("blocked_actions"),
        "tool_policy_approval_actions": default_tool_policy.get("approval_actions"),
        "tool_policy_allow_actions": default_tool_policy.get("allow_actions"),
        "tool_policy_sensitivity": {
            "sensitive_tools": default_tool_policy.get("sensitive_tools"),
            "critical_tools": default_tool_policy.get("critical_tools"),
            "block_cloud_critical": default_tool_policy.get("block_cloud_critical"),
            "connector_cloud_readonly": default_tool_policy.get("connector_cloud_readonly"),
        },
        "memory_enabled": memory_snapshot.get("enabled"),
        "memory_manager_ready": memory_snapshot.get("manager_ready"),
        "memory_manager_error": memory_snapshot.get("manager_error"),
        "memory_db_path": memory_snapshot.get("db_path"),
        "memory_db_exists": memory_snapshot.get("db_exists"),
        "memory_db_size_bytes": memory_snapshot.get("db_size_bytes"),
        "memory_sqlite_rows": memory_snapshot.get("sqlite_rows"),
        "memory_sqlite_error": memory_snapshot.get("sqlite_error"),
        "memory_lancedb_uri": memory_snapshot.get("lancedb_uri"),
        "memory_lancedb_initialized": memory_snapshot.get("lancedb_initialized"),
        "scheduler_enabled": ORION_SCHEDULER_ENABLED,
        "scheduler_poll_seconds": ORION_SCHEDULER_POLL_SECONDS,
        "telegram_autopilot_enabled": telegram_autopilot.get("enabled"),
        "telegram_autopilot_active": telegram_autopilot.get("active"),
        "telegram_autopilot_last_poll_at": telegram_autopilot.get("last_poll_at"),
        "telegram_autopilot_last_error": telegram_autopilot.get("last_error"),
        "telegram_autopilot_last_error_at": telegram_autopilot.get("last_error_at"),
        "telegram_autopilot_last_error_category": telegram_autopilot.get("last_error_category"),
        "telegram_autopilot_last_error_source": telegram_autopilot.get("last_error_source"),
        "telegram_autopilot_error_count": telegram_autopilot.get("error_count"),
        "telegram_autopilot_consecutive_errors": telegram_autopilot.get("consecutive_errors"),
        "telegram_autopilot_retry_count": telegram_autopilot.get("retry_count"),
        "telegram_autopilot_last_retry_at": telegram_autopilot.get("last_retry_at"),
        "telegram_autopilot_backoff_seconds": telegram_autopilot.get("backoff_seconds"),
        "telegram_autopilot_next_retry_at": telegram_autopilot.get("next_retry_at"),
        "telegram_autopilot_last_success_at": telegram_autopilot.get("last_success_at"),
        "telegram_autopilot_connectors_seen": telegram_autopilot.get("connectors_seen"),
        "telegram_autopilot_processed_updates": telegram_autopilot.get("processed_updates"),
        "telegram_autopilot_runs_started": telegram_autopilot.get("runs_started"),
        "telegram_autopilot_connector_error_count": telegram_autopilot.get("connector_error_count"),
        "telegram_autopilot_thread_alive": telegram_autopilot.get("thread_alive"),
        "telegram_autopilot_state_file": telegram_autopilot.get("state_file"),
        "telegram_autopilot_default_profile": telegram_autopilot.get("default_profile"),
        "whatsapp_autopilot_enabled": whatsapp_autopilot.get("enabled"),
        "whatsapp_autopilot_active": whatsapp_autopilot.get("active"),
        "whatsapp_autopilot_last_inbound_at": whatsapp_autopilot.get("last_inbound_at"),
        "whatsapp_autopilot_last_error": whatsapp_autopilot.get("last_error"),
        "whatsapp_autopilot_last_error_at": whatsapp_autopilot.get("last_error_at"),
        "whatsapp_autopilot_last_error_category": whatsapp_autopilot.get("last_error_category"),
        "whatsapp_autopilot_last_error_source": whatsapp_autopilot.get("last_error_source"),
        "whatsapp_autopilot_error_count": whatsapp_autopilot.get("error_count"),
        "whatsapp_autopilot_consecutive_errors": whatsapp_autopilot.get("consecutive_errors"),
        "whatsapp_autopilot_connectors_seen": whatsapp_autopilot.get("connectors_seen"),
        "whatsapp_autopilot_processed_messages": whatsapp_autopilot.get("processed_messages"),
        "whatsapp_autopilot_runs_started": whatsapp_autopilot.get("runs_started"),
        "whatsapp_autopilot_connector_error_count": whatsapp_autopilot.get("connector_error_count"),
        "whatsapp_autopilot_state_file": whatsapp_autopilot.get("state_file"),
        "whatsapp_autopilot_default_profile": whatsapp_autopilot.get("default_profile"),
        "weekly_schedules": runtime_counts["weekly_schedules"],
        "setup_sessions_total": runtime_counts["setup_sessions_total"],
        "setup_sessions_active": runtime_counts["setup_sessions_active"],
        "provider_profiles_total": runtime_counts["provider_profiles_total"],
        "idempotency_records": runtime_counts["idempotency_records"],
        "approval_ttl_seconds": ORION_APPROVAL_TTL_SECONDS,
        "setup_session_ttl_seconds": ORION_SETUP_SESSION_TTL_SECONDS,
        "idempotency_ttl_seconds": ORION_IDEMPOTENCY_TTL_SECONDS,
        "control_plane_allowed_origins": CONTROL_PLANE_ORIGINS,
        "control_plane_rate_limit_per_minute": CONTROL_PLANE_RATE_LIMIT_PER_MINUTE,
        "control_plane_rate_limit_burst": CONTROL_PLANE_RATE_LIMIT_BURST,
        "local_companion_enabled": ORION_LOCAL_COMPANION_ENABLED,
        "local_companion_lease_seconds": ORION_LOCAL_LEASE_SECONDS,
        "supported_execution_targets": sorted(list(VALID_EXECUTION_TARGETS)),
        "history_file": str(ORION_HISTORY_FILE),
        "runtime_state_db": str(ORION_RUNTIME_STATE_DB),
        "channel_events_file": str(ORION_CHANNEL_EVENTS_FILE),
        "channel_events_count": len(CHANNEL_EVENTS),
        "channel_dead_letters_file": str(ORION_CHANNEL_DEAD_LETTER_FILE),
        "channel_dead_letters_count": len(_safe_read_json(ORION_CHANNEL_DEAD_LETTER_FILE, {"items": []}).get("items") or []),
        "approval_audit_file": str(ORION_APPROVAL_AUDIT_FILE),
        "approval_audit_count": len(_safe_read_json(ORION_APPROVAL_AUDIT_FILE, {"items": []}).get("items") or []),
        "schedules_file": str(ORION_SCHEDULES_FILE),
        "setup_sessions_file": str(ORION_SETUP_SESSIONS_FILE),
        "provider_profiles_file": str(ORION_PROVIDER_PROFILES_FILE),
        "empyralis_state_home": str(EMPYRALIS_STATE_HOME),
        "runtime_skills_file": str(ORION_RUNTIME_SKILLS_FILE),
        "runtime_skills_custom_count": len(runtime_skills.get("custom_skills") or []),
        "runtime_skills_assistant_defaults_count": len(((runtime_skills.get("bindings") or {}).get("assistant_defaults") or [])),
        "runtime_skills_automation_defaults_count": len(((runtime_skills.get("bindings") or {}).get("automation_defaults") or [])),
        "runtime_skills_updated_at": runtime_skills.get("updated_at"),
        "idempotency_file": str(ORION_IDEMPOTENCY_FILE),
        "vault_file": str(VAULT_FILE),
        "vault_key_file": str(VAULT_KEY_FILE),
        "vault_cipher_prefix": ORION_VAULT_CIPHER_PREFIX,
        "vault_kdf_iterations": ORION_VAULT_KDF_ITERATIONS,
        "vault_legacy_openssl_decrypt": ORION_VAULT_LEGACY_OPENSSL_DECRYPT,
        "vault_legacy_openssl_encrypt_fallback": ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK,
        "runtime_valid": runtime_valid,
        "runtime_contract": runtime_contract,
        "tool_policy": default_tool_policy,
        "runtime_skills": runtime_skills,
        "telegram_autopilot": telegram_autopilot,
        "whatsapp_autopilot": whatsapp_autopilot,
        "errors": ORION_ENGINE_VALIDATION_ERRORS
    }

async def mobile_handoff():
    return {
        "ok": True,
        "product": "Empyralis",
        "surface": "mobile_handoff",
        "message": "Empyralis mobile handoff is ready.",
        "runtime_api_version": ORION_RUNTIME_API_VERSION,
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_mode": ORION_AUTH_MODE,
        "pairing": {
            "api_key_header": "X-API-Key" if ORION_AUTH_REQUIRED else None,
            "workspace_id": "default",
        },
        "tabs": ["Home", "Agents", "Runs", "Approvals", "You"],
        "endpoints": {
            "health": "/health",
            "contract": "/contract",
            "agent_snapshot": "/agents/workspace/snapshot?workspace_id=default",
            "runs": "/history/runs?workspace_id=default",
            "approvals": "/approvals?workspace_id=default",
            "artifacts": "/artifacts?workspace_id=default",
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }

async def validation_latest():
    if not ORION_VALIDATION_LATEST_FILE.exists():
        return {
            "suite": "empyralis_core_smoke",
            "generated_at": None,
            "summary": {"pass": 0, "fail": 0, "total": 0, "ok": False},
            "checks": [],
            "detail": "No validation report found yet.",
        }
    try:
        payload = json.loads(ORION_VALIDATION_LATEST_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read validation report: {exc}")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Validation report is not an object.")
    payload.setdefault("suite", "empyralis_core_smoke")
    payload.setdefault("generated_at", None)
    payload.setdefault("summary", {"pass": 0, "fail": 0, "total": 0, "ok": False})
    payload.setdefault("checks", [])
    return payload

async def validation_history(limit: int = 10):
    safe_limit = max(1, min(limit, 30))
    items: List[Dict[str, Any]] = []
    try:
        report_files = sorted(
            ORION_VALIDATION_REPORT_DIR.glob("core_smoke_*.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read validation directory: {exc}")
    for path in report_files[:safe_limit]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        items.append(
            {
                "suite": payload.get("suite") or "empyralis_core_smoke",
                "generated_at": payload.get("generated_at"),
                "summary": {
                    "pass": int(summary.get("pass") or 0),
                    "fail": int(summary.get("fail") or 0),
                    "total": int(summary.get("total") or 0),
                    "ok": bool(summary.get("ok")),
                },
                "detail": payload.get("detail"),
                "filename": path.name,
            }
        )
    return {
        "items": items,
        "count": len(items),
    }

async def doctor():
    health_data = await health()
    return build_doctor_report(
        health_data,
        {
            "ORION_AUTH_REQUIRED": ORION_AUTH_REQUIRED,
            "ORION_DEV_INSECURE_NO_AUTH": ORION_DEV_INSECURE_NO_AUTH,
            "ORION_API_KEY": ORION_API_KEY,
            "FRONTEND_ORIGINS": FRONTEND_ORIGINS,
            "CONTROL_PLANE_ORIGINS": CONTROL_PLANE_ORIGINS,
            "CONTROL_PLANE_RATE_LIMIT_PER_MINUTE": CONTROL_PLANE_RATE_LIMIT_PER_MINUTE,
            "CONTROL_PLANE_RATE_LIMIT_BURST": CONTROL_PLANE_RATE_LIMIT_BURST,
            "ORION_RUN_TIMEOUT_SECONDS": ORION_RUN_TIMEOUT_SECONDS,
            "ORION_MAX_RETRIES": ORION_MAX_RETRIES,
            "ORION_SCHEDULER_POLL_SECONDS": ORION_SCHEDULER_POLL_SECONDS,
            "ORION_SCHEDULER_ENABLED": ORION_SCHEDULER_ENABLED,
            "ORION_LOCAL_COMPANION_ENABLED": ORION_LOCAL_COMPANION_ENABLED,
            "EMPYRALIS_STATE_HOME": str(EMPYRALIS_STATE_HOME),
            "VAULT_FILE": str(VAULT_FILE),
            "ORION_VAULT_CIPHER_PREFIX": ORION_VAULT_CIPHER_PREFIX,
            "ORION_VAULT_KDF_ITERATIONS": ORION_VAULT_KDF_ITERATIONS,
            "ORION_VAULT_LEGACY_OPENSSL_DECRYPT": ORION_VAULT_LEGACY_OPENSSL_DECRYPT,
            "ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK": ORION_VAULT_LEGACY_OPENSSL_ENCRYPT_FALLBACK,
            "ORION_SETUP_SESSIONS_FILE": str(ORION_SETUP_SESSIONS_FILE),
            "ORION_PROVIDER_PROFILES_FILE": str(ORION_PROVIDER_PROFILES_FILE),
            "ORION_IDEMPOTENCY_FILE": str(ORION_IDEMPOTENCY_FILE),
            "ORION_RUNTIME_STATE_DB": str(ORION_RUNTIME_STATE_DB),
            "ORION_MEMORY_ENABLED": ORION_MEMORY_ENABLED,
            "ORION_MEMORY_DB_PATH": ORION_MEMORY_DB_PATH,
            "ORION_MEMORY_LANCEDB_URI": ORION_MEMORY_LANCEDB_URI,
        },
    )

async def get_runtime_skills_state():
    state = _runtime_skills_snapshot()
    return {
        "ok": True,
        "state": state,
        "builtins": RUNTIME_BUILTIN_SKILLS,
        "installed": list_installed_skills(),
    }

async def get_runtime_solutions_state():
    return {
        "ok": True,
        "installed": list_installed_solutions(),
        "active": active_installed_solutions(),
        "mcp_endpoint": EMPYRALIST_MCP_ENDPOINT,
        "mcp_tools": EMPYRALIST_MCP_TOOLS,
    }

async def put_runtime_skills_state(body: RuntimeSkillsStateUpsertRequest):
    body.validate_fields()
    custom_skills: Optional[List[Dict[str, Any]]] = None
    if body.custom_skills is not None:
        custom_skills = []
        for item in body.custom_skills:
            card = _sanitize_skill_card(item)
            if card:
                custom_skills.append(card)
    bindings_patch: Optional[Dict[str, List[str]]] = None
    if body.bindings is not None:
        bindings_patch = {
            "assistant_defaults": _sanitize_skill_id_list(body.bindings.get("assistant_defaults")),
            "automation_defaults": _sanitize_skill_id_list(body.bindings.get("automation_defaults")),
        }
    with RUNTIME_SKILLS_LOCK:
        if custom_skills is not None:
            RUNTIME_SKILLS_STATE["custom_skills"] = custom_skills
        current_bindings = dict(RUNTIME_SKILLS_STATE.get("bindings") or {})
        if bindings_patch is not None:
            current_bindings.update(bindings_patch)
        current_bindings["assistant_defaults"] = _sanitize_skill_id_list(current_bindings.get("assistant_defaults"))
        current_bindings["automation_defaults"] = _sanitize_skill_id_list(current_bindings.get("automation_defaults"))
        RUNTIME_SKILLS_STATE["bindings"] = current_bindings
        RUNTIME_SKILLS_STATE["updated_at"] = _utc_now_iso()
    _persist_runtime_skills_state()
    state = _runtime_skills_snapshot()
    return {
        "ok": True,
        "state": state,
        "assistant_bundle": _runtime_skill_bundle_for_scope("assistant_defaults"),
        "automation_bundle": _runtime_skill_bundle_for_scope("automation_defaults"),
    }

def _ensure_installed_solution(solution_id: str) -> Dict[str, Any]:
    solution = find_installed_solution(solution_id)
    if solution is None or not bool(solution.get("enabled")):
        raise HTTPException(status_code=404, detail=f"Solution '{solution_id}' is not installed or enabled.")
    return solution

async def dispatch_installed_solution_api(solution_id: str, subpath: str, request: Request):
    _ensure_installed_solution(solution_id)
    body: Dict[str, Any] = {}
    if request.method.upper() in {"POST", "PUT", "PATCH"}:
        try:
            parsed = await request.json()
            if isinstance(parsed, dict):
                body = parsed
        except Exception:
            body = {}
    try:
        payload = call_installed_solution_hook(
            solution_id,
            "handle_api_request",
            request.method,
            subpath,
            body,
            dict(request.query_params),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(payload, Response):
        return payload
    if isinstance(payload, (dict, list)):
        return payload
    return {"ok": True}

async def probe():
    runtime_valid = len(ORION_ENGINE_VALIDATION_ERRORS) == 0
    runtime_counts = collect_runtime_counts(
        weekly_schedules=WEEKLY_SCHEDULES,
        schedules_lock=SCHEDULES_LOCK,
        setup_sessions=SETUP_SESSIONS,
        setup_sessions_lock=SETUP_SESSIONS_LOCK,
        cleanup_setup_sessions_locked=_cleanup_setup_sessions_locked,
        provider_profiles=PROVIDER_PROFILES,
        profiles_lock=PROFILES_LOCK,
        idempotency_records=IDEMPOTENCY_RECORDS,
        idempotency_lock=IDEMPOTENCY_LOCK,
        prune_idempotency_locked=_prune_idempotency_locked,
    )
    local_counts = collect_local_queue_counts(
        cleanup_stale_local_claims=_cleanup_stale_local_claims,
        local_queue_lock=LOCAL_QUEUE_LOCK,
        local_worker_registry=LOCAL_WORKER_REGISTRY,
        local_pending_run_ids=LOCAL_PENDING_RUN_IDS,
        local_claimed_runs=LOCAL_CLAIMED_RUNS,
        utc_now=_utc_now,
        is_worker_online=_is_worker_online,
    )
    return build_probe_payload(
        runtime_valid=runtime_valid,
        errors=ORION_ENGINE_VALIDATION_ERRORS,
        scheduler_enabled=ORION_SCHEDULER_ENABLED,
        runtime_counts=runtime_counts,
        local_queue_counts=local_counts,
        generated_at_iso=_utc_now_iso(),
    )

async def create_setup_session(body: Optional[SetupSessionCreateRequest] = None):
    return await handle_create_setup_session(body)

async def get_setup_session(session_id: str):
    return await handle_get_setup_session(session_id)

async def setup_session_action(session_id: str, body: SetupSessionActionRequest):
    return await handle_setup_session_action(session_id, body)

async def cancel_setup_session(session_id: str):
    return await handle_cancel_setup_session(session_id)

async def resume_setup_session(session_id: str):
    return await handle_resume_setup_session(session_id)

async def create_onboarding_session(body: Optional[SetupSessionCreateRequest] = None):
    return await handle_create_onboarding_session(body)

async def get_onboarding_session(session_id: str):
    return await handle_get_onboarding_session(session_id)

async def onboarding_session_action(session_id: str, body: SetupSessionActionRequest):
    return await handle_onboarding_session_action(session_id, body)

async def cancel_onboarding_session(session_id: str):
    return await handle_cancel_onboarding_session(session_id)

async def resume_onboarding_session(session_id: str):
    return await handle_resume_onboarding_session(session_id)
