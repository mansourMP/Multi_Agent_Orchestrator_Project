import logging

from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.runs_engine import (
    ENGINE_REGISTRY,
    format_agent_summary,
    generate_with_candidate_failover,
    requires_human_approval,
    resolve_run_execution_context,
    wait_for_human_decision,
)
from server_modules.runs_output import _json_safe
from server_modules.health_diagnostics import _build_skill_contract_from_metadata
from server_modules.runs_core import set_run_status, emit_log

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

LOGGER = logging.getLogger(__name__)


def _log_execution_boundary(log_queue: queue.Queue, run_id: str, phase: str, *, status: Optional[str] = None, timeout_seconds: Optional[int] = None) -> None:
    timestamp = _utc_now_iso()
    message = f"Execution {phase}: run_id={run_id} timestamp={timestamp}"
    payload = {"run_id": run_id, "timestamp": timestamp}
    if status:
        payload["status"] = status
        message = f"{message} status={status}"
    if timeout_seconds is not None:
        payload["timeout_seconds"] = timeout_seconds
        message = f"{message} timeout_seconds={timeout_seconds}"
    emit_log(log_queue, "info", message, event=f"execution_{phase}", data=payload)
    LOGGER.info(message)


def _execute_engine_with_timeout(engine: Any, run_id: str, timeout_seconds: int) -> Dict[str, Any]:
    result: Dict[str, Any] = {"error": None, "timed_out": False}

    def _target() -> None:
        try:
            engine.execute(run_id)
        except Exception as exc:
            result["error"] = exc

    worker = threading.Thread(target=_target, name=f"run-execution-{run_id}", daemon=True)
    worker.start()
    worker.join(timeout_seconds)
    if worker.is_alive():
        result["timed_out"] = True
    return result

def selected_execution_target_from_context(context: Optional[Dict[str, Any]]) -> str:
    if not isinstance(context, dict):
        return EXECUTION_TARGET_LOCAL_COMPANION if ORION_LOCAL_COMPANION_ENABLED else EXECUTION_TARGET_CLOUD
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected = str(metadata.get("execution_target_selected") or "").strip().lower()
    if selected in VALID_EXECUTION_TARGETS:
        return selected
    requested = str(metadata.get("execution_target_requested") or "").strip().lower()
    if requested in VALID_EXECUTION_TARGETS:
        return requested
    return EXECUTION_TARGET_LOCAL_COMPANION if ORION_LOCAL_COMPANION_ENABLED else EXECUTION_TARGET_CLOUD


def _predict_tool_ids_for_context(context: Dict[str, Any]) -> List[str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = str(metadata.get("outcome_pack") or "").strip().lower()
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}

    if pack_id == CUSTOMER_OPS_PACK_ID:
        return ["draft_email", "create_calendar_event", "send_message"]
    if pack_id == WEEKLY_CONTENT_PACK_ID:
        return ["publish_content"]
    if pack_id == COMPETITOR_BRIEF_PACK_ID:
        return ["external_research"]
    if pack_id == SPREADSHEET_OPS_PACK_ID:
        operation = normalize_action_id(
            pack_inputs.get("operation")
            or pack_inputs.get("operation_type")
            or pack_inputs.get("leads")
            or "read"
        )
        if operation in {"append"}:
            return ["spreadsheet_append"]
        if operation in {"update", "edit"}:
            return ["spreadsheet_update"]
        if operation in {"create", "new"}:
            return ["spreadsheet_create"]
        return ["spreadsheet_read"]
    if pack_id == DOCUMENT_STUDIO_PACK_ID:
        operation = normalize_action_id(pack_inputs.get("operation") or pack_inputs.get("operation_type") or pack_inputs.get("leads") or "create")
        file_path = str(pack_inputs.get("file_path") or pack_inputs.get("path") or pack_inputs.get("inbox") or "").strip().lower()
        is_presentation = file_path.endswith(".pptx")
        if is_presentation:
            return ["presentation_update" if operation in {"update", "edit", "append"} else "presentation_create"]
        return ["document_update" if operation in {"update", "edit", "append"} else "document_create"]
    if pack_id == LOCAL_EXECUTION_PACK_ID:
        operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
        predicted: List[str] = []
        seen_tools: Set[str] = set()

        def _append_predicted(raw_tool: Any) -> None:
            clean = normalize_action_id(raw_tool)
            if clean and clean not in seen_tools:
                seen_tools.add(clean)
                predicted.append(clean)

        if operations:
            for item in operations:
                if not isinstance(item, dict):
                    continue
                _append_predicted(item.get("tool") or item.get("action"))
        else:
            inferred_tool = (
                pack_inputs.get("tool")
                or pack_inputs.get("action")
                or capability_tool_id(pack_inputs.get("capability"))
                or ("execute_shell_command" if str(pack_inputs.get("command") or "").strip() or isinstance(pack_inputs.get("argv"), list) else "")
                or ("browser_automation" if str(pack_inputs.get("url") or "").strip() else "")
                or ("capture_screenshot" if bool(pack_inputs.get("screenshot")) else "")
            )
            if not inferred_tool and str(pack_inputs.get("path") or pack_inputs.get("file_path") or "").strip():
                inferred_tool = "read_write_files"
            _append_predicted(inferred_tool)
        return predicted

    text_parts: List[str] = []
    user_goal = str(context.get("user_goal") or "").strip()
    business_plan = str(context.get("business_plan") or "").strip()
    if user_goal:
        text_parts.append(user_goal)
    if business_plan:
        text_parts.append(business_plan)
    inferred = infer_actions_from_text("\n".join(text_parts))
    ordered = [normalize_action_id(action) for action in inferred.keys()]
    unique: List[str] = []
    seen: Set[str] = set()
    for action in ordered:
        if action and action not in seen:
            seen.add(action)
            unique.append(action)
    return unique


