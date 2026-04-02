from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules import runs_core as runs_core
from server_modules.health_diagnostics import _build_cognitive_operator_policy, _runtime_skills_snapshot

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(runs_core).items() if not key.startswith("__")})

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


def _direct_chat_session_manager_snapshot() -> Dict[str, Any]:
    enabled = bool(globals().get("ORION_DIRECT_CHAT_SESSION_MANAGER"))
    base = {
        "enabled": enabled,
        "runtime_cache": {
            "active_sessions": 0,
            "idle_ttl_ms": 0,
            "evicted_total": 0,
        },
        "turns": {
            "active": 0,
            "queue_depth": 0,
        },
        "interrupted_stale_sessions": 0,
        "errors_by_code": {},
    }
    if not enabled:
        return base
    try:
        from server_modules.session_manager.manager import get_default_session_manager

        snapshot = get_default_session_manager(db_path=Path(ORION_RUNTIME_STATE_DB)).get_observability_snapshot(enabled=True)
        return snapshot if isinstance(snapshot, dict) else base
    except Exception as exc:
        return {
            **base,
            "error": str(exc).strip() or "session_manager_unavailable",
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
    direct_chat_session_manager = _direct_chat_session_manager_snapshot()
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
        "direct_chat_session_manager_enabled": bool(direct_chat_session_manager.get("enabled")),
        "direct_chat_session_manager_active_sessions": int(((direct_chat_session_manager.get("runtime_cache") or {}).get("active_sessions") or 0)),
        "direct_chat_session_manager_idle_ttl_ms": int(((direct_chat_session_manager.get("runtime_cache") or {}).get("idle_ttl_ms") or 0)),
        "direct_chat_session_manager_evicted_total": int(((direct_chat_session_manager.get("runtime_cache") or {}).get("evicted_total") or 0)),
        "direct_chat_session_manager_active_turns": int(((direct_chat_session_manager.get("turns") or {}).get("active") or 0)),
        "direct_chat_session_manager_queue_depth": int(((direct_chat_session_manager.get("turns") or {}).get("queue_depth") or 0)),
        "direct_chat_session_manager_interrupted_stale_sessions": int(direct_chat_session_manager.get("interrupted_stale_sessions") or 0),
        "direct_chat_session_manager_errors_by_code": direct_chat_session_manager.get("errors_by_code") if isinstance(direct_chat_session_manager.get("errors_by_code"), dict) else {},
        "direct_chat_session_manager": direct_chat_session_manager,
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

def _ensure_installed_solution(solution_id: str) -> Dict[str, Any]:
    solution = find_installed_solution(solution_id)
    if solution is None or not bool(solution.get("enabled")):
        raise HTTPException(status_code=404, detail=f"Solution '{solution_id}' is not installed or enabled.")
    return solution

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
