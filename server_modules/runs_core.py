from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.runs_delegation import _detect_agent_role, _normalize_run_id_token, _refresh_parent_delegation_state, normalize_agent_role
from server_modules.runs_engine import ENGINE_REGISTRY, ORION_ENGINE_VALIDATION_ERRORS
from server_modules.runs_history import (
    _append_approval_audit,
    _approval_correlation_id,
    _load_approval_audit,
)
from server_modules.runs_output import (
    _archive_run_if_terminal,
    _json_safe,
    _compact_event_text,
    _load_run_history,
    _refresh_archived_run_snapshot,
)

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

def _begin_run_pending_approval(
    run_id: str,
    prompt: str,
    *,
    source: str = "runtime",
    metadata: Optional[Dict[str, Any]] = None,
    emit_pause_required: bool = False,
) -> Dict[str, Any]:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        raise RuntimeError("Run ID not found.")
    context = run.get("context")
    context_metadata = {}
    if isinstance(context, dict):
        raw_metadata = context.get("metadata")
        if isinstance(raw_metadata, dict):
            context_metadata = raw_metadata
    configured_ttl = context_metadata.get("approval_ttl_seconds") if isinstance(context_metadata, dict) else None
    ttl_seconds = ORION_APPROVAL_TTL_SECONDS
    if isinstance(configured_ttl, (int, float)):
        ttl_seconds = int(configured_ttl)
    ttl_seconds = max(30, min(1800, ttl_seconds))
    requested_at = _utc_now_iso()
    expires_at = (_utc_now() + timedelta(seconds=ttl_seconds)).isoformat().replace("+00:00", "Z")
    approval_id = str(uuid.uuid4())
    correlation_id = _approval_correlation_id(approval_id, run_id=run_id)
    payload = {
        "approval_id": approval_id,
        "correlation_id": correlation_id,
        "status": "waiting",
        "requested_at": requested_at,
        "expires_at": expires_at,
        "prompt": prompt,
        "ttl_seconds": ttl_seconds,
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    run["pending_approval"] = payload
    emit_log(
        run["logs"],
        "warn",
        prompt,
        event="approval_requested",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
            **(_json_safe(metadata) if isinstance(metadata, dict) else {}),
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="requested",
        actor="system",
        source=source,
        run_id=run_id,
        note=prompt,
        correlation_id=correlation_id,
        metadata={"ttl_seconds": ttl_seconds, "expires_at": expires_at, **(metadata or {})},
    )
    emit_log(
        run["logs"],
        "info",
        "Approval request is waiting for user resolution.",
        event="approval_waiting",
        data={
            "approval_id": approval_id,
            "correlation_id": correlation_id,
            "ttl_seconds": ttl_seconds,
            "expires_at": expires_at,
        },
    )
    _append_approval_audit(
        approval_id=approval_id,
        stage="waiting",
        actor="system",
        source=source,
        run_id=run_id,
        correlation_id=correlation_id,
    )
    set_run_status(run_id, "waiting_for_input")
    if emit_pause_required:
        run["logs"].put("__PAUSE_REQUIRED__")
    return payload

def _persist_weekly_schedules():
    with SCHEDULES_LOCK:
        payload = {
            "version": 1,
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "items": list(WEEKLY_SCHEDULES.values()),
        }
    _safe_write_json(ORION_SCHEDULES_FILE, payload)


def _load_weekly_schedules():
    payload = _safe_read_json(ORION_SCHEDULES_FILE, {"version": 1, "items": []})
    items = payload.get("items")
    if not isinstance(items, list):
        return
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES.clear()
        for item in items:
            if not isinstance(item, dict):
                continue
            schedule_id = item.get("id")
            if isinstance(schedule_id, str) and schedule_id.strip():
                WEEKLY_SCHEDULES[schedule_id] = item


def _schedule_now_snapshot(now: datetime, tz_mode: str) -> Dict[str, Any]:
    if tz_mode == "utc":
        current = now.astimezone(timezone.utc)
    else:
        current = now.astimezone()
    return {
        "weekday": current.strftime("%A"),
        "hhmm": current.strftime("%H:%M"),
        "date_key": current.strftime("%Y-%m-%d"),
    }


def set_run_status(run_id: str, status: str):
    run = runs.get(run_id)
    if not run:
        return
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    parent_run_id = _normalize_run_id_token(metadata.get("parent_run_id")) if isinstance(metadata, dict) else None
    previous = run.get("status")
    now_mono = time.monotonic()

    if previous == "waiting_for_input" and status != "waiting_for_input":
        wait_start = run.get("_hitl_wait_start_mono")
        if isinstance(wait_start, (int, float)):
            waited_ms = max(0.0, (now_mono - wait_start) * 1000.0)
            run["_hitl_wait_total_ms"] = run.get("_hitl_wait_total_ms", 0.0) + waited_ms
            metrics_add("hitl_wait_sum_ms", waited_ms)
            metrics_inc("hitl_wait_count", 1)
            run["_hitl_wait_start_mono"] = None

    if status == "waiting_for_input":
        run["_hitl_wait_start_mono"] = now_mono
        metrics_inc("runs_waiting_for_input", 1)

    if status in ["completed", "failed", "timeout"] and run.get("_finished_mono") is None:
        run["_finished_mono"] = now_mono
        started = run.get("_started_mono")
        if isinstance(started, (int, float)):
            duration_ms = max(0.0, (now_mono - started) * 1000.0)
            run["duration_ms"] = round(duration_ms, 2)
            metrics_add("run_duration_sum_ms", duration_ms)
            metrics_inc("run_duration_count", 1)
        run["completed_at"] = datetime.utcnow().isoformat() + "Z"
        if status == "completed":
            metrics_inc("runs_completed", 1)
        elif status == "failed":
            metrics_inc("runs_failed", 1)
        elif status == "timeout":
            metrics_inc("runs_timeout", 1)

    run["status"] = status
    run["updated_at"] = datetime.utcnow().isoformat() + "Z"
    if status in ["completed", "failed", "timeout"]:
        with LOCAL_QUEUE_LOCK:
            if run_id in LOCAL_PENDING_RUN_IDS:
                LOCAL_PENDING_RUN_IDS[:] = [rid for rid in LOCAL_PENDING_RUN_IDS if rid != run_id]
            LOCAL_CLAIMED_RUNS.pop(run_id, None)
        _archive_run_if_terminal(run_id, run)
        log_queue = run.get("logs")
        if log_queue is not None:
            RUN_QUEUE_INDEX.pop(id(log_queue), None)
    if parent_run_id and status in TERMINAL_RUN_STATUSES:
        _refresh_parent_delegation_state(parent_run_id, triggering_run_id=run_id)


def emit_log(log_queue, level: str, message: str, event: str = "runtime", data: Optional[dict] = None):
    payload = {
        "event_id": str(uuid.uuid4()),
        "ts": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "event": event,
        "message": message,
    }
    if data:
        payload["data"] = data
    run_id = RUN_QUEUE_INDEX.get(id(log_queue))
    if run_id:
        run = runs.get(run_id)
        if isinstance(run, dict):
            seq = int(run.get("_event_seq", 0)) + 1
            run["_event_seq"] = seq
            payload["seq"] = seq
            payload["run_id"] = run_id
            events = run.setdefault("events", [])
            if isinstance(events, list):
                events.append(payload)
                if len(events) > ORION_MAX_EVENT_BUFFER:
                    del events[: len(events) - ORION_MAX_EVENT_BUFFER]
    log_queue.put(payload)

def _normalized_weekday(value: str) -> str:
    return str(value or "").strip().capitalize()


def _run_weekly_scheduler_forever():
    poll_seconds = max(5, ORION_SCHEDULER_POLL_SECONDS)
    while True:
        time.sleep(poll_seconds)
        now = datetime.now(timezone.utc)
        changed = False
        with SCHEDULES_LOCK:
            schedule_items = [dict(item) for item in WEEKLY_SCHEDULES.values()]

        for schedule in schedule_items:
            if not bool(schedule.get("enabled")):
                continue
            tz_mode = str(schedule.get("timezone") or "local").strip().lower()
            if tz_mode not in {"local", "utc"}:
                tz_mode = "local"
            day = _normalized_weekday(str(schedule.get("day_of_week") or ""))
            hhmm = str(schedule.get("time_hhmm") or "").strip()
            snapshot = _schedule_now_snapshot(now, tz_mode)
            if day != snapshot["weekday"]:
                continue
            if hhmm != snapshot["hhmm"]:
                continue
            if str(schedule.get("last_trigger_date") or "") == snapshot["date_key"]:
                continue

            schedule_id = str(schedule.get("id") or "")
            req_payload = schedule.get("run_request") if isinstance(schedule.get("run_request"), dict) else {}
            if not schedule_id or not isinstance(req_payload, dict):
                continue

            try:
                req = RunStartRequest(**req_payload)
                run_result = _create_run_from_request(req, schedule_id=schedule_id)
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is not None:
                        current["last_trigger_date"] = snapshot["date_key"]
                        current["last_run_id"] = run_result.get("run_id")
                        current["last_error"] = None
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True
            except Exception as exc:
                with SCHEDULES_LOCK:
                    current = WEEKLY_SCHEDULES.get(schedule_id)
                    if current is not None:
                        current["last_trigger_date"] = snapshot["date_key"]
                        current["last_error"] = str(exc)
                        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
                        WEEKLY_SCHEDULES[schedule_id] = current
                        changed = True

        if changed:
            _persist_weekly_schedules()


_runtime_services_initialized = False


def initialize_runtime_services() -> None:
    global _runtime_services_initialized
    if _runtime_services_initialized:
        return
    init_runtime_state_db(ORION_RUNTIME_STATE_DB)
    _load_run_history()
    _load_approval_audit()
    _load_channel_events()
    _load_weekly_schedules()
    _load_setup_sessions()
    _load_provider_profiles()
    _load_idempotency()
    from server_modules.health_diagnostics import _load_runtime_skills_state

    _load_runtime_skills_state()
    _load_telegram_autopilot_state()
    _load_whatsapp_autopilot_state()

    if ORION_SCHEDULER_ENABLED:
        _scheduler_thread = threading.Thread(target=_run_weekly_scheduler_forever, daemon=True)
        _scheduler_thread.start()
    if ORION_TELEGRAM_AUTOPILOT_ENABLED:
        TELEGRAM_AUTOPILOT_THREAD = threading.Thread(target=_run_telegram_autopilot_forever, daemon=True)
        TELEGRAM_AUTOPILOT_THREAD.start()
    if ORION_WHATSAPP_AUTOPILOT_ENABLED:
        _whatsapp_autopilot_activate()
    _runtime_services_initialized = True

def _prepare_run_start_request(req: RunStartRequest) -> Dict[str, Any]:
    engine = (req.engine or "orion").lower().strip()
    metadata = dict(req.metadata) if isinstance(req.metadata, dict) else {}
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if engine not in ENGINE_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unsupported engine '{engine}'")
    if engine == "orion" and ORION_ENGINE_VALIDATION_ERRORS:
        raise HTTPException(status_code=503, detail="Empyralis runtime validation failed.")
    if engine == "orion" and outcome_pack and outcome_pack not in SUPPORTED_OUTCOME_PACKS:
        raise HTTPException(status_code=400, detail=f"Unsupported outcome pack '{outcome_pack}'")

    if engine == "orion":
        raw_trust_mode = str(metadata.get("trust_mode") or "").strip().lower()
        normalized_trust_mode = normalize_trust_mode(raw_trust_mode)
        if raw_trust_mode and raw_trust_mode not in TRUST_MODE_ALIASES and raw_trust_mode not in VALID_TRUST_MODES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported trust_mode. Use one of: auto, guarded, strict, cost_guard, sensitive_guard.",
            )
        metadata["trust_mode"] = normalized_trust_mode

        if "pack_inputs" in metadata and not isinstance(metadata.get("pack_inputs"), dict):
            raise HTTPException(status_code=400, detail="metadata.pack_inputs must be an object.")
        if "outcome_scope" in metadata and not isinstance(metadata.get("outcome_scope"), list):
            raise HTTPException(status_code=400, detail="metadata.outcome_scope must be a list.")
        if "connector_credential_id" in metadata and metadata.get("connector_credential_id") is not None:
            if not isinstance(metadata.get("connector_credential_id"), str):
                raise HTTPException(status_code=400, detail="metadata.connector_credential_id must be a string.")
        if "approval_rules" in metadata and not isinstance(metadata.get("approval_rules"), dict):
            raise HTTPException(status_code=400, detail="metadata.approval_rules must be an object.")
        if "schedule" in metadata and not isinstance(metadata.get("schedule"), dict):
            raise HTTPException(status_code=400, detail="metadata.schedule must be an object.")
        if "execution_target" in metadata:
            normalized_target = normalize_execution_target(metadata.get("execution_target"))
            if normalized_target not in VALID_EXECUTION_TARGETS:
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported execution_target. Use one of: auto, cloud, local_companion.",
                )
            metadata["execution_target"] = normalized_target

    parent_run_id = _normalize_run_id_token(req.parent_run_id or metadata.get("parent_run_id"))
    if parent_run_id:
        metadata["parent_run_id"] = parent_run_id
    elif "parent_run_id" in metadata:
        metadata.pop("parent_run_id", None)

    delegation_root_run_id = _normalize_run_id_token(metadata.get("delegation_root_run_id"))
    if delegation_root_run_id:
        metadata["delegation_root_run_id"] = delegation_root_run_id
    elif "delegation_root_run_id" in metadata:
        metadata.pop("delegation_root_run_id", None)

    delegated_by_run_id = _normalize_run_id_token(metadata.get("delegated_by_run_id"))
    if delegated_by_run_id:
        metadata["delegated_by_run_id"] = delegated_by_run_id
    elif "delegated_by_run_id" in metadata:
        metadata.pop("delegated_by_run_id", None)

    delegated_by_role = normalize_agent_role(metadata.get("delegated_by_role"))
    if delegated_by_role:
        metadata["delegated_by_role"] = delegated_by_role
    elif "delegated_by_role" in metadata:
        metadata.pop("delegated_by_role", None)

    agent_role, agent_role_source = _detect_agent_role(req, metadata)
    metadata["agent_role"] = agent_role
    metadata["agent_role_source"] = agent_role_source

    app_id = str(metadata.get("app_id") or "").strip()
    if app_id:
        app_permissions = resolve_app_permissions(app_id)
        metadata["app_id"] = app_id
        metadata["app_permissions"] = app_permissions
        app_policy = action_policy_from_app_permissions(app_permissions)
        existing_policy = metadata.get("action_policy") if isinstance(metadata.get("action_policy"), dict) else {}
        metadata["action_policy"] = merge_action_policies(
            {"action_policy": existing_policy},
            {"action_policy": app_policy},
        )

    return {
        "engine": engine,
        "metadata": metadata,
    }