def _predict_capability_ids_for_context(context: Dict[str, Any]) -> List[str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = normalize_action_id(metadata.get("outcome_pack"))
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}
    if pack_id != LOCAL_EXECUTION_PACK_ID:
        return []

    operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
    seen: Set[str] = set()
    capability_ids: List[str] = []

    def _append_capability(raw_capability: Any) -> None:
        clean = str(raw_capability or "").strip().lower()
        if clean and clean not in seen:
            seen.add(clean)
            capability_ids.append(clean)

    if operations:
        for item in operations:
            if not isinstance(item, dict):
                continue
            _append_capability(item.get("capability"))
    else:
        _append_capability(pack_inputs.get("capability"))
    return capability_ids


_BROWSER_AUTH_ACTIONS: Set[str] = {
    "type",
    "click",
    "select",
    "upload",
    "download",
    "open_popup",
    "open_tab",
    "switch_tab",
    "close_tab",
    "navigate",
}
_BROWSER_PRIVILEGED_ACTIONS: Set[str] = {
    "upload",
    "download",
    "open_popup",
    "open_tab",
    "close_tab",
}


def _derive_browser_automation_policy(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    if normalize_action_id(metadata.get("outcome_pack")) != normalize_action_id(LOCAL_EXECUTION_PACK_ID):
        return {}
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}
    operations = pack_inputs.get("operations") if isinstance(pack_inputs.get("operations"), list) else []
    browser_ops: List[Dict[str, Any]] = []
    if operations:
        for item in operations:
            if not isinstance(item, dict):
                continue
            if normalize_action_id(item.get("tool") or item.get("action")) == "browser_automation":
                browser_ops.append(item)
    elif str(pack_inputs.get("url") or "").strip():
        browser_ops.append(pack_inputs)
    if not browser_ops:
        return {}

    session_profiles: Set[str] = set()
    interactive_actions: Set[str] = set()
    privileged_actions: Set[str] = set()
    capture_page = False
    for operation in browser_ops:
        profile = str(operation.get("session_profile") or operation.get("sessionProfile") or "").strip()
        if profile:
            session_profiles.add(profile)
        if normalize_action_id(operation.get("mode") or "extract_text") == "capture_page":
            capture_page = True
        raw_actions = operation.get("browser_actions") if isinstance(operation.get("browser_actions"), list) else []
        for raw in raw_actions:
            if not isinstance(raw, dict):
                continue
            action = normalize_action_id(raw.get("action"))
            if not action:
                continue
            if action in _BROWSER_AUTH_ACTIONS:
                interactive_actions.add(action)
            if action in _BROWSER_PRIVILEGED_ACTIONS:
                privileged_actions.add(action)

    profile = "public_readonly"
    if session_profiles and privileged_actions:
        profile = "authenticated_privileged"
    elif session_profiles and interactive_actions:
        profile = "authenticated_interactive"
    elif session_profiles:
        profile = "authenticated_readonly"
    elif privileged_actions:
        profile = "public_privileged"
    elif interactive_actions:
        profile = "public_interactive"

    approval_reason = ""
    requires_approval = False
    if session_profiles and privileged_actions:
        requires_approval = True
        approval_reason = "session-backed privileged browser automation requires approval"
    elif session_profiles and interactive_actions:
        requires_approval = True
        approval_reason = "session-backed interactive browser automation requires approval"

    return {
        "profile": profile,
        "session_profiles": sorted(session_profiles),
        "session_profile_count": len(session_profiles),
        "interactive_actions": sorted(interactive_actions),
        "privileged_actions": sorted(privileged_actions),
        "capture_page": bool(capture_page),
        "requires_approval": requires_approval,
        "reason": approval_reason,
    }


