import threading

from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.doctor_gate import build_doctor_run_gate_from_snapshot
from server_modules.runs_engine import ENGINE_REGISTRY, ORION_ENGINE_VALIDATION_ERRORS
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

AUTO_RETRY_DELAY_SECONDS = 3.0
AUTO_RETRY_MAX_RETRIES = 1
STALE_CHILD_RUN_TIMEOUT_SECONDS = 300
ROUTING_PROVIDER_ORDER: Tuple[str, ...] = ("openai", "anthropic", "gemini", "codex_cli", "ollama")
_AUTO_RETRY_PENDING: Set[Tuple[str, str]] = set()
_AUTO_RETRY_ATTEMPTS: Dict[Tuple[str, str], int] = {}
_AUTO_RETRY_PENDING_LOCK = threading.Lock()

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


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _normalize_requested_max_iterations(value: Any) -> Optional[int]:
    if value in {None, ""}:
        return None
    parsed = _safe_int(value, 0)
    if parsed <= 0:
        raise HTTPException(status_code=400, detail="max_iterations must be greater than zero.")
    return parsed


def _failure_status(status: Any) -> bool:
    return str(status or "").strip().lower() in {"failed", "error", "timeout", "cancelled", "stopped"}


def _child_lineage_key(child: Dict[str, Any]) -> str:
    return (
        _normalize_run_id_token(child.get("retry_root_run_id"))
        or _normalize_run_id_token(child.get("retry_of_run_id"))
        or _normalize_run_id_token(child.get("run_id"))
        or str(child.get("run_id") or "")
    )


