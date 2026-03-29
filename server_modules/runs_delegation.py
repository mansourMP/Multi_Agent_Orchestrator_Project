from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.doctor_gate import build_doctor_run_gate_from_snapshot
from server_modules.runs_output import (
    _get_archived_run_history_item,
    _get_replay_payload,
    _prefer_archived_snapshot,
    _refresh_archived_run_snapshot,
    _serialize_run_snapshot,
    _upsert_run_history_snapshot,
)

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

VALID_AGENT_ROLES: Set[str] = {
    "orchestrator",
    "support",
    "sales",
    "research",
    "finance",
    "builder",
    "private-assistant",
}

AGENT_ROLE_ALIASES: Dict[str, str] = {
    "ceo": "orchestrator",
    "dispatcher": "orchestrator",
    "support-inbox": "support",
    "support_inbox": "support",
    "customer-support": "support",
    "customer_support": "support",
    "sales-booking": "sales",
    "sales_booking": "sales",
    "booking": "sales",
    "research-memory": "research",
    "research_memory": "research",
    "memory": "research",
    "finance-sheets": "finance",
    "finance_sheets": "finance",
    "sheets": "finance",
    "builder-ops": "builder",
    "builder_ops": "builder",
    "developer": "builder",
    "design": "builder",
    "private assistant": "private-assistant",
    "private_assistant": "private-assistant",
}

AGENT_ROLE_KEYWORDS: Dict[str, List[str]] = {
    "support": ["support", "customer", "feedback", "reply", "inbox", "message", "complaint", "telegram", "whatsapp"],
    "sales": ["sales", "lead", "booking", "book", "appointment", "follow-up", "follow up", "pipeline", "convert", "slot"],
    "research": ["research", "study", "exam", "memory", "brief", "summary", "docs", "analyze", "analysis", "plan"],
    "finance": ["finance", "sheet", "sheets", "excel", "budget", "invoice", "expense", "revenue", "report", "spreadsheet"],
    "builder": ["build", "builder", "code", "debug", "fix", "frontend", "backend", "design", "automation", "script", "workflow", "platform"],
    "private-assistant": ["personal", "private", "reminder", "study", "habit", "routine", "travel", "note", "calendar"],
}

OUTCOME_PACK_AGENT_ROLE_MAP: Dict[str, str] = {
    "customer-ops-autopilot": "sales",
    "weekly-content": "research",
    "competitor-brief": "research",
    "spreadsheet-ops": "finance",
    "spreadsheet-ops-v1": "finance",
    "document-studio-v1": "builder",
    "local-execution-v1": "builder",
}


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


def normalize_agent_role(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    raw = AGENT_ROLE_ALIASES.get(raw, raw)
    return raw if raw in VALID_AGENT_ROLES else ""


def _detect_agent_role(req: RunStartRequest, metadata: Dict[str, Any]) -> Tuple[str, str]:
    if ORION_SINGLE_AGENT_MODE:
        return ORION_SINGLE_AGENT_ROLE, "single_agent"
    explicit = normalize_agent_role(req.agent_role or metadata.get("agent_role"))
    if explicit:
        return explicit, "explicit"

    agents = req.agents if isinstance(req.agents, list) else []
    for item in agents:
        if not isinstance(item, dict):
            continue
        candidate = normalize_agent_role(item.get("agent_role") or item.get("role") or item.get("kind") or item.get("id"))
        if candidate:
            return candidate, "agents"

    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if outcome_pack:
        mapped = OUTCOME_PACK_AGENT_ROLE_MAP.get(outcome_pack)
        if mapped:
            return mapped, "outcome_pack"

    haystack = " ".join(
        part
        for part in [
            str(req.user_goal or "").strip(),
            str(req.business_plan or "").strip(),
            outcome_pack,
            " ".join(
                sorted(str(key).strip().lower() for key in (metadata.get("pack_inputs") or {}).keys())
            ) if isinstance(metadata.get("pack_inputs"), dict) else "",
        ]
        if part
    ).lower()

    best_role = "builder"
    best_score = 0
    for role, keywords in AGENT_ROLE_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in haystack)
        if score > best_score:
            best_role = role
            best_score = score
    if best_score > 0:
        return best_role, "inferred"

    if any(token in haystack for token in ["plan", "summary", "analyze", "analysis", "docs"]):
        return "research", "inferred"

    return "builder", "default"