def _local_execution_requires_start_approval(metadata: Dict[str, Any], precheck: Dict[str, Any]) -> bool:
    target = str(metadata.get("execution_target_selected") or metadata.get("execution_target") or "").strip().lower()
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if target != EXECUTION_TARGET_LOCAL_COMPANION:
        return False
    if outcome_pack != LOCAL_EXECUTION_PACK_ID:
        return False
    return bool(precheck.get("approval_required_count"))


def _precheck_human_action_labels(precheck: Dict[str, Any], decision: str = "approval_required") -> List[str]:
    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    labels: List[str] = []
    seen: Set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("decision") or "").strip().lower() != decision:
            continue
        capabilities = item.get("capabilities") if isinstance(item.get("capabilities"), list) else []
        capability_labels = [
            str(cap.get("title") or "").strip()
            for cap in capabilities
            if isinstance(cap, dict) and str(cap.get("title") or "").strip()
        ]
        raw_label = (
            capability_labels[0]
            if capability_labels
            else str(item.get("tool_id") or "").strip().replace("_", " ")
        )
        clean = raw_label.strip()
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            labels.append(clean)
    return labels


def _local_execution_approval_prompt(precheck: Dict[str, Any]) -> str:
    labels = _precheck_human_action_labels(precheck, decision="approval_required")
    if labels:
        return f"Approval required before local companion execution: {', '.join(labels)}."
    return "Approval required before local companion execution."