def _child_metadata(child: Dict[str, Any]) -> Dict[str, Any]:
    context = child.get("context") if isinstance(child.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    return dict(metadata) if isinstance(metadata, dict) else {}


def _child_retry_count(child: Dict[str, Any]) -> int:
    metadata = _child_metadata(child)
    return max(
        _safe_int(metadata.get("retry_count"), 0),
        _safe_int(metadata.get("retry_sequence"), 0),
        _safe_int(child.get("retry_sequence"), 0),
    )


def _parent_pending_retry_lineages(parent_run_id: str) -> Set[str]:
    with _AUTO_RETRY_PENDING_LOCK:
        return {lineage for parent, lineage in _AUTO_RETRY_PENDING if parent == str(parent_run_id or "").strip()}


def _auto_retry_attempt_count(parent_run_id: str, lineage_key: str, fallback: int = 0) -> int:
    with _AUTO_RETRY_PENDING_LOCK:
        return max(_safe_int(_AUTO_RETRY_ATTEMPTS.get((parent_run_id, lineage_key)), 0), _safe_int(fallback, 0))


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
        "retry_count": snapshot.get("retry_count"),
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
    *,
    extra_retry_pending_lineages: Optional[Set[str]] = None,
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

    pending_retry_lineages = _parent_pending_retry_lineages(str(snapshot.get("run_id") or ""))
    if isinstance(extra_retry_pending_lineages, set):
        pending_retry_lineages |= {str(item).strip() for item in extra_retry_pending_lineages if str(item).strip()}

    for child in effective_child_runs:
        status = str(child.get("status") or "").strip().lower()
        role = normalize_agent_role(child.get("agent_role")) or str(child.get("agent_role") or "").strip().lower()
        lineage_key = _child_lineage_key(child)
        retry_pending = bool(lineage_key and lineage_key in pending_retry_lineages and _failure_status(status))
        if role and role not in child_roles:
            child_roles.append(role)
        if retry_pending:
            active_children += 1
        elif status in TERMINAL_RUN_STATUSES:
            terminal_children += 1
        else:
            active_children += 1
        if status == "completed":
            completed_children += 1
        elif retry_pending:
            child_summaries.append(f"{AGENT_WORKSPACE_LABELS.get(role, role or 'Agent')}: retrying")
            continue
        elif _failure_status(status):
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
        elif _failure_status(status):
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
    from server_modules.run_service import RunPreparationServices, prepare_run_start_request

    return prepare_run_start_request(
        req,
        services=RunPreparationServices(
            engine_registry=ENGINE_REGISTRY,
            engine_validation_errors=ORION_ENGINE_VALIDATION_ERRORS,
            supported_outcome_packs=SUPPORTED_OUTCOME_PACKS,
            normalize_requested_max_iterations=_normalize_requested_max_iterations,
            normalize_trust_mode=normalize_trust_mode,
            trust_mode_aliases=TRUST_MODE_ALIASES,
            valid_trust_modes=VALID_TRUST_MODES,
            normalize_execution_target=normalize_execution_target,
            valid_execution_targets=VALID_EXECUTION_TARGETS,
            normalize_run_id_token=_normalize_run_id_token,
            normalize_agent_role=normalize_agent_role,
            detect_agent_role=_detect_agent_role,
            resolve_app_permissions=resolve_app_permissions,
            action_policy_from_app_permissions=action_policy_from_app_permissions,
            merge_action_policies=merge_action_policies,
            fetch_workflow_snapshot=fetch_workflow_snapshot,
        ),
    )


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


def _apply_browser_execution_metadata(metadata: Dict[str, Any]) -> None:
    precheck = metadata.get("tool_policy_precheck") if isinstance(metadata.get("tool_policy_precheck"), dict) else {}
    browser_policy = precheck.get("browser_automation_policy") if isinstance(precheck.get("browser_automation_policy"), dict) else {}
    session_profiles = list(browser_policy.get("session_profiles") or []) if isinstance(browser_policy, dict) else []
    immutable_plan_hash = str(browser_policy.get("immutable_plan_hash") or "").strip() if isinstance(browser_policy, dict) else ""
    if session_profiles:
        metadata["browser_session_profile"] = session_profiles[0]
    if immutable_plan_hash:
        metadata["browser_immutable_plan_hash"] = immutable_plan_hash
    if bool(browser_policy.get("reviewed_approval_required")):
        metadata["browser_reviewed_approval_required"] = True
    elif "browser_reviewed_approval_required" in metadata:
        metadata.pop("browser_reviewed_approval_required", None)


def _create_run_from_request(req: RunStartRequest, schedule_id: Optional[str] = None) -> Dict[str, Any]:
    from server_modules.run_service import PreparedRunCreationServices, create_run_from_prepared_request

    precheck_fn = globals().get("_compute_tool_policy_precheck")
    create_run_fn = globals().get("create_run")
    begin_confirmation_fn = globals().get("_begin_run_pending_confirmation") or globals().get("_begin_run_pending_approval")
    if not callable(precheck_fn):
        from server_modules.runs_execution import _compute_tool_policy_precheck as precheck_fn  # type: ignore[assignment]
    if not callable(create_run_fn):
        from server_modules.runs_execution import create_run as create_run_fn  # type: ignore[assignment]
    if not callable(begin_confirmation_fn):
        from server_modules.runs_core import _begin_run_pending_confirmation as begin_confirmation_fn  # type: ignore[assignment]

    created = create_run_from_prepared_request(
        req,
        prepared=_prepare_run_start_request(req),
        schedule_id=schedule_id,
        services=PreparedRunCreationServices(
            decide_execution_target=decide_execution_target,
            apply_execution_route_metadata=apply_execution_route_metadata,
            build_doctor_run_gate=build_doctor_run_gate_from_snapshot,
            agent_machine_inherited_owner_user_id=agent_machine_inherited_owner_user_id,
            compute_tool_policy_precheck=precheck_fn,
            apply_browser_execution_metadata=_apply_browser_execution_metadata,
            local_execution_block_prompt=_local_execution_block_prompt,
            resolve_runtime_policy_mode=resolve_runtime_policy_mode,
            agent_machine_full_trust_enabled=agent_machine_full_trust_enabled,
            local_execution_requires_start_confirmation=_local_execution_requires_start_confirmation,
            mark_local_execution_tools_approved=_mark_local_execution_tools_approved,
            precheck_human_action_labels=_precheck_human_action_labels,
            local_execution_confirmation_prompt=_local_execution_confirmation_prompt,
            begin_run_pending_confirmation=begin_confirmation_fn,
            create_run=create_run_fn,
            now_iso=lambda: datetime.utcnow().isoformat() + "Z",
        ),
    )
    metadata = created["metadata"]
    return {
        "run_id": created["run_id"],
        "engine": created["engine"],
        "status": created["status"],
        "agent_role": metadata.get("agent_role"),
        "agent_role_source": metadata.get("agent_role_source"),
        "parent_run_id": metadata.get("parent_run_id"),
        "delegation_root_run_id": metadata.get("delegation_root_run_id"),
        "delegated_by_run_id": metadata.get("delegated_by_run_id"),
        "delegated_by_role": metadata.get("delegated_by_role"),
        "route": created["route"],
        "doctor_preflight": created["doctor_preflight"],
        "pending_confirmation": created["pending_confirmation"],
        # Deprecated compatibility alias. Prefer `pending_confirmation`.
        "pending_approval": created["pending_confirmation"],
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
        max_iterations=_normalize_requested_max_iterations(
            child_payload.get("max_iterations")
            or child_metadata.get("max_iterations")
            or parent_context.get("max_iterations")
            or parent_metadata.get("max_iterations")
        ),
        agent_role=str(child_payload.get("agent_role") or "").strip(),
        provider=parent_context.get("provider"),
        model=parent_context.get("model"),
        credential_id=parent_context.get("credential_id"),
        parent_run_id=parent_run_id,
        metadata=child_metadata,
    )


def _timeout_stale_child_runs(parent_run_id: str, child_runs: List[Dict[str, Any]]) -> List[str]:
    status_setter = globals().get("set_run_status")
    if not callable(status_setter):
        from server_modules.runs_core import set_run_status as status_setter  # type: ignore[assignment]
    now = _utc_now()
    timed_out: List[str] = []
    for child in child_runs:
        status = str(child.get("status") or "").strip().lower()
        if not status or status in TERMINAL_RUN_STATUSES or status in {"waiting", "waiting_for_input"}:
            continue
        run_id = _normalize_run_id_token(child.get("run_id"))
        if not run_id:
            continue
        last_progress = (
            _parse_utc_ts(child.get("local_last_progress_at"))
            or _parse_utc_ts(child.get("local_last_heartbeat_at"))
            or _parse_utc_ts(child.get("updated_at"))
            or _parse_utc_ts(child.get("created_at"))
        )
        if last_progress is None or (now - last_progress).total_seconds() <= STALE_CHILD_RUN_TIMEOUT_SECONDS:
            continue
        live_child = runs.get(run_id)
        if not isinstance(live_child, dict):
            continue
        live_child["result"] = "Child run timed out after 5 minutes without progress."
        result_data = live_child.get("result_data")
        if not isinstance(result_data, dict):
            result_data = {}
        result_data.update(
            {
                "summary": "Child run timed out after 5 minutes without progress.",
                "error": "delegated_child_timeout",
                "parent_run_id": parent_run_id,
            }
        )
        live_child["result_data"] = result_data
        log_queue = live_child.get("logs")
        if log_queue is not None:
            emit_log(
                log_queue,
                "error",
                "Child run timed out after 5 minutes without progress.",
                event="delegated_child_timeout",
                data={"run_id": run_id, "parent_run_id": parent_run_id},
            )
        status_setter(run_id, "failed")
        timed_out.append(run_id)
    return timed_out


def _schedule_auto_retry_for_failed_children(
    parent_snapshot: Dict[str, Any],
    child_runs: List[Dict[str, Any]],
    *,
    triggering_run_id: Optional[str] = None,
) -> Set[str]:
    parent_run_id = str(parent_snapshot.get("run_id") or "").strip()
    if not parent_run_id:
        return []

    latest_by_lineage: Dict[str, Dict[str, Any]] = {}
    for child in child_runs:
        lineage_key = _child_lineage_key(child)
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

    scheduled: Set[str] = set()
    live_parent = runs.get(parent_run_id)
    log_queue = live_parent.get("logs") if isinstance(live_parent, dict) else None

    for lineage_key, child in latest_by_lineage.items():
        status = str(child.get("status") or "").strip().lower()
        if not _failure_status(status):
            continue
        if not lineage_key:
            continue
        with _AUTO_RETRY_PENDING_LOCK:
            pending_key = (parent_run_id, lineage_key)
            retry_count = max(
                _child_retry_count(child),
                _safe_int(_AUTO_RETRY_ATTEMPTS.get(pending_key), 0),
            )
            if retry_count >= AUTO_RETRY_MAX_RETRIES:
                continue
            if pending_key in _AUTO_RETRY_PENDING:
                continue
            _AUTO_RETRY_PENDING.add(pending_key)
            _AUTO_RETRY_ATTEMPTS[pending_key] = retry_count + 1
        child_run_id = str(child.get("run_id") or "").strip()
        scheduled.add(lineage_key)
        if log_queue is not None:
            emit_log(
                log_queue,
                "info",
                f"Child run {child_run_id} failed, retrying (attempt {retry_count + 2}/{AUTO_RETRY_MAX_RETRIES + 1})...",
                event="delegation_retry",
                data={
                    "parent_run_id": parent_run_id,
                    "triggering_run_id": triggering_run_id,
                    "child_run_id": child_run_id,
                    "retry_count": retry_count + 1,
                },
            )

        def _retry_job(parent_id: str = parent_run_id, failed_child: Dict[str, Any] = dict(child), pending: Tuple[str, str] = pending_key) -> None:
            try:
                current_parent_snapshot = _lookup_run_snapshot(parent_id)
                _, current_children = _find_run_relationships(parent_id, current_parent_snapshot)
                latest_for_lineage = None
                for current_child in current_children:
                    if _child_lineage_key(current_child) != pending[1]:
                        continue
                    if latest_for_lineage is None:
                        latest_for_lineage = current_child
                        continue
                    current_sort_key = (
                        _parse_utc_ts(current_child.get("updated_at")) or _parse_utc_ts(current_child.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                        str(current_child.get("run_id") or ""),
                    )
                    latest_sort_key = (
                        _parse_utc_ts(latest_for_lineage.get("updated_at")) or _parse_utc_ts(latest_for_lineage.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                        str(latest_for_lineage.get("run_id") or ""),
                    )
                    if current_sort_key > latest_sort_key:
                        latest_for_lineage = current_child
                if not isinstance(latest_for_lineage, dict):
                    return
                if str(latest_for_lineage.get("run_id") or "").strip() != str(failed_child.get("run_id") or "").strip():
                    return
                if not _failure_status(latest_for_lineage.get("status")):
                    return
                retry_payload = _build_retry_child_payload(
                    current_parent_snapshot,
                    latest_for_lineage,
                    note="Automatic retry after delegated child failure.",
                )
                retry_metadata = retry_payload.get("metadata") if isinstance(retry_payload.get("metadata"), dict) else {}
                if isinstance(retry_metadata, dict):
                    retry_metadata["auto_retry"] = True
                    retry_payload["metadata"] = retry_metadata
                delegated_req = _build_delegated_run_request(
                    current_parent_snapshot,
                    retry_payload,
                    note="Automatic retry after delegated child failure.",
                )
                _create_run_from_request(delegated_req)
            except Exception as exc:
                current_parent = runs.get(parent_id)
                current_log_queue = current_parent.get("logs") if isinstance(current_parent, dict) else None
                if current_log_queue is not None:
                    emit_log(
                        current_log_queue,
                        "error",
                        f"Automatic child retry failed: {str(exc)[:280]}",
                        event="delegation_retry_failed",
                        data={"parent_run_id": parent_id, "child_run_id": str(failed_child.get('run_id') or '').strip()},
                    )
            finally:
                with _AUTO_RETRY_PENDING_LOCK:
                    _AUTO_RETRY_PENDING.discard(pending)
                _refresh_parent_delegation_state(parent_id, triggering_run_id=str(failed_child.get("run_id") or "").strip() or None)

        timer = threading.Timer(AUTO_RETRY_DELAY_SECONDS, _retry_job)
        timer.daemon = True
        timer.start()

    return scheduled


def _refresh_parent_delegation_state(parent_run_id: str, *, triggering_run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        snapshot = _lookup_run_snapshot(parent_run_id)
    except HTTPException:
        return None

    parent_run, child_runs = _find_run_relationships(parent_run_id, snapshot)
    stale_timeouts = _timeout_stale_child_runs(parent_run_id, child_runs)
    if stale_timeouts:
        try:
            snapshot = _lookup_run_snapshot(parent_run_id)
            parent_run, child_runs = _find_run_relationships(parent_run_id, snapshot)
        except HTTPException:
            return None
    scheduled_retries = _schedule_auto_retry_for_failed_children(
        snapshot,
        child_runs,
        triggering_run_id=triggering_run_id or (stale_timeouts[0] if stale_timeouts else None),
    )
    if stale_timeouts or scheduled_retries:
        try:
            snapshot = _lookup_run_snapshot(parent_run_id)
            parent_run, child_runs = _find_run_relationships(parent_run_id, snapshot)
        except HTTPException:
            return None
    delegation_summary = _build_delegation_summary(
        snapshot,
        child_runs,
        extra_retry_pending_lineages=scheduled_retries,
    )
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
                    "resolve_child_approvals": "Delegated child runs are waiting for confirmation.",
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
    next_metadata["retry_count"] = _child_retry_count(child_snapshot) + 1
    if note:
        next_metadata["delegation_retry_note"] = note
    return {
        "agent_role": normalize_agent_role(child_snapshot.get("agent_role") or child_metadata.get("agent_role")) or str(child_snapshot.get("agent_role") or "").strip(),
        "user_goal": str(child_context.get("user_goal") or child_snapshot.get("user_goal") or "").strip(),
        "business_plan": str(child_context.get("business_plan") or "").strip() or None,
        "max_iterations": _normalize_requested_max_iterations(
            child_context.get("max_iterations")
            or child_metadata.get("max_iterations")
        ),
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


def _fastest_routing_context() -> Optional[Dict[str, str]]:
    from scripts.orion_local_worker_llm import provider_has_key, resolve_requested_model

    for provider in ROUTING_PROVIDER_ORDER:
        if not provider_has_key(provider):
            continue
        model = str(resolve_requested_model({"provider": provider}, {"provider": provider}, provider)).strip() or None
        return {"provider": provider, "model": model or ""}
    return None


def _llm_auto_delegate_role(
    *,
    objective: str,
    business_plan: Optional[str],
    parent_snapshot: Dict[str, Any],
) -> Optional[Dict[str, str]]:
    from server_modules.llm_task import llm_task

    routing_context = _fastest_routing_context()
    if not isinstance(routing_context, dict):
        return None

    agent_list_lines = [
        f"- {role}: {str(rule.get('reason') or '').strip() or str(rule.get('goal') or '').strip()}"
        for role, rule in AUTO_DELEGATION_ROLE_RULES.items()
    ]
    prompt_parts = [
        "You are routing a task to the most appropriate specialist agent.",
        "",
        "Available agents:",
        *agent_list_lines,
        "",
        "Task to route:",
        objective.strip() or "Coordinate the delegated work needed for this run.",
    ]
    if business_plan:
        prompt_parts.extend(["", f"Business context: {business_plan.strip()}"])
    result = llm_task(
        "\n".join(prompt_parts).strip() + '\n\nRespond with JSON only: {"agent":"<agent_name>","reason":"<one sentence why>"}',
        schema={
            "type": "object",
            "properties": {
                "agent": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["agent", "reason"],
        },
        context={
            "provider": routing_context.get("provider"),
            "model": routing_context.get("model"),
        },
        metadata={
            "provider": routing_context.get("provider"),
            "model": routing_context.get("model"),
            "source": "delegation_routing",
            "disable_provider_fallback": True,
            "tools": [],
            "workspace_id": parent_snapshot.get("workspace_id"),
        },
    )
    if not isinstance(result, dict):
        return None
    agent_role = normalize_agent_role(result.get("agent"))
    reason = str(result.get("reason") or "").strip()
    if not agent_role or not reason:
        return None
    return {"agent_role": agent_role, "reason": reason}


def _emit_auto_delegation_routing_log(
    parent_run_id: str,
    plan: List[Dict[str, Any]],
    *,
    strategy: str,
    reason: str = "",
) -> None:
    run = runs.get(parent_run_id)
    if not isinstance(run, dict):
        return
    log_queue = run.get("logs")
    if log_queue is None:
        return
    emit_log(
        log_queue,
        "info",
        "Delegation routing selected specialist agents.",
        event="delegation_routing",
        data={
            "parent_run_id": parent_run_id,
            "strategy": strategy,
            "reason": str(reason or "").strip() or None,
            "plan": plan,
        },
    )


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

    llm_route = None
    try:
        llm_route = _llm_auto_delegate_role(
            objective=objective,
            business_plan=business_plan,
            parent_snapshot=parent_snapshot,
        )
    except Exception:
        llm_route = None

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
    if isinstance(llm_route, dict):
        llm_role = normalize_agent_role(llm_route.get("agent_role"))
        llm_rule = AUTO_DELEGATION_ROLE_RULES.get(llm_role or "")
        if llm_role and isinstance(llm_rule, dict):
            chosen.append((llm_role, llm_rule))
            seen_roles.add(llm_role)
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
        route_reason = str(rule.get("reason") or "").strip() or None
        route_source = "keyword"
        if isinstance(llm_route, dict) and role == str(llm_route.get("agent_role") or "").strip():
            route_reason = str(llm_route.get("reason") or "").strip() or route_reason
            route_source = "llm"
        plan.append(
            {
                "agent_role": role,
                "user_goal": str(rule.get("goal") or "{objective}").format(objective=objective),
                "business_plan": business_plan,
                "metadata": {
                    "auto_delegation_rule": role,
                    "auto_delegation_reason": route_reason,
                    "auto_delegation_source": route_source,
                },
            }
        )
    return plan
