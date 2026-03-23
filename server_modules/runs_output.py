from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

def _pack_id_from_context(run: Dict[str, Any]) -> Optional[str]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = metadata.get("outcome_pack")
    if isinstance(pack_id, str) and pack_id.strip():
        return pack_id.strip().lower()
    result_data = run.get("result_data")
    if isinstance(result_data, dict):
        from_result = result_data.get("pack_id")
        if isinstance(from_result, str) and from_result.strip():
            return from_result.strip().lower()
    return None


def _build_replay_request_from_context(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    replay_metadata = dict(metadata)
    replay_metadata.pop("credentials", None)
    replay_metadata.pop("access_token", None)
    replay_metadata.pop("api_key", None)
    replay_metadata.pop("secret", None)
    return {
        "engine": context.get("engine") or "orion",
        "workflow_id": context.get("workflow_id"),
        "workspace_id": context.get("workspace_id"),
        "user_goal": context.get("user_goal"),
        "business_plan": context.get("business_plan"),
        "provider": context.get("provider"),
        "model": context.get("model"),
        "credential_id": context.get("credential_id"),
        "agents": context.get("agents") if isinstance(context.get("agents"), list) else [],
        "metadata": replay_metadata,
    }


def _active_profile_snapshot(run: Dict[str, Any]) -> Dict[str, Any]:
    profile_id = str(run.get("active_profile_id") or "").strip()
    profile = PROVIDER_PROFILES.get(profile_id) if profile_id else None
    profile_row = profile if isinstance(profile, dict) else {}
    provider = str(profile_row.get("provider") or run.get("active_provider") or "").strip()
    model = str(profile_row.get("model") or run.get("active_model") or "").strip()
    label = str(profile_row.get("label") or run.get("active_profile_label") or "").strip()
    return {
        "id": profile_id or None,
        "label": label or None,
        "provider": provider or None,
        "model": model or None,
        "adapter": str(run.get("active_adapter") or "").strip() or None,
    }


def _serialize_run_snapshot(run_id: str, run: Dict[str, Any]) -> Dict[str, Any]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    usage_masked = run.get("usage_masked") if isinstance(run.get("usage_masked"), dict) else {}
    events = run.get("events") if isinstance(run.get("events"), list) else []
    trimmed_events = events[-min(len(events), ORION_MAX_EVENT_BUFFER):]
    tool_policy_audit = run.get("tool_policy_audit") if isinstance(run.get("tool_policy_audit"), list) else []
    trimmed_tool_policy_audit = tool_policy_audit[-min(len(tool_policy_audit), 500):]
    memory_trace = run.get("memory_trace") if isinstance(run.get("memory_trace"), dict) else {}
    trimmed_memory_trace = _trim_memory_trace(memory_trace)
    result_data = run.get("result_data") if isinstance(run.get("result_data"), dict) else None
    active_profile = _active_profile_snapshot(run)
    result_summary = run.get("result")
    if isinstance(result_summary, str):
        summary_text = result_summary.strip()
    elif isinstance(result_data, dict) and isinstance(result_data.get("summary"), str):
        summary_text = str(result_data.get("summary")).strip()
    else:
        summary_text = ""

    return {
        "run_id": run_id,
        "engine": run.get("engine", "orion"),
        "status": run.get("status", "unknown"),
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "completed_at": run.get("completed_at"),
        "duration_ms": run.get("duration_ms"),
        "time_to_first_value_ms": run.get("time_to_first_value_ms"),
        "hitl_wait_total_ms": round(float(run.get("_hitl_wait_total_ms", 0.0)), 2),
        "workflow_id": context.get("workflow_id"),
        "workspace_id": context.get("workspace_id"),
        "active_profile_id": active_profile.get("id"),
        "active_profile_label": active_profile.get("label"),
        "active_profile_provider": active_profile.get("provider"),
        "active_profile_model": active_profile.get("model"),
        "active_adapter": active_profile.get("adapter"),
        "pack_id": _pack_id_from_context(run),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "delegation_note": metadata.get("delegation_note"),
        "delegation_summary_cache": metadata.get("delegation_summary_cache"),
        "delegation_next_action": metadata.get("delegation_next_action"),
        "delegation_ready": metadata.get("delegation_ready"),
        "retry_of_run_id": metadata.get("retry_of_run_id"),
        "retry_root_run_id": metadata.get("retry_root_run_id"),
        "retry_sequence": metadata.get("retry_sequence"),
        "trust_mode": metadata.get("trust_mode"),
        "execution_target_requested": metadata.get("execution_target_requested"),
        "execution_target_selected": metadata.get("execution_target_selected"),
        "execution_target_reason": metadata.get("execution_target_reason"),
        "execution_target_fallback": metadata.get("execution_target_fallback"),
        "user_goal": context.get("user_goal"),
        "result_summary": summary_text[:5000],
        "usage_masked": usage_masked,
        "usage_provider": usage_masked.get("provider"),
        "usage_model": usage_masked.get("model"),
        "usage_total_tokens_est": usage_masked.get("total_tokens_est"),
        "usage_cost_band": usage_masked.get("cost_band"),
        "result_data": result_data,
        "tool_policy_precheck": metadata.get("tool_policy_precheck"),
        "tool_policy_audit": trimmed_tool_policy_audit,
        "memory_trace": trimmed_memory_trace,
        "dag": run.get("dag"),
        "context": redact_sensitive(context),
        "replay_request": _build_replay_request_from_context(context),
        "events": trimmed_events,
    }


def _archive_run_if_terminal(run_id: str, run: Dict[str, Any]):
    if run.get("_archived"):
        return
    snapshot = _serialize_run_snapshot(run_id, run)
    try:
        upsert_run_history_item(ORION_RUNTIME_STATE_DB, snapshot, ORION_HISTORY_LIMIT)
    except Exception:
        pass
    with RUN_HISTORY_LOCK:
        RUN_HISTORY.insert(0, snapshot)
        del RUN_HISTORY[ORION_HISTORY_LIMIT:]
    run["_archived"] = True


def _refresh_archived_run_snapshot(run_id: str, run: Dict[str, Any]) -> None:
    if not run.get("_archived"):
        return
    snapshot = _serialize_run_snapshot(run_id, run)
    try:
        upsert_run_history_item(ORION_RUNTIME_STATE_DB, snapshot, ORION_HISTORY_LIMIT)
    except Exception:
        pass
    with RUN_HISTORY_LOCK:
        for idx, item in enumerate(RUN_HISTORY):
            if str(item.get("run_id") or "").strip() == run_id:
                RUN_HISTORY[idx] = snapshot
                break


def _upsert_run_history_snapshot(snapshot: Dict[str, Any]) -> None:
    run_id = str(snapshot.get("run_id") or "").strip()
    if not run_id:
        return
    try:
        upsert_run_history_item(ORION_RUNTIME_STATE_DB, snapshot, ORION_HISTORY_LIMIT)
    except Exception:
        pass
    with RUN_HISTORY_LOCK:
        for idx, item in enumerate(RUN_HISTORY):
            if str(item.get("run_id") or "").strip() == run_id:
                RUN_HISTORY[idx] = snapshot
                break
        else:
            RUN_HISTORY.insert(0, snapshot)
            del RUN_HISTORY[ORION_HISTORY_LIMIT:]


def _load_run_history():
    items: List[Dict[str, Any]] = []
    try:
        items = list_run_history(ORION_RUNTIME_STATE_DB, ORION_HISTORY_LIMIT)
    except Exception:
        items = []
    if not items:
        # One-time fallback for older local installs that only have JSON state.
        payload = _safe_read_json(ORION_HISTORY_FILE, {"version": 1, "items": []})
        raw_items = payload.get("items")
        if isinstance(raw_items, list):
            for item in raw_items[:ORION_HISTORY_LIMIT]:
                if isinstance(item, dict) and isinstance(item.get("run_id"), str):
                    items.append(item)
        if items:
            try:
                replace_run_history(ORION_RUNTIME_STATE_DB, items, ORION_HISTORY_LIMIT)
            except Exception:
                pass
    with RUN_HISTORY_LOCK:
        RUN_HISTORY.clear()
        for item in items[:ORION_HISTORY_LIMIT]:
            RUN_HISTORY.append(item)

def _json_safe(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return str(value)


def _compact_event_text(value: Any, limit: int = 800) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return text[: max(1, limit - 1)].rstrip() + "…"

def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, sub in value.items():
            key_lower = str(key).lower()
            if any(token in key_lower for token in ["token", "key", "secret", "password", "authorization", "credential", "access"]):
                redacted[key] = "***redacted***"
            else:
                redacted[key] = redact_sensitive(sub)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    return value

def _history_item_matches(
    item: Dict[str, Any],
    workspace_id: Optional[str],
    status: Optional[str],
    pack_id: Optional[str],
) -> bool:
    if workspace_id and str(item.get("workspace_id") or "").strip() != workspace_id:
        return False
    if status and str(item.get("status") or "").strip().lower() != status.lower().strip():
        return False
    if pack_id and str(item.get("pack_id") or "").strip().lower() != pack_id.lower().strip():
        return False
    return True


def _resolve_run_connector_binding(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    context = item.get("context") if isinstance(item.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    connector_id = str(
        item.get("connector_credential_id")
        or metadata.get("connector_credential_id")
        or ""
    ).strip()
    channel = str(
        item.get("source_channel")
        or metadata.get("source_channel")
        or metadata.get("channel")
        or ""
    ).strip().lower()
    if not connector_id and not channel:
        return None

    workspace_id = _normalize_workspace_id(
        item.get("workspace_id")
        or context.get("workspace_id")
        or metadata.get("workspace_id")
    )
    connector_row = None
    if connector_id:
        for entry in list_vault_connectors(workspace_id):
            if str(entry.get("id") or "").strip() == connector_id:
                connector_row = entry
                break

    provider = str((connector_row or {}).get("connector") or "").strip().lower()
    connector_metadata = (connector_row or {}).get("metadata") if isinstance((connector_row or {}).get("metadata"), dict) else {}
    assigned_role = normalize_agent_role(connector_metadata.get("agent_role"))
    identity_label = (
        str(connector_metadata.get("chat_id") or "").strip()
        or str(connector_metadata.get("bot_username") or "").strip()
        or str(connector_metadata.get("from_number") or "").strip()
        or str(connector_metadata.get("phone_number") or "").strip()
        or str(connector_metadata.get("emailAddress") or "").strip()
        or str(connector_metadata.get("mail") or "").strip()
        or str(connector_metadata.get("userPrincipalName") or "").strip()
        or str(connector_metadata.get("displayName") or "").strip()
        or str(connector_metadata.get("calendar_id") or "").strip()
    )
    if connector_id and not identity_label:
        try:
            secret = resolve_vault_credential(connector_id, workspace_id)
        except Exception:
            secret = {}
        identity_label = (
            str(secret.get("chat_id") or "").strip()
            or str(secret.get("channel_id") or "").strip()
            or str(secret.get("instagram_account_id") or "").strip()
            or str(secret.get("page_id") or "").strip()
            or str(secret.get("bot_username") or "").strip()
            or str(secret.get("from_number") or "").strip()
            or str(secret.get("phone_number") or "").strip()
            or str(secret.get("emailAddress") or "").strip()
            or str(secret.get("calendar_id") or "").strip()
        )

    if not channel:
        connector_channel_map = {
            "telegram_bot": "telegram",
            "whatsapp_twilio": "whatsapp",
            "google_workspace": "email",
            "microsoft_365": "email",
            "discord_bot": "discord",
            "instagram_business": "instagram",
            "irc": "irc",
        }
        channel = connector_channel_map.get(provider, "")

    if not connector_id and not channel and not provider and not identity_label:
        return None

    return {
        "connector_id": connector_id or None,
        "channel": channel or None,
        "connector": provider or None,
        "label": (connector_row or {}).get("label"),
        "identity_label": identity_label or None,
        "routing_scope": AGENT_WORKSPACE_LABELS.get(assigned_role, assigned_role) if assigned_role else "Shared workspace",
        "agent_role": assigned_role or None,
    }


def _summarize_history_item(item: Dict[str, Any]) -> Dict[str, Any]:
    policy_audit = item.get("tool_policy_audit") if isinstance(item.get("tool_policy_audit"), list) else []
    memory_trace = item.get("memory_trace") if isinstance(item.get("memory_trace"), dict) else {}
    memory_reads = memory_trace.get("reads") if isinstance(memory_trace.get("reads"), list) else []
    memory_writes = memory_trace.get("writes") if isinstance(memory_trace.get("writes"), list) else []
    blocked_count = 0
    approval_required_count = 0
    allow_count = 0
    for entry in policy_audit:
        if not isinstance(entry, dict):
            continue
        decision = str(entry.get("decision") or "").strip().lower()
        if decision == "blocked":
            blocked_count += 1
        elif decision == "approval_required":
            approval_required_count += 1
        elif decision == "allow":
            allow_count += 1
    return {
        "run_id": item.get("run_id"),
        "engine": item.get("engine"),
        "status": item.get("status"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "completed_at": item.get("completed_at"),
        "duration_ms": item.get("duration_ms"),
        "time_to_first_value_ms": item.get("time_to_first_value_ms"),
        "hitl_wait_total_ms": item.get("hitl_wait_total_ms"),
        "workflow_id": item.get("workflow_id"),
        "workspace_id": item.get("workspace_id"),
        "active_profile_id": item.get("active_profile_id"),
        "active_profile_label": item.get("active_profile_label"),
        "active_profile_provider": item.get("active_profile_provider"),
        "active_profile_model": item.get("active_profile_model"),
        "active_adapter": item.get("active_adapter"),
        "pack_id": item.get("pack_id"),
        "agent_role": item.get("agent_role"),
        "agent_role_source": item.get("agent_role_source"),
        "parent_run_id": item.get("parent_run_id"),
        "delegation_root_run_id": item.get("delegation_root_run_id"),
        "delegated_by_run_id": item.get("delegated_by_run_id"),
        "delegated_by_role": item.get("delegated_by_role"),
        "delegation_note": item.get("delegation_note"),
        "delegation_summary": item.get("delegation_summary_cache"),
        "delegation_next_action": item.get("delegation_next_action"),
        "delegation_ready": bool(item.get("delegation_ready")),
        "trust_mode": item.get("trust_mode"),
        "execution_target_requested": item.get("execution_target_requested"),
        "execution_target_selected": item.get("execution_target_selected"),
        "execution_target_reason": item.get("execution_target_reason"),
        "execution_target_fallback": item.get("execution_target_fallback"),
        "user_goal": item.get("user_goal"),
        "result_summary": item.get("result_summary"),
        "connector_binding": _resolve_run_connector_binding(item),
        "usage_provider": item.get("usage_provider"),
        "usage_model": item.get("usage_model"),
        "usage_total_tokens_est": item.get("usage_total_tokens_est"),
        "usage_cost_band": item.get("usage_cost_band"),
        "tool_policy_precheck": item.get("tool_policy_precheck"),
        "tool_policy_audit_count": len(policy_audit),
        "tool_policy_blocked_count": blocked_count,
        "tool_policy_approval_required_count": approval_required_count,
        "tool_policy_allow_count": allow_count,
        "memory_enabled": bool(memory_trace.get("enabled")),
        "memory_read_count": len(memory_reads),
        "memory_write_count": len(memory_writes),
        "memory_last_error": memory_trace.get("last_error"),
    }


def _get_archived_run_history_item(run_id: str) -> Optional[Dict[str, Any]]:
    with RUN_HISTORY_LOCK:
        for item in RUN_HISTORY:
            if str(item.get("run_id")) == run_id:
                return dict(item)
    return None


def _snapshot_updated_sort_ts(snapshot: Optional[Dict[str, Any]]) -> datetime:
    if not isinstance(snapshot, dict):
        return datetime.min.replace(tzinfo=timezone.utc)
    return (
        _parse_utc_ts(snapshot.get("updated_at"))
        or _parse_utc_ts(snapshot.get("completed_at"))
        or _parse_utc_ts(snapshot.get("created_at"))
        or datetime.min.replace(tzinfo=timezone.utc)
    )


def _prefer_archived_snapshot(active_snapshot: Optional[Dict[str, Any]], archived_snapshot: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(active_snapshot, dict):
        return archived_snapshot if isinstance(archived_snapshot, dict) else None
    if not isinstance(archived_snapshot, dict):
        return active_snapshot
    if _snapshot_updated_sort_ts(archived_snapshot) >= _snapshot_updated_sort_ts(active_snapshot):
        return archived_snapshot
    return active_snapshot


def _get_replay_payload(run_id: str) -> Dict[str, Any]:
    active = runs.get(run_id)
    archived_item = _get_archived_run_history_item(run_id)
    active_snapshot = _serialize_run_snapshot(run_id, active) if isinstance(active, dict) else None
    chosen_snapshot = _prefer_archived_snapshot(active_snapshot, archived_item)
    if isinstance(chosen_snapshot, dict):
        chosen_snapshot["connector_binding"] = _resolve_run_connector_binding(chosen_snapshot)
        return chosen_snapshot

    raise HTTPException(status_code=404, detail="Run ID not found")

def iter_logs_for_run(run_id: str):
    run = runs.get(run_id)
    if not run:
        return
    q = run["logs"]
    while True:
        try:
            data = q.get(timeout=1)
            if data is None:
                break
            if data == "__PAUSE_REQUIRED__":
                yield {"event": "pause", "data": "Human Input Needed"}
            else:
                if run.get("_first_value_mono") is None:
                    first_mono = time.monotonic()
                    run["_first_value_mono"] = first_mono
                    started = run.get("_started_mono")
                    if isinstance(started, (int, float)):
                        ttfv_ms = max(0.0, (first_mono - started) * 1000.0)
                        run["time_to_first_value_ms"] = round(ttfv_ms, 2)
                        metrics_add("first_value_sum_ms", ttfv_ms)
                        metrics_inc("first_value_count", 1)
                yield {"event": "log", "data": json.dumps(data)}
        except queue.Empty:
            status = runs.get(run_id, {}).get("status")
            if status in ["completed", "failed", "timeout"]:
                break
            continue