def _mark_local_execution_tools_approved(metadata: Dict[str, Any]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else None
    if not isinstance(precheck, dict):
        return

    approved_tools = [
        str(item).strip().lower()
        for item in (precheck.get("approval_required") or [])
        if str(item).strip()
    ]
    if not approved_tools:
        return

    allowed = [
        str(item).strip().lower()
        for item in (precheck.get("allowed") or [])
        if str(item).strip()
    ]
    allowed_set = set(allowed)
    for tool in approved_tools:
        allowed_set.add(tool)

    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    rewritten_items: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        next_item = dict(item)
        tool_id = str(next_item.get("tool_id") or "").strip().lower()
        if tool_id in approved_tools:
            next_item["decision"] = "allow"
            next_item["reason"] = "approved_for_local_execution"
        rewritten_items.append(next_item)

    precheck["approval_required"] = []
    precheck["approval_required_count"] = 0
    precheck["allowed"] = sorted(allowed_set)
    precheck["allow_count"] = len(precheck["allowed"])
    precheck["items"] = rewritten_items
    metadata["tool_policy_precheck"] = precheck


def _create_run_from_request(req: RunStartRequest, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    from server_modules.runs_execution import _compute_tool_policy_precheck, create_run

    prepared = _prepare_run_start_request(req)
    engine = prepared["engine"]
    metadata = prepared["metadata"]
    route = decide_execution_target(metadata, schedule_id=schedule_id)
    metadata = dict(metadata)
    metadata["execution_target_requested"] = route["requested"]
    metadata["execution_target_selected"] = route["selected"]
    metadata["execution_target_reason"] = route["reason"]
    if route.get("fallback"):
        metadata["execution_target_fallback"] = route.get("fallback")

    if schedule_id:
        metadata["schedule_id"] = schedule_id
        metadata["scheduled"] = True
    preview_context = {
        "workflow_id": req.workflow_id,
        "workspace_id": req.workspace_id,
        "user_goal": req.user_goal,
        "business_plan": req.business_plan,
        "agent_role": req.agent_role,
        "provider": req.provider,
        "model": req.model,
        "credential_id": req.credential_id,
        "agents": req.agents or [],
        "metadata": metadata,
    }
    metadata["tool_policy_precheck"] = _compute_tool_policy_precheck(preview_context)
    needs_local_approval = _local_execution_requires_start_approval(metadata, metadata["tool_policy_precheck"])
    if needs_local_approval:
        metadata["local_execution_waiting_approval"] = True
        preview_context["metadata"] = metadata
    run_id = create_run(
        engine=engine,
        context=preview_context,
        defer_local_enqueue=needs_local_approval,
    )
    created_run = runs.get(run_id) if isinstance(runs.get(run_id), dict) else {}
    status = "starting"
    if needs_local_approval:
        approval_labels = _precheck_human_action_labels(metadata["tool_policy_precheck"], decision="approval_required")
        pending = _begin_run_pending_approval(
            run_id,
            _local_execution_approval_prompt(metadata["tool_policy_precheck"]),
            source="local_execution_start",
            metadata={
                "target": metadata.get("execution_target_selected"),
                "approval_actions": list(metadata["tool_policy_precheck"].get("approval_required") or []),
                "approval_labels": approval_labels,
                "approval_capabilities": list(metadata["tool_policy_precheck"].get("capability_ids") or []),
                "outcome_pack": metadata.get("outcome_pack"),
            },
        )
        status = "waiting_for_input"
    else:
        pending = None
    return {
        "run_id": run_id,
        "engine": engine,
        "status": status,
        "active_profile_id": created_run.get("active_profile_id"),
        "active_profile_label": created_run.get("active_profile_label"),
        "active_profile_provider": created_run.get("active_provider"),
        "active_profile_model": created_run.get("active_model"),
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": route,
        "pending_approval": pending,
    }

async def list_weekly_schedules(workspace_id: Optional[str] = None):
    with SCHEDULES_LOCK:
        items = list(WEEKLY_SCHEDULES.values())
    if workspace_id:
        items = [item for item in items if str(item.get("workspace_id") or "").strip() == workspace_id]
    items.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return {"items": items}

async def create_weekly_schedule(body: WeeklyScheduleUpsertRequest):
    body.validate_fields()
    schedule_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    item = {
        "id": schedule_id,
        "name": body.name.strip(),
        "workspace_id": _normalize_workspace_id(body.workspace_id),
        "enabled": bool(body.enabled),
        "day_of_week": _normalized_weekday(body.day_of_week),
        "time_hhmm": body.time_hhmm.strip(),
        "timezone": str(body.timezone).strip().lower(),
        "run_request": body.run_request.model_dump(),
        "last_trigger_date": None,
        "last_run_id": None,
        "last_error": None,
        "created_at": now,
        "updated_at": now,
    }
    with SCHEDULES_LOCK:
        WEEKLY_SCHEDULES[schedule_id] = item
    _persist_weekly_schedules()
    return item

async def update_weekly_schedule(schedule_id: str, body: WeeklySchedulePatchRequest):
    body.validate_fields()
    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        if body.name is not None:
            current["name"] = body.name.strip()
        if body.enabled is not None:
            current["enabled"] = bool(body.enabled)
        if body.day_of_week is not None:
            current["day_of_week"] = _normalized_weekday(body.day_of_week)
        if body.time_hhmm is not None:
            current["time_hhmm"] = body.time_hhmm.strip()
        if body.timezone is not None:
            current["timezone"] = str(body.timezone).strip().lower()
        if body.run_request is not None:
            current["run_request"] = body.run_request.model_dump()
        current["updated_at"] = datetime.utcnow().isoformat() + "Z"
        WEEKLY_SCHEDULES[schedule_id] = current
    _persist_weekly_schedules()
    with SCHEDULES_LOCK:
        return dict(WEEKLY_SCHEDULES[schedule_id])

async def delete_weekly_schedule(schedule_id: str):
    with SCHEDULES_LOCK:
        if schedule_id not in WEEKLY_SCHEDULES:
            raise HTTPException(status_code=404, detail="Schedule not found")
        deleted = WEEKLY_SCHEDULES.pop(schedule_id)
    _persist_weekly_schedules()
    return {"status": "ok", "deleted": {"id": deleted.get("id"), "name": deleted.get("name")}}

async def trigger_weekly_schedule_now(schedule_id: str):
    with SCHEDULES_LOCK:
        schedule = WEEKLY_SCHEDULES.get(schedule_id)
        if schedule is None:
            raise HTTPException(status_code=404, detail="Schedule not found")
        req_payload = dict(schedule.get("run_request") or {})
    try:
        req = RunStartRequest(**req_payload)
        result = _create_run_from_request(req, schedule_id=schedule_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    with SCHEDULES_LOCK:
        current = WEEKLY_SCHEDULES.get(schedule_id)
        if current is not None:
            current["last_run_id"] = result.get("run_id")
            current["last_error"] = None
            current["updated_at"] = datetime.utcnow().isoformat() + "Z"
            WEEKLY_SCHEDULES[schedule_id] = current
    _persist_weekly_schedules()
    return result

async def get_runtime_metrics():
    _cleanup_stale_local_claims()
    with METRICS_LOCK:
        snapshot = dict(RUNTIME_METRICS)

    started = int(snapshot.get("runs_started", 0))
    completed = int(snapshot.get("runs_completed", 0))
    failed = int(snapshot.get("runs_failed", 0))
    timeout = int(snapshot.get("runs_timeout", 0))
    finished_total = completed + failed + timeout
    completion_rate = (completed / finished_total) if finished_total > 0 else 0.0

    run_duration_count = int(snapshot.get("run_duration_count", 0))
    run_duration_sum_ms = float(snapshot.get("run_duration_sum_ms", 0.0))
    avg_run_duration_ms = (run_duration_sum_ms / run_duration_count) if run_duration_count > 0 else 0.0

    first_value_count = int(snapshot.get("first_value_count", 0))
    first_value_sum_ms = float(snapshot.get("first_value_sum_ms", 0.0))
    avg_first_value_ms = (first_value_sum_ms / first_value_count) if first_value_count > 0 else 0.0

    hitl_wait_count = int(snapshot.get("hitl_wait_count", 0))
    hitl_wait_sum_ms = float(snapshot.get("hitl_wait_sum_ms", 0.0))
    avg_hitl_wait_ms = (hitl_wait_sum_ms / hitl_wait_count) if hitl_wait_count > 0 else 0.0

    active_runs = 0
    waiting_runs = 0
    for run in runs.values():
        status = run.get("status")
        if status in ["starting", "running", "running_local", "queued_local", "waiting_for_input"]:
            active_runs += 1
        if status == "waiting_for_input":
            waiting_runs += 1
    with SCHEDULES_LOCK:
        schedule_count = len(WEEKLY_SCHEDULES)
    with LOCAL_QUEUE_LOCK:
        local_pending = len(LOCAL_PENDING_RUN_IDS)
        local_claimed = len(LOCAL_CLAIMED_RUNS)
        now = _utc_now()
        known_workers = len(LOCAL_WORKER_REGISTRY)
        online_workers = len([record for record in LOCAL_WORKER_REGISTRY.values() if isinstance(record, dict) and _is_worker_online(record, now)])

    return {
        "auth_required": bool(ORION_AUTH_REQUIRED),
        "auth_insecure_dev_override": bool(ORION_DEV_INSECURE_NO_AUTH),
        "scheduler": {
            "enabled": ORION_SCHEDULER_ENABLED,
            "poll_seconds": ORION_SCHEDULER_POLL_SECONDS,
            "weekly_schedules": schedule_count,
        },
        "local_companion": {
            "enabled": ORION_LOCAL_COMPANION_ENABLED,
            "lease_seconds": ORION_LOCAL_LEASE_SECONDS,
            "pending_runs": local_pending,
            "claimed_runs": local_claimed,
            "known_workers": known_workers,
            "online_workers": online_workers,
        },
        "runs": {
            "started": started,
            "completed": completed,
            "failed": failed,
            "timeout": timeout,
            "active": active_runs,
            "waiting_for_input": waiting_runs,
            "completion_rate": round(completion_rate, 4),
        },
        "kpis": {
            "avg_run_duration_ms": round(avg_run_duration_ms, 2),
            "avg_time_to_first_value_ms": round(avg_first_value_ms, 2),
            "avg_human_wait_ms": round(avg_hitl_wait_ms, 2),
        },
    }

async def get_runtime_kpis():
    return await get_runtime_metrics()

async def get_local_run_queue(workspace_id: Optional[str] = None, limit: int = 50):
    return handle_get_local_run_queue(workspace_id, limit)

async def get_local_workers_status():
    return handle_get_local_workers_status()

async def heartbeat_local_worker(worker_id: str, payload: Optional[LocalWorkerHeartbeatPayload] = None):
    return handle_heartbeat_local_worker(worker_id, payload)

async def claim_local_run(body: Optional[LocalRunClaimRequest] = None):
    return handle_claim_local_run(body)

async def heartbeat_local_run(run_id: uuid.UUID, payload: Optional[LocalRunHeartbeatPayload] = None):
    return handle_heartbeat_local_run(run_id, payload)

async def complete_local_run(run_id: uuid.UUID, payload: LocalRunCompletePayload):
    return handle_complete_local_run(run_id, payload)

async def fail_local_run(run_id: uuid.UUID, payload: LocalRunFailPayload):
    return handle_fail_local_run(run_id, payload)