def _normalize_run_id_token(value: Any) -> Optional[str]:
    token = str(value or "").strip()
    if not token:
        return None
    try:
        return str(uuid.UUID(token))
    except Exception:
        return None


def _extract_run_relationships_from_context(context: Dict[str, Any]) -> Dict[str, Optional[str]]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if not isinstance(metadata, dict):
        metadata = {}
    return {
        "parent_run_id": _normalize_run_id_token(metadata.get("parent_run_id")),
        "delegation_root_run_id": _normalize_run_id_token(metadata.get("delegation_root_run_id")),
        "delegated_by_run_id": _normalize_run_id_token(metadata.get("delegated_by_run_id")),
        "delegated_by_role": normalize_agent_role(metadata.get("delegated_by_role")) or None,
        "delegation_note": str(metadata.get("delegation_note") or "").strip() or None,
        "retry_of_run_id": _normalize_run_id_token(metadata.get("retry_of_run_id")),
        "retry_root_run_id": _normalize_run_id_token(metadata.get("retry_root_run_id")),
    }


def _run_relation_summary(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "run_id": snapshot.get("run_id"),
        "status": snapshot.get("status"),
        "agent_role": snapshot.get("agent_role"),
        "agent_role_source": snapshot.get("agent_role_source"),
        "agent_label": AGENT_WORKSPACE_LABELS.get(str(snapshot.get("agent_role") or "").strip().lower(), str(snapshot.get("agent_role") or "")) if snapshot.get("agent_role") else None,
        "user_goal": snapshot.get("user_goal"),
        "result_summary": snapshot.get("result_summary"),
        "created_at": snapshot.get("created_at"),
        "updated_at": snapshot.get("updated_at"),
        "completed_at": snapshot.get("completed_at"),
        "parent_run_id": snapshot.get("parent_run_id"),
        "delegation_root_run_id": snapshot.get("delegation_root_run_id"),
        "delegated_by_run_id": snapshot.get("delegated_by_run_id"),
        "delegated_by_role": snapshot.get("delegated_by_role"),
        "delegation_note": snapshot.get("delegation_note"),
        "retry_of_run_id": snapshot.get("retry_of_run_id"),
        "retry_root_run_id": snapshot.get("retry_root_run_id"),
        "retry_sequence": snapshot.get("retry_sequence"),
    }


def _iter_known_run_snapshots() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for run_id, run in list(runs.items()):
        if not isinstance(run, dict):
            continue
        snapshot = _serialize_run_snapshot(run_id, run)
        run_id_value = str(snapshot.get("run_id") or "").strip()
        if not run_id_value or run_id_value in seen:
            continue
        seen.add(run_id_value)
        items.append(snapshot)
    with RUN_HISTORY_LOCK:
        history_items = list(RUN_HISTORY)
    for item in history_items:
        if not isinstance(item, dict):
            continue
        run_id_value = str(item.get("run_id") or "").strip()
        if not run_id_value or run_id_value in seen:
            continue
        seen.add(run_id_value)
        items.append(item)
    return items