def _compute_tool_policy_precheck(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
    target = normalize_execution_target(
        metadata.get("execution_target_selected") or metadata.get("execution_target")
    )
    tool_ids = _predict_tool_ids_for_context(context)
    skill_contract = _build_skill_contract_from_metadata(metadata, tool_ids, trust_mode, target)
    enforced_undeclared = set(skill_contract.get("undeclared_tools") or []) if skill_contract.get("policy_mode") == "enforce" else set()
    items: List[Dict[str, Any]] = []
    blocked: List[str] = []
    approval_required: List[str] = []
    allowed: List[str] = []

    browser_policy = _derive_browser_automation_policy(context)
    evaluation_metadata = dict(metadata)
    if browser_policy:
        evaluation_metadata["browser_automation_policy"] = browser_policy

    capability_ids = _predict_capability_ids_for_context(context)
    capability_details = [
        detail
        for detail in (
            capability_metadata(capability_id, Path(__file__).resolve().parent)
            for capability_id in capability_ids
        )
        if isinstance(detail, dict)
    ]
    capabilities_by_tool: Dict[str, List[str]] = {}
    for detail in capability_details:
        tool_for_capability = normalize_action_id(detail.get("tool_id"))
        capability_id = str(detail.get("id") or "").strip().lower()
        if not tool_for_capability or not capability_id:
            continue
        capabilities_by_tool.setdefault(tool_for_capability, []).append(capability_id)

    for tool_id in tool_ids:
        item = evaluate_tool_policy_decision(
            tool_id=tool_id,
            trust_mode=trust_mode,
            target=target,
            metadata=evaluation_metadata,
            capability_ids=capabilities_by_tool.get(normalize_action_id(tool_id), []),
        )
        if tool_id in enforced_undeclared:
            item = dict(item)
            item["decision"] = "blocked"
            item["reason"] = "skill_contract_missing_runtime_tool"
        elif skill_contract.get("declared_runtime_tools"):
            item = dict(item)
            item["skill_declared"] = tool_id in set(skill_contract.get("declared_runtime_tools") or [])
        items.append(item)
        decision = str(item.get("decision") or "").strip().lower()
        clean_tool = str(item.get("tool_id") or tool_id).strip().lower()
        if decision == "blocked":
            blocked.append(clean_tool)
        elif decision == "approval_required":
            approval_required.append(clean_tool)
        else:
            allowed.append(clean_tool)

    return {
        "trust_mode": trust_mode,
        "target": target,
        "tool_ids": tool_ids,
        "capability_ids": capability_ids,
        "capabilities": capability_details,
        "blocked": blocked,
        "approval_required": approval_required,
        "allowed": allowed,
        "blocked_count": len(blocked),
        "approval_required_count": len(approval_required),
        "allow_count": len(allowed),
        "items": items,
        "skill_contract": skill_contract,
        "browser_automation_policy": browser_policy or None,
    }


def _append_run_tool_policy_audit(
    run_id: Optional[str],
    evaluation: Dict[str, Any],
    source: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    if not run_id:
        return
    run = runs.get(str(run_id))
    if not isinstance(run, dict):
        return
    payload = {
        "ts": _utc_now_iso(),
        "source": str(source or "runtime").strip().lower(),
        "tool_id": str(evaluation.get("tool_id") or "").strip().lower(),
        "decision": str(evaluation.get("decision") or "").strip().lower(),
        "reason": str(evaluation.get("reason") or "").strip(),
        "trust_mode": str(evaluation.get("trust_mode") or "").strip().lower(),
        "target": str(evaluation.get("target") or "").strip().lower(),
        "is_sensitive": bool(evaluation.get("is_sensitive")),
        "is_critical": bool(evaluation.get("is_critical")),
        "metadata": _json_safe(metadata if isinstance(metadata, dict) else {}),
    }
    items = run.setdefault("tool_policy_audit", [])
    if isinstance(items, list):
        items.append(payload)
        if len(items) > 500:
            del items[:-500]
        run["tool_policy_audit"] = items


def _enqueue_local_companion_run(run_id: str, *, message: str = "Run queued for Local Companion execution.", event: str = "local_queued") -> None:
    run = runs.get(run_id)
    if not isinstance(run, dict):
        return
    set_run_status(run_id, "queued_local")
    run["updated_at"] = datetime.utcnow().isoformat() + "Z"
    with LOCAL_QUEUE_LOCK:
        if run_id not in LOCAL_PENDING_RUN_IDS:
            LOCAL_PENDING_RUN_IDS.append(run_id)
    emit_log(
        run["logs"],
        "info",
        message,
        event=event,
        data={"run_id": run_id, "lease_seconds": ORION_LOCAL_LEASE_SECONDS},
    )



def create_run(engine: str, context: Optional[dict] = None, *, defer_local_enqueue: bool = False) -> str:
    run_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    started_mono = time.monotonic()
    log_queue: queue.Queue = queue.Queue()
    run_context = context or {}
    if isinstance(run_context, dict):
        try:
            _inject_runtime_skill_defaults(run_context)
        except Exception:
            pass
    if engine == "orion" and isinstance(run_context, dict):
        metadata = run_context.get("metadata") if isinstance(run_context.get("metadata"), dict) else {}
        if isinstance(metadata, dict) and not isinstance(metadata.get("tool_policy_precheck"), dict):
            try:
                metadata["tool_policy_precheck"] = _compute_tool_policy_precheck(run_context)
                run_context["metadata"] = metadata
            except Exception:
                pass
    selected_target = selected_execution_target_from_context(run_context)
    runs[run_id] = {
        "status": "starting",
        "logs": log_queue,
        "input_queue": queue.Queue(),
        "thread_id": None,
        "engine": engine,
        "context": run_context,
        "created_at": now,
        "updated_at": now,
        "result": None,
        "result_data": None,
        "duration_ms": None,
        "_started_mono": started_mono,
        "_finished_mono": None,
        "_first_value_mono": None,
        "_hitl_wait_start_mono": None,
        "_hitl_wait_total_ms": 0.0,
        "_archived": False,
        "_event_seq": 0,
        "events": [],
        "tool_policy_audit": [],
        "memory_trace": {
            "enabled": ORION_MEMORY_ENABLED,
            "reads": [],
            "writes": [],
            "last_error": None,
            "updated_at": _utc_now_iso(),
        },
    }
    RUN_QUEUE_INDEX[id(log_queue)] = run_id
    metrics_inc("runs_started", 1)

    if selected_target == EXECUTION_TARGET_LOCAL_COMPANION:
        try:
            _hydrate_run_memory_context(run_id, runs[run_id])
        except Exception:
            pass
        if not defer_local_enqueue:
            _enqueue_local_companion_run(run_id)
        return run_id

    worker = threading.Thread(target=run_mission, args=(run_id,), daemon=True)
    worker.start()
    return run_id

def _compile_orion_dag(context: Dict[str, Any]) -> Dict[str, Any]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    outcome_pack = str(metadata.get("outcome_pack") or "").strip().lower()

    if outcome_pack in SUPPORTED_OUTCOME_PACKS:
        nodes = [
            {"id": "pack.prepare", "kind": "pack_prepare", "deps": []},
            {"id": "pack.approval", "kind": "pack_approval", "deps": ["pack.prepare"]},
            {"id": "pack.finalize", "kind": "pack_finalize", "deps": ["pack.approval"]},
        ]
        return {
            "id": f"orion-pack-{outcome_pack}-v1",
            "type": "outcome_pack",
            "outcome_pack": outcome_pack,
            "nodes": nodes,
        }

    nodes = [
        {"id": "runtime.resolve", "kind": "runtime_resolve", "deps": []},
        {"id": "plan.generate", "kind": "plan_generate", "deps": ["runtime.resolve"]},
        {"id": "plan.approval", "kind": "plan_approval", "deps": ["plan.generate"]},
        {"id": "result.generate", "kind": "result_generate", "deps": ["plan.approval"]},
        {"id": "usage.finalize", "kind": "usage_finalize", "deps": ["result.generate"]},
    ]
    return {
        "id": "orion-standard-v1",
        "type": "standard",
        "nodes": nodes,
    }


def _resolve_dag_order(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    node_map: Dict[str, Dict[str, Any]] = {}
    indegree: Dict[str, int] = {}
    adjacency: Dict[str, List[str]] = {}

    for raw_node in nodes:
        node_id = str(raw_node.get("id") or "").strip()
        if not node_id:
            raise RuntimeError("DAG node id is required.")
        if node_id in node_map:
            raise RuntimeError(f"Duplicate DAG node id '{node_id}'.")
        deps_raw = raw_node.get("deps")
        deps: List[str] = []
        if isinstance(deps_raw, list):
            for dep in deps_raw:
                dep_id = str(dep or "").strip()
                if dep_id:
                    deps.append(dep_id)
        node = dict(raw_node)
        node["deps"] = deps
        node_map[node_id] = node
        indegree[node_id] = 0

    for node_id, node in node_map.items():
        deps = node.get("deps", [])
        if not isinstance(deps, list):
            raise RuntimeError(f"DAG node '{node_id}' deps must be a list.")
        for dep_id in deps:
            if dep_id not in node_map:
                raise RuntimeError(f"DAG node '{node_id}' depends on unknown node '{dep_id}'.")
            adjacency.setdefault(dep_id, []).append(node_id)
            indegree[node_id] += 1

    ready = sorted([nid for nid, count in indegree.items() if count == 0])
    ordered_ids: List[str] = []
    while ready:
        current = ready.pop(0)
        ordered_ids.append(current)
        for nxt in sorted(adjacency.get(current, [])):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
        ready.sort()

    if len(ordered_ids) != len(node_map):
        raise RuntimeError("DAG contains a cycle or unresolved dependency.")
    return [node_map[nid] for nid in ordered_ids]


def _execute_orion_dag_node(
    run_id: str,
    context: Dict[str, Any],
    log_queue: queue.Queue,
    node: Dict[str, Any],
    state: Dict[str, Any],
):
    kind = str(node.get("kind") or "").strip()
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    user_goal = str(context.get("user_goal") or "Execute the requested business objective.")

    if kind == "pack_prepare":
        outcome_pack = str(state.get("outcome_pack") or "").strip().lower()
        if outcome_pack not in SUPPORTED_OUTCOME_PACKS:
            raise RuntimeError(f"Unsupported outcome pack '{outcome_pack}'.")
        emit_log(log_queue, "info", f"Outcome pack started: {outcome_pack}.", event="pack_start")
        for phase in PACK_PHASES.get(outcome_pack, []):
            emit_log(log_queue, "info", phase, event="pack_phase")
        tool_precheck = _compute_tool_policy_precheck(context)
        state["tool_policy_precheck"] = tool_precheck
        blocked_tools = list(tool_precheck.get("blocked") or [])
        for evaluation in tool_precheck.get("items") if isinstance(tool_precheck.get("items"), list) else []:
            if isinstance(evaluation, dict):
                _append_run_tool_policy_audit(
                    run_id,
                    evaluation,
                    source="dag_precheck",
                    metadata={"node": "pack_prepare", "pack_id": outcome_pack},
                )
        emit_log(
            log_queue,
            "info",
            (
                "Tool policy precheck: "
                f"allow={tool_precheck.get('allow_count', 0)} "
                f"approval={tool_precheck.get('approval_required_count', 0)} "
                f"blocked={tool_precheck.get('blocked_count', 0)}"
            ),
            event="tool_policy_precheck",
            data=tool_precheck,
        )
        if blocked_tools:
            raise RuntimeError(f"Tool policy blocked requested actions: {', '.join(blocked_tools)}.")

        raw_result = execute_outcome_pack(outcome_pack, context, run_id=run_id)
        result_data = normalize_pack_result(outcome_pack, raw_result)
        validate_pack_tool_contracts(outcome_pack, result_data, role="orion_operator")
        trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
        action_counts = infer_actions_from_pack_result(outcome_pack, result_data)
        action_policy = evaluate_action_policy(
            action_counts,
            trust_mode,
            metadata,
            metadata.get("execution_target_selected") or metadata.get("execution_target"),
        )
        state["action_policy"] = action_policy
        emit_log(
            log_queue,
            "info",
            summarize_action_policy_eval(action_policy),
            event="action_policy_evaluated",
            data={
                "phase": "pack_prepare",
                "target": action_policy.get("target"),
                "blocked_actions": action_policy.get("blocked_actions"),
                "approval_actions": action_policy.get("approval_actions"),
            },
        )
        blocked_actions = action_policy.get("blocked_actions") if isinstance(action_policy.get("blocked_actions"), list) else []
        if blocked_actions:
            raise RuntimeError(f"Action policy blocked requested actions: {', '.join(blocked_actions)}.")
        approval_required, approval_reason = pack_approval_policy(trust_mode, result_data, metadata)
        if bool(action_policy.get("requires_approval")):
            approval_required = True
            policy_reason = str(action_policy.get("approval_reason") or "").strip()
            if policy_reason:
                approval_reason = f"{approval_reason} {policy_reason}".strip()
        summary_text = str(result_data.get("summary") or "Outcome pack completed.")
        state["result_data"] = result_data
        state["trust_mode"] = trust_mode
        state["approval_required"] = approval_required
        state["approval_reason"] = approval_reason
        state["summary_text"] = summary_text
        return {"approval_required": approval_required, "trust_mode": trust_mode}

    if kind == "pack_approval":
        if not bool(state.get("approval_required")):
            emit_log(log_queue, "info", "Approval skipped by trust policy.", event="approval_skipped")
            return {"skipped": True}
        result_data = state.get("result_data") if isinstance(state.get("result_data"), dict) else {}
        outputs = result_data.get("outputs") if isinstance(result_data.get("outputs"), dict) else {}
        outbound_actions = parse_positive_int(outputs.get("outbound_actions"), 0)
        approval_reason = str(state.get("approval_reason") or "Approval required.")
        prompt = (
            f"Approval required. {approval_reason} "
            f"Planned outbound actions: {outbound_actions}. "
            "Reply with Proceed to continue or Hold to stop."
        )
        approved = wait_for_human_decision(run_id, prompt)
        if not approved:
            raise RuntimeError("Run stopped by human decision.")
        return {"approved": True}

    if kind == "pack_finalize":
        outcome_pack = str(state.get("outcome_pack") or "").strip().lower()
        result_data = state.get("result_data") if isinstance(state.get("result_data"), dict) else {}
        summary_text = str(state.get("summary_text") or "Outcome pack completed.")
        trust_mode = str(state.get("trust_mode") or normalize_trust_mode(metadata.get("trust_mode")))
        approval_required = bool(state.get("approval_required"))
        approval_reason = str(state.get("approval_reason") or "")
        execution_summary = build_pack_execution_summary(
            outcome_pack,
            result_data,
            trust_mode,
            approval_required,
            approval_reason,
        )
        action_policy = state.get("action_policy") if isinstance(state.get("action_policy"), dict) else {}
        execution_summary["action_policy"] = {
            "blocked_actions": action_policy.get("blocked_actions", []),
            "approval_actions": action_policy.get("approval_actions", []),
            "target": action_policy.get("target"),
        }
        result_data["execution_summary"] = execution_summary
        result_data["result_schema_version"] = 2
        result_data["trust_mode"] = trust_mode
        emit_log(log_queue, "info", summary_text, event="pack_summary", data=result_data)
        emit_log(
            log_queue,
            "info",
            (
                f"Execution summary: risk={execution_summary['risk_level']} "
                f"time_saved~{execution_summary['estimated_time_saved_minutes']}m "
                f"approval_required={execution_summary['approval_required']}"
            ),
            event="execution_summary",
            data=execution_summary,
        )
        usage = build_masked_usage(
            "orion",
            outcome_pack,
            f"{user_goal}\n{json.dumps(result_data.get('inputs', {}), ensure_ascii=True)}",
            summary_text,
        )
        emit_log(
            log_queue,
            "info",
            f"[Telemetry] provider={usage['provider']} model={usage['model']} "
            f"tokens~{usage['total_tokens_est']} cost={usage['cost_band']}",
            event="usage_masked",
            data=usage,
        )
        emit_log(log_queue, "info", "Empyralis run completed.", event="run_complete")
        state["final_result_text"] = summary_text
        state["final_result_data"] = result_data
        state["final_usage"] = usage
        return {"done": True}

    if kind == "runtime_resolve":
        workflow_id = context.get("workflow_id") or "n/a"
        business_plan = str(context.get("business_plan") or "")
        agent_summary = format_agent_summary(context.get("agents"))
        memory_context_block = _memory_prompt_context_block(context)
        provider, selected_model, candidates, _ = resolve_run_execution_context(context)
        plan_input = (
            f"Workflow ID: {workflow_id}\n"
            f"User Goal: {user_goal}\n\n"
            f"Business Plan:\n{business_plan or 'No business plan provided.'}\n\n"
            f"{memory_context_block}\n\n"
            f"Agent Setup:\n{agent_summary}\n\n"
            "Output only:\n"
            "1) Ordered plan\n"
            "2) External actions required\n"
            "3) Risks and assumptions\n"
        )
        state["provider"] = provider
        state["selected_model"] = str(selected_model)
        state["credential_candidates"] = candidates
        state["credentials"] = candidates[0].get("credentials") if candidates else {}
        state["plan_input"] = plan_input
        return {"provider": provider, "model": str(selected_model)}

    if kind == "plan_generate":
        plan_input = str(state.get("plan_input") or "")
        plan_prompt = ORION_PLANNER_SYSTEM_PROMPT
        plan_text = generate_with_candidate_failover(state, context, log_queue, plan_prompt, plan_input)
        emit_log(log_queue, "info", plan_text, event="orion_plan")
        state["plan_text"] = plan_text
        return {"chars": len(plan_text)}

    if kind == "plan_approval":
        plan_text = str(state.get("plan_text") or "")
        needs_approval, reason = requires_human_approval(context, plan_text)
        trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
        plan_actions = infer_actions_from_text(plan_text)
        action_policy = evaluate_action_policy(
            plan_actions,
            trust_mode,
            metadata,
            metadata.get("execution_target_selected") or metadata.get("execution_target"),
        )
        state["action_policy"] = action_policy
        emit_log(
            log_queue,
            "info",
            summarize_action_policy_eval(action_policy),
            event="action_policy_evaluated",
            data={
                "phase": "plan_approval",
                "target": action_policy.get("target"),
                "blocked_actions": action_policy.get("blocked_actions"),
                "approval_actions": action_policy.get("approval_actions"),
            },
        )
        blocked_actions = action_policy.get("blocked_actions") if isinstance(action_policy.get("blocked_actions"), list) else []
        if blocked_actions:
            raise RuntimeError(f"Action policy blocked requested actions: {', '.join(blocked_actions)}.")
        if bool(action_policy.get("requires_approval")):
            needs_approval = True
            policy_reason = str(action_policy.get("approval_reason") or "").strip()
            if policy_reason:
                reason = f"{reason} {policy_reason}".strip()
        if not needs_approval:
            emit_log(log_queue, "info", "Approval skipped by trust policy.", event="approval_skipped")
            return {"skipped": True}
        prompt = (
            f"Approval required before execution. {reason} "
            "Reply with Proceed to continue or Hold to stop."
        ).strip()
        approved = wait_for_human_decision(run_id, prompt)
        if not approved:
            raise RuntimeError("Run stopped by human decision.")
        return {"approved": True}

    if kind == "result_generate":
        plan_text = str(state.get("plan_text") or "")
        execute_input = (
            f"User Goal: {user_goal}\n\n"
            f"Execution Plan:\n{plan_text}\n\n"
            "Now return:\n"
            "1) What Empyralis did\n"
            "2) What Empyralis needs from user\n"
            "3) Next immediate steps\n"
            "Keep the response concise and operational."
        )
        execute_prompt = ORION_OPERATOR_SYSTEM_PROMPT
        result_text = generate_with_candidate_failover(state, context, log_queue, execute_prompt, execute_input)
        emit_log(log_queue, "info", result_text, event="orion_result")
        final_text = (
            "Execution Plan\n"
            f"{plan_text}\n\n"
            "Execution Result\n"
            f"{result_text}"
        )
        state["execute_input"] = execute_input
        state["result_text"] = result_text
        state["final_text"] = final_text
        return {"chars": len(final_text)}

    if kind == "usage_finalize":
        provider = str(state.get("provider") or "openai")
        selected_model = str(state.get("active_model") or state.get("selected_model") or CODEX_MODEL)
        plan_input = str(state.get("plan_input") or "")
        execute_input = str(state.get("execute_input") or "")
        final_text = str(state.get("final_text") or "")
        usage = build_masked_usage(
            provider,
            selected_model,
            f"{plan_input}\n\n{execute_input}",
            final_text,
        )
        emit_log(
            log_queue,
            "info",
            f"[Telemetry] provider={usage['provider']} model={usage['model']} "
            f"tokens~{usage['total_tokens_est']} cost={usage['cost_band']}",
            event="usage_masked",
            data=usage,
        )
        emit_log(log_queue, "info", "Empyralis run completed.", event="run_complete")
        state["final_result_text"] = final_text
        state["final_result_data"] = None
        state["final_usage"] = usage
        return {"done": True}

    raise RuntimeError(f"Unsupported DAG node kind '{kind}'.")


def _execute_orion_dag_once(run_id: str, context: Dict[str, Any], log_queue: queue.Queue, dag_spec: Dict[str, Any]) -> Dict[str, Any]:
    nodes_raw = dag_spec.get("nodes")
    if not isinstance(nodes_raw, list) or not nodes_raw:
        raise RuntimeError("Compiled DAG has no nodes.")

    ordered_nodes = _resolve_dag_order(nodes_raw)
    emit_log(
        log_queue,
        "info",
        f"DAG compiled: {dag_spec.get('id')} ({len(ordered_nodes)} nodes).",
        event="dag_compiled",
        data={
            "dag_id": dag_spec.get("id"),
            "dag_type": dag_spec.get("type"),
            "node_count": len(ordered_nodes),
            "nodes": [str(node.get("id") or "") for node in ordered_nodes],
        },
    )

    state: Dict[str, Any] = {
        "outcome_pack": dag_spec.get("outcome_pack"),
        "node_results": {},
    }
    completed: Set[str] = set()
    for node in ordered_nodes:
        node_id = str(node.get("id") or "").strip()
        deps = node.get("deps", [])
        if any(dep not in completed for dep in deps):
            missing = [dep for dep in deps if dep not in completed]
            raise RuntimeError(f"DAG node '{node_id}' has unresolved dependencies: {', '.join(missing)}")

        node_started = time.monotonic()
        emit_log(log_queue, "info", f"Node started: {node_id}", event="dag_node_start", data={"node_id": node_id})
        try:
            node_output = _execute_orion_dag_node(run_id, context, log_queue, node, state)
        except Exception as exc:
            emit_log(
                log_queue,
                "error",
                friendly_runtime_error_message(exc),
                event="dag_node_error",
                data={"node_id": node_id},
            )
            raise
        elapsed_ms = round((time.monotonic() - node_started) * 1000.0, 2)
        state["node_results"][node_id] = node_output
        completed.add(node_id)
        emit_log(
            log_queue,
            "info",
            f"Node completed: {node_id} ({elapsed_ms} ms)",
            event="dag_node_complete",
            data={"node_id": node_id, "duration_ms": elapsed_ms},
        )

    final_text = state.get("final_result_text")
    final_usage = state.get("final_usage")
    if not isinstance(final_text, str) or not isinstance(final_usage, dict):
        raise RuntimeError("DAG execution finished without final result payload.")
    final_data = state.get("final_result_data") if isinstance(state.get("final_result_data"), dict) else None
    return {
        "result_text": final_text,
        "result_data": final_data,
        "usage_masked": final_usage,
    }


def run_orion_mission(run_id: str):
    run = runs[run_id]
    run["thread_id"] = threading.get_ident()
    log_queue = run["logs"]
    context = run.get("context", {}) if isinstance(run.get("context"), dict) else {}

    set_run_status(run_id, "running")
    emit_log(log_queue, "info", "Empyralis run started.", event="run_start", data={"run_id": run_id})
    started_at = time.time()
    last_error: Optional[Exception] = None

    dag_spec = _compile_orion_dag(context)
    run["dag"] = {
        "id": dag_spec.get("id"),
        "type": dag_spec.get("type"),
        "nodes": [str(node.get("id") or "") for node in dag_spec.get("nodes", []) if isinstance(node, dict)],
    }

    for attempt in range(ORION_MAX_RETRIES + 1):
        try:
            if (time.time() - started_at) > ORION_RUN_TIMEOUT_SECONDS:
                raise RuntimeError(f"Empyralis run exceeded {ORION_RUN_TIMEOUT_SECONDS}s timeout.")

            result = _execute_orion_dag_once(run_id, context, log_queue, dag_spec)
            run["result"] = result["result_text"]
            run["result_data"] = result.get("result_data")
            run["usage_masked"] = result["usage_masked"]
            set_run_status(run_id, "completed")
            run["logs"].put(None)
            return
        except Exception as exc:
            last_error = exc
            raw_message = str(exc)
            message = friendly_runtime_error_message(exc)
            non_retryable = is_non_retryable_runtime_error(exc)

            if "timeout" in raw_message.lower() or "timeout" in message.lower():
                emit_log(log_queue, "error", message, event="timeout")
                set_run_status(run_id, "timeout")
                run["logs"].put(None)
                return

            if "stopped by human decision" in raw_message.lower() or "stopped by human decision" in message.lower():
                emit_log(log_queue, "warn", message, event="run_stopped")
                set_run_status(run_id, "failed")
                run["logs"].put(None)
                return

            if non_retryable:
                emit_log(
                    log_queue,
                    "error",
                    message,
                    event="run_error",
                    data={"attempt": attempt + 1, "retryable": False, "raw_error": raw_message},
                )
                set_run_status(run_id, "failed")
                run["logs"].put(None)
                return

            emit_log(
                log_queue,
                "warn",
                f"Empyralis run failed on attempt {attempt + 1}.",
                event="run_retry",
                data={"attempt": attempt + 1, "error": message, "raw_error": raw_message},
            )
            if attempt < ORION_MAX_RETRIES:
                backoff = ORION_RETRY_BACKOFF_SECONDS * (2 ** attempt)
                time.sleep(backoff)

    emit_log(log_queue, "error", friendly_runtime_error_message(last_error or Exception("Unknown runtime failure")), event="run_error")
    set_run_status(run_id, "failed")
    run["logs"].put(None)


def run_mission(run_id):
    run = runs.get(run_id)
    if not run:
        return
    engine_name = (run.get("engine") or "orion").lower()
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    selected_target = str(metadata.get("execution_target_selected") or "").strip().lower()
    requested_target = str(metadata.get("execution_target_requested") or "").strip().lower()
    route_reason = str(metadata.get("execution_target_reason") or "").strip()
    route_fallback = str(metadata.get("execution_target_fallback") or "").strip()

    if selected_target:
        route_msg = (
            f"Routing: requested={requested_target or 'auto'}, "
            f"selected={selected_target}. {route_reason}".strip()
        )
        emit_log(
            run["logs"],
            "info",
            route_msg,
            event="route_decision",
            data={
                "requested": requested_target or EXECUTION_TARGET_AUTO,
                "selected": selected_target,
                "reason": route_reason,
                "fallback": route_fallback or None,
            },
        )
        if route_fallback:
            emit_log(run["logs"], "warn", route_fallback, event="route_fallback")

    engine = ENGINE_REGISTRY.get(engine_name)
    if not engine:
        emit_log(run["logs"], "error", f"Unsupported engine: {engine_name}", event="run_error")
        set_run_status(run_id, "failed")
        run["logs"].put(None)
        return
    timeout_seconds = max(1, int(metadata.get("timeout_seconds") or ORION_RUN_TIMEOUT_SECONDS or 300))

    try:
        _hydrate_run_memory_context(run_id, run)
    except Exception as exc:
        trace = run.setdefault("memory_trace", {"enabled": ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None})
        trace["last_error"] = f"memory_read_failed:{exc}"
        trace["updated_at"] = _utc_now_iso()
        run["memory_trace"] = trace
        emit_log(run["logs"], "warn", "Memory context read failed; continuing without memory.", event="memory_context_error")

    _log_execution_boundary(run["logs"], run_id, "start", timeout_seconds=timeout_seconds)
    try:
        execution_result = _execute_engine_with_timeout(engine, run_id, timeout_seconds)
        if execution_result.get("timed_out"):
            emit_log(
                run["logs"],
                "error",
                f"Run exceeded {timeout_seconds}s timeout.",
                event="timeout",
                data={"run_id": run_id, "timeout_seconds": timeout_seconds},
            )
            set_run_status(run_id, "timeout")
            _log_execution_boundary(run["logs"], run_id, "end", status="timeout")
            run["logs"].put(None)
            return
        if execution_result.get("error") is not None:
            raise execution_result["error"]
        try:
            _persist_run_memory(run_id, run)
        except Exception as exc:
            trace = run.setdefault("memory_trace", {"enabled": ORION_MEMORY_ENABLED, "reads": [], "writes": [], "last_error": None, "updated_at": None})
            trace["last_error"] = f"memory_write_failed:{exc}"
            trace["updated_at"] = _utc_now_iso()
            run["memory_trace"] = trace
            emit_log(run["logs"], "warn", "Memory write failed after run completion.", event="memory_write_error")
        _log_execution_boundary(run["logs"], run_id, "end", status=str(run.get("status") or "completed"))
    except Exception as exc:
        emit_log(run["logs"], "error", friendly_runtime_error_message(exc), event="run_error")
        set_run_status(run_id, "failed")
        _log_execution_boundary(run["logs"], run_id, "end", status="failed")
        run["logs"].put(None)