def _find_run_relationships(target_run_id: str, snapshot: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
    relationships = _extract_run_relationships_from_context(context) if isinstance(context, dict) else {}
    parent_run_id = relationships.get("parent_run_id")
    parent_summary: Optional[Dict[str, Any]] = None
    child_summaries: List[Dict[str, Any]] = []
    for candidate in _iter_known_run_snapshots():
        candidate_run_id = str(candidate.get("run_id") or "").strip()
        if not candidate_run_id or candidate_run_id == target_run_id:
            continue
        candidate_parent_run_id = _normalize_run_id_token(candidate.get("parent_run_id"))
        if candidate_parent_run_id == target_run_id:
            child_summaries.append(_run_relation_summary(candidate))
        if parent_run_id and candidate_run_id == parent_run_id:
            parent_summary = _run_relation_summary(candidate)
    child_summaries.sort(
        key=lambda item: (
            _parse_utc_ts(item.get("updated_at")) or _parse_utc_ts(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(item.get("run_id") or ""),
        ),
        reverse=True,
    )
    return parent_summary, child_summaries


def _build_delegation_summary(
    snapshot: Dict[str, Any],
    child_runs: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if not isinstance(child_runs, list) or not child_runs:
        return None

    total_children = len(child_runs)
    latest_by_lineage: Dict[str, Dict[str, Any]] = {}
    for child in child_runs:
        lineage_key = (
            _normalize_run_id_token(child.get("retry_root_run_id"))
            or _normalize_run_id_token(child.get("retry_of_run_id"))
            or _normalize_run_id_token(child.get("run_id"))
            or str(child.get("run_id") or "")
        )
        previous = latest_by_lineage.get(lineage_key)
        child_sort_key = (
            _parse_utc_ts(child.get("updated_at")) or _parse_utc_ts(child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(child.get("run_id") or ""),
        )
        previous_sort_key = (
            _parse_utc_ts(previous.get("updated_at")) or _parse_utc_ts(previous.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            str(previous.get("run_id") or ""),
        ) if isinstance(previous, dict) else None
        if previous_sort_key is None or child_sort_key > previous_sort_key:
            latest_by_lineage[lineage_key] = child

    effective_child_runs = list(latest_by_lineage.values())
    effective_children = len(effective_child_runs)
    terminal_children = 0
    completed_children = 0
    failed_children = 0
    waiting_children = 0
    active_children = 0
    child_roles: List[str] = []
    child_summaries: List[str] = []
    failed_run_ids: List[str] = []

    for child in effective_child_runs:
        status = str(child.get("status") or "").strip().lower()
        role = normalize_agent_role(child.get("agent_role")) or str(child.get("agent_role") or "").strip().lower()
        if role and role not in child_roles:
            child_roles.append(role)
        if status in TERMINAL_RUN_STATUSES:
            terminal_children += 1
        else:
            active_children += 1
        if status == "completed":
            completed_children += 1
        elif status == "failed":
            failed_children += 1
            child_run_id = _normalize_run_id_token(child.get("run_id"))
            if child_run_id:
                failed_run_ids.append(child_run_id)
        elif status in {"waiting", "waiting_for_input"}:
            waiting_children += 1

        label = AGENT_WORKSPACE_LABELS.get(role, role or "Agent")
        summary = str(child.get("result_summary") or child.get("user_goal") or "").strip()
        if status == "completed" and summary:
            child_summaries.append(f"{label}: {summary}")
        elif status == "failed":
            child_summaries.append(f"{label}: failed")
        elif status in {"waiting", "waiting_for_input"}:
            child_summaries.append(f"{label}: waiting")
        elif status and status not in TERMINAL_RUN_STATUSES:
            child_summaries.append(f"{label}: {status}")

    if active_children > 0:
        overall_status = "active"
        next_action = "waiting_for_children"
    elif waiting_children > 0:
        overall_status = "waiting"
        next_action = "resolve_child_approvals"
    elif failed_children > 0:
        overall_status = "attention"
        next_action = "retry_failed_children"
    else:
        overall_status = "completed"
        next_action = "merge_results"

    summary_text = "; ".join(child_summaries[:4]).strip() or None
    return {
        "ready": active_children == 0 and waiting_children == 0,
        "overall_status": overall_status,
        "next_action": next_action,
        "total_children": total_children,
        "effective_children": effective_children,
        "terminal_children": terminal_children,
        "completed_children": completed_children,
        "failed_children": failed_children,
        "waiting_children": waiting_children,
        "active_children": active_children,
        "failed_run_ids": failed_run_ids,
        "retryable_failed_children": len(failed_run_ids),
        "ready_for_merge": active_children == 0 and waiting_children == 0 and failed_children == 0 and completed_children > 0,
        "child_roles": child_roles,
        "summary_text": summary_text,
        "parent_run_id": snapshot.get("run_id"),
    }


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

    workflow_snapshot = None
    if str(req.workflow_id or "").strip():
        workflow_snapshot = fetch_workflow_snapshot(req.workflow_id)
        if isinstance(workflow_snapshot, dict):
            metadata["workflow_schema_version"] = str(
                workflow_snapshot.get("definition", {}).get("version") or ""
            ).strip() or None
            if workflow_snapshot.get("name") and "workflow_name" not in metadata:
                metadata["workflow_name"] = workflow_snapshot.get("name")
            if workflow_snapshot.get("status"):
                metadata["workflow_status"] = workflow_snapshot.get("status")

    return {
        "engine": engine,
        "metadata": metadata,
        "workflow_snapshot": workflow_snapshot,
    }


def _local_execution_requires_start_confirmation(metadata: Dict[str, Any], precheck: Dict[str, Any]) -> bool:
    target = str(metadata.get("execution_target_selected") or metadata.get("execution_target") or "").strip().lower()
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()
    if target != EXECUTION_TARGET_LOCAL_COMPANION:
        return False
    if outcome_pack != LOCAL_EXECUTION_PACK_ID:
        return False
    return bool(precheck.get("require_confirmation_count") or precheck.get("approval_required_count"))


def _precheck_human_action_labels(precheck: Dict[str, Any], decision: str = "require_confirmation") -> List[str]:
    items = precheck.get("items") if isinstance(precheck.get("items"), list) else []
    labels: List[str] = []
    seen: Set[str] = set()
    accepted = {str(decision or "").strip().lower()}
    if "require_confirmation" in accepted:
        accepted.add("approval_required")
    if "deny" in accepted:
        accepted.add("blocked")
    for item in items:
        if not isinstance(item, dict):
            continue
        item_decision = str(item.get("execution_decision") or item.get("decision") or "").strip().lower()
        if item_decision not in accepted:
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


def _local_execution_confirmation_prompt(precheck: Dict[str, Any]) -> str:
    labels = _precheck_human_action_labels(precheck, decision="require_confirmation")
    if labels:
        return f"Confirmation required before local companion execution: {', '.join(labels)}."
    return "Confirmation required before local companion execution."


def _local_execution_block_prompt(precheck: Dict[str, Any]) -> str:
    labels = _precheck_human_action_labels(precheck, decision="deny")
    if labels:
        return f"Run blocked by local execution policy: {', '.join(labels)}."
    return "Run blocked by local execution policy."


def _mark_local_execution_tools_approved(metadata: Dict[str, Any]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else None
    if not isinstance(precheck, dict):
        return

    approved_tools = [
        str(item).strip().lower()
        for item in (precheck.get("require_confirmation") or precheck.get("approval_required") or [])
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
            next_item["execution_decision"] = "allow"
            next_item["decision"] = "allow"
            next_item["reason"] = "confirmed_for_local_execution"
        rewritten_items.append(next_item)

    precheck["require_confirmation"] = []
    precheck["require_confirmation_count"] = 0
    precheck["approval_required"] = []
    precheck["approval_required_count"] = 0
    precheck["allowed"] = sorted(allowed_set)
    precheck["allow_count"] = len(precheck["allowed"])
    precheck["items"] = rewritten_items
    metadata["tool_policy_precheck"] = precheck


def _create_run_from_request(req: RunStartRequest, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    precheck_fn = globals().get("_compute_tool_policy_precheck")
    create_run_fn = globals().get("create_run")
    begin_confirmation_fn = globals().get("_begin_run_pending_confirmation") or globals().get("_begin_run_pending_approval")
    if not callable(precheck_fn):
        from server_modules.runs_execution import _compute_tool_policy_precheck as precheck_fn  # type: ignore[assignment]
    if not callable(create_run_fn):
        from server_modules.runs_execution import create_run as create_run_fn  # type: ignore[assignment]
    if not callable(begin_confirmation_fn):
        from server_modules.runs_core import _begin_run_pending_confirmation as begin_confirmation_fn  # type: ignore[assignment]

    prepared = _prepare_run_start_request(req)
    engine = prepared["engine"]
    metadata = prepared["metadata"]
    workflow_snapshot = prepared.get("workflow_snapshot") if isinstance(prepared.get("workflow_snapshot"), dict) else None
    route = decide_execution_target(metadata, schedule_id=schedule_id)
    metadata = dict(metadata)
    metadata = apply_execution_route_metadata(metadata, route)
    doctor_preflight = build_doctor_run_gate_from_snapshot(
        execution_target=route["selected"],
        metadata=metadata,
        provider=req.provider,
        credential_id=req.credential_id,
    )
    if bool(doctor_preflight.get("blocking")):
        raise HTTPException(
            status_code=409,
            detail=str(doctor_preflight.get("detail") or doctor_preflight.get("title") or "Run blocked by doctor policy."),
        )
    metadata["doctor_preflight"] = doctor_preflight

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
        "workflow_definition": workflow_snapshot.get("definition") if isinstance(workflow_snapshot, dict) else None,
        "workflow_name": workflow_snapshot.get("name") if isinstance(workflow_snapshot, dict) else None,
        "workflow_status": workflow_snapshot.get("status") if isinstance(workflow_snapshot, dict) else None,
    }
    metadata["tool_policy_precheck"] = precheck_fn(preview_context)
    if metadata["tool_policy_precheck"].get("blocked_count"):
        raise HTTPException(
            status_code=409,
            detail=_local_execution_block_prompt(metadata["tool_policy_precheck"]),
        )
    runtime_policy = resolve_runtime_policy_mode(
        metadata,
        selected_target=metadata.get("execution_target_selected") or metadata.get("execution_target"),
    )
    metadata["policy_mode"] = runtime_policy.get("policy_mode")
    needs_local_confirmation = _local_execution_requires_start_confirmation(metadata, metadata["tool_policy_precheck"])
    if needs_local_confirmation:
        metadata["local_execution_waiting_confirmation"] = True
        metadata["local_execution_waiting_approval"] = True
        preview_context["metadata"] = metadata
    run_id = create_run_fn(
        engine=engine,
        context=preview_context,
        defer_local_enqueue=needs_local_confirmation,
    )
    status = "starting"
    if needs_local_confirmation:
        approval_labels = _precheck_human_action_labels(metadata["tool_policy_precheck"], decision="require_confirmation")
        pending = begin_confirmation_fn(
            run_id,
            _local_execution_confirmation_prompt(metadata["tool_policy_precheck"]),
            source="local_execution_start",
            metadata={
                "target": metadata.get("execution_target_selected"),
                "policy_mode": metadata.get("policy_mode"),
                "approval_actions": list(metadata["tool_policy_precheck"].get("require_confirmation") or []),
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
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": route,
        "doctor_preflight": doctor_preflight,
        "pending_confirmation": pending,
        "pending_approval": pending,
    }


def _lookup_run_snapshot(run_id: str) -> Dict[str, Any]:
    active = runs.get(run_id)
    archived_item = _get_archived_run_history_item(run_id)
    active_snapshot = _serialize_run_snapshot(run_id, active) if isinstance(active, dict) else None
    chosen_snapshot = _prefer_archived_snapshot(active_snapshot, archived_item)
    if isinstance(chosen_snapshot, dict):
        return chosen_snapshot
    return _get_replay_payload(run_id)


def _build_delegated_run_request(
    parent_snapshot: Dict[str, Any],
    child_payload: Dict[str, Any],
    note: Optional[str] = None,
) -> RunStartRequest:
    parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
    parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
    if not isinstance(parent_metadata, dict):
        parent_metadata = {}
    child_metadata = dict(child_payload.get("metadata") or {})
    parent_run_id = str(parent_snapshot.get("run_id") or "").strip()
    root_run_id = _normalize_run_id_token(parent_snapshot.get("delegation_root_run_id") or parent_metadata.get("delegation_root_run_id")) or parent_run_id
    delegated_by_role = normalize_agent_role(parent_snapshot.get("agent_role") or parent_metadata.get("agent_role")) or "orchestrator"

    child_metadata["parent_run_id"] = parent_run_id
    child_metadata["delegation_root_run_id"] = root_run_id
    child_metadata["delegated_by_run_id"] = parent_run_id
    child_metadata["delegated_by_role"] = delegated_by_role
    if note:
        child_metadata["delegation_note"] = note
    selected_target = str(parent_metadata.get("execution_target_selected") or parent_metadata.get("execution_target") or "").strip().lower()
    if selected_target in VALID_EXECUTION_TARGETS and "execution_target" not in child_metadata:
        child_metadata["execution_target"] = selected_target
    if parent_metadata.get("trust_mode") and "trust_mode" not in child_metadata:
        child_metadata["trust_mode"] = parent_metadata.get("trust_mode")

    return RunStartRequest(
        engine=str(parent_snapshot.get("engine") or "orion"),
        workflow_id=parent_context.get("workflow_id"),
        workspace_id=parent_context.get("workspace_id"),
        user_goal=str(child_payload.get("user_goal") or "").strip(),
        business_plan=str(child_payload.get("business_plan") or parent_context.get("business_plan") or "").strip() or None,
        agent_role=str(child_payload.get("agent_role") or "").strip(),
        provider=parent_context.get("provider"),
        model=parent_context.get("model"),
        credential_id=parent_context.get("credential_id"),
        parent_run_id=parent_run_id,
        metadata=child_metadata,
    )


def _refresh_parent_delegation_state(parent_run_id: str, *, triggering_run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        snapshot = _lookup_run_snapshot(parent_run_id)
    except HTTPException:
        return None

    parent_run, child_runs = _find_run_relationships(parent_run_id, snapshot)
    delegation_summary = _build_delegation_summary(snapshot, child_runs)
    if delegation_summary is None:
        return None

    refreshed_at = _utc_now_iso()
    orchestration_payload = {
        "summary": delegation_summary,
        "parent_run": parent_run,
        "child_runs": child_runs,
        "triggering_run_id": triggering_run_id,
        "updated_at": refreshed_at,
    }

    live_parent = runs.get(parent_run_id)
    if isinstance(live_parent, dict):
        context = live_parent.setdefault("context", {})
        if not isinstance(context, dict):
            context = {}
            live_parent["context"] = context
        metadata = context.setdefault("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}
            context["metadata"] = metadata
        previous_next_action = str(metadata.get("delegation_next_action") or "").strip()
        metadata["delegation_summary_cache"] = delegation_summary
        metadata["delegation_last_refreshed_at"] = refreshed_at
        metadata["delegation_next_action"] = delegation_summary.get("next_action")
        metadata["delegation_ready"] = bool(delegation_summary.get("ready"))

        result_data = live_parent.get("result_data")
        if not isinstance(result_data, dict):
            result_data = {}
        result_data["orchestration"] = orchestration_payload
        live_parent["result_data"] = result_data
        live_parent["updated_at"] = refreshed_at
        _refresh_archived_run_snapshot(parent_run_id, live_parent)

        if previous_next_action != str(delegation_summary.get("next_action") or "").strip():
            log_queue = live_parent.get("logs")
            if log_queue is not None:
                next_action = str(delegation_summary.get("next_action") or "").strip()
                message_map = {
                    "waiting_for_children": "Delegated child runs are still in progress.",
                    "resolve_child_approvals": "Delegated child runs are waiting for approval.",
                    "retry_failed_children": "Delegated child runs failed and can be retried.",
                    "merge_results": "Delegated child runs finished and results are ready to merge.",
                }
                emit_log(
                    log_queue,
                    "info",
                    message_map.get(next_action, "Delegation state updated."),
                    event="delegation_state",
                    data={
                        "parent_run_id": parent_run_id,
                        "triggering_run_id": triggering_run_id,
                        "summary": delegation_summary,
                    },
                )
    else:
        context = snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}
        metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
        if isinstance(metadata, dict):
            metadata["delegation_summary_cache"] = delegation_summary
            metadata["delegation_last_refreshed_at"] = refreshed_at
            metadata["delegation_next_action"] = delegation_summary.get("next_action")
            metadata["delegation_ready"] = bool(delegation_summary.get("ready"))
        result_data = snapshot.get("result_data")
        if not isinstance(result_data, dict):
            result_data = {}
        result_data["orchestration"] = orchestration_payload
        snapshot["result_data"] = result_data
        snapshot["updated_at"] = refreshed_at
        _upsert_run_history_snapshot(snapshot)

    return delegation_summary


def _build_retry_child_payload(parent_snapshot: Dict[str, Any], child_snapshot: Dict[str, Any], *, note: Optional[str] = None) -> Dict[str, Any]:
    child_context = child_snapshot.get("context") if isinstance(child_snapshot.get("context"), dict) else {}
    child_metadata = child_context.get("metadata") if isinstance(child_context.get("metadata"), dict) else {}
    if not isinstance(child_metadata, dict):
        child_metadata = {}
    retry_root_run_id = _normalize_run_id_token(child_metadata.get("retry_root_run_id")) or _normalize_run_id_token(child_snapshot.get("run_id"))
    retry_sequence = int(child_metadata.get("retry_sequence") or 0) + 1
    next_metadata = dict(child_metadata)
    next_metadata["retry_of_run_id"] = str(child_snapshot.get("run_id") or "").strip()
    next_metadata["retry_root_run_id"] = retry_root_run_id
    next_metadata["retry_sequence"] = retry_sequence
    if note:
        next_metadata["delegation_retry_note"] = note
    return {
        "agent_role": normalize_agent_role(child_snapshot.get("agent_role") or child_metadata.get("agent_role")) or str(child_snapshot.get("agent_role") or "").strip(),
        "user_goal": str(child_context.get("user_goal") or child_snapshot.get("user_goal") or "").strip(),
        "business_plan": str(child_context.get("business_plan") or "").strip() or None,
        "metadata": next_metadata,
    }


AUTO_DELEGATION_ROLE_RULES: Dict[str, Dict[str, Any]] = {
    "research": {
        "keywords": [
            "research", "market", "analysis", "analyze", "brief", "summary", "competitor",
            "plan", "strategy", "launch", "marketing", "investigate", "study",
        ],
        "goal": "Research and summarize the key findings for this objective: {objective}",
        "reason": "Research and planning support is needed.",
    },
    "builder": {
        "keywords": [
            "build", "implement", "fix", "ship", "code", "frontend", "backend", "bug",
            "automation", "platform", "app", "browser", "workflow", "integrat",
        ],
        "goal": "Implement or validate the execution work needed for this objective: {objective}",
        "reason": "Execution or implementation work is needed.",
    },
    "sales": {
        "keywords": [
            "sales", "lead", "booking", "book", "appointment", "pipeline", "conversion",
            "convert", "follow-up", "follow up", "outreach",
        ],
        "goal": "Handle the sales or booking follow-through required for this objective: {objective}",
        "reason": "Sales or booking work is needed.",
    },
    "support": {
        "keywords": [
            "support", "customer", "inbox", "message", "feedback", "complaint", "reply",
            "telegram", "whatsapp", "email",
        ],
        "goal": "Handle customer-facing support follow-up for this objective: {objective}",
        "reason": "Customer support work is needed.",
    },
    "finance": {
        "keywords": [
            "finance", "budget", "revenue", "price", "pricing", "invoice", "expense",
            "spreadsheet", "sheet", "excel", "report",
        ],
        "goal": "Prepare the financial or spreadsheet work needed for this objective: {objective}",
        "reason": "Financial or reporting work is needed.",
    },
    "private-assistant": {
        "keywords": [
            "personal", "study", "exam", "reminder", "calendar", "routine", "habit",
            "travel", "meal", "homework",
        ],
        "goal": "Handle the personal assistant follow-up for this objective: {objective}",
        "reason": "Personal assistance is needed.",
    },
}


def _build_auto_delegation_plan(
    parent_snapshot: Dict[str, Any],
    *,
    max_children: int = 3,
) -> List[Dict[str, Any]]:
    parent_context = parent_snapshot.get("context") if isinstance(parent_snapshot.get("context"), dict) else {}
    parent_metadata = parent_context.get("metadata") if isinstance(parent_context.get("metadata"), dict) else {}
    objective = str(
        parent_snapshot.get("user_goal")
        or parent_context.get("user_goal")
        or parent_context.get("business_plan")
        or parent_snapshot.get("result_summary")
        or ""
    ).strip()
    business_plan = str(parent_context.get("business_plan") or "").strip() or None
    combined = " ".join(
        part for part in [
            objective,
            business_plan or "",
            str(parent_snapshot.get("result_summary") or "").strip(),
            str((parent_metadata or {}).get("skill_scope") or "").strip(),
        ] if part
    ).lower()

    if not objective:
        objective = "Coordinate the delegated work needed for this run."

    scored: List[Tuple[int, str, Dict[str, Any]]] = []
    for role, rule in AUTO_DELEGATION_ROLE_RULES.items():
        keywords = [str(item).lower() for item in (rule.get("keywords") or []) if str(item).strip()]
        score = sum(1 for keyword in keywords if keyword in combined)
        if role == "research" and any(term in combined for term in ("plan", "strategy", "launch", "marketing")):
            score += 1
        if score <= 0:
            continue
        scored.append((score, role, rule))

    scored.sort(key=lambda item: (-item[0], item[1]))
    chosen: List[Tuple[str, Dict[str, Any]]] = []
    seen_roles: Set[str] = set()
    for _, role, rule in scored:
        if role in seen_roles:
            continue
        chosen.append((role, rule))
        seen_roles.add(role)
        if len(chosen) >= max_children:
            break

    if not chosen:
        chosen.append(("research", AUTO_DELEGATION_ROLE_RULES["research"]))
        if len(chosen) < max_children and any(term in combined for term in ("build", "implement", "fix", "platform", "app", "automation")):
            chosen.append(("builder", AUTO_DELEGATION_ROLE_RULES["builder"]))

    plan: List[Dict[str, Any]] = []
    for role, rule in chosen[:max_children]:
        plan.append(
            {
                "agent_role": role,
                "user_goal": str(rule.get("goal") or "{objective}").format(objective=objective),
                "business_plan": business_plan,
                "metadata": {
                    "auto_delegation_rule": role,
                    "auto_delegation_reason": str(rule.get("reason") or "").strip() or None,
                },
            }
        )
    return plan
